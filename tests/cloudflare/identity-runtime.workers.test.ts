import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    handleIdentityRuntime,
    type GitHubOAuthAdapter,
    type IdentityRuntimeDependencies,
    type RandomBytesSource
} from '../../functions/_lib/identity';

const ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const SUBJECT = '123456789';

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function keyring(prefix: string, start: number): string {
    return JSON.stringify({ version: 1, activeKeyId: `${prefix}-active`, keys: {
        [`${prefix}-active`]: encodedKey(start), [`${prefix}-previous`]: encodedKey(start + 40)
    } });
}

function runtimeBindings(overrides: Record<string, unknown> = {}): object {
    return {
        APP_ENV: 'preview', IDENTITY_RUNTIME_MODE: 'preview-only', COLLABORATION_ENABLED: 'false',
        GITHUB_OAUTH_CLIENT_ID: 'preview-client', GITHUB_OAUTH_CLIENT_SECRET: 'preview-secret',
        OAUTH_TRANSACTION_KEY: keyring('oauth', 1), SESSION_TOKEN_PEPPER: keyring('session', 2),
        CSRF_TOKEN_KEY: keyring('csrf', 3), RATE_LIMIT_KEY: keyring('rate', 4),
        PREVIEW_ALLOWED_GITHUB_SUBJECTS: SUBJECT,
        COLLAB_DB: env.COLLAB_DB, AUTH_BURST_SERVICE: { limit: async () => ({ success: true }) },
        ...overrides
    };
}

const random: RandomBytesSource = Object.freeze({
    bytes(length: number): Uint8Array { return crypto.getRandomValues(new Uint8Array(length)); }
});

function dependencies(subject = SUBJECT): IdentityRuntimeDependencies {
    const provider: GitHubOAuthAdapter = Object.freeze({ resolveIdentity: async () => ({
        provider: 'github' as const, providerSubject: subject, login: 'synthetic-preview',
        displayName: 'Synthetic Preview', avatarUrl: null
    }) });
    return {
        clock: { now: () => 1_900_800_000_000 }, ids: { uuid: () => crypto.randomUUID() }, random,
        failures: { checkpoint: () => {} }, provider: () => provider,
        events: { emit: () => {} }
    };
}

function request(path: string, init: RequestInit = {}): Request {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    headers.set('CF-Connecting-IP', '203.0.113.7');
    if (init.method === 'POST') {
        headers.set('Origin', ORIGIN);
        headers.set('Content-Type', 'application/json; charset=utf-8');
    }
    return new Request(`${ORIGIN}${path}`, { ...init, headers });
}

describe('CF-P3-008 isolated preview identity runtime', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'identity_runtime_migrations');
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM auth_rate_windows').run();
        await env.COLLAB_DB.prepare('DELETE FROM sessions').run();
        await env.COLLAB_DB.prepare('DELETE FROM oauth_transactions').run();
        await env.COLLAB_DB.prepare('DELETE FROM users').run();
    });

    it('keeps production, incomplete preview, and every business route on the disabled boundary', async () => {
        expect(await handleIdentityRuntime(request('/api/v1/session'), runtimeBindings({ APP_ENV: 'production' })))
            .toBeNull();
        expect(await handleIdentityRuntime(request('/api/v1/session'), runtimeBindings({ RATE_LIMIT_KEY: undefined })))
            .toBeNull();
        expect(await handleIdentityRuntime(request('/api/v1/workspaces'), runtimeBindings())).toBeNull();
    });

    it('creates a bounded OAuth transaction and returns only the GitHub authorization URL', async () => {
        const response = await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in', returnPath: '/?guest=1' })
        }), runtimeBindings(), dependencies());
        expect(response?.status).toBe(201);
        const body = await response?.json<{ authorizationUrl: string; expiresAt: number }>();
        const authorization = new URL(body?.authorizationUrl ?? '');
        expect(authorization.origin).toBe('https://github.com');
        expect(authorization.pathname).toBe('/login/oauth/authorize');
        expect(authorization.searchParams.get('client_id')).toBe('preview-client');
        expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM oauth_transactions')
            .first<number>('count')).toBe(1);
    });

    it('sends only the HMAC digest through the Preview service binding and fails closed on response drift', async () => {
        let captured: Request | undefined;
        const service = { fetch: async (input: Request) => {
            captured = input;
            return new Response('{"success":true}', {
                status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        } };
        const response = await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in' })
        }), runtimeBindings({ AUTH_BURST_SERVICE: service }), dependencies());
        expect(response?.status).toBe(201);
        expect(captured?.method).toBe('POST');
        expect(new URL(captured?.url ?? '').pathname).toBe('/v1/limit');
        expect(await captured?.json()).toEqual({ key: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
        expect(await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in' })
        }), runtimeBindings({ AUTH_BURST_SERVICE: {
            fetch: async () => new Response('{"success":true,"extra":true}', { status: 200 })
        } }), dependencies())).toMatchObject({ status: 429 });
    });

    it('prefers the Fetcher contract when a service binding also exposes RPC-shaped methods', async () => {
        let fetchCalls = 0;
        const response = await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in' })
        }), runtimeBindings({ AUTH_BURST_SERVICE: {
            fetch: async () => {
                fetchCalls += 1;
                return new Response('{"success":true}', { status: 200 });
            },
            limit: async () => { throw new Error('RPC_SHOULD_NOT_BE_USED'); }
        } }), dependencies());
        expect(response?.status).toBe(201);
        expect(fetchCalls).toBe(1);
    });

    it('completes login only for an allowlisted numeric subject and issues the isolated host cookie', async () => {
        const deps = dependencies();
        const transaction = await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in', returnPath: '/' })
        }), runtimeBindings(), deps);
        const created = await transaction?.json<{ authorizationUrl: string }>();
        const state = new URL(created?.authorizationUrl ?? '').searchParams.get('state');
        const callback = await handleIdentityRuntime(request(
            `/api/v1/oauth/github/callback?code=synthetic-code&state=${state}`), runtimeBindings(), deps);
        expect(callback?.status).toBe(303);
        expect(callback?.headers.get('Location')).toMatch(/^https:\/\/codex-cf-p3-preview\..+#auth-result=complete-/);
        expect(callback?.headers.get('Set-Cookie')).toContain('__Host-docvault-preview-session=');
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(1);
    });

    it('uses the same generic callback redirect and creates no authority for a non-allowlisted subject', async () => {
        const creator = dependencies();
        const transaction = await handleIdentityRuntime(request('/api/v1/oauth/github/transactions', {
            method: 'POST', body: JSON.stringify({ purpose: 'sign_in' })
        }), runtimeBindings(), creator);
        const created = await transaction?.json<{ authorizationUrl: string }>();
        const state = new URL(created?.authorizationUrl ?? '').searchParams.get('state');
        const callback = await handleIdentityRuntime(request(
            `/api/v1/oauth/github/callback?code=synthetic-code&state=${state}`), runtimeBindings(), dependencies('999'));
        expect(callback?.status).toBe(303);
        expect(callback?.headers.get('Location')).toMatch(/#auth-result=unavailable-/);
        expect(callback?.headers.has('Set-Cookie')).toBe(false);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count')).toBe(0);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(0);
    });
});
