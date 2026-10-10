import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createTestContext(options = {}) {
    const { role = 'owner', initialWorkspaces = [], initialDocs = [], collab = true } = options;
    const store = new Map();
    const firestoreWorkspaces = new Map();
    const firestoreDocs = new Map();

    for (const ws of initialWorkspaces) {
        firestoreWorkspaces.set(ws.id, { ...ws });
    }
    for (const doc of initialDocs) {
        firestoreDocs.set(doc.id, { ...doc });
    }

    const toasts = [];
    let modalHtml = '';

    const localDb = {
        collection(name) {
            if (name === 'workspaces') {
                return {
                    async get() {
                        const docs = [];
                        for (const [id, data] of firestoreWorkspaces.entries()) {
                            docs.push({ id, data: () => ({ ...data }) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    doc(id) {
                        return {
                            async get() {
                                const data = firestoreWorkspaces.get(id);
                                return { exists: Boolean(data), data: () => data ? { ...data } : null, id };
                            },
                            async set(data) {
                                firestoreWorkspaces.set(id, { ...data, id });
                            },
                            async update(data) {
                                const prev = firestoreWorkspaces.get(id) || {};
                                firestoreWorkspaces.set(id, { ...prev, ...data });
                            },
                            async delete() {
                                firestoreWorkspaces.delete(id);
                            }
                        };
                    },
                    onSnapshot(cb) {
                        return () => {};
                    }
                };
            }
            if (name === 'documents') {
                return {
                    async get() {
                        const docs = [];
                        for (const [id, data] of firestoreDocs.entries()) {
                            docs.push({ id, data: () => ({ ...data }) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    doc(id) {
                        return {
                            async get() {
                                const data = firestoreDocs.get(id);
                                return { exists: Boolean(data), data: () => data ? { ...data } : null, id };
                            },
                            async set(data) {
                                firestoreDocs.set(id, { ...data, id });
                            },
                            async update(data) {
                                const prev = firestoreDocs.get(id) || {};
                                firestoreDocs.set(id, { ...prev, ...data });
                            },
                            async delete() {
                                firestoreDocs.delete(id);
                            }
                        };
                    },
                    onSnapshot(cb) {
                        return () => {};
                    }
                };
            }
            return {
                doc: () => ({ get: async () => ({ exists: false }), set: async () => {}, update: async () => {}, delete: async () => {} })
            };
        },
        batch() {
            const ops = [];
            return {
                set(docRef, data) { ops.push(() => docRef.set(data)); },
                update(docRef, data) { ops.push(() => docRef.update(data)); },
                delete(docRef) { ops.push(() => docRef.delete()); },
                async commit() { for (const op of ops) await op(); }
            };
        }
    };

    let gitHubCalled = false;
    let flushCalled = false;
    let renderCalled = false;

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        COLLAB_MODE: collab,
        GUEST_MODE: false,
        localStorage: {
            getItem(key) { return store.has(key) ? store.get(key) : null; },
            setItem(key, val) { store.set(key, String(val)); },
            removeItem(key) { store.delete(key); },
            clear() { store.clear(); }
        },
        document: {
            getElementById(id) {
                if (id === 'ws-new-name') return ctx._wsNewNameInput || { value: '' };
                if (id === 'ws-rename-input') return ctx._wsRenameInput || { value: '' };
                if (id === 'workspace-switcher-name') return ctx._switcherLabel || { textContent: '' };
                return null;
            },
            querySelector(sel) { return null; },
            createElement(tag) { return { setAttribute() {}, style: {}, appendChild() {} }; }
        },
        _wsNewNameInput: { value: '' },
        _wsRenameInput: { value: '' },
        _switcherLabel: { textContent: '' },
        toast(msg, type) { toasts.push({ msg, type }); },
        showModal(html) { modalHtml = html; },
        closeModal() {},
        render() { renderCalled = true; },
        updateSyncIndicator() {},
        ensureFirebase: async () => {},
        firebase: {
            firestore: () => localDb,
            auth: () => ({ currentUser: { uid: 'user-1', email: 'user@example.com' } })
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'user-1', email: 'user@example.com', role }),
            getCurrentUser: () => ({ uid: 'user-1', email: 'user@example.com' })
        },
        CollabViewer: {
            applyViewerRestrictions() {}
        },
        GitHubSync: {
            isConfigured: async () => { gitHubCalled = true; return true; },
            getSettings: async () => { gitHubCalled = true; return {}; }
        },
        _flushActiveWorkspaceSync: async () => { flushCalled = true; },
        escHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        state: { view: 'dashboard' },
        documents: []
    };

    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    vm.runInContext(read('js/collab-store.js'), ctx);
    vm.runInContext(read('js/workspaces.js'), ctx);
    vm.runInContext(read('js/collab-workspaces.js'), ctx);

    return {
        ctx,
        toasts,
        getModalHtml: () => modalHtml,
        firestoreWorkspaces,
        firestoreDocs,
        wasGitHubCalled: () => gitHubCalled,
        wasFlushCalled: () => flushCalled,
        wasRenderCalled: () => renderCalled,
        resetFlags() { gitHubCalled = false; flushCalled = false; renderCalled = false; }
    };
}

test('Phase 16: creating workspace in collab mode does not call GitHub, writes to Firestore, and switches', async () => {
    const { ctx, toasts, firestoreWorkspaces, wasGitHubCalled } = createTestContext({ role: 'editor' });

    ctx._wsNewNameInput.value = 'Mobile QA Hub';
    await ctx.createWorkspace();

    assert.equal(wasGitHubCalled(), false, 'createWorkspace must not call GitHub in collab mode');
    assert.equal(firestoreWorkspaces.has('mobile-qa-hub'), true, 'workspace document must be created in Firestore');
    const ws = firestoreWorkspaces.get('mobile-qa-hub');
    assert.equal(ws.name, 'Mobile QA Hub');
    assert.equal(ws.createdBy, 'user-1');
    assert.equal(ctx.localStorage.getItem('docvault_active_workspace'), 'mobile-qa-hub');
    assert.ok(toasts.some(t => t.msg === 'Workspace created.'), 'must toast success on creation');
});

test('Phase 16: legacy documents without workspaceId field belong to default workspace', async () => {
    const legacyDoc = { id: 'leg-1', title: 'Legacy Doc', content: 'legacy content', version: 1 };
    const newDoc = { id: 'new-1', title: 'New Doc', workspaceId: 'qa-ws', version: 1 };
    const { ctx } = createTestContext({ initialDocs: [legacyDoc, newDoc] });

    // Active workspace is default
    ctx.localStorage.setItem('docvault_active_workspace', 'default');
    const loadedDocs = await ctx.CollabStore.loadDocuments();

    assert.equal(loadedDocs.length, 1, 'Only docs belonging to default workspace should be returned');
    assert.equal(loadedDocs[0].id, 'leg-1', 'Legacy doc without workspaceId must appear in default workspace');
    assert.equal(loadedDocs[0].workspaceId, undefined, 'fromFirestoreDoc must NOT inject workspaceId to legacy doc');
});

test('Phase 16: new documents created in collab receive active workspace id', async () => {
    const { ctx, firestoreDocs } = createTestContext({ role: 'editor' });
    ctx.localStorage.setItem('docvault_active_workspace', 'mobile-qa');

    const newDoc = { id: 'doc-new', title: 'Created in Mobile QA', content: 'Hello' };
    await ctx.CollabStore.persist([newDoc]);

    assert.equal(newDoc.workspaceId, 'mobile-qa', 'New doc object must receive active workspace id');
    const saved = firestoreDocs.get('doc-new');
    assert.ok(saved, 'Document must be persisted to Firestore');
    assert.equal(saved.workspaceId, 'mobile-qa', 'Persisted Firestore doc must have workspaceId');
});

test('Phase 16: persisting changes in workspace A does not delete documents of workspace B', async () => {
    const docA = { id: 'doc-a', title: 'Doc in A', workspaceId: 'ws-a', version: 1, createdAt: 100, updatedAt: 100 };
    const docB = { id: 'doc-b', title: 'Doc in B', workspaceId: 'ws-b', version: 1, createdAt: 100, updatedAt: 100 };
    const { ctx, firestoreDocs } = createTestContext({ initialDocs: [docA, docB] });

    // Load docs to populate known docs in CollabStore
    ctx.localStorage.setItem('docvault_active_workspace', 'ws-a');
    await ctx.CollabStore.loadDocuments();

    assert.equal(firestoreDocs.has('doc-a'), true);
    assert.equal(firestoreDocs.has('doc-b'), true);

    // Modify docA in workspace A and persist
    const modDocA = { ...docA, title: 'Doc in A Modified', updatedAt: 200 };
    await ctx.CollabStore.persist([modDocA]);

    // Verify doc-b still exists in Firestore and was NOT purged by persist()
    assert.equal(firestoreDocs.has('doc-b'), true, 'Doc in workspace B must not be deleted by persist in workspace A');
    assert.equal(firestoreDocs.get('doc-a').title, 'Doc in A Modified');
});

test('Phase 16: switchWorkspace in team mode switches active id and re-renders without calling GitHub, _flushActiveWorkspaceSync, or assigning documents = []', async () => {
    const docA = { id: 'doc-a', title: 'Doc in A', workspaceId: 'ws-a', version: 1 };
    const docB = { id: 'doc-b', title: 'Doc in B', workspaceId: 'ws-b', version: 1 };
    const { ctx, wasGitHubCalled, wasFlushCalled, wasRenderCalled } = createTestContext({
        initialWorkspaces: [{ id: 'ws-a', name: 'WS A' }, { id: 'ws-b', name: 'WS B' }],
        initialDocs: [docA, docB]
    });

    await ctx.CollabStore.loadDocuments();
    await ctx.CollabWorkspaces.loadWorkspaces();

    ctx.localStorage.setItem('docvault_active_workspace', 'ws-a');
    ctx.documents = [docA];

    // Switch to ws-b
    await ctx.switchWorkspace('ws-b');

    assert.equal(wasGitHubCalled(), false, 'switchWorkspace in collab mode must not call GitHub');
    assert.equal(wasFlushCalled(), false, 'switchWorkspace in collab mode must not call _flushActiveWorkspaceSync');
    assert.equal(wasRenderCalled(), true, 'switchWorkspace must call render()');
    assert.equal(ctx.localStorage.getItem('docvault_active_workspace'), 'ws-b');
    assert.equal(ctx.documents.length, 1);
    assert.equal(ctx.documents[0].id, 'doc-b', 'documents array must be switched to ws-b documents');
});

test('Phase 16: viewer can open and switch workspaces, but cannot create, rename, or delete, and receives exact toast', async () => {
    const { ctx, toasts, getModalHtml } = createTestContext({
        role: 'viewer',
        initialWorkspaces: [{ id: 'alpha', name: 'Alpha' }]
    });
    await ctx.CollabWorkspaces.loadWorkspaces();

    // 1. Viewer can switch workspace
    toasts.length = 0;
    await ctx.switchWorkspace('alpha');
    assert.equal(ctx.localStorage.getItem('docvault_active_workspace'), 'alpha');

    // 2. Viewer cannot create workspace
    toasts.length = 0;
    ctx._wsNewNameInput.value = 'Beta';
    await ctx.createWorkspace();
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'createWorkspace: viewer must show exact toast');

    // 3. Viewer cannot rename workspace
    toasts.length = 0;
    ctx._wsRenameInput.value = 'Alpha Renamed';
    await ctx.renameWorkspace('alpha');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'renameWorkspace: viewer must show exact toast');

    // 4. Viewer cannot delete workspace
    toasts.length = 0;
    await ctx.deleteWorkspace('alpha');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'deleteWorkspace: viewer must show exact toast');

    // 5. Manager modal renders disabled attributes for viewer
    ctx.showWorkspaceManager();
    const html = getModalHtml();
    assert.match(html, /disabled aria-disabled="true" title="You have view access"/, 'Workspace manager buttons must be disabled with title');
});

test('Phase 16: workspace manager modal copy mentions shared team vault on team edition, and personal edition modal mentions master password and GitHub', () => {
    // Team edition
    const team = createTestContext({ collab: true });
    team.ctx.showWorkspaceManager();
    const teamHtml = team.getModalHtml();
    assert.match(teamHtml, /All workspaces share one team vault/, 'Team edition must mention shared team vault');
    assert.doesNotMatch(teamHtml, /master password and one GitHub connection/, 'Team edition must NOT mention master password and GitHub');

    // Personal edition
    const personal = createTestContext({ collab: false });
    personal.ctx.showWorkspaceManager();
    const personalHtml = personal.getModalHtml();
    assert.match(personalHtml, /master password and one GitHub connection/, 'Personal edition must mention master password and GitHub connection');
});

test('Phase 16: duplicate workspace id reports already exists and renaming default updates default name', async () => {
    const { ctx, toasts, firestoreWorkspaces } = createTestContext({
        role: 'editor',
        initialWorkspaces: [{ id: 'team-ops', name: 'Team Ops' }]
    });
    await ctx.CollabWorkspaces.loadWorkspaces();

    // Try creating with duplicate name that slugs to team-ops
    ctx._wsNewNameInput.value = 'Team Ops';
    toasts.length = 0;
    await ctx.createWorkspace();
    assert.ok(toasts.some(t => t.msg === 'A workspace with that name already exists.'), 'Must report already exists');

    // Renaming default workspace
    ctx._wsRenameInput.value = 'General Vault';
    await ctx.renameWorkspace('default');
    assert.equal(firestoreWorkspaces.get('default').name, 'General Vault');
    assert.equal(ctx.getActiveWorkspace().name, 'General Vault');
});

test('Phase 16: switchWorkspace pushes copies so modifying displayed doc and calling persist() saves new title to Firestore', async () => {
    const docA = { id: 'doc-a', title: 'Original Title', workspaceId: 'ws-a', version: 1, createdAt: 1000, updatedAt: 1000 };
    const { ctx, firestoreDocs } = createTestContext({
        initialWorkspaces: [{ id: 'ws-a', name: 'WS A' }],
        initialDocs: [docA]
    });

    await ctx.CollabStore.loadDocuments();
    await ctx.CollabWorkspaces.loadWorkspaces();

    // Switch to ws-a
    await ctx.switchWorkspace('ws-a');

    assert.equal(ctx.documents.length, 1);
    assert.equal(ctx.documents[0].id, 'doc-a');

    // Mutate the displayed document in ctx.documents
    ctx.documents[0].title = 'Mutated Title After Switch';
    ctx.documents[0].updatedAt = 2000;

    // Call persist()
    await ctx.CollabStore.persist(ctx.documents);

    // Verify Firestore received the updated title and incremented version
    const saved = firestoreDocs.get('doc-a');
    assert.ok(saved, 'Document must exist in Firestore');
    assert.equal(saved.title, 'Mutated Title After Switch', 'Firestore must receive updated title');
    assert.equal(saved.version, 2, 'Version must be incremented to 2');
    assert.equal(saved.updatedAt, 2000);
});

test('Phase 16: workspace listener lifecycle replaces listener on loadWorkspaces and unsubs on stopListening', async () => {
    let unsubsCount = 0;
    let onSnapshotListeners = 0;
    const { ctx } = createTestContext();

    const origCollection = ctx.firebase.firestore().collection;
    ctx.firebase.firestore().collection = (col) => {
        const res = origCollection(col);
        if (col === 'workspaces') {
            return {
                ...res,
                onSnapshot(cb) {
                    onSnapshotListeners++;
                    return () => { unsubsCount++; };
                }
            };
        }
        return res;
    };

    // First loadWorkspaces attaches listener
    await ctx.CollabWorkspaces.loadWorkspaces();
    assert.equal(onSnapshotListeners, 1);
    assert.equal(unsubsCount, 0);

    // Second loadWorkspaces (e.g. after member auth) replaces existing listener
    await ctx.CollabWorkspaces.loadWorkspaces();
    assert.equal(onSnapshotListeners, 2);
    assert.equal(unsubsCount, 1, 'Previous listener must be unsubscribed');

    // stopListening unsubs
    ctx.CollabWorkspaces.stopListening();
    assert.equal(unsubsCount, 2, 'Active listener must be unsubscribed on stopListening');
});

