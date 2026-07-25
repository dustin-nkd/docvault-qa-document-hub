// CF-P6-002 — StorageProvider abstraction and provider isolation (ADR-007).
//
// Personal Vault and Collaboration are separate providers with separate state
// namespaces, identity contexts, and persistence records. A document belongs to
// exactly one provider context; there is no automatic migration, mirrored
// object, or ongoing synchronization link between them.
//
// The isolation rules this module has to make structurally true, not merely
// documented:
//   * provider selection is explicit — an unknown or absent id throws instead of
//     resolving to a default, so a caller can never "accidentally personal";
//   * no collaboration failure path may write to Personal Vault or personal
//     GitHub, so the collaboration provider simply holds no reference to the
//     personal one and vice versa;
//   * collaboration state is namespaced by environment, immutable subject,
//     workspace, device, and document, so preview, production, guest, and
//     personal can never collide in browser storage;
//   * a context change (logout, account/workspace switch, revocation, rotation)
//     clears unwrapped keys and plaintext view state before another context
//     renders.
//
// Document network operations (create/read/update/tombstone, revisions,
// reconciliation, outbox) are NOT implemented here. They belong to CF-P6-004
// through CF-P6-006 and fail closed until then — see notImplemented().

export const PERSONAL_VAULT_PROVIDER = 'personal-vault';
export const COLLABORATION_PROVIDER = 'collaboration';

const PROVIDER_IDS = Object.freeze([PERSONAL_VAULT_PROVIDER, COLLABORATION_PROVIDER]);
const ENVIRONMENTS = Object.freeze(['local-browser-test', 'preview', 'production']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class StorageProviderError extends Error {
    constructor(code) {
        super(code);
        this.name = 'StorageProviderError';
        this.code = code;
    }
}

const fail = (code) => { throw new StorageProviderError(code); };

// Deferred capability. It is a distinct code from a denial so a caller can never
// mistake "not built yet" for "server said no" and silently fall back.
const notImplemented = (operation) => () => fail(`NOT_IMPLEMENTED_${operation}`);

function requireNonEmptyString(value, code) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 200) fail(code);
    return value;
}

function requireUuid(value, code) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail(code);
    return value;
}

/**
 * Namespace key for any collaboration record or outbox entry.
 *
 * Every component is required. Personal Vault, guest, preview, and production
 * can therefore never share a namespace, and a workspace or device switch
 * produces a different key rather than reusing the previous one.
 */
export function collaborationNamespace({ environment, subject, workspaceId, deviceId, documentId } = {}) {
    if (!ENVIRONMENTS.includes(environment)) fail('INVALID_ENVIRONMENT');
    requireNonEmptyString(subject, 'INVALID_SUBJECT');
    requireUuid(workspaceId, 'INVALID_WORKSPACE');
    requireUuid(deviceId, 'INVALID_DEVICE');
    const scope = ['docvault', 'collab', environment, subject, workspaceId, deviceId];
    if (documentId !== undefined) scope.push(requireUuid(documentId, 'INVALID_DOCUMENT'));
    return scope.join(':');
}

/**
 * Personal Vault provider.
 *
 * A thin, faithful delegation to the shipped DocStorage. It deliberately adds no
 * behaviour: the characterization baseline in
 * tests/personal-vault-characterization.test.mjs pins DocStorage's observable
 * contract, and this wrapper must not disturb it.
 */
export function createPersonalVaultProvider({ docStorage } = {}) {
    if (!docStorage || typeof docStorage.getAll !== 'function') fail('PERSONAL_STORAGE_UNAVAILABLE');
    return Object.freeze({
        id: PERSONAL_VAULT_PROVIDER,
        isCollaborative: false,
        getAll: (...args) => docStorage.getAll(...args),
        save: (...args) => docStorage.save(...args),
        exportData: (...args) => docStorage.exportData(...args),
        importData: (...args) => docStorage.importData(...args),
        getSettings: (...args) => docStorage.getSettings(...args),
        saveSettings: (...args) => docStorage.saveSettings(...args),
        getUsage: (...args) => docStorage.getUsage(...args),
        addDeletedIds: (...args) => docStorage.addDeletedIds(...args),
        hasPendingSync: (...args) => docStorage.hasPendingSync(...args),
        setPendingSync: (...args) => docStorage.setPendingSync(...args),
        queueSync: (...args) => docStorage.queueSync(...args)
    });
}

/**
 * Collaboration provider.
 *
 * Holds the workspace context and namespace derivation, and clears volatile
 * state on a context change. It has no reference to Personal Vault or to the
 * personal GitHub sync engine, which is what makes "a collaboration failure
 * never writes to personal storage" a structural property rather than a
 * convention someone has to remember.
 */
export function createCollaborationProvider({ environment, subject, workspaceId, deviceId } = {}) {
    if (!ENVIRONMENTS.includes(environment)) fail('INVALID_ENVIRONMENT');
    requireNonEmptyString(subject, 'INVALID_SUBJECT');
    requireUuid(workspaceId, 'INVALID_WORKSPACE');
    requireUuid(deviceId, 'INVALID_DEVICE');

    const context = { environment, subject, workspaceId, deviceId };
    let cleared = false;
    // Volatile, never persisted: unwrapped key material and decrypted view state.
    let volatile = { unwrappedKeys: new Map(), plaintextViewState: new Map() };

    const assertUsable = () => { if (cleared) fail('PROVIDER_CONTEXT_CLEARED'); };

    return Object.freeze({
        id: COLLABORATION_PROVIDER,
        isCollaborative: true,
        get context() {
            assertUsable();
            return Object.freeze({ ...context });
        },
        namespace(documentId) {
            assertUsable();
            return collaborationNamespace({ ...context, documentId });
        },
        outboxNamespace(documentId) {
            assertUsable();
            return `${collaborationNamespace({ ...context, documentId })}:outbox`;
        },
        retainUnwrappedKey(keyVersion, key) {
            assertUsable();
            if (!Number.isInteger(keyVersion) || keyVersion < 1) fail('INVALID_KEY_VERSION');
            volatile.unwrappedKeys.set(keyVersion, key);
        },
        retainPlaintextViewState(documentId, value) {
            assertUsable();
            volatile.plaintextViewState.set(requireUuid(documentId, 'INVALID_DOCUMENT'), value);
        },
        get volatileSize() {
            return volatile.unwrappedKeys.size + volatile.plaintextViewState.size;
        },
        get isCleared() {
            return cleared;
        },
        /**
         * Context change: logout, account switch, workspace switch, membership
         * removal, device revocation, or key rotation. Drops unwrapped keys and
         * plaintext view state and makes the provider unusable, so stale
         * authority cannot render into the next context.
         */
        clearForContextChange() {
            volatile.unwrappedKeys.clear();
            volatile.plaintextViewState.clear();
            volatile = { unwrappedKeys: new Map(), plaintextViewState: new Map() };
            cleared = true;
        },
        // Deferred to later Phase 6 stories; fail closed until then.
        listDocuments: notImplemented('LIST_DOCUMENTS'),
        readDocument: notImplemented('READ_DOCUMENT'),
        createDocument: notImplemented('CREATE_DOCUMENT'),
        updateDocument: notImplemented('UPDATE_DOCUMENT'),
        tombstoneDocument: notImplemented('TOMBSTONE_DOCUMENT'),
        listRevisions: notImplemented('LIST_REVISIONS'),
        readRevision: notImplemented('READ_REVISION'),
        reconcileMutation: notImplemented('RECONCILE_MUTATION')
    });
}

/**
 * Explicit provider selection.
 *
 * There is no default and no fallback. An unknown id, a missing id, or a
 * provider that was never registered throws — a caller that fails to choose
 * cannot silently land on Personal Vault.
 */
export function createProviderRegistry(providers = {}) {
    const registered = new Map();
    for (const provider of Object.values(providers)) {
        if (!provider || !PROVIDER_IDS.includes(provider.id)) fail('UNKNOWN_PROVIDER');
        if (registered.has(provider.id)) fail('DUPLICATE_PROVIDER');
        registered.set(provider.id, provider);
    }
    return Object.freeze({
        has: (id) => registered.has(id),
        select(id) {
            if (!PROVIDER_IDS.includes(id)) fail('UNKNOWN_PROVIDER');
            const provider = registered.get(id);
            if (!provider) fail('PROVIDER_NOT_REGISTERED');
            return provider;
        }
    });
}

/**
 * Guest fixtures are memory-only and belong to neither provider (ADR-007).
 */
export function guestUsesProvider() {
    return false;
}
