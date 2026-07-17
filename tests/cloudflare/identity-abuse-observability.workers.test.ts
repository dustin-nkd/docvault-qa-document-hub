import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    cleanupIdentityRateWindows,
    createIdentityOperationalEvent,
    encodeBase64Url,
    enforceIdentityRateLimit,
    GitHubOAuthAdapterError,
    IdentityRateLimitError,
    parseIdentityKeyring,
    withProviderCircuit,
    type GitHubOAuthAdapter,
    type ProviderCircuit
} from '../../functions/_lib/identity';

const keyring = parseIdentityKeyring(JSON.stringify({
    version: 1,
    activeKeyId: 'rate',
    keys: { rate: encodeBase64Url(Uint8Array.from({ length: 32 }, (_, index) => index + 1)) }
}));

describe('CF-P3-007 abuse controls and privacy-safe operations', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'identity_abuse_migrations');
    });

    it('atomically caps the authoritative OAuth window at twenty attempts', async () => {
        const attempts = await Promise.allSettled(Array.from({ length: 25 }, () => enforceIdentityRateLimit({
            database: env.COLLAB_DB, keyring, tier: 'oauth_source',
            discriminator: 'synthetic-source-overload', serverTime: 600_001,
            burstLimiter: { limit: async () => ({ success: true }) }
        })));
        expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(20);
        const rejected = attempts.filter(result => result.status === 'rejected');
        expect(rejected).toHaveLength(5);
        expect(rejected.every(result => result.reason instanceof IdentityRateLimitError
            && result.reason.code === 'RATE_LIMITED')).toBe(true);
        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO auth_rate_windows
                (key_digest, route_family, window_started_at, attempt_count, expires_at)
             VALUES (?, 'oauth_source', 600001, 21, 1800001)`
        ).bind(new Uint8Array(32).buffer).run()).rejects.toThrow();
    });

    it('uses the edge limiter only as an early OAuth burst shield and fails closed', async () => {
        await expect(enforceIdentityRateLimit({
            database: env.COLLAB_DB, keyring, tier: 'oauth_source', discriminator: 'missing-binding',
            serverTime: 1_200_001
        })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
        await expect(enforceIdentityRateLimit({
            database: env.COLLAB_DB, keyring, tier: 'oauth_source', discriminator: 'burst-denied',
            serverTime: 1_200_001, burstLimiter: { limit: async () => ({ success: false }) }
        })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 600 });
        await expect(enforceIdentityRateLimit({
            database: env.COLLAB_DB, keyring, tier: 'oauth_source', discriminator: 'burst-error',
            serverTime: 1_200_001, burstLimiter: { limit: async () => { throw new Error('binding-canary'); } }
        })).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 60 });
    });

    it('separates user and source tiers without storing their raw discriminators', async () => {
        await enforceIdentityRateLimit({ database: env.COLLAB_DB, keyring, tier: 'identity_source',
            discriminator: '203.0.113.44', serverTime: 1_800_001 });
        await enforceIdentityRateLimit({ database: env.COLLAB_DB, keyring, tier: 'identity_user',
            discriminator: '11111111-1111-4111-8111-111111111111', serverTime: 1_800_001 });
        const rows = await env.COLLAB_DB.prepare(
            'SELECT key_digest, route_family, attempt_count FROM auth_rate_windows WHERE window_started_at = 1800000'
        ).all<{ key_digest: unknown; route_family: string; attempt_count: number }>();
        expect(rows.results).toHaveLength(2);
        expect(rows.results.every(row => (row.key_digest instanceof ArrayBuffer
            ? row.key_digest.byteLength === 32 : Array.isArray(row.key_digest) && row.key_digest.length === 32)
            && row.attempt_count === 1)).toBe(true);
        expect(JSON.stringify(rows.results)).not.toContain('203.0.113.44');
        expect(JSON.stringify(rows.results)).not.toContain('11111111-1111-4111-8111-111111111111');
    });

    it('cleans only expired windows with a bounded batch', async () => {
        expect(await cleanupIdentityRateWindows(env.COLLAB_DB, 3_100_001, 2)).toBe(2);
        await expect(cleanupIdentityRateWindows(env.COLLAB_DB, 3_100_001, 101)).rejects.toThrow();
    });

    it('emits an exact low-cardinality operational event with no extensible fields', () => {
        const event = createIdentityOperationalEvent({
            requestId: '11111111-1111-4111-8111-111111111111',
            route: '/api/v1/oauth/github/callback', method: 'GET', outcome: 'provider_unavailable',
            status: 503, latencyMs: 8_000, environment: 'preview'
        });
        expect(Object.keys(event).sort()).toEqual([
            'environment', 'latencyMs', 'method', 'outcome', 'requestId', 'route', 'status'
        ]);
        expect(JSON.stringify(event)).not.toMatch(/token|cookie|email|login|state|pkce|ip|digest/i);
    });

    it('rejects unbounded or attacker-controlled observability dimensions', () => {
        expect(() => createIdentityOperationalEvent({
            requestId: 'incoming-request-id', route: '/api/v1/session', method: 'GET',
            outcome: 'success', status: 200, latencyMs: 1, environment: 'preview'
        })).toThrow('IDENTITY_OBSERVABILITY_INVALID');
        const extraDimension = {
            requestId: '11111111-1111-4111-8111-111111111111', route: '/api/v1/session' as const,
            method: 'GET' as const, outcome: 'success' as const, status: 200, latencyMs: 1,
            environment: 'preview' as const, ip: '203.0.113.44'
        };
        expect(() => createIdentityOperationalEvent(extraDimension)).toThrow('IDENTITY_OBSERVABILITY_INVALID');
    });

    it('accepts only the closed privacy-safe provider outcome categories', () => {
        for (const outcome of ['provider_credentials_rejected', 'provider_redirect_rejected',
            'provider_verification_rejected', 'provider_identity_rejected'] as const) {
            expect(createIdentityOperationalEvent({
                requestId: '11111111-1111-4111-8111-111111111111',
                route: '/api/v1/oauth/github/callback', method: 'GET', outcome,
                status: 303, latencyMs: 1, environment: 'preview'
            }).outcome).toBe(outcome);
        }
        expect(() => createIdentityOperationalEvent({
            requestId: '11111111-1111-4111-8111-111111111111',
            route: '/api/v1/oauth/github/callback', method: 'GET',
            outcome: 'provider_attacker_controlled' as never, status: 303, latencyMs: 1, environment: 'preview'
        })).toThrow('IDENTITY_OBSERVABILITY_INVALID');
    });

    it('short-circuits provider calls while open and preserves generic errors', async () => {
        let providerCalls = 0;
        const provider: GitHubOAuthAdapter = { resolveIdentity: async () => {
            providerCalls += 1;
            throw new Error('provider-token-canary');
        } };
        const openCircuit: ProviderCircuit = {
            beforeRequest: async () => 'open', record: async () => undefined
        };
        await expect(withProviderCircuit(provider, openCircuit).resolveIdentity({
            code: 'code', redirectUri: 'https://example.test/callback', pkceVerifier: 'verifier'
        })).rejects.toBeInstanceOf(GitHubOAuthAdapterError);
        expect(providerCalls).toBe(0);
    });

    it('records provider success/failure without replaying a request', async () => {
        const outcomes: string[] = [];
        let calls = 0;
        const circuit: ProviderCircuit = {
            beforeRequest: async () => 'closed', record: async outcome => { outcomes.push(outcome); }
        };
        const provider: GitHubOAuthAdapter = { resolveIdentity: async () => {
            calls += 1;
            return { provider: 'github', providerSubject: '123', login: 'synthetic',
                displayName: null, avatarUrl: null };
        } };
        await withProviderCircuit(provider, circuit).resolveIdentity({
            code: 'code', redirectUri: 'https://example.test/callback', pkceVerifier: 'verifier'
        });
        expect(calls).toBe(1);
        expect(outcomes).toEqual(['success']);
    });
});
