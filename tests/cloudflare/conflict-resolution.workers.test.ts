import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
// The real browser module; only the submission is wired to the real service.
import {
    openConflict,
    prepareWorkspaceCopy,
    resolveConflict,
    resolveCopyReplay
} from '../../js/collaboration/conflict-resolution.js';
import {
    DOCUMENT_ERRORS,
    DocumentMutationError,
    executeDocumentMutation,
    type DocumentMutationRequest
} from '../../functions/_lib/documents/document-service';

const ID = {
    editor: 'a0000000-0000-4000-8000-000000000001',
    editorDevice: 'a0000000-0000-4000-8000-000000000002'
} as const;

const scope = { workspace: '' };
const NOW = 1_900_000_000_000;

let counter = 0;
const uuid = (): string => {
    counter += 1;
    return `b0000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const bytes = (length: number, seed: number): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (seed + index * 3) % 256);

const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

/** A resolution that produced no intent is a test failure, not a type to paper over. */
function mustIntent<T>(value: T | null | undefined): T {
    expect(value, 'expected the resolution to produce a submission intent').not.toBeNull();
    return value as T;
}

async function mutate(overrides: Partial<DocumentMutationRequest>) {
    const envelope = overrides.ciphertextEnvelope ?? bytes(64, 11);
    const request: DocumentMutationRequest = {
        operation: 'create',
        actorUserId: ID.editor,
        actorDeviceId: ID.editorDevice,
        workspaceId: scope.workspace,
        documentId: uuid(),
        baseRevision: 0,
        keyVersion: 1,
        envelopeVersion: 1,
        ciphertextEnvelope: envelope,
        ciphertextDigest: bytes(32, 4),
        ciphertextBytes: envelope.length,
        clientMutationId: uuid(),
        serverTime: NOW,
        requestId: uuid(),
        auditEventId: uuid(),
        mutationResultId: uuid(),
        ...overrides
    };
    return executeDocumentMutation(env.COLLAB_DB, request);
}

async function revisionOf(documentId: string): Promise<number | null> {
    return env.COLLAB_DB.prepare(
        'SELECT current_revision AS revision FROM documents WHERE id = ? AND workspace_id = ?'
    ).bind(documentId, scope.workspace).first<number>('revision');
}

describe('CF-P6-007 conflict resolution and copy against real D1', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'conflict_resolution_migrations');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '91001', 'conflict-user', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.editor),
            env.COLLAB_DB.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES (?, ?, 'Conflict device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
            ).bind(ID.editorDevice, ID.editor, publicJwk, bytes(32, 31).buffer)
        ]);
    });

    beforeEach(async () => {
        scope.workspace = uuid();
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Conflict workspace', NULL, 'active', 1, ?, 2, 2, NULL)`
        ).bind(scope.workspace, ID.editor).run();
        await env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'editor', 'active', NULL, ?, NULL, 2, 2, NULL, 1)`
        ).bind(scope.workspace, ID.editor, ID.editor).run();
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
              rotation_reason, created_by_device_id, created_by_user_id, created_at,
              committed_at, retired_at)
             VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'bootstrap', ?, ?, 2, 2, NULL)`
        ).bind(scope.workspace, ID.editorDevice, ID.editor).run();
    });

    it('a real 409 opens a conflict that retains the draft', async () => {
        const documentId = uuid();
        await mutate({ documentId });
        await mutate({ documentId, operation: 'update', baseRevision: 1 });

        let rejection: DocumentMutationError | null = null;
        try {
            await mutate({ documentId, operation: 'update', baseRevision: 1 });
        } catch (error) { rejection = error as DocumentMutationError; }

        expect(rejection?.code).toBe(DOCUMENT_ERRORS.conflict);
        const conflict = openConflict({
            conflictId: uuid(),
            documentId,
            submittedBaseRevision: rejection!.details!.submittedBaseRevision,
            currentRevision: rejection!.details!.currentRevision,
            draft: bytes(32, 77),
            now: NOW
        });
        expect(conflict.state).toBe('unresolved');
        expect(conflict.draftRetained).toBe(true);
        expect(conflict.currentRevision).toBe(2);
    });

    it('reapply-to-latest applies against the current revision and advances by one', async () => {
        const documentId = uuid();
        await mutate({ documentId });
        await mutate({ documentId, operation: 'update', baseRevision: 1 });

        const conflict = openConflict({
            conflictId: uuid(), documentId,
            submittedBaseRevision: 1, currentRevision: 2,
            draft: bytes(32, 5), now: NOW
        });
        const resolved = resolveConflict(conflict, 'reapply-to-latest', { clientMutationId: uuid() });

        const applied = await mutate({
            documentId,
            operation: 'update',
            baseRevision: mustIntent(resolved.intent).baseRevision,
            clientMutationId: mustIntent(resolved.intent).clientMutationId
        });
        expect(applied.revision).toBe(mustIntent(resolved.intent).expectedRevision);
        expect(await revisionOf(documentId)).toBe(3);
    });

    it('save-as-separate-copy creates a new document at revision 1 and leaves the original alone', async () => {
        const documentId = uuid();
        await mutate({ documentId });
        await mutate({ documentId, operation: 'update', baseRevision: 1 });

        const conflict = openConflict({
            conflictId: uuid(), documentId,
            submittedBaseRevision: 1, currentRevision: 2,
            draft: bytes(32, 6), now: NOW
        });
        const copyId = uuid();
        const resolved = resolveConflict(conflict, 'save-as-separate-copy',
            { newDocumentId: copyId, clientMutationId: uuid() });

        const created = await mutate({
            documentId: mustIntent(resolved.intent).documentId,
            operation: 'create',
            baseRevision: 0,
            clientMutationId: mustIntent(resolved.intent).clientMutationId
        });
        expect(created.revision).toBe(1);
        expect(await revisionOf(copyId)).toBe(1);
        // The document that conflicted is untouched by the separate copy.
        expect(await revisionOf(documentId)).toBe(2);
    });

    it('a discarded draft submits nothing', async () => {
        const documentId = uuid();
        await mutate({ documentId });
        const before = await revisionOf(documentId);

        const conflict = openConflict({
            conflictId: uuid(), documentId,
            submittedBaseRevision: 1, currentRevision: 2,
            draft: bytes(32, 7), now: NOW
        });
        const discarded = resolveConflict(conflict, 'discard-with-confirmation', { confirmed: true });
        expect(discarded.draftRetained).toBe(false);
        expect(discarded.intent).toBeNull();
        expect(await revisionOf(documentId)).toBe(before);
    });

    it('a workspace copy lands at revision 1 and is unlinked from its source', async () => {
        const sourceId = uuid();
        const destinationId = uuid();
        const intent = prepareWorkspaceCopy({
            source: { id: sourceId, category: 'testcase' },
            destinationWorkspaceId: scope.workspace,
            destinationRole: 'editor',
            keyReady: true,
            newDocumentId: destinationId,
            clientMutationId: uuid(),
            confirmedClassification: true
        });
        expect(intent.sourceMutated).toBe(false);
        expect(intent.linked).toBe(false);

        const created = await mutate({
            documentId: intent.destinationDocumentId,
            operation: 'create',
            baseRevision: 0,
            clientMutationId: intent.clientMutationId
        });
        expect(created.revision).toBe(1);
        expect(await revisionOf(destinationId)).toBe(1);
        // The personal source has no workspace row at all.
        expect(await revisionOf(sourceId)).toBeNull();
    });

    it('repeating a completed copy returns the original result and creates no second document', async () => {
        const destinationId = uuid();
        const mutationId = uuid();
        const intent = prepareWorkspaceCopy({
            source: { id: uuid(), category: 'runbook' },
            destinationWorkspaceId: scope.workspace,
            destinationRole: 'owner',
            keyReady: true,
            newDocumentId: destinationId,
            clientMutationId: mutationId,
            confirmedClassification: true
        });

        const first = await mutate({
            documentId: intent.destinationDocumentId, operation: 'create',
            baseRevision: 0, clientMutationId: intent.clientMutationId
        });
        expect(first.replayed).toBe(false);

        const completed = new Map([[mutationId, first]]);
        expect(resolveCopyReplay(completed, intent).replayed).toBe(true);

        // Even submitted again, the server replays rather than duplicating.
        const second = await mutate({
            documentId: intent.destinationDocumentId, operation: 'create',
            baseRevision: 0, clientMutationId: intent.clientMutationId
        });
        expect(second.replayed).toBe(true);
        expect(second.revision).toBe(first.revision);

        const documents = await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS n FROM documents WHERE workspace_id = ?'
        ).bind(scope.workspace).first<number>('n');
        expect(documents).toBe(1);
    });
});
