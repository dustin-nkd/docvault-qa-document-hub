import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    DOCUMENT_ERRORS,
    DocumentMutationError,
    executeDocumentMutation,
    type DocumentMutationRequest
} from '../../functions/_lib/documents/document-service';

const ID = {
    editor: '10000000-0000-4000-8000-000000000001',
    editorDevice: '10000000-0000-4000-8000-000000000002',
    viewer: '10000000-0000-4000-8000-000000000003',
    viewerDevice: '10000000-0000-4000-8000-000000000004',
    removed: '10000000-0000-4000-8000-000000000005',
    removedDevice: '10000000-0000-4000-8000-000000000006',
    revokedDevice: '10000000-0000-4000-8000-000000000007',
    otherWorkspace: '20000000-0000-4000-8000-000000000002'
} as const;

// Rewritten per test so append-only history never has to be deleted.
const ID2 = { workspace: '', document: '' };

let counter = 0;
const uuid = (): string => {
    counter += 1;
    const tail = counter.toString(16).padStart(12, '0');
    return `40000000-0000-4000-8000-${tail}`;
};

const bytes = (length: number, seed: number): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (seed + index * 7) % 256);

const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

function request(overrides: Partial<DocumentMutationRequest> = {}): DocumentMutationRequest {
    const envelope = overrides.ciphertextEnvelope ?? bytes(64, 3);
    const base: DocumentMutationRequest = {
        operation: 'create',
        actorUserId: ID.editor,
        actorDeviceId: ID.editorDevice,
        workspaceId: ID2.workspace,
        documentId: ID2.document,
        baseRevision: 0,
        keyVersion: 1,
        envelopeVersion: 1,
        ciphertextEnvelope: envelope,
        ciphertextDigest: bytes(32, 11),
        ciphertextBytes: envelope.length,
        clientMutationId: uuid(),
        serverTime: 1_900_000_000_000,
        requestId: uuid(),
        auditEventId: uuid(),
        mutationResultId: uuid()
    };
    // Byte count tracks the envelope unless a case deliberately desynchronises it.
    const merged = { ...base, ...overrides };
    return overrides.ciphertextBytes === undefined
        ? { ...merged, ciphertextBytes: merged.ciphertextEnvelope.length }
        : merged;
}

// Every count is scoped to the workspace under test. The audit, revision, and
// ledger tables are append-only by trigger, so each test gets a fresh workspace
// instead of a teardown that deletes history the product forbids deleting.
async function counts() {
    const read = async (sql: string): Promise<number> =>
        (await env.COLLAB_DB.prepare(sql).bind(ID2.workspace).first<number>('n')) ?? 0;
    return {
        documents: await read('SELECT COUNT(*) AS n FROM documents WHERE workspace_id = ?'),
        revisions: await read('SELECT COUNT(*) AS n FROM document_revisions WHERE workspace_id = ?'),
        ledger: await read('SELECT COUNT(*) AS n FROM mutation_results WHERE workspace_id = ?'),
        audit: await read(
            "SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ? AND event_type LIKE 'document.%'")
    };
}

async function expectDenied(run: () => Promise<unknown>, code: string) {
    const before = await counts();
    let thrown: unknown = null;
    try { await run(); } catch (error) { thrown = error; }
    expect(thrown, 'the mutation should have been denied').toBeInstanceOf(DocumentMutationError);
    expect((thrown as DocumentMutationError).code).toBe(code);
    expect(await counts()).toEqual(before);
}

async function seedPrincipals(): Promise<void> {
    const users: [string, string][] = [[ID.editor, '61001'], [ID.viewer, '61002'], [ID.removed, '61003']];
    const devices: [string, string, 'active' | 'revoked'][] = [
        [ID.editorDevice, ID.editor, 'active'],
        [ID.viewerDevice, ID.viewer, 'active'],
        [ID.removedDevice, ID.removed, 'active'],
        [ID.revokedDevice, ID.editor, 'revoked']
    ];

    await env.COLLAB_DB.batch([
        ...users.map(([id, subject], index) => env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(id, subject, `doc-user-${index}`)),
        ...devices.map(([id, userId, state], index) => env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Doc device', ?, ?, 'P256-ECDH-v1', ?, 1, ?, ?)`
        ).bind(id, userId, publicJwk, bytes(32, 40 + index * 13).buffer, state,
            state === 'revoked' ? 2 : null, state === 'revoked' ? 'lost-device' : null)),
        // The editor is deliberately given no membership in this workspace, so a
        // cross-workspace identifier is denied rather than merely key-mismatched.
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Foreign workspace', NULL, 'active', 1, ?, 2, 2, NULL)`
        ).bind(ID.otherWorkspace, ID.editor)
    ]);
}

async function seedWorkspace(): Promise<void> {
    ID2.workspace = uuid();
    ID2.document = uuid();

    await env.COLLAB_DB.prepare(
        `INSERT INTO workspaces (id, display_name, description_envelope, state,
          current_key_version, created_by, created_at, updated_at, deleted_at)
         VALUES (?, 'Doc workspace', NULL, 'active', 1, ?, 2, 2, NULL)`
    ).bind(ID2.workspace, ID.editor).run();

    // Memberships must land before anything the tenant-scope triggers guard:
    // workspace_key_versions, documents, document_revisions, mutation_results, and
    // audit_events all abort on an insert whose actor has no membership row.
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
        ).bind(ID2.workspace, ID.editor, ID.editor),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'viewer', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
        ).bind(ID2.workspace, ID.viewer, ID.viewer),
        env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'removed', NULL, ?, ?, 2, 2, 3, 1)`
        ).bind(ID2.workspace, ID.removed, ID.removed, ID.editor)
    ]);

    // Only the primary workspace gets a current key version. The other workspace
    // deliberately has none and no membership, so a cross-workspace identifier is
    // denied rather than merely mismatching a key.
    await env.COLLAB_DB.prepare(
        `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
          rotation_reason, created_by_device_id, created_by_user_id, created_at,
          committed_at, retired_at)
         VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'bootstrap', ?, ?, 2, 2, NULL)`
    ).bind(ID2.workspace, ID.editorDevice, ID.editor).run();
}

describe('CF-P6-004 atomic document mutations, append-only revisions, and idempotency', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'document_mutation_migrations');
        await seedPrincipals();
    });

    beforeEach(async () => {
        await seedWorkspace();
    });

    it('creates a document at revision 1 with exactly one revision and one audit event', async () => {
        const outcome = await executeDocumentMutation(env.COLLAB_DB, request());
        expect(outcome.revision).toBe(1);
        expect(outcome.operation).toBe('create');
        expect(outcome.replayed).toBe(false);
        expect(outcome.httpStatus).toBe(201);
        expect(await counts()).toEqual({ documents: 1, revisions: 1, ledger: 1, audit: 1 });

        const row = await env.COLLAB_DB.prepare(
            'SELECT current_revision AS revision, state FROM documents WHERE id = ?'
        ).bind(ID2.document).first<{ revision: number; state: string }>();
        expect(row).toEqual({ revision: 1, state: 'active' });
    });

    it('appends an update without mutating the earlier revision', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        const outcome = await executeDocumentMutation(env.COLLAB_DB, request({
            operation: 'update', baseRevision: 1, ciphertextEnvelope: bytes(80, 21)
        }));
        expect(outcome.revision).toBe(2);
        expect(await counts()).toEqual({ documents: 1, revisions: 2, ledger: 2, audit: 2 });

        const first = await env.COLLAB_DB.prepare(
            'SELECT operation, base_revision AS base FROM document_revisions WHERE document_id = ? AND revision = 1'
        ).bind(ID2.document).first<{ operation: string; base: number }>();
        expect(first).toEqual({ operation: 'create', base: 0 });
    });

    it('tombstones through a revision rather than deleting rows', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        const outcome = await executeDocumentMutation(env.COLLAB_DB, request({
            operation: 'delete', baseRevision: 1
        }));
        expect(outcome.revision).toBe(2);

        const row = await env.COLLAB_DB.prepare(
            'SELECT state, tombstoned_at AS at FROM documents WHERE id = ?'
        ).bind(ID2.document).first<{ state: string; at: number }>();
        expect(row?.state).toBe('tombstoned');
        expect(row?.at).toBeGreaterThan(0);
        expect((await counts()).revisions).toBe(2);
    });

    // ---- sprint gate G4: two writers, one base revision ----
    it('G4: concurrent writers on one base revision produce one advance and one conflict', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());

        const settled = await Promise.allSettled([
            executeDocumentMutation(env.COLLAB_DB, request({
                operation: 'update', baseRevision: 1, ciphertextEnvelope: bytes(70, 31)
            })),
            executeDocumentMutation(env.COLLAB_DB, request({
                operation: 'update', baseRevision: 1, ciphertextEnvelope: bytes(90, 41)
            }))
        ]);

        const fulfilled = settled.filter((entry) => entry.status === 'fulfilled');
        const rejected = settled.filter((entry) => entry.status === 'rejected');
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        const error = (rejected[0] as PromiseRejectedResult).reason as DocumentMutationError;
        expect(error).toBeInstanceOf(DocumentMutationError);
        expect(error.code).toBe(DOCUMENT_ERRORS.conflict);
        expect(error.httpStatus).toBe(409);
        expect(error.details).toEqual({ submittedBaseRevision: 1, currentRevision: 2 });

        // Exactly one revision advance, and the loser left nothing behind.
        expect(await counts()).toEqual({ documents: 1, revisions: 2, ledger: 2, audit: 2 });
    });

    it('G4: a stale base revision conflicts and discloses only the two revisions', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        await executeDocumentMutation(env.COLLAB_DB, request({ operation: 'update', baseRevision: 1 }));

        const before = await counts();
        await expect(executeDocumentMutation(env.COLLAB_DB, request({
            operation: 'update', baseRevision: 1
        }))).rejects.toMatchObject({
            code: DOCUMENT_ERRORS.conflict,
            details: { submittedBaseRevision: 1, currentRevision: 2 }
        });
        expect(await counts()).toEqual(before);
    });

    // ---- sprint gate G5: retry creates no duplicate revision ----
    it('G5: an identical replay returns the original result with no second revision or audit event', async () => {
        const first = request();
        const created = await executeDocumentMutation(env.COLLAB_DB, first);
        const after = await counts();

        for (let attempt = 0; attempt < 5; attempt += 1) {
            const replay = await executeDocumentMutation(env.COLLAB_DB, {
                ...first, requestId: uuid(), auditEventId: uuid(), mutationResultId: uuid()
            });
            expect(replay.replayed).toBe(true);
            expect(replay.revision).toBe(created.revision);
            expect(replay.documentId).toBe(created.documentId);
            expect(replay.clientMutationId).toBe(created.clientMutationId);
        }
        expect(await counts()).toEqual(after);
    });

    it('G5: the same mutation id with different content is rejected with no side effect', async () => {
        const first = request();
        await executeDocumentMutation(env.COLLAB_DB, first);
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, {
            ...first,
            requestId: uuid(), auditEventId: uuid(), mutationResultId: uuid(),
            ciphertextDigest: bytes(32, 99)
        }), DOCUMENT_ERRORS.idempotencyReuse);
    });

    it('G5: an expired idempotency window is reported rather than silently re-applied', async () => {
        const first = request();
        await executeDocumentMutation(env.COLLAB_DB, first);
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, {
            ...first,
            requestId: uuid(), auditEventId: uuid(), mutationResultId: uuid(),
            serverTime: first.serverTime + 31 * 24 * 60 * 60 * 1_000
        }), DOCUMENT_ERRORS.idempotencyExpired);
    });

    // ---- sprint gate G3: Viewer cannot write ----
    it('G3: a Viewer create, update, and tombstone all create zero rows', async () => {
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            actorUserId: ID.viewer, actorDeviceId: ID.viewerDevice
        })), DOCUMENT_ERRORS.notFound);

        await executeDocumentMutation(env.COLLAB_DB, request());
        for (const operation of ['update', 'delete'] as const) {
            await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
                operation, baseRevision: 1, actorUserId: ID.viewer, actorDeviceId: ID.viewerDevice
            })), DOCUMENT_ERRORS.notFound);
        }
    });

    it('denies a removed member, a revoked device, and a cross-workspace identifier', async () => {
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            actorUserId: ID.removed, actorDeviceId: ID.removedDevice
        })), DOCUMENT_ERRORS.notFound);

        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            actorDeviceId: ID.revokedDevice
        })), DOCUMENT_ERRORS.notFound);

        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            workspaceId: ID.otherWorkspace
        })), DOCUMENT_ERRORS.notFound);
    });

    it('denies a non-current key version with the contract key-version code', async () => {
        // An authorized member gets the specific KEY_VERSION_MISMATCH code so the
        // client can re-encrypt under the current key; an unauthorized caller
        // would still receive the shared not-found mapping instead.
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            keyVersion: 7
        })), DOCUMENT_ERRORS.keyVersion);
    });

    it('denies a tombstoned target without disclosing that it once existed', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        await executeDocumentMutation(env.COLLAB_DB, request({ operation: 'delete', baseRevision: 1 }));
        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, request({
            operation: 'update', baseRevision: 2
        })), DOCUMENT_ERRORS.notFound);
    });

    it('re-authorizes before replay so a revoked actor cannot reuse a successful mutation', async () => {
        const first = request();
        await executeDocumentMutation(env.COLLAB_DB, first);

        await env.COLLAB_DB.prepare(
            "UPDATE memberships SET state = 'removed', removed_at = 9, removed_by = ? WHERE workspace_id = ? AND user_id = ?"
        ).bind(ID.editor, ID2.workspace, ID.editor).run();

        await expectDenied(() => executeDocumentMutation(env.COLLAB_DB, {
            ...first, requestId: uuid(), auditEventId: uuid(), mutationResultId: uuid()
        }), DOCUMENT_ERRORS.notFound);
    });

    it('validates every bound before touching the database', async () => {
        const before = await counts();
        const invalidCases: Partial<DocumentMutationRequest>[] = [
            { actorUserId: 'not-a-uuid' },
            { documentId: 'not-a-uuid' },
            { clientMutationId: 'not-a-uuid' },
            { keyVersion: 0 },
            { envelopeVersion: 2 },
            { baseRevision: 4 },
            { ciphertextDigest: bytes(16, 1) },
            { ciphertextEnvelope: bytes(4, 1) },
            { ciphertextBytes: 17 }
        ];
        for (const overrides of invalidCases) {
            await expect(executeDocumentMutation(env.COLLAB_DB, request(overrides)))
                .rejects.toMatchObject({ code: DOCUMENT_ERRORS.validation });
        }
        expect(await counts()).toEqual(before);
    });

    it('leaves every business table unchanged when a write boundary fails', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        const before = await counts();

        // A duplicate audit event id violates the unique constraint at the audit
        // statement, which must roll back the revision insert and pointer update.
        const existingAuditId = await env.COLLAB_DB.prepare(
            'SELECT event_id AS id FROM audit_events LIMIT 1'
        ).first<string>('id');

        let failed = false;
        try {
            await executeDocumentMutation(env.COLLAB_DB, request({
                operation: 'update', baseRevision: 1, auditEventId: existingAuditId as string
            }));
        } catch (_) {
            failed = true;
        }
        expect(failed).toBe(true);
        expect(await counts()).toEqual(before);

        const revision = await env.COLLAB_DB.prepare(
            'SELECT current_revision AS revision FROM documents WHERE id = ?'
        ).bind(ID2.document).first<number>('revision');
        expect(revision).toBe(1);
    });

    it('writes no plaintext-bearing column and keeps the ledger digest-only', async () => {
        await executeDocumentMutation(env.COLLAB_DB, request());
        const ledger = await env.COLLAB_DB.prepare(
            'SELECT result_json AS json, request_fingerprint AS fingerprint FROM mutation_results LIMIT 1'
        ).first<{ json: string; fingerprint: ArrayBuffer }>();
        expect(new Uint8Array(ledger!.fingerprint).length).toBe(32);
        expect(Object.keys(JSON.parse(ledger!.json)).sort()).toEqual([
            'clientMutationId', 'documentId', 'occurredAt', 'operation', 'revision'
        ]);

        const audit = await env.COLLAB_DB.prepare(
            "SELECT metadata_json AS meta, event_type AS type FROM audit_events WHERE event_type LIKE 'document.%' LIMIT 1"
        ).first<{ meta: string; type: string }>();
        expect(audit?.meta).toBe('{}');
        expect(audit?.type).toBe('document.created');
    });
});
