import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    changeMemberRole,
    listWorkspaceMembers,
    removeMember,
    transferOwnership,
    type ChangeMemberRoleInput,
    type RemoveMemberInput,
    type TransferOwnershipInput
} from '../../functions/_lib/memberships';

const id = (value: number): string => {
    const head = value.toString(16).padStart(8, '0');
    const tail = value.toString(16).padStart(12, '0');
    return `${head}-0000-4000-8000-${tail}`;
};
const bytes = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const jwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC',
    x: 'A'.repeat(43), y: 'B'.repeat(43) });

const USER = Object.freeze({ owner: id(1), admin: id(2), editor: id(3), viewer: id(4), other: id(5) });
const DEVICE = Object.freeze({ owner: id(11), admin: id(12), editor: id(13), viewer: id(14), other: id(15) });
let workspaceSequence = 100;
let workspaceId = id(workspaceSequence);
let mutationSequence = 1_000;

async function seedUser(userId: string, deviceId: string, subject: string, login: string,
    fill: number): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, ?, NULL, 'active', 1, 1, NULL)`
        ).bind(userId, subject, login, `${login} name`),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Membership device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(deviceId, userId, jwk, bytes(32, fill))
    ]);
}

async function seedWorkspace(): Promise<void> {
    workspaceId = id(++workspaceSequence);
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Membership Administration', NULL, 'active', 1, ?, 10, 10, NULL)`
        ).bind(workspaceId, USER.owner),
        ...Object.entries(USER).map(([name, userId]) => env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, ?, 'active', NULL, ?, NULL, 10, 10, NULL, 1)`
        ).bind(workspaceId, userId, name === 'other' ? 'viewer' : name, userId)),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'workspace_create',
               ?, ?, 10, 10, NULL)`
        ).bind(workspaceId, DEVICE.owner, USER.owner)
    ]);
    let envelope = 0;
    for (const [name, userId] of Object.entries(USER)) {
        const deviceId = DEVICE[name as keyof typeof DEVICE];
        envelope += 1;
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_envelopes (id, workspace_id, key_version, target_user_id,
              target_device_id, target_fingerprint, wrapper_user_id, wrapper_device_id, suite,
              ephemeral_public_jwk, hkdf_salt, nonce, ciphertext, aad_digest, created_at, revoked_at)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, 10, NULL)`
        ).bind(id(10_000 + workspaceSequence * 10 + envelope), workspaceId, userId, deviceId,
            bytes(32, envelope), USER.owner, DEVICE.owner, jwk, bytes(32, 21), bytes(12, 22),
            bytes(48, 23), bytes(32, 24)).run();
    }
}

function base(targetUserId: string, actorUserId = USER.owner,
    actorDeviceId = DEVICE.owner): Omit<ChangeMemberRoleInput, 'role'> {
    const sequence = ++mutationSequence;
    return {
        actorUserId, actorDeviceId, workspaceId, targetUserId, expectedRoleVersion: 1,
        mutationResultId: id(sequence), clientMutationId: id(sequence + 10_000),
        requestFingerprint: bytes(32, sequence % 251), auditEventId: id(sequence + 20_000),
        requestId: id(sequence + 30_000), serverTime: 1_000 + sequence,
        replayExpiresAt: 1_000_000 + sequence
    };
}

describe('CF-P4-005 membership administration', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'phase4_membership_administration');
        await seedUser(USER.owner, DEVICE.owner, '3001', 'owner', 1);
        await seedUser(USER.admin, DEVICE.admin, '3002', 'admin', 2);
        await seedUser(USER.editor, DEVICE.editor, '3003', 'editor', 3);
        await seedUser(USER.viewer, DEVICE.viewer, '3004', 'viewer', 4);
        await seedUser(USER.other, DEVICE.other, '3005', 'other', 5);
    });

    beforeEach(seedWorkspace);

    it('lists bounded, keyset-paginated member metadata without document or secret fields', async () => {
        const first = await listWorkspaceMembers(env.COLLAB_DB, {
            actorUserId: USER.viewer, actingDeviceId: DEVICE.viewer, workspaceId, limit: 2
        });
        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).not.toBeNull();
        expect(first.items[0]).toMatchObject({ roleVersion: 1, activeDeviceCount: 1, keyReady: true });
        expect(JSON.stringify(first)).not.toMatch(/public_jwk|fingerprint|ciphertext|provider_subject/);
        const second = await listWorkspaceMembers(env.COLLAB_DB, {
            actorUserId: USER.viewer, actingDeviceId: DEVICE.viewer, workspaceId, limit: 100,
            afterUserId: first.nextCursor?.userId
        });
        expect([...first.items, ...second.items]).toHaveLength(5);
    });

    it('changes a role once with optimistic concurrency and returns an authorized replay', async () => {
        const input: ChangeMemberRoleInput = { ...base(USER.editor), role: 'viewer' };
        await expect(changeMemberRole(env.COLLAB_DB, input)).resolves.toMatchObject({
            role: 'viewer', state: 'active', replayed: false, httpStatus: 200
        });
        await expect(changeMemberRole(env.COLLAB_DB, input)).resolves.toMatchObject({ replayed: true });
        expect(await env.COLLAB_DB.prepare(
            'SELECT role, role_version FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(workspaceId, USER.editor).first()).toEqual({ role: 'viewer', role_version: 2 });
    });

    it('enforces Admin Editor/Viewer ceilings and rejects Owner assignment', async () => {
        await expect(changeMemberRole(env.COLLAB_DB, {
            ...base(USER.viewer, USER.admin, DEVICE.admin), role: 'editor'
        })).resolves.toMatchObject({ role: 'editor' });
        await expect(changeMemberRole(env.COLLAB_DB, {
            ...base(USER.admin), role: 'viewer'
        })).resolves.toMatchObject({ role: 'viewer' });
        const invalidRole: ChangeMemberRoleInput = {
            ...base(USER.editor),
            // @ts-expect-error Runtime validation must reject an untyped boundary payload.
            role: 'owner'
        };
        await expect(changeMemberRole(env.COLLAB_DB, invalidRole)).rejects.toMatchObject({
            code: 'MEMBERSHIP_INPUT_INVALID'
        });
    });

    it('denies self-removal, direct Owner removal, stale versions, and lower-role administration', async () => {
        await expect(removeMember(env.COLLAB_DB, base(USER.owner) as RemoveMemberInput))
            .rejects.toMatchObject({ code: 'MEMBERSHIP_OPERATION_NOT_PERMITTED' });
        await expect(removeMember(env.COLLAB_DB, base(USER.admin, USER.admin, DEVICE.admin) as RemoveMemberInput))
            .rejects.toMatchObject({ code: 'MEMBERSHIP_OPERATION_NOT_PERMITTED' });
        await expect(removeMember(env.COLLAB_DB, {
            ...base(USER.editor, USER.viewer, DEVICE.viewer), expectedRoleVersion: 1
        } as RemoveMemberInput)).rejects.toMatchObject({ code: 'MEMBERSHIP_OPERATION_NOT_PERMITTED' });
        await expect(removeMember(env.COLLAB_DB, {
            ...base(USER.editor), expectedRoleVersion: 99
        } as RemoveMemberInput)).rejects.toMatchObject({ code: 'MEMBERSHIP_UNAVAILABLE' });
    });

    it('atomically removes membership, invitation and envelopes, marks rotation, and denies live access', async () => {
        await env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '3003', 'editor', 'viewer', ?, 'pending', ?, NULL,
               20, 259200020, NULL, NULL, NULL, NULL)`
        ).bind(id(40_000 + workspaceSequence), workspaceId, bytes(32, 99), USER.owner).run();
        const result = await removeMember(env.COLLAB_DB, base(USER.editor) as RemoveMemberInput);
        expect(result).toMatchObject({ state: 'removed', workspaceState: 'rotating', httpStatus: 204 });
        expect(await env.COLLAB_DB.prepare(
            `SELECT m.state, m.role_version, w.state AS workspace_state,
              (SELECT state FROM invitations WHERE workspace_id = w.id AND target_provider_subject = '3003') AS invite_state,
              (SELECT COUNT(*) FROM workspace_key_envelopes WHERE workspace_id = w.id
                AND target_user_id = ? AND revoked_at IS NULL) AS live_envelopes
             FROM memberships m JOIN workspaces w ON w.id = m.workspace_id
             WHERE m.workspace_id = ? AND m.user_id = ?`
        ).bind(USER.editor, workspaceId, USER.editor).first()).toEqual({
            state: 'removed', role_version: 2, workspace_state: 'rotating',
            invite_state: 'revoked', live_envelopes: 0
        });
        await expect(listWorkspaceMembers(env.COLLAB_DB, {
            actorUserId: USER.editor, actingDeviceId: DEVICE.editor, workspaceId
        })).rejects.toMatchObject({ code: 'MEMBERSHIP_OPERATION_NOT_PERMITTED' });
    });

    it('transfers ownership atomically to an active key-ready member and demotes the prior Owner', async () => {
        const input: TransferOwnershipInput = {
            ...base(USER.admin), confirmation: 'TRANSFER_OWNERSHIP', authenticatedAt: 1_000
        };
        const result = await transferOwnership(env.COLLAB_DB, input);
        expect(result).toMatchObject({ targetUserId: USER.admin, role: 'owner', replayed: false });
        expect(await env.COLLAB_DB.prepare(
            `SELECT user_id, role, role_version FROM memberships
             WHERE workspace_id = ? AND user_id IN (?, ?) ORDER BY user_id`
        ).bind(workspaceId, USER.owner, USER.admin).all()).toMatchObject({ results: [
            { user_id: USER.owner, role: 'admin', role_version: 2 },
            { user_id: USER.admin, role: 'owner', role_version: 2 }
        ] });
        await expect(transferOwnership(env.COLLAB_DB, input)).resolves.toMatchObject({ replayed: true });
    });

    it('requires exact confirmation, recent authentication, active membership, and key readiness', async () => {
        const oldAuth = { ...base(USER.admin), confirmation: 'TRANSFER_OWNERSHIP' as const,
            authenticatedAt: 0, serverTime: 1_000_000 };
        await expect(transferOwnership(env.COLLAB_DB, oldAuth)).rejects.toMatchObject({
            code: 'RECENT_AUTHENTICATION_REQUIRED'
        });
        await env.COLLAB_DB.prepare(
            'UPDATE workspace_key_envelopes SET revoked_at = 50 WHERE workspace_id = ? AND target_user_id = ?'
        ).bind(workspaceId, USER.admin).run();
        await expect(transferOwnership(env.COLLAB_DB, {
            ...base(USER.admin), confirmation: 'TRANSFER_OWNERSHIP', authenticatedAt: 2_000
        })).rejects.toMatchObject({ code: 'MEMBERSHIP_OPERATION_NOT_PERMITTED' });
    });

    it('rolls back every role and ledger write when the append-only audit insert conflicts', async () => {
        const first = { ...base(USER.viewer), role: 'editor' as const };
        await changeMemberRole(env.COLLAB_DB, first);
        const second = { ...base(USER.other), role: 'editor' as const, auditEventId: first.auditEventId };
        await expect(changeMemberRole(env.COLLAB_DB, second)).rejects.toMatchObject({
            code: 'MEMBERSHIP_UNAVAILABLE'
        });
        expect(await env.COLLAB_DB.prepare(
            'SELECT role, role_version FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(workspaceId, USER.other).first()).toEqual({ role: 'viewer', role_version: 1 });
        expect(await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS count FROM mutation_results WHERE id = ?'
        ).bind(second.mutationResultId).first<number>('count')).toBe(0);
    });
});
