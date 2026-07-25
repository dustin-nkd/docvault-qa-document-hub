import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
// The outbox is the real browser module; only its store is swapped for memory.
import { createMemoryOutboxStore, createOutbox } from '../../js/collaboration/outbox.js';
import {
    DocumentMutationError,
    executeDocumentMutation,
    type DocumentMutationRequest
} from '../../functions/_lib/documents/document-service';

const ID = {
    editor: '80000000-0000-4000-8000-000000000001',
    editorDevice: '80000000-0000-4000-8000-000000000002'
} as const;

const scope = { workspace: '', namespace: 'docvault:collab:local-browser-test:outbox' };
const NOW = 1_900_000_000_000;

let counter = 0;
const uuid = (): string => {
    counter += 1;
    return `90000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
};

const bytes = (length: number, seed: number): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (seed + index * 3) % 256);

const publicJwk = JSON.stringify({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'A'.repeat(43), y: 'B'.repeat(43)
});

interface QueuedEntry {
    id: string;
    documentId: string;
    clientMutationId: string;
    operation: 'create' | 'update' | 'delete';
    baseRevision: number;
    keyVersion: number;
    payload: Uint8Array;
    predecessorId?: string | null;
}

/** A claim that returned null is a test failure, not a type to paper over. */
function mustClaim<T>(value: T | null): T {
    expect(value, 'expected the outbox to yield a claimable entry').not.toBeNull();
    return value as T;
}

/** Submit one claimed outbox entry through the real mutation service. */
async function submit(claimed: QueuedEntry): Promise<{ revision: number; replayed: boolean }> {
    const request: DocumentMutationRequest = {
        operation: claimed.operation,
        actorUserId: ID.editor,
        actorDeviceId: ID.editorDevice,
        workspaceId: scope.workspace,
        documentId: claimed.documentId,
        baseRevision: claimed.baseRevision,
        keyVersion: claimed.keyVersion,
        envelopeVersion: 1,
        ciphertextEnvelope: claimed.payload,
        ciphertextDigest: bytes(32, 5),
        ciphertextBytes: claimed.payload.length,
        // The ORIGINAL mutation id travels with every retry.
        clientMutationId: claimed.clientMutationId,
        serverTime: NOW,
        requestId: uuid(),
        auditEventId: uuid(),
        mutationResultId: uuid()
    };
    const outcome = await executeDocumentMutation(env.COLLAB_DB, request);
    return { revision: outcome.revision, replayed: outcome.replayed };
}

async function counts() {
    const read = async (sql: string): Promise<number> =>
        (await env.COLLAB_DB.prepare(sql).bind(scope.workspace).first<number>('n')) ?? 0;
    return {
        documents: await read('SELECT COUNT(*) AS n FROM documents WHERE workspace_id = ?'),
        revisions: await read('SELECT COUNT(*) AS n FROM document_revisions WHERE workspace_id = ?'),
        audit: await read(
            "SELECT COUNT(*) AS n FROM audit_events WHERE workspace_id = ? AND event_type LIKE 'document.%'")
    };
}

function makeOutbox() {
    let clock = NOW;
    const outbox = createOutbox({
        store: createMemoryOutboxStore(),
        namespace: scope.namespace,
        now: () => clock,
        random: () => 0.5
    });
    return { outbox, advance: (ms: number) => { clock += ms; } };
}

const queued = (documentId: string, overrides: Partial<QueuedEntry> = {}) => ({
    id: uuid(),
    documentId,
    clientMutationId: uuid(),
    operation: 'create' as const,
    baseRevision: 0,
    keyVersion: 1,
    payload: bytes(64, 9),
    draft: bytes(24, 2),
    ...overrides
});

describe('CF-P6-006 offline outbox replay against real D1', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'outbox_replay_migrations');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '81001', 'outbox-user', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.editor),
            env.COLLAB_DB.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES (?, ?, 'Outbox device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
            ).bind(ID.editorDevice, ID.editor, publicJwk, bytes(32, 21).buffer)
        ]);
    });

    beforeEach(async () => {
        scope.workspace = uuid();
        await env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Outbox workspace', NULL, 'active', 1, ?, 2, 2, NULL)`
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

    // ---- sprint gate G6 ----
    it('G6: a mutation queued offline is submitted after reconnect and creates exactly one revision', async () => {
        const { outbox, advance } = makeOutbox();
        const documentId = uuid();
        await outbox.enqueue(queued(documentId));

        // Offline: the first attempt fails at the network, so nothing reaches D1.
        const firstAttempt = mustClaim(await outbox.claimNext());
        await outbox.recordFailure(firstAttempt.id, { status: 0, code: 'NETWORK_UNAVAILABLE' });
        expect(await counts()).toEqual({ documents: 0, revisions: 0, audit: 0 });

        // Reconnect: the retry carries the original mutation id and applies once.
        advance(60_000);
        const retry = mustClaim(await outbox.claimNext());
        expect(retry.clientMutationId).toBe(firstAttempt.clientMutationId);
        const applied = await submit(retry);
        expect(applied.revision).toBe(1);
        await outbox.recordSuccess(retry.id, applied);

        expect(await counts()).toEqual({ documents: 1, revisions: 1, audit: 1 });
        expect((await outbox.stats()).pending).toBe(0);
    });

    it('G6: a lost response followed by a retry still yields exactly one revision', async () => {
        const { outbox, advance } = makeOutbox();
        const documentId = uuid();
        await outbox.enqueue(queued(documentId));

        // The server applied the mutation but the response was lost, so the
        // client believes it failed and retries with the same mutation id.
        const first = mustClaim(await outbox.claimNext());
        const applied = await submit(first);
        expect(applied.replayed).toBe(false);
        await outbox.recordFailure(first.id, { status: 0, code: 'NETWORK_UNAVAILABLE' });

        advance(60_000);
        const retry = mustClaim(await outbox.claimNext());
        const second = await submit(retry);
        expect(second.replayed).toBe(true);
        expect(second.revision).toBe(applied.revision);
        await outbox.recordSuccess(retry.id, second);

        expect(await counts()).toEqual({ documents: 1, revisions: 1, audit: 1 });
    });

    it('G6: an entry whose authority changed is quarantined and never reaches D1', async () => {
        const { outbox } = makeOutbox();
        const documentId = uuid();
        await outbox.enqueue(queued(documentId));

        // Membership is removed while the entry sits in the queue.
        await env.COLLAB_DB.prepare(
            "UPDATE memberships SET state = 'removed', removed_at = 9, removed_by = ? WHERE workspace_id = ? AND user_id = ?"
        ).bind(ID.editor, scope.workspace, ID.editor).run();
        await outbox.quarantine('membership-lost');

        expect(await outbox.claimNext()).toBeNull();
        expect(await counts()).toEqual({ documents: 0, revisions: 0, audit: 0 });

        const stored = (await outbox.list())[0];
        expect(stored.state).toBe('quarantined');
        expect(stored.quarantineReason).toBe('membership-lost');
    });

    it('a server denial is terminal and the queue stops rather than hammering D1', async () => {
        const { outbox } = makeOutbox();
        const documentId = uuid();
        // A stale base revision on a document that does not exist yet.
        await outbox.enqueue(queued(documentId, { operation: 'update', baseRevision: 5 }));

        const claimed = mustClaim(await outbox.claimNext());
        let denial: DocumentMutationError | null = null;
        try { await submit(claimed); } catch (error) { denial = error as DocumentMutationError; }
        expect(denial).toBeInstanceOf(DocumentMutationError);

        const stopped = await outbox.recordFailure(claimed.id, { code: denial!.code });
        expect(stopped.state).toBe('terminal');
        expect(await outbox.claimNext()).toBeNull();
        expect(await counts()).toEqual({ documents: 0, revisions: 0, audit: 0 });
    });

    it('per-document ordering holds across a real create then update sequence', async () => {
        const { outbox } = makeOutbox();
        const documentId = uuid();
        const create = await outbox.enqueue(queued(documentId));
        await outbox.enqueue(queued(documentId, {
            operation: 'update', baseRevision: 1, predecessorId: create.id
        }));

        const first = mustClaim(await outbox.claimNext());
        expect(first.operation).toBe('create');
        // The dependent update cannot overtake the create it builds on.
        expect(await outbox.claimNext()).toBeNull();
        await outbox.recordSuccess(first.id, await submit(first));

        const second = mustClaim(await outbox.claimNext());
        expect(second.operation).toBe('update');
        const updated = await submit(second);
        expect(updated.revision).toBe(2);
        await outbox.recordSuccess(second.id, updated);

        expect(await counts()).toEqual({ documents: 1, revisions: 2, audit: 2 });
    });
});
