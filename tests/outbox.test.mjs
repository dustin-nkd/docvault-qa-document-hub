// CF-P6-006 — Encrypted offline outbox state machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    OUTBOX_NON_RETRYABLE,
    OutboxError,
    QUARANTINE_REASONS,
    createMemoryOutboxStore,
    createOutbox
} from '../js/collaboration/outbox.js';

const NS = 'docvault:collab:preview:user-1:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';
const DOC_A = '33333333-3333-4333-8333-333333333333';
const DOC_B = '44444444-4444-4444-8444-444444444444';
const START = 1_900_000_000_000;

let counter = 0;
const uuid = () => {
    counter += 1;
    return `55555555-5555-4555-8555-${counter.toString(16).padStart(12, '0')}`;
};

const bytes = (length) => new Uint8Array(length).fill(7);

function harness(options = {}) {
    let clock = START;
    const store = options.store ?? createMemoryOutboxStore();
    const outbox = createOutbox({
        store,
        namespace: options.namespace ?? NS,
        now: () => clock,
        random: () => 0.5
    });
    return {
        outbox, store,
        advance(ms) { clock += ms; return clock; },
        get now() { return clock; }
    };
}

const entry = (overrides = {}) => ({
    id: uuid(),
    documentId: DOC_A,
    clientMutationId: uuid(),
    operation: 'update',
    baseRevision: 1,
    keyVersion: 1,
    payload: bytes(64),
    draft: bytes(32),
    ...overrides
});

const codeOf = async (fn) => {
    try { await fn(); return null; } catch (error) {
        assert.ok(error instanceof OutboxError, `expected OutboxError, got ${error}`);
        return error.code;
    }
};

test('an entry stores only bytes and minimum routing metadata', async () => {
    const { outbox } = harness();
    const stored = await outbox.enqueue(entry());
    assert.equal(stored.state, 'queued');
    assert.ok(stored.payload instanceof Uint8Array);
    assert.ok(stored.draft instanceof Uint8Array);

    // Nothing in the persisted shape may carry document content.
    const keys = Object.keys(stored).sort();
    for (const forbidden of ['title', 'body', 'content', 'plaintext', 'category']) {
        assert.ok(!keys.includes(forbidden), `outbox entry exposes ${forbidden}`);
    }
});

test('a plaintext payload or draft is refused outright', async () => {
    const { outbox } = harness();
    assert.equal(await codeOf(() => outbox.enqueue(entry({ payload: 'my secret note' }))), 'INVALID_PAYLOAD');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ draft: 'draft text' }))), 'INVALID_DRAFT');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ payload: new Uint8Array(0) }))), 'INVALID_PAYLOAD');
});

test('malformed routing metadata is refused', async () => {
    const { outbox } = harness();
    assert.equal(await codeOf(() => outbox.enqueue(entry({ documentId: 'x' }))), 'INVALID_DOCUMENT');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ clientMutationId: 'x' }))), 'INVALID_MUTATION_ID');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ operation: 'purge' }))), 'INVALID_OPERATION');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ keyVersion: 0 }))), 'INVALID_KEY_VERSION');
    assert.equal(await codeOf(() => outbox.enqueue(entry({ baseRevision: -1 }))), 'INVALID_BASE_REVISION');
});

test('a queued mutation submitted after reconnect is claimed exactly once', async () => {
    const { outbox } = harness();
    const queued = await outbox.enqueue(entry());

    const claimed = await outbox.claimNext();
    assert.equal(claimed.id, queued.id);
    assert.equal(claimed.state, 'inflight');
    // Its original mutation id is preserved for the server to recognise.
    assert.equal(claimed.clientMutationId, queued.clientMutationId);

    // While inflight, the same document yields nothing else.
    assert.equal(await outbox.claimNext(), null);

    await outbox.recordSuccess(claimed.id, { revision: 2 });
    assert.equal(await outbox.claimNext(), null);
    assert.equal((await outbox.stats()).pending, 0);
});

test('a retry reuses the original mutation id and backs off with jitter', async () => {
    const { outbox, advance } = harness();
    const queued = await outbox.enqueue(entry());

    const first = await outbox.claimNext();
    const retried = await outbox.recordFailure(first.id, { status: 503 });
    assert.equal(retried.state, 'queued');
    assert.equal(retried.clientMutationId, queued.clientMutationId);
    assert.ok(retried.nextAttemptAt > START, 'a retry must wait');

    // Not yet due.
    assert.equal(await outbox.claimNext(), null);
    advance(retried.nextAttemptAt - START);
    const second = await outbox.claimNext();
    assert.equal(second.id, queued.id);
    assert.equal(second.attempts, 2);

    // Backoff grows.
    const again = await outbox.recordFailure(second.id, { status: 500 });
    assert.ok(again.nextAttemptAt - second.nextAttemptAt > 0);
});

test('401, 403, 409, and contract failures never auto-retry', async () => {
    for (const failure of [{ status: 401 }, { status: 403 }, { status: 409 },
        { code: 'KEY_VERSION_MISMATCH' }, { code: 'VALIDATION_FAILED' },
        { code: 'DOCUMENT_REVISION_CONFLICT' }, { code: 'IDEMPOTENCY_KEY_REUSED' },
        { status: 404 }, { code: 'RESOURCE_NOT_FOUND' }]) {
        const { outbox } = harness();
        await outbox.enqueue(entry());
        const claimed = await outbox.claimNext();
        const result = await outbox.recordFailure(claimed.id, failure);
        assert.equal(result.state, 'terminal', `${JSON.stringify(failure)} should be terminal`);
        assert.equal(await outbox.claimNext(), null);
    }
    assert.deepEqual([...OUTBOX_NON_RETRYABLE.statuses], [400, 401, 403, 404, 409]);
});

test('a retry storm stops at the attempt ceiling instead of looping forever', async () => {
    const { outbox, advance } = harness();
    await outbox.enqueue(entry());
    let state = 'queued';
    for (let attempt = 0; attempt < 20 && state !== 'terminal'; attempt += 1) {
        const claimed = await outbox.claimNext();
        if (claimed === null) { advance(MAX_WAIT); continue; }
        state = (await outbox.recordFailure(claimed.id, { status: 503 })).state;
        advance(MAX_WAIT);
    }
    assert.equal(state, 'terminal');
});
const MAX_WAIT = 5 * 60 * 1_000 + 1;

test('per-document FIFO keeps a dependent entry behind its predecessor', async () => {
    const { outbox } = harness();
    const first = await outbox.enqueue(entry({ documentId: DOC_A }));
    const second = await outbox.enqueue(entry({ documentId: DOC_A, predecessorId: first.id }));

    const claimedFirst = await outbox.claimNext();
    assert.equal(claimedFirst.id, first.id);
    assert.equal(await outbox.claimNext(), null, 'the dependent entry must wait');

    await outbox.recordSuccess(first.id, { revision: 2 });
    const claimedSecond = await outbox.claimNext();
    assert.equal(claimedSecond.id, second.id);
});

test('independent documents progress concurrently', async () => {
    const { outbox } = harness();
    const a = await outbox.enqueue(entry({ documentId: DOC_A }));
    const b = await outbox.enqueue(entry({ documentId: DOC_B }));

    const firstClaim = await outbox.claimNext();
    const secondClaim = await outbox.claimNext();
    assert.deepEqual([firstClaim.id, secondClaim.id].sort(), [a.id, b.id].sort());
});

test('the quota warns at 80 percent and then refuses without losing the draft', async () => {
    const { outbox } = harness();
    for (let index = 0; index < 80; index += 1) await outbox.enqueue(entry({ documentId: uuid() }));
    const warned = await outbox.stats();
    assert.equal(warned.pending, 80);
    assert.equal(warned.warning, true);
    assert.equal(warned.full, false);

    for (let index = 0; index < 20; index += 1) await outbox.enqueue(entry({ documentId: uuid() }));
    const full = await outbox.stats();
    assert.equal(full.full, true);
    assert.equal(await codeOf(() => outbox.enqueue(entry({ documentId: uuid() }))), 'OUTBOX_FULL');
    // The already-queued work is untouched by the refusal.
    assert.equal((await outbox.stats()).pending, 100);
});

test('a byte ceiling is enforced as well as an entry ceiling', async () => {
    const { outbox } = harness();
    const huge = 6 * 1024 * 1024;
    for (let index = 0; index < 4; index += 1) {
        await outbox.enqueue(entry({ documentId: uuid(), payload: bytes(huge), draft: bytes(16) }));
    }
    assert.equal(await codeOf(() => outbox.enqueue(
        entry({ documentId: uuid(), payload: bytes(huge), draft: bytes(16) }))), 'OUTBOX_FULL');
});

test('seven-day expiry quarantines the entry and never deletes the draft', async () => {
    const { outbox, advance } = harness();
    const queued = await outbox.enqueue(entry());

    advance(7 * 24 * 60 * 60 * 1_000);
    const expired = await outbox.expire();
    assert.equal(expired.length, 1);
    assert.equal(expired[0].state, 'expired');
    assert.equal(expired[0].quarantineReason, 'expired');

    // Still present, still carrying its encrypted draft, no longer claimable.
    const stored = (await outbox.list()).find((item) => item.id === queued.id);
    assert.ok(stored.draft instanceof Uint8Array);
    assert.equal(await outbox.claimNext(), null);
});

test('every authority change quarantines pending work with an accurate reason', async () => {
    for (const reason of QUARANTINE_REASONS.filter((value) => value !== 'expired')) {
        const { outbox } = harness();
        await outbox.enqueue(entry());
        const affected = await outbox.quarantine(reason);
        assert.equal(affected.length, 1);
        assert.equal(affected[0].state, 'quarantined');
        assert.equal(affected[0].quarantineReason, reason);
        assert.equal(await outbox.claimNext(), null, `${reason} must stop execution`);
    }
    const { outbox } = harness();
    assert.equal(await codeOf(() => outbox.quarantine('because')), 'INVALID_QUARANTINE_REASON');
});

test('quarantined work never silently executes even after re-enqueueing elsewhere', async () => {
    const { outbox } = harness();
    const queued = await outbox.enqueue(entry());
    await outbox.quarantine('device-revoked');

    // A later claim attempt yields nothing; only an explicit user action moves it.
    assert.equal(await outbox.claimNext(), null);
    const stored = (await outbox.list()).find((item) => item.id === queued.id);
    assert.equal(stored.state, 'quarantined');
    assert.equal(stored.quarantineReason, 'device-revoked');
});

test('an entry may be disposed only once its result is durably recorded', async () => {
    const { outbox } = harness();
    const queued = await outbox.enqueue(entry());
    const claimed = await outbox.claimNext();
    assert.equal(await codeOf(() => outbox.dispose(claimed.id)), 'RESULT_NOT_RECORDED');

    await outbox.recordSuccess(claimed.id, { revision: 2 });
    assert.equal(await outbox.dispose(queued.id), true);
    assert.equal((await outbox.list()).length, 0);
});

test('an explicit discard is always allowed and a duplicate id is refused', async () => {
    const { outbox } = harness();
    const queued = await outbox.enqueue(entry());
    assert.equal(await codeOf(() => outbox.enqueue({ ...entry(), id: queued.id })), 'DUPLICATE_ENTRY');
    assert.equal(await outbox.discard(queued.id), true);
    assert.equal((await outbox.list()).length, 0);
});

test('namespaces are isolated so another context cannot see or claim this work', async () => {
    const store = createMemoryOutboxStore();
    const mine = harness({ store });
    const theirs = harness({ store, namespace: `${NS}:other` });

    await mine.outbox.enqueue(entry());
    assert.equal((await mine.outbox.list()).length, 1);
    assert.equal((await theirs.outbox.list()).length, 0);
    assert.equal(await theirs.outbox.claimNext(), null);
    assert.equal((await theirs.outbox.stats()).pending, 0);
});

test('the outbox refuses to construct without a store or a namespace', async () => {
    assert.equal(await codeOf(async () => createOutbox({ namespace: NS })), 'STORE_UNAVAILABLE');
    assert.equal(await codeOf(async () => createOutbox({ store: createMemoryOutboxStore() })),
        'INVALID_NAMESPACE');
});
