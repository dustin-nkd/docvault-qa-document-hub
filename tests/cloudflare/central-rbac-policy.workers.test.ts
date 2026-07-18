import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    RBAC_ACTIONS,
    authorizeWorkspaceAction,
    evaluateRbacPolicy,
    type RbacAction,
    type RbacContext,
    type RbacSubject,
    type WorkspaceRole
} from '../../functions/_lib/rbac';

const ID = Object.freeze({
    user: '11112222-3333-4444-8aaa-555566667777',
    device: '22223333-4444-4555-8aaa-666677778888',
    workspace: '33334444-5555-4666-8aaa-777788889999',
    otherWorkspace: '44445555-6666-4777-8aaa-88889999aaaa'
});

const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43) });

const activeSubject = (role: WorkspaceRole, overrides: Partial<Extract<RbacSubject, { kind: 'member' }>> = {}): RbacSubject => ({
    kind: 'member', role, membershipState: 'active', actingDeviceState: 'active', keyReady: true, ...overrides
});

function contextFor(action: RbacAction): RbacContext {
    const common = { resourceScope: 'same-workspace' } as const;
    if (action === 'invitation.create' || action === 'invitation.revoke') {
        return { ...common, targetRole: 'editor' };
    }
    if (action === 'membership.change-role') {
        return { ...common, targetRole: 'editor', desiredRole: 'viewer' };
    }
    if (action === 'membership.remove') return { ...common, targetRole: 'editor' };
    if (action === 'ownership.transfer') {
        return { ...common, targetRole: 'admin', targetMembershipState: 'active',
            targetIsSelf: false, recentAuthentication: true };
    }
    if (action === 'device.revoke-other') {
        return { ...common, targetRole: 'editor', recentAuthentication: true };
    }
    return common;
}

const ALLOWED: Readonly<Record<WorkspaceRole, readonly RbacAction[]>> = Object.freeze({
    owner: RBAC_ACTIONS.filter(action => !['workspace.export', 'workspace.delete'].includes(action)),
    admin: RBAC_ACTIONS.filter(action => ![
        'ownership.transfer', 'workspace.export', 'workspace.delete'
    ].includes(action)),
    editor: ['workspace.read-status', 'workspace.read', 'document.read', 'document.write',
        'document.copy-in', 'member.list', 'device.manage-own'],
    viewer: ['workspace.read-status', 'workspace.read', 'document.read', 'member.list', 'device.manage-own']
});

describe('CF-P4-003 central deny-by-default RBAC policy', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'central_rbac_migrations');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '51001', 'rbac-owner', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.user),
            env.COLLAB_DB.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES (?, ?, 'RBAC device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
            ).bind(ID.device, ID.user, publicJwk, blob(32, 2)),
            ...[ID.workspace, ID.otherWorkspace].map((workspaceId, index) => env.COLLAB_DB.prepare(
                `INSERT INTO workspaces (id, display_name, description_envelope, state,
                  current_key_version, created_by, created_at, updated_at, deleted_at)
                 VALUES (?, ?, NULL, 'active', 1, ?, 2, 2, NULL)`
            ).bind(workspaceId, `RBAC workspace ${index + 1}`, ID.user)),
            env.COLLAB_DB.prepare(
                `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
                  accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
                 VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
            ).bind(ID.workspace, ID.user, ID.user)
        ]);
    });

    it('enforces the complete active role/action matrix from one policy source', () => {
        for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
            for (const action of RBAC_ACTIONS) {
                const result = evaluateRbacPolicy({ action, subject: activeSubject(role), context: contextFor(action) });
                expect(result.allowed, `${role}:${action}`).toBe(ALLOWED[role].includes(action));
            }
        }
        expect(Reflect.apply(evaluateRbacPolicy, undefined, [{
            action: 'unknown.action', subject: activeSubject('owner')
        }])).toEqual({ allowed: false, code: 'OPERATION_NOT_PERMITTED' });
    });

    it('allows pending_key only own readiness/device setup and denies removed or unauthenticated principals', () => {
        for (const role of ['owner', 'admin', 'editor', 'viewer'] as const) {
            for (const action of RBAC_ACTIONS) {
                const pending = evaluateRbacPolicy({ action, subject: activeSubject(role, {
                    membershipState: 'pending_key', actingDeviceState: 'absent', keyReady: false
                }), context: contextFor(action) });
                expect(pending.allowed, `pending:${role}:${action}`)
                    .toBe(['workspace.read-status', 'device.manage-own'].includes(action));
            }
        }
        for (const subject of [activeSubject('owner', { membershipState: 'removed' }),
            { kind: 'guest' } as const, { kind: 'non-member' } as const]) {
            expect(evaluateRbacPolicy({ action: 'workspace.read', subject }).code).toBe('RESOURCE_NOT_FOUND');
        }
        expect(evaluateRbacPolicy({ action: 'workspace.read', subject: { kind: 'unauthenticated' } }))
            .toEqual({ allowed: false, code: 'UNAUTHENTICATED' });
    });

    it('enforces invitation, role-change, removal, and Admin target ceilings', () => {
        const owner = activeSubject('owner');
        const admin = activeSubject('admin');
        expect(evaluateRbacPolicy({ action: 'invitation.create', subject: owner,
            context: { targetRole: 'admin' } }).allowed).toBe(true);
        expect(evaluateRbacPolicy({ action: 'invitation.create', subject: admin,
            context: { targetRole: 'admin' } }).code).toBe('OPERATION_NOT_PERMITTED');
        expect(evaluateRbacPolicy({ action: 'membership.change-role', subject: owner,
            context: { targetRole: 'admin', desiredRole: 'viewer' } }).allowed).toBe(true);
        expect(evaluateRbacPolicy({ action: 'membership.change-role', subject: admin,
            context: { targetRole: 'admin', desiredRole: 'viewer' } }).allowed).toBe(false);
        expect(evaluateRbacPolicy({ action: 'membership.change-role', subject: admin,
            context: { targetRole: 'editor', desiredRole: 'admin' } }).allowed).toBe(false);
        expect(evaluateRbacPolicy({ action: 'membership.remove', subject: owner,
            context: { targetRole: 'admin' } }).allowed).toBe(true);
        expect(evaluateRbacPolicy({ action: 'membership.remove', subject: admin,
            context: { targetRole: 'admin' } }).allowed).toBe(false);
        expect(evaluateRbacPolicy({ action: 'membership.remove', subject: owner,
            context: { targetRole: 'owner' } }).allowed).toBe(false);
    });

    it('requires recent authentication and preserves ownership and last-Owner invariants', () => {
        const owner = activeSubject('owner');
        expect(evaluateRbacPolicy({ action: 'ownership.transfer', subject: owner,
            context: { targetRole: 'admin', targetMembershipState: 'active', targetIsSelf: false } }).code)
            .toBe('RECENT_AUTHENTICATION_REQUIRED');
        expect(evaluateRbacPolicy({ action: 'ownership.transfer', subject: owner,
            context: { targetRole: 'admin', targetMembershipState: 'active', targetIsSelf: false,
                recentAuthentication: true } }).allowed).toBe(true);
        expect(evaluateRbacPolicy({ action: 'ownership.transfer', subject: activeSubject('admin'),
            context: { targetRole: 'editor', targetMembershipState: 'active', targetIsSelf: false,
                recentAuthentication: true } }).allowed).toBe(false);
        for (const action of ['membership.change-role', 'membership.remove'] as const) {
            expect(evaluateRbacPolicy({ action, subject: owner,
                context: { targetRole: 'owner', desiredRole: 'admin', wouldRemoveLastOwner: true } }).code)
                .toBe('LAST_OWNER_REQUIRED');
        }
    });

    it('requires an active key-ready device only for device-bound protected actions', () => {
        for (const state of ['absent', 'revoked'] as const) {
            expect(evaluateRbacPolicy({ action: 'document.read',
                subject: activeSubject('viewer', { actingDeviceState: state }) }).code)
                .toBe('DEVICE_NOT_AUTHORIZED');
            expect(evaluateRbacPolicy({ action: 'workspace.read',
                subject: activeSubject('viewer', { actingDeviceState: state }) }).allowed).toBe(true);
        }
        expect(evaluateRbacPolicy({ action: 'document.write',
            subject: activeSubject('editor', { keyReady: false }) }).code).toBe('KEY_PROVISIONING_REQUIRED');
        expect(evaluateRbacPolicy({ action: 'document.write', subject: activeSubject('editor') }).allowed).toBe(true);
        expect(evaluateRbacPolicy({ action: 'document.write', subject: activeSubject('viewer') }).code)
            .toBe('OPERATION_NOT_PERMITTED');
    });

    it('maps tenant/resource ambiguity uniformly and keeps lifecycle actions deny-closed', () => {
        for (const resourceScope of ['other-workspace', 'missing', 'deleted', 'malformed'] as const) {
            expect(evaluateRbacPolicy({ action: 'workspace.read', subject: activeSubject('owner'),
                context: { resourceScope } })).toEqual({ allowed: false, code: 'RESOURCE_NOT_FOUND' });
        }
        for (const action of ['workspace.export', 'workspace.delete'] as const) {
            expect(evaluateRbacPolicy({ action, subject: activeSubject('owner') }).code)
                .toBe('LIFECYCLE_POLICY_UNAVAILABLE');
            expect(evaluateRbacPolicy({ action, subject: activeSubject('admin') }).code)
                .toBe('OPERATION_NOT_PERMITTED');
        }
    });

    it('re-reads current D1 membership authority on every authorization request', async () => {
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: null, workspaceId: ID.workspace,
            action: 'membership.remove', context: { targetRole: 'editor' }
        })).toEqual({ allowed: true, code: 'ALLOWED' });
        await env.COLLAB_DB.prepare(
            "UPDATE memberships SET role = 'viewer', role_version = role_version + 1 WHERE workspace_id = ? AND user_id = ?"
        ).bind(ID.workspace, ID.user).run();
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: null, workspaceId: ID.workspace,
            action: 'membership.remove', context: { targetRole: 'editor' }
        })).toEqual({ allowed: false, code: 'OPERATION_NOT_PERMITTED' });
        await env.COLLAB_DB.prepare(
            "UPDATE memberships SET role = 'owner', role_version = role_version + 1 WHERE workspace_id = ? AND user_id = ?"
        ).bind(ID.workspace, ID.user).run();
    });

    it('derives cross-tenant, deactivated-user, device, and key readiness from D1', async () => {
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: null, workspaceId: ID.otherWorkspace,
            action: 'workspace.read'
        })).toEqual({ allowed: false, code: 'RESOURCE_NOT_FOUND' });
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: ID.device, workspaceId: ID.workspace,
            action: 'document.read'
        })).toEqual({ allowed: false, code: 'KEY_PROVISIONING_REQUIRED' });
        await env.COLLAB_DB.prepare(
            "UPDATE devices SET state = 'revoked', revoked_at = 3, revoke_reason = 'test_revoke' WHERE id = ?"
        ).bind(ID.device).run();
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: ID.device, workspaceId: ID.workspace,
            action: 'document.read'
        })).toEqual({ allowed: false, code: 'DEVICE_NOT_AUTHORIZED' });
        await env.COLLAB_DB.prepare(
            "UPDATE devices SET state = 'active', revoked_at = NULL, revoke_reason = NULL WHERE id = ?"
        ).bind(ID.device).run();
        await env.COLLAB_DB.prepare(
            "UPDATE users SET status = 'deactivated', deactivated_at = 4, updated_at = 4 WHERE id = ?"
        ).bind(ID.user).run();
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: null, workspaceId: ID.workspace,
            action: 'workspace.read'
        })).toEqual({ allowed: false, code: 'UNAUTHENTICATED' });
        await env.COLLAB_DB.prepare(
            "UPDATE users SET status = 'active', deactivated_at = NULL, updated_at = 5 WHERE id = ?"
        ).bind(ID.user).run();
        await env.COLLAB_DB.prepare(
            "UPDATE workspaces SET state = 'deleted', deleted_at = 6, updated_at = 6 WHERE id = ?"
        ).bind(ID.workspace).run();
        expect(await authorizeWorkspaceAction(env.COLLAB_DB, {
            actorUserId: ID.user, actingDeviceId: null, workspaceId: ID.workspace,
            action: 'workspace.read', context: { resourceScope: 'same-workspace' }
        })).toEqual({ allowed: false, code: 'RESOURCE_NOT_FOUND' });
        await env.COLLAB_DB.prepare(
            "UPDATE workspaces SET state = 'active', deleted_at = NULL, updated_at = 7 WHERE id = ?"
        ).bind(ID.workspace).run();
    });
});
