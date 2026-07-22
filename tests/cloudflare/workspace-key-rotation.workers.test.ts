import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { parsePublicJwk } from '../../functions/_lib/e2ee/jwk';
import { generateWorkspaceDek, wrapWorkspaceKey, type WorkspaceEnvelopeAad } from '../../functions/_lib/e2ee/primitives';
import { bootstrapWorkspaceKey, createWorkspaceBootstrapIntent, provisionWorkspaceEnvelope,
    abortWorkspaceKeyRotation, commitWorkspaceKeyRotation, readWorkspaceKeyReadiness,
    readWorkspaceKeyRotation, readWorkspaceRecoveryState, stageWorkspaceRotationEnvelope,
    startWorkspaceKeyRotation, type FinishWorkspaceKeyRotationInput,
    type ProvisionWorkspaceEnvelopeInput, type StageWorkspaceRotationEnvelopeInput,
    type StartWorkspaceKeyRotationInput } from '../../functions/_lib/workspace-keys';

const ID = Object.freeze({
    owner: '11111111-1111-4111-8111-111111111111', ownerSession: '11111111-2222-4222-8222-111111111111',
    ownerDevice: '11111111-3333-4333-8333-111111111111', admin: '22222222-1111-4111-8111-222222222222',
    adminSession: '22222222-2222-4222-8222-222222222222', adminDevice: '22222222-3333-4333-8333-222222222222',
    editor: '33333333-1111-4111-8111-333333333333', editorSession: '33333333-2222-4222-8222-333333333333',
    editorDevice: '33333333-3333-4333-8333-333333333333', viewer: '44444444-1111-4111-8111-444444444444',
    viewerSession: '44444444-2222-4222-8222-444444444444', viewerDevice: '44444444-3333-4333-8333-444444444444'
});
interface TestDevice { publicJwk: JsonWebKey; fingerprint: string; }
const devices = new Map<string, TestDevice>();
const blob = (fill: number): ArrayBuffer => new Uint8Array(32).fill(fill).buffer;
let sequence = 1; let workspaceId = ''; let currentDek: Uint8Array; let rotationDek: Uint8Array;
let rotationId = '';
const uuid = (): string => `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence++).padStart(12, '0')}`;

async function makeDevice(): Promise<TestDevice> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    const publicJwk = { crv: exported.crv, ext: true, key_ops: [], kty: exported.kty, x: exported.x, y: exported.y };
    return { publicJwk, fingerprint: (await parsePublicJwk(publicJwk)).fingerprint };
}
async function seedUser(userId: string, sessionId: string, deviceId: string, subject: string): Promise<void> {
    const device = await makeDevice(); devices.set(deviceId, device);
    const fingerprint = Uint8Array.from(atob(device.fingerprint.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)).buffer;
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(`INSERT INTO users (id, provider, provider_subject, display_login,
          display_name, avatar_url, status, created_at, updated_at, deactivated_at)
         VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`).bind(userId, subject, `synthetic-${subject}`),
        env.COLLAB_DB.prepare(`INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
          last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
         VALUES (?, ?, ?, NULL, 1, 1, 1, 1000000, 2000000, NULL, NULL)`).bind(sessionId, blob(Number(subject) % 250), userId),
        env.COLLAB_DB.prepare(`INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite,
          state, created_at, revoked_at, revoke_reason) VALUES (?, ?, 'Synthetic device', ?, ?,
          'P256-ECDH-v1', 'active', 1, NULL, NULL)`).bind(deviceId, userId, JSON.stringify(device.publicJwk), fingerprint)
    ]);
}
function context(actor: 'owner' | 'admin' = 'owner', serverTime = 100) {
    const user = actor === 'owner' ? ID.owner : ID.admin;
    const session = actor === 'owner' ? ID.ownerSession : ID.adminSession;
    const device = actor === 'owner' ? ID.ownerDevice : ID.adminDevice;
    return { actorUserId: user, actorSessionId: session, actorDeviceId: device,
        mutationResultId: uuid(), clientMutationId: uuid(), requestFingerprint: blob(sequence % 250),
        auditEventId: uuid(), requestId: uuid(), serverTime, replayExpiresAt: serverTime + 50_000 };
}
function aad(userId: string, deviceId: string, fingerprint: string, wrapperDeviceId: string,
    keyVersion: number): WorkspaceEnvelopeAad {
    return { version: 1, suite: 'P256-HKDF-SHA256-A256GCM-v1', workspaceId,
        targetUserId: userId, targetDeviceId: deviceId, targetFingerprint: fingerprint,
        wrapperDeviceId, keyVersion };
}
async function envelope(dek: Uint8Array, userId: string, deviceId: string,
    wrapperDeviceId: string, keyVersion: number) {
    const device = devices.get(deviceId); if (!device) throw new Error('device missing');
    return wrapWorkspaceKey(dek, device.publicJwk, aad(userId, deviceId, device.fingerprint, wrapperDeviceId, keyVersion));
}
async function provision(userId: string, deviceId: string, actor: 'owner' | 'admin' = 'owner'): Promise<void> {
    const actorDeviceId = actor === 'owner' ? ID.ownerDevice : ID.adminDevice;
    const device = devices.get(deviceId); if (!device) throw new Error('device missing');
    const input: ProvisionWorkspaceEnvelopeInput = { ...context(actor, 80), workspaceId,
        envelopeId: uuid(), targetUserId: userId, targetDeviceId: deviceId,
        targetFingerprint: device.fingerprint, keyVersion: 1,
        envelope: await envelope(currentDek, userId, deviceId, actorDeviceId, 1) };
    await provisionWorkspaceEnvelope(env.COLLAB_DB, input);
}
function finish(serverTime: number): FinishWorkspaceKeyRotationInput {
    return { ...context('owner', serverTime), workspaceId, rotationId };
}

describe('CF-P5-006 monotonic rotation and no-escrow recovery', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'workspace_rotation_migrations');
        await Promise.all([
            seedUser(ID.owner, ID.ownerSession, ID.ownerDevice, '71001'),
            seedUser(ID.admin, ID.adminSession, ID.adminDevice, '71002'),
            seedUser(ID.editor, ID.editorSession, ID.editorDevice, '71003'),
            seedUser(ID.viewer, ID.viewerSession, ID.viewerDevice, '71004')
        ]);
        const intentInput = { actorUserId: ID.owner, actorSessionId: ID.ownerSession,
            actorDeviceId: ID.ownerDevice, clientMutationId: uuid(), serverTime: 20 };
        workspaceId = (await createWorkspaceBootstrapIntent(env.COLLAB_DB, intentInput)).workspaceId;
        currentDek = await generateWorkspaceDek(); const owner = devices.get(ID.ownerDevice)!;
        await bootstrapWorkspaceKey(env.COLLAB_DB, { ...context('owner', 30),
            clientMutationId: intentInput.clientMutationId, workspaceId, displayName: 'Rotation workspace',
            descriptionEnvelope: null, envelopeId: uuid(),
            envelope: await envelope(currentDek, ID.owner, ID.ownerDevice, ID.ownerDevice, 1) });
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'admin', 'pending_key', ?, ?, NULL, 40, NULL, NULL, 1)`).bind(workspaceId, ID.admin, ID.owner, ID.admin),
            env.COLLAB_DB.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'pending_key', ?, ?, NULL, 40, NULL, NULL, 1)`).bind(workspaceId, ID.editor, ID.owner, ID.editor)
        ]);
        expect(owner.fingerprint).toBeTruthy(); await provision(ID.admin, ID.adminDevice); await provision(ID.editor, ID.editorDevice);
    });

    it('lets exactly one of twenty concurrent Owner proposals create current plus one', async () => {
        const proposals: StartWorkspaceKeyRotationInput[] = Array.from({ length: 20 }, () => ({
            ...context('owner', 200), workspaceId, rotationId: uuid(), reason: 'scheduled', expiresAt: 20_000
        }));
        const settled = await Promise.allSettled(proposals.map(input => startWorkspaceKeyRotation(env.COLLAB_DB, input)));
        const successes = settled.filter(item => item.status === 'fulfilled');
        expect(successes).toHaveLength(1);
        const result = (successes[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof startWorkspaceKeyRotation>>>).value;
        rotationId = result.rotationId; expect(result).toMatchObject({ fromKeyVersion: 1, toKeyVersion: 2,
            state: 'preparing', eligibleCount: 3, stagedCount: 0 });
        expect(await env.COLLAB_DB.prepare("SELECT COUNT(*) AS count FROM workspace_key_versions WHERE workspace_id = ? AND key_version = 2")
            .bind(workspaceId).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT current_key_version FROM workspaces WHERE id = ?')
            .bind(workspaceId).first<number>('current_key_version')).toBe(1);
    });

    it('persists an immutable eligible-device snapshot and resumes interrupted staging', async () => {
        const status = await readWorkspaceKeyRotation(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 210, workspaceId, rotationId });
        expect(status.targets.map(target => target.deviceId)).toEqual([ID.ownerDevice, ID.adminDevice, ID.editorDevice].sort());
        rotationDek = await generateWorkspaceDek(); const target = status.targets[0];
        const first: StageWorkspaceRotationEnvelopeInput = { ...context('owner', 220), workspaceId,
            rotationId, envelopeId: uuid(), targetUserId: target.userId, targetDeviceId: target.deviceId,
            targetFingerprint: target.fingerprint, keyVersion: 2,
            envelope: await envelope(rotationDek, target.userId, target.deviceId, ID.ownerDevice, 2) };
        const [a, b] = await Promise.all([
            stageWorkspaceRotationEnvelope(env.COLLAB_DB, first),
            stageWorkspaceRotationEnvelope(env.COLLAB_DB, first)
        ]);
        expect(a).toEqual(b); expect(a.stagedCount).toBe(1);
        const resumed = await readWorkspaceKeyRotation(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 230, workspaceId, rotationId });
        expect(resumed.stagedCount).toBe(1); expect(resumed.targets.filter(item => item.state === 'staged')).toHaveLength(1);
    });

    it('stages the complete set and atomically commits one monotonic current version', async () => {
        const status = await readWorkspaceKeyRotation(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 240, workspaceId, rotationId });
        for (const target of status.targets.filter(item => item.state === 'pending')) {
            await stageWorkspaceRotationEnvelope(env.COLLAB_DB, { ...context('owner', 250), workspaceId,
                rotationId, envelopeId: uuid(), targetUserId: target.userId, targetDeviceId: target.deviceId,
                targetFingerprint: target.fingerprint, keyVersion: 2,
                envelope: await envelope(rotationDek, target.userId, target.deviceId, ID.ownerDevice, 2) });
        }
        const committed = await commitWorkspaceKeyRotation(env.COLLAB_DB, finish(300));
        expect(committed).toMatchObject({ state: 'committed', fromKeyVersion: 1,
            toKeyVersion: 2, eligibleCount: 3, stagedCount: 3 });
        expect((await env.COLLAB_DB.prepare(`SELECT key_version, state FROM workspace_key_versions
          WHERE workspace_id = ? ORDER BY key_version`).bind(workspaceId).all()).results)
            .toEqual([{ key_version: 1, state: 'retired' }, { key_version: 2, state: 'current' }]);
        expect(await env.COLLAB_DB.prepare('SELECT current_key_version FROM workspaces WHERE id = ?')
            .bind(workspaceId).first<number>('current_key_version')).toBe(2);
    });

    it('preserves historical envelopes and rejects old-version new provisioning', async () => {
        expect(await env.COLLAB_DB.prepare(`SELECT COUNT(*) AS count FROM workspace_key_envelopes
          WHERE workspace_id = ? AND key_version = 1 AND revoked_at IS NULL`).bind(workspaceId).first<number>('count')).toBe(3);
        const viewer = devices.get(ID.viewerDevice)!;
        await env.COLLAB_DB.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
          accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
         VALUES (?, ?, 'viewer', 'pending_key', ?, ?, NULL, 310, NULL, NULL, 1)`).bind(workspaceId, ID.viewer, ID.owner, ID.viewer).run();
        const stale: ProvisionWorkspaceEnvelopeInput = { ...context('owner', 320), workspaceId,
            envelopeId: uuid(), targetUserId: ID.viewer, targetDeviceId: ID.viewerDevice,
            targetFingerprint: viewer.fingerprint, keyVersion: 1,
            envelope: await envelope(currentDek, ID.viewer, ID.viewerDevice, ID.ownerDevice, 1) };
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, stale)).rejects.toBeTruthy();
        expect(await readWorkspaceKeyReadiness(env.COLLAB_DB,
            { actorUserId: ID.viewer, workspaceId, deviceId: ID.viewerDevice })).toBe('pending_key');
    });

    it('fails closed on a changed snapshot, aborts safely, and restarts at the same n plus one', async () => {
        rotationId = uuid();
        await startWorkspaceKeyRotation(env.COLLAB_DB, { ...context('owner', 330), workspaceId,
            rotationId, reason: 'member_removed', expiresAt: 20_000 });
        let status = await readWorkspaceKeyRotation(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 331, workspaceId, rotationId });
        const ownerTarget = status.targets.find(target => target.deviceId === ID.ownerDevice)!;
        const interruptedDek = await generateWorkspaceDek();
        await stageWorkspaceRotationEnvelope(env.COLLAB_DB, { ...context('owner', 332), workspaceId,
            rotationId, envelopeId: uuid(), targetUserId: ownerTarget.userId, targetDeviceId: ownerTarget.deviceId,
            targetFingerprint: ownerTarget.fingerprint, keyVersion: 3,
            envelope: await envelope(interruptedDek, ownerTarget.userId, ownerTarget.deviceId, ID.ownerDevice, 3) });
        await env.COLLAB_DB.prepare(`UPDATE devices SET state = 'revoked', revoked_at = 333,
          revoke_reason = 'member_removed' WHERE id = ?`).bind(ID.editorDevice).run();
        await expect(commitWorkspaceKeyRotation(env.COLLAB_DB, finish(334))).rejects.toBeTruthy();
        expect(await env.COLLAB_DB.prepare('SELECT current_key_version FROM workspaces WHERE id = ?')
            .bind(workspaceId).first<number>('current_key_version')).toBe(2);
        await expect(abortWorkspaceKeyRotation(env.COLLAB_DB, finish(335))).resolves.toMatchObject({ state: 'aborted' });
        expect(await env.COLLAB_DB.prepare('SELECT state FROM workspaces WHERE id = ?')
            .bind(workspaceId).first<string>('state')).toBe('active');

        rotationId = uuid(); rotationDek = await generateWorkspaceDek();
        const restarted = await startWorkspaceKeyRotation(env.COLLAB_DB, { ...context('owner', 336), workspaceId,
            rotationId, reason: 'member_removed', expiresAt: 20_000 });
        expect(restarted).toMatchObject({ fromKeyVersion: 2, toKeyVersion: 3, eligibleCount: 2 });
        status = await readWorkspaceKeyRotation(env.COLLAB_DB, { actorUserId: ID.owner,
            actorSessionId: ID.ownerSession, actorDeviceId: ID.ownerDevice, serverTime: 337, workspaceId, rotationId });
        expect(status.targets.map(target => target.deviceId).sort()).toEqual([ID.ownerDevice, ID.adminDevice].sort());
        for (const target of status.targets) {
            await stageWorkspaceRotationEnvelope(env.COLLAB_DB, { ...context('owner', 338), workspaceId,
                rotationId, envelopeId: uuid(), targetUserId: target.userId, targetDeviceId: target.deviceId,
                targetFingerprint: target.fingerprint, keyVersion: 3,
                envelope: await envelope(rotationDek, target.userId, target.deviceId, ID.ownerDevice, 3) });
        }
        await expect(commitWorkspaceKeyRotation(env.COLLAB_DB, finish(339))).resolves.toMatchObject({
            state: 'committed', fromKeyVersion: 2, toKeyVersion: 3, eligibleCount: 2, stagedCount: 2 });
    });
    it('uses an alternate key-ready Admin as the only recovery/provisioning path', async () => {
        const viewer = devices.get(ID.viewerDevice)!;
        const input: ProvisionWorkspaceEnvelopeInput = { ...context('admin', 340), workspaceId,
            envelopeId: uuid(), targetUserId: ID.viewer, targetDeviceId: ID.viewerDevice,
            targetFingerprint: viewer.fingerprint, keyVersion: 3,
            envelope: await envelope(rotationDek, ID.viewer, ID.viewerDevice, ID.adminDevice, 3) };
        await expect(provisionWorkspaceEnvelope(env.COLLAB_DB, input)).resolves.toMatchObject({ readiness: 'key_ready' });
        await env.COLLAB_DB.prepare(`UPDATE devices SET state = 'revoked', revoked_at = 350,
          revoke_reason = 'lost_device' WHERE id = ?`).bind(ID.ownerDevice).run();
        const recovery = await readWorkspaceRecoveryState(env.COLLAB_DB, { actorUserId: ID.viewer,
            actorSessionId: ID.viewerSession, actorDeviceId: ID.viewerDevice, serverTime: 360, workspaceId });
        expect(recovery).toMatchObject({ state: 'provisioner_available', provisionerCount: 1,
            serverRecovery: false, recoveryArtifact: false, d1RestoreRecoversKeys: false });
    });

    it('reports truthful terminal loss without reset, escrow, or recovery artifact', async () => {
        await env.COLLAB_DB.prepare(`UPDATE devices SET state = 'revoked', revoked_at = 370,
          revoke_reason = 'lost_device' WHERE id = ?`).bind(ID.adminDevice).run();
        const recovery = await readWorkspaceRecoveryState(env.COLLAB_DB, { actorUserId: ID.viewer,
            actorSessionId: ID.viewerSession, actorDeviceId: ID.viewerDevice, serverTime: 380, workspaceId });
        expect(recovery).toEqual({ workspaceId, keyVersion: 3, state: 'terminal_cryptographic_loss',
            provisionerCount: 0, serverRecovery: false, recoveryArtifact: false, d1RestoreRecoversKeys: false });
        expect(JSON.stringify(recovery)).not.toMatch(/secret|private|plaintext|reset|escrowed/i);
    });

    it('keeps D1 recovery limited to ciphertext and metadata and stores no key escrow material', async () => {
        const schema = JSON.stringify((await env.COLLAB_DB.prepare(`SELECT name, sql FROM sqlite_master
          WHERE name LIKE 'workspace_key_rotation%' ORDER BY name`).all()).results);
        expect(schema).not.toMatch(/private_key|plaintext_dek|recovery_secret|recovery_artifact|escrow/i);
        const rows = JSON.stringify((await env.COLLAB_DB.prepare(`SELECT reason, state, eligible_count,
          staged_count FROM workspace_key_rotations WHERE workspace_id = ?`).bind(workspaceId).all()).results);
        expect(rows).not.toContain(Buffer.from(rotationDek).toString('base64'));
    });

    it('keeps migration 12 local-only and does not expose rotation through an HTTP route', async () => {
        const metadata = await env.COLLAB_DB.prepare(`SELECT schema_version, maximum_runtime_schema
          FROM schema_metadata WHERE singleton_id = 1`).first();
        expect(metadata).toEqual({ schema_version: 12, maximum_runtime_schema: 12 });
        expect(await env.COLLAB_DB.prepare(`SELECT COUNT(*) AS count FROM workspace_key_rotations
          WHERE workspace_id = ? AND state = 'committed'`).bind(workspaceId).first<number>('count')).toBe(2);
    });
});
