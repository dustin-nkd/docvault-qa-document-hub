import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    completeOAuthCallback,
    createGitHubOAuthAdapter,
    createOAuthTransaction,
    digestSessionToken,
    encodeBase64Url,
    GITHUB_OAUTH_CONSTANTS,
    OAuthCallbackError,
    parseIdentityKeyring,
    type GitHubHttpTransport,
    type GitHubIdentity,
    type GitHubOAuthAdapter,
    type GitHubOAuthAdapterDependencies,
    type OAuthCallbackDependencies,
    type RandomBytesSource
} from '../../functions/_lib/identity';

const UUIDS = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
];

const key = (start: number): string => encodeBase64Url(
    Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256)
);
const OAUTH_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'oauth', keys: { oauth: key(1) }
}));
const SESSION_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'session', keys: { session: key(101) }
}));
const CALLBACK_ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';

function random(seed: number): RandomBytesSource {
    let call = 0;
    return {
        bytes(length: number): Uint8Array {
            const start = seed + call * 37;
            call += 1;
            return Uint8Array.from({ length }, (_, index) => (start + index) % 256);
        }
    };
}

function callbackDependencies(options: {
    now: { value: number };
    uuids: readonly string[];
    seed: number;
    failAt?: string;
}): OAuthCallbackDependencies {
    let id = 0;
    return {
        clock: { now: () => options.now.value },
        ids: { uuid: () => options.uuids[id++] ?? 'invalid-id' },
        random: random(options.seed),
        failures: {
            checkpoint(name) {
                if (name === options.failAt) throw new Error('synthetic-callback-fault-canary');
            }
        }
    };
}

async function transaction(options: {
    now: number;
    id: string;
    seed: number;
    purpose?: 'sign_in' | 'reauthenticate';
    initiatingSessionId?: string;
    initiatingUserId?: string;
}) {
    return createOAuthTransaction(env.COLLAB_DB, {
        keyring: OAUTH_RING,
        purpose: options.purpose ?? 'sign_in',
        returnPath: '/focus?owner=me',
        initiatingSessionId: options.initiatingSessionId ?? null,
        initiatingUserId: options.initiatingUserId ?? null
    }, callbackDependencies({ now: { value: options.now }, uuids: [options.id], seed: options.seed }));
}

function identity(subject = '100000000000000001', login = 'qa-user'): GitHubIdentity {
    return Object.freeze({
        provider: 'github', providerSubject: subject, login,
        displayName: 'QA User', avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4'
    });
}

function provider(value: GitHubIdentity, beforeReturn?: () => void | Promise<void>): GitHubOAuthAdapter {
    return Object.freeze({
        async resolveIdentity() {
            await beforeReturn?.();
            return value;
        }
    });
}

async function insertUserAndSession(options: {
    userId: string;
    sessionId: string;
    subject: string;
    now: number;
    tokenDigest?: ArrayBuffer;
}): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
             status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, 'existing-user', NULL, NULL, 'active', ?, ?, NULL)`
        ).bind(options.userId, options.subject, options.now, options.now),
        env.COLLAB_DB.prepare(
            `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
             authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL)`
        ).bind(options.sessionId, options.tokenDigest ?? new Uint8Array(32).fill(7).buffer,
            options.userId, options.now, options.now, options.now,
            options.now + 43_200_000, options.now + 604_800_000)
    ]);
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
    });
}

describe('CF-P3-004 GitHub provider adapter', () => {
    it('exchanges by POST, revalidates numeric identity, and never returns the provider token', async () => {
        const calls: { url: string; init: RequestInit; timeout: number }[] = [];
        const responses = [
            json({ access_token: 'provider-token-canary', token_type: 'bearer', scope: '' }),
            json({ id: 1000000001, login: 'octocat', name: ' Octo Cat ',
                avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4', email: 'ignored@example.test' })
        ];
        const transport: GitHubHttpTransport = {
            async request(url, init, timeout) {
                calls.push({ url, init, timeout });
                return responses.shift() ?? json({}, 500);
            }
        };
        const adapter = createGitHubOAuthAdapter({ clientId: 'client-id', clientSecret: 'client-secret-canary' }, {
            transport, clock: { now: () => 1_900_000_000_000 }, random: random(1),
            sleep: { wait: async () => {} }
        });
        const result = await adapter.resolveIdentity({
            code: 'authorization_code', redirectUri: GITHUB_OAUTH_CONSTANTS.callbackUri,
            pkceVerifier: encodeBase64Url(new Uint8Array(64).fill(9))
        });
        expect(result).toEqual({ provider: 'github', providerSubject: '1000000001',
            login: 'octocat', displayName: 'Octo Cat',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4' });
        expect(JSON.stringify(result)).not.toContain('provider-token-canary');
        expect(calls.map(call => call.url)).toEqual([
            GITHUB_OAUTH_CONSTANTS.tokenEndpoint, GITHUB_OAUTH_CONSTANTS.identityEndpoint
        ]);
        expect(calls.map(call => call.timeout)).toEqual([5_000, 5_000]);
        const exchangeBody = new URLSearchParams(String(calls[0].init.body));
        expect(exchangeBody.get('client_secret')).toBe('client-secret-canary');
        expect(calls[0].url).not.toContain('client-secret-canary');
        expect(new Headers(calls[1].init.headers).get('Authorization')).toBe('Bearer provider-token-canary');
        expect(new Headers(calls[1].init.headers).get('X-GitHub-Api-Version')).toBe('2026-03-10');
        expect(calls.every(call => call.init.redirect === 'error')).toBe(true);
    });

    it('retries identity once with a capped delay inside the eight-second provider budget', async () => {
        const now = { value: 1_900_000_100_000 };
        const timeouts: number[] = [];
        const sleeps: number[] = [];
        const responses = [
            json({ access_token: 'provider-token', token_type: 'bearer' }),
            json({ message: 'busy' }, 503, { 'Retry-After': '9' }),
            json({ id: 42, login: 'retry-user', name: null, avatar_url: null })
        ];
        const adapter = createGitHubOAuthAdapter({ clientId: 'client-id', clientSecret: 'client-secret' }, {
            transport: {
                async request(_url, _init, timeout) {
                    timeouts.push(timeout);
                    if (timeouts.length === 1) now.value += 3_000;
                    return responses.shift() ?? json({}, 500);
                }
            },
            clock: { now: () => now.value }, random: random(2),
            sleep: { async wait(delay) { sleeps.push(delay); now.value += delay; } }
        });
        await expect(adapter.resolveIdentity({
            code: 'code', redirectUri: GITHUB_OAUTH_CONSTANTS.callbackUri,
            pkceVerifier: encodeBase64Url(new Uint8Array(64).fill(10))
        })).resolves.toMatchObject({ providerSubject: '42', login: 'retry-user' });
        expect(sleeps).toEqual([1_000]);
        expect(timeouts).toEqual([5_000, 5_000, 4_000]);
    });

    it('fails closed without token-exchange retry for malformed, oversized, or non-numeric responses', async () => {
        const cases: Response[][] = [
            [json({ message: 'unavailable' }, 503)],
            [json({ access_token: 'provider-token', token_type: 'bearer' }),
                json({ id: '42', login: 'string-id' })],
            [json({ access_token: 'provider-token', token_type: 'bearer' }),
                json({ id: 42, login: 'user' }, 200, { 'Content-Length': '20000' })]
        ];
        for (const responses of cases) {
            let calls = 0;
            const adapter = createGitHubOAuthAdapter({ clientId: 'client-id', clientSecret: 'client-secret' }, {
                transport: { async request() { calls += 1; return responses.shift() ?? json({}, 500); } },
                clock: { now: () => 1_900_000_200_000 }, random: random(3), sleep: { wait: async () => {} }
            });
            await expect(adapter.resolveIdentity({ code: 'code', redirectUri: GITHUB_OAUTH_CONSTANTS.callbackUri,
                pkceVerifier: encodeBase64Url(new Uint8Array(64).fill(11)) }))
                .rejects.toMatchObject({ code: 'GITHUB_OAUTH_UNAVAILABLE' });
            expect(calls).toBeLessThanOrEqual(2);
        }
    });

    it('classifies only the closed GitHub token error codes without retaining provider descriptions', async () => {
        const cases = [
            ['incorrect_client_credentials', 'credentials_rejected'],
            ['redirect_uri_mismatch', 'redirect_rejected'],
            ['bad_verification_code', 'verification_rejected'],
            ['unverified_user_email', 'identity_rejected'],
            ['future_provider_error', 'unavailable']
        ] as const;
        for (const [providerError, category] of cases) {
            const adapter = createGitHubOAuthAdapter({ clientId: 'client-id', clientSecret: 'client-secret' }, {
                transport: { async request() { return json({ error: providerError,
                    error_description: 'provider-description-canary', error_uri: 'https://provider.test/canary' }); } },
                clock: { now: () => 1_900_000_300_000 }, random: random(4), sleep: { wait: async () => {} }
            });
            let failure: unknown;
            try {
                await adapter.resolveIdentity({ code: 'code', redirectUri: GITHUB_OAUTH_CONSTANTS.callbackUri,
                    pkceVerifier: encodeBase64Url(new Uint8Array(64).fill(12)) });
            } catch (error) {
                failure = error;
            }
            expect(failure).toMatchObject({ code: 'GITHUB_OAUTH_UNAVAILABLE', category });
            expect(JSON.stringify(failure)).not.toMatch(/provider-description-canary|provider\.test/);
        }
    });
});

describe('CF-P3-004 atomic callback authority', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'oauth_callback_migrations');
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM oauth_transactions').run();
        await env.COLLAB_DB.prepare('DELETE FROM sessions').run();
        await env.COLLAB_DB.prepare('DELETE FROM users').run();
    });

    it('atomically consumes sign-in, upserts numeric identity, and stores only a session digest', async () => {
        const now = { value: 1_900_100_000_000 };
        const created = await transaction({ now: now.value, id: UUIDS[0], seed: 10 });
        now.value += 1_000;
        const result = await completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity()), state: created.state, code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[1], UUIDS[2]], seed: 20 }));
        expect(result).toMatchObject({ userId: UUIDS[1], sessionId: UUIDS[2],
            providerSubject: '100000000000000001', purpose: 'sign_in', returnPath: '/focus?owner=me' });
        expect(result.sessionToken).toHaveLength(43);
        const rows = await env.COLLAB_DB.prepare(
            `SELECT o.status, u.provider_subject, u.display_login, s.user_id, s.revoked_at,
                    length(s.token_digest) AS digest_length
             FROM oauth_transactions o, users u, sessions s
             WHERE o.id = ? AND u.id = ? AND s.id = ?`
        ).bind(UUIDS[0], UUIDS[1], UUIDS[2]).first<Record<string, unknown>>();
        expect(rows).toMatchObject({ status: 'consumed', provider_subject: '100000000000000001',
            display_login: 'qa-user', user_id: UUIDS[1], revoked_at: null, digest_length: 32 });
        expect(JSON.stringify(rows)).not.toContain(result.sessionToken);
    });

    it('keeps identity stable across mutable login changes', async () => {
        const now = { value: 1_900_100_100_000 };
        const first = await transaction({ now: now.value, id: UUIDS[3], seed: 11 });
        now.value += 1;
        const initial = await completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('42', 'old-login')), state: first.state, code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[4], UUIDS[5]], seed: 21 }));
        const second = await transaction({ now: now.value + 1, id: UUIDS[6], seed: 12 });
        now.value += 2;
        const changed = await completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('42', 'new-login')), state: second.state, code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[7], UUIDS[8]], seed: 22 }));
        expect(changed.userId).toBe(initial.userId);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT display_login FROM users WHERE id = ?')
            .bind(initial.userId).first<string>('display_login')).toBe('new-login');
    });

    it('allows exactly one concurrent callback to create authority and rejects replay', async () => {
        const now = { value: 1_900_100_200_000 };
        const created = await transaction({ now: now.value, id: UUIDS[0], seed: 13 });
        now.value += 1;
        let arrivals = 0;
        let release: (() => void) | undefined;
        const barrier = new Promise<void>(resolve => { release = resolve; });
        const racingProvider = provider(identity('43'), async () => {
            arrivals += 1;
            if (arrivals === 2) release?.();
            await barrier;
        });
        const attempts = await Promise.allSettled([
            completeOAuthCallback(env.COLLAB_DB, {
                oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
                provider: racingProvider, state: created.state, code: 'code-a', callbackOrigin: CALLBACK_ORIGIN
            }, callbackDependencies({ now, uuids: [UUIDS[1], UUIDS[2]], seed: 23 })),
            completeOAuthCallback(env.COLLAB_DB, {
                oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
                provider: racingProvider, state: created.state, code: 'code-b', callbackOrigin: CALLBACK_ORIGIN
            }, callbackDependencies({ now, uuids: [UUIDS[3], UUIDS[4]], seed: 24 }))
        ]);
        expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(attempt => attempt.status === 'rejected')).toHaveLength(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(1);
        await expect(completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('43')), state: created.state, code: 'replay', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[5], UUIDS[6]], seed: 25 })))
            .rejects.toEqual(new OAuthCallbackError());
    });

    it('rolls back transaction and user when the session insert conflicts', async () => {
        const now = { value: 1_900_100_300_000 };
        const created = await transaction({ now: now.value, id: UUIDS[0], seed: 14 });
        now.value += 1;
        const rawToken = encodeBase64Url(Uint8Array.from({ length: 32 }, (_, index) => (30 + index) % 256));
        const { digest } = await digestSessionToken(SESSION_RING, rawToken);
        await insertUserAndSession({ userId: UUIDS[1], sessionId: UUIDS[2], subject: '77',
            now: now.value, tokenDigest: Uint8Array.from(digest).buffer });
        await expect(completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('78')), state: created.state, code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[3], UUIDS[4]], seed: 30 })))
            .rejects.toMatchObject({ code: 'OAUTH_CALLBACK_FAILED' });
        expect(await env.COLLAB_DB.prepare('SELECT status FROM oauth_transactions WHERE id = ?')
            .bind(UUIDS[0]).first<string>('status')).toBe('pending');
        expect(await env.COLLAB_DB.prepare("SELECT COUNT(*) AS count FROM users WHERE provider_subject = '78'")
            .first<number>('count')).toBe(0);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(1);
    });

    it('reauthenticates the same numeric subject and atomically rotates its live predecessor', async () => {
        const now = { value: 1_900_100_400_000 };
        await insertUserAndSession({ userId: UUIDS[5], sessionId: UUIDS[6], subject: '88', now: now.value });
        const created = await transaction({ now: now.value + 1, id: UUIDS[7], seed: 15,
            purpose: 'reauthenticate', initiatingSessionId: UUIDS[6], initiatingUserId: UUIDS[5] });
        now.value += 2;
        const result = await completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('88', 'renamed-user')), state: created.state,
            code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[8], UUIDS[9]], seed: 31 }));
        expect(result).toMatchObject({ userId: UUIDS[5], sessionId: UUIDS[9], purpose: 'reauthenticate' });
        expect(await env.COLLAB_DB.prepare('SELECT revoke_reason FROM sessions WHERE id = ?')
            .bind(UUIDS[6]).first<string>('revoke_reason')).toBe('reauthenticated');
        expect(await env.COLLAB_DB.prepare('SELECT display_login FROM users WHERE id = ?')
            .bind(UUIDS[5]).first<string>('display_login')).toBe('renamed-user');
    });

    it('rolls back wrong-subject reauthentication without consuming or revoking authority', async () => {
        const now = { value: 1_900_100_500_000 };
        await insertUserAndSession({ userId: UUIDS[5], sessionId: UUIDS[6], subject: '89', now: now.value });
        const created = await transaction({ now: now.value + 1, id: UUIDS[7], seed: 16,
            purpose: 'reauthenticate', initiatingSessionId: UUIDS[6], initiatingUserId: UUIDS[5] });
        now.value += 2;
        await expect(completeOAuthCallback(env.COLLAB_DB, {
            oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
            provider: provider(identity('90')), state: created.state, code: 'code', callbackOrigin: CALLBACK_ORIGIN
        }, callbackDependencies({ now, uuids: [UUIDS[8], UUIDS[9]], seed: 32 })))
            .rejects.toMatchObject({ code: 'OAUTH_CALLBACK_FAILED' });
        expect(await env.COLLAB_DB.prepare('SELECT status FROM oauth_transactions WHERE id = ?')
            .bind(UUIDS[7]).first<string>('status')).toBe('pending');
        expect(await env.COLLAB_DB.prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .bind(UUIDS[6]).first<number | null>('revoked_at')).toBeNull();
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(1);
    });

    it('creates no authority on provider, expiry, or injected pre-batch failure and never echoes canaries', async () => {
        const cases = [
            { id: UUIDS[0], seed: 17, provider: { resolveIdentity: async () => { throw new Error('provider-token-canary'); } }, advance: 1, failAt: undefined },
            { id: UUIDS[1], seed: 18, provider: provider(identity('91'), () => { now.value += 600_000; }), advance: 1, failAt: undefined },
            { id: UUIDS[2], seed: 19, provider: provider(identity('92')), advance: 1, failAt: 'oauth.callback.before-batch' }
        ] as const;
        const now = { value: 1_900_100_600_000 };
        for (const item of cases) {
            const created = await transaction({ now: now.value, id: item.id, seed: item.seed });
            now.value += item.advance;
            const attempt = completeOAuthCallback(env.COLLAB_DB, {
                oauthTransactionKey: OAUTH_RING, sessionTokenPepper: SESSION_RING,
                provider: item.provider, state: created.state, code: 'code-canary', callbackOrigin: CALLBACK_ORIGIN
            }, callbackDependencies({ now, uuids: [UUIDS[10], UUIDS[11]], seed: 40, failAt: item.failAt }));
            await expect(attempt).rejects.toEqual(new OAuthCallbackError());
            await expect(attempt).rejects.not.toThrow(/provider-token-canary|code-canary/);
            expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count')).toBe(0);
            expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(0);
            now.value += 1_000_000;
        }
    });
});
