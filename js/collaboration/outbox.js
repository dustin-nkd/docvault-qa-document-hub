// CF-P6-006 — Encrypted offline outbox (ADR-006).
//
// Edits made while offline are durable, but a queued entry is NOT permission to
// execute later. Every submission is re-authorized by the server, and any change
// of authority — logout, account or workspace switch, role removal, device
// revocation, membership loss, key rotation — moves affected entries to
// quarantine rather than letting them run against authority the user no longer
// has.
//
// State machine:
//
//   queued ──claim──> inflight ──success──> applied
//      ▲                  │
//      │                  ├── retryable (network, 5xx, 429) ──backoff──┐
//      └──────────────────┘                                            │
//      │                  └── 401 403 409 KEY_VERSION_MISMATCH ──> terminal
//      │                                                              │
//      ├── 7 days ─────────────────────────────────> expired (quarantine)
//      └── authority change ───────────────────────> quarantined
//
// Nothing is ever silently deleted: expiry and quarantine keep the encrypted
// draft so the user can still export or re-apply it. Only a durably recorded
// success, or an explicit discard, removes an entry.
//
// The store holds ciphertext and minimum routing metadata only. Document titles,
// bodies, and any other plaintext never reach it.

const STATES = Object.freeze(['queued', 'inflight', 'applied', 'terminal', 'expired', 'quarantined']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Frozen by CF-P6-001 §5.
const MAX_PENDING_ENTRIES = 100;
const MAX_BYTES = 25 * 1024 * 1024;
const WARN_AT_PERCENT = 80;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_ATTEMPTS = 8;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;

// A queued mutation must never auto-retry into an authority or contract failure.
// 404 is included alongside the ADR-006 list: on a mutation target it means the
// document is gone, tombstoned, or not visible to this caller, and none of those
// resolve by trying again — retrying would just hammer the server forever.
const NON_RETRYABLE_STATUSES = Object.freeze([400, 401, 403, 404, 409]);
const NON_RETRYABLE_CODES = Object.freeze(['KEY_VERSION_MISMATCH', 'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_WINDOW_EXPIRED', 'DOCUMENT_REVISION_CONFLICT',
    'RESOURCE_NOT_FOUND']);

export const QUARANTINE_REASONS = Object.freeze(['logout', 'account-change', 'workspace-change',
    'role-removed', 'device-revoked', 'membership-lost', 'key-rotated', 'schema-unsupported',
    'lifecycle-incompatible', 'expired']);

/**
 * @typedef {'queued'|'inflight'|'applied'|'terminal'|'expired'|'quarantined'} OutboxState
 * @typedef {'create'|'update'|'delete'} OutboxOperation
 * @typedef {object} OutboxEntry
 * @property {string} id
 * @property {string} namespace
 * @property {string} documentId
 * @property {string} clientMutationId
 * @property {OutboxOperation} operation
 * @property {number} baseRevision
 * @property {number} keyVersion
 * @property {Uint8Array} payload
 * @property {Uint8Array} draft
 * @property {number} payloadBytes
 * @property {number} draftBytes
 * @property {string|null} predecessorId
 * @property {OutboxState} state
 * @property {number} attempts
 * @property {number} nextAttemptAt
 * @property {number} createdAt
 * @property {number} expiresAt
 * @property {string|null} quarantineReason
 * @property {unknown} result
 *
 * @typedef {object} OutboxStore
 * @property {(entry: OutboxEntry) => Promise<void>} put
 * @property {(id: string) => Promise<OutboxEntry|null>} get
 * @property {(id: string) => Promise<void>} remove
 * @property {() => Promise<OutboxEntry[]>} list
 *
 * @typedef {object} OutboxFailure
 * @property {number} [status]
 * @property {string} [code]
 */

export class OutboxError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'OutboxError';
        this.code = code;
    }
}

/** @param {string} code @returns {never} */
const fail = (code) => { throw new OutboxError(code); };

/** @param {unknown} value @param {string} code @returns {string} */
function requireUuid(value, code) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail(code);
    return /** @type {string} */ (value);
}

/** @param {unknown} value @param {string} code @returns {Uint8Array} */
function requireBytes(value, code) {
    if (!(value instanceof Uint8Array) || value.length === 0) fail(code);
    return /** @type {Uint8Array} */ (value);
}

/**
 * In-memory store. The browser supplies an IndexedDB-backed store with the same
 * shape; keeping the interface this small is what lets the state machine be
 * tested deterministically without a browser.
 */
/** @returns {OutboxStore} */
export function createMemoryOutboxStore() {
    /** @type {Map<string, OutboxEntry>} */
    const rows = new Map();
    return Object.freeze({
        async put(entry) { rows.set(entry.id, entry); },
        async get(id) { return rows.get(id) ?? null; },
        async remove(id) { rows.delete(id); },
        async list() { return [...rows.values()]; }
    });
}

/** @param {OutboxEntry[]} entries */
function totalBytes(entries) {
    return entries.reduce((sum, entry) => sum + entry.payloadBytes + entry.draftBytes, 0);
}

/** @param {OutboxEntry} entry */
const isPending = (entry) => entry.state === 'queued' || entry.state === 'inflight';

/**
 * @param {{ store?: OutboxStore, namespace?: string, now?: () => number, random?: () => number }} [options]
 */
export function createOutbox({ store, namespace, now, random } = {}) {
    if (!store || typeof store.put !== 'function') fail('STORE_UNAVAILABLE');
    if (typeof namespace !== 'string' || namespace.length === 0) fail('INVALID_NAMESPACE');
    const clock = typeof now === 'function' ? now : () => Date.now();
    // Injected only so backoff is deterministic under test; production uses
    // Math.random so competing clients do not retry in lockstep.
    const jitter = typeof random === 'function' ? random : Math.random;

    const backing = /** @type {OutboxStore} */ (store);
    const scopedName = /** @type {string} */ (namespace);
    const scoped = async () => (await backing.list()).filter((entry) => entry.namespace === scopedName);

    /** @param {number} attempt */
    function backoffFor(attempt) {
        const exponential = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
        // Full jitter: spread retries across the whole window.
        return Math.floor(exponential * (0.5 + jitter() * 0.5));
    }

    return Object.freeze({
        limits: Object.freeze({
            maxPendingEntries: MAX_PENDING_ENTRIES,
            maxBytes: MAX_BYTES,
            warnAtPercent: WARN_AT_PERCENT,
            expiryMs: EXPIRY_MS,
            maxAttempts: MAX_ATTEMPTS
        }),

        /**
         * Queue an already-encrypted mutation. `payload` is the sealed document
         * envelope and `draft` is the sealed user-facing draft context; both must
         * be bytes, so a caller cannot accidentally persist plaintext.
         */
        /** @param {Record<string, unknown>} input @returns {Promise<OutboxEntry>} */
        async enqueue(input) {
            const source = input ?? {};
            const operation = /** @type {OutboxOperation} */ (source.operation);
            if (!['create', 'update', 'delete'].includes(operation)) fail('INVALID_OPERATION');
            const baseRevision = source.baseRevision;
            if (!Number.isInteger(baseRevision) || Number(baseRevision) < 0) fail('INVALID_BASE_REVISION');
            const keyVersion = source.keyVersion;
            if (!Number.isInteger(keyVersion) || Number(keyVersion) < 1) fail('INVALID_KEY_VERSION');
            const payload = requireBytes(source.payload, 'INVALID_PAYLOAD');
            const draft = requireBytes(source.draft, 'INVALID_DRAFT');
            const issued = clock();

            /** @type {OutboxEntry} */
            const entry = {
                id: requireUuid(source.id, 'INVALID_ENTRY_ID'),
                namespace: scopedName,
                documentId: requireUuid(source.documentId, 'INVALID_DOCUMENT'),
                clientMutationId: requireUuid(source.clientMutationId, 'INVALID_MUTATION_ID'),
                operation,
                baseRevision: Number(baseRevision),
                keyVersion: Number(keyVersion),
                payload,
                draft,
                payloadBytes: payload.length,
                draftBytes: draft.length,
                predecessorId: source.predecessorId === undefined || source.predecessorId === null
                    ? null : requireUuid(source.predecessorId, 'INVALID_PREDECESSOR'),
                state: 'queued',
                attempts: 0,
                nextAttemptAt: issued,
                createdAt: issued,
                expiresAt: issued + EXPIRY_MS,
                quarantineReason: null,
                result: null
            };

            if (await backing.get(entry.id) !== null) fail('DUPLICATE_ENTRY');

            const existing = await scoped();
            const pending = existing.filter(isPending);
            if (pending.length >= MAX_PENDING_ENTRIES) fail('OUTBOX_FULL');
            if (totalBytes(pending) + entry.payloadBytes + entry.draftBytes > MAX_BYTES) fail('OUTBOX_FULL');

            await backing.put(entry);
            return entry;
        },

        /**
         * FIFO per document. An entry whose declared predecessor has not applied
         * is skipped, so a dependent edit cannot overtake the edit it builds on.
         * Independent documents progress concurrently.
         */
        /** @param {number} [at] @returns {Promise<OutboxEntry|null>} */
        async claimNext(at = clock()) {
            const entries = await scoped();
            const byId = new Map(entries.map((entry) => [entry.id, entry]));
            const busyDocuments = new Set(entries
                .filter((entry) => entry.state === 'inflight')
                .map((entry) => entry.documentId));

            const ready = entries
                .filter((entry) => entry.state === 'queued'
                    && entry.nextAttemptAt <= at
                    && !busyDocuments.has(entry.documentId)
                    && (entry.predecessorId === null || byId.get(entry.predecessorId)?.state === 'applied'))
                .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));

            const seen = new Set();
            const next = ready.find((entry) => {
                if (seen.has(entry.documentId)) return false;
                seen.add(entry.documentId);
                return true;
            });
            if (next === undefined) return null;

            /** @type {OutboxEntry} */
            const claimed = { ...next, state: 'inflight', attempts: next.attempts + 1 };
            await backing.put(claimed);
            return claimed;
        },

        /** @param {string} id @param {unknown} result */
        async recordSuccess(id, result) {
            const found = await backing.get(id);
            if (found === null || found.namespace !== scopedName) fail('UNKNOWN_ENTRY');
            const entry = /** @type {OutboxEntry} */ (found);
            /** @type {OutboxEntry} */
            const applied = { ...entry, state: 'applied', result: result ?? null };
            await backing.put(applied);
            return applied;
        },

        /**
         * A retryable failure goes back to queued behind a jittered backoff with
         * the ORIGINAL mutation id, so the server can recognise the retry as the
         * same mutation. Everything else is terminal and never auto-retries.
         */
        /** @param {string} id @param {OutboxFailure} [failure] */
        async recordFailure(id, failure = {}) {
            const found = await backing.get(id);
            if (found === null || found.namespace !== scopedName) fail('UNKNOWN_ENTRY');
            const entry = /** @type {OutboxEntry} */ (found);

            const terminal = NON_RETRYABLE_STATUSES.includes(Number(failure.status))
                || NON_RETRYABLE_CODES.includes(String(failure.code))
                || entry.attempts >= MAX_ATTEMPTS;
            if (terminal) {
                /** @type {OutboxEntry} */
                const stopped = { ...entry, state: 'terminal', result: failure.code ?? null };
                await backing.put(stopped);
                return stopped;
            }
            /** @type {OutboxEntry} */
            const retried = {
                ...entry,
                state: 'queued',
                nextAttemptAt: clock() + backoffFor(entry.attempts)
            };
            await backing.put(retried);
            return retried;
        },

        /** Seven-day expiry moves an entry to quarantine. It never deletes it. */
        /** @param {number} [at] */
        async expire(at = clock()) {
            const entries = await scoped();
            const affected = [];
            for (const entry of entries) {
                if (!isPending(entry) || at < entry.expiresAt) continue;
                /** @type {OutboxEntry} */
                const quarantined = { ...entry, state: 'expired', quarantineReason: 'expired' };
                await backing.put(quarantined);
                affected.push(quarantined);
            }
            return affected;
        },

        /**
         * A change of authority or context. Reauthentication alone does not undo
         * it: the user must explicitly re-apply, save a copy, export, or discard.
         */
        /** @param {string} reason */
        async quarantine(reason) {
            if (!QUARANTINE_REASONS.includes(reason)) fail('INVALID_QUARANTINE_REASON');
            const entries = await scoped();
            const affected = [];
            for (const entry of entries) {
                if (!isPending(entry)) continue;
                /** @type {OutboxEntry} */
                const quarantined = { ...entry, state: 'quarantined', quarantineReason: reason };
                await backing.put(quarantined);
                affected.push(quarantined);
            }
            return affected;
        },

        /** Explicit user discard. The only path other than a recorded success. */
        /** @param {string} id */
        async discard(id) {
            const found = await backing.get(id);
            if (found === null || found.namespace !== scopedName) fail('UNKNOWN_ENTRY');
            await backing.remove(id);
            return true;
        },

        /** Disposal is allowed only once the server result is durably recorded. */
        /** @param {string} id */
        async dispose(id) {
            const found = await backing.get(id);
            if (found === null || found.namespace !== scopedName) fail('UNKNOWN_ENTRY');
            const entry = /** @type {OutboxEntry} */ (found);
            if (entry.state !== 'applied' || entry.result === null) fail('RESULT_NOT_RECORDED');
            await backing.remove(id);
            return true;
        },

        async stats() {
            const entries = await scoped();
            const pending = entries.filter(isPending);
            const bytes = totalBytes(pending);
            const percent = Math.max(
                Math.round((pending.length / MAX_PENDING_ENTRIES) * 100),
                Math.round((bytes / MAX_BYTES) * 100)
            );
            return Object.freeze({
                pending: pending.length,
                bytes,
                percentUsed: percent,
                warning: percent >= WARN_AT_PERCENT,
                full: pending.length >= MAX_PENDING_ENTRIES || bytes >= MAX_BYTES,
                quarantined: entries.filter((entry) => entry.state === 'quarantined').length,
                expired: entries.filter((entry) => entry.state === 'expired').length
            });
        },

        async list() {
            return scoped();
        }
    });
}

export const OUTBOX_STATES = STATES;
export const OUTBOX_NON_RETRYABLE = Object.freeze({
    statuses: NON_RETRYABLE_STATUSES,
    codes: NON_RETRYABLE_CODES
});

/**
 * IndexedDB-backed store for the browser. Same interface as the memory store, so
 * the state machine above is identical in both environments.
 */
/**
 * IndexedDB globals are browser-only; the Workers typecheck that also reads this
 * file has no DOM lib, so these two adapters are typed loosely on purpose. Their
 * behaviour is covered by tests/browser-outbox.mjs against real browsers.
 * @param {*} database IDBDatabase
 * @param {string} [storeName]
 * @returns {OutboxStore}
 */
export function createIndexedDbOutboxStore(database, storeName = 'outbox') {
    /** @param {*} mode @param {*} work @returns {Promise<*>} */
    const run = (mode, work) => new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const request = work(transaction.objectStore(storeName));
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
    return Object.freeze({
        put: (entry) => run('readwrite', (/** @type {*} */ objectStore) => objectStore.put(entry)),
        get: async (id) => (await run('readonly', (/** @type {*} */ objectStore) => objectStore.get(id))) ?? null,
        remove: (id) => run('readwrite', (/** @type {*} */ objectStore) => objectStore.delete(id)),
        list: async () => (await run('readonly', (/** @type {*} */ objectStore) => objectStore.getAll())) ?? []
    });
}

/**
 * @param {*} indexedDb IDBFactory
 * @param {string} name
 * @returns {Promise<*>} IDBDatabase
 */
export function openOutboxDatabase(indexedDb, name) {
    return new Promise((resolve, reject) => {
        const request = indexedDb.open(name, 1);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains('outbox')) {
                database.createObjectStore('outbox', { keyPath: 'id' });
            }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}
