import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodeBase64Url } from '../../functions/_lib/e2ee/canonical';
import { parsePublicJwk } from '../../functions/_lib/e2ee/jwk';
import { generateWorkspaceDek, wrapWorkspaceKey, type WorkspaceEnvelopeAad } from '../../functions/_lib/e2ee/primitives';
import { bootstrapWorkspaceKey, createWorkspaceBootstrapIntent, provisionWorkspaceEnvelope,
    readProvisioningTarget, readWorkspaceKeyReadiness,
    type BootstrapWorkspaceKeyInput, type ProvisionWorkspaceEnvelopeInput } from '../../functions/_lib/workspace-keys';

const ID = Object.freeze({
    owner: '11111111-1111-4111-8111-111111111111', ownerSession: '11111111-2222-4222-8222-111111111111',
    ownerDevice: '11111111-3333-4333-8333-111111111111', editor: '22222222-1111-4111-8111-222222222222',
    editorSession: '22222222-2222-4222-8222-222222222222', editorDevice: '22222222-3333-4333-8333-222222222222',
    viewer: '33333333-1111-4111-8111-333333333333', viewerSession: '33333333-2222-4222-8222-333333333333',
    viewerDevice: '33333333-3333-4333-8333-333333333333', mutation: '44444444-1111-4111-8111-444444444444',
    result: '44444444-2222-4222-8222-444444444444', envelope: '44444444-3333-4333-8333-444444444444',
    event: '44444444-4444-4444-8444-444444444444', request: '44444444-5555-4555-8555-444444444444',
    provisionMutation: '55555555-1111-4111-8111-555555555555', provisionResult: '55555555-2222-4222-8222-555555555555',
    provisionEnvelope: '55555555-3333-4333-8333-555555555555', provisionEvent: '55555555-4444-4444-8444-555555555555',
    provisionRequest: '55555555-5555-4555-8555-555555555555'
});

const blob = (fill: number): ArrayBuffer => new Uint8Array(32).fill(fill).buffer;
interface TestDevice { publicJwk: JsonWebKey; fingerprint: string; }
let ownerDevice: TestDevice; let editorDevice: TestDevice; let viewerDevice: TestDevice;
let workspaceId = ''; let workspaceDek: Uint8Array;

async function makeDevice(): Promise<TestDevice> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    const publicJwk = { crv: exported.crv, ext: true, key_ops: [], kty: exported.kty, x: exported.x, y: exported.y };
    return { publicJwk, fingerprint: (await parsePublicJwk(publicJwk)).fingerprint };
}

async function seedUser(userId: string, sessionId: string, deviceId: string,
    subject: string, device: TestDevice): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(`INSERT INTO users (id, provider, provider_subject, display_login,
          display_name, avatar_url, status, created_at, updated_at, deactivated_at)
         VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`)
            .bind(userId, subject, `synthetic-${subject}`),
        env.COLLAB_DB.prepare(`INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
          last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
         VALUES (?, ?, ?, NULL, 1, 1, 1, 100000, 200000, NULL, NULL)`)
            .bind(sessionId, blob(Number(subject) % 250), userId),
        env.COLLAB_DB.prepare(`INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite,
          state, created_at, revoked_at, revoke_reason)
         VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`)
            .bind(deviceId, userId, JSON.stringify(device.publicJwk),
                Uint8Array.from(atob(device.fingerprint.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)).buffer)
    ]);
}

function aad(targetUserId: string, targetDeviceId: string, targetFingerprint: string,
    wrapperDeviceId: string, keyVersion = 1): WorkspaceEnvelopeAad {
    return { version: 1, suite: 'P256-HKDF-SHA256-A256GCM-v1', workspaceId,
        targetUserId, targetDeviceId, targetFingerprint, wrapperDeviceId, keyVersion };
}

function bootstrapInput(envelope: Awaited<ReturnType<typeof wrapWorkspaceKey>>): BootstrapWorkspaceKeyInput {
    return { actorUserId: ID.owner, actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice,
        workspaceId, displayName: 'Encrypted workspace', descriptionEnvelope: null,
        envelopeId: ID.envelope, envelope, mutationResultId: ID.result, clientMutationId: ID.mutation,
        requestFingerprint: blob(7), auditEventId: ID.event, requestId: ID.request,
        serverTime: 100, replayExpiresAt: 10_000 };
}

function provisionInput(envelope: Awaited<ReturnType<typeof wrapWorkspaceKey>>,
    overrides: Partial<ProvisionWorkspaceEnvelopeInput> = {}): ProvisionWorkspaceEnvelopeInput {
    return { actorUserId: ID.owner, actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice,
        workspaceId, envelopeId: ID.provisionEnvelope, targetUserId: ID.editor,
        targetDeviceId: ID.editorDevice, targetFingerprint: editorDevice.fingerprint, keyVersion: 1,
        envelope, mutationResultId: ID.provisionResult, clientMutationId: ID.provisionMutation,
        requestFingerprint: blob(8), auditEventId: ID.provisionEvent, requestId: ID.provisionRequest,
        serverTime: 200, replayExpiresAt: 10_000, ...overrides };
}

async function count(table: string, where: string, ...bindings: unknown[]): Promise<number> {
    return (await env.COLLAB_DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`)
        .bind(...bindings).first<number>('count')) ?? 0;
}

describe('CF-P5-005 workspace key bootstrap, envelopes, and readiness', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'workspace_key_service_migrations');
        [ownerDevice, editorDevice, viewerDevice] = await Promise.all([makeDevice(), makeDevice(), makeDevice()]);
        await seedUser(ID.owner, ID.ownerSession, ID.ownerDevice, '61001', ownerDevice);
        await seedUser(ID.editor, ID.editorSession, ID.editorDevice, '61002', editorDevice);
        await seedUser(ID.viewer, ID.viewerSession, ID.viewerDevice, '61003', viewerDevice);
    });

    it('creates a deterministic stateless intent and a random 32-byte DEK', async () => {
        const input = { actorUserId: ID.owner, actorSessionId: ID.ownerSession,
            actorDeviceId: ID.ownerDevice, clientMutationId: ID.mutation, serverTime: 50 };
        const [first, second] = await Promise.all([
            createWorkspaceBootstrapIntent(env.COLLAB_DB, input),
            createWorkspaceBootstrapIntent(env.COLLAB_DB, input)
        ]);
        expect(first).toEqual(second); workspaceId = first.workspaceId;
        expect(workspaceId).toMatch(/^[0-9a-f-]{36}$/);
        expect(await count('workspaces', 'id = ?', workspaceId)).toBe(0);
        workspaceDek = generateWorkspaceDek(); const another = generateWorkspaceDek();
        expect(workspaceDek).toHaveLength(32); expect(another).toHaveLength(32);
        expect(encodeBase64Url(workspaceDek)).not.toBe(encodeBase64Url(another));
    });

    it('atomically bootstraps workspace, active Owner, current v1, creator envelope, audit, and result', async () => {
        const envelope = await wrapWorkspaceKey(workspaceDek, ownerDevice.publicJwk,
            aad(ID.owner, ID.ownerDevice, ownerDevice.fingerprint, ID.ownerDevice));
        const input = bootstrapInput(envelope);
        const [first, replay] = await Promise.all([
            bootstrapWorkspaceKey(env.COLLAB_DB, input), bootstrapWorkspaceKey(env.COLLAB_DB, input)
        ]);
        expect(first).toEqual(replay);
        expect(first).toMatchObject({ workspaceId, envelopeId: ID.envelope, readiness: 'key_ready', keyVersion: 1 });
        expect(await count('workspaces', 'id = ?', workspaceId)).toBe(1);
        expect(await count('workspace_key_versions', 'workspace_id = ? AND state = ?', workspaceId, 'current')).toBe(1);
        expect(await count('workspace_key_envelopes', 'workspace_id = ?', workspaceId)).toBe(1);
        expect(await count('audit_events', 'workspace_id = ?', workspaceId)).toBe(1);
        expect(await count('mutation_results', 'workspace_id = ?', workspaceId)).toBe(1);
        expect(await readWorkspaceKeyReadiness(env.COLLAB_DB,
            { actorUserId: ID.owner, workspaceId, deviceId: ID.ownerDevice })).toBe('key_ready');
    });

    it('rejects changed bootstrap binding and envelope AAD with zero partial workspace state', async () => {
        const alternateMutation = '66666666-1111-4111-8111-666666666666';
        const intent = await createWorkspaceBootstrapIntent(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice,
            clientMutationId: alternateMutation, serverTime: 300 });
        const envelope = await wrapWorkspaceKey(workspaceDek, ownerDevice.publicJwk,
            { ...aad(ID.owner, ID.ownerDevice, ownerDevice.fingerprint, ID.ownerDevice), workspaceId: intent.workspaceId });
        await expect(bootstrapWorkspaceKey(env.COLLAB_DB, { ...bootstrapInput(envelope),
            workspaceId: intent.workspaceId, clientMutationId: alternateMutation,
            envelopeId: '66666666-2222-4222-8222-666666666666', envelope: {
                ...envelope, aad: { ...envelope.aad, targetDeviceId: ID.editorDevice }
            } })).rejects.toBeTruthy();
        expect(await count('workspaces', 'id = ?', intent.workspaceId)).toBe(0);
    });

    it('returns only a canonical target to a live key-ready Owner/Admin wrapper', async () => {
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'pending_key', ?, ?, NULL, 150, NULL, NULL, 1)`)
                .bind(workspaceId, ID.editor, ID.owner, ID.editor),
            env.COLLAB_DB.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'viewer', 'pending_key', ?, ?, NULL, 150, NULL, NULL, 1)`)
                .bind(workspaceId, ID.viewer, ID.owner, ID.viewer)
        ]);
        const target = await readProvisioningTarget(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 180,
            workspaceId, targetUserId: ID.editor, targetDeviceId: ID.editorDevice });
        expect(target).toEqual({ userId: ID.editor, deviceId: ID.editorDevice,
            fingerprint: editorDevice.fingerprint, publicJwk: editorDevice.publicJwk, keyVersion: 1 });
        await expect(readProvisioningTarget(env.COLLAB_DB, { actorUserId: ID.editor,
            actorSessionId: ID.editorSession, actorDeviceId: ID.editorDevice, serverTime: 180,
            workspaceId, targetUserId: ID.viewer, targetDeviceId: ID.viewerDevice }))
            .rejects.toMatchObject({ code: 'PERSISTENCE_NOT_FOUND' });
    });

    it('converges 32 identical submissions to one envelope, readiness transition, audit, and result', async () => {
        const envelope = await wrapWorkspaceKey(workspaceDek, editorDevice.publicJwk,
            aad(ID.editor, ID.editorDevice, editorDevice.fingerprint, ID.ownerDevice));
        const input = provisionInput(envelope);
        const outcomes = await Promise.all(Array.from({ length: 32 }, () => provisionWorkspaceEnvelope(env.COLLAB_DB, input)));
        expect(outcomes.every(item => JSON.stringify(item) === JSON.stringify(outcomes[0]))).toBe(true);
        expect(await count('workspace_key_envelopes', 'id = ?', ID.provisionEnvelope)).toBe(1);
        expect(await count('audit_events', 'target_id = ?', ID.provisionEnvelope)).toBe(1);
        expect(await count('mutation_results', 'target_id = ?', ID.provisionEnvelope)).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT state FROM memberships WHERE workspace_id = ? AND user_id = ?')
            .bind(workspaceId, ID.editor).first<string>('state')).toBe('active');
        expect(await readWorkspaceKeyReadiness(env.COLLAB_DB,
            { actorUserId: ID.editor, workspaceId, deviceId: ID.editorDevice })).toBe('key_ready');
    });

    it('denies Editor, pending, removed, and cross-workspace provisioning authority', async () => {
        const editorEnvelope = await wrapWorkspaceKey(workspaceDek, viewerDevice.publicJwk,
            aad(ID.viewer, ID.viewerDevice, viewerDevice.fingerprint, ID.editorDevice));
        const editorAttempt = provisionInput(editorEnvelope, { actorUserId: ID.editor,
            actorSessionId: ID.editorSession, actorDeviceId: ID.editorDevice,
            envelopeId: '66666666-3333-4333-8333-666666666666', targetUserId: ID.viewer,
            targetDeviceId: ID.viewerDevice, targetFingerprint: viewerDevice.fingerprint,
            mutationResultId: '66666666-4444-4444-8444-666666666666',
            clientMutationId: '66666666-5555-4555-8555-666666666666',
            auditEventId: '66666666-6666-4666-8666-666666666666',
            requestId: '66666666-7777-4777-8777-666666666666' });
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, editorAttempt)).rejects.toBeTruthy();
        await env.COLLAB_DB.prepare(`UPDATE memberships SET state = 'removed', removed_by = ?,
          removed_at = 250, activated_at = NULL WHERE workspace_id = ? AND user_id = ?`)
            .bind(ID.owner, workspaceId, ID.editor).run();
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, editorAttempt)).rejects.toBeTruthy();
        await env.COLLAB_DB.prepare(`UPDATE memberships SET state = 'active', removed_by = NULL,
          removed_at = NULL, activated_at = 260 WHERE workspace_id = ? AND user_id = ?`)
            .bind(workspaceId, ID.editor).run();
        const pendingEnvelope = await wrapWorkspaceKey(workspaceDek, ownerDevice.publicJwk,
            aad(ID.owner, ID.ownerDevice, ownerDevice.fingerprint, ID.viewerDevice));
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, { ...editorAttempt,
            actorUserId: ID.viewer, actorSessionId: ID.viewerSession, actorDeviceId: ID.viewerDevice,
            targetUserId: ID.owner, targetDeviceId: ID.ownerDevice,
            targetFingerprint: ownerDevice.fingerprint, envelope: pendingEnvelope }))
            .rejects.toBeTruthy();
        const foreignWorkspace = '88888888-1111-4111-8111-888888888888';
        const crossEnvelope = await wrapWorkspaceKey(workspaceDek, viewerDevice.publicJwk,
            { ...aad(ID.viewer, ID.viewerDevice, viewerDevice.fingerprint, ID.ownerDevice),
                workspaceId: foreignWorkspace });
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, { ...editorAttempt,
            actorUserId: ID.owner, actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice,
            workspaceId: foreignWorkspace, envelope: crossEnvelope }))
            .rejects.toBeTruthy();
        expect(await count('workspace_key_envelopes', 'id = ?', editorAttempt.envelopeId)).toBe(0);
    });
    it('denies stale version, fingerprint substitution, wrong wrapper, pending role, and revoked target without side effects', async () => {
        const baseEnvelope = await wrapWorkspaceKey(workspaceDek, viewerDevice.publicJwk,
            aad(ID.viewer, ID.viewerDevice, viewerDevice.fingerprint, ID.ownerDevice));
        const base = provisionInput(baseEnvelope, { envelopeId: '77777777-1111-4111-8111-777777777777',
            targetUserId: ID.viewer, targetDeviceId: ID.viewerDevice, targetFingerprint: viewerDevice.fingerprint,
            mutationResultId: '77777777-2222-4222-8222-777777777777',
            clientMutationId: '77777777-3333-4333-8333-777777777777',
            auditEventId: '77777777-4444-4444-8444-777777777777',
            requestId: '77777777-5555-4555-8555-777777777777' });
        const attempts: ProvisionWorkspaceEnvelopeInput[] = [
            { ...base, keyVersion: 2 },
            { ...base, targetFingerprint: encodeBase64Url(new Uint8Array(32).fill(9)) },
            { ...base, actorDeviceId: ID.editorDevice, actorUserId: ID.editor, actorSessionId: ID.editorSession }
        ];
        for (const attempt of attempts) await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, attempt)).rejects.toBeTruthy();
        await env.COLLAB_DB.prepare(`UPDATE devices SET state = 'revoked', revoked_at = 190,
          revoke_reason = 'test_revoke' WHERE id = ?`).bind(ID.viewerDevice).run();
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, base)).rejects.toBeTruthy();
        expect(await count('workspace_key_envelopes', 'id = ?', base.envelopeId)).toBe(0);
        expect(await count('mutation_results', 'target_id = ?', base.envelopeId)).toBe(0);
        expect(await readWorkspaceKeyReadiness(env.COLLAB_DB,
            { actorUserId: ID.viewer, workspaceId, deviceId: ID.viewerDevice })).toBe('revoked');
    });

    it('fails idempotency substitution and never stores plaintext DEK or private key material', async () => {
        const envelope = await wrapWorkspaceKey(workspaceDek, editorDevice.publicJwk,
            aad(ID.editor, ID.editorDevice, editorDevice.fingerprint, ID.ownerDevice));
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB,
            provisionInput(envelope, { requestFingerprint: blob(99) })))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        const dump = JSON.stringify((await env.COLLAB_DB.prepare(
            `SELECT ephemeral_public_jwk, hex(hkdf_salt) AS salt, hex(nonce) AS nonce,
              hex(ciphertext) AS ciphertext, hex(aad_digest) AS aad FROM workspace_key_envelopes`
        ).all()).results);
        expect(dump).not.toContain(encodeBase64Url(workspaceDek));
        expect(dump).not.toMatch(/"d"\s*:/);
    });
});
