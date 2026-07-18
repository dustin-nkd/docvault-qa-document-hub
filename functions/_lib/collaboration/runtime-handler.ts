import { AuditReadError, createAuditCursorCodec, listAuditEvents } from '../audit/index';
import {
    enforceIdentityRateLimit,
    deriveIdentityKey,
    IdentityRateLimitError,
    identityResponseHeaders,
    hmacSign,
    PLATFORM_RANDOM,
    readSessionCookie,
    resolveIdentityRuntime,
    resolveSessionToken,
    verifyCsrfToken,
    type IdentityEnvironmentInput,
    type IdentityRuntimeConfiguration,
    type RandomBytesSource,
    type SessionLifecycleDependencies
} from '../identity/index';
import {
    acceptInvitation,
    bootstrapInvitation,
    createGitHubInvitationResolver,
    createInvitation,
    InvitationLifecycleError,
    InvitationProviderError,
    listPendingInvitations,
    normalizeGitHubLogin,
    revokeInvitation,
    type InvitationIdentityResolver
} from '../invitations/index';
import {
    changeMemberRole,
    listWorkspaceMembers,
    MembershipAdministrationError,
    removeMember,
    transferOwnership
} from '../memberships/index';
import { openAuthorizationSession, PersistenceError } from '../persistence/index';
import { authorizeWorkspaceAction } from '../rbac/index';
import { bootstrapWorkspace } from '../workspaces/index';
import { ControlPlaneCursorError, createControlPlaneCursorCodec } from './control-plane-cursor';

const PREVIEW_ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const COOKIE_NAME = '__Host-docvault-preview-session' as const;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_BODY_BYTES = 64 * 1_024;
const MAXIMUM_QUERY_BYTES = 4 * 1_024;
const REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const CSRF_HEADER = 'X-CSRF-Token';
const DEVICE_HEADER = 'X-DocVault-Device-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

type RouteId = 'workspace-create' | 'member-list' | 'member-change' | 'member-remove'
    | 'ownership-transfer' | 'invitation-list' | 'invitation-create' | 'invitation-revoke'
    | 'invitation-bootstrap' | 'invitation-accept' | 'audit-list';

interface Route {
    readonly id: RouteId;
    readonly pattern: RegExp;
    readonly methods: readonly string[];
    readonly mutation: boolean;
    readonly public: boolean;
}

const ROUTES: readonly Route[] = Object.freeze([
    { id: 'workspace-create', pattern: /^\/api\/v1\/workspaces$/, methods: ['POST'], mutation: true, public: false },
    { id: 'member-list', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/members$/, methods: ['GET'], mutation: false, public: false },
    { id: 'member-change', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/members\/([^/]+)$/, methods: ['PATCH'], mutation: true, public: false },
    { id: 'member-remove', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/members\/([^/]+)$/, methods: ['DELETE'], mutation: true, public: false },
    { id: 'ownership-transfer', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/ownership-transfers$/, methods: ['POST'], mutation: true, public: false },
    { id: 'invitation-list', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/invitations$/, methods: ['GET'], mutation: false, public: false },
    { id: 'invitation-create', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/invitations$/, methods: ['POST'], mutation: true, public: false },
    { id: 'invitation-revoke', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/invitations\/([^/]+)$/, methods: ['DELETE'], mutation: true, public: false },
    { id: 'invitation-bootstrap', pattern: /^\/api\/v1\/invitations\/bootstrap$/, methods: ['POST'], mutation: true, public: true },
    { id: 'invitation-accept', pattern: /^\/api\/v1\/invitations\/accept$/, methods: ['POST'], mutation: true, public: false },
    { id: 'audit-list', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/audit-events$/, methods: ['GET'], mutation: false, public: false }
]);

type ErrorCode = 'VALIDATION_FAILED' | 'INVALID_JSON' | 'INVALID_CURSOR' | 'CSRF_REJECTED'
    | 'UNAUTHENTICATED' | 'OPERATION_NOT_PERMITTED' | 'RECENT_AUTHENTICATION_REQUIRED'
    | 'RESOURCE_NOT_FOUND' | 'METHOD_NOT_ALLOWED' | 'NOT_ACCEPTABLE'
    | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED'
    | 'COLLABORATION_UNAVAILABLE';

const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
    VALIDATION_FAILED: 'The request does not satisfy the API contract.',
    INVALID_JSON: 'The request body must contain valid JSON.',
    INVALID_CURSOR: 'The pagination cursor is invalid or expired.',
    CSRF_REJECTED: 'Request origin or CSRF validation failed.',
    UNAUTHENTICATED: 'Authentication is required.',
    OPERATION_NOT_PERMITTED: 'The operation is not permitted.',
    RECENT_AUTHENTICATION_REQUIRED: 'Recent authentication is required.',
    RESOURCE_NOT_FOUND: 'The requested resource was not found.',
    METHOD_NOT_ALLOWED: 'The request method is not supported for this route.',
    NOT_ACCEPTABLE: 'The requested response media type is not supported.',
    UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json; charset=utf-8.',
    PAYLOAD_TOO_LARGE: 'The request payload exceeds the allowed size.',
    RATE_LIMITED: 'The request rate limit was exceeded.',
    COLLABORATION_UNAVAILABLE: 'Collaboration is currently unavailable.'
});

class PreviewApiError extends Error {
    constructor(readonly status: number, readonly code: ErrorCode,
        readonly extraHeaders: Readonly<Record<string, string>> = {}) {
        super(code);
        this.name = 'PreviewApiError';
    }
}

interface RuntimeBindings extends IdentityEnvironmentInput {
    readonly COLLAB_DB?: D1Database;
}

export interface PreviewApiDependencies extends SessionLifecycleDependencies {
    readonly identityResolver: InvitationIdentityResolver;
}

const PLATFORM_DEPENDENCIES: PreviewApiDependencies = Object.freeze({
    clock: Object.freeze({ now: () => Date.now() }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: PLATFORM_RANDOM,
    failures: Object.freeze({ checkpoint: async () => {} }),
    identityResolver: createGitHubInvitationResolver({})
});

function stringBinding(source: object, name: keyof RuntimeBindings): string | undefined {
    if (!(name in source)) return undefined;
    const value = Reflect.get(source, name);
    return typeof value === 'string' ? value : undefined;
}

function databaseBinding(source: object): D1Database | undefined {
    if (!('COLLAB_DB' in source)) return undefined;
    const value = Reflect.get(source, 'COLLAB_DB');
    return typeof value === 'object' && value !== null && 'prepare' in value
        && 'batch' in value && 'withSession' in value ? value as D1Database : undefined;
}

function bindings(source: object): RuntimeBindings {
    return Object.freeze({
        APP_ENV: stringBinding(source, 'APP_ENV'),
        IDENTITY_RUNTIME_MODE: stringBinding(source, 'IDENTITY_RUNTIME_MODE'),
        COLLABORATION_ENABLED: stringBinding(source, 'COLLABORATION_ENABLED'),
        GITHUB_OAUTH_CLIENT_ID: stringBinding(source, 'GITHUB_OAUTH_CLIENT_ID'),
        GITHUB_OAUTH_CLIENT_SECRET: stringBinding(source, 'GITHUB_OAUTH_CLIENT_SECRET'),
        OAUTH_TRANSACTION_KEY: stringBinding(source, 'OAUTH_TRANSACTION_KEY'),
        SESSION_TOKEN_PEPPER: stringBinding(source, 'SESSION_TOKEN_PEPPER'),
        CSRF_TOKEN_KEY: stringBinding(source, 'CSRF_TOKEN_KEY'),
        RATE_LIMIT_KEY: stringBinding(source, 'RATE_LIMIT_KEY'),
        COLLAB_DB: databaseBinding(source)
    });
}

function routeFor(pathname: string, method: string): { readonly route: Route; readonly params: readonly string[] } | null {
    const matches = ROUTES.flatMap(route => {
        const match = pathname.match(route.pattern);
        return match === null ? [] : [{ route, params: match.slice(1) }];
    });
    if (matches.length === 0) return null;
    const exact = matches.find(match => match.route.methods.includes(method));
    if (exact !== undefined) return exact;
    const first = matches[0];
    if (first === undefined) return null;
    return {
        route: { ...first.route, methods: [...new Set(matches.flatMap(match => match.route.methods))] },
        params: first.params
    };
}

function acceptsJson(value: string | null): boolean {
    if (value === null) return true;
    return value.split(',').some(item => {
        const [range, ...parameters] = item.trim().toLowerCase().split(';').map(part => part.trim());
        const quality = parameters.find(parameter => parameter.startsWith('q='));
        if (quality && Number(quality.slice(2)) === 0) return false;
        return range === '*/*' || range === 'application/*' || range === 'application/json';
    });
}

function jsonContentType(value: string | null): boolean {
    if (value === null) return false;
    const parts = value.toLowerCase().split(';').map(part => part.trim()).filter(Boolean);
    return parts.length === 2 && parts[0] === 'application/json'
        && /^charset=(?:"?utf-8"?)$/.test(parts[1]);
}

function queryBytes(url: URL): number {
    return new TextEncoder().encode(url.search.startsWith('?') ? url.search.slice(1) : url.search).byteLength;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
    return Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

async function readBody(request: Request): Promise<{ readonly value: Record<string, unknown>; readonly raw: Uint8Array }> {
    const declared = request.headers.get('Content-Length');
    if (declared !== null && (!/^\d{1,6}$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) {
        throw new PreviewApiError(413, 'PAYLOAD_TOO_LARGE');
    }
    if (request.body === null) throw new PreviewApiError(400, 'INVALID_JSON');
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > MAXIMUM_BODY_BYTES) {
                await reader.cancel();
                throw new PreviewApiError(413, 'PAYLOAD_TOO_LARGE');
            }
            chunks.push(next.value);
        }
    } finally { reader.releaseLock(); }
    const raw = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)); }
    catch { throw new PreviewApiError(400, 'INVALID_JSON'); }
    if (!isRecord(value)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
    return { value, raw };
}

function responseHeaders(requestId: string): Headers {
    return identityResponseHeaders(`req_${requestId}`);
}

function success(requestId: string, status: number, data: object,
    page?: { readonly limit: number; readonly nextCursor: string | null }, setCookie?: string | null): Response {
    const headers = responseHeaders(requestId);
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return new Response(JSON.stringify({ data, meta: {
        requestId: `req_${requestId}`, apiVersion: 'v1', ...(page === undefined ? {} : { page })
    } }), { status, headers });
}

function empty(requestId: string, setCookie?: string | null): Response {
    const headers = responseHeaders(requestId);
    headers.delete('Content-Type');
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return new Response(null, { status: 204, headers });
}

function failure(requestId: string, error: PreviewApiError): Response {
    const headers = responseHeaders(requestId);
    for (const [name, value] of Object.entries(error.extraHeaders)) headers.set(name, value);
    return new Response(JSON.stringify({ error: { code: error.code, message: ERROR_MESSAGES[error.code] },
        meta: { requestId: `req_${requestId}`, apiVersion: 'v1' } }), { status: error.status, headers });
}

function validUuid(value: unknown): value is string {
    return typeof value === 'string' && UUID_V4.test(value);
}

function requireUuid(value: unknown): string {
    if (!validUuid(value)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
    return value;
}

function integer(value: string | null, fallback: number, minimum: number, maximum: number): number {
    if (value === null) return fallback;
    if (!/^[1-9][0-9]{0,2}$/.test(value)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
    const parsed = Number(value);
    if (parsed < minimum || parsed > maximum) throw new PreviewApiError(400, 'VALIDATION_FAILED');
    return parsed;
}

function assertQueryKeys(query: URLSearchParams, allowed: readonly string[]): void {
    const seen = new Set<string>();
    for (const key of query.keys()) {
        if (!allowed.includes(key) || seen.has(key)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        seen.add(key);
    }
}

function idempotency(request: Request): string {
    return requireUuid(request.headers.get(IDEMPOTENCY_HEADER));
}

function device(request: Request, required: boolean): string | null {
    const value = request.headers.get(DEVICE_HEADER);
    if (value === null && !required) return null;
    return requireUuid(value);
}

async function fingerprint(request: Request, clientMutationId: string, raw: Uint8Array): Promise<ArrayBuffer> {
    const prefix = new TextEncoder().encode(`${request.method}\n${new URL(request.url).pathname}\n${clientMutationId}\n`);
    const bytes = new Uint8Array(prefix.byteLength + raw.byteLength);
    bytes.set(prefix); bytes.set(raw, prefix.byteLength);
    return crypto.subtle.digest('SHA-256', bytes);
}

function requestId(dependencies: PreviewApiDependencies): string {
    const value = dependencies.ids.uuid();
    if (!UUID_V4.test(value)) throw new PreviewApiError(503, 'COLLABORATION_UNAVAILABLE');
    return value;
}

async function stableWorkspaceId(cursorKey: Uint8Array, actorUserId: string,
    actorDeviceId: string, clientMutationId: string): Promise<string> {
    const material = new TextEncoder().encode(`workspace.create\n${actorUserId}\n${actorDeviceId}\n${clientMutationId}`);
    const bytes = (await hmacSign(cursorKey, material)).slice(0, 16);
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function serverTime(dependencies: PreviewApiDependencies): number {
    const value = dependencies.clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - REPLAY_RETENTION_MS) {
        throw new PreviewApiError(503, 'COLLABORATION_UNAVAILABLE');
    }
    return value;
}

async function cursorSigningKey(runtime: IdentityRuntimeConfiguration & { readonly enabled: true }): Promise<Uint8Array> {
    const keyring = runtime.secrets.csrfTokenKey;
    const activeKey = keyring.keys.get(keyring.activeKeyId);
    if (activeKey === undefined) throw new PreviewApiError(503, 'COLLABORATION_UNAVAILABLE');
    return deriveIdentityKey(activeKey, 'docvault:collaboration-control-plane-cursor:v1');
}

function sourceDiscriminator(request: Request): string {
    const value = request.headers.get('CF-Connecting-IP');
    if (value === null || value.length < 3 || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) {
        throw new IdentityRateLimitError(60);
    }
    return value;
}

async function authenticate(database: D1Database, request: Request,
    runtime: IdentityRuntimeConfiguration & { readonly enabled: true },
    route: Route, dependencies: PreviewApiDependencies) {
    const rawToken = readSessionCookie(request.headers.get('Cookie'), COOKIE_NAME);
    if (rawToken === null) {
        if (route.public) return { session: null, setCookie: null };
        throw new PreviewApiError(401, 'UNAUTHENTICATED');
    }
    const session = await resolveSessionToken(database, {
        cookieName: COOKIE_NAME, sessionTokenPepper: runtime.secrets.sessionTokenPepper,
        token: rawToken, coalesceActivity: !route.mutation
    }, dependencies);
    if (!session.authenticated) {
        if (route.public) return { session: null, setCookie: null };
        throw new PreviewApiError(401, 'UNAUTHENTICATED');
    }
    if (route.mutation && !route.public) {
        const supplied = request.headers.get(CSRF_HEADER);
        if (supplied === null || !await verifyCsrfToken(runtime.secrets.csrfTokenKey, rawToken, supplied)) {
            throw new PreviewApiError(403, 'CSRF_REJECTED');
        }
    }
    return { session, setCookie: session.setCookie };
}

async function assertCursorAuthority(database: D1Database, actorUserId: string,
    actingDeviceId: string | null, workspaceId: string, action: 'member.list' | 'invitation.list'): Promise<void> {
    const decision = await authorizeWorkspaceAction(database, {
        actorUserId, actingDeviceId, workspaceId, action
    });
    if (!decision.allowed) throw new PreviewApiError(decision.code === 'RESOURCE_NOT_FOUND'
        ? 404 : 403, decision.code === 'RESOURCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : 'OPERATION_NOT_PERMITTED');
}

function mapDomainError(error: unknown): PreviewApiError {
    if (error instanceof PreviewApiError) return error;
    if (error instanceof IdentityRateLimitError) {
        return new PreviewApiError(429, 'RATE_LIMITED', { 'Retry-After': String(error.retryAfterSeconds) });
    }
    if (error instanceof ControlPlaneCursorError
        || error instanceof AuditReadError && error.code === 'AUDIT_CURSOR_INVALID') {
        return new PreviewApiError(400, 'INVALID_CURSOR');
    }
    if (error instanceof AuditReadError) {
        if (error.code === 'AUDIT_INPUT_INVALID') return new PreviewApiError(400, 'VALIDATION_FAILED');
        if (error.code === 'AUDIT_OPERATION_NOT_PERMITTED') return new PreviewApiError(403, 'OPERATION_NOT_PERMITTED');
        return new PreviewApiError(404, 'RESOURCE_NOT_FOUND');
    }
    if (error instanceof MembershipAdministrationError) {
        if (error.code === 'MEMBERSHIP_INPUT_INVALID') return new PreviewApiError(400, 'VALIDATION_FAILED');
        if (error.code === 'RECENT_AUTHENTICATION_REQUIRED') return new PreviewApiError(403, 'RECENT_AUTHENTICATION_REQUIRED');
        if (error.code === 'MEMBERSHIP_OPERATION_NOT_PERMITTED') return new PreviewApiError(403, 'OPERATION_NOT_PERMITTED');
        return new PreviewApiError(404, 'RESOURCE_NOT_FOUND');
    }
    if (error instanceof InvitationProviderError) {
        return new PreviewApiError(error.code === 'INVITATION_TARGET_UNAVAILABLE' ? 400 : 503,
            error.code === 'INVITATION_TARGET_UNAVAILABLE' ? 'VALIDATION_FAILED' : 'COLLABORATION_UNAVAILABLE');
    }
    if (error instanceof InvitationLifecycleError) {
        if (error.code === 'INVITATION_INPUT_INVALID') return new PreviewApiError(400, 'VALIDATION_FAILED');
        if (error.code === 'INVITATION_OPERATION_NOT_PERMITTED') return new PreviewApiError(403, 'OPERATION_NOT_PERMITTED');
        return new PreviewApiError(404, 'RESOURCE_NOT_FOUND');
    }
    if (error instanceof PersistenceError) {
        return new PreviewApiError(error.code === 'PERSISTENCE_NOT_FOUND' ? 404 : 503,
            error.code === 'PERSISTENCE_NOT_FOUND' ? 'RESOURCE_NOT_FOUND' : 'COLLABORATION_UNAVAILABLE');
    }
    return new PreviewApiError(503, 'COLLABORATION_UNAVAILABLE');
}

async function dispatch(database: D1Database, request: Request, matched: { route: Route; params: readonly string[] },
    runtime: IdentityRuntimeConfiguration & { readonly enabled: true }, cursorKey: Uint8Array,
    dependencies: PreviewApiDependencies, persistentRequestId: string) {
    const now = serverTime(dependencies);
    const authorization = await authenticate(database, request, runtime, matched.route, dependencies);
    const actor = authorization.session;
    await enforceIdentityRateLimit({ database: database.withSession('first-primary'),
        keyring: runtime.secrets.rateLimitKey, tier: actor === null ? 'identity_source' : 'identity_user',
        discriminator: actor === null ? sourceDiscriminator(request) : actor.userId, serverTime: now });
    const url = new URL(request.url);
    const query = url.searchParams;
    const controlCursor = createControlPlaneCursorCodec(cursorKey);
    const auditCursor = createAuditCursorCodec(cursorKey, 'preview');
    const optionalActorUserId = actor?.userId;
    const actingDeviceId = device(request, ['workspace-create', 'member-change', 'member-remove',
        'ownership-transfer', 'invitation-list', 'invitation-create', 'invitation-revoke',
        'invitation-accept'].includes(matched.route.id));

    if (matched.route.id === 'invitation-bootstrap') {
        if (url.search !== '') throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const body = await readBody(request);
        if (!exactKeys(body.value, ['token']) || typeof body.value.token !== 'string') {
            throw new PreviewApiError(400, 'VALIDATION_FAILED');
        }
        const result = await bootstrapInvitation(database, {
            token: body.value.token, serverTime: now,
            ...(optionalActorUserId === undefined ? {} : { actorUserId: optionalActorUserId })
        });
        return success(persistentRequestId, 200, result, undefined, authorization.setCookie);
    }
    if (actor === null) throw new PreviewApiError(401, 'UNAUTHENTICATED');
    const actorUserId = actor.userId;

    if (matched.route.id === 'workspace-create') {
        if (url.search !== '') throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const body = await readBody(request);
        if (!exactKeys(body.value, ['displayName']) || typeof body.value.displayName !== 'string'
            || body.value.displayName.trim() !== body.value.displayName || body.value.displayName.length < 1
            || body.value.displayName.length > 120 || /[\u0000-\u001f\u007f]/.test(body.value.displayName)
            || actingDeviceId === null) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const clientMutationId = idempotency(request);
        const workspaceId = await stableWorkspaceId(cursorKey, actorUserId, actingDeviceId, clientMutationId);
        await bootstrapWorkspace(database, { actorUserId, actorDeviceId: actingDeviceId, workspaceId,
            displayName: body.value.displayName, descriptionEnvelope: null,
            transitionGuardId: requestId(dependencies), clientMutationId,
            requestFingerprint: await fingerprint(request, clientMutationId, body.raw),
            auditEventId: requestId(dependencies), requestId: persistentRequestId,
            serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS });
        return success(persistentRequestId, 201, { workspaceId, displayName: body.value.displayName,
            lifecycleState: 'active', currentKeyVersion: 1,
            callerMembership: { userId: actorUserId, role: 'owner', state: 'active', keyReadiness: 'pending_key' } },
        undefined, authorization.setCookie);
    }

    if (matched.route.id === 'invitation-accept') {
        if (url.search !== '' || actingDeviceId === null) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const body = await readBody(request);
        if (!exactKeys(body.value, ['token']) || typeof body.value.token !== 'string') {
            throw new PreviewApiError(400, 'VALIDATION_FAILED');
        }
        const clientMutationId = idempotency(request);
        const result = await acceptInvitation(database, { token: body.value.token,
            actorUserId, actorDeviceId: actingDeviceId,
            transitionGuardId: requestId(dependencies), clientMutationId,
            requestFingerprint: await fingerprint(request, clientMutationId, body.raw),
            auditEventId: requestId(dependencies), requestId: persistentRequestId,
            serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS });
        return success(persistentRequestId, 201, result, undefined, authorization.setCookie);
    }

    const workspaceId = requireUuid(matched.params[0]);
    if (matched.route.id === 'member-list') {
        assertQueryKeys(query, ['limit', 'cursor']);
        const limit = integer(query.get('limit'), 50, 1, 100);
        let afterUserId: string | undefined;
        const token = query.get('cursor');
        if (token !== null) {
            await assertCursorAuthority(database, actorUserId, actingDeviceId, workspaceId, 'member.list');
            const position = await controlCursor.verify('members', workspaceId, token, now);
            afterUserId = requireUuid(position.userId);
        }
        const result = await listWorkspaceMembers(database, { actorUserId, actingDeviceId,
            workspaceId, limit, ...(afterUserId === undefined ? {} : { afterUserId }) });
        const nextCursor = result.nextCursor === null ? null
            : await controlCursor.issue('members', workspaceId, result.nextCursor, now);
        return success(persistentRequestId, 200, { items: result.items }, { limit, nextCursor }, authorization.setCookie);
    }

    if (matched.route.id === 'invitation-list') {
        assertQueryKeys(query, ['limit', 'cursor']);
        const limit = integer(query.get('limit'), 25, 1, 50);
        let position: Readonly<Record<string, string | number>> | null = null;
        const token = query.get('cursor');
        if (token !== null) {
            await assertCursorAuthority(database, actorUserId, actingDeviceId, workspaceId, 'invitation.list');
            position = await controlCursor.verify('invitations', workspaceId, token, now);
        }
        const result = await listPendingInvitations(database, { actorUserId,
            actingDeviceId: requireUuid(actingDeviceId), workspaceId, serverTime: now, limit,
            ...(position === null ? {} : { afterExpiresAt: Number(position.expiresAt),
                afterInvitationId: requireUuid(position.invitationId) }) });
        const nextCursor = result.nextCursor === null ? null
            : await controlCursor.issue('invitations', workspaceId, result.nextCursor, now);
        return success(persistentRequestId, 200, { items: result.items.map(item => ({ ...item,
            createdAt: new Date(item.createdAt).toISOString(), expiresAt: new Date(item.expiresAt).toISOString()
        })) }, { limit, nextCursor }, authorization.setCookie);
    }

    if (matched.route.id === 'audit-list') {
        assertQueryKeys(query, ['limit', 'cursor', 'eventType', 'occurredFrom', 'occurredTo']);
        const limit = integer(query.get('limit'), 50, 1, 100);
        const result = await listAuditEvents(database, { actorUserId, actingDeviceId, workspaceId,
            serverTime: now, limit,
            ...(query.get('cursor') === null ? {} : { cursor: query.get('cursor') ?? undefined }),
            ...(query.get('eventType') === null ? {} : { eventType: query.get('eventType') ?? undefined }),
            ...(query.get('occurredFrom') === null ? {} : { occurredFrom: query.get('occurredFrom') ?? undefined }),
            ...(query.get('occurredTo') === null ? {} : { occurredTo: query.get('occurredTo') ?? undefined })
        }, auditCursor);
        return success(persistentRequestId, 200, { items: result.items },
            { limit, nextCursor: result.nextCursor }, authorization.setCookie);
    }

    if (url.search !== '') throw new PreviewApiError(400, 'VALIDATION_FAILED');
    const body = await readBody(request);
    const clientMutationId = idempotency(request);
    const common = { actorUserId, actorDeviceId: requireUuid(actingDeviceId), workspaceId,
        mutationResultId: requestId(dependencies), clientMutationId,
        requestFingerprint: await fingerprint(request, clientMutationId, body.raw),
        auditEventId: requestId(dependencies), requestId: persistentRequestId,
        serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS };

    if (matched.route.id === 'member-change') {
        const targetUserId = requireUuid(matched.params[1]);
        if (!exactKeys(body.value, ['role', 'expectedRoleVersion'])
            || !['admin', 'editor', 'viewer'].includes(String(body.value.role))
            || !Number.isInteger(body.value.expectedRoleVersion)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const result = await changeMemberRole(database, { ...common, targetUserId,
            expectedRoleVersion: Number(body.value.expectedRoleVersion),
            role: body.value.role as 'admin' | 'editor' | 'viewer' });
        return success(persistentRequestId, 200, result, undefined, authorization.setCookie);
    }
    if (matched.route.id === 'member-remove') {
        const targetUserId = requireUuid(matched.params[1]);
        if (!exactKeys(body.value, ['expectedRoleVersion']) || !Number.isInteger(body.value.expectedRoleVersion)) {
            throw new PreviewApiError(400, 'VALIDATION_FAILED');
        }
        await removeMember(database, { ...common, targetUserId,
            expectedRoleVersion: Number(body.value.expectedRoleVersion) });
        return empty(persistentRequestId, authorization.setCookie);
    }
    if (matched.route.id === 'ownership-transfer') {
        if (!exactKeys(body.value, ['targetUserId', 'expectedRoleVersion', 'confirmation'])
            || body.value.confirmation !== 'TRANSFER_OWNERSHIP'
            || !Number.isInteger(body.value.expectedRoleVersion)) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        const result = await transferOwnership(database, { ...common,
            targetUserId: requireUuid(body.value.targetUserId),
            expectedRoleVersion: Number(body.value.expectedRoleVersion),
            confirmation: 'TRANSFER_OWNERSHIP', authenticatedAt: actor.authenticatedAt });
        return success(persistentRequestId, 200, result, undefined, authorization.setCookie);
    }
    if (matched.route.id === 'invitation-create') {
        if (!exactKeys(body.value, ['githubUsername', 'role'])
            || typeof body.value.githubUsername !== 'string'
            || !['admin', 'editor', 'viewer'].includes(String(body.value.role))) {
            throw new PreviewApiError(400, 'VALIDATION_FAILED');
        }
        const invitationId = requestId(dependencies);
        const result = await createInvitation(database, { ...common, invitationId,
            targetLogin: body.value.githubUsername,
            offeredRole: body.value.role as 'admin' | 'editor' | 'viewer' }, {
            identityResolver: dependencies.identityResolver, random: dependencies.random
        });
        const targetDisplayLogin = normalizeGitHubLogin(body.value.githubUsername);
        return success(persistentRequestId, 201, { invitation: { invitationId,
            workspaceId, role: body.value.role, targetDisplayLogin, state: result.state,
            expiresAt: new Date(result.expiresAt).toISOString() },
            ...(result.token === null ? {} : { acceptanceUrl: `${PREVIEW_ORIGIN}/#/invite/${result.token}` }) },
        undefined, authorization.setCookie);
    }
    if (matched.route.id === 'invitation-revoke') {
        if (!exactKeys(body.value, [])) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        await revokeInvitation(database, { ...common, invitationId: requireUuid(matched.params[1]) });
        return empty(persistentRequestId, authorization.setCookie);
    }
    throw new PreviewApiError(404, 'RESOURCE_NOT_FOUND');
}

export async function handlePreviewCollaborationApi(request: Request, source: object,
    dependencies: PreviewApiDependencies = PLATFORM_DEPENDENCIES): Promise<Response | null> {
    const url = new URL(request.url);
    const matched = routeFor(url.pathname, request.method);
    if (matched === null) return null;
    const env = bindings(source);
    const database = env.COLLAB_DB;
    const runtime = resolveIdentityRuntime(env, {
        requestOrigin: url.origin, hasCollaborationDatabase: database !== undefined
    });
    if (!runtime.enabled || runtime.mode !== 'preview-only' || url.origin !== PREVIEW_ORIGIN
        || database === undefined) return null;
    let persistentRequestId: string;
    try { persistentRequestId = requestId(dependencies); }
    catch { persistentRequestId = crypto.randomUUID(); }
    try {
        if (!matched.route.methods.includes(request.method)) {
            throw new PreviewApiError(405, 'METHOD_NOT_ALLOWED', { Allow: matched.route.methods.join(', ') });
        }
        if (!acceptsJson(request.headers.get('Accept'))) throw new PreviewApiError(406, 'NOT_ACCEPTABLE');
        if (queryBytes(url) > MAXIMUM_QUERY_BYTES) throw new PreviewApiError(400, 'VALIDATION_FAILED');
        if (matched.route.mutation) {
            if (request.headers.get('Origin') !== PREVIEW_ORIGIN) throw new PreviewApiError(403, 'CSRF_REJECTED');
            if (!jsonContentType(request.headers.get('Content-Type'))) {
                throw new PreviewApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
            }
        } else {
            const origin = request.headers.get('Origin');
            if (origin !== null && origin !== PREVIEW_ORIGIN) throw new PreviewApiError(403, 'CSRF_REJECTED');
        }
        const cursorKey = await cursorSigningKey(runtime);
        return await dispatch(database, request, matched, runtime, cursorKey, dependencies, persistentRequestId);
    } catch (error) {
        return failure(persistentRequestId, mapDomainError(error));
    }
}

export const PREVIEW_COLLABORATION_API = Object.freeze({
    origin: PREVIEW_ORIGIN,
    routes: ROUTES.map(route => `${route.methods.join('|')} ${route.pattern.source}`),
    maximumBodyBytes: MAXIMUM_BODY_BYTES,
    deviceHeader: DEVICE_HEADER,
    idempotencyHeader: IDEMPOTENCY_HEADER,
    csrfHeader: CSRF_HEADER
});
