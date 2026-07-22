import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { deriveCsrfToken, digestSessionToken, parseIdentityKeyring,
    type IdentityKeyring } from '../../functions/_lib/identity';
import { parsePublicJwk, type CanonicalPublicJwk } from '../../functions/_lib/e2ee/jwk';
import { generateWorkspaceDek, unwrapWorkspaceKey, wrapWorkspaceKey,
    type WorkspaceEnvelopeAad, type WorkspaceKeyEnvelope } from '../../functions/_lib/e2ee/primitives';
import { handlePreviewKeyFoundationApi, type PreviewKeyApiDependencies } from '../../functions/_lib/collaboration';

const ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';
const NOW = 1_902_000_000_000;
const OWNER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const OWNER_SESSION = '33333333-3333-4333-8333-333333333333';
const TARGET_SESSION = '44444444-4444-4444-8444-444444444444';
const COOKIE = '__Host-docvault-preview-session';

function encodedKey(start: number): string {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function keyring(prefix: string, start: number): string {
    return JSON.stringify({ version: 1, activeKeyId: `${prefix}-active`, keys: {
        [`${prefix}-active`]: encodedKey(start)
    } });
}

const OWNER_TOKEN = encodedKey(80);
const TARGET_TOKEN = encodedKey(120);
const SESSION_KEY = keyring('session', 2);
const CSRF_KEY = keyring('csrf', 3);
const SESSION_RING: IdentityKeyring = parseIdentityKeyring(SESSION_KEY);
const CSRF_RING: IdentityKeyring = parseIdentityKeyring(CSRF_KEY);

interface TestDevice {
    readonly privateKey: CryptoKey;
    readonly publicJwk: CanonicalPublicJwk;
    readonly fingerprint: string;
    deviceId: string;
}

const dependencies: PreviewKeyApiDependencies = Object.freeze({
    clock: Object.freeze({ now: () => NOW }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: Object.freeze({ bytes: (length: number) => crypto.getRandomValues(new Uint8Array(length)) }),
    failures: Object.freeze({ checkpoint: async () => {} })
});

function bindings(overrides: Record<string, unknown> = {}): object {
    return {
        APP_ENV: 'preview', IDENTITY_RUNTIME_MODE: 'preview-only', COLLABORATION_ENABLED: 'false',
        KEY_FOUNDATION_MODE: 'preview-only', GITHUB_OAUTH_CLIENT_ID: 'preview-client',
        GITHUB_OAUTH_CLIENT_SECRET: 'preview-secret', OAUTH_TRANSACTION_KEY: keyring('oauth', 1),
        SESSION_TOKEN_PEPPER: SESSION_KEY, CSRF_TOKEN_KEY: CSRF_KEY,
        RATE_LIMIT_KEY: keyring('rate', 4), COLLAB_DB: env.COLLAB_DB, ...overrides
    };
}

async function makeDevice(): Promise<TestDevice> {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']
    ) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    const parsed = await parsePublicJwk({ crv: exported.crv, ext: true, key_ops: [],
        kty: exported.kty, x: exported.x, y: exported.y });
    return { privateKey: pair.privateKey, publicJwk: parsed.jwk,
        fingerprint: parsed.fingerprint, deviceId: '' };
}

async function insertSession(id: string, userId: string, token: string): Promise<void> {
    const { digest } = await digestSessionToken(SESSION_RING, token);
    await env.COLLAB_DB.prepare(
        `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
         authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL)`
    ).bind(id, digest, userId, NOW - 10_000, NOW - 1_000, NOW - 10_000,
        NOW + 43_200_000, NOW + 604_800_000).run();
}

async function seedIdentity(): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
             status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '9501', 'key-owner', 'Key Owner', NULL, 'active', ?, ?, NULL)`
        ).bind(OWNER, NOW - 20_000, NOW - 20_000),
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
             status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '9502', 'key-target', 'Key Target', NULL, 'active', ?, ?, NULL)`
        ).bind(TARGET, NOW - 20_000, NOW - 20_000)
    ]);
    await insertSession(OWNER_SESSION, OWNER, OWNER_TOKEN);
    await insertSession(TARGET_SESSION, TARGET, TARGET_TOKEN);
}

async function api(path: string, options: {
    readonly method?: string; readonly token?: string; readonly device?: string;
    readonly body?: object; readonly idempotency?: string; readonly origin?: string;
    readonly runtime?: object;
} = {}): Promise<Response | null> {
    const method = options.method ?? 'GET';
    const headers = new Headers({ Accept: 'application/json', 'CF-Connecting-IP': '203.0.113.40' });
    if (options.token) headers.set('Cookie', `${COOKIE}=${options.token}`);
    if (options.device) headers.set('X-DocVault-Device-ID', options.device);
    if (options.idempotency) headers.set('Idempotency-Key', options.idempotency);
    if (method !== 'GET') {
        headers.set('Origin', options.origin ?? ORIGIN);
        headers.set('Content-Type', 'application/json; charset=utf-8');
        if (options.token) headers.set('X-CSRF-Token', await deriveCsrfToken(CSRF_RING, options.token));
    }
    return handlePreviewKeyFoundationApi(new Request(`${ORIGIN}${path}`, {
        method, headers, ...(method === 'GET' ? {} : { body: JSON.stringify(options.body ?? {}) })
    }), options.runtime ?? bindings(), dependencies);
}

async function register(device: TestDevice, token: string): Promise<void> {
    const response = await api('/api/v1/devices', { method: 'POST', token,
        idempotency: crypto.randomUUID(), body: { displayLabel: 'Preview device',
            publicJwk: device.publicJwk, fingerprint: device.fingerprint,
            suite: 'P256-HKDF-SHA256-A256GCM-v1' } });
    expect(response?.status).toBe(201);
    const body = await response?.json<{ data: { deviceId: string; fingerprint: string } }>();
    device.deviceId = body?.data.deviceId ?? '';
    expect(device.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body?.data.fingerprint).toBe(device.fingerprint);
}

function aad(workspaceId: string, targetUserId: string, target: TestDevice,
    wrapperDeviceId: string, keyVersion: number): WorkspaceEnvelopeAad {
    return { version: 1, suite: 'P256-HKDF-SHA256-A256GCM-v1', workspaceId,
        targetUserId, targetDeviceId: target.deviceId, targetFingerprint: target.fingerprint,
        wrapperDeviceId, keyVersion };
}

describe('CF-P5-007 isolated Preview key foundation preflight', () => {
    let owner: TestDevice;
    let target: TestDevice;
    let workspaceId = '';

    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'preview_key_foundation');
        await seedIdentity();
        [owner, target] = await Promise.all([makeDevice(), makeDevice()]);
    });

    it('stays unreachable outside the exact Preview mode and rejects cross-origin mutation', async () => {
        expect(await api('/api/v1/devices', { runtime: bindings({ KEY_FOUNDATION_MODE: 'disabled' }) })).toBeNull();
        expect(await api('/api/v1/devices', { runtime: bindings({ APP_ENV: 'production' }) })).toBeNull();
        expect(await api('/api/v1/documents')).toBeNull();
        const denied = await api('/api/v1/devices', { method: 'POST', token: OWNER_TOKEN,
            idempotency: crypto.randomUUID(), origin: 'https://example.test', body: {} });
        expect(denied?.status).toBe(403);
        expect(denied?.headers.get('Cache-Control')).toContain('no-store');
    });

    it('integrates registration, keyed bootstrap, provisioning, unwrap, and monotonic rotation', async () => {
        await register(owner, OWNER_TOKEN);
        await register(target, TARGET_TOKEN);
        const bootstrapMutation = crypto.randomUUID();
        const intent = await api('/api/v1/workspaces/bootstrap-intents', { method: 'POST',
            token: OWNER_TOKEN, device: owner.deviceId, idempotency: bootstrapMutation,
            body: { displayName: 'Preview encrypted workspace', ownerDeviceId: owner.deviceId } });
        expect(intent?.status).toBe(200);
        const intentBody = await intent?.json<{ data: { workspaceId: string } }>();
        workspaceId = intentBody?.data.workspaceId ?? '';
        const firstDek = generateWorkspaceDek();
        const ownerEnvelope = await wrapWorkspaceKey(firstDek, owner.publicJwk,
            aad(workspaceId, OWNER, owner, owner.deviceId, 1));
        const created = await api('/api/v1/workspaces', { method: 'POST', token: OWNER_TOKEN,
            device: owner.deviceId, idempotency: bootstrapMutation,
            body: { displayName: 'Preview encrypted workspace', ownerDeviceId: owner.deviceId,
                initialKeyVersion: 1, initialKeyEnvelope: ownerEnvelope } });
        expect(created?.status).toBe(201);

        await env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by, accepted_by,
             removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'pending_key', ?, ?, NULL, ?, NULL, NULL, 1)`
        ).bind(workspaceId, TARGET, OWNER, TARGET, NOW).run();
        const inventory = await api(`/api/v1/workspaces/${workspaceId}/devices?limit=50`, {
            token: OWNER_TOKEN, device: owner.deviceId
        });
        expect(inventory?.status).toBe(200);
        const inventoryBody = await inventory?.json<{ data: { items: Array<{ deviceId: string }> } }>();
        expect(inventoryBody?.data.items.map(item => item.deviceId).sort())
            .toEqual([owner.deviceId, target.deviceId].sort());

        const targetEnvelope = await wrapWorkspaceKey(firstDek, target.publicJwk,
            aad(workspaceId, TARGET, target, owner.deviceId, 1));
        expect((await api(`/api/v1/workspaces/${workspaceId}/key-envelopes/${target.deviceId}`, {
            method: 'PUT', token: OWNER_TOKEN, device: owner.deviceId, idempotency: crypto.randomUUID(),
            body: { envelope: targetEnvelope }
        }))?.status).toBe(201);
        const current = await api(`/api/v1/workspaces/${workspaceId}/key-envelopes/current`, {
            token: TARGET_TOKEN, device: target.deviceId
        });
        const currentBody = await current?.json<{ data: { readiness: string; envelope: WorkspaceKeyEnvelope } }>();
        expect(currentBody?.data.readiness).toBe('key_ready');
        expect(await unwrapWorkspaceKey(currentBody?.data.envelope, target.privateKey, target.publicJwk,
            aad(workspaceId, TARGET, target, owner.deviceId, 1))).toEqual(firstDek);

        const started = await api(`/api/v1/workspaces/${workspaceId}/key-rotations`, {
            method: 'POST', token: OWNER_TOKEN, device: owner.deviceId, idempotency: crypto.randomUUID(),
            body: { reason: 'member_removed' }
        });
        expect(started?.status).toBe(201);
        const startedBody = await started?.json<{ data: { rotationId: string } }>();
        const rotationId = startedBody?.data.rotationId ?? '';
        const status = await api(`/api/v1/workspaces/${workspaceId}/key-rotations/${rotationId}`, {
            token: OWNER_TOKEN, device: owner.deviceId
        });
        const statusBody = await status?.json<{ data: { targets: Array<{ userId: string; deviceId: string;
            fingerprint: string }>; expectedCurrentKeyVersion: number; eligibleSetDigest: string } }>();
        const secondDek = generateWorkspaceDek();
        for (const item of statusBody?.data.targets ?? []) {
            const device = item.deviceId === owner.deviceId ? owner : target;
            const stagedEnvelope = await wrapWorkspaceKey(secondDek, device.publicJwk,
                aad(workspaceId, item.userId, device, owner.deviceId, 2));
            expect((await api(`/api/v1/workspaces/${workspaceId}/key-rotations/${rotationId}/envelopes/${item.deviceId}`, {
                method: 'PUT', token: OWNER_TOKEN, device: owner.deviceId,
                idempotency: crypto.randomUUID(), body: { envelope: stagedEnvelope }
            }))?.status).toBe(201);
        }
        expect((await api(`/api/v1/workspaces/${workspaceId}/key-rotations/${rotationId}/commit`, {
            method: 'POST', token: OWNER_TOKEN, device: owner.deviceId, idempotency: crypto.randomUUID(),
            body: { expectedCurrentKeyVersion: statusBody?.data.expectedCurrentKeyVersion,
                eligibleSetDigest: statusBody?.data.eligibleSetDigest }
        }))?.status).toBe(200);
        const rotated = await api(`/api/v1/workspaces/${workspaceId}/key-envelopes/current`, {
            token: TARGET_TOKEN, device: target.deviceId
        });
        const rotatedBody = await rotated?.json<{ data: { envelope: WorkspaceKeyEnvelope } }>();
        expect(await unwrapWorkspaceKey(rotatedBody?.data.envelope, target.privateKey, target.publicJwk,
            aad(workspaceId, TARGET, target, owner.deviceId, 2))).toEqual(secondDek);
    });

    it('keeps authenticated Preview reads inside the 300 ms local p95 budget', async () => {
        const samples: number[] = [];
        for (let index = 0; index < 20; index += 1) {
            const startedAt = performance.now();
            const response = await api(`/api/v1/workspaces/${workspaceId}/key-envelopes/current`, {
                token: OWNER_TOKEN, device: owner.deviceId
            });
            samples.push(performance.now() - startedAt);
            expect(response?.status).toBe(200);
        }
        samples.sort((left, right) => left - right);
        expect(samples[Math.ceil(samples.length * 0.95) - 1]).toBeLessThan(300);
    });
});
