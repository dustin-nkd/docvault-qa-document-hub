import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { onRequest } from '../../functions/api/v1/[[path]]';

const ORIGIN = 'https://codex-cf-p3-preview-v2.docvault-qa-document-hub.pages.dev';

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function keyring(prefix: string, start: number): string {
    return JSON.stringify({ version: 1, activeKeyId: `${prefix}-active`, keys: {
        [`${prefix}-active`]: encodedKey(start)
    } });
}

type PreviewBindings = Env & {
    readonly ASSETS: { readonly fetch: typeof fetch };
    readonly GITHUB_OAUTH_CLIENT_SECRET: string;
    readonly OAUTH_TRANSACTION_KEY: string;
    readonly SESSION_TOKEN_PEPPER: string;
    readonly CSRF_TOKEN_KEY: string;
    readonly RATE_LIMIT_KEY: string;
};

function bindings(): PreviewBindings {
    return {
        APP_ENV: 'preview',
        ORIGIN_POLICY_MODE: 'preview',
        CANONICAL_PRODUCTION_ORIGIN: 'https://docvault-qa-document-hub.pages.dev',
        COLLABORATION_ENABLED: 'true',
        KEY_FOUNDATION_MODE: 'preview-only',
        IDENTITY_RUNTIME_MODE: 'preview-only',
        GITHUB_OAUTH_CLIENT_ID: 'Ov23liT50KOwBmEGu7bH',
        GITHUB_OAUTH_CLIENT_SECRET: 'preview-secret',
        OAUTH_TRANSACTION_KEY: keyring('oauth', 1),
        SESSION_TOKEN_PEPPER: keyring('session', 2),
        CSRF_TOKEN_KEY: keyring('csrf', 3),
        RATE_LIMIT_KEY: keyring('rate', 4),
        COLLAB_DB: env.COLLAB_DB,
        AUTH_BURST_LIMITER: { limit: async () => ({ success: true }) },
        ASSETS: { fetch }
    };
}

function context(path: string, method = 'GET'): EventContext<Env, 'path', Record<string, unknown>> {
    return {
        request: new Request(`${ORIGIN}${path}`, {
            method,
            headers: { Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.60' }
        }),
        functionPath: '/api/v1/[[path]]',
        waitUntil: () => {},
        passThroughOnException: () => {},
        next: async () => new Response(null, { status: 404 }),
        env: bindings(),
        params: { path: path.split('/').filter(Boolean) },
        data: {}
    };
}

describe('versioned API composition', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'api_dispatch');
    });

    it('lets the collaboration handler own GET /workspaces after the key handler declines it', async () => {
        const response = await onRequest(context('/api/v1/workspaces'));
        expect(response.status).toBe(401);
        expect(response.headers.get('Allow')).toBeNull();
        await expect(response.json()).resolves.toMatchObject({
            error: { code: 'UNAUTHENTICATED' }
        });
    });

    it('keeps the terminal API shell responsible for unsupported key-route methods', async () => {
        const response = await onRequest(context(
            '/api/v1/workspaces/11111111-1111-4111-8111-111111111111/documents', 'DELETE'));
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET, POST');
    });
});
