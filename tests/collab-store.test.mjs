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
                const onSetFn = ctx?.onSet || options.onSet;
                if (onSetFn) {
                    await onSetFn(docId, data, store);
                }
                calls.setDocs.push({ id: docId, data: JSON.parse(JSON.stringify(data)) });
                store.set(docId, JSON.parse(JSON.stringify(data)));
            },
            update: async (data) => {
                const existing = store.get(docId) || {};
                store.set(docId, { ...existing, ...JSON.parse(JSON.stringify(data)) });
            },
            delete: async () => {
                calls.deleteDocs.push(docId);
                store.delete(docId);
            },
            collection: (subName) => ({
                doc: (subId) => ({
                    get: async () => {
                        const key = `${docId}/${subName}/${subId}`;
                        const exists = store.has(key);
                        const data = exists ? JSON.parse(JSON.stringify(store.get(key))) : null;
                        return { exists, data: () => data };
                    },
                    set: async (data) => {
                        const key = `${docId}/${subName}/${subId}`;
                        store.set(key, JSON.parse(JSON.stringify(data)));
                    },
                    delete: async () => {
                        const key = `${docId}/${subName}/${subId}`;
                        store.delete(key);
                    }
                })
            })
        })
    };

    const firestoreMock = {
        batch: () => {
            const ops = [];
            return {
                set: (ref, data) => ops.push({ type: 'set', ref, data }),
                delete: (ref) => ops.push({ type: 'delete', ref }),
                commit: async () => {
                    const snapshot = new Map(store);
                    const callsSnapshot = { setDocs: [...calls.setDocs], deleteDocs: [...calls.deleteDocs] };
                    try {
                        for (const op of ops) {
                            if (op.type === 'set') await op.ref.set(op.data);
                            else if (op.type === 'delete') await op.ref.delete();
                        }
                    } catch (err) {
                        store.clear();
                        for (const [k, v] of snapshot.entries()) store.set(k, v);
                        calls.setDocs = callsSnapshot.setDocs;
                        calls.deleteDocs = callsSnapshot.deleteDocs;
                        throw err;
                    }
                }
            };
        },
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
        CollabBootstrap: {
            getCurrentMember: () => options.currentMember || { uid: options.user?.uid || 'user-agent-1', role: options.role || 'editor' }
        },
        CollabAuth: {
            getCurrentUser: () => options.user || { uid: 'user-agent-1', email: 'agent1@example.com' }
        },
        toast: (msg, type) => {
            toasts.push({ msg, type });
        },
        db: firestoreMock,
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

test('events.js loads collab-store before CollabBootstrap.start and sw.js caches it in APP_SHELL with v91', () => {
    const events = read('js/events.js');
    assert.match(events, /'collab-store'/);
    assert.ok(events.indexOf("'collab-store'") < events.indexOf('CollabBootstrap?.start'));

    const sw = read('sw.js');
    assert.match(sw, /const SW_VERSION = 'v91'/);
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
    assert.match(banner.innerHTML, /reloadCollabDoc\((?:'|&quot;)doc-edit(?:'|&quot;)\)/);

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

test('CollabStore: toFirestoreDoc strips undefined fields from bugData and category payloads', async () => {
    let receivedData = null;
    const ctx = createStoreContext({
        onSet: async (docId, data) => {
            receivedData = data;
            // Strict check mimicking Firestore SDK: reject any property whose value is undefined
            const checkNoUndefined = (obj, p = '') => {
                if (!obj || typeof obj !== 'object') return;
                for (const [k, v] of Object.entries(obj)) {
                    if (v === undefined) {
                        throw new Error(`Function DocumentReference.set() called with invalid data. Unsupported field value: undefined (found in field ${p}${k})`);
                    }
                    if (v && typeof v === 'object') checkNoUndefined(v, `${p}${k}.`);
                }
            };
            checkNoUndefined(data);
        }
    });

    const bugDoc = {
        id: 'bug-test-undefined',
        title: 'Bug Report Without Run',
        category: 'bug',
        status: 'published',
        bugData: {
            severity: 'Major',
            priority: 'P2',
            env: 'Staging',
            foundInRun: undefined,
            foundInTc: undefined,
            foundInStep: undefined
        }
    };

    await ctx.CollabStore.persist([bugDoc]);

    assert.ok(receivedData, 'Document must be written to Firestore');
    assert.equal(receivedData.bugData.foundInRun, undefined);
    assert.ok(!('foundInRun' in receivedData.bugData), 'foundInRun property must be stripped');
    assert.ok(!('foundInTc' in receivedData.bugData), 'foundInTc property must be stripped');
    assert.ok(!('foundInStep' in receivedData.bugData), 'foundInStep property must be stripped');
    assert.equal(receivedData.bugData.severity, 'Major');
});

test('CollabStore: toFirestoreDoc and fromFirestoreDoc preserve task assignee and taskData', () => {
    const ctx = createStoreContext();
    const taskDoc = {
        id: 'task-123',
        title: 'Task Alpha',
        category: 'task',
        assignee: 'Alice Wonder',
        assigneeUid: 'uid-alice',
        kanbanStatus: 'in-progress',
        taskData: { priority: 'High', estimate: '2d' }
    };

    const firestoreData = ctx.CollabStore.toFirestoreDoc(taskDoc, { version: 1 });
    assert.equal(firestoreData.assignee, 'Alice Wonder');
    assert.equal(firestoreData.assigneeUid, 'uid-alice');
    assert.equal(firestoreData.kanbanStatus, 'in-progress');
    assert.equal(firestoreData.taskData.priority, 'High');
    assert.equal(firestoreData.taskData.estimate, '2d');

    const restoredDoc = ctx.CollabStore.fromFirestoreDoc(firestoreData, 'task-123');
    assert.equal(restoredDoc.assignee, 'Alice Wonder');
    assert.equal(restoredDoc.assigneeUid, 'uid-alice');
    assert.equal(restoredDoc.kanbanStatus, 'in-progress');
    assert.equal(restoredDoc.taskData.priority, 'High');
    assert.equal(restoredDoc.taskData.estimate, '2d');
});

test('CollabStore: toFirestoreDoc and fromFirestoreDoc preserve rotatedAt date string and number', () => {
    const ctx = createStoreContext();
    const credString = { id: 'c1', title: 'Cred 1', category: 'credential', rotatedAt: '2026-11-15' };
    const fsString = ctx.CollabStore.toFirestoreDoc(credString);
    assert.equal(fsString.rotatedAt, '2026-11-15');
    const restoredString = ctx.CollabStore.fromFirestoreDoc(fsString, 'c1');
    assert.equal(restoredString.rotatedAt, '2026-11-15');

    const credNumber = { id: 'c2', title: 'Cred 2', category: 'credential', rotatedAt: 1763200000000 };
    const fsNumber = ctx.CollabStore.toFirestoreDoc(credNumber);
    assert.equal(fsNumber.rotatedAt, 1763200000000);
    const restoredNumber = ctx.CollabStore.fromFirestoreDoc(fsNumber, 'c2');
    assert.equal(restoredNumber.rotatedAt, 1763200000000);

    const credEmpty = { id: 'c3', title: 'Cred 3', category: 'credential', rotatedAt: '' };
    const fsEmpty = ctx.CollabStore.toFirestoreDoc(credEmpty);
    assert.equal(fsEmpty.rotatedAt, null);
});

test('Critical 1.1: Option A Credential Secrets Isolation in persist() and loadDocuments()', async () => {
    // 1. toFirestoreDoc zeroes password for credentials
    const ctx = createStoreContext({ role: 'editor', user: { uid: 'ed-1' } });
    const credDoc = { id: 'cred-1', title: 'DB Credentials', category: 'credential', username: 'admin', password: 'super-secret-password-123' };
    const fsDoc = ctx.CollabStore.toFirestoreDoc(credDoc);
    assert.equal(fsDoc.password, '', 'toFirestoreDoc must zero out password for credential category');

    // 2. persist() writes root doc without password, and writes subcollection documents/{id}/secrets/credential
    await ctx.CollabStore.persist([credDoc]);
    const rootDocInStore = ctx.store.get('cred-1');
    assert.ok(rootDocInStore, 'Root document must be persisted');
    assert.equal(rootDocInStore.password, '', 'Root document in Firestore must never contain plaintext password');

    const secretInStore = ctx.store.get('cred-1/secrets/credential');
    assert.ok(secretInStore, 'Secret must be stored in subcollection');
    assert.equal(secretInStore.password, 'super-secret-password-123', 'Secret must have password');
    assert.ok(typeof secretInStore.updatedAt === 'number', 'Secret must have updatedAt timestamp');

    // 3. persist() as viewer does not write secret
    const viewerCtx = createStoreContext({ role: 'viewer', user: { uid: 'vw-1' } });
    const viewerCred = { id: 'cred-vw', title: 'Viewer Cred', category: 'credential', password: 'should-not-save' };
    await viewerCtx.CollabStore.persist([viewerCred]);
    assert.equal(viewerCtx.store.has('cred-vw/secrets/credential'), false, 'Viewer role must not write secret');

    // 4. loadDocuments() fetches secret for editor/owner and attaches doc.password
    const editorCtx = createStoreContext({
        role: 'editor',
        user: { uid: 'ed-1' },
        initialDocs: {
            'cred-1': { id: 'cred-1', title: 'DB Credentials', category: 'credential', username: 'admin', password: '', workspaceId: 'default' },
            'cred-1/secrets/credential': { password: 'super-secret-password-123', updatedAt: 12345 }
        }
    });
    const loadedDocs = await editorCtx.CollabStore.loadDocuments();
    const loadedCred = loadedDocs.find(d => d.id === 'cred-1');
    assert.ok(loadedCred);
    assert.equal(loadedCred.password, 'super-secret-password-123', 'Editor must receive attached secret password');

    // 5. loadDocuments() for viewer leaves doc.password empty
    const viewerLoadCtx = createStoreContext({
        role: 'viewer',
        user: { uid: 'vw-1' },
        initialDocs: {
            'cred-1': { id: 'cred-1', title: 'DB Credentials', category: 'credential', username: 'admin', password: '', workspaceId: 'default' },
            'cred-1/secrets/credential': { password: 'super-secret-password-123', updatedAt: 12345 }
        }
    });
    const viewerDocs = await viewerLoadCtx.CollabStore.loadDocuments();
    const viewerLoadedCred = viewerDocs.find(d => d.id === 'cred-1');
    assert.ok(viewerLoadedCred);
    assert.equal(viewerLoadedCred.password, '', 'Viewer must receive empty password');
});

test('Critical 1.2: persist() delete race condition guards', async () => {
    const initialDocs = {
        'doc-keep': { id: 'doc-keep', title: 'Keep Me', workspaceId: 'default', version: 1 },
        'doc-delete': { id: 'doc-delete', title: 'Delete Me', workspaceId: 'default', version: 1 }
    };
    const ctx = createStoreContext({ initialDocs, role: 'owner', user: { uid: 'owner-1' } });
    await ctx.CollabStore.loadDocuments();

    // Simulate concurrent discovery: doc arrives while persist is running
    // 1. New doc added to _knownDocs during persist run (not in initialKnownIds)
    const known = ctx.CollabStore.getKnownDocs();
    assert.ok(known.has('doc-keep'));
    assert.ok(known.has('doc-delete'));

    // Inject a newly arrived doc into _knownDocs AFTER initialKnownIds snapshot
    // In our test, targetDocs only has 'doc-keep'
    // Guard 1: if a doc is in getDocuments() array, it must NEVER be deleted even if missing in targetDocs
    ctx.documents = [{ id: 'doc-delete', title: 'Still Alive in Live Docs', workspaceId: 'default' }];
    await ctx.CollabStore.persist([{ id: 'doc-keep', title: 'Keep Me', workspaceId: 'default' }]);

    assert.equal(ctx.calls.deleteDocs.includes('doc-delete'), false, 'Doc present in live documents array must not be deleted');
    assert.ok(ctx.store.has('doc-delete'), 'doc-delete must remain in store');

    // Guard 2: Doc not in initialKnownIds must not be deleted even if missing in targetDocs and live docs
    ctx.documents = [];
    known.clear();
    known.set('doc-keep', { id: 'doc-keep', workspaceId: 'default', updatedAt: 1000 });

    // Inject a doc that arrives concurrently while saving 'doc-keep'
    ctx.onSet = async (docId, data, store) => {
        if (docId === 'doc-keep') {
            // While doc-keep is being written over network, remote snapshot adds doc-concurrent
            known.set('doc-concurrent', { id: 'doc-concurrent', workspaceId: 'default' });
            store.set('doc-concurrent', { id: 'doc-concurrent', workspaceId: 'default' });
        }
    };

    await ctx.CollabStore.persist([{ id: 'doc-keep', title: 'Keep Me', workspaceId: 'default', updatedAt: 2000 }]);
    assert.equal(ctx.calls.deleteDocs.includes('doc-concurrent'), false, 'Doc arriving after persist snapshot must NOT be deleted');
    assert.ok(ctx.store.has('doc-concurrent'), 'doc-concurrent must remain in store');

    // Guard 3: Legitimate delete: Doc present in initialKnownIds, absent in targetDocs, absent in liveDocs -> deleted
    known.set('doc-delete', { id: 'doc-delete', workspaceId: 'default' });
    await ctx.CollabStore.persist([{ id: 'doc-keep', title: 'Keep Me', workspaceId: 'default' }]);
    assert.ok(ctx.calls.deleteDocs.includes('doc-delete'), 'Doc present in initialKnownIds and absent from target/live is deleted');
});

test('Critical 1.1: persist() fails closed when secret write rejects and deletes secrets on doc delete', async () => {
    // 1. writeSecret fails open prevention
    const ctx = createStoreContext({ role: 'owner', user: { uid: 'owner-1' } });
    const credDoc = { id: 'cred-fail', title: 'Failing Cred', category: 'credential', password: 'secret-pw' };

    // Mock subcollection secret write failure
    const origDoc = ctx.db.collection('documents').doc;
    ctx.db.collection('documents').doc = (docId) => {
        const ref = origDoc(docId);
        if (docId === 'cred-fail') {
            ref.collection = (sub) => ({
                doc: (secretId) => ({
                    set: async () => { throw new Error('Firestore rules: write denied to secrets'); },
                    delete: async () => {}
                })
            });
        }
        return ref;
    };

    await assert.rejects(
        () => ctx.CollabStore.persist([credDoc]),
        /write denied to secrets/,
        'persist() must throw if secret write fails, preventing silent credential loss'
    );
    assert.equal(ctx.store.has('cred-fail'), false, 'Root document must NOT be committed if secret write fails');

    // 2. Doc delete also purges secret subcollection
    const ctxDel = createStoreContext({
        role: 'owner',
        user: { uid: 'owner-1' },
        initialDocs: {
            'cred-to-delete': { id: 'cred-to-delete', title: 'Cred To Delete', category: 'credential', workspaceId: 'default' },
            'cred-to-delete/secrets/credential': { password: 'old-pass' }
        }
    });
    await ctxDel.CollabStore.loadDocuments();
    let secretDeleted = false;
    const origDocDel = ctxDel.db.collection('documents').doc;
    ctxDel.db.collection('documents').doc = (docId) => {
        const ref = origDocDel(docId);
        if (docId === 'cred-to-delete') {
            ref.collection = (sub) => ({
                doc: (secretId) => ({
                    set: async () => {},
                    delete: async () => { secretDeleted = true; }
                })
            });
        }
        return ref;
    };

    ctxDel.documents = [];
    await ctxDel.CollabStore.persist([]); // Deletes cred-to-delete
    assert.ok(ctxDel.calls.deleteDocs.includes('cred-to-delete'), 'Root doc deleted');
    assert.equal(secretDeleted, true, 'Subcollection secret must be deleted when doc is deleted');
});

test('Critical 1.1: Legacy credential password migration on loadDocuments', async () => {
    const ctx = createStoreContext({
        role: 'owner',
        user: { uid: 'owner-1' },
        initialDocs: {
            'cred-legacy': {
                id: 'cred-legacy',
                title: 'Legacy Cred',
                category: 'credential',
                password: 'legacy-plaintext-password',
                workspaceId: 'default'
            }
        }
    });

    const docs = await ctx.CollabStore.loadDocuments();
    const cred = docs.find(d => d.id === 'cred-legacy');
    assert.ok(cred);
    assert.equal(cred.password, 'legacy-plaintext-password', 'Loaded doc receives password');

    // Secret must have been created in subcollection
    const secret = ctx.store.get('cred-legacy/secrets/credential');
    assert.ok(secret, 'Secret must be migrated to subcollection');
    assert.equal(secret.password, 'legacy-plaintext-password');

    // Root doc password must have been scrubbed
    const rootDoc = ctx.store.get('cred-legacy');
    assert.equal(rootDoc.password, '', 'Root document password must be scrubbed to empty string');
    assert.equal(rootDoc.version, 2, 'Root doc version must be bumped to pass Firestore update rules');
    assert.equal(rootDoc.updatedBy, 'owner-1', 'Root doc updatedBy must match authenticated user');
});

test('Critical 1.1: applyRemoteDoc preserves existing credential secret while refetch is pending', async () => {
    const ctx = createStoreContext({
        role: 'editor',
        user: { uid: 'ed-1' },
        initialDocs: {
            'cred-snap': { id: 'cred-snap', title: 'Snap Cred', category: 'credential', password: '', workspaceId: 'default' },
            'cred-snap/secrets/credential': { password: 'secret-val-initial' }
        }
    });

    const docs = await ctx.CollabStore.loadDocuments();
    const doc = docs.find(d => d.id === 'cred-snap');
    assert.equal(doc.password, 'secret-val-initial');

    // Simulate remote modification snapshot where fromFirestoreDoc returns password: ''
    const remoteDoc = {
        id: 'cred-snap',
        title: 'Snap Cred Edited Remotely',
        category: 'credential',
        password: '',
        version: 2,
        updatedAt: Date.now() + 5000,
        workspaceId: 'default'
    };

    // applyRemoteDoc must keep the existing password immediately without blanking it
    ctx.CollabStore.applyRemoteDoc(remoteDoc, 'modified');
    assert.equal(doc.password, 'secret-val-initial', 'Doc password must not be overwritten with empty string before secret fetch');
    assert.equal(ctx.CollabStore.getKnownDocs().get('cred-snap').password, 'secret-val-initial');
});

test('Critical 1.1: Non-default workspace persist creates and deletes secret in atomic batch', async () => {
    let batchCreateCalled = false, batchCreateExtraRef = null, batchCreateExtraData = null;
    let batchDeleteCalled = false, batchDeleteExtraRef = null;

    const ctx = createStoreContext({
        role: 'owner',
        user: { uid: 'owner-1' },
        activeWorkspace: 'ws-team'
    });

    ctx.root.CollabWorkspaces = {
        batchCreateDoc: async (db, docRef, data, wsId, extraSetRef, extraSetData) => {
            batchCreateCalled = true;
            batchCreateExtraRef = extraSetRef;
            batchCreateExtraData = extraSetData;
            const b = db.batch();
            b.set(docRef, data);
            if (extraSetRef && extraSetData) b.set(extraSetRef, extraSetData);
            await b.commit();
        },
        batchDeleteDoc: async (db, docId, wsId, extraDeleteRef) => {
            batchDeleteCalled = true;
            batchDeleteExtraRef = extraDeleteRef;
            const b = db.batch();
            b.delete(db.collection('documents').doc(docId));
            if (extraDeleteRef) b.delete(extraDeleteRef);
            await b.commit();
        }
    };

    const newCred = {
        id: 'cred-ws',
        title: 'WS Cred',
        category: 'credential',
        password: 'ws-password-123',
        workspaceId: 'ws-team'
    };

    await ctx.CollabStore.persist([newCred]);
    assert.equal(batchCreateCalled, true, 'batchCreateDoc must be invoked for non-default workspace');
    assert.ok(batchCreateExtraRef, 'batchCreateDoc must receive secret extraSetRef');
    assert.equal(batchCreateExtraData.password, 'ws-password-123', 'Secret data must contain password');
    assert.equal(ctx.store.get('cred-ws/secrets/credential')?.password, 'ws-password-123');

    // Test delete in non-default workspace
    ctx.documents = [];
    await ctx.CollabStore.persist([]);
    assert.equal(batchDeleteCalled, true, 'batchDeleteDoc must be invoked for non-default workspace delete');
    assert.ok(batchDeleteExtraRef, 'batchDeleteDoc must receive secret extraDeleteRef');
    assert.equal(ctx.store.has('cred-ws'), false);
    assert.equal(ctx.store.has('cred-ws/secrets/credential'), false);
});

