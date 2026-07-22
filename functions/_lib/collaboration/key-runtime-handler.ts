import { decodeBase64Url } from '../e2ee/canonical';
import { E2eePrimitiveError } from '../e2ee/errors';
import { parsePublicJwk } from '../e2ee/jwk';
import { E2EE } from '../e2ee/primitives';
import { parseWorkspaceKeyEnvelope } from '../e2ee/workspace-envelope-parser';
import { inventoryDevices, registerDevice, revokeDevice } from '../devices/index';
import {
    deriveIdentityKey,
    enforceIdentityRateLimit,
    hmacSign,
    IdentityRateLimitError,
    identityResponseHeaders,
    readSessionCookie,
    resolveIdentityRuntime,
    resolveSessionToken,
    verifyCsrfToken,
    type IdentityEnvironmentInput,
    type IdentityRuntimeConfiguration,
    type SessionLifecycleDependencies
} from '../identity/index';
import { PersistenceError } from '../persistence/index';
import {
    abortWorkspaceKeyRotation,
    bootstrapWorkspaceKey,
    commitWorkspaceKeyRotation,
    createWorkspaceBootstrapIntent,
    listWorkspaceProvisioningDevices,
    provisionWorkspaceEnvelope,
    readCurrentWorkspaceEnvelope,
    readRotationCommitBinding,
    readWorkspaceKeyRotation,
    stageWorkspaceRotationEnvelope,
    startWorkspaceKeyRotation
} from '../workspace-keys/index';
import { ControlPlaneCursorError, createControlPlaneCursorCodec } from './control-plane-cursor';

const PREVIEW_ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const COOKIE_NAME = '__Host-docvault-preview-session';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_BODY_BYTES = 64 * 1_024;
const MAXIMUM_QUERY_BYTES = 4 * 1_024;
const REPLAY_RETENTION_MS = 24 * 60 * 60 * 1_000;
const CSRF_HEADER = 'X-CSRF-Token';
const DEVICE_HEADER = 'X-DocVault-Device-ID';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const ROTATION_REASONS = Object.freeze([
    'member_removed', 'device_compromised', 'owner_security_event', 'key_exposure_suspected'
] as const);

type RouteId = 'device-list' | 'device-register' | 'device-revoke' | 'workspace-bootstrap-intent'
    | 'workspace-create-keyed' | 'workspace-device-list' | 'key-envelope-current'
    | 'key-envelope-provision' | 'rotation-start' | 'rotation-stage' | 'rotation-commit'
    | 'rotation-abort' | 'rotation-read';

interface Route {
    readonly id: RouteId;
    readonly pattern: RegExp;
    readonly methods: readonly string[];
    readonly mutation: boolean;
    readonly requiresDevice: boolean;
}

const ROUTES: readonly Route[] = Object.freeze([
    { id: 'device-list', pattern: /^\/api\/v1\/devices$/, methods: ['GET'], mutation: false, requiresDevice: false },
    { id: 'device-register', pattern: /^\/api\/v1\/devices$/, methods: ['POST'], mutation: true, requiresDevice: false },
    { id: 'device-revoke', pattern: /^\/api\/v1\/devices\/([^/]+)$/, methods: ['DELETE'], mutation: true, requiresDevice: false },
    { id: 'workspace-bootstrap-intent', pattern: /^\/api\/v1\/workspaces\/bootstrap-intents$/, methods: ['POST'], mutation: true, requiresDevice: true },
    { id: 'workspace-create-keyed', pattern: /^\/api\/v1\/workspaces$/, methods: ['POST'], mutation: true, requiresDevice: true },
    { id: 'workspace-device-list', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/devices$/, methods: ['GET'], mutation: false, requiresDevice: true },
    { id: 'key-envelope-current', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-envelopes\/current$/, methods: ['GET'], mutation: false, requiresDevice: true },
    { id: 'key-envelope-provision', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-envelopes\/([^/]+)$/, methods: ['PUT'], mutation: true, requiresDevice: true },
    { id: 'rotation-start', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-rotations$/, methods: ['POST'], mutation: true, requiresDevice: true },
    { id: 'rotation-stage', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-rotations\/([^/]+)\/envelopes\/([^/]+)$/, methods: ['PUT'], mutation: true, requiresDevice: true },
    { id: 'rotation-commit', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-rotations\/([^/]+)\/commit$/, methods: ['POST'], mutation: true, requiresDevice: true },
    { id: 'rotation-abort', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-rotations\/([^/]+)$/, methods: ['DELETE'], mutation: true, requiresDevice: true },
    { id: 'rotation-read', pattern: /^\/api\/v1\/workspaces\/([^/]+)\/key-rotations\/([^/]+)$/, methods: ['GET'], mutation: false, requiresDevice: true }
]);

type ErrorCode = 'VALIDATION_FAILED' | 'INVALID_JSON' | 'INVALID_CURSOR' | 'CSRF_REJECTED'
    | 'UNAUTHENTICATED' | 'OPERATION_NOT_PERMITTED' | 'RESOURCE_NOT_FOUND' | 'METHOD_NOT_ALLOWED'
    | 'NOT_ACCEPTABLE' | 'UNSUPPORTED_MEDIA_TYPE' | 'PAYLOAD_TOO_LARGE' | 'RATE_LIMITED'
    | 'COLLABORATION_UNAVAILABLE';

const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = Object.freeze({
    VALIDATION_FAILED: 'The request does not satisfy the API contract.',
    INVALID_JSON: 'The request body must contain valid JSON.',
    INVALID_CURSOR: 'The pagination cursor is invalid or expired.',
    CSRF_REJECTED: 'Request origin or CSRF validation failed.',
    UNAUTHENTICATED: 'Authentication is required.',
    OPERATION_NOT_PERMITTED: 'The operation is not permitted.',
    RESOURCE_NOT_FOUND: 'The requested resource was not found.',
    METHOD_NOT_ALLOWED: 'The request method is not supported for this route.',
    NOT_ACCEPTABLE: 'The requested response media type is not supported.',
    UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json; charset=utf-8.',
    PAYLOAD_TOO_LARGE: 'The request payload exceeds the allowed size.',
    RATE_LIMITED: 'The request rate limit was exceeded.',
    COLLABORATION_UNAVAILABLE: 'Collaboration is currently unavailable.'
});

class PreviewKeyApiError extends Error {
    constructor(readonly status: number, readonly code: ErrorCode,
        readonly extraHeaders: Readonly<Record<string, string>> = {}) {
        super(code);
        this.name = 'PreviewKeyApiError';
    }
}

interface RuntimeBindings extends IdentityEnvironmentInput {
    readonly KEY_FOUNDATION_MODE?: string;
    readonly COLLAB_DB?: D1Database;
}

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
        KEY_FOUNDATION_MODE: stringBinding(source, 'KEY_FOUNDATION_MODE'),
        GITHUB_OAUTH_CLIENT_ID: stringBinding(source, 'GITHUB_OAUTH_CLIENT_ID'),
        GITHUB_OAUTH_CLIENT_SECRET: stringBinding(source, 'GITHUB_OAUTH_CLIENT_SECRET'),
        OAUTH_TRANSACTION_KEY: stringBinding(source, 'OAUTH_TRANSACTION_KEY'),
        SESSION_TOKEN_PEPPER: stringBinding(source, 'SESSION_TOKEN_PEPPER'),
        CSRF_TOKEN_KEY: stringBinding(source, 'CSRF_TOKEN_KEY'),
        RATE_LIMIT_KEY: stringBinding(source, 'RATE_LIMIT_KEY'),
        COLLAB_DB: databaseBinding(source)
    });
}

function routeFor(pathname: string, method: string): { route: Route; params: readonly string[] } | null {
    const matches = ROUTES.flatMap(route => {
        const match = pathname.match(route.pattern);
        return match === null ? [] : [{ route, params: match.slice(1) }];
    });
    if (matches.length === 0) return null;
    const exact = matches.find(match => match.route.methods.includes(method));
    if (exact) return exact;
    const first = matches[0];
    if (!first) return null;
    return { route: { ...first.route, methods: [...new Set(matches.flatMap(match => match.route.methods))] }, params: first.params };
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
    return parts.length === 2 && parts[0] === 'application/json' && /^charset=(?:"?utf-8"?)$/.test(parts[1]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
    const keys = Object.keys(value);
    return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key));
}

async function readBody(request: Request): Promise<{ value: Record<string, unknown>; raw: Uint8Array }> {
    const declared = request.headers.get('Content-Length');
    if (declared !== null && (!/^\d{1,6}$/.test(declared) || Number(declared) > MAXIMUM_BODY_BYTES)) {
        throw new PreviewKeyApiError(413, 'PAYLOAD_TOO_LARGE');
    }
    if (request.body === null) throw new PreviewKeyApiError(400, 'INVALID_JSON');
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
                throw new PreviewKeyApiError(413, 'PAYLOAD_TOO_LARGE');
            }
            chunks.push(next.value);
        }
    } finally { reader.releaseLock(); }
    const raw = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { raw.set(chunk, offset); offset += chunk.byteLength; }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(raw)); }
    catch { throw new PreviewKeyApiError(400, 'INVALID_JSON'); }
    if (!isRecord(parsed)) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
    return { value: parsed, raw };
}

function arrayBuffer(value: Uint8Array): ArrayBuffer {
    const result = new ArrayBuffer(value.byteLength);
    new Uint8Array(result).set(value);
    return result;
}

function requestId(dependencies: SessionLifecycleDependencies): string {
    const value = dependencies.ids.uuid();
    if (!UUID_V4.test(value)) throw new PreviewKeyApiError(503, 'COLLABORATION_UNAVAILABLE');
    return value;
}

function serverTime(dependencies: SessionLifecycleDependencies): number {
    const value = dependencies.clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - REPLAY_RETENTION_MS) {
        throw new PreviewKeyApiError(503, 'COLLABORATION_UNAVAILABLE');
    }
    return value;
}

function requireUuid(value: unknown): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
    return value;
}

function idempotency(request: Request): string {
    return requireUuid(request.headers.get(IDEMPOTENCY_HEADER));
}

function actingDevice(request: Request, required: boolean): string | null {
    const value = request.headers.get(DEVICE_HEADER);
    if (value === null && !required) return null;
    return requireUuid(value);
}

async function requestFingerprint(request: Request, mutationId: string, raw: Uint8Array): Promise<ArrayBuffer> {
    const prefix = new TextEncoder().encode(`${request.method}\n${new URL(request.url).pathname}\n${mutationId}\n`);
    const bytes = new Uint8Array(prefix.byteLength + raw.byteLength);
    bytes.set(prefix);
    bytes.set(raw, prefix.byteLength);
    return crypto.subtle.digest('SHA-256', bytes);
}

function responseHeaders(id: string): Headers {
    return identityResponseHeaders(`req_${id}`);
}

function success(id: string, status: number, data: object,
    page?: { limit: number; nextCursor: string | null }, setCookie?: string | null): Response {
    const headers = responseHeaders(id);
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return new Response(JSON.stringify({ data, meta: { requestId: `req_${id}`, apiVersion: 'v1',
        ...(page ? { page } : {}) } }), { status, headers });
}

function empty(id: string, setCookie?: string | null): Response {
    const headers = responseHeaders(id);
    headers.delete('Content-Type');
    if (setCookie) headers.set('Set-Cookie', setCookie);
    return new Response(null, { status: 204, headers });
}

function failure(id: string, error: PreviewKeyApiError): Response {
    const headers = responseHeaders(id);
    for (const [name, value] of Object.entries(error.extraHeaders)) headers.set(name, value);
    return new Response(JSON.stringify({ error: { code: error.code, message: ERROR_MESSAGES[error.code] },
        meta: { requestId: `req_${id}`, apiVersion: 'v1' } }), { status: error.status, headers });
}

function sourceDiscriminator(request: Request): string {
    const value = request.headers.get('CF-Connecting-IP');
    if (value === null || value.length < 3 || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) {
        throw new IdentityRateLimitError(60);
    }
    return value;
}

async function cursorSigningKey(runtime: IdentityRuntimeConfiguration & { enabled: true }): Promise<Uint8Array> {
    const key = runtime.secrets.csrfTokenKey.keys.get(runtime.secrets.csrfTokenKey.activeKeyId);
    if (!key) throw new PreviewKeyApiError(503, 'COLLABORATION_UNAVAILABLE');
    return deriveIdentityKey(key, 'docvault:collaboration-control-plane-cursor:v1');
}

function mapError(error: unknown): PreviewKeyApiError {
    if (error instanceof PreviewKeyApiError) return error;
    if (error instanceof IdentityRateLimitError) {
        return new PreviewKeyApiError(429, 'RATE_LIMITED', { 'Retry-After': String(error.retryAfterSeconds) });
    }
    if (error instanceof ControlPlaneCursorError) return new PreviewKeyApiError(400, 'INVALID_CURSOR');
    if (error instanceof E2eePrimitiveError) return new PreviewKeyApiError(400, 'VALIDATION_FAILED');
    if (error instanceof PersistenceError) {
        if (error.code === 'PERSISTENCE_NOT_FOUND') return new PreviewKeyApiError(404, 'RESOURCE_NOT_FOUND');
        if (error.code === 'AUTHORITY_REVOKED') return new PreviewKeyApiError(403, 'OPERATION_NOT_PERMITTED');
        return new PreviewKeyApiError(503, 'COLLABORATION_UNAVAILABLE');
    }
    return new PreviewKeyApiError(503, 'COLLABORATION_UNAVAILABLE');
}

function queryLimit(url: URL, maximum: number): number {
    const raw = url.searchParams.get('limit');
    if (raw === null) return Math.min(50, maximum);
    if (!/^[1-9][0-9]{0,2}$/.test(raw) || Number(raw) > maximum) {
        throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
    }
    return Number(raw);
}

function assertQuery(url: URL, allowed: readonly string[]): void {
    const seen = new Set<string>();
    for (const key of url.searchParams.keys()) {
        if (!allowed.includes(key) || seen.has(key)) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        seen.add(key);
    }
}

export type PreviewKeyApiDependencies = SessionLifecycleDependencies;

async function dispatch(database: D1Database, request: Request, matched: { route: Route; params: readonly string[] },
    runtime: IdentityRuntimeConfiguration & { enabled: true }, dependencies: PreviewKeyApiDependencies,
    persistentRequestId: string): Promise<Response> {
    const now = serverTime(dependencies);
    const rawToken = readSessionCookie(request.headers.get('Cookie'), COOKIE_NAME);
    if (rawToken === null) throw new PreviewKeyApiError(401, 'UNAUTHENTICATED');
    const session = await resolveSessionToken(database, { cookieName: COOKIE_NAME,
        sessionTokenPepper: runtime.secrets.sessionTokenPepper, token: rawToken,
        coalesceActivity: !matched.route.mutation }, dependencies);
    if (!session.authenticated) throw new PreviewKeyApiError(401, 'UNAUTHENTICATED');
    if (matched.route.mutation) {
        const supplied = request.headers.get(CSRF_HEADER);
        if (supplied === null || !await verifyCsrfToken(runtime.secrets.csrfTokenKey, rawToken, supplied)) {
            throw new PreviewKeyApiError(403, 'CSRF_REJECTED');
        }
    }
    await enforceIdentityRateLimit({ database: database.withSession('first-primary'),
        keyring: runtime.secrets.rateLimitKey, tier: 'identity_user', discriminator: session.userId, serverTime: now });
    sourceDiscriminator(request);
    const actorUserId = session.userId;
    const actorSessionId = session.sessionId;
    const deviceId = actingDevice(request, matched.route.requiresDevice);
    const url = new URL(request.url);
    const cursor = createControlPlaneCursorCodec(await cursorSigningKey(runtime));

    if (matched.route.id === 'device-list') {
        assertQuery(url, ['limit', 'cursor']);
        const limit = queryLimit(url, 100);
        let beforeCreatedAt: number | undefined;
        let beforeDeviceId: string | undefined;
        const token = url.searchParams.get('cursor');
        if (token) {
            const position = await cursor.verify('devices', actorUserId, token, now);
            beforeCreatedAt = Number(position.createdAt);
            beforeDeviceId = requireUuid(position.deviceId);
        }
        const items = await inventoryDevices(database, { actorUserId, limit,
            ...(beforeCreatedAt === undefined ? {} : { beforeCreatedAt, beforeDeviceId }) });
        const last = items.at(-1);
        const nextCursor = items.length < limit || !last ? null
            : await cursor.issue('devices', actorUserId, { createdAt: last.createdAt, deviceId: last.deviceId }, now);
        return success(persistentRequestId, 200, { items }, { limit, nextCursor }, session.setCookie);
    }

    if (matched.route.id === 'workspace-device-list') {
        assertQuery(url, ['limit', 'cursor']);
        const workspaceId = requireUuid(matched.params[0]);
        const limit = queryLimit(url, 100);
        let afterDeviceId: string | undefined;
        const token = url.searchParams.get('cursor');
        if (token) {
            const position = await cursor.verify('workspace-devices', workspaceId, token, now);
            afterDeviceId = requireUuid(position.deviceId);
        }
        const items = await listWorkspaceProvisioningDevices(database, { actorUserId, actorSessionId,
            actorDeviceId: requireUuid(deviceId), workspaceId, serverTime: now, limit,
            ...(afterDeviceId ? { afterDeviceId } : {}) });
        const last = items.at(-1);
        const nextCursor = items.length < limit || !last ? null
            : await cursor.issue('workspace-devices', workspaceId, { deviceId: last.deviceId }, now);
        return success(persistentRequestId, 200, { items }, { limit, nextCursor }, session.setCookie);
    }

    if (matched.route.id === 'key-envelope-current') {
        if (url.search) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const result = await readCurrentWorkspaceEnvelope(database, { actorUserId, actorSessionId,
            actorDeviceId: requireUuid(deviceId), workspaceId: requireUuid(matched.params[0]), serverTime: now });
        return success(persistentRequestId, 200, result, undefined, session.setCookie);
    }

    if (matched.route.id === 'rotation-read') {
        if (url.search) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const workspaceId = requireUuid(matched.params[0]);
        const rotationId = requireUuid(matched.params[1]);
        const status = await readWorkspaceKeyRotation(database, { actorUserId, actorSessionId,
            actorDeviceId: requireUuid(deviceId), workspaceId, rotationId, serverTime: now });
        const binding = await readRotationCommitBinding(database, { actorUserId, actorSessionId,
            actorDeviceId: requireUuid(deviceId), workspaceId, rotationId, serverTime: now });
        return success(persistentRequestId, 200, { ...status, ...binding }, undefined, session.setCookie);
    }

    if (url.search) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
    const body = await readBody(request);
    const clientMutationId = idempotency(request);
    const fingerprint = await requestFingerprint(request, clientMutationId, body.raw);

    if (matched.route.id === 'device-register') {
        if (!exactKeys(body.value, ['publicJwk', 'fingerprint', 'suite'], ['displayLabel'])
            || body.value.suite !== 'P256-HKDF-SHA256-A256GCM-v1'
            || typeof body.value.fingerprint !== 'string') throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const parsed = await parsePublicJwk(body.value.publicJwk);
        if (parsed.fingerprint !== body.value.fingerprint) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const result = await registerDevice(database, { actorUserId, actorSessionId,
            deviceId: requestId(dependencies), label: body.value.displayLabel === undefined ? 'Device'
                : String(body.value.displayLabel), publicJwk: parsed.jwk,
            mutationResultId: requestId(dependencies), clientMutationId, requestFingerprint: fingerprint,
            auditEventId: requestId(dependencies), requestId: persistentRequestId,
            serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS });
        return success(persistentRequestId, result.httpStatus, result, undefined, session.setCookie);
    }

    if (matched.route.id === 'device-revoke') {
        if (!exactKeys(body.value, [])) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const result = await revokeDevice(database, { actorUserId, actorSessionId,
            deviceId: requireUuid(matched.params[0]), mutationResultId: requestId(dependencies),
            clientMutationId, requestFingerprint: fingerprint, auditEventId: requestId(dependencies),
            requestId: persistentRequestId, serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS });
        return success(persistentRequestId, 200, result, undefined, session.setCookie);
    }

    const ownedDeviceId = requireUuid(deviceId);
    if (matched.route.id === 'workspace-bootstrap-intent') {
        if (!exactKeys(body.value, ['displayName', 'ownerDeviceId'], ['encryptedDescription'])
            || body.value.ownerDeviceId !== ownedDeviceId || typeof body.value.displayName !== 'string') {
            throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        }
        const intent = await createWorkspaceBootstrapIntent(database, { actorUserId, actorSessionId,
            actorDeviceId: ownedDeviceId, clientMutationId, serverTime: now });
        const devices = await inventoryDevices(database, { actorUserId, limit: 100 });
        const owner = devices.find(item => item.deviceId === ownedDeviceId && item.state === 'active');
        if (!owner) throw new PreviewKeyApiError(403, 'OPERATION_NOT_PERMITTED');
        return success(persistentRequestId, 200, { workspaceId: intent.workspaceId,
            initialKeyVersion: 1, ownerDeviceId: ownedDeviceId, ownerFingerprint: owner.fingerprint,
            suite: intent.suite }, undefined, session.setCookie);
    }

    const mutation = { actorUserId, actorSessionId, actorDeviceId: ownedDeviceId,
        mutationResultId: requestId(dependencies), clientMutationId, requestFingerprint: fingerprint,
        auditEventId: requestId(dependencies), requestId: persistentRequestId,
        serverTime: now, replayExpiresAt: now + REPLAY_RETENTION_MS };

    if (matched.route.id === 'workspace-create-keyed') {
        if (!exactKeys(body.value, ['displayName', 'ownerDeviceId', 'initialKeyVersion', 'initialKeyEnvelope'],
            ['encryptedDescription']) || body.value.ownerDeviceId !== ownedDeviceId
            || body.value.initialKeyVersion !== 1 || typeof body.value.displayName !== 'string') {
            throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        }
        const intent = await createWorkspaceBootstrapIntent(database, { actorUserId, actorSessionId,
            actorDeviceId: ownedDeviceId, clientMutationId, serverTime: now });
        const result = await bootstrapWorkspaceKey(database, { ...mutation, workspaceId: intent.workspaceId,
            displayName: body.value.displayName, descriptionEnvelope: body.value.encryptedDescription === undefined
                ? null : arrayBuffer(decodeBase64Url(String(body.value.encryptedDescription), undefined, 8_192)),
            envelopeId: requestId(dependencies), envelope: await parseWorkspaceKeyEnvelope(body.value.initialKeyEnvelope) });
        return success(persistentRequestId, 201, result, undefined, session.setCookie);
    }

    const workspaceId = requireUuid(matched.params[0]);
    if (matched.route.id === 'key-envelope-provision') {
        if (!exactKeys(body.value, ['envelope'])) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const value = await parseWorkspaceKeyEnvelope(body.value.envelope);
        const targetDeviceId = requireUuid(matched.params[1]);
        if (value.aad.workspaceId !== workspaceId || value.aad.targetDeviceId !== targetDeviceId) {
            throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        }
        const result = await provisionWorkspaceEnvelope(database, { ...mutation, workspaceId,
            envelopeId: requestId(dependencies), targetUserId: requireUuid(value.aad.targetUserId),
            targetDeviceId, targetFingerprint: String(value.aad.targetFingerprint),
            keyVersion: Number(value.aad.keyVersion), envelope: value });
        return success(persistentRequestId, result.httpStatus, result, undefined, session.setCookie);
    }

    if (matched.route.id === 'rotation-start') {
        if (!exactKeys(body.value, ['reason']) || typeof body.value.reason !== 'string' || !ROTATION_REASONS.some(reason => reason === body.value.reason)) {
            throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        }
        const result = await startWorkspaceKeyRotation(database, { ...mutation, workspaceId,
            rotationId: requestId(dependencies), reason: String(body.value.reason), expiresAt: now + 86_400_000 });
        return success(persistentRequestId, result.httpStatus, result, undefined, session.setCookie);
    }

    const rotationId = requireUuid(matched.params[1]);
    if (matched.route.id === 'rotation-stage') {
        if (!exactKeys(body.value, ['envelope'])) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const value = await parseWorkspaceKeyEnvelope(body.value.envelope);
        const targetDeviceId = requireUuid(matched.params[2]);
        if (value.aad.workspaceId !== workspaceId || value.aad.targetDeviceId !== targetDeviceId) {
            throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        }
        const result = await stageWorkspaceRotationEnvelope(database, { ...mutation, workspaceId,
            rotationId, envelopeId: requestId(dependencies), targetUserId: requireUuid(value.aad.targetUserId),
            targetDeviceId, targetFingerprint: String(value.aad.targetFingerprint),
            keyVersion: Number(value.aad.keyVersion), envelope: value });
        return success(persistentRequestId, result.httpStatus, result, undefined, session.setCookie);
    }

    if (matched.route.id === 'rotation-commit') {
        if (!exactKeys(body.value, ['expectedCurrentKeyVersion', 'eligibleSetDigest'])
            || !Number.isSafeInteger(body.value.expectedCurrentKeyVersion)
            || typeof body.value.eligibleSetDigest !== 'string') throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        const binding = await readRotationCommitBinding(database, { actorUserId, actorSessionId,
            actorDeviceId: ownedDeviceId, workspaceId, rotationId, serverTime: now });
        if (binding.expectedCurrentKeyVersion !== body.value.expectedCurrentKeyVersion
            || binding.eligibleSetDigest !== body.value.eligibleSetDigest) {
            throw new PreviewKeyApiError(409, 'OPERATION_NOT_PERMITTED');
        }
        const result = await commitWorkspaceKeyRotation(database, { ...mutation, workspaceId, rotationId });
        return success(persistentRequestId, 200, result, undefined, session.setCookie);
    }

    if (matched.route.id === 'rotation-abort') {
        if (!exactKeys(body.value, [])) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        await abortWorkspaceKeyRotation(database, { ...mutation, workspaceId, rotationId });
        return empty(persistentRequestId, session.setCookie);
    }
    throw new PreviewKeyApiError(404, 'RESOURCE_NOT_FOUND');
}

export async function handlePreviewKeyFoundationApi(request: Request, source: object,
    dependencies?: PreviewKeyApiDependencies): Promise<Response | null> {
    const url = new URL(request.url);
    const matched = routeFor(url.pathname, request.method);
    if (matched === null) return null;
    const env = bindings(source);
    const database = env.COLLAB_DB;
    const runtime = resolveIdentityRuntime(env, { requestOrigin: url.origin,
        hasCollaborationDatabase: database !== undefined });
    if (!dependencies || env.KEY_FOUNDATION_MODE !== 'preview-only' || !runtime.enabled
        || runtime.mode !== 'preview-only' || url.origin !== PREVIEW_ORIGIN || database === undefined) return null;
    let id: string;
    try { id = requestId(dependencies); } catch { id = crypto.randomUUID(); }
    try {
        if (!matched.route.methods.includes(request.method)) {
            throw new PreviewKeyApiError(405, 'METHOD_NOT_ALLOWED', { Allow: matched.route.methods.join(', ') });
        }
        if (!acceptsJson(request.headers.get('Accept'))) throw new PreviewKeyApiError(406, 'NOT_ACCEPTABLE');
        if (new TextEncoder().encode(url.search.startsWith('?') ? url.search.slice(1) : url.search).byteLength
            > MAXIMUM_QUERY_BYTES) throw new PreviewKeyApiError(400, 'VALIDATION_FAILED');
        if (matched.route.mutation) {
            if (request.headers.get('Origin') !== PREVIEW_ORIGIN) throw new PreviewKeyApiError(403, 'CSRF_REJECTED');
            if (!jsonContentType(request.headers.get('Content-Type'))) {
                throw new PreviewKeyApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
            }
        } else {
            const origin = request.headers.get('Origin');
            if (origin !== null && origin !== PREVIEW_ORIGIN) throw new PreviewKeyApiError(403, 'CSRF_REJECTED');
        }
        return await dispatch(database, request, matched, runtime, dependencies, id);
    } catch (error) {
        return failure(id, mapError(error));
    }
}

export const PREVIEW_KEY_FOUNDATION_API = Object.freeze({
    origin: PREVIEW_ORIGIN,
    routes: ROUTES.map(route => `${route.methods.join('|')} ${route.pattern.source}`),
    maximumBodyBytes: MAXIMUM_BODY_BYTES,
    maximumQueryBytes: MAXIMUM_QUERY_BYTES,
    modeBinding: 'KEY_FOUNDATION_MODE',
    deviceHeader: DEVICE_HEADER,
    idempotencyHeader: IDEMPOTENCY_HEADER,
    csrfHeader: CSRF_HEADER,
    suite: E2EE.workspaceSuite
});
