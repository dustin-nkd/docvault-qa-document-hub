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

test('Stage 2 (2.4): saveDoc does not toast success or switch to viewer when persist fails or conflicts', async () => {
    const actDocCode = read('js/actions-documents.js');

    const toasts = [];
    let state = {
        view: 'editor',
        editingDoc: { id: 'doc-1', title: 'Old Title', content: 'Old Content', category: 'general', status: 'active', tags: [] },
        editorTags: []
    };
    let docs = [{ ...state.editingDoc }];

    let persistCalled = false;
    let persistConflict = false;
    let lastConflict = null;
    let actRecorded = false;

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
        ActivityLog: { record: () => { actRecorded = true; } },
        CollabStore: {
            clearLastConflict: () => { lastConflict = null; },
            getLastConflict: () => lastConflict
        },
        persist: async () => {
            persistCalled = true;
            if (persistConflict) {
                // In production CollabStore.persist, conflict does NOT throw; it sets lastConflict
                lastConflict = 'Someone else saved this document.';
            }
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(actDocCode, ctx);

    // 1. Save when persist hits version conflict (does not throw, but sets CollabStore conflict)
    persistConflict = true;
    await ctx.saveDoc();
    assert.equal(persistCalled, true);
    assert.equal(toasts.some(t => t.msg === 'docUpdated'), false, 'Must NOT toast success when conflict occurs');
    assert.equal(state.view, 'editor', 'Must stay in editor view when conflict occurs');
    assert.equal(actRecorded, false, 'ActivityLog must NOT be recorded on conflict');

    // 2. Save when document was vanished remotely and revived
    persistConflict = false;
    state.editingDoc = { id: 'doc-vanished', title: 'Vanished Doc', content: 'Edits', category: 'general', status: 'active', tags: [] };
    // Not present in documents array
    docs.length = 0;
    toasts.length = 0;
    actRecorded = false;

    await ctx.saveDoc();
    assert.ok(toasts.some(t => t.type === 'info' && t.msg.includes('saved as a new copy')), 'Revived doc must toast info note');
    assert.equal(state.view, 'viewer');
    assert.equal(actRecorded, true);
});

test('Stage 2 (2.5): Workspaces batchCreateDoc and batchDeleteDoc retry on contention and are idempotent', async () => {
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
    let createAttempts = 0;
    let deleteAttempts = 0;
    let createdDocExists = false;

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                id,
                get: async () => ({
                    exists: col === 'workspaces' ? true : createdDocExists,
                    data: () => ({ docCount: docCountInFirestore })
                })
            })
        }),
        batch: () => {
            let lastUpdateData = null;
            let isSet = false, isDel = false;
            return {
                set: () => { isSet = true; },
                delete: () => { isDel = true; },
                update: (ref, data) => { lastUpdateData = data; },
                commit: async () => {
                    if (lastUpdateData?.lastDocId) {
                        createAttempts++;
                        if (createAttempts === 1) {
                            docCountInFirestore = 6;
                            const err = new Error('Permission denied: docCount mismatch');
                            err.code = 'permission-denied';
                            throw err;
                        }
                        if (isSet) createdDocExists = true;
                        assert.equal(lastUpdateData.docCount, 7);
                    } else if (lastUpdateData?.lastDeletedDocId) {
                        deleteAttempts++;
                        if (deleteAttempts === 1) {
                            docCountInFirestore = 6;
                            const err = new Error('Permission denied: docCount mismatch on delete');
                            err.code = 'permission-denied';
                            throw err;
                        }
                        if (isDel) createdDocExists = false;
                        assert.equal(lastUpdateData.docCount, 5);
                    }
                }
            };
        }
    };

    ctx.CollabWorkspaces.setRemoteWorkspaces([{ id: 'ws-test', name: 'Test WS', docCount: 5 }]);
    await ctx.CollabWorkspaces.batchCreateDoc(mockDb, mockDb.collection('documents').doc('doc-new'), { id: 'doc-new' }, 'ws-test');
    assert.equal(createAttempts, 2, 'batchCreateDoc retried and succeeded on attempt 2');

    // Test batchDeleteDoc retry
    await ctx.CollabWorkspaces.batchDeleteDoc(mockDb, 'doc-new', 'ws-test');
    assert.equal(deleteAttempts, 2, 'batchDeleteDoc retried and succeeded on attempt 2');
});

test('Stage 2 (2.6): CollabImport bumps counters/bugs.next atomically before docs, accounts for retry', async () => {
    const importCode = read('js/collab-import.js');
    let counterDoc = { next: 10 };
    let updatedNext = null;
    let counterFail = false;

    const mockDb = {
        collection: (col) => ({
            get: async () => ({
                docs: [{ id: 'b-old' }],
                forEach: (fn) => [{ id: 'b-old' }].forEach(fn)
            }),
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => counterDoc
                }),
                set: async (d) => { counterDoc = d; },
                update: async (d) => {
                    if (counterFail) throw new Error('Counter update failed in transaction');
                    updatedNext = d.next;
                    counterDoc.next = d.next;
                },
                collection: () => ({ doc: () => ({ set: async () => {} }) })
            })
        }),
        batch: () => ({ set: () => {}, commit: async () => {} })
    };

    const localDocs = [
        { id: 'b-old', title: 'Old Bug 15', category: 'bug', bugNumber: 15, workspaceId: 'default' },
        { id: 'b-new', title: 'New Bug 30', category: 'bug', bugNumber: 30, workspaceId: 'default' }
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

    // 1. Counter update failure must throw and NOT be swallowed
    counterFail = true;
    await assert.rejects(
        () => ctx.CollabImport.importLocalVault({ documents: localDocs }),
        /Counter update failed/,
        'Import must fail if counter cannot be updated'
    );

    // 2. On retry, maxBugNumber across all localDocs (including b-old with bugNumber 15) must bump counter
    counterFail = false;
    await ctx.CollabImport.importLocalVault({ documents: localDocs });
    assert.equal(updatedNext, 30, 'Counter must be bumped to highest bugNumber (30)');
    assert.equal(counterDoc.next, 30);
});

test('Stage 2 (2.8): CollabActivity clearActivityLog chunks deletes in batches of <= 400', async () => {
    const actCode = read('js/collab-activity.js');

    const batchesCommitted = [];
    let currentBatchOps = [];

    const mockDb = {
        collection: (col) => ({
            get: async () => {
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
