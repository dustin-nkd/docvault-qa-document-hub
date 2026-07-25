// CF-P6-002 — StorageProvider abstraction and provider isolation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COLLABORATION_PROVIDER,
    PERSONAL_VAULT_PROVIDER,
    StorageProviderError,
    collaborationNamespace,
    createCollaborationProvider,
    createPersonalVaultProvider,
    createProviderRegistry,
    guestUsesProvider
} from '../js/collaboration/storage-provider.js';
import { loadStorage } from './harness.mjs';

const WORKSPACE = '11111111-1111-4111-8111-111111111111';
const DEVICE = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const CONTEXT = { environment: 'preview', subject: 'user-1', workspaceId: WORKSPACE, deviceId: DEVICE };

const codeOf = (fn) => {
    try { fn(); return null; } catch (error) {
        assert.ok(error instanceof StorageProviderError, `expected StorageProviderError, got ${error}`);
        return error.code;
    }
};

test('namespace binds environment, subject, workspace, device, and document', () => {
    assert.equal(collaborationNamespace(CONTEXT), `docvault:collab:preview:user-1:${WORKSPACE}:${DEVICE}`);
    assert.equal(collaborationNamespace({ ...CONTEXT, documentId: DOCUMENT }),
        `docvault:collab:preview:user-1:${WORKSPACE}:${DEVICE}:${DOCUMENT}`);
});

test('namespaces never collide across environment, subject, workspace, or device', () => {
    const base = collaborationNamespace(CONTEXT);
    const variants = [
        { ...CONTEXT, environment: 'production' },
        { ...CONTEXT, environment: 'local-browser-test' },
        { ...CONTEXT, subject: 'user-2' },
        { ...CONTEXT, workspaceId: '44444444-4444-4444-8444-444444444444' },
        { ...CONTEXT, deviceId: '55555555-5555-4555-8555-555555555555' }
    ].map(collaborationNamespace);
    assert.equal(new Set([base, ...variants]).size, variants.length + 1);
});

test('namespace requires every isolation component', () => {
    assert.equal(codeOf(() => collaborationNamespace({ ...CONTEXT, environment: 'staging' })), 'INVALID_ENVIRONMENT');
    assert.equal(codeOf(() => collaborationNamespace({ ...CONTEXT, subject: '' })), 'INVALID_SUBJECT');
    assert.equal(codeOf(() => collaborationNamespace({ ...CONTEXT, workspaceId: 'not-a-uuid' })), 'INVALID_WORKSPACE');
    assert.equal(codeOf(() => collaborationNamespace({ ...CONTEXT, deviceId: undefined })), 'INVALID_DEVICE');
    assert.equal(codeOf(() => collaborationNamespace({ ...CONTEXT, documentId: 'nope' })), 'INVALID_DOCUMENT');
});

test('provider selection is explicit with no default and no fallback', () => {
    const { api } = loadStorage({});
    const registry = createProviderRegistry({
        personal: createPersonalVaultProvider({ docStorage: api.DocStorage }),
        collaboration: createCollaborationProvider(CONTEXT)
    });
    assert.equal(registry.select(PERSONAL_VAULT_PROVIDER).id, PERSONAL_VAULT_PROVIDER);
    assert.equal(registry.select(COLLABORATION_PROVIDER).id, COLLABORATION_PROVIDER);
    assert.equal(codeOf(() => registry.select(undefined)), 'UNKNOWN_PROVIDER');
    assert.equal(codeOf(() => registry.select('')), 'UNKNOWN_PROVIDER');
    assert.equal(codeOf(() => registry.select('personal')), 'UNKNOWN_PROVIDER');
});

test('an unregistered provider throws instead of resolving to Personal Vault', () => {
    const registry = createProviderRegistry({ collaboration: createCollaborationProvider(CONTEXT) });
    assert.equal(codeOf(() => registry.select(PERSONAL_VAULT_PROVIDER)), 'PROVIDER_NOT_REGISTERED');
});

test('the collaboration provider holds no reference to personal storage', () => {
    const provider = createCollaborationProvider(CONTEXT);
    const surface = JSON.stringify(Object.keys(provider));
    assert.ok(!/personal|docStorage|github|vault/i.test(surface));
    for (const key of Object.keys(provider)) {
        assert.ok(!/DocStorage|GitHubSync/.test(String(provider[key])),
            `${key} must not close over personal storage`);
    }
});

test('every deferred document operation fails closed with a distinct not-implemented code', async () => {
    const provider = createCollaborationProvider(CONTEXT);
    const deferred = ['listDocuments', 'readDocument', 'createDocument', 'updateDocument',
        'tombstoneDocument', 'listRevisions', 'readRevision', 'reconcileMutation'];
    for (const operation of deferred) {
        const code = codeOf(() => provider[operation]());
        assert.ok(code.startsWith('NOT_IMPLEMENTED_'), `${operation} returned ${code}`);
    }
});

test('a failing collaboration operation writes nothing to Personal Vault', async () => {
    const { api, localStorage } = loadStorage({});
    await api.DocStorage.save([{ id: 'a', title: 'A', category: 'testcase', createdAt: 1, updatedAt: 1 }]);
    const before = localStorage.getItem('docvault_docs');

    const provider = createCollaborationProvider(CONTEXT);
    for (const operation of ['createDocument', 'updateDocument', 'tombstoneDocument']) {
        assert.throws(() => provider[operation]({ title: 'leak' }), StorageProviderError);
    }
    assert.equal(localStorage.getItem('docvault_docs'), before);
    assert.equal(localStorage.getItem('docvault_sync_pending'), null);
});

test('a context change clears unwrapped keys and plaintext view state', () => {
    const provider = createCollaborationProvider(CONTEXT);
    provider.retainUnwrappedKey(1, { secret: true });
    provider.retainPlaintextViewState(DOCUMENT, 'draft body');
    assert.equal(provider.volatileSize, 2);

    provider.clearForContextChange();
    assert.equal(provider.volatileSize, 0);
    assert.equal(provider.isCleared, true);
});

test('a cleared provider refuses further use instead of serving stale context', () => {
    const provider = createCollaborationProvider(CONTEXT);
    provider.clearForContextChange();
    assert.equal(codeOf(() => provider.namespace(DOCUMENT)), 'PROVIDER_CONTEXT_CLEARED');
    assert.equal(codeOf(() => provider.outboxNamespace(DOCUMENT)), 'PROVIDER_CONTEXT_CLEARED');
    assert.equal(codeOf(() => provider.context), 'PROVIDER_CONTEXT_CLEARED');
    assert.equal(codeOf(() => provider.retainUnwrappedKey(1, {})), 'PROVIDER_CONTEXT_CLEARED');
});

test('the collaboration provider refuses an incomplete identity context', () => {
    assert.equal(codeOf(() => createCollaborationProvider({ ...CONTEXT, environment: 'staging' })), 'INVALID_ENVIRONMENT');
    assert.equal(codeOf(() => createCollaborationProvider({ ...CONTEXT, subject: '' })), 'INVALID_SUBJECT');
    assert.equal(codeOf(() => createCollaborationProvider({ ...CONTEXT, workspaceId: 'x' })), 'INVALID_WORKSPACE');
    assert.equal(codeOf(() => createCollaborationProvider({ ...CONTEXT, deviceId: 'x' })), 'INVALID_DEVICE');
});

test('the personal provider delegates faithfully and adds no behaviour', async () => {
    const { api } = loadStorage({});
    const provider = createPersonalVaultProvider({ docStorage: api.DocStorage });
    assert.equal(provider.isCollaborative, false);
    assert.equal(await provider.getAll(), null);

    const docs = [{ id: 'a', title: 'A', category: 'testcase', createdAt: 1, updatedAt: 2 }];
    assert.equal(await provider.save(docs), true);
    assert.deepEqual(JSON.parse(JSON.stringify(await provider.getAll())), docs);
    assert.deepEqual(JSON.parse(JSON.stringify(await api.DocStorage.getAll())), docs);
});

test('the personal provider refuses to construct without real storage', () => {
    assert.equal(codeOf(() => createPersonalVaultProvider({})), 'PERSONAL_STORAGE_UNAVAILABLE');
    assert.equal(codeOf(() => createPersonalVaultProvider({ docStorage: {} })), 'PERSONAL_STORAGE_UNAVAILABLE');
});

test('guest fixtures use neither provider', () => {
    assert.equal(guestUsesProvider(), false);
});

test('a duplicate provider registration is rejected', () => {
    const first = createCollaborationProvider(CONTEXT);
    const second = createCollaborationProvider(CONTEXT);
    assert.equal(codeOf(() => createProviderRegistry({ a: first, b: second })), 'DUPLICATE_PROVIDER');
});

test('Personal and Guest startup loads zero eager Phase 6 collaboration modules', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

    // The provider module must stay lazy: no eager <script> tag and no service
    // worker precache entry, or a Personal-only user would pay for collaboration
    // code they never use.
    assert.ok(!/collaboration\/storage-provider\.js/.test(read('index.html')));
    assert.ok(!/collaboration/.test(read('sw.js')));
});
