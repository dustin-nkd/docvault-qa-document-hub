import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    deriveCsrfToken,
    digestSessionToken,
    parseIdentityKeyring,
    type IdentityKeyring
} from '../../functions/_lib/identity';
import {
    handlePreviewCollaborationApi,
    type PreviewApiDependencies
} from '../../functions/_lib/collaboration';

const ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const NOW = 1_901_000_000_000;
const OWNER = '11111111-1111-4111-8111-111111111111';
const OWNER_DEVICE = '22222222-2222-4222-8222-222222222222';
const TARGET = '33333333-3333-4333-8333-333333333333';
const TARGET_DEVICE = '44444444-4444-4444-8444-444444444444';
const OWNER_SESSION = '55555555-5555-4555-8555-555555555555';
const TARGET_SESSION = '66666666-6666-4666-8666-666666666666';
const COOKIE = '__Host-docvault-preview-session';
const PUBLIC_JWK = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC',
    x: 'A'.repeat(43), y: 'B'.repeat(43) });

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

const OWNER_TOKEN = encodedKey(130);
const TARGET_TOKEN = encodedKey(170);

function keyring(prefix: string, start: number): string {
    return JSON.stringify({ version: 1, activeKeyId: `${prefix}-active`, keys: {
        [`${prefix}-active`]: encodedKey(start)
    } });
}

const SESSION_KEY = keyring('session', 2);
const CSRF_KEY = keyring('csrf', 3);
const SESSION_RING: IdentityKeyring = parseIdentityKeyring(SESSION_KEY);
const CSRF_RING: IdentityKeyring = parseIdentityKeyring(CSRF_KEY);

function bindings(overrides: Record<string, unknown> = {}): object {
    return {
        APP_ENV: 'preview', IDENTITY_RUNTIME_MODE: 'preview-only', COLLABORATION_ENABLED: 'false',
        GITHUB_OAUTH_CLIENT_ID: 'preview-client', GITHUB_OAUTH_CLIENT_SECRET: 'preview-secret',
        OAUTH_TRANSACTION_KEY: keyring('oauth', 1), SESSION_TOKEN_PEPPER: SESSION_KEY,
        CSRF_TOKEN_KEY: CSRF_KEY, RATE_LIMIT_KEY: keyring('rate', 4), COLLAB_DB: env.COLLAB_DB,
        ...overrides
    };
}

const dependencies: PreviewApiDependencies = Object.freeze({
    clock: Object.freeze({ now: () => NOW }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: Object.freeze({ bytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)) }),
    failures: Object.freeze({ checkpoint: async () => {} }),
    identityResolver: Object.freeze({ resolveLogin: async (login: string) => ({
        provider: 'github' as const, providerSubject: login.toLowerCase() === 'target-user' ? '9002' : '9003',
        login: login.toLowerCase()
    }) })
});

async function insertSession(id: string, userId: string, token: string): Promise<void> {
    const { digest } = await digestSessionToken(SESSION_RING, token);
    await env.COLLAB_DB.prepare(
        `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
         authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL)`
    ).bind(id, digest.buffer, userId, NOW - 10_000, NOW - 1_000, NOW - 10_000,
        NOW + 43_200_000, NOW + 604_800_000).run();
}

async function seedIdentity(): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
             status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '9001', 'owner-user', 'Owner User', NULL, 'active', ?, ?, NULL)`
        ).bind(OWNER, NOW - 20_000, NOW - 20_000),
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
             status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '9002', 'target-user', 'Target User', NULL, 'active', ?, ?, NULL)`
        ).bind(TARGET, NOW - 20_000, NOW - 20_000),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
             created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Owner device', ?, ?, 'P256-ECDH-v1', 'active', ?, NULL, NULL)`
        ).bind(OWNER_DEVICE, OWNER, PUBLIC_JWK, new Uint8Array(32).fill(1).buffer, NOW - 10_000),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
             created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Target device', ?, ?, 'P256-ECDH-v1', 'active', ?, NULL, NULL)`
        ).bind(TARGET_DEVICE, TARGET, PUBLIC_JWK, new Uint8Array(32).fill(2).buffer, NOW - 10_000)
    ]);
    await insertSession(OWNER_SESSION, OWNER, OWNER_TOKEN);
    await insertSession(TARGET_SESSION, TARGET, TARGET_TOKEN);
}

async function api(path: string, options: {
    method?: string; token?: string; device?: string; body?: object; idempotency?: string;
    origin?: string; bindings?: object;
} = {}): Promise<Response | null> {
    const method = options.method ?? 'GET';
    const headers = new Headers({ Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.20' });
    if (options.token) headers.set('Cookie', `${COOKIE}=${options.token}`);
    if (options.device) headers.set('X-DocVault-Device-ID', options.device);
    if (options.idempotency) headers.set('Idempotency-Key', options.idempotency);
    if (method !== 'GET') {
        headers.set('Origin', options.origin ?? ORIGIN);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        if (options.token) headers.set('X-CSRF-Token', await deriveCsrfToken(CSRF_RING, options.token));
    }
    return handlePreviewCollaborationApi(new Request(`${ORIGIN}${path}`, {
        method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) })
    }), options.bindings ?? bindings(), dependencies);
}

describe('CF-P4-007 preview collaboration API integration', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'preview_api_integration');
        await seedIdentity();
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM auth_rate_windows').run();
    });

    it('activates only on the exact isolated Preview runtime and keeps unknown scope out of the handler', async () => {
        expect(await api('/api/v1/workspaces', { method: 'POST', bindings: bindings({ APP_ENV: 'production' }) }))
            .toBeNull();
        expect(await api('/api/v1/workspaces', { method: 'POST', bindings: bindings({ CSRF_TOKEN_KEY: undefined }) }))
            .toBeNull();
        expect(await api('/api/v1/documents')).toBeNull();
    });

    it('fails closed on authentication, Origin, method, media type, and duplicate query drift', async () => {
        expect((await api('/api/v1/workspaces', { method: 'POST', body: { displayName: 'Denied' } }))?.status).toBe(401);
        expect((await api('/api/v1/workspaces', { method: 'POST', token: OWNER_TOKEN,
            device: OWNER_DEVICE, idempotency: crypto.randomUUID(), body: { displayName: 'Denied' },
            origin: 'https://example.test' }))?.status).toBe(403);
        const wrongMethod = await api(`/api/v1/workspaces/${crypto.randomUUID()}/members/${crypto.randomUUID()}`,
            { method: 'POST', token: OWNER_TOKEN, body: {} });
        expect(wrongMethod?.status).toBe(405);
        expect(wrongMethod?.headers.get('Allow')).toBe('PATCH, DELETE');
        expect((await api(`/api/v1/workspaces/${crypto.randomUUID()}/members?limit=1&limit=2`,
            { token: OWNER_TOKEN }))?.status).toBe(400);
    });

    it('runs workspace, opaque pagination, invitation, acceptance, and revocation through the Preview API', async () => {
        const mutation = crypto.randomUUID();
        const createOptions = { method: 'POST', token: OWNER_TOKEN, device: OWNER_DEVICE,
            idempotency: mutation, body: { displayName: 'Preview Control Plane' } };
        const created = await api('/api/v1/workspaces', createOptions);
        const replay = await api('/api/v1/workspaces', createOptions);
        expect(created?.status).toBe(201);
        expect(replay?.status).toBe(201);
        const createdBody = await created?.json<{ data: { workspaceId: string } }>();
        const replayBody = await replay?.json<{ data: { workspaceId: string } }>();
        const workspaceId = createdBody?.data.workspaceId ?? '';
        expect(workspaceId).toMatch(/^[0-9a-f-]{36}$/);
        expect(replayBody?.data.workspaceId).toBe(workspaceId);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM workspaces WHERE id = ?')
            .bind(workspaceId).first<number>('count')).toBe(1);

        const members = await api(`/api/v1/workspaces/${workspaceId}/members?limit=1`, { token: OWNER_TOKEN });
        expect(members?.status).toBe(200);
        const memberBody = await members?.json<{ data: { items: Array<{ userId: string; role: string }> };
            meta: { page: { limit: number; nextCursor: string | null } } }>();
        expect(memberBody).toMatchObject({ data: { items: [{ userId: OWNER, role: 'owner' }] },
            meta: { page: { limit: 1 } } });
        expect(memberBody?.meta.page.nextCursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
        const terminalPage = await api(`/api/v1/workspaces/${workspaceId}/members?limit=1&cursor=${
            encodeURIComponent(memberBody?.meta.page.nextCursor ?? '')}`, { token: OWNER_TOKEN });
        expect(await terminalPage?.json()).toMatchObject({ data: { items: [] },
            meta: { page: { limit: 1, nextCursor: null } } });

        const invite = await api(`/api/v1/workspaces/${workspaceId}/invitations`, {
            method: 'POST', token: OWNER_TOKEN, device: OWNER_DEVICE, idempotency: crypto.randomUUID(),
            body: { githubUsername: 'target-user', role: 'viewer' }
        });
        expect(invite?.status).toBe(201);
        const inviteBody = await invite?.json<{ data: { acceptanceUrl: string; invitation: { invitationId: string } } }>();
        const token = inviteBody?.data.acceptanceUrl.split('/').at(-1) ?? '';
        const invitationId = inviteBody?.data.invitation.invitationId ?? '';
        expect((await api('/api/v1/invitations/bootstrap', { method: 'POST', body: { token } }))?.status).toBe(200);
        expect((await api('/api/v1/invitations/accept', { method: 'POST', token: TARGET_TOKEN,
            device: TARGET_DEVICE, idempotency: crypto.randomUUID(), body: { token } }))?.status).toBe(201);
        expect((await api('/api/v1/invitations/accept', { method: 'POST', token: TARGET_TOKEN,
            device: TARGET_DEVICE, idempotency: crypto.randomUUID(), body: { token } }))?.status).toBe(404);

        const second = await api(`/api/v1/workspaces/${workspaceId}/invitations`, {
            method: 'POST', token: OWNER_TOKEN, device: OWNER_DEVICE, idempotency: crypto.randomUUID(),
            body: { githubUsername: 'another-user', role: 'editor' }
        });
        const secondBody = await second?.json<{ data: { invitation: { invitationId: string } } }>();
        const secondId = secondBody?.data.invitation.invitationId ?? invitationId;
        expect((await api(`/api/v1/workspaces/${workspaceId}/invitations/${secondId}`, {
            method: 'DELETE', token: OWNER_TOKEN, device: OWNER_DEVICE,
            idempotency: crypto.randomUUID(), body: {}
        }))?.status).toBe(204);
    });

    it('keeps authenticated control-plane reads inside the Phase 4 local p95 budget', async () => {
        const created = await api('/api/v1/workspaces', {
            method: 'POST', token: OWNER_TOKEN, device: OWNER_DEVICE,
            idempotency: crypto.randomUUID(), body: { displayName: 'Phase 4 performance baseline' }
        });
        expect(created?.status).toBe(201);
        const body = await created?.json<{ data: { workspaceId: string } }>();
        const workspaceId = body?.data.workspaceId ?? '';
        const samples: number[] = [];
        for (let index = 0; index < 20; index += 1) {
            const startedAt = performance.now();
            const response = await api(`/api/v1/workspaces/${workspaceId}/members?limit=50`, {
                token: OWNER_TOKEN
            });
            samples.push(performance.now() - startedAt);
            expect(response?.status).toBe(200);
        }
        samples.sort((left, right) => left - right);
        const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
        expect(p95).toBeLessThan(250);
    });
});
