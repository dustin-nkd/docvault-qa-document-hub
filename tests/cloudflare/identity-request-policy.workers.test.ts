import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    authorizeIdentityRequest,
    deriveCsrfToken,
    digestSessionToken,
    generateOpaqueToken,
    identityResponseHeaders,
    IDENTITY_REQUEST_POLICY,
    IdentityRequestPolicyError,
    parseIdentityKeyring,
    type RandomBytesSource,
    type SessionLifecycleDependencies
} from '../../functions/_lib/identity';

const ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const COOKIE = '__Host-docvault-preview-session' as const;
const NOW = 1_900_300_000_000;
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_IDS = [
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333'
];

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const SESSION_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'session', keys: { session: encodedKey(1) }
}));
const CSRF_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'csrf', keys: { csrf: encodedKey(101) }
}));

function random(seed: number): RandomBytesSource {
    return {
        bytes(length: number): Uint8Array {
            return Uint8Array.from({ length }, (_, index) => (seed + index) % 256);
        }
    };
}

function token(seed: number): string {
    return generateOpaqueToken(32, random(seed));
}

function dependencies(): SessionLifecycleDependencies {
    return {
        clock: { now: () => NOW },
        ids: { uuid: () => '44444444-4444-4444-8444-444444444444' },
        random: random(201),
        failures: { checkpoint: () => {} }
    };
}

function request(path: string, options: {
    method?: string;
    origin?: string | null;
    contentType?: string | null;
    accept?: string;
    cookie?: string;
    cookieHeader?: string;
    csrf?: string;
} = {}): Request {
    const method = options.method ?? 'GET';
    const headers = new Headers({ Accept: options.accept ?? 'application/json' });
    if (options.origin !== null) headers.set('Origin', options.origin ?? ORIGIN);
    if (options.cookie) headers.set('Cookie', `${COOKIE}=${options.cookie}`);
    if (options.cookieHeader) headers.set('Cookie', options.cookieHeader);
    if (options.csrf) headers.set('X-CSRF-Token', options.csrf);
    if (options.contentType !== null && method === 'POST') {
        headers.set('Content-Type', options.contentType ?? 'application/json; charset=utf-8');
    }
    return new Request(`${ORIGIN}${path}`, {
        method,
        headers,
        body: method === 'POST' ? '{}' : undefined
    });
}

function input(transactionPurpose?: 'sign_in' | 'reauthenticate') {
    return {
        expectedOrigin: ORIGIN,
        transactionPurpose,
        cookieName: COOKIE,
        sessionTokenPepper: SESSION_RING,
        csrfTokenKey: CSRF_RING
    };
}

async function insertUserAndSessions(tokens: readonly string[]): Promise<void> {
    await env.COLLAB_DB.prepare(
        `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
         status, created_at, updated_at, deactivated_at)
         VALUES (?, 'github', '9001', 'policy-user', NULL, NULL, 'active', ?, ?, NULL)`
    ).bind(USER_ID, NOW - 86_400_000, NOW - 86_400_000).run();
    for (let index = 0; index < tokens.length; index += 1) {
        const { digest } = await digestSessionToken(SESSION_RING, tokens[index]);
        await env.COLLAB_DB.prepare(
            `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
             authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL)`
        ).bind(SESSION_IDS[index], Uint8Array.from(digest).buffer, USER_ID,
            NOW - 60_000, NOW - 60_000, NOW - 60_000,
            NOW + 43_200_000, NOW + 604_800_000).run();
    }
}

describe('CF-P3-006 identity request policy', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'identity_request_policy_migrations');
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM sessions').run();
        await env.COLLAB_DB.prepare('DELETE FROM users').run();
    });

    it('exposes exactly the frozen four method/path pairs', () => {
        expect(IDENTITY_REQUEST_POLICY.routes).toEqual([
            'POST /api/v1/oauth/github/transactions',
            'GET /api/v1/oauth/github/callback',
            'GET /api/v1/session',
            'POST /api/v1/session/logout'
        ]);
    });

    it('rejects business, trailing-slash, unknown, and query-confused routes before D1', async () => {
        for (const candidate of [
            request('/api/v1/workspaces'),
            request('/api/v1/session/'),
            request('/api/v1/session?next=/admin'),
            request('/api/v1/unknown')
        ]) {
            await expect(authorizeIdentityRequest(env.COLLAB_DB, candidate, input(), dependencies()))
                .rejects.toBeInstanceOf(IdentityRequestPolicyError);
        }
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(0);
    });

    it('denies preflight and every wrong method without emitting CORS policy', async () => {
        for (const [path, method] of [
            ['/api/v1/session', 'OPTIONS'],
            ['/api/v1/session', 'POST'],
            ['/api/v1/session/logout', 'GET'],
            ['/api/v1/oauth/github/callback', 'POST']
        ]) {
            await expect(authorizeIdentityRequest(env.COLLAB_DB,
                request(path, { method }), input('sign_in'), dependencies()))
                .rejects.toMatchObject({ status: 405, code: 'METHOD_NOT_ALLOWED' });
        }
        expect(IDENTITY_REQUEST_POLICY.corsHeaders).toEqual([]);
    });

    it('fails closed for missing, null, lookalike, subdomain, port, scheme, and cross-environment origins', async () => {
        for (const origin of [null, 'null', `${ORIGIN}.attacker.example`,
            'https://sub.codex-cf-p3-preview.docvault-qa-document-hub.pages.dev',
            `${ORIGIN}:444`, ORIGIN.replace('https:', 'http:'),
            'https://docvault-qa-document-hub.pages.dev']) {
            await expect(authorizeIdentityRequest(env.COLLAB_DB,
                request('/api/v1/oauth/github/transactions', { method: 'POST', origin }),
                input('sign_in'), dependencies()))
                .rejects.toMatchObject({ status: 403, code: 'CSRF_REJECTED' });
        }
    });

    it('requires exact JSON media type on mutations and JSON Accept on JSON responses', async () => {
        await expect(authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/oauth/github/transactions', { method: 'POST', contentType: null }),
            input('sign_in'), dependencies()))
            .rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });
        await expect(authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session', { accept: 'text/html' }), input(), dependencies()))
            .rejects.toMatchObject({ status: 406, code: 'NOT_ACCEPTABLE' });
    });

    it('keeps callback GET as the state/PKCE protocol exception without Origin or D1 lookup', async () => {
        const result = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/oauth/github/callback?code=opaque&state=opaque', { origin: null }),
            input(), dependencies());
        expect(result).toMatchObject({ policy: { route: { id: 'oauth-callback' } }, session: null, csrfToken: null });
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(0);
    });

    it('allows public sign-in creation without session or CSRF only after exact Origin policy', async () => {
        const result = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/oauth/github/transactions', { method: 'POST' }),
            input('sign_in'), dependencies());
        expect(result).toMatchObject({ policy: { route: { id: 'oauth-transaction' } }, session: null, csrfToken: null });
    });

    it('returns uniform optional-session state and issues CSRF only for a live session', async () => {
        const unauthenticated = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session', { origin: null }), input(), dependencies());
        expect(unauthenticated).toMatchObject({ session: { authenticated: false }, csrfToken: null });
        const unrelated = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session', { origin: null, cookieHeader: 'theme=dark' }), input(), dependencies());
        expect(unrelated).toMatchObject({ session: { authenticated: false, clearCookie: false } });
        const malformed = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session', { origin: null, cookieHeader: `${COOKIE}=malformed` }), input(), dependencies());
        expect(malformed).toMatchObject({ session: { authenticated: false, clearCookie: true } });

        const raw = token(10);
        await insertUserAndSessions([raw]);
        const authenticated = await authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session', { origin: null, cookie: raw }), input(), dependencies());
        expect(authenticated.session).toMatchObject({ authenticated: true, sessionId: SESSION_IDS[0] });
        expect(authenticated.csrfToken).toBe(await deriveCsrfToken(CSRF_RING, raw));
    });

    it('validates exact Origin before live session and live session before CSRF', async () => {
        const raw = token(20);
        await insertUserAndSessions([raw]);
        const csrf = await deriveCsrfToken(CSRF_RING, raw);
        await expect(authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session/logout', { method: 'POST', origin: 'https://attacker.example', cookie: raw, csrf }),
            input(), dependencies())).rejects.toMatchObject({ status: 403, code: 'CSRF_REJECTED' });
        await expect(authorizeIdentityRequest(env.COLLAB_DB,
            request('/api/v1/session/logout', { method: 'POST', csrf }),
            input(), dependencies())).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    });

    it('rejects missing, malformed, old-key, and cross-session CSRF with one generic result', async () => {
        const [first, second] = [token(30), token(40)];
        await insertUserAndSessions([first, second]);
        await env.COLLAB_DB.prepare(
            'UPDATE sessions SET created_at = ?, authenticated_at = ?, last_seen_at = ? WHERE id = ?'
        ).bind(NOW - 700_000, NOW - 650_000, NOW - 600_000, SESSION_IDS[0]).run();
        const crossSession = await deriveCsrfToken(CSRF_RING, second);
        const oldKey = parseIdentityKeyring(JSON.stringify({
            version: 1, activeKeyId: 'old', keys: { old: encodedKey(210) }
        }));
        const oldToken = await deriveCsrfToken(oldKey, first);
        for (const csrf of [undefined, 'malformed-csrf-canary', oldToken, crossSession]) {
            await expect(authorizeIdentityRequest(env.COLLAB_DB,
                request('/api/v1/session/logout', { method: 'POST', cookie: first, csrf }),
                input(), dependencies())).rejects.toMatchObject({ status: 403, code: 'CSRF_REJECTED' });
        }
        expect(await env.COLLAB_DB.prepare('SELECT last_seen_at FROM sessions WHERE id = ?')
            .bind(SESSION_IDS[0]).first<number>('last_seen_at')).toBe(NOW - 600_000);
    });

    it('authorizes logout and reauthentication only with the current session-bound token', async () => {
        const raw = token(50);
        await insertUserAndSessions([raw]);
        const csrf = await deriveCsrfToken(CSRF_RING, raw);
        for (const [path, transactionPurpose] of [
            ['/api/v1/session/logout', undefined],
            ['/api/v1/oauth/github/transactions', 'reauthenticate']
        ] as const) {
            const result = await authorizeIdentityRequest(env.COLLAB_DB,
                request(path, { method: 'POST', cookie: raw, csrf }),
                input(transactionPurpose), dependencies());
            expect(result.session).toMatchObject({ authenticated: true, sessionId: SESSION_IDS[0] });
            expect(result.csrfToken).toBeNull();
        }
    });

    it('locks no-store security headers and never reflects CORS', () => {
        const headers = identityResponseHeaders('req_policy');
        expect(headers.get('Cache-Control')).toBe('no-store, private');
        expect(headers.get('Referrer-Policy')).toBe('no-referrer');
        expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(headers.get('X-Request-ID')).toBe('req_policy');
        expect(headers.get('Access-Control-Allow-Origin')).toBeNull();
        expect(headers.get('Access-Control-Allow-Credentials')).toBeNull();
    });
});
