import type { AuthorizationSessionSource } from '../persistence/authorization-session';
import { enforceIdentityRateLimit, IdentityRateLimitError, type IdentityBurstLimiter } from './abuse-control';
import { expireSessionCookie, readSessionCookie, serializeSessionCookie } from './cookies';
import { PLATFORM_RANDOM, type RandomBytesSource } from './crypto';
import {
    IDENTITY_ENVIRONMENT_CONSTANTS,
    resolveIdentityRuntime,
    type IdentityEnvironmentInput,
    type IdentityRuntimeConfiguration
} from './environment';
import { createGitHubOAuthAdapter, type GitHubOAuthAdapter } from './github-oauth-adapter';
import { completeOAuthCallback, OAuthCallbackError, type OAuthCallbackCheckpoint } from './oauth-callback-service';
import { createOAuthTransaction, type OAuthTransactionCheckpoint } from './oauth-transaction-service';
import {
    createIdentityOperationalEvent,
    PLATFORM_IDENTITY_EVENT_SINK,
    type IdentityOutcome,
    type IdentityRouteTemplate
} from './observability';
import {
    authorizeIdentityRequest,
    enforceIdentityRequestPolicy,
    identityResponseHeaders,
    IdentityRequestPolicyError,
    type OAuthTransactionPurpose
} from './request-policy';
import { logoutSession, type SessionLifecycleCheckpoint } from './session-service';

const AUTHORIZATION_ENDPOINT = 'https://github.com/login/oauth/authorize';
const MAXIMUM_JSON_BYTES = 1_024;
const MAXIMUM_QUERY_BYTES = 1_024;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SUBJECT = /^[1-9][0-9]{0,19}$/;

interface IdentityRuntimeBindings extends IdentityEnvironmentInput {
    readonly COLLAB_DB?: AuthorizationSessionSource;
    readonly AUTH_BURST_SERVICE?: IdentityBurstLimiter;
    readonly PREVIEW_ALLOWED_GITHUB_SUBJECTS?: string;
}

export interface IdentityRuntimeDependencies {
    readonly clock: { now(): number };
    readonly ids: { uuid(): string };
    readonly random: RandomBytesSource;
    readonly failures: { checkpoint(name: OAuthTransactionCheckpoint | OAuthCallbackCheckpoint |
        SessionLifecycleCheckpoint): void | Promise<void> };
    readonly provider: (configuration: { readonly clientId: string; readonly clientSecret: string }) => GitHubOAuthAdapter;
    readonly events: typeof PLATFORM_IDENTITY_EVENT_SINK;
}

const PLATFORM_IDENTITY_RUNTIME_DEPENDENCIES: IdentityRuntimeDependencies = Object.freeze({
    clock: Object.freeze({ now: () => Date.now() }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: PLATFORM_RANDOM,
    failures: Object.freeze({ checkpoint: async () => {} }),
    provider: (configuration: { readonly clientId: string; readonly clientSecret: string }) =>
        createGitHubOAuthAdapter(configuration),
    events: PLATFORM_IDENTITY_EVENT_SINK
});

function stringBinding(source: object, name: keyof IdentityRuntimeBindings): string | undefined {
    if (!(name in source)) return undefined;
    const value = Reflect.get(source, name);
    return typeof value === 'string' ? value : undefined;
}

function databaseBinding(source: object): AuthorizationSessionSource | undefined {
    if (!('COLLAB_DB' in source)) return undefined;
    const value = Reflect.get(source, 'COLLAB_DB');
    return typeof value === 'object' && value !== null && 'prepare' in value && 'withSession' in value
        ? value as AuthorizationSessionSource : undefined;
}

function limiterBinding(source: object): IdentityBurstLimiter | undefined {
    if (!('AUTH_BURST_SERVICE' in source)) return undefined;
    const value = Reflect.get(source, 'AUTH_BURST_SERVICE');
    if (typeof value !== 'object' || value === null) return undefined;
    const fetch = Reflect.get(value, 'fetch');
    if (typeof fetch === 'function') {
        const service = value as { fetch(request: Request): Promise<Response> };
        return Object.freeze({
            async limit(options: { readonly key: string }): Promise<{ readonly success: boolean }> {
                const response = await service.fetch(new Request('https://identity-burst.internal/v1/limit', {
                    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify({ key: options.key })
                }));
                const length = response.headers.get('Content-Length');
                if (length !== null && (!/^\d{1,3}$/.test(length) || Number(length) > 64)) throw new Error('RATE_LIMIT_UNAVAILABLE');
                const text = await response.text();
                if (new TextEncoder().encode(text).byteLength > 64 || response.status !== 200) throw new Error('RATE_LIMIT_UNAVAILABLE');
                let result: unknown;
                try { result = JSON.parse(text); } catch { throw new Error('RATE_LIMIT_UNAVAILABLE'); }
                if (typeof result !== 'object' || result === null || Array.isArray(result)
                    || Object.keys(result).length !== 1 || typeof Reflect.get(result, 'success') !== 'boolean') {
                    throw new Error('RATE_LIMIT_UNAVAILABLE');
                }
                return Object.freeze({ success: Reflect.get(result, 'success') as boolean });
            }
        });
    }
    if ('limit' in value && typeof Reflect.get(value, 'limit') === 'function') return value as IdentityBurstLimiter;
    return undefined;
}

function bindings(source: object): IdentityRuntimeBindings {
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
        PREVIEW_ALLOWED_GITHUB_SUBJECTS: stringBinding(source, 'PREVIEW_ALLOWED_GITHUB_SUBJECTS'),
        COLLAB_DB: databaseBinding(source),
        AUTH_BURST_SERVICE: limiterBinding(source)
    });
}

function allowedSubjects(value: string | undefined): ReadonlySet<string> | null {
    if (typeof value !== 'string' || value.length < 1 || value.length > 512) return null;
    const values = value.split(',');
    if (values.length < 1 || values.length > 10 || values.some(item => !SUBJECT.test(item))) return null;
    const unique = new Set(values);
    return unique.size === values.length ? unique : null;
}

function json(headers: Headers, status: number, body: object): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d{1,6}$/.test(length) || Number(length) > MAXIMUM_JSON_BYTES)) {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAXIMUM_JSON_BYTES) {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    let value: unknown;
    try { value = JSON.parse(text); } catch { throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED'); }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    return value as Record<string, unknown>;
}

function transactionBody(value: Record<string, unknown>): { purpose: OAuthTransactionPurpose; returnPath?: string } {
    const keys = Object.keys(value).sort();
    if (keys.some(key => key !== 'purpose' && key !== 'returnPath') || keys.length < 1
        || (value.purpose !== 'sign_in' && value.purpose !== 'reauthenticate')
        || (value.returnPath !== undefined && typeof value.returnPath !== 'string')) {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    return value.returnPath === undefined
        ? { purpose: value.purpose }
        : { purpose: value.purpose, returnPath: value.returnPath };
}

function sourceDiscriminator(request: Request): string {
    const value = request.headers.get('CF-Connecting-IP');
    if (value === null || value.length < 3 || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) {
        throw new IdentityRateLimitError(60);
    }
    return value;
}

function callbackQuery(request: Request): { code: string; state: string } {
    const url = new URL(request.url);
    if (url.search.length > MAXIMUM_QUERY_BYTES) throw new Error('OAUTH_CALLBACK_FAILED');
    const keys = [...url.searchParams.keys()];
    if (keys.length !== 2 || !keys.includes('code') || !keys.includes('state')) throw new Error('OAUTH_CALLBACK_FAILED');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (code === null || state === null || !/^[A-Za-z0-9_-]{1,512}$/.test(code)
        || !/^[A-Za-z0-9_-]{43}$/.test(state)) throw new Error('OAUTH_CALLBACK_FAILED');
    return { code, state };
}

function guardedProvider(provider: GitHubOAuthAdapter, subjects: ReadonlySet<string>): GitHubOAuthAdapter {
    return Object.freeze({
        async resolveIdentity(input: Parameters<GitHubOAuthAdapter['resolveIdentity']>[0]) {
            const identity = await provider.resolveIdentity(input);
            if (!subjects.has(identity.providerSubject)) throw new Error('GITHUB_OAUTH_UNAVAILABLE');
            return identity;
        }
    });
}

function routeTemplate(request: Request): IdentityRouteTemplate {
    return new URL(request.url).pathname as IdentityRouteTemplate;
}

function callbackRedirect(path: string, success: boolean): string {
    const marker = crypto.randomUUID();
    return `${IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin}${path}#auth-result=${success ? 'complete' : 'unavailable'}-${marker}`;
}

async function rate(database: AuthorizationSessionSource, runtime: IdentityRuntimeConfiguration & { enabled: true },
    request: Request, tier: 'oauth_source' | 'identity_source' | 'identity_user', discriminator: string,
    dependencies: IdentityRuntimeDependencies, burst?: IdentityBurstLimiter): Promise<void> {
    await enforceIdentityRateLimit({ database: database.withSession('first-primary'), keyring: runtime.secrets.rateLimitKey,
        tier, discriminator, serverTime: dependencies.clock.now(), burstLimiter: burst });
}

async function handleEnabled(request: Request, runtime: IdentityRuntimeConfiguration & { enabled: true },
    env: IdentityRuntimeBindings, dependencies: IdentityRuntimeDependencies, requestId: string,
    operational: { outcome: IdentityOutcome }): Promise<Response> {
    const database = env.COLLAB_DB;
    if (!database) throw new Error('IDENTITY_CONFIGURATION_INVALID');
    const policy = enforceIdentityRequestPolicy(request, IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin);
    const headers = identityResponseHeaders(requestId);
    const source = sourceDiscriminator(request);
    if (policy.route.id === 'oauth-callback') {
        let returnPath = '/';
        try {
            await rate(database, runtime, request, 'oauth_source', source, dependencies, env.AUTH_BURST_SERVICE);
            const query = callbackQuery(request);
            const subjects = allowedSubjects(env.PREVIEW_ALLOWED_GITHUB_SUBJECTS);
            if (!subjects || !env.AUTH_BURST_SERVICE) throw new Error('IDENTITY_CONFIGURATION_INVALID');
            const provider = guardedProvider(dependencies.provider({ clientId: runtime.secrets.githubClientId,
                clientSecret: runtime.secrets.githubClientSecret }), subjects);
            const result = await completeOAuthCallback(database, {
                oauthTransactionKey: runtime.secrets.oauthTransactionKey,
                sessionTokenPepper: runtime.secrets.sessionTokenPepper,
                provider, state: query.state, code: query.code,
                callbackOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin
            }, dependencies);
            returnPath = result.returnPath;
            headers.delete('Content-Type');
            headers.set('Location', callbackRedirect(returnPath, true));
            headers.set('Set-Cookie', serializeSessionCookie(runtime.cookieName, result.sessionToken,
                result.absoluteExpiresAt));
            return new Response(null, { status: 303, headers });
        } catch (error) {
            operational.outcome = error instanceof IdentityRateLimitError ? 'rate_limited'
                : error instanceof OAuthCallbackError ? error.outcome : 'internal_error';
            headers.delete('Content-Type');
            headers.set('Location', callbackRedirect(returnPath, false));
            return new Response(null, { status: 303, headers });
        }
    }
    const body = policy.route.id === 'oauth-transaction' ? transactionBody(await boundedJson(request)) : null;
    const authorization = await authorizeIdentityRequest(database, request, {
        expectedOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin,
        transactionPurpose: body?.purpose,
        cookieName: runtime.cookieName,
        sessionTokenPepper: runtime.secrets.sessionTokenPepper,
        csrfTokenKey: runtime.secrets.csrfTokenKey
    }, dependencies);
    if (policy.route.id === 'oauth-transaction' && body) {
        await rate(database, runtime, request, 'oauth_source', source, dependencies, env.AUTH_BURST_SERVICE);
        const created = await createOAuthTransaction(database, {
            keyring: runtime.secrets.oauthTransactionKey,
            purpose: body.purpose,
            returnPath: body.returnPath,
            initiatingSessionId: authorization.session?.authenticated ? authorization.session.sessionId : null,
            initiatingUserId: authorization.session?.authenticated ? authorization.session.userId : null
        }, dependencies);
        const authorizationUrl = new URL(AUTHORIZATION_ENDPOINT);
        authorizationUrl.search = new URLSearchParams({ client_id: runtime.secrets.githubClientId,
            redirect_uri: `${IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin}/api/v1/oauth/github/callback`,
            state: created.state, code_challenge: created.codeChallenge,
            code_challenge_method: created.codeChallengeMethod }).toString();
        return json(headers, 201, { authorizationUrl: authorizationUrl.href, expiresAt: created.expiresAt });
    }
    if (policy.route.id === 'session') {
        await rate(database, runtime, request, 'identity_source', source, dependencies);
        if (!authorization.session?.authenticated) {
            if (authorization.session?.clearCookie) headers.set('Set-Cookie', expireSessionCookie(runtime.cookieName));
            return json(headers, 200, { authenticated: false });
        }
        await rate(database, runtime, request, 'identity_user', authorization.session.userId, dependencies);
        if (authorization.session.setCookie) headers.set('Set-Cookie', authorization.session.setCookie);
        return json(headers, 200, {
            authenticated: true,
            user: { userId: authorization.session.userId, provider: 'github',
                providerSubject: authorization.session.providerSubject, login: authorization.session.login,
                displayName: authorization.session.displayName,
                ...(authorization.session.avatarUrl === null ? {} : { avatarUrl: authorization.session.avatarUrl }) },
            session: { createdAt: authorization.session.createdAt,
                authenticatedAt: authorization.session.authenticatedAt,
                idleExpiresAt: authorization.session.idleExpiresAt,
                absoluteExpiresAt: authorization.session.absoluteExpiresAt },
            csrfToken: authorization.csrfToken
        });
    }
    if (policy.route.id === 'logout' && authorization.session?.authenticated) {
        await rate(database, runtime, request, 'identity_source', source, dependencies);
        await rate(database, runtime, request, 'identity_user', authorization.session.userId, dependencies);
        const token = readSessionCookie(request.headers.get('Cookie'), runtime.cookieName);
        if (token === null) throw new IdentityRequestPolicyError(401, 'UNAUTHENTICATED', { clearCookie: true });
        const result = await logoutSession(database, { cookieName: runtime.cookieName,
            sessionTokenPepper: runtime.secrets.sessionTokenPepper, token }, dependencies);
        headers.set('Set-Cookie', result.setCookie);
        return new Response(null, { status: result.revoked ? 204 : 401, headers });
    }
    throw new IdentityRequestPolicyError(404, 'RESOURCE_NOT_FOUND');
}

function errorResponse(error: unknown, requestId: string, cookieName: '__Host-docvault-preview-session'): Response {
    const headers = identityResponseHeaders(requestId);
    if (error instanceof IdentityRateLimitError) {
        headers.set('Retry-After', String(error.retryAfterSeconds));
        return json(headers, 429, { error: { code: 'RATE_LIMITED' } });
    }
    if (error instanceof IdentityRequestPolicyError) {
        if (error.allow) headers.set('Allow', error.allow);
        if (error.clearCookie) headers.set('Set-Cookie', expireSessionCookie(cookieName));
        return json(headers, error.status, { error: { code: error.code } });
    }
    return json(headers, 503, { error: { code: 'COLLABORATION_UNAVAILABLE' } });
}

export async function handleIdentityRuntime(request: Request, source: object,
    dependencies: IdentityRuntimeDependencies = PLATFORM_IDENTITY_RUNTIME_DEPENDENCIES): Promise<Response | null> {
    const env = bindings(source);
    const origin = new URL(request.url).origin;
    const runtime = resolveIdentityRuntime(env, { requestOrigin: origin, hasCollaborationDatabase: !!env.COLLAB_DB });
    if (!runtime.enabled) return null;
    const pathname = new URL(request.url).pathname;
    if (!['/api/v1/oauth/github/transactions', '/api/v1/oauth/github/callback',
        '/api/v1/session', '/api/v1/session/logout'].includes(pathname)) return null;
    const requestId = dependencies.ids.uuid();
    if (!UUID_V4.test(requestId)) return errorResponse(new Error(), crypto.randomUUID(), runtime.cookieName);
    const startedAt = dependencies.clock.now();
    const operational: { outcome: IdentityOutcome } = { outcome: 'success' };
    let response: Response;
    try {
        response = await handleEnabled(request, runtime, env, dependencies, requestId, operational);
        if (response.status >= 400 && operational.outcome === 'success') operational.outcome = 'rejected';
    } catch (error) {
        operational.outcome = error instanceof IdentityRateLimitError ? 'rate_limited'
            : error instanceof IdentityRequestPolicyError ? 'rejected' : 'internal_error';
        response = errorResponse(error, requestId, runtime.cookieName);
    }
    try {
        await dependencies.events.emit(createIdentityOperationalEvent({ requestId,
            route: routeTemplate(request), method: request.method as 'GET' | 'POST', outcome: operational.outcome,
            status: response.status, latencyMs: Math.min(30_000, Math.max(0, dependencies.clock.now() - startedAt)),
            environment: 'preview' }));
    } catch { /* Observability cannot alter authentication authority or disclose request data. */ }
    return response;
}

export const IDENTITY_RUNTIME_CONSTANTS = Object.freeze({
    previewOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin,
    authorizationEndpoint: AUTHORIZATION_ENDPOINT,
    maximumJsonBytes: MAXIMUM_JSON_BYTES,
    maximumQueryBytes: MAXIMUM_QUERY_BYTES
});
