import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import {
    PREVIEW_KEY_FOUNDATION_API,
    handlePreviewKeyFoundationApi
} from '../../functions/_lib/collaboration/key-runtime-handler';

const ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const MUTATION = '33333333-3333-4333-8333-333333333333';

const DOCUMENT_ROUTES = [
    { method: 'GET', path: `/api/v1/workspaces/${WORKSPACE}/documents` },
    { method: 'POST', path: `/api/v1/workspaces/${WORKSPACE}/documents` },
    { method: 'GET', path: `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}` },
    { method: 'PUT', path: `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}` },
    { method: 'POST', path: `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}/tombstone` },
    { method: 'GET', path: `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}/revisions` },
    { method: 'GET', path: `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}/revisions/1` },
    { method: 'GET', path: `/api/v1/workspaces/${WORKSPACE}/mutations/${MUTATION}` }
] as const;

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function keyring(prefix: string, start: number): string {
    return JSON.stringify({ version: 1, activeKeyId: `${prefix}-active`, keys: {
        [`${prefix}-active`]: encodedKey(start)
    } });
}

const dependencies = Object.freeze({
    clock: Object.freeze({ now: () => 1_902_000_000_000 }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: Object.freeze({ bytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)) }),
    failures: Object.freeze({ checkpoint: async () => {} })
});

/** A preview runtime with identity enabled but no session supplied. */
function bindings(overrides: Record<string, unknown> = {}): object {
    return {
        APP_ENV: 'preview', IDENTITY_RUNTIME_MODE: 'preview-only', COLLABORATION_ENABLED: 'true',
        KEY_FOUNDATION_MODE: 'preview-only', GITHUB_OAUTH_CLIENT_ID: 'preview-client',
        GITHUB_OAUTH_CLIENT_SECRET: 'preview-secret', OAUTH_TRANSACTION_KEY: keyring('oauth', 1),
        SESSION_TOKEN_PEPPER: keyring('session', 2), CSRF_TOKEN_KEY: keyring('csrf', 3),
        RATE_LIMIT_KEY: keyring('rate', 4), COLLAB_DB: env.COLLAB_DB, ...overrides
    };
}

async function call(method: string, path: string, options: {
    origin?: string; runtime?: object;
} = {}): Promise<Response | null> {
    const headers = new Headers({ Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.9' });
    if (method !== 'GET') {
        headers.set('Origin', options.origin ?? ORIGIN);
        headers.set('Content-Type', 'application/json; charset=utf-8');
    }
    return handlePreviewKeyFoundationApi(new Request(`${ORIGIN}${path}`, {
        method, headers, ...(method === 'GET' ? {} : { body: '{}' })
    }), options.runtime ?? bindings(), dependencies);
}

describe('CF-P6-008 document route surface on the Preview runtime', () => {
    it('registers exactly the eight frozen document routes alongside the Phase 5 thirteen', () => {
        expect(PREVIEW_KEY_FOUNDATION_API.routes).toHaveLength(21);
        const documentRoutes = PREVIEW_KEY_FOUNDATION_API.routes
            .filter(route => /documents|mutations/.test(route));
        expect(documentRoutes).toHaveLength(8);
    });

    it('matches every document route rather than falling through to not-found', async () => {
        for (const route of DOCUMENT_ROUTES) {
            const response = await call(route.method, route.path);
            // Matched-but-unauthenticated, never 404/405 which would mean the
            // route was not registered at all.
            expect(response?.status, `${route.method} ${route.path}`).toBe(401);
        }
    });

    it('requires an authenticated session on every document route', async () => {
        for (const route of DOCUMENT_ROUTES) {
            const response = await call(route.method, route.path);
            const body = await response?.json<{ error: { code: string } }>();
            expect(body?.error.code, `${route.method} ${route.path}`).toBe('UNAUTHENTICATED');
        }
    });

    it('rejects a hostile Origin on every document mutation before authentication', async () => {
        const mutations = DOCUMENT_ROUTES.filter(route => route.method !== 'GET');
        expect(mutations).toHaveLength(3);
        for (const route of mutations) {
            const response = await call(route.method, route.path, { origin: 'https://evil.example' });
            expect(response?.status, `${route.method} ${route.path}`).toBe(403);
        }
    });

    it('refuses an unsupported method on a document path', async () => {
        for (const path of [
            `/api/v1/workspaces/${WORKSPACE}/documents/${DOCUMENT}/revisions`,
            `/api/v1/workspaces/${WORKSPACE}/mutations/${MUTATION}`
        ]) {
            const response = await call('DELETE', path);
            expect(response?.status).toBe(405);
        }
    });

    it('declines every document route unless the runtime mode is preview-only', async () => {
        // The handler returns null rather than a status: it does not claim the
        // route at all, so the request falls through to the disabled 503 shell.
        // Answering here would mean the document runtime was reachable outside
        // preview-only mode.
        for (const mode of ['disabled', 'local', 'production']) {
            for (const route of DOCUMENT_ROUTES) {
                const response = await call(route.method, route.path, {
                    runtime: bindings({ KEY_FOUNDATION_MODE: mode })
                });
                expect(response, `${mode} ${route.method} ${route.path}`).toBeNull();
            }
        }
    });

    it('serves no document route from a non-preview origin', async () => {
        const headers = new Headers({ Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.9' });
        const response = await handlePreviewKeyFoundationApi(
            new Request(`https://docvault-qa-document-hub.pages.dev/api/v1/workspaces/${WORKSPACE}/documents`,
                { method: 'GET', headers }), bindings(), dependencies);
        expect(response).toBeNull();
    });
});
