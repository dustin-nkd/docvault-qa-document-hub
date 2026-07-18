import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    SECURITY_RECIPE_CONTRACTS,
    buildDocumentMutationRecipe,
    buildEnvelopeProvisionRecipe,
    buildInvitationAcceptRecipe,
    buildMembershipChangeRecipe,
    buildRotationCommitRecipe,
    buildWorkspaceCreateRecipe,
    executeIdempotentRecipe,
    type RecipeBindings,
    type ReplayScope
} from '../../functions/_lib/persistence';

const ID = Object.freeze({
    owner: '11111111-1111-4111-8111-111111111111',
    ownerDevice: '22222222-2222-4222-8222-222222222222',
    workspace: '33333333-3333-4333-8333-333333333333',
    envelope: '44444444-4444-4444-8444-444444444444',
    guard: '55555555-5555-4555-8555-555555555555',
    mutation: '66666666-6666-4666-8666-666666666666',
    event: '77777777-7777-4777-8777-777777777777',
    request: '88888888-8888-4888-8888-888888888888',
    invitee: '99999999-9999-4999-8999-999999999999',
    inviteeDevice: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    invitation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
});

const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43) });
const audit = (event: string, workspace: string, user: string, device: string, target: string, request: string, time: number) =>
    [event, workspace, user, device, target, request, time] as const;

async function seedIdentity(user: string, device: string, subject: string, fingerprint: ArrayBuffer): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(user, subject, `synthetic-${subject}`),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(device, user, publicJwk, fingerprint)
    ]);
}

function workspaceBindings(fingerprint = blob(32, 5)): RecipeBindings {
    return {
        guard: [ID.guard, ID.owner, ID.ownerDevice, ID.workspace, ID.mutation,
            fingerprint, '{"workspaceId":"33333333-3333-4333-8333-333333333333"}', 10, 1000],
        domain: [
            [ID.workspace, 'Synthetic workspace', null, ID.owner, 10, 10],
            [ID.workspace, ID.owner, ID.owner, 10, 10]
        ],
        audit: audit(ID.event, ID.workspace, ID.owner, ID.ownerDevice, ID.workspace, ID.request, 10),
        result: [ID.guard]
    };
}

const workspaceScope = (fingerprint = blob(32, 5)): ReplayScope => ({
    actorUserId: ID.owner, actorDeviceId: ID.ownerDevice, workspaceId: ID.workspace,
    operation: 'workspace.create', clientMutationId: ID.mutation,
    requestFingerprint: fingerprint, serverTime: 11
});

describe('CF-P2-005 security mutation recipes', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'security_recipe_migrations');
        await seedIdentity(ID.owner, ID.ownerDevice, '101', blob(32, 2));
        await seedIdentity(ID.invitee, ID.inviteeDevice, '202', blob(32, 7));
    });

    it('publishes all seven approved static recipe contracts with one audit boundary', () => {
        expect(Object.keys(SECURITY_RECIPE_CONTRACTS).sort()).toEqual([
            'document.update', 'envelope.provision', 'invitation.accept', 'invitation.replace',
            'membership.change', 'rotation.commit', 'workspace.create'
        ]);
        for (const contract of Object.values(SECURITY_RECIPE_CONTRACTS)) {
            expect(contract.guard).not.toContain('${');
            expect(contract.guard).not.toMatch(/SELECT\s+\*/i);
            expect(contract.domain.length).toBeGreaterThan(0);
        }
    });

    it('converges concurrent workspace creation on one deterministic result', async () => {
        const first = executeIdempotentRecipe(env.COLLAB_DB,
            buildWorkspaceCreateRecipe(env.COLLAB_DB, workspaceBindings()), workspaceScope());
        const second = executeIdempotentRecipe(env.COLLAB_DB,
            buildWorkspaceCreateRecipe(env.COLLAB_DB, workspaceBindings()), workspaceScope());
        const results = await Promise.all([first, second]);
        expect(results[0]).toEqual(results[1]);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM workspaces WHERE id = ?')
            .bind(ID.workspace).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM transition_guards WHERE workspace_id = ?')
            .bind(ID.workspace).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE workspace_id = ?')
            .bind(ID.workspace).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM workspace_key_versions WHERE workspace_id = ?')
            .bind(ID.workspace).first<number>('count')).toBe(0);
        expect(await env.COLLAB_DB.prepare('SELECT current_key_version FROM workspaces WHERE id = ?')
            .bind(ID.workspace).first<number>('current_key_version')).toBe(1);
    });

    it('rejects reused fingerprints and revoked replay authority without side effects', async () => {
        await expect(executeIdempotentRecipe(env.COLLAB_DB,
            buildWorkspaceCreateRecipe(env.COLLAB_DB, workspaceBindings(blob(32, 9))),
            workspaceScope(blob(32, 9)))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        await expect(executeIdempotentRecipe(env.COLLAB_DB,
            buildWorkspaceCreateRecipe(env.COLLAB_DB, workspaceBindings()),
            { ...workspaceScope(), serverTime: 1_000 })).rejects.toMatchObject({ code: 'IDEMPOTENCY_EXPIRED' });
        await env.COLLAB_DB.prepare(
            `UPDATE devices SET state = 'revoked', revoked_at = 20, revoke_reason = 'test_revoke'
             WHERE id = ? AND user_id = ?`
        ).bind(ID.ownerDevice, ID.owner).run();
        await expect(executeIdempotentRecipe(env.COLLAB_DB,
            buildWorkspaceCreateRecipe(env.COLLAB_DB, workspaceBindings()), workspaceScope()))
            .rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
        await env.COLLAB_DB.prepare(
            `UPDATE devices SET state = 'active', revoked_at = NULL, revoke_reason = NULL
             WHERE id = ? AND user_id = ?`
        ).bind(ID.ownerDevice, ID.owner).run();
    });

    it('allows exactly one invitation acceptance and creates pending_key membership', async () => {
        const token = blob(32, 8);
        await env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '202', 'synthetic-invitee', 'editor', ?, 'pending', ?, NULL,
                     30, 259200030, NULL, NULL, NULL, NULL)`
        ).bind(ID.invitation, ID.workspace, token, ID.owner).run();
        const guard = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
        const mutation = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
        const bindings: RecipeBindings = {
            guard: [guard, ID.invitee, ID.inviteeDevice, ID.workspace, mutation, blob(32, 4),
                ID.invitation, token, '{"status":"pending_key"}', 40, 1000],
            domain: [
                [ID.invitee, 40, ID.invitation, ID.workspace, ID.invitee, token, 40],
                [ID.workspace, ID.invitee, ID.invitee, 40, ID.invitation]
            ],
            audit: audit('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', ID.workspace, ID.invitee,
                ID.inviteeDevice, ID.invitation, 'ffffffff-ffff-4fff-8fff-ffffffffffff', 40),
            result: [guard]
        };
        const scope: ReplayScope = { actorUserId: ID.invitee, actorDeviceId: ID.inviteeDevice,
            workspaceId: ID.workspace, operation: 'invitation.accept', clientMutationId: mutation,
            requestFingerprint: blob(32, 4), serverTime: 41 };
        const [a, b] = await Promise.all([
            executeIdempotentRecipe(env.COLLAB_DB, buildInvitationAcceptRecipe(env.COLLAB_DB, bindings), scope),
            executeIdempotentRecipe(env.COLLAB_DB, buildInvitationAcceptRecipe(env.COLLAB_DB, bindings), scope)
        ]);
        expect(a).toEqual(b);
        expect(await env.COLLAB_DB.prepare(
            'SELECT state FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(ID.workspace, ID.invitee).first<string>('state')).toBe('pending_key');
    });

    it('denies a last-Owner demotion before guard, domain, or audit side effects', async () => {
        const guard = '13131313-1313-4313-8313-131313131313';
        const mutation = '14141414-1414-4414-8414-141414141414';
        const bindings: RecipeBindings = {
            guard: [guard, ID.owner, ID.ownerDevice, ID.workspace, mutation, blob(32, 13),
                ID.owner, '{"role":"admin"}', ID.workspace, ID.owner, ID.ownerDevice,
                ID.owner, 1, 'admin', ID.workspace, 45, 1000],
            domain: [['admin', ID.workspace, ID.owner, 1]],
            audit: audit('15151515-1515-4515-8515-151515151515', ID.workspace, ID.owner,
                ID.ownerDevice, ID.owner, '16161616-1616-4616-8616-161616161616', 45),
            result: [guard]
        };
        const scope: ReplayScope = { actorUserId: ID.owner, actorDeviceId: ID.ownerDevice,
            workspaceId: ID.workspace, operation: 'membership.change', clientMutationId: mutation,
            requestFingerprint: blob(32, 13), serverTime: 46 };
        await expect(executeIdempotentRecipe(env.COLLAB_DB,
            buildMembershipChangeRecipe(env.COLLAB_DB, bindings), scope))
            .rejects.toMatchObject({ code: 'PERSISTENCE_CONSTRAINT' });
        expect(await env.COLLAB_DB.prepare(
            'SELECT role FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(ID.workspace, ID.owner).first<string>('role')).toBe('owner');
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM mutation_results WHERE id = ?')
            .bind(guard).first<number>('count')).toBe(0);
    });

    it('allows one envelope provision winner and activates readiness exactly once', async () => {
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_provision',
                     ?, ?, 49, 49, NULL)`
        ).bind(ID.workspace, ID.ownerDevice, ID.owner).run();
        const make = (suffix: string, fill: number) => {
            const guard = `17${suffix.repeat(6)}-1717-4717-8717-${suffix.repeat(12)}`;
            const mutation = `18${suffix.repeat(6)}-1818-4818-8818-${suffix.repeat(12)}`;
            const envelope = `19${suffix.repeat(6)}-1919-4919-8919-${suffix.repeat(12)}`;
            const bindings: RecipeBindings = {
                guard: [guard, ID.owner, ID.ownerDevice, ID.workspace, mutation, blob(32, fill),
                    envelope, `{"envelope":"${envelope}"}`, ID.workspace, ID.owner,
                    ID.ownerDevice, ID.invitee, ID.inviteeDevice, blob(32, 7), 1, 50, 1000],
                domain: [
                    [envelope, ID.workspace, 1, ID.invitee, ID.inviteeDevice, blob(32, 7),
                        ID.owner, ID.ownerDevice, publicJwk, blob(32, fill), blob(12, fill),
                        blob(48, fill), blob(32, fill), 50],
                    [50, ID.workspace, ID.invitee]
                ],
                audit: audit(`20${suffix.repeat(6)}-2020-4020-8020-${suffix.repeat(12)}`,
                    ID.workspace, ID.owner, ID.ownerDevice, envelope,
                    `21${suffix.repeat(6)}-2121-4121-8121-${suffix.repeat(12)}`, 50),
                result: [guard]
            };
            const scope: ReplayScope = { actorUserId: ID.owner, actorDeviceId: ID.ownerDevice,
                workspaceId: ID.workspace, operation: 'envelope.provision', clientMutationId: mutation,
                requestFingerprint: blob(32, fill), serverTime: 51 };
            return executeIdempotentRecipe(env.COLLAB_DB,
                buildEnvelopeProvisionRecipe(env.COLLAB_DB, bindings), scope);
        };
        const settled = await Promise.allSettled([make('1', 1), make('2', 2)]);
        expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS count FROM workspace_key_envelopes WHERE workspace_id = ? AND target_device_id = ? AND key_version = 1'
        ).bind(ID.workspace, ID.inviteeDevice).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare(
            'SELECT state FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(ID.workspace, ID.invitee).first<string>('state')).toBe('active');
    });

    it('allows one complete key rotation commit and leaves one current version', async () => {
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare("UPDATE workspaces SET state = 'rotating', updated_at = 70 WHERE id = ?").bind(ID.workspace),
            env.COLLAB_DB.prepare(
                `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
                  rotation_reason, created_by_device_id, created_by_user_id, created_at,
                  committed_at, retired_at)
                 VALUES (?, 2, 'P256-HKDF-SHA256-A256GCM-v1', 'preparing', 'scheduled',
                         ?, ?, 70, NULL, NULL)`
            ).bind(ID.workspace, ID.ownerDevice, ID.owner),
            ...[[ID.owner, ID.ownerDevice, blob(32, 2), '22222222-aaaa-4aaa-8aaa-222222222222'],
                [ID.invitee, ID.inviteeDevice, blob(32, 7), '23232323-aaaa-4aaa-8aaa-232323232323']]
                .map(([user, device, fingerprint, envelope]) => env.COLLAB_DB.prepare(
                    `INSERT INTO workspace_key_envelopes (id, workspace_id, key_version,
                      target_user_id, target_device_id, target_fingerprint, wrapper_user_id,
                      wrapper_device_id, suite, ephemeral_public_jwk, hkdf_salt, nonce,
                      ciphertext, aad_digest, created_at, revoked_at)
                     VALUES (?, ?, 2, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1',
                             ?, ?, ?, ?, ?, 70, NULL)`
                ).bind(envelope, ID.workspace, user, device, fingerprint, ID.owner,
                    ID.ownerDevice, publicJwk, blob(32, 2), blob(12, 2), blob(48, 2), blob(32, 2)))
        ]);
        const guard = '24242424-2424-4424-8424-242424242424';
        const mutation = '25252525-2525-4525-8525-252525252525';
        const bindings: RecipeBindings = {
            guard: [guard, ID.owner, ID.ownerDevice, ID.workspace, mutation, blob(32, 24),
                '2', '{"keyVersion":2}', ID.workspace, ID.owner, ID.ownerDevice, 1, 2, 80, 1000],
            domain: [[80, ID.workspace, 1], [80, ID.workspace, 2], [2, 80, ID.workspace, 1]],
            audit: audit('26262626-2626-4626-8626-262626262626', ID.workspace, ID.owner,
                ID.ownerDevice, '2', '27272727-2727-4727-8727-272727272727', 80),
            result: [guard]
        };
        const scope: ReplayScope = { actorUserId: ID.owner, actorDeviceId: ID.ownerDevice,
            workspaceId: ID.workspace, operation: 'rotation.commit', clientMutationId: mutation,
            requestFingerprint: blob(32, 24), serverTime: 81 };
        const [a, b] = await Promise.all([
            executeIdempotentRecipe(env.COLLAB_DB, buildRotationCommitRecipe(env.COLLAB_DB, bindings), scope),
            executeIdempotentRecipe(env.COLLAB_DB, buildRotationCommitRecipe(env.COLLAB_DB, bindings), scope)
        ]);
        expect(a).toEqual(b);
        expect(await env.COLLAB_DB.prepare(
            "SELECT COUNT(*) AS count FROM workspace_key_versions WHERE workspace_id = ? AND state = 'current'"
        ).bind(ID.workspace).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT current_key_version FROM workspaces WHERE id = ?')
            .bind(ID.workspace).first<number>('current_key_version')).toBe(2);
    });

    it('lets one document CAS win and rolls the stale competitor back completely', async () => {
        const document = '12121212-1212-4212-8212-121212121212';
        await env.COLLAB_DB.prepare(
            `INSERT INTO documents (id, workspace_id, current_revision, current_key_version,
              current_ciphertext_digest, ciphertext_bytes, envelope_version, state, created_by,
              created_at, updated_at, tombstoned_at)
             VALUES (?, ?, 1, 2, ?, 18, 1, 'active', ?, 50, 50, NULL)`
        ).bind(document, ID.workspace, blob(32, 1), ID.owner).run();
        const make = (suffix: string, fill: number) => {
            const guard = `${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}${suffix}-${suffix}${suffix}${suffix}${suffix}-4${suffix}${suffix}${suffix}-8${suffix}${suffix}${suffix}-${suffix.repeat(12)}`;
            const mutation = `${fill}${fill}${fill}${fill}${fill}${fill}${fill}${fill}-${fill}${fill}${fill}${fill}-4${fill}${fill}${fill}-8${fill}${fill}${fill}-${String(fill).repeat(12)}`;
            const bindings: RecipeBindings = {
                guard: [guard, ID.owner, ID.ownerDevice, ID.workspace, mutation, blob(32, fill),
                    document, `{"revision":2,"winner":${fill}}`, ID.workspace, ID.owner,
                    ID.ownerDevice, document, 1, 2, 60, 1000],
                domain: [
                    [document, ID.workspace, 2, 1, 2, blob(18, fill), blob(32, fill), 18,
                        ID.owner, ID.ownerDevice, mutation, 60],
                    [2, 2, blob(32, fill), 18, 60, document, ID.workspace, 1]
                ],
                audit: audit(`abababab-abab-4aba-8aba-${suffix.repeat(12)}`, ID.workspace, ID.owner,
                    ID.ownerDevice, document, `acacacac-acac-4aca-8aca-${suffix.repeat(12)}`, 60),
                result: [guard]
            };
            const scope: ReplayScope = { actorUserId: ID.owner, actorDeviceId: ID.ownerDevice,
                workspaceId: ID.workspace, operation: 'document.update', clientMutationId: mutation,
                requestFingerprint: blob(32, fill), serverTime: 61 };
            return executeIdempotentRecipe(env.COLLAB_DB,
                buildDocumentMutationRecipe(env.COLLAB_DB, bindings), scope);
        };
        const settled = await Promise.allSettled([make('1', 1), make('2', 2)]);
        expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(settled.filter(item => item.status === 'rejected')).toHaveLength(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM document_revisions WHERE document_id = ?')
            .bind(document).first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT current_revision FROM documents WHERE id = ?')
            .bind(document).first<number>('current_revision')).toBe(2);
    });
});
