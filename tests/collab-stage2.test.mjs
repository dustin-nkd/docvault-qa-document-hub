import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = process.cwd();
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');

test('Stage 2 (2.3): Secondary tab failed-precondition does not crash initTeamUser', async () => {
    let warned = [];
    const origWarn = console.warn;
    console.warn = (...args) => { warned.push(args.join(' ')); };

    try {
        const storeCode = read('js/collab-store.js');
        const bootCode = read('js/collab-bootstrap.js');

        const mockDb = {
            enablePersistence: async () => {
                const err = new Error('IndexedDB locked by primary tab');
                err.code = 'failed-precondition';
                throw err;
            },
            collection: (col) => ({
                doc: (id) => ({
                    get: async () => ({
                        exists: true,
                        data: () => (col === 'meta' ? { ownerUid: 'u-1', initialized: true } : { uid: 'u-1', role: 'owner' })
                    })
                })
            })
        };

        const ctx = {
            window: {},
            globalThis: {},
            COLLAB_MODE: true,
            firebase: { firestore: () => mockDb },
            console: { warn: console.warn, log: () => {}, error: () => {} },
            document: {
                getElementById: () => ({ classList: { add: () => {}, remove: () => {} } }),
                createElement: () => ({})
            }
        };
        ctx.window = ctx;
        ctx.globalThis = ctx;
        vm.createContext(ctx);

        vm.runInContext(storeCode, ctx);

        // CollabStore.enableOfflinePersistence must resolve on failed-precondition
        await ctx.CollabStore.enableOfflinePersistence(mockDb);
        assert.ok(warned.some(w => w.includes('failed-precondition')), 'Logged warning about secondary tab');

        vm.runInContext(bootCode, ctx);
        const res = await ctx.CollabBootstrap.initTeamUser({ uid: 'u-1', email: 'owner@test.com' });
        assert.equal(res.status, 'member', 'Secondary tab must successfully initialize as member');
        assert.equal(res.member.role, 'owner');
    } finally {
        console.warn = origWarn;
    }
});

test('Stage 2 (2.4): saveDoc does not toast success or switch to viewer when persist fails', async () => {
    const actDocCode = read('js/actions-documents.js');

    const toasts = [];
    let state = {
        view: 'editor',
        editingDoc: { id: 'doc-1', title: 'Old Title', content: 'Old Content', category: 'general', status: 'active', tags: [] },
        editorTags: []
    };
    let docs = [{ ...state.editingDoc }];

    let persistCalled = false;
    let persistShouldFail = true;

    const ctx = {
        window: {},
        globalThis: {},
        state,
        documents: docs,
        setTimeout: globalThis.setTimeout,
        requestAnimationFrame: (fn) => fn(),
        t: (k) => k,
        toast: (msg, type) => toasts.push({ msg, type }),
        uid: () => 'new-uid',
        _appUrl: (id) => `?doc=${id}`,
        history: { replaceState: () => {} },
        render: () => {},
        getEditorMarkdown: () => 'Attempted Edit Content',
        document: {
            getElementById: (id) => {
                if (id === 'ed-title') return { value: 'New Title' };
                if (id === 'ed-subfolder') return { value: '' };
                if (id === 'ed-cat') return { value: 'general' };
                if (id === 'ed-status') return { value: 'active' };
                return null;
            },
            querySelectorAll: () => []
        },
        DocHistory: { save: () => {} },
        ActivityLog: { record: () => {} },
        persist: async () => {
            persistCalled = true;
            if (persistShouldFail) throw new Error('Network error or conflict');
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(actDocCode, ctx);

    // Save when persist fails
    await ctx.saveDoc();
    assert.equal(persistCalled, true);
    assert.equal(toasts.some(t => t.msg === 'docUpdated'), false, 'Must NOT toast success when persist fails');
    assert.equal(state.view, 'editor', 'Must stay in editor view when persist fails');

    // Save when persist succeeds
    persistShouldFail = false;
    await ctx.saveDoc();
    assert.ok(toasts.some(t => t.msg === 'docUpdated'), 'Must toast success when persist succeeds');
    assert.equal(state.view, 'viewer', 'Must switch to viewer view when persist succeeds');
});

test('Stage 2 (2.5): Workspaces batchCreateDoc retries on contention and succeeds', async () => {
    const wsCode = read('js/collab-workspaces.js');
    const ctx = {
        window: {},
        globalThis: {},
        setTimeout: globalThis.setTimeout,
        document: { querySelectorAll: () => [] }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(wsCode, ctx);

    let docCountInFirestore = 5;
    let commitAttempts = 0;

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({ docCount: docCountInFirestore })
                })
            })
        }),
        batch: () => {
            let lastUpdateData = null;
            return {
                set: () => {},
                update: (ref, data) => { lastUpdateData = data; },
                commit: async () => {
                    commitAttempts++;
                    if (commitAttempts === 1) {
                        // Simulate concurrent commit from another client
                        docCountInFirestore = 6;
                        const err = new Error('Permission denied: docCount mismatch');
                        err.code = 'permission-denied';
                        throw err;
                    }
                    // Second attempt succeeds with new docCount (7)
                    assert.equal(lastUpdateData.docCount, 7);
                }
            };
        }
    };

    ctx.CollabWorkspaces.setRemoteWorkspaces([{ id: 'ws-test', name: 'Test WS', docCount: 5 }]);
    await ctx.CollabWorkspaces.batchCreateDoc(mockDb, { id: 'doc-new' }, { id: 'doc-new' }, 'ws-test');
    assert.equal(commitAttempts, 2, 'Must have retried and succeeded on attempt 2');
});

test('Stage 2 (2.6): CollabImport bumps counters/bugs.next when maxBugNumber is higher', async () => {
    const importCode = read('js/collab-import.js');
    let counterDoc = { next: 10 };
    let updatedNext = null;

    const mockDb = {
        collection: (col) => ({
            get: async () => ({ docs: [], forEach: () => {} }),
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => counterDoc
                }),
                set: async (d) => { counterDoc = d; },
                update: async (d) => { updatedNext = d.next; counterDoc.next = d.next; },
                collection: () => ({ doc: () => ({ set: async () => {} }) })
            })
        }),
        batch: () => ({ set: () => {}, commit: async () => {} })
    };

    const localDocs = [
        { id: 'b1', title: 'Bug 25', category: 'bug', bugNumber: 25, workspaceId: 'default' }
    ];

    const ctx = {
        window: {},
        globalThis: {},
        COLLAB_MODE: true,
        localStorage: {
            getItem: (k) => (k === 'docvault_docs' ? JSON.stringify(localDocs) : null),
            setItem: () => {}
        },
        console: { warn: () => {}, log: () => {} },
        CollabBootstrap: {
            getCurrentMember: () => ({ role: 'owner' })
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(importCode, ctx);

    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    await ctx.CollabImport.importLocalVault({ documents: localDocs });
    assert.equal(updatedNext, 25, 'Counter must be bumped to 25');
    assert.equal(counterDoc.next, 25);
});

test('Stage 2 (2.8): CollabActivity clearActivityLog chunks deletes in batches of <= 400', async () => {
    const actCode = read('js/collab-activity.js');

    const batchesCommitted = [];
    let currentBatchOps = [];

    const mockDb = {
        collection: (col) => ({
            get: async () => {
                // Generate 650 activity records
                const docs = [];
                for (let i = 1; i <= 650; i++) docs.push({ id: `act-${i}` });
                return {
                    docs,
                    forEach: (fn) => docs.forEach(fn)
                };
            },
            doc: (id) => ({ id })
        }),
        batch: () => {
            currentBatchOps = [];
            return {
                delete: (ref) => currentBatchOps.push(ref.id),
                commit: async () => {
                    batchesCommitted.push([...currentBatchOps]);
                }
            };
        }
    };

    const ctx = {
        window: {},
        globalThis: {},
        COLLAB_MODE: true,
        CollabBootstrap: { getCurrentMember: () => ({ role: 'owner' }) },
        clearActivityLog: () => {},
        closeModal: () => {},
        toast: () => {},
        renderContent: () => {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(actCode, ctx);

    ctx.CollabActivity.setDb(mockDb);
    await ctx.clearActivityLog();

    assert.equal(batchesCommitted.length, 2, '650 records must be split into 2 batches');
    assert.equal(batchesCommitted[0].length, 400, 'Batch 1 must contain exactly 400 deletes');
    assert.equal(batchesCommitted[1].length, 250, 'Batch 2 must contain remaining 250 deletes');
});
