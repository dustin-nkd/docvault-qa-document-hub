import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    DOCUMENT_READ_LIMITS,
    DocumentReadError,
    createDocumentCursorCodec,
    documentReadHeaders,
    listDocuments,
    listRevisions,
    readDocument,
    readRevision,
    type ReaderIdentity
} from '../../functions/_lib/documents/document-reads';
import { executeDocumentMutation } from '../../functions/_lib/documents/document-service';

const ID = {
    editor: '50000000-0000-4000-8000-000000000001',
    editorDevice: '50000000-0000-4000-8000-000000000002',
    viewer: '50000000-0000-4000-8000-000000000003',
    viewerDevice: '50000000-0000-4000-8000-000000000004',
    outsider: '50000000-0000-4000-8000-000000000005',
    outsiderDevice: '50000000-0000-4000-8000-000000000006',
    revokedDevice: '50000000-0000-4000-8000-000000000007',
    foreignWorkspace: '60000000-0000-4000-8000-000000000001'
} as const;

const scope = { workspace: '', foreignDocument: '' };
const NOW = 1_900_000_000_000;
const codec = createDocumentCursorCodec(new Uint8Array(32).fill(9));

let counter = 0;
const uuid = (): string => {
    counter += 1;
    return `70000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const bytes = (length: number, seed: number): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (seed + index * 5) % 256);

const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

const editorReads = (): ReaderIdentity => ({
    actorUserId: ID.editor, actorDeviceId: ID.editorDevice, workspaceId: scope.workspace
});
const viewerReads = (): ReaderIdentity => ({
    actorUserId: ID.viewer, actorDeviceId: ID.viewerDevice, workspaceId: scope.workspace
});

async function createDocument(documentId: string, operation: 'create' | 'update' | 'delete' = 'create',
    baseRevision = 0): Promise<void> {
    const envelope = bytes(64, 7);
    await executeDocumentMutation(env.COLLAB_DB, {
        operation, actorUserId: ID.editor, actorDeviceId: ID.editorDevice,
        workspaceId: scope.workspace, documentId, baseRevision, keyVersion: 1, envelopeVersion: 1,
        ciphertextEnvelope: envelope, ciphertextDigest: bytes(32, 3),
        ciphertextBytes: envelope.length, clientMutationId: uuid(), serverTime: NOW,
        requestId: uuid(), auditEventId: uuid(), mutationResultId: uuid()
    });
}

const codeOf = async (run: () => Promise<unknown>): Promise<string | null> => {
    try { await run(); return null; } catch (error) {
        expect(error).toBeInstanceOf(DocumentReadError);
        return (error as DocumentReadError).code;
    }
};

describe('CF-P6-005 authorized document reads and revision history', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'document_read_migrations');
        await env.COLLAB_DB.batch([
            ...([[ID.editor, '71001'], [ID.viewer, '71002'], [ID.outsider, '71003']] as const)
                .map(([id, subject], index) => env.COLLAB_DB.prepare(
                    `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                      avatar_url, status, created_at, updated_at, deactivated_at)
                     VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
                ).bind(id, subject, `read-user-${index}`)),
            ...([[ID.editorDevice, ID.editor, 'active'], [ID.viewerDevice, ID.viewer, 'active'],
                [ID.outsiderDevice, ID.outsider, 'active'], [ID.revokedDevice, ID.editor, 'revoked']] as const)
                .map(([id, userId, state], index) => env.COLLAB_DB.prepare(
                    `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                      created_at, revoked_at, revoke_reason)
                     VALUES (?, ?, 'Read device', ?, ?, 'P256-ECDH-v1', ?, 1, ?, ?)`
                ).bind(id, userId, publicJwk, bytes(32, 80 + index * 11).buffer, state,
                    state === 'revoked' ? 2 : null, state === 'revoked' ? 'lost-device' : null)),
            env.COLLAB_DB.prepare(
                `INSERT INTO workspaces (id, display_name, description_envelope, state,
                  current_key_version, created_by, created_at, updated_at, deleted_at)
                 VALUES (?, 'Foreign', NULL, 'active', 1, ?, 2, 2, NULL)`
            ).bind(ID.foreignWorkspace, ID.editor)
        ]);
    });

    beforeEach(async () => {
        scope.workspace = uuid();
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Read workspace', NULL, 'active', 1, ?, 2, 2, NULL)`
        ).bind(scope.workspace, ID.editor).run();
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
                  accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
                 VALUES (?, ?, 'editor', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
            ).bind(scope.workspace, ID.editor, ID.editor),
            env.COLLAB_DB.prepare(
                `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
                  accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
                 VALUES (?, ?, 'viewer', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
            ).bind(scope.workspace, ID.viewer, ID.viewer)
        ]);
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'bootstrap', ?, ?, 2, 2, NULL)`
        ).bind(scope.workspace, ID.editorDevice, ID.editor).run();
    });

    // ---- sprint gate G2: Editor creates, Viewer reads ----
    it('G2: a Viewer reads a document an Editor created, and its revision history', async () => {
        const documentId = uuid();
        await createDocument(documentId);
        await createDocument(documentId, 'update', 1);

        const summary = await readDocument(env.COLLAB_DB, viewerReads(), documentId);
        expect(summary.revision).toBe(2);
        expect(summary.state).toBe('active');
        expect(typeof summary.payload).toBe('string');

        const page = await listDocuments(env.COLLAB_DB, viewerReads(), { codec, now: NOW });
        expect(page.items.map((item) => item.documentId)).toContain(documentId);

        const revisions = await listRevisions(env.COLLAB_DB, viewerReads(), documentId, { codec, now: NOW });
        expect(revisions.items.map((item) => item.revision)).toEqual([1, 2]);
        expect(revisions.items[0].operation).toBe('create');
        expect(revisions.items[0].baseRevision).toBe(0);

        const historical = await readRevision(env.COLLAB_DB, viewerReads(), documentId, 1);
        expect(historical.revision).toBe(1);
        expect(typeof historical.payload).toBe('string');
    });

    it('denies a non-member, a removed member, a revoked device, and a foreign workspace identically', async () => {
        const documentId = uuid();
        await createDocument(documentId);

        const outsider: ReaderIdentity = {
            actorUserId: ID.outsider, actorDeviceId: ID.outsiderDevice, workspaceId: scope.workspace
        };
        expect(await codeOf(() => readDocument(env.COLLAB_DB, outsider, documentId))).toBe('RESOURCE_NOT_FOUND');
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, outsider, { codec, now: NOW })))
            .toBe('RESOURCE_NOT_FOUND');

        const revoked: ReaderIdentity = { ...editorReads(), actorDeviceId: ID.revokedDevice };
        expect(await codeOf(() => readDocument(env.COLLAB_DB, revoked, documentId))).toBe('RESOURCE_NOT_FOUND');

        const foreign: ReaderIdentity = { ...editorReads(), workspaceId: ID.foreignWorkspace };
        expect(await codeOf(() => readDocument(env.COLLAB_DB, foreign, documentId))).toBe('RESOURCE_NOT_FOUND');

        await env.COLLAB_DB.prepare(
            "UPDATE memberships SET state = 'removed', removed_at = 9, removed_by = ? WHERE workspace_id = ? AND user_id = ?"
        ).bind(ID.editor, scope.workspace, ID.viewer).run();
        expect(await codeOf(() => readDocument(env.COLLAB_DB, viewerReads(), documentId)))
            .toBe('RESOURCE_NOT_FOUND');
    });

    it('a document from another workspace is not readable and not distinguishable from a missing one', async () => {
        const documentId = uuid();
        await createDocument(documentId);

        // Same authorized reader, a document identifier that exists but belongs
        // elsewhere, versus one that never existed: identical outcome.
        const other: ReaderIdentity = { ...editorReads(), workspaceId: ID.foreignWorkspace };
        const existsElsewhere = await codeOf(() => readDocument(env.COLLAB_DB, other, documentId));
        const neverExisted = await codeOf(() => readDocument(env.COLLAB_DB, other, uuid()));
        expect(existsElsewhere).toBe(neverExisted);
        expect(existsElsewhere).toBe('RESOURCE_NOT_FOUND');
    });

    it('a tombstoned document returns metadata without serving its ciphertext', async () => {
        const documentId = uuid();
        await createDocument(documentId);
        await createDocument(documentId, 'delete', 1);

        const summary = await readDocument(env.COLLAB_DB, viewerReads(), documentId);
        expect(summary.state).toBe('tombstoned');
        expect(summary.payload).toBeNull();

        // The revision chain still shows it, and the tombstone revision serves no payload.
        const revisions = await listRevisions(env.COLLAB_DB, viewerReads(), documentId, { codec, now: NOW });
        expect(revisions.items.map((item) => item.operation)).toEqual(['create', 'delete']);
        expect(revisions.items[1].tombstone).toBe(true);

        const tombstone = await readRevision(env.COLLAB_DB, viewerReads(), documentId, 2);
        expect(tombstone.tombstone).toBe(true);
        expect(tombstone.payload).toBeUndefined();

        // The pre-delete revision remains readable for recovery and audit.
        expect(typeof (await readRevision(env.COLLAB_DB, viewerReads(), documentId, 1)).payload).toBe('string');
    });

    it('paginates documents with an opaque cursor and a bounded page size', async () => {
        const ids: string[] = [];
        for (let index = 0; index < 5; index += 1) {
            const documentId = uuid();
            ids.push(documentId);
            await createDocument(documentId);
        }

        const first = await listDocuments(env.COLLAB_DB, editorReads(), { limit: 2, codec, now: NOW });
        expect(first.items).toHaveLength(2);
        expect(first.nextCursor).not.toBeNull();
        // Opaque: the cursor reveals no identifier verbatim.
        for (const id of ids) expect(first.nextCursor).not.toContain(id);

        const second = await listDocuments(env.COLLAB_DB, editorReads(),
            { limit: 2, cursor: first.nextCursor as string, codec, now: NOW });
        expect(second.items).toHaveLength(2);
        expect(second.items[0].documentId).not.toBe(first.items[0].documentId);

        const seen = new Set([...first.items, ...second.items].map((item) => item.documentId));
        expect(seen.size).toBe(4);

        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { limit: DOCUMENT_READ_LIMITS.maximumPageSize + 1, codec, now: NOW }))).toBe('VALIDATION_FAILED');
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { limit: 0, codec, now: NOW }))).toBe('VALIDATION_FAILED');
    });

    it('a cursor cannot be forged, tampered with, replayed across workspaces, or reused after expiry', async () => {
        for (let index = 0; index < 3; index += 1) await createDocument(uuid());
        const page = await listDocuments(env.COLLAB_DB, editorReads(), { limit: 1, codec, now: NOW });
        const cursor = page.nextCursor as string;

        // Tampered signature and tampered body both fail.
        const [body, signature] = cursor.split('.');
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: `${body}.${signature.slice(0, -2)}AA`, codec, now: NOW }))).toBe('INVALID_CURSOR');
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: `${body}AA.${signature}`, codec, now: NOW }))).toBe('INVALID_CURSOR');
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: 'not-a-cursor', codec, now: NOW }))).toBe('INVALID_CURSOR');

        // A cursor signed with a different key is rejected.
        const foreignCodec = createDocumentCursorCodec(new Uint8Array(32).fill(1));
        const forged = await foreignCodec.issue(
            { route: 'documents', workspaceId: scope.workspace, documentId: null, position: 'x' }, NOW);
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: forged, codec, now: NOW }))).toBe('INVALID_CURSOR');

        // A validly signed cursor bound to another workspace is rejected.
        const otherWorkspaceCursor = await codec.issue(
            { route: 'documents', workspaceId: ID.foreignWorkspace, documentId: null, position: 'x' }, NOW);
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: otherWorkspaceCursor, codec, now: NOW }))).toBe('INVALID_CURSOR');

        // A revisions cursor cannot be used on the documents route.
        const wrongRoute = await codec.issue(
            { route: 'document-revisions', workspaceId: scope.workspace, documentId: null, position: 1 }, NOW);
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor: wrongRoute, codec, now: NOW }))).toBe('INVALID_CURSOR');

        // Expiry.
        expect(await codeOf(() => listDocuments(env.COLLAB_DB, editorReads(),
            { cursor, codec, now: NOW + DOCUMENT_READ_LIMITS.cursorTtlMilliseconds + 1 }))).toBe('INVALID_CURSOR');
    });

    it('paginates revision history in ascending order with its own bound cursor', async () => {
        const documentId = uuid();
        await createDocument(documentId);
        for (let revision = 1; revision <= 4; revision += 1) {
            await createDocument(documentId, 'update', revision);
        }

        const first = await listRevisions(env.COLLAB_DB, viewerReads(), documentId,
            { limit: 2, codec, now: NOW });
        expect(first.items.map((item) => item.revision)).toEqual([1, 2]);

        const second = await listRevisions(env.COLLAB_DB, viewerReads(), documentId,
            { limit: 2, cursor: first.nextCursor as string, codec, now: NOW });
        expect(second.items.map((item) => item.revision)).toEqual([3, 4]);

        // The same cursor bound to a different document is rejected.
        const otherDocument = uuid();
        await createDocument(otherDocument);
        expect(await codeOf(() => listRevisions(env.COLLAB_DB, viewerReads(), otherDocument,
            { limit: 2, cursor: first.nextCursor as string, codec, now: NOW }))).toBe('INVALID_CURSOR');
    });

    it('rejects malformed identifiers and revisions before querying', async () => {
        expect(await codeOf(() => readDocument(env.COLLAB_DB, editorReads(), 'not-a-uuid')))
            .toBe('VALIDATION_FAILED');
        expect(await codeOf(() => readRevision(env.COLLAB_DB, editorReads(), uuid(), 0)))
            .toBe('VALIDATION_FAILED');
        expect(await codeOf(() => readRevision(env.COLLAB_DB, editorReads(), uuid(), 1.5)))
            .toBe('VALIDATION_FAILED');
    });

    it('an unknown revision of a readable document is not found', async () => {
        const documentId = uuid();
        await createDocument(documentId);
        expect(await codeOf(() => readRevision(env.COLLAB_DB, viewerReads(), documentId, 99)))
            .toBe('RESOURCE_NOT_FOUND');
    });

    it('read responses are non-cacheable and bypass the Service Worker', () => {
        const headers = documentReadHeaders('11111111-1111-4111-8111-111111111111');
        expect(headers.get('Cache-Control')).toBe('no-store, private');
        expect(headers.get('Pragma')).toBe('no-cache');
        expect(headers.get('Expires')).toBe('0');
        expect(headers.get('Service-Worker-Allowed')).toBe('none');
        expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
        expect(headers.get('Referrer-Policy')).toBe('no-referrer');
        expect(headers.get('Content-Type')).toBe('application/json; charset=utf-8');
    });
});
