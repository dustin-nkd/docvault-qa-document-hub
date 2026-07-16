import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    RETENTION_BASELINES,
    buildRetentionPurgeStatements,
    runRetentionPurge
} from '../../functions/_lib/persistence/retention';

const NOW = 40_000_000_000;
const OPERATIONAL_CUTOFF = NOW - RETENTION_BASELINES.operationalMilliseconds;
const AUDIT_CUTOFF = NOW - RETENTION_BASELINES.auditMilliseconds;
const IDS = Object.freeze({
    userA: '11111111-1111-4111-8111-111111111111',
    userB: '22222222-2222-4222-8222-222222222222',
    workspaceA: '33333333-3333-4333-8333-333333333333',
    workspaceB: '44444444-4444-4444-8444-444444444444',
    deviceA: '55555555-5555-4555-8555-555555555555',
    deviceB: '66666666-6666-4666-8666-666666666666',
    invitationOld: '77777777-7777-4777-8777-777777777777',
    invitationActive: '88888888-8888-4888-8888-888888888888',
    transition: '99999999-9999-4999-8999-999999999999',
    document: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    revisionMutation: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
});
const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});
const uuid = (prefix: string, suffix: string) => `${prefix.repeat(8)}-${prefix.repeat(4)}-4${prefix.repeat(3)}-8${prefix.repeat(3)}-${suffix.repeat(12)}`;

async function seedTenant(userId: string, workspaceId: string, deviceId: string, subject: string): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(userId, subject, `synthetic-${subject}`),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Synthetic retention workspace', NULL, 'active', 1, ?, 1, 1, NULL)`
        ).bind(workspaceId, userId),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, 1, 1, NULL, 1)`
        ).bind(workspaceId, userId, userId),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(deviceId, userId, publicJwk, blob(32, Number(subject))),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_create',
                     ?, ?, 1, 1, NULL)`
        ).bind(workspaceId, deviceId, userId)
    ]);
}

async function seedRetentionMatrix(): Promise<void> {
    await seedTenant(IDS.userA, IDS.workspaceA, IDS.deviceA, '11');
    await seedTenant(IDS.userB, IDS.workspaceB, IDS.deviceB, '22');
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
              last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at,
              revoked_at, revoke_reason)
             VALUES (?, ?, ?, NULL, 1, 1, 1, ?, ?, NULL, NULL)`
        ).bind(uuid('1', '1'), blob(32, 1), IDS.userA, OPERATIONAL_CUTOFF, OPERATIONAL_CUTOFF),
        env.COLLAB_DB.prepare(
            `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
              last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at,
              revoked_at, revoke_reason)
             VALUES (?, ?, ?, NULL, 1, 1, 1, ?, ?, NULL, NULL)`
        ).bind(uuid('2', '2'), blob(32, 2), IDS.userA, NOW + 1, NOW + 1),
        env.COLLAB_DB.prepare(
            `INSERT INTO oauth_transactions (id, state_digest, pkce_verifier_envelope,
              callback_origin, callback_path, invitation_id, created_at, expires_at,
              consumed_at, status)
             VALUES (?, ?, ?, 'https://example.test', '/callback', NULL, 1, ?, ?, 'consumed')`
        ).bind(uuid('3', '3'), blob(32, 3), blob(18, 3), OPERATIONAL_CUTOFF + 1, OPERATIONAL_CUTOFF),
        env.COLLAB_DB.prepare(
            `INSERT INTO oauth_transactions (id, state_digest, pkce_verifier_envelope,
              callback_origin, callback_path, invitation_id, created_at, expires_at,
              consumed_at, status)
             VALUES (?, ?, ?, 'https://example.test', '/callback', NULL, ?, ?, NULL, 'pending')`
        ).bind(uuid('4', '4'), blob(32, 4), blob(18, 4), NOW, NOW + 1),
        env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '11', 'synthetic-11', 'viewer', ?, 'pending', ?, NULL,
                     ?, ?, NULL, NULL, NULL, NULL)`
        ).bind(IDS.invitationOld, IDS.workspaceA, blob(32, 5), IDS.userA,
            OPERATIONAL_CUTOFF - 259200000, OPERATIONAL_CUTOFF),
        env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '22', 'synthetic-22', 'viewer', ?, 'pending', ?, NULL,
                     ?, ?, NULL, NULL, NULL, NULL)`
        ).bind(IDS.invitationActive, IDS.workspaceA, blob(32, 6), IDS.userA, NOW, NOW + 259200000),
        env.COLLAB_DB.prepare(
            `INSERT INTO transition_guards (id, actor_user_id, actor_device_id, workspace_id,
              operation, client_mutation_id, request_fingerprint, invitation_id,
              credential_digest, http_status, result_json, created_at, expires_at, authority_guard)
             VALUES (?, ?, ?, ?, 'invitation.accept', ?, ?, ?, ?, 200, '{}', ?, ?, 1)`
        ).bind(IDS.transition, IDS.userA, IDS.deviceA, IDS.workspaceA, uuid('5', '5'),
            blob(32, 7), IDS.invitationOld, blob(32, 5),
            OPERATIONAL_CUTOFF - 259200000, NOW),
        env.COLLAB_DB.prepare(
            `INSERT INTO documents (id, workspace_id, current_revision, current_key_version,
              current_ciphertext_digest, ciphertext_bytes, envelope_version, state, created_by,
              created_at, updated_at, tombstoned_at)
             VALUES (?, ?, 1, 1, ?, 18, 1, 'active', ?, 2, 2, NULL)`
        ).bind(IDS.document, IDS.workspaceA, blob(32, 8), IDS.userA),
        env.COLLAB_DB.prepare(
            `INSERT INTO document_revisions (document_id, workspace_id, revision, base_revision,
              operation, key_version, ciphertext_envelope, ciphertext_digest, ciphertext_bytes,
              actor_user_id, actor_device_id, client_mutation_id, server_time)
             VALUES (?, ?, 1, 0, 'create', 1, ?, ?, 18, ?, ?, ?, 2)`
        ).bind(IDS.document, IDS.workspaceA, blob(18, 8), blob(32, 8), IDS.userA,
            IDS.deviceA, IDS.revisionMutation),
        env.COLLAB_DB.prepare(
            `INSERT INTO retention_holds (id, workspace_id, hold_type, reason_code, created_by,
              created_at, expires_at, released_at, status)
             VALUES (?, ?, 'legal', 'active_legal_hold', ?, 2, NULL, NULL, 'active')`
        ).bind(uuid('6', '6'), IDS.workspaceB, IDS.userB),
        env.COLLAB_DB.prepare(
            `INSERT INTO retention_holds (id, workspace_id, hold_type, reason_code, created_by,
              created_at, expires_at, released_at, status)
             VALUES (?, ?, 'operational', 'expired_test_hold', ?, 2, 3, NULL, 'expired')`
        ).bind(uuid('7', '7'), IDS.workspaceA, IDS.userA)
    ]);
    await env.COLLAB_DB.prepare(
        `UPDATE invitations SET state = 'accepted', accepted_by = ?, accepted_at = ?
         WHERE id = ?`
    ).bind(IDS.userA, OPERATIONAL_CUTOFF, IDS.invitationOld).run();

    const mutations = Array.from({ length: 3 }, (_, index) => env.COLLAB_DB.prepare(
        `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id,
          http_status, result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'document.update', ?, ?, 'document', ?, 200, '{}', 2, ?)`
    ).bind(uuid('8', String(index + 1)), IDS.userA, IDS.deviceA, IDS.workspaceA,
        uuid('9', String(index + 1)), blob(32, index + 10), IDS.document, NOW));
    await env.COLLAB_DB.batch(mutations);

    const auditRows = [
        [uuid('a', '1'), IDS.workspaceA, AUDIT_CUTOFF - 1, uuid('b', '1')],
        [uuid('a', '2'), IDS.workspaceA, AUDIT_CUTOFF, uuid('b', '2')],
        [uuid('a', '3'), IDS.workspaceB, AUDIT_CUTOFF - 1, uuid('b', '3')]
    ];
    await env.COLLAB_DB.batch(auditRows.map(([eventId, workspaceId, serverTime, requestId]) =>
        env.COLLAB_DB.prepare(
            `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
              outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
              request_id, server_time, metadata_json, correction_of_event_id, related_event_id,
              hold_state)
             VALUES (?, 9, ?, 'retention.test', 'success', 'synthetic', NULL, NULL,
                     'system', 'retention', ?, ?, '{}', NULL, NULL, 'none')`
        ).bind(eventId, workspaceId, requestId, serverTime)));
}

describe('CF-P2-006 retention, privacy, and scale matrix', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'retention_matrix_migrations');
        await seedRetentionMatrix();
    }, 30_000);

    it('purges deterministic bounded records while preserving active, held, boundary, and revision state', async () => {
        await expect(env.COLLAB_DB.prepare('DELETE FROM audit_events WHERE event_id = ?')
            .bind(uuid('a', '1')).run()).rejects.toThrow(/append-only/);
        await expect(env.COLLAB_DB.prepare('DELETE FROM transition_guards WHERE id = ?')
            .bind(IDS.transition).run()).rejects.toThrow(/immutable/);

        const first = await runRetentionPurge(env.COLLAB_DB, {
            auditRunId: uuid('c', '1'), transitionRunId: uuid('d', '1'),
            serverTime: NOW, maximumRowsPerType: 2
        });
        expect(first).toEqual({
            transitionGuards: 1, mutationResults: 2, oauthTransactions: 1,
            sessions: 1, invitations: 1, auditEvents: 1
        });
        const second = await runRetentionPurge(env.COLLAB_DB, {
            auditRunId: uuid('c', '2'), transitionRunId: uuid('d', '2'),
            serverTime: NOW, maximumRowsPerType: 2
        });
        expect(second).toEqual({
            transitionGuards: 0, mutationResults: 1, oauthTransactions: 0,
            sessions: 0, invitations: 0, auditEvents: 0
        });
        const third = await runRetentionPurge(env.COLLAB_DB, {
            auditRunId: uuid('c', '3'), transitionRunId: uuid('d', '3'),
            serverTime: NOW, maximumRowsPerType: 2
        });
        expect(Object.values(third).every(count => count === 0)).toBe(true);

        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM oauth_transactions').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM invitations').first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM mutation_results').first<number>('count')).toBe(0);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM document_revisions').first<number>('count')).toBe(1);
        const remainingAudit = await env.COLLAB_DB.prepare(
            'SELECT workspace_id, server_time FROM audit_events ORDER BY sequence'
        ).all<{ workspace_id: string; server_time: number }>();
        expect(remainingAudit.results).toEqual([
            { workspace_id: IDS.workspaceA, server_time: AUDIT_CUTOFF },
            { workspace_id: IDS.workspaceB, server_time: AUDIT_CUTOFF - 1 }
        ]);
        expect(await env.COLLAB_DB.prepare(
            "SELECT COUNT(*) AS count FROM retention_purge_runs WHERE status = 'completed'"
        ).first<number>('count')).toBe(6);
    });

    it('rejects unbounded, invalid-time, and non-UUID purge inputs before D1 execution', async () => {
        for (const input of [
            { auditRunId: uuid('e', '1'), transitionRunId: uuid('f', '1'), serverTime: NOW, maximumRowsPerType: 0 },
            { auditRunId: uuid('e', '2'), transitionRunId: uuid('f', '2'), serverTime: NOW, maximumRowsPerType: 101 },
            { auditRunId: uuid('e', '3'), transitionRunId: uuid('f', '3'), serverTime: -1, maximumRowsPerType: 1 }
        ]) await expect(runRetentionPurge(env.COLLAB_DB, input)).rejects.toMatchObject({ code: 'PERSISTENCE_INTEGRITY' });
    });

    it('rolls back an interrupted purge batch without partial deletion or running authorization', async () => {
        const before = await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM mutation_results').first<number>('count');
        const statements = buildRetentionPurgeStatements(env.COLLAB_DB, {
            auditRunId: uuid('e', '4'), transitionRunId: uuid('f', '4'),
            serverTime: NOW, maximumRowsPerType: 1
        });
        statements[8] = env.COLLAB_DB.prepare('INVALID PURGE CHECKPOINT');
        await expect(env.COLLAB_DB.batch(statements)).rejects.toThrow();
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM mutation_results').first<number>('count')).toBe(before);
        expect(await env.COLLAB_DB.prepare(
            "SELECT COUNT(*) AS count FROM retention_purge_runs WHERE status = 'running'"
        ).first<number>('count')).toBe(0);
    });

    it('keeps protected canaries out of schema, rows, errors, and operational output', async () => {
        const canary = 'cf-p2-006-raw-session-token-canary';
        let failure: unknown;
        try {
            await runRetentionPurge(env.COLLAB_DB, {
                auditRunId: canary,
                transitionRunId: uuid('f', '5'),
                serverTime: NOW,
                maximumRowsPerType: 1
            });
        } catch (error) {
            failure = error;
        }
        expect(failure).toMatchObject({ code: 'PERSISTENCE_CONSTRAINT' });
        expect(String(failure)).not.toContain(canary);
        const schema = await env.COLLAB_DB.prepare(
            `SELECT name, sql FROM sqlite_master
             WHERE type IN ('table', 'index', 'trigger') ORDER BY name`
        ).all<{ name: string; sql: string | null }>();
        const visibleRows = await Promise.all([
            env.COLLAB_DB.prepare(
                'SELECT display_login, display_name, avatar_url FROM users ORDER BY id'
            ).all(),
            env.COLLAB_DB.prepare(
                'SELECT display_name, state FROM workspaces ORDER BY id'
            ).all(),
            env.COLLAB_DB.prepare(
                'SELECT target_login_snapshot, state FROM invitations ORDER BY id'
            ).all(),
            env.COLLAB_DB.prepare(
                'SELECT event_type, reason_code, metadata_json FROM audit_events ORDER BY sequence'
            ).all(),
            env.COLLAB_DB.prepare(
                'SELECT reason_code, status FROM retention_holds ORDER BY id'
            ).all()
        ]);
        expect(JSON.stringify({ schema: schema.results, rows: visibleRows.map(result => result.results) }))
            .not.toContain(canary);
    });
});
