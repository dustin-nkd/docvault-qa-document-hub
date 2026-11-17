import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const rootDir = process.cwd();
const read = (file) => fs.readFileSync(path.join(rootDir, file), 'utf8');

test('Stage 3 (3.7 & 3.6): CollabViewer blocks moveDocStatus, moveCardToColumn, and filters rejections only for viewers', () => {
    const viewerCode = read('js/collab-viewer.js');

    let currentRole = 'viewer';
    const ctx = {
        COLLAB_MODE: true,
        CollabBootstrap: {
            getCurrentMember: () => ({ role: currentRole })
        },
        document: {
            querySelectorAll: () => [],
            getElementById: () => null,
            addEventListener: () => {}
        },
        addEventListener: () => {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(viewerCode, ctx);

    // 3.7: moveDocStatus and moveCardToColumn must be in VIEWER_BLOCKED_RE
    assert.ok(ctx.CollabViewer.VIEWER_BLOCKED_RE.test('moveDocStatus("doc-1", "review")'), 'moveDocStatus must be matched by VIEWER_BLOCKED_RE');
    assert.ok(ctx.CollabViewer.VIEWER_BLOCKED_RE.test('moveCardToColumn("doc-1", "review")'), 'moveCardToColumn must be matched by VIEWER_BLOCKED_RE');

    // 3.6: filterPermissionError only stops propagation for viewer
    let stopped = false;
    const fakeEvent = {
        reason: { code: 'permission-denied', message: 'Missing or insufficient permissions' },
        stopImmediatePropagation: () => { stopped = true; },
        stopPropagation: () => { stopped = true; },
        preventDefault: () => {}
    };

    currentRole = 'editor';
    ctx.CollabViewer.filterPermissionError(fakeEvent);
    assert.equal(stopped, false, 'Editor permission-denied must not be swallowed');

    currentRole = 'viewer';
    ctx.CollabViewer.filterPermissionError(fakeEvent);
    assert.equal(stopped, true, 'Viewer permission-denied must be swallowed cleanly');
});

test('Stage 3 (3.10): Modal stacking allows nested modals when stack:true, while preserving in-place replace flows', () => {
    const uiCode = read('js/ui.js');

    const modalEl = {
        className: 'fixed inset-0 z-[90] hidden',
        innerHTML: '',
        classList: {
            contains: (cls) => modalEl.className.includes(cls)
        },
        querySelector: () => null,
        querySelectorAll: () => []
    };

    const docMock = {
        getElementById: (id) => (id === 'modal' ? modalEl : null),
        activeElement: { focus: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
        contains: () => true
    };

    const ctx = {
        Element: class Element {},
        document: docMock,
        console: { error: () => {}, log: () => {} },
        addEventListener: () => {},
        removeEventListener: () => {},
        enhanceInteractionSemantics: () => {}
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(uiCode, ctx);

    // 1. In-place replace flow (e.g. share spinner -> result): stack remains empty
    ctx.showModal('<h1>Spinner</h1>');
    assert.ok(modalEl.innerHTML.includes('Spinner'));
    ctx.showModal('<h1>Result Link</h1>'); // replace without stack: true
    assert.ok(modalEl.innerHTML.includes('Result Link'));
    assert.equal(ctx._modalStack.length, 0, 'In-place replace must not push to _modalStack');
    ctx.closeModal();
    assert.ok(modalEl.className.includes('hidden'));

    // 2. Nested modal flow with stack: true (e.g. History -> Diff)
    ctx.showModal('<h1>Document History</h1>');
    assert.ok(modalEl.innerHTML.includes('Document History'));
    assert.equal(ctx._modalStack.length, 0);

    ctx.showModal('<h2>Snapshot Diff</h2>', { stack: true });
    assert.ok(modalEl.innerHTML.includes('Snapshot Diff'));
    assert.equal(ctx._modalStack.length, 1);
    assert.ok(ctx._modalStack[0].html.includes('Document History'));

    // Close Diff -> restores History
    ctx.closeModal();
    assert.ok(modalEl.innerHTML.includes('Document History'));
    assert.equal(ctx._modalStack.length, 0);
    assert.ok(!modalEl.className.includes('hidden'));

    // Close History -> completely closed
    ctx.closeModal();
    assert.ok(modalEl.className.includes('hidden'));

    // 3. closeModal(true) closes all stacked modals
    ctx.showModal('<h1>Base</h1>');
    ctx.showModal('<h2>Sub 1</h2>', { stack: true });
    ctx.showModal('<h3>Sub 2</h3>', { stack: true });
    assert.equal(ctx._modalStack.length, 2);
    ctx.closeModal(true);
    assert.equal(ctx._modalStack.length, 0);
    assert.ok(modalEl.className.includes('hidden'));
});

test('Stage 3 (3.1): showSnapshotDiff stacks modal and restoreSnapshot restores data', async () => {
    const historyCode = read('js/actions-batch-history.js');

    const remoteSnaps = [
        { ts: 1000, title: 'Remote V1', content: 'Original content', status: 'draft', savedByName: 'Alice' }
    ];

    let persisted = false;
    let modalStackOption = null;
    let closedAll = false;
    const testDoc = { id: 'doc-1', title: 'Current V2', content: 'Modified content', status: 'published', tags: [] };

    const ctx = {
        COLLAB_MODE: true,
        _lastLoadedHistoryDocId: 'doc-1',
        _lastLoadedHistorySnaps: remoteSnaps,
        documents: [testDoc],
        state: { editingDoc: null },
        DocHistory: {
            get: () => {
                throw new Error('Should not read stale DocHistory.get when _lastLoadedHistorySnaps exists');
            },
            save: () => {}
        },
        showModal: (html, opts) => {
            ctx.lastModalHtml = html;
            modalStackOption = opts?.stack;
        },
        closeModal: (all) => { if (all) closedAll = true; },
        toast: () => {},
        persist: async () => { persisted = true; },
        render: () => {},
        actionAttr: (fn, ...args) => `${fn}(${args.join(',')})`,
        escHtml: (s) => s,
        _diffLines: (a, b) => [{ type: 'del', value: a }, { type: 'add', value: b }],
        _buildDiffHtml: () => '<div>diff</div>'
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(historyCode, ctx);

    // 1. showSnapshotDiff uses remote snapshot and passes stack: true
    ctx.showSnapshotDiff('doc-1', 0);
    assert.ok(ctx.lastModalHtml.includes('Snapshot Diff'));
    assert.ok(ctx.lastModalHtml.includes('Alice'));
    assert.equal(modalStackOption, true, 'showSnapshotDiff must pass stack: true');

    // 2. restoreSnapshot uses remote snapshot, calls closeModal(true), and persists
    await ctx.restoreSnapshot('doc-1', 0);
    assert.equal(ctx.documents[0].title, 'Remote V1');
    assert.equal(ctx.documents[0].content, 'Original content');
    assert.equal(closedAll, true, 'restoreSnapshot must close all stacked modals');
    assert.equal(persisted, true);
});

test('Stage 3 (3.2): Collab Mode hydrate runs cleanOrphanedDocReferences without stripping cross-workspace docs', async () => {
    const stateCode = read('js/state.js');

    let cleanedWithExistingIds = 'not_called';
    const testDocs = [
        { id: 'run-1', category: 'testrun', runData: { targetIds: ['tc-in-other-ws'] } }
    ];

    const ctx = {
        COLLAB_MODE: true,
        CollabStore: {
            loadDocuments: async () => testDocs
        },
        normalizeDocTags: () => {},
        DocStorage: {
            cleanOrphanedDocReferences: (docs, del, existingIds) => {
                cleanedWithExistingIds = existingIds;
                return false;
            }
        },
        state: {},
        documents: []
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(stateCode, ctx);

    await ctx.hydrate();
    assert.equal(cleanedWithExistingIds, undefined, 'Collab Mode hydrate must not pass workspace activeIds as existingIds filter');
});

test('Stage 3 (3.3): removeMember revokes pending invite for member email', async () => {
    const membersCode = read('js/collab-members.js');

    const deletedDocs = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({ email: 'bob@team.com', role: 'editor', uid: 'u-bob' })
                }),
                delete: async () => { deletedDocs.push(`${col}/${id}`); }
            })
        })
    };

    const ctx = {
        COLLAB_MODE: true,
        firebase: {
            firestore: () => mockDb
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ role: 'owner', uid: 'u-owner' })
        },
        toast: () => {},
        document: { getElementById: () => null }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(membersCode, ctx);

    const success = await ctx.CollabMembers.removeMember('u-bob');
    assert.equal(success, true);
    assert.ok(deletedDocs.includes('members/u-bob'), 'members/u-bob must be deleted');
    assert.ok(deletedDocs.includes('invites/bob@team.com'), 'invites/bob@team.com must be deleted');
});

test('Stage 3 (3.4 & Low 2): Comments byte limit, mention notifications on edit, thread tombstones & orphan protection', async () => {
    const commentsCode = read('js/collab-comments.js');

    const updatedDocs = [];
    const deletedDocs = [];

    const mockDb = {
        collection: (col) => ({
            doc: (docId) => ({
                collection: (subCol) => ({
                    doc: (cmtId) => ({
                        set: async (payload) => { updatedDocs.push({ action: 'set', payload }); },
                        get: async () => ({
                            exists: true,
                            data: () => ({
                                id: cmtId,
                                authorUid: 'u-alice',
                                mentions: ['u-existing'],
                                content: 'Old comment'
                            })
                        }),
                        update: async (data) => { updatedDocs.push({ action: 'update', data }); },
                        delete: async () => { deletedDocs.push(cmtId); }
                    }),
                    where: (field, op, val) => ({
                        limit: () => ({
                            get: async () => {
                                if (val === 'cmt-query-error') throw new Error('Network error on reply check');
                                return { empty: val === 'cmt-has-replies' ? false : true };
                            }
                        })
                    })
                })
            })
        })
    };

    const ctx = {
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'u-alice', displayName: 'Alice', email: 'alice@team.com' })
        },
        firebase: {
            auth: () => ({ currentUser: { uid: 'u-alice' } })
        },
        TextEncoder,
        documents: [{ id: 'doc-1', title: 'Test Document' }],
        console: { warn: () => {}, log: () => {} }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(commentsCode, ctx);

    ctx.CollabComments.init(mockDb, { uid: 'u-alice' }, { uid: 'u-alice', role: 'editor' });

    // 1. Low 2: 4001 bytes of content must be rejected
    const longString = 'a'.repeat(4001);
    await assert.rejects(
        async () => ctx.CollabComments.addComment('doc-1', { content: longString }),
        /between 1 and 4000 characters/
    );

    // 2. Item 3.4: updateComment with new mentions
    const updateResult = await ctx.CollabComments.updateComment('doc-1', 'cmt-1', {
        content: 'Hey @[Bob](u-bob)!',
        mentions: ['u-existing', 'u-bob']
    });
    assert.ok(updateResult);
    assert.equal(updateResult.content, 'Hey @[Bob](u-bob)!');

    // 3. Item 3.4: deleteComment tombstones when replies exist
    await ctx.CollabComments.deleteComment('doc-1', 'cmt-has-replies');
    const tombstone = updatedDocs.find(d => d.action === 'update' && d.data.isDeleted === true);
    assert.ok(tombstone, 'Comment with replies must be tombstoned');
    assert.equal(tombstone.data.content, '[This comment has been deleted]');

    // 4. deleteComment safely aborts and does NOT hard delete if reply query fails
    await assert.rejects(
        async () => ctx.CollabComments.deleteComment('doc-1', 'cmt-query-error'),
        /Network error on reply check/
    );
    assert.ok(!deletedDocs.includes('cmt-query-error'), 'Comment must not be deleted if reply check query fails');

    // 5. deleteComment hard-deletes when no replies exist
    await ctx.CollabComments.deleteComment('doc-1', 'cmt-no-replies');
    assert.ok(deletedDocs.includes('cmt-no-replies'), 'Comment without replies must be deleted');

    // 6. buildCommentTree creates placeholder parent for orphaned replies instead of promoting them to roots
    const tree = ctx.CollabComments.buildCommentTree([
        { id: 'reply-1', parentId: 'deleted-parent', content: 'Orphan reply', createdAt: 200 }
    ]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].id, 'deleted-parent');
    assert.equal(tree[0].isDeleted, true);
    assert.equal(tree[0].replies.length, 1);
    assert.equal(tree[0].replies[0].id, 'reply-1');
});

test('Stage 3 (Low 5): Activity record generates unique actId with random suffix', async () => {
    const storeCode = read('js/collab-store.js');

    const recordedPayloads = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (payload) => { recordedPayloads.push(payload); }
            })
        })
    };

    const ctx = {
        COLLAB_MODE: true,
        CollabBootstrap: {
            getCurrentMember: () => ({ role: 'editor', uid: 'u-1', email: 'ed@test.com' })
        },
        firebase: {
            firestore: () => mockDb,
            auth: () => ({ currentUser: { uid: 'u-1', email: 'ed@test.com' } })
        },
        console: { warn: () => {}, log: () => {} }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(storeCode, ctx);

    await ctx.CollabStore.recordActivity({ type: 'updated' }, { id: 'doc-1', title: 'Test' });
    assert.equal(recordedPayloads.length, 1);
    const actId = recordedPayloads[0].id;
    assert.match(actId, /^act_\d+_[a-z0-9]+$/, 'Activity ID must contain timestamp and random suffix');
});

test('Stage 3 (3.8): sw.js caches collab-viewer.js and collab-workspaces.js in APP_SHELL', () => {
    const swCode = read('sw.js');
    assert.ok(swCode.includes("'./js/collab-viewer.js'"), 'APP_SHELL must include collab-viewer.js');
    assert.ok(swCode.includes("'./js/collab-workspaces.js'"), 'APP_SHELL must include collab-workspaces.js');
    assert.ok(swCode.includes("!url.searchParams.has('shareId')"), 'Fetch handler must avoid caching shareId query URLs');
});
