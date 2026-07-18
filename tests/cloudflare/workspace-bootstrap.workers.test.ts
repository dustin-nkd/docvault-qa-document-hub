import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapWorkspace, type WorkspaceBootstrapInput } from '../../functions/_lib/workspaces';

const ID = Object.freeze({
    user: '10101010-1010-4010-8010-101010101010',
    device: '20202020-2020-4020-8020-202020202020',
    workspace: '30303030-3030-4030-8030-303030303030',
    guard: '40404040-4040-4040-8040-404040404040',
    mutation: '50505050-5050-4050-8050-505050505050',
    event: '60606060-6060-4060-8060-606060606060',
    request: '70707070-7070-4070-8070-707070707070'
});

const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43) });

function input(overrides: Partial<WorkspaceBootstrapInput> = {}): WorkspaceBootstrapInput {
    return {
        actorUserId: ID.user,
        actorDeviceId: ID.device,
        workspaceId: ID.workspace,
        displayName: 'Workspace Foundation',
        descriptionEnvelope: null,
        transitionGuardId: ID.guard,
        clientMutationId: ID.mutation,
        requestFingerprint: blob(32, 7),
        auditEventId: ID.event,
        requestId: ID.request,
        serverTime: 100,
        replayExpiresAt: 1_000,
        ...overrides
    };
}

async function count(table: string, column: string, value: string): Promise<number> {
    return (await env.COLLAB_DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`)
        .bind(value).first<number>('count')) ?? 0;
}

describe('CF-P4-002 atomic workspace bootstrap', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'workspace_bootstrap_migrations');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '41001', 'workspace-owner', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.user),
            env.COLLAB_DB.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES (?, ?, 'Bootstrap authority', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
            ).bind(ID.device, ID.user, publicJwk, blob(32, 2))
        ]);
    });

    it('creates one workspace, one active Owner, one audit event, and no Phase 5 key material', async () => {
        const [first, replay] = await Promise.all([
            bootstrapWorkspace(env.COLLAB_DB, input()),
            bootstrapWorkspace(env.COLLAB_DB, input())
        ]);
        expect(first).toEqual({ workspaceId: ID.workspace, httpStatus: 201 });
        expect(replay).toEqual(first);
        expect(await env.COLLAB_DB.prepare(
            `SELECT w.current_key_version, m.role, m.state, m.role_version
             FROM workspaces w JOIN memberships m ON m.workspace_id = w.id
             WHERE w.id = ? AND m.user_id = ? LIMIT 1`
        ).bind(ID.workspace, ID.user).first()).toEqual({
            current_key_version: 1, role: 'owner', state: 'active', role_version: 1
        });
        expect(await count('transition_guards', 'workspace_id', ID.workspace)).toBe(1);
        expect(await count('audit_events', 'workspace_id', ID.workspace)).toBe(1);
        expect(await count('workspace_key_versions', 'workspace_id', ID.workspace)).toBe(0);
        expect(await count('workspace_key_envelopes', 'workspace_id', ID.workspace)).toBe(0);
    });

    it('allows exactly one winner when distinct mutations race for the same workspace', async () => {
        const workspaceId = '31313131-3131-4131-8131-313131313131';
        const attempts = [
            input({ workspaceId, transitionGuardId: '41414141-4141-4141-8141-414141414141',
                clientMutationId: '51515151-5151-4151-8151-515151515151',
                auditEventId: '61616161-6161-4161-8161-616161616161',
                requestId: '71717171-7171-4171-8171-717171717171', requestFingerprint: blob(32, 1) }),
            input({ workspaceId, transitionGuardId: '42424242-4242-4242-8242-424242424242',
                clientMutationId: '52525252-5252-4252-8252-525252525252',
                auditEventId: '62626262-6262-4262-8262-626262626262',
                requestId: '72727272-7272-4272-8272-727272727272', requestFingerprint: blob(32, 2) })
        ];
        const settled = await Promise.allSettled(attempts.map(value => bootstrapWorkspace(env.COLLAB_DB, value)));
        expect(settled.filter(value => value.status === 'fulfilled')).toHaveLength(1);
        expect(settled.filter(value => value.status === 'rejected')).toHaveLength(1);
        expect(await count('workspaces', 'id', workspaceId)).toBe(1);
        expect(await count('memberships', 'workspace_id', workspaceId)).toBe(1);
        expect(await count('transition_guards', 'workspace_id', workspaceId)).toBe(1);
        expect(await count('audit_events', 'workspace_id', workspaceId)).toBe(1);
    });

    it('rolls back guard and domain writes when the audit event conflicts', async () => {
        const workspaceId = '32323232-3232-4232-8232-323232323232';
        await expect(bootstrapWorkspace(env.COLLAB_DB, input({
            workspaceId,
            transitionGuardId: '43434343-4343-4343-8343-434343434343',
            clientMutationId: '53535353-5353-4353-8353-535353535353',
            auditEventId: ID.event,
            requestId: '73737373-7373-4373-8373-737373737373',
            requestFingerprint: blob(32, 3)
        }))).rejects.toMatchObject({ code: 'PERSISTENCE_CONFLICT' });
        expect(await count('workspaces', 'id', workspaceId)).toBe(0);
        expect(await count('memberships', 'workspace_id', workspaceId)).toBe(0);
        expect(await count('transition_guards', 'workspace_id', workspaceId)).toBe(0);
    });

    it('rejects malformed input before any D1 side effect', async () => {
        const workspaceId = '33323232-3232-4232-8232-323232323232';
        await expect(bootstrapWorkspace(env.COLLAB_DB, input({
            workspaceId,
            displayName: ' leading-space',
            transitionGuardId: '44434343-4343-4343-8343-434343434343',
            clientMutationId: '54535353-5353-4353-8353-535353535353',
            auditEventId: '64636363-6363-4363-8363-636363636363',
            requestId: '74737373-7373-4373-8373-737373737373'
        }))).rejects.toMatchObject({ code: 'PERSISTENCE_INTEGRITY' });
        expect(await count('workspaces', 'id', workspaceId)).toBe(0);
        expect(await count('transition_guards', 'workspace_id', workspaceId)).toBe(0);
    });

    it('denies a revoked acting device and rolls back every bootstrap position', async () => {
        const workspaceId = '34323232-3232-4232-8232-323232323232';
        await env.COLLAB_DB.prepare(
            "UPDATE devices SET state = 'revoked', revoked_at = 200, revoke_reason = 'test_revoke' WHERE id = ?"
        ).bind(ID.device).run();
        await expect(bootstrapWorkspace(env.COLLAB_DB, input({
            workspaceId,
            transitionGuardId: '45434343-4343-4343-8343-434343434343',
            clientMutationId: '55535353-5353-4353-8353-535353535353',
            auditEventId: '65636363-6363-4363-8363-636363636363',
            requestId: '75737373-7373-4373-8373-737373737373',
            requestFingerprint: blob(32, 5)
        }))).rejects.toMatchObject({ code: 'PERSISTENCE_CONSTRAINT' });
        expect(await count('workspaces', 'id', workspaceId)).toBe(0);
        expect(await count('memberships', 'workspace_id', workspaceId)).toBe(0);
        expect(await count('transition_guards', 'workspace_id', workspaceId)).toBe(0);
        await env.COLLAB_DB.prepare(
            "UPDATE devices SET state = 'active', revoked_at = NULL, revoke_reason = NULL WHERE id = ?"
        ).bind(ID.device).run();
    });
});
