import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const IDS = Object.freeze({
    user: '11111111-1111-4111-8111-111111111111',
    workspace: '22222222-2222-4222-8222-222222222222',
    device: '33333333-3333-4333-8333-333333333333',
    document: '44444444-4444-4444-8444-444444444444',
    mutation: '55555555-5555-4555-8555-555555555555',
    event: '66666666-6666-4666-8666-666666666666',
    request: '77777777-7777-4777-8777-777777777777'
});

const blob = (length: number, fill: number) => new Uint8Array(length).fill(fill);
const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

async function seedFoundation(): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (
                id, provider, provider_subject, display_login, display_name, avatar_url,
                status, created_at, updated_at, deactivated_at
            ) VALUES (?, 'github', '12345', 'synthetic-owner', 'Synthetic Owner', NULL, 'active', 1, 1, NULL)`
        ).bind(IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (
                id, display_name, description_envelope, state, current_key_version,
                created_by, created_at, updated_at, deleted_at
            ) VALUES (?, 'Synthetic Workspace', NULL, 'active', 1, ?, 1, 1, NULL)`
        ).bind(IDS.workspace, IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (
                workspace_id, user_id, role, state, invited_by, accepted_by, removed_by,
                created_at, activated_at, removed_at, role_version
            ) VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, 1, 1, NULL, 1)`
        ).bind(IDS.workspace, IDS.user, IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (
                id, user_id, label, public_jwk, fingerprint, suite, state,
                created_at, revoked_at, revoke_reason
            ) VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(IDS.device, IDS.user, publicJwk, blob(32, 1)),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (
                workspace_id, key_version, suite, state, rotation_reason,
                created_by_device_id, created_by_user_id, created_at, committed_at, retired_at
            ) VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_create', ?, ?, 1, 1, NULL)`
        ).bind(IDS.workspace, IDS.device, IDS.user)
    ]);
}

describe('CF-P2-002 immutable Foundation migrations', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'collaboration_migrations');
        await seedFoundation();
    });

    it('applies all nine migrations once and exposes schema version nine', async () => {
        const ledger = await env.COLLAB_DB.prepare(
            'SELECT name FROM collaboration_migrations ORDER BY id'
        ).all<{ name: string }>();
        expect(ledger.results.map(row => row.name)).toEqual(env.COLLAB_MIGRATIONS.map(migration => migration.name));

        const metadata = await env.COLLAB_DB.prepare(
            `SELECT schema_version, minimum_runtime_schema, maximum_runtime_schema,
                    hex(migration_set_digest) AS migration_set_digest
             FROM schema_metadata WHERE singleton_id = 1`
        ).first<{
            schema_version: number;
            minimum_runtime_schema: number;
            maximum_runtime_schema: number;
            migration_set_digest: string;
        }>();
        expect(metadata).toEqual({
            schema_version: 9,
            minimum_runtime_schema: 1,
            maximum_runtime_schema: 9,
            migration_set_digest: '8FB7AFD3E0D5DA2FE756D2AE7A252A6BF3273A4846C726E407053A28A9EFBDF8'
        });
    });

    it('creates exactly the frozen STRICT table columns with valid foreign keys', async () => {
        const expectedTables = [
            'schema_metadata', 'users', 'oauth_transactions', 'sessions', 'workspaces',
            'memberships', 'invitations', 'devices', 'workspace_key_versions',
            'workspace_key_envelopes', 'documents', 'document_revisions',
            'mutation_results', 'audit_events', 'retention_holds', 'transition_guards',
            'retention_purge_runs'
        ];
        const tableList = await env.COLLAB_DB.prepare('PRAGMA table_list').all<{ name: string; strict: number }>();
        for (const table of expectedTables) {
            expect(tableList.results.find(row => row.name === table)).toMatchObject({ strict: 1 });
        }
        const foreignKeyFailures = await env.COLLAB_DB.prepare('PRAGMA foreign_key_check').all();
        expect(foreignKeyFailures.results).toEqual([]);
    });

    it('makes an exact repeated apply a no-op', async () => {
        await expect(applyD1Migrations(
            env.COLLAB_DB,
            env.COLLAB_MIGRATIONS,
            'collaboration_migrations'
        )).resolves.toBeUndefined();
        const count = await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS count FROM collaboration_migrations'
        ).first<number>('count');
        expect(count).toBe(9);
    });

    it('enforces strict types, foreign keys, pending-target uniqueness, and one current key version', async () => {
        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO users (
                id, provider, provider_subject, display_login, display_name, avatar_url,
                status, created_at, updated_at, deactivated_at
             ) VALUES ('88888888-8888-4888-8888-888888888888', 'github', '888', 'bad-time', NULL, NULL, 'active', 'not-an-integer', 1, NULL)`
        ).run()).rejects.toThrow();

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (
                id, display_name, description_envelope, state, current_key_version,
                created_by, created_at, updated_at, deleted_at
             ) VALUES ('99999999-9999-4999-8999-999999999999', 'Invalid parent', NULL, 'active', 1,
                       'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 1, NULL)`
        ).run()).rejects.toThrow();

        await env.COLLAB_DB.prepare(
            `INSERT INTO invitations (
                id, workspace_id, target_provider, target_provider_subject, target_login_snapshot,
                offered_role, token_digest, state, invited_by, accepted_by, created_at, expires_at,
                accepted_at, revoked_at, expired_at, replacement_of
             ) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?, 'github', '98765', 'synthetic-target',
                       'viewer', ?, 'pending', ?, NULL, 1, 259200001, NULL, NULL, NULL, NULL)`
        ).bind(IDS.workspace, blob(32, 2), IDS.user).run();
        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO invitations (
                id, workspace_id, target_provider, target_provider_subject, target_login_snapshot,
                offered_role, token_digest, state, invited_by, accepted_by, created_at, expires_at,
                accepted_at, revoked_at, expired_at, replacement_of
             ) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', ?, 'github', '98765', 'synthetic-target',
                       'editor', ?, 'pending', ?, NULL, 1, 259200001, NULL, NULL, NULL, NULL)`
        ).bind(IDS.workspace, blob(32, 3), IDS.user).run()).rejects.toThrow();

        await expect(env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (
                workspace_id, key_version, suite, state, rotation_reason,
                created_by_device_id, created_by_user_id, created_at, committed_at, retired_at
             ) VALUES (?, 2, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'test_rotation', ?, ?, 2, 2, NULL)`
        ).bind(IDS.workspace, IDS.device, IDS.user).run()).rejects.toThrow();
    });

    it('keeps document revisions and audit events append-only', async () => {
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO documents (
                    id, workspace_id, current_revision, current_key_version, current_ciphertext_digest,
                    ciphertext_bytes, envelope_version, state, created_by, created_at, updated_at, tombstoned_at
                 ) VALUES (?, ?, 1, 1, ?, 32, 1, 'active', ?, 2, 2, NULL)`
            ).bind(IDS.document, IDS.workspace, blob(32, 4), IDS.user),
            env.COLLAB_DB.prepare(
                `INSERT INTO document_revisions (
                    document_id, workspace_id, revision, base_revision, operation, key_version,
                    ciphertext_envelope, ciphertext_digest, ciphertext_bytes, actor_user_id,
                    actor_device_id, client_mutation_id, server_time
                 ) VALUES (?, ?, 1, 0, 'create', 1, ?, ?, 32, ?, ?, ?, 2)`
            ).bind(IDS.document, IDS.workspace, blob(32, 5), blob(32, 4), IDS.user, IDS.device, IDS.mutation),
            env.COLLAB_DB.prepare(
                `INSERT INTO audit_events (
                    event_id, schema_version, workspace_id, event_type, outcome, reason_code,
                    actor_user_id, actor_device_id, target_type, target_id, request_id, server_time,
                    metadata_json, correction_of_event_id, related_event_id, hold_state
                 ) VALUES (?, 1, ?, 'document.created', 'success', 'created', ?, ?, 'document', ?, ?, 2,
                           '{}', NULL, NULL, 'none')`
            ).bind(IDS.event, IDS.workspace, IDS.user, IDS.device, IDS.document, IDS.request)
        ]);

        await expect(env.COLLAB_DB.prepare(
            'UPDATE document_revisions SET server_time = 3 WHERE document_id = ? AND revision = 1'
        ).bind(IDS.document).run()).rejects.toThrow(/append-only/);
        await expect(env.COLLAB_DB.prepare(
            'DELETE FROM audit_events WHERE event_id = ?'
        ).bind(IDS.event).run()).rejects.toThrow(/append-only/);
    });
});
