import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createStoreContext(options = {}) {
    const store = new Map(options.initialDocs ? Object.entries(options.initialDocs) : []);
    const calls = {
        getDocs: 0,
        setDocs: [],
        deleteDocs: []
    };
    const toasts = [];
    const persistenceCalls = [];
    let snapshotListener = null;

    const elements = new Map();
    const contentEl = {
        id: 'content',
        className: '',
        children: [],
        prepend: (el) => {
            if (el?.id) elements.set(el.id, el);
        }
    };
    elements.set('content', contentEl);

    const docCollection = {
        get: async () => {
            calls.getDocs++;
            const docSnaps = [];
            for (const [id, data] of store.entries()) {
                docSnaps.push({
                    id,
                    data: () => JSON.parse(JSON.stringify(data))
                });
            }
            return {
                docs: docSnaps,
                forEach: (fn) => docSnaps.forEach(fn)
            };
        },
        onSnapshot: (callback) => {
            snapshotListener = callback;
            return () => { snapshotListener = null; };
        },
        doc: (docId) => ({
            get: async () => {
                const exists = store.has(docId);
                const data = exists ? JSON.parse(JSON.stringify(store.get(docId))) : null;
                return { exists, data: () => data };
            },
            set: async (data) => {
                if (options.onSet) {
                    await options.onSet(docId, data, store);
                }
                calls.setDocs.push({ id: docId, data: JSON.parse(JSON.stringify(data)) });
                store.set(docId, JSON.parse(JSON.stringify(data)));
            },
            delete: async () => {
                calls.deleteDocs.push(docId);
                store.delete(docId);
            }
        })
    };

    const firestoreMock = {
        enablePersistence: async (opts) => {
            persistenceCalls.push(opts);
        },
        collection: (colName) => {
            if (colName !== 'documents') {
                throw new Error(`Unexpected collection query: ${colName}`);
            }
            return docCollection;
        }
    };

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        location: {
            hostname: 'docvault-qa-team.firebaseapp.com',
            search: options.search || ''
        },
        COLLAB_MODE: options.collabMode !== undefined ? options.collabMode : true,
        GUEST_MODE: options.guestMode !== undefined ? options.guestMode : false,
        firebase: {
            firestore: () => firestoreMock
        },
        ensureFirebase: async () => {},
        CollabAuth: {
            getCurrentUser: () => options.user || { uid: 'user-agent-1', email: 'agent1@example.com' }
        },
        toast: (msg, type) => {
            toasts.push({ msg, type });
        },
        store,
        calls,
        toasts,
        persistenceCalls,
        getSnapshotListener: () => snapshotListener,
        triggerSnapshot: (changes) => {
            if (snapshotListener) {
                snapshotListener({
                    docChanges: () => changes.map(c => ({
                        type: c.type || 'modified',
                        doc: {
                            id: c.doc?.id || c.id,
                            data: () => c.doc?.data ? c.doc.data : c.doc || c,
                            metadata: { hasPendingWrites: Boolean(c.hasPendingWrites) }
                        }
                    }))
                });
            }
        },
        document: {
            getElementById: (id) => elements.get(id) || null,
            querySelector: (sel) => elements.get(sel) || null,
            createElement: (tag) => {
                const el = {
                    tagName: tag.toUpperCase(),
                    id: '',
                    className: '',
                    style: { cssText: '' },
                    setAttribute: (k, v) => { el[k] = v; },
                    remove: () => {
                        if (el.id) elements.delete(el.id);
                    },
                    innerHTML: '',
                    prepend: (child) => {
                        if (child?.id) elements.set(child.id, child);
                    }
                };
                return el;
            }
        },
        render: () => {
            ctx.renderCallCount = (ctx.renderCallCount || 0) + 1;
        },
        renderCallCount: 0,
        _elements: elements,
        _captureEditorFormState: options._captureEditorFormState || null,
        state: options.state || { view: 'dashboard', editingDoc: null },
        documents: options.documents || []
    };

    vm.createContext(ctx);
    const storeCode = read('js/collab-store.js');
    vm.runInContext(storeCode, ctx);

    return ctx;
}

test('loadDocuments() in COLLAB_MODE calls getDocs once on documents without category query and maps all fields', async () => {
    const initialDocs = {
        'doc-1': {
            id: 'doc-1',
            title: 'Bug Report 1',
            category: 'bug',
            subfolder: 'Auth',
            status: 'open',
            content: '# Bug description',
            tags: ['p0', 'security'],
            username: '',
            password: '',
            bugData: { severity: 'critical', steps: '1. click' },
            runData: null,
            bugStatus: 'open',
            bugNumber: 101,
            favorite: true,
            version: 1,
            createdBy: 'user-author',
            updatedBy: 'user-author',
            createdAt: 1000,
            updatedAt: 1000
        },
        'doc-2': {
            id: 'doc-2',
            title: 'Test Run',
            category: 'testrun',
            runData: { passed: 10, failed: 1 },
            bugData: null,
            version: 3,
            createdBy: 'user-qa',
            updatedBy: 'user-qa',
            createdAt: 2000,
            updatedAt: 2500
        }
    };

    const ctx = createStoreContext({ initialDocs });
    const docs = await ctx.CollabStore.loadDocuments();

    assert.equal(ctx.calls.getDocs, 1, 'Must call getDocs exactly once');
    assert.equal(docs.length, 2);

    const doc1 = docs.find(d => d.id === 'doc-1');
    assert.ok(doc1);
    assert.equal(doc1.title, 'Bug Report 1');
    assert.deepEqual(doc1.tags, ['p0', 'security']);
    assert.deepEqual(doc1.bugData, { severity: 'critical', steps: '1. click' });
    assert.equal(doc1.runData, null);
    assert.equal(doc1.version, 1);

    const doc2 = docs.find(d => d.id === 'doc-2');
    assert.ok(doc2);
    assert.deepEqual(doc2.runData, { passed: 10, failed: 1 });
    assert.equal(doc2.bugData, null);
    assert.equal(doc2.version, 3);

    // Verify _knownDocs was populated
    const known = ctx.CollabStore.getKnownDocs();
    assert.equal(known.size, 2);
    assert.equal(known.get('doc-1').version, 1);
    assert.equal(known.get('doc-2').version, 3);
});

test('loadDocuments() does not call Firestore when COLLAB_MODE is false or in guest mode', async () => {
    const ctxDisabled = createStoreContext({ collabMode: false });
    const docsDisabled = await ctxDisabled.CollabStore.loadDocuments();
    assert.equal(ctxDisabled.calls.getDocs, 0);
    assert.equal(docsDisabled.length, 0);

    const ctxGuest = createStoreContext({ guestMode: true, search: '?guest=1' });
    const docsGuest = await ctxGuest.CollabStore.loadDocuments();
    assert.equal(ctxGuest.calls.getDocs, 0);
    assert.equal(docsGuest.length, 0);
});

test('persist() creates new document with version: 1, createdBy, updatedBy, and preserves all model fields', async () => {
    const ctx = createStoreContext({ user: { uid: 'user-creator' } });
    const newDoc = {
        id: 'new-doc-1',
        title: 'New Bug',
        category: 'bug',
        subfolder: 'Triage',
        status: 'new',
        content: 'Issue body',
        tags: ['regression'],
        username: 'service_user',
        password: 'vault-secret-password-123',
        bugData: { component: 'checkout' },
        runData: null,
        favorite: false,
        createdAt: 1700000000000,
        updatedAt: 1700000000000,
        github_pat: 'ghp_secret_token_never_sent',
        master_password: 'local_master_password'
    };

    await ctx.CollabStore.persist([newDoc]);

    assert.equal(ctx.calls.setDocs.length, 1);
    const sent = ctx.calls.setDocs[0].data;

    assert.equal(sent.id, 'new-doc-1');
    assert.equal(sent.version, 1, 'Create must send version: 1');
    assert.equal(sent.createdBy, 'user-creator', 'Create must send createdBy: currentUid');
    assert.equal(sent.updatedBy, 'user-creator', 'Create must send updatedBy: currentUid');
    assert.deepEqual(sent.bugData, { component: 'checkout' }, 'bugData must be preserved');
    assert.equal(sent.runData, null, 'runData must be explicitly mapped');
    assert.equal(sent.password, 'vault-secret-password-123', 'Credential password travels with document');

    // Never leak PAT or master password
    assert.equal(sent.github_pat, undefined, 'Must not send github_pat');
    assert.equal(sent.master_password, undefined, 'Must not send master_password');

    // In-memory document updated
    assert.equal(newDoc.version, 1);
    assert.equal(newDoc.createdBy, 'user-creator');
    assert.equal(newDoc.updatedBy, 'user-creator');

    // Known map updated
    const known = ctx.CollabStore.getKnownDocs().get('new-doc-1');
    assert.ok(known);
    assert.equal(known.version, 1);
});

test('persist() updates existing document with version + 1 when updatedAt or focusWorkflowUpdatedAt is newer', async () => {
    const initialDocs = {
        'doc-1': {
            id: 'doc-1',
            title: 'Initial Title',
            category: 'testcase',
            status: 'active',
            content: 'Step 1',
            tags: [],
            version: 1,
            createdBy: 'original-author',
            updatedBy: 'original-author',
            createdAt: 1000,
            updatedAt: 1000
        }
    };

    const ctx = createStoreContext({
        initialDocs,
        user: { uid: 'user-editor' }
    });

    // 1. Initial load
    const docs = await ctx.CollabStore.loadDocuments();
    assert.equal(docs[0].version, 1);

    // 2. No changes -> persist should skip write
    await ctx.CollabStore.persist(docs);
    assert.equal(ctx.calls.setDocs.length, 0, 'Must not write when updatedAt is not newer');

    // 3. Update with newer updatedAt
    docs[0].title = 'Updated Title';
    docs[0].updatedAt = 2000;

    await ctx.CollabStore.persist(docs);
    assert.equal(ctx.calls.setDocs.length, 1, 'Must write when updatedAt is newer');

    const update1 = ctx.calls.setDocs[0].data;
    assert.equal(update1.version, 2, 'Update must send old version + 1');
    assert.equal(update1.createdBy, 'original-author', 'Must preserve original createdBy');
    assert.equal(update1.updatedBy, 'user-editor', 'Must set updatedBy to current user');
    assert.equal(docs[0].version, 2);

    // 4. Update with newer focusWorkflowUpdatedAt
    docs[0].focusWorkflow = { status: 'in-focus', startedAt: 3000 };
    docs[0].focusWorkflowUpdatedAt = 3000;

    await ctx.CollabStore.persist(docs);
    assert.equal(ctx.calls.setDocs.length, 2, 'Must write when focusWorkflowUpdatedAt is newer');
    const update2 = ctx.calls.setDocs[1].data;
    assert.equal(update2.version, 3, 'Must increment version to 3');
    assert.equal(docs[0].version, 3);
});

test('persist() detects version conflict, retains local version, does not overwrite, and notifies exact message', async () => {
    const initialDocs = {
        'conflict-doc': {
            id: 'conflict-doc',
            title: 'Server Version 1',
            category: 'general',
            status: 'active',
            content: 'Base content',
            tags: [],
            version: 1,
            createdBy: 'author-1',
            updatedBy: 'author-1',
            createdAt: 1000,
            updatedAt: 1000
        }
    };

    let simulateRemoteSave = false;

    const ctx = createStoreContext({
        initialDocs,
        user: { uid: 'user-local' },
        onSet: async (docId, data, store) => {
            if (simulateRemoteSave) {
                // Another client already saved version 2 in Firestore!
                const currentRemote = store.get(docId);
                if (data.version <= currentRemote.version) {
                    const err = new Error('PERMISSION_DENIED: request.resource.data.version == resource.data.version + 1');
                    err.code = 'permission-denied';
                    throw err;
                }
            }
        }
    });

    // Client loads version 1
    const docs = await ctx.CollabStore.loadDocuments();
    assert.equal(docs[0].version, 1);

    // Simulate remote user saving version 2 behind the scenes
    simulateRemoteSave = true;
    ctx.store.set('conflict-doc', {
        ...ctx.store.get('conflict-doc'),
        title: 'Remote user saved title',
        version: 2,
        updatedAt: 1500,
        updatedBy: 'other-user'
    });

    // Local user edits and attempts to persist
    docs[0].title = 'My Local Edit That Conflicts';
    docs[0].updatedAt = 2000;

    await ctx.CollabStore.persist(docs);

    // 1. Local copy is retained with user's edits
    assert.equal(docs[0].title, 'My Local Edit That Conflicts', 'Local edits must be retained');

    // 2. Remote Firestore doc is NOT overwritten
    const remoteDoc = ctx.store.get('conflict-doc');
    assert.equal(remoteDoc.title, 'Remote user saved title', 'Remote doc must NOT be overwritten');
    assert.equal(remoteDoc.version, 2);

    // 3. Exact toast message is shown
    const lastConflict = ctx.CollabStore.getLastConflict();
    assert.ok(lastConflict);
    assert.equal(lastConflict.message, 'Someone else saved this document. Reload to see their version.');
    assert.ok(ctx.toasts.some(t => t.msg === 'Someone else saved this document. Reload to see their version.'));

    // 4. Known docs retained old version (not bumped to 2)
    assert.equal(ctx.CollabStore.getKnownDocs().get('conflict-doc').version, 1);
});

test('persist() deletes documents from Firestore when they disappear from local documents array', async () => {
    const initialDocs = {
        'doc-to-keep': {
            id: 'doc-to-keep',
            title: 'Keep me',
            version: 1,
            updatedAt: 1000
        },
        'doc-to-delete': {
            id: 'doc-to-delete',
            title: 'Delete me',
            version: 1,
            updatedAt: 1000
        }
    };

    const ctx = createStoreContext({ initialDocs, user: { uid: 'owner-user' } });
    const docs = await ctx.CollabStore.loadDocuments();
    assert.equal(docs.length, 2);

    // Remove doc-to-delete from local documents
    const remainingDocs = docs.filter(d => d.id !== 'doc-to-delete');

    await ctx.CollabStore.persist(remainingDocs);

    assert.ok(ctx.calls.deleteDocs.includes('doc-to-delete'), 'Must call delete on disappeared document');
    assert.equal(ctx.store.has('doc-to-delete'), false, 'Document must be removed from Firestore');
    assert.equal(ctx.CollabStore.getKnownDocs().has('doc-to-delete'), false, 'Removed from _knownDocs');
    assert.equal(ctx.CollabStore.getKnownDocs().has('doc-to-keep'), true);
});

test('persist() does not swallow delete rejection and lets error propagate', async () => {
    const initialDocs = {
        'doc-to-delete': {
            id: 'doc-to-delete',
            title: 'Delete me',
            version: 1,
            updatedAt: 1000
        }
    };

    const ctx = createStoreContext({
        initialDocs,
        user: { uid: 'editor-user' }
    });

    const origCol = ctx.firebase.firestore().collection;
    ctx.firebase.firestore().collection = (col) => {
        const c = origCol(col);
        return {
            ...c,
            doc: (docId) => {
                const d = c.doc(docId);
                return {
                    ...d,
                    delete: async () => {
                        const err = new Error('PERMISSION_DENIED: only owner can delete');
                        err.code = 'permission-denied';
                        throw err;
                    }
                };
            }
        };
    };

    const docs = await ctx.CollabStore.loadDocuments();
    assert.equal(docs.length, 1);

    await assert.rejects(
        () => ctx.CollabStore.persist([]),
        /permission-denied|only owner can delete/
    );

    assert.equal(ctx.CollabStore.getKnownDocs().has('doc-to-delete'), true, 'Document retained in _knownDocs on delete failure');
});

test('events.js loads collab-store before CollabBootstrap.start and sw.js caches it in APP_SHELL with v63', () => {
    const events = read('js/events.js');
    assert.match(events, /'collab-store'/);
    assert.ok(events.indexOf("'collab-store'") < events.indexOf('CollabBootstrap?.start'));

    const sw = read('sw.js');
    assert.match(sw, /const SW_VERSION = 'v63'/);
    assert.match(sw, /'\.\/js\/collab-store\.js'/);
});

test('js/state.js persist() and hydrate() integrate with CollabStore when COLLAB_MODE is enabled', async () => {
    const stateFile = read('js/state.js');
    assert.match(stateFile, /window\.COLLAB_MODE/);
    assert.match(stateFile, /CollabStore/);
    assert.match(stateFile, /CollabStore\?\.loadDocuments/);
    assert.match(stateFile, /CollabStore\?\.persist/);
});

test('state.js hydrate() and persist() dynamically invoke CollabStore when COLLAB_MODE is true, and local storage when false', async () => {
    let localSaved = null;
    let collabPersistCalled = false;
    let collabLoadCalled = false;

    const ctx = {
        console,
        window: {
            COLLAB_MODE: true,
            CollabStore: {
                loadDocuments: async () => {
                    collabLoadCalled = true;
                    return [{ id: 'collab-1', title: 'Collab Doc', tags: [] }];
                },
                persist: async (docs) => {
                    collabPersistCalled = true;
                    return docs;
                }
            }
        },
        DocStorage: {
            save: async (docs) => { localSaved = docs; },
            getAll: async () => [{ id: 'local-1', title: 'Local Doc', tags: [] }],
            getSettings: async () => ({})
        },
        localStorage: {
            getItem: () => null,
            removeItem: () => {}
        },
        sessionStorage: {
            removeItem: () => {}
        },
        normalizeDocTags: () => {},
        SAMPLE_DOCS: [],
        GUEST_DEMO_DOCS: []
    };
    ctx.window.window = ctx.window;

    vm.createContext(ctx);
    vm.runInContext(read('js/state.js'), ctx);

    // 1. COLLAB_MODE = true
    await ctx.hydrate();
    assert.equal(collabLoadCalled, true);
    const docsCollab = vm.runInContext('documents', ctx);
    assert.equal(docsCollab.length, 1);
    assert.equal(docsCollab[0].id, 'collab-1');

    await ctx.persist();
    assert.equal(collabPersistCalled, true);
    assert.equal(localSaved, null);

    // 2. COLLAB_MODE = false
    ctx.window.COLLAB_MODE = false;
    collabLoadCalled = false;
    collabPersistCalled = false;

    await ctx.hydrate();
    assert.equal(collabLoadCalled, false);
    const docsLocal = vm.runInContext('documents', ctx);
    assert.equal(docsLocal.length, 1);
    assert.equal(docsLocal[0].id, 'local-1');

    await ctx.persist();
    assert.equal(collabPersistCalled, false);
    assert.ok(localSaved);
});

test('onSnapshot listener starts after loadDocuments and offline persistence is enabled before read/write', async () => {
    const ctx = createStoreContext({
        initialDocs: {
            'doc-1': { id: 'doc-1', title: 'Doc 1', version: 1, updatedAt: 1000 }
        }
    });

    assert.equal(ctx.persistenceCalls.length, 0);
    assert.equal(ctx.CollabStore.isListening(), false);

    await ctx.CollabStore.loadDocuments();

    assert.equal(ctx.persistenceCalls.length, 1);
    assert.equal(ctx.persistenceCalls[0].synchronizeTabs, true);
    assert.equal(ctx.CollabStore.isListening(), true);

    ctx.CollabStore.stopListening();
    assert.equal(ctx.CollabStore.isListening(), false);
});

test('editor dirty does not get overwritten by snapshot and shows conflict banner with reload button', async () => {
    let formState = 'form-state-dirty';
    const ctx = createStoreContext({
        initialDocs: {
            'doc-edit': { id: 'doc-edit', title: 'Server Title', version: 1, updatedAt: 1000 }
        },
        _captureEditorFormState: () => formState,
        state: {
            view: 'editor',
            editingDoc: { id: 'doc-edit', title: 'Local Dirty Title', version: 1, updatedAt: 1000 },
            _editorSnapshot: 'form-state-clean'
        },
        documents: [
            { id: 'doc-edit', title: 'Local Dirty Title', version: 1, updatedAt: 1000 }
        ]
    });

    await ctx.CollabStore.loadDocuments();

    // Another client saves version 2
    ctx.triggerSnapshot([
        {
            type: 'modified',
            id: 'doc-edit',
            doc: {
                id: 'doc-edit',
                title: 'Remote Updated Title',
                version: 2,
                updatedAt: 2000
            }
        }
    ]);

    // 1. Array in memory gets the remote document
    assert.equal(ctx.documents[0].title, 'Remote Updated Title');
    assert.equal(ctx.documents[0].version, 2);

    // 2. state.editingDoc is NOT overwritten because form is dirty
    assert.equal(ctx.state.editingDoc.title, 'Local Dirty Title');
    assert.equal(ctx.state.editingDoc.version, 1);

    // 3. Conflict banner is shown with exact text "Updated by someone else" and reload button
    const banner = ctx.document.getElementById('collab-editor-banner');
    assert.ok(banner, 'Banner must exist in DOM');
    assert.match(banner.innerHTML, /Updated by someone else/);
    assert.match(banner.innerHTML, /reloadCollabDoc\('doc-edit'\)/);

    // 4. Reloading the document loads the remote version and removes the banner
    ctx.reloadCollabDoc('doc-edit');
    assert.equal(ctx.state.editingDoc.title, 'Remote Updated Title');
    assert.equal(ctx.state.editingDoc.version, 2);
    assert.equal(ctx.document.getElementById('collab-editor-banner'), null);
});

test('other view (viewer) replaces document and calls render when document is currently open', async () => {
    const ctx = createStoreContext({
        initialDocs: {
            'doc-view': { id: 'doc-view', title: 'Viewer Original', version: 1, updatedAt: 1000 }
        },
        state: {
            view: 'viewer',
            editingDoc: { id: 'doc-view', title: 'Viewer Original', version: 1, updatedAt: 1000 }
        },
        documents: [
            { id: 'doc-view', title: 'Viewer Original', version: 1, updatedAt: 1000 }
        ]
    });

    await ctx.CollabStore.loadDocuments();
    assert.equal(ctx.renderCallCount, 0);

    // Remote snapshot arrives
    ctx.triggerSnapshot([
        {
            type: 'modified',
            id: 'doc-view',
            doc: {
                id: 'doc-view',
                title: 'Viewer Remote Updated',
                version: 2,
                updatedAt: 2000
            }
        }
    ]);

    // 1. Document in array is replaced
    assert.equal(ctx.documents[0].title, 'Viewer Remote Updated');
    assert.equal(ctx.documents[0].version, 2);

    // 2. Currently viewed document is replaced
    assert.equal(ctx.state.editingDoc.title, 'Viewer Remote Updated');
    assert.equal(ctx.state.editingDoc.version, 2);

    // 3. render() was called
    assert.ok(ctx.renderCallCount > 0, 'render() must be called for open document in viewer');
});

test('editor clean (not dirty) updates state.editingDoc and renders', async () => {
    const ctx = createStoreContext({
        initialDocs: {
            'doc-clean': { id: 'doc-clean', title: 'Clean Original', version: 1, updatedAt: 1000 }
        },
        _captureEditorFormState: () => 'snapshot-clean',
        state: {
            view: 'editor',
            editingDoc: { id: 'doc-clean', title: 'Clean Original', version: 1, updatedAt: 1000 },
            _editorSnapshot: 'snapshot-clean'
        },
        documents: [
            { id: 'doc-clean', title: 'Clean Original', version: 1, updatedAt: 1000 }
        ]
    });

    await ctx.CollabStore.loadDocuments();
    assert.equal(ctx.renderCallCount, 0);

    ctx.triggerSnapshot([
        {
            type: 'modified',
            id: 'doc-clean',
            doc: {
                id: 'doc-clean',
                title: 'Clean Remote Updated',
                version: 2,
                updatedAt: 2000
            }
        }
    ]);

    assert.equal(ctx.documents[0].title, 'Clean Remote Updated');
    assert.equal(ctx.state.editingDoc.title, 'Clean Remote Updated');
    assert.ok(ctx.renderCallCount > 0);
    assert.equal(ctx.document.getElementById('collab-editor-banner'), null);
});

test('persist() shows toast and re-throws write error when offline/network failure occurs', async () => {
    const ctx = createStoreContext({
        initialDocs: {},
        user: { uid: 'user-writer' }
    });

    const origCol = ctx.firebase.firestore().collection;
    ctx.firebase.firestore().collection = (col) => {
        const c = origCol(col);
        return {
            ...c,
            doc: (docId) => ({
                ...c.doc(docId),
                set: async () => {
                    const err = new Error('Client is offline: IndexedDB transaction failed');
                    err.code = 'unavailable';
                    throw err;
                }
            })
        };
    };

    const newDoc = { id: 'doc-fail', title: 'Failed Doc', category: 'general', status: 'active', tags: [] };

    await assert.rejects(
        () => ctx.CollabStore.persist([newDoc]),
        /Client is offline/
    );

    assert.ok(ctx.toasts.length > 0, 'Toast must be triggered on write error');
    assert.equal(ctx.toasts[0].type, 'error');
    assert.match(ctx.toasts[0].msg, /Client is offline/);
});

test('signOut stops onSnapshot listener in CollabStore', async () => {
    let stopCalled = false;
    const ctx = {
        console,
        CollabStore: {
            stopListening: () => { stopCalled = true; }
        },
        CollabAuth: {
            signOutUser: async () => {}
        },
        document: {
            getElementById: () => null
        }
    };

    vm.createContext(ctx);
    vm.runInContext(read('js/collab-bootstrap.js'), ctx);

    await ctx.collabSignOut();
    assert.equal(stopCalled, true, 'collabSignOut must invoke CollabStore.stopListening');
});

test('loadDocuments() calls normalizeDocTags on loaded documents when available', async () => {
    let normalizedDocs = null;
    const ctx = createStoreContext({
        initialDocs: {
            'doc-tags': { id: 'doc-tags', title: 'Tag Doc', tags: ['a', 'b'], version: 1, updatedAt: 1000 }
        }
    });
    ctx.normalizeDocTags = (docs) => {
        normalizedDocs = docs;
    };

    const loaded = await ctx.CollabStore.loadDocuments();
    assert.equal(normalizedDocs, loaded);
    assert.equal(loaded[0].id, 'doc-tags');
});

test('enableOfflinePersistence logs warning and rejects on failed-precondition, ignores unimplemented', async () => {
    const warned = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warned.push(args.join(' ')); };

    try {
        const ctx1 = createStoreContext();
        const dbUnimplemented = {
            enablePersistence: async () => {
                const err = new Error('Not implemented');
                err.code = 'unimplemented';
                throw err;
            }
        };
        await ctx1.CollabStore.enableOfflinePersistence(dbUnimplemented);
        assert.equal(warned.length, 0, 'unimplemented must be ignored without warning');

        const ctx2 = createStoreContext();
        const dbPrecondition = {
            enablePersistence: async () => {
                const err = new Error('Already initialized');
                err.code = 'failed-precondition';
                throw err;
            }
        };
        await assert.rejects(
            () => ctx2.CollabStore.enableOfflinePersistence(dbPrecondition),
            /Already initialized/
        );
        assert.ok(warned.some(w => w.includes('enablePersistence failed-precondition')), 'Must console.warn on failed-precondition');
    } finally {
        console.warn = origWarn;
    }
});

