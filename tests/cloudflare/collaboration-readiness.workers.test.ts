import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { COLLABORATION_QUERY_CONTRACTS } from '../../functions/_lib/collaboration-query-contract';

const IDS = Object.freeze({
    userA: '10101010-1010-4010-8010-101010101010',
    userB: '20202020-2020-4020-8020-202020202020',
    workspaceA: '30303030-3030-4030-8030-303030303030',
    workspaceB: '40404040-4040-4040-8040-404040404040',
    deviceA: '50505050-5050-4050-8050-505050505050',
    deviceB: '60606060-6060-4060-8060-606060606060',
    invitationA: '70707070-7070-4070-8070-707070707070',
    invitationB: '80808080-8080-4080-8080-808080808080',
    mutation: '90909090-9090-4090-8090-909090909090'
});

const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});
const firstDocumentId = '00000001-0000-4000-8000-000000000001';

async function seedTenant(workspaceId: string, userId: string, deviceId: string, subject: string): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (
                id, provider, provider_subject, display_login, display_name, avatar_url,
                status, created_at, updated_at, deactivated_at
             ) VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(userId, subject, `synthetic-${subject}`),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (
                id, display_name, description_envelope, state, current_key_version,
                created_by, created_at, updated_at, deleted_at
             ) VALUES (?, ?, NULL, 'active', 1, ?, 1, 1, NULL)`
        ).bind(workspaceId, `Synthetic ${subject}`, userId),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (
                workspace_id, user_id, role, state, invited_by, accepted_by, removed_by,
                created_at, activated_at, removed_at, role_version
             ) VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, 1, 1, NULL, 1)`
        ).bind(workspaceId, userId, userId),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (
                id, user_id, label, public_jwk, fingerprint, suite, state,
                created_at, revoked_at, revoke_reason
             ) VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(deviceId, userId, publicJwk, blob(32, Number(subject))),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (
                workspace_id, key_version, suite, state, rotation_reason,
                created_by_device_id, created_by_user_id, created_at, committed_at, retired_at
             ) VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_create', ?, ?, 1, 1, NULL)`
        ).bind(workspaceId, deviceId, userId)
    ]);
}

const queryParams: Readonly<Record<string, readonly (string | number | ArrayBuffer | null)[]>> = Object.freeze({
    'session-by-token': [blob(32, 9), 1],
    'membership-by-workspace-user': [IDS.workspaceA, IDS.userA, 1],
    'memberships-by-user': [IDS.userA, 'active', '', 100],
    'invitations-by-workspace-expiry': [IDS.workspaceA, 'pending', 0, '', 100],
    'devices-by-user-state': [IDS.userA, 'active', '', 100],
    'key-versions-by-workspace': [IDS.workspaceA, 'current', 0, 100],
    'key-envelopes-by-target': [IDS.workspaceA, IDS.userA, 0, '', '', 100],
    'document-by-workspace-id': [IDS.workspaceA, firstDocumentId, 1],
    'documents-by-workspace-state': [IDS.workspaceA, 'active', Number.MAX_SAFE_INTEGER, 'z', 100],
    'revisions-by-workspace-time': [IDS.workspaceA, 0, '', 0, 100],
    'mutation-result-by-scope': [IDS.userA, IDS.deviceA, IDS.workspaceA, 'document.update', IDS.mutation, 1],
    'audit-by-workspace-sequence': [IDS.workspaceA, 0, 100],
    'retention-holds-by-workspace': [IDS.workspaceA, 'active', 0, '', 100]
});

describe('CF-P2-003 tenant constraints and query plans', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'collaboration_readiness_migrations');
        await seedTenant(IDS.workspaceA, IDS.userA, IDS.deviceA, '11');
        await seedTenant(IDS.workspaceB, IDS.userB, IDS.deviceB, '22');

        await env.COLLAB_DB.prepare(
            `WITH RECURSIVE sequence(value) AS (
                SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 10000
             )
             INSERT INTO documents (
                id, workspace_id, current_revision, current_key_version, current_ciphertext_digest,
                ciphertext_bytes, envelope_version, state, created_by, created_at, updated_at, tombstoned_at
             )
             SELECT printf('%08x-0000-4000-8000-%012x', value, value), ?,
                    CASE WHEN value = 1 THEN 50 ELSE 1 END, 1, zeroblob(32), 18, 1,
                    'active', ?, 2, value + 2, NULL
             FROM sequence`
        ).bind(IDS.workspaceA, IDS.userA).run();

        await env.COLLAB_DB.prepare(
            `WITH RECURSIVE sequence(value) AS (
                SELECT 1 UNION ALL SELECT value + 1 FROM sequence WHERE value < 50
             )
             INSERT INTO document_revisions (
                document_id, workspace_id, revision, base_revision, operation, key_version,
                ciphertext_envelope, ciphertext_digest, ciphertext_bytes, actor_user_id,
                actor_device_id, client_mutation_id, server_time
             )
             SELECT ?, ?, value, value - 1, CASE WHEN value = 1 THEN 'create' ELSE 'update' END,
                    1, zeroblob(18), zeroblob(32), 18, ?, ?,
                    printf('%08x-1111-4111-8111-%012x', value, value), value + 2
             FROM sequence`
        ).bind(firstDocumentId, IDS.workspaceA, IDS.userA, IDS.deviceA).run();
    }, 30_000);

    it('uses approved indexes without full scans or temporary sorting at representative scale', async () => {
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM documents').first<number>('count')).toBe(10000);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM document_revisions').first<number>('count')).toBe(50);

        const startedAt = performance.now();
        for (const contract of COLLABORATION_QUERY_CONTRACTS) {
            const plan = await env.COLLAB_DB.prepare(`EXPLAIN QUERY PLAN ${contract.sql}`)
                .bind(...queryParams[contract.id])
                .all<{ detail: string }>();
            const details = plan.results.map(row => row.detail).join('\n');
            expect(details, contract.id).toContain(contract.expectedIndex);
            expect(details, contract.id).not.toMatch(/\bSCAN\b/);
            expect(details, contract.id).not.toContain('USE TEMP B-TREE');
        }
        expect(performance.now() - startedAt).toBeLessThan(2_000);
    });

    it('makes foreign-workspace and missing document lookups indistinguishable', async () => {
        const contract = COLLABORATION_QUERY_CONTRACTS.find(item => item.id === 'document-by-workspace-id');
        expect(contract).toBeDefined();
        const foreign = await env.COLLAB_DB.prepare(contract!.sql).bind(IDS.workspaceB, firstDocumentId, 1).first();
        const missing = await env.COLLAB_DB.prepare(contract!.sql)
            .bind(IDS.workspaceB, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1).first();
        expect(foreign).toBeNull();
        expect(missing).toBeNull();
    });

    it('rejects cross-workspace relations, key gaps, fingerprint substitution, and invalid domain states', async () => {
        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO document_revisions (
                document_id, workspace_id, revision, base_revision, operation, key_version,
                ciphertext_envelope, ciphertext_digest, ciphertext_bytes, actor_user_id,
                actor_device_id, client_mutation_id, server_time
             ) VALUES (?, ?, 51, 50, 'update', 1, ?, ?, 18, ?, ?, ?, 100)`
        ).bind(firstDocumentId, IDS.workspaceB, blob(18, 1), blob(32, 1), IDS.userB, IDS.deviceB, IDS.mutation).run()).rejects.toThrow();

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (
                workspace_id, key_version, suite, state, rotation_reason,
                created_by_device_id, created_by_user_id, created_at, committed_at, retired_at
             ) VALUES (?, 3, 'P256-HKDF-SHA256-A256GCM-v1', 'preparing', 'test_gap', ?, ?, 3, NULL, NULL)`
        ).bind(IDS.workspaceA, IDS.deviceA, IDS.userA).run()).rejects.toThrow(/sequence/);

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_envelopes (
                id, workspace_id, key_version, target_user_id, target_device_id, target_fingerprint,
                wrapper_user_id, wrapper_device_id, suite, ephemeral_public_jwk, hkdf_salt, nonce,
                ciphertext, aad_digest, created_at, revoked_at
             ) VALUES ('abababab-abab-4bab-8bab-abababababab', ?, 1, ?, ?, ?, ?, ?,
                       'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, 2, NULL)`
        ).bind(IDS.workspaceA, IDS.userA, IDS.deviceA, blob(32, 99), IDS.userA, IDS.deviceA,
            publicJwk, blob(32, 1), blob(12, 2), blob(48, 3), blob(32, 4)).run()).rejects.toThrow(/tenant scope/);

        await expect(env.COLLAB_DB.prepare(
            'UPDATE workspaces SET current_key_version = 2, updated_at = 3 WHERE id = ?'
        ).bind(IDS.workspaceA).run()).rejects.toThrow(/current key scope|workspace key rotation commit/);

        await expect(env.COLLAB_DB.prepare(
            'UPDATE documents SET workspace_id = ? WHERE id = ? AND workspace_id = ?'
        ).bind(IDS.workspaceB, firstDocumentId, IDS.workspaceA).run()).rejects.toThrow(/immutable/);

        await env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '44', 'synthetic-target', 'viewer', ?, 'pending', ?, NULL,
                     1, 259200001, NULL, NULL, NULL, NULL)`
        ).bind(IDS.invitationA, IDS.workspaceA, blob(32, 6), IDS.userA).run();

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', '55', 'foreign-replacement', 'viewer', ?, 'pending', ?, NULL,
                     1, 259200001, NULL, NULL, NULL, ?)`
        ).bind(IDS.invitationB, IDS.workspaceB, blob(32, 7), IDS.userB, IDS.invitationA).run()).rejects.toThrow(/tenant scope/);

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES ('81818181-8181-4181-8181-818181818181', ?, 'github', '66', 'duplicate-token',
                     'viewer', ?, 'pending', ?, NULL, 1, 259200001, NULL, NULL, NULL, NULL)`
        ).bind(IDS.workspaceB, blob(32, 6), IDS.userB).run()).rejects.toThrow();

        const invalidStatements = [
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
                  status, created_at, updated_at, deactivated_at)
                 VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'gitlab', '33', 'bad', NULL, NULL, 'active', 1, 1, NULL)`
            ),
            env.COLLAB_DB.prepare(
                `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
                  authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
                 VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ?, ?, NULL, 1, 2, 2, 10, 9, NULL, NULL)`
            ).bind(blob(32, 8), IDS.userA),
            env.COLLAB_DB.prepare(
                `INSERT INTO workspaces (id, display_name, description_envelope, state,
                  current_key_version, created_by, created_at, updated_at, deleted_at)
                 VALUES ('bcbcbcbc-bcbc-4bcb-8bcb-bcbcbcbcbcbc', 'Bad lifecycle', NULL,
                         'deleted', 1, ?, 1, 1, NULL)`
            ).bind(IDS.userA),
            env.COLLAB_DB.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', ?, 'Bad suite', ?, ?, 'RSA-v1', 'active', 1, NULL, NULL)`
            ).bind(IDS.userA, publicJwk, blob(32, 7)),
            env.COLLAB_DB.prepare(
                `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
                  target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
                  created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
                 VALUES ('82828282-8282-4282-8282-828282828282', ?, 'github', '77', 'bad-expiry', 'viewer', ?, 'pending', ?, NULL,
                         1, 2, NULL, NULL, NULL, NULL)`
            ).bind(IDS.workspaceA, blob(32, 9), IDS.userA),
            env.COLLAB_DB.prepare(
                `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type, outcome,
                  reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
                  server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
                 VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, ?, 'test.event', 'unknown',
                         'invalid', ?, ?, 'system', 'system', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
                         2, '{}', NULL, NULL, 'none')`
            ).bind(IDS.workspaceA, IDS.userA, IDS.deviceA),
            env.COLLAB_DB.prepare(
                `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
                  operation, client_mutation_id, request_fingerprint, target_type, target_id,
                  http_status, result_json, created_at, expires_at)
                 VALUES ('edededed-eded-4ded-8ded-edededededed', ?, ?, ?, 'document.update', ?, ?,
                         'document', ?, 200, 'not-json', 2, 3)`
            ).bind(IDS.userA, IDS.deviceA, IDS.workspaceA, IDS.mutation, blob(32, 5), firstDocumentId),
            env.COLLAB_DB.prepare(
                `INSERT INTO retention_holds (id, workspace_id, hold_type, reason_code, created_by,
                  created_at, expires_at, released_at, status)
                 VALUES ('fefefefe-fefe-4efe-8efe-fefefefefefe', ?, 'legal', 'test_hold', ?,
                         2, NULL, NULL, 'released')`
            ).bind(IDS.workspaceA, IDS.userA)
        ];
        for (const statement of invalidStatements) await expect(statement.run()).rejects.toThrow();
    });
});
