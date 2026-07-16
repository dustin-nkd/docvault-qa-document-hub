import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    PersistenceError,
    captureServerBookmark,
    executeGuardedBatch,
    mapExactlyOneResult,
    openAuthorizationSession,
    requireCheckedChanges,
    requirePageSize,
    translatePersistenceError,
    type GuardedBatchStatement
} from '../../functions/_lib/persistence';

const IDS = Object.freeze({
    user: '11111111-1111-4111-8111-111111111111',
    workspace: '22222222-2222-4222-8222-222222222222',
    device: '33333333-3333-4333-8333-333333333333'
});

const blob = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

async function seedAuthority(): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '101', 'synthetic-owner', NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Synthetic workspace', NULL, 'active', 1, ?, 1, 1, NULL)`
        ).bind(IDS.workspace, IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, 1, 1, NULL, 1)`
        ).bind(IDS.workspace, IDS.user, IDS.user),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Synthetic device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(IDS.device, IDS.user, publicJwk, blob(32, 3)),
        env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_create',
                     ?, ?, 1, 1, NULL)`
        ).bind(IDS.workspace, IDS.device, IDS.user)
    ]);
}

function uuid(prefix: number, tail: number): string {
    const head = prefix.toString(16).padStart(8, '0');
    const end = tail.toString(16).padStart(12, '0');
    return `${head}-aaaa-4aaa-8aaa-${end}`;
}

function recipe(attempt: number, failAt?: 'guard' | 'domain' | 'audit' | 'result') {
    const mutationId = uuid(100 + attempt, attempt);
    const clientMutationId = uuid(200 + attempt, attempt);
    const documentId = uuid(300 + attempt, attempt);
    const eventId = uuid(400 + attempt, attempt);
    const requestId = uuid(500 + attempt, attempt);
    const statements: GuardedBatchStatement[] = [
        {
            role: 'guard', expectedChanges: 1,
            statement: env.COLLAB_DB.prepare(
                `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
                  operation, client_mutation_id, request_fingerprint, target_type, target_id,
                  http_status, result_json, created_at, expires_at)
                 VALUES (?, ?, ?, ?, 'document.create', ?, ?, 'document', ?, 201, ?, 2, 1002)`
            ).bind(mutationId, IDS.user, IDS.device, IDS.workspace, clientMutationId,
                blob(32, attempt), documentId, failAt === 'guard' ? 'invalid-json' : '{}')
        },
        {
            role: 'domain', expectedChanges: 1,
            statement: env.COLLAB_DB.prepare(
                `INSERT INTO documents (id, workspace_id, current_revision, current_key_version,
                  current_ciphertext_digest, ciphertext_bytes, envelope_version, state,
                  created_by, created_at, updated_at, tombstoned_at)
                 VALUES (?, ?, 1, 1, ?, ?, 1, 'active', ?, 2, 2, NULL)`
            ).bind(documentId, IDS.workspace, blob(32, attempt),
                failAt === 'domain' ? 17 : 18, IDS.user)
        },
        {
            role: 'audit', expectedChanges: 1,
            statement: env.COLLAB_DB.prepare(
                `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
                  outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
                  request_id, server_time, metadata_json, correction_of_event_id,
                  related_event_id, hold_state)
                 VALUES (?, 7, ?, 'document.created', ?, 'created', ?, ?, 'document', ?, ?, 2,
                         '{}', NULL, NULL, 'none')`
            ).bind(eventId, IDS.workspace, failAt === 'audit' ? 'invalid' : 'success',
                IDS.user, IDS.device, documentId, requestId)
        },
        {
            role: 'result',
            statement: failAt === 'result'
                ? env.COLLAB_DB.prepare('SELECT absent_column FROM mutation_results WHERE id = ?').bind(mutationId)
                : env.COLLAB_DB.prepare(
                    'SELECT id, http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1'
                ).bind(mutationId)
        }
    ];
    return { mutationId, documentId, eventId, statements };
}

async function sideEffectCounts(ids: { mutationId: string; documentId: string; eventId: string }) {
    const [mutation, document, audit] = await Promise.all([
        env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM mutation_results WHERE id = ?')
            .bind(ids.mutationId).first<number>('count'),
        env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM documents WHERE id = ?')
            .bind(ids.documentId).first<number>('count'),
        env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM audit_events WHERE event_id = ?')
            .bind(ids.eventId).first<number>('count')
    ]);
    return { mutation, document, audit };
}

describe('CF-P2-004 typed persistence primitives', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'persistence_primitive_migrations');
        await seedAuthority();
    });

    it('rejects unbounded reads, zero writes, missing metadata, and malformed result rows', () => {
        expect(() => requirePageSize(0)).toThrowError(PersistenceError);
        expect(() => requirePageSize(101)).toThrowError(PersistenceError);
        expect(() => requireCheckedChanges({ success: true, meta: { changes: 0 } }, 1))
            .toThrowError(PersistenceError);
        expect(() => requireCheckedChanges({ success: true }, 1)).toThrowError(PersistenceError);
        expect(() => mapExactlyOneResult({ success: true, results: [] }, row => row.id))
            .toThrowError(PersistenceError);
        expect(() => mapExactlyOneResult({ success: true, results: [{ id: 1 }, { id: 2 }] }, row => row.id))
            .toThrowError(PersistenceError);
        const translated = translatePersistenceError(new Error(
            'UNIQUE constraint failed: mutation_results.client_mutation_id SELECT secret'
        ));
        expect(translated).toMatchObject({ code: 'PERSISTENCE_CONFLICT' });
        expect(translated.message).toBe('PERSISTENCE_CONFLICT');
        expect(translated.message).not.toContain('mutation_results');
    });

    it('requires guard-domain-audit-result topology and returns one explicitly mapped row', async () => {
        const attempt = recipe(1);
        const result = await executeGuardedBatch(env.COLLAB_DB, {
            statements: attempt.statements,
            mapResult: row => {
                if (typeof row.id !== 'string' || typeof row.http_status !== 'number'
                    || typeof row.result_json !== 'string') {
                    throw new Error('invalid row');
                }
                return { id: row.id, status: row.http_status, result: row.result_json };
            }
        });
        expect(result).toEqual({ id: attempt.mutationId, status: 201, result: '{}' });
        expect(await sideEffectCounts(attempt)).toEqual({ mutation: 1, document: 1, audit: 1 });

        const invalid = recipe(2);
        invalid.statements[2] = { ...invalid.statements[2], role: 'domain' };
        await expect(executeGuardedBatch(env.COLLAB_DB, {
            statements: invalid.statements,
            mapResult: row => row.id
        })).rejects.toMatchObject({ code: 'PERSISTENCE_INTEGRITY' });
        expect(await sideEffectCounts(invalid)).toEqual({ mutation: 0, document: 0, audit: 0 });
    });

    it.each(['guard', 'domain', 'audit', 'result'] as const)(
        'rolls back idempotency, domain, and audit writes when %s position fails',
        async failAt => {
            const attempt = recipe(10 + ['guard', 'domain', 'audit', 'result'].indexOf(failAt), failAt);
            await expect(executeGuardedBatch(env.COLLAB_DB, {
                statements: attempt.statements,
                mapResult: row => row.id
            })).rejects.toBeInstanceOf(PersistenceError);
            expect(await sideEffectCounts(attempt)).toEqual({ mutation: 0, document: 0, audit: 0 });
        }
    );

    it('uses a server-owned primary session and captures a reusable server bookmark', async () => {
        const session = openAuthorizationSession(env.COLLAB_DB);
        const row = await session.prepare(
            'SELECT workspace_id, user_id, role FROM memberships WHERE workspace_id = ? AND user_id = ? LIMIT 1'
        ).bind(IDS.workspace, IDS.user).first<{ workspace_id: string; user_id: string; role: string }>();
        expect(row).toEqual({ workspace_id: IDS.workspace, user_id: IDS.user, role: 'owner' });
        const bookmark = captureServerBookmark(session);
        expect(bookmark).not.toBeNull();
        const continued = openAuthorizationSession(env.COLLAB_DB, bookmark ?? undefined);
        expect(await continued.prepare('SELECT COUNT(*) AS count FROM memberships WHERE workspace_id = ?')
            .bind(IDS.workspace).first<number>('count')).toBe(1);
    });
});
