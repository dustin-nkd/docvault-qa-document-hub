import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, loadStorage, toPlain } from './harness.mjs';

test('hydrate migrates legacy categories, bug numbers, and lifecycle exactly once', async () => {
    const savedDocs = [
        { id: 'onboarding-1', category: 'onboarding', subfolder: '', createdAt: 10, updatedAt: 20 },
        { id: 'meeting-1', category: 'meeting', subfolder: 'Existing', createdAt: 11, updatedAt: 21 },
        { id: 'bug-existing', category: 'bug', bugNumber: 7, bugStatus: 'closed', createdAt: 200, updatedAt: 250, bugStatusEvents: [{ type: 'status_changed', from: null, to: 'closed', ts: 250 }] },
        { id: 'bug-older', category: 'bug', bugStatus: 'open', createdAt: 100, updatedAt: 150 },
        { id: 'bug-newer', category: 'bug', bugStatus: 'new', createdAt: 300, updatedAt: 300 }
    ];
    const harness = loadState({
        savedDocs,
        localStorage: {
            firebase_config: 'legacy',
            e2ee_api_key: 'legacy',
            e2ee_bin_id: 'legacy'
        },
        sessionStorage: { e2ee_master_password: 'legacy' }
    });

    await harness.api.hydrate();
    const docs = toPlain(harness.api.getDocuments());
    const byId = Object.fromEntries(docs.map((doc) => [doc.id, doc]));

    assert.equal(byId['onboarding-1'].category, 'knowledge');
    assert.equal(byId['onboarding-1'].subfolder, 'Onboarding');
    assert.equal(byId['meeting-1'].category, 'knowledge');
    assert.equal(byId['meeting-1'].subfolder, 'Existing');
    assert.equal(byId['bug-existing'].bugNumber, 7);
    assert.equal(byId['bug-older'].bugNumber, 8);
    assert.equal(byId['bug-newer'].bugNumber, 9);
    assert.equal(byId['bug-older'].bugStatusEvents.length, 2);
    assert.equal(byId['bug-older'].bugStatusEvents.every((event) => event.estimated === true), true);
    assert.equal(harness.calls.save, 1);
    assert.equal(harness.localStorage.getItem('firebase_config'), null);
    assert.equal(harness.localStorage.getItem('e2ee_api_key'), null);
    assert.equal(harness.sessionStorage.getItem('e2ee_master_password'), null);

    await harness.api.hydrate();
    assert.equal(harness.calls.save, 1);
});

test('guest hydrate remains isolated from real storage and clones demo fixtures', async () => {
    const guestDocs = [{ id: 'demo-1', category: 'knowledge', title: 'Demo' }];
    const harness = loadState({ guest: true, guestDocs });
    await harness.api.hydrate();
    assert.equal(harness.calls.getSettings, 0);
    assert.equal(harness.calls.getAll, 0);
    assert.equal(harness.calls.save, 0);
    harness.api.getDocuments()[0].title = 'Changed in session';
    assert.equal(guestDocs[0].title, 'Demo');
});

test('document merge respects deleted ids and the newest content or workflow version', () => {
    const { api } = loadStorage();
    const local = [
        { id: 'local-only', updatedAt: 10 },
        { id: 'remote-newer', updatedAt: 10, title: 'Local old' },
        { id: 'focus-newer-local', updatedAt: 100, focusWorkflowUpdatedAt: 500, owner: 'Local' },
        { id: 'equal-version', updatedAt: 20, title: 'Local wins tie' },
        { id: 'deleted', updatedAt: 999 }
    ];
    const remote = [
        { id: 'remote-newer', updatedAt: 11, title: 'Remote new' },
        { id: 'focus-newer-local', updatedAt: 400, focusWorkflowUpdatedAt: 0, owner: 'Remote' },
        { id: 'equal-version', updatedAt: 20, title: 'Remote tie' },
        { id: 'remote-only', updatedAt: 1 },
        { id: 'deleted', updatedAt: 1000 }
    ];
    const merged = toPlain(api.DocStorage._merge(local, remote, new Set(['deleted'])));
    const byId = Object.fromEntries(merged.map((doc) => [doc.id, doc]));

    assert.deepEqual(Object.keys(byId).sort(), ['equal-version', 'focus-newer-local', 'local-only', 'remote-newer', 'remote-only']);
    assert.equal(byId['remote-newer'].title, 'Remote new');
    assert.equal(byId['focus-newer-local'].owner, 'Local');
    assert.equal(byId['equal-version'].title, 'Local wins tie');
});

test('activity log merge deduplicates ids, keeps local collision, and sorts newest first', () => {
    const { api } = loadState();
    const local = [
        { id: 'same', ts: 5, title: 'Local collision' },
        { id: 'local', ts: 3 }
    ];
    const remote = [
        { id: 'same', ts: 10, title: 'Remote collision' },
        { id: 'remote', ts: 8 }
    ];
    const merged = toPlain(api.ActivityLog.merge(local, remote));
    assert.deepEqual(merged.map((entry) => entry.id), ['remote', 'same', 'local']);
    assert.equal(merged.find((entry) => entry.id === 'same').title, 'Local collision');
});
test('pending sync state survives reload and clears after recovery', () => {
    const first = loadStorage();
    first.api.DocStorage.setPendingSync(true);
    assert.equal(first.localStorage.getItem(first.api.DocStorage.PENDING_SYNC_KEY), '1');
    assert.equal(first.api.DocStorage.hasPendingSync(), true);

    const reloaded = loadStorage({ localStorage: first.localStorage.dump() });
    assert.equal(reloaded.api.DocStorage._pending, false);
    assert.equal(reloaded.api.DocStorage.hasPendingSync(), true);
    reloaded.api.DocStorage.setPendingSync(false);
    assert.equal(reloaded.api.DocStorage.hasPendingSync(), false);
    assert.equal(reloaded.localStorage.getItem(reloaded.api.DocStorage.PENDING_SYNC_KEY), null);
});

test('quota errors in history and activity logging do not interrupt document workflows', () => {
    const harness = loadState({ console: { warn() {}, error() {}, log() {} } });
    const quotaError = Object.assign(new Error('Storage full'), { name: 'QuotaExceededError' });
    harness.localStorage.setItem = () => { throw quotaError; };

    assert.doesNotThrow(() => harness.api.DocHistory.save({ id: 'doc-1', title: 'Title', content: 'Body', tags: [] }));
    assert.doesNotThrow(() => harness.api.ActivityLog.record('updated', { id: 'doc-1', title: 'Title', category: 'knowledge' }));
    assert.doesNotThrow(() => harness.api.ActivityLog.mergeIncoming([{ id: 'remote-1', ts: 1 }]));
});

test('resurrected documents survive sync pull and clear tombstones locally and remotely', async () => {
    const { api, localStorage } = loadStorage();
    const storage = api.DocStorage;
    const sync = api.GitHubSync;

    await storage.addDeletedIds(['doc-1', 'doc-2']);
    assert.deepEqual([...storage._getLocalDeletedIds()].sort(), ['doc-1', 'doc-2']);

    await storage.removeDeletedIds(['doc-1']);
    await storage.addResurrectedIds(['doc-1']);
    assert.deepEqual([...storage._getLocalDeletedIds()], ['doc-2']);
    assert.deepEqual([...storage._getLocalResurrectedIds()], ['doc-1']);

    const restoredDoc = { id: 'doc-1', title: 'Restored from Backup', category: 'knowledge', updatedAt: 2000 };
    await storage._saveLocal([restoredDoc]);

    sync.isConfigured = async () => true;
    sync.syncPull = async () => ({
        docs: [],
        deletedIds: ['doc-1', 'doc-2']
    });

    const fresh = await storage.getAll();
    assert.ok(fresh.some(d => d.id === 'doc-1'), 'Restored doc must NOT be swallowed by remote deletedIds tombstone');
    assert.ok(!storage._getLocalDeletedIds().has('doc-1'), 'Local deletedIds must not re-acquire resurrected doc-1');
    assert.ok(storage._getLocalDeletedIds().has('doc-2'), 'Local deletedIds must retain legitimately deleted doc-2');

    sync.SHARD_COUNT = 1;
    sync.getSettings = async () => ({ owner: 'o', repo: 'r', branch: 'main', token: 't' });
    sync._prepDocsForShards = async docs => docs;
    sync._applySecurityMeta = () => {};
    localStorage.setItem(sync.SHARD_FP_PREFIX + '0', '');
    let pushedMeta = null;
    sync._putWithMerge = async (path, settings, shaKey, pwd, payload) => {
        if (path.includes('vault-meta')) pushedMeta = payload;
        return { payload, merged: false };
    };

    await sync.pushSharded([restoredDoc], {});
    assert.ok(pushedMeta, 'Meta must be written');
    assert.deepEqual(toPlain(pushedMeta.deletedIds), ['doc-2'], 'Remote meta must exclude resurrected doc-1');
    assert.equal(storage._getLocalResurrectedIds().size, 0, 'Resurrected IDs must be cleared after push');
});

test('document merge preserves bug lifecycle events and resolution history across concurrent updates', () => {
    const { api } = loadStorage();

    const localBug = {
        id: 'bug-100',
        category: 'bug',
        title: 'Title updated on Device A',
        bugStatus: 'open',
        updatedAt: 500,
        bugStatusEvents: [
            { type: 'status_changed', from: null, to: 'new', ts: 100 },
            { type: 'status_changed', from: 'new', to: 'open', ts: 200 }
        ],
        bugData: {
            resolutionHistory: [{ resolution: 'Fixed', duplicateOf: '', clearedAt: 150 }]
        }
    };

    const remoteBug = {
        id: 'bug-100',
        category: 'bug',
        title: 'Older title from Device B',
        bugStatus: 'closed',
        updatedAt: 350,
        bugStatusEvents: [
            { type: 'status_changed', from: null, to: 'new', ts: 100 },
            { type: 'status_changed', from: 'new', to: 'open', ts: 200 },
            { type: 'status_changed', from: 'open', to: 'resolved', ts: 300 },
            { type: 'status_changed', from: 'resolved', to: 'closed', ts: 350 }
        ],
        bugData: {
            resolutionHistory: [{ resolution: "Won't Fix", duplicateOf: '', clearedAt: 250 }]
        }
    };

    const merged = toPlain(api.DocStorage._merge([localBug], [remoteBug]));
    assert.equal(merged.length, 1);
    const result = merged[0];

    // Winning content from Device A (updatedAt 500 > 350)
    assert.equal(result.title, 'Title updated on Device A');

    // Bug lifecycle events from both devices merged and rebuilt into valid chain
    assert.equal(result.bugStatusEvents.length, 4);
    assert.equal(result.bugStatusEvents[0].to, 'new');
    assert.equal(result.bugStatusEvents[1].to, 'open');
    assert.equal(result.bugStatusEvents[2].to, 'resolved');
    assert.equal(result.bugStatusEvents[3].to, 'closed');
    assert.equal(result.bugStatus, 'closed');

    // Resolution history preserved from both devices
    assert.equal(result.bugData.resolutionHistory.length, 2);
    assert.equal(result.bugData.resolutionHistory[0].resolution, 'Fixed');
    assert.equal(result.bugData.resolutionHistory[1].resolution, "Won't Fix");
});

test('document merge preserves reopen transitions when other device updated non-status fields', () => {
    const { api } = loadStorage();

    // Device A closed bug at 200, reopened at 300
    const deviceABug = {
        id: 'bug-200',
        category: 'bug',
        title: 'Device A bug',
        bugStatus: 'open',
        updatedAt: 300,
        bugStatusEvents: [
            { type: 'status_changed', from: null, to: 'new', ts: 100 },
            { type: 'status_changed', from: 'new', to: 'closed', ts: 200 },
            { type: 'status_changed', from: 'closed', to: 'open', ts: 300 }
        ]
    };

    // Device B was offline and only edited title at 400 with older status 'closed'
    const deviceBBug = {
        id: 'bug-200',
        category: 'bug',
        title: 'Device B typo fix',
        bugStatus: 'closed',
        updatedAt: 400,
        bugStatusEvents: [
            { type: 'status_changed', from: null, to: 'new', ts: 100 },
            { type: 'status_changed', from: 'new', to: 'closed', ts: 200 }
        ]
    };

    const merged = toPlain(api.DocStorage._merge([deviceABug], [deviceBBug]));
    const result = merged[0];

    // Device B typo fix won content LWW
    assert.equal(result.title, 'Device B typo fix');

    // Reopen event from Device A is preserved and final status remains 'open'
    assert.equal(result.bugStatus, 'open');
    assert.equal(result.bugStatusEvents.length, 3);
    assert.equal(result.bugStatusEvents[2].from, 'closed');
    assert.equal(result.bugStatusEvents[2].to, 'open');
});

test('allocateBugNumber never reuses numbers of deleted bugs', () => {
    const { api, localStorage } = loadStorage();

    const n1 = api.DocStorage.allocateBugNumber(0);
    const n2 = api.DocStorage.allocateBugNumber(n1);
    const n3 = api.DocStorage.allocateBugNumber(n2);

    assert.equal(n1, 1);
    assert.equal(n2, 2);
    assert.equal(n3, 3);

    // Suppose bug 3 is deleted, so the in-memory documents max drops back to 2
    const n4 = api.DocStorage.allocateBugNumber(2);
    assert.equal(n4, 4, 'Bug number 3 must not be reused after deletion');
    assert.equal(api.DocStorage._getMaxBugNumber(), 4);
});

test('deconflictBugNumbers resolves duplicate bug numbers between concurrent devices deterministically', () => {
    const { api } = loadStorage();

    const bugA = { id: 'bug-a', category: 'bug', bugNumber: 5, createdAt: 100 };
    const bugB = { id: 'bug-b', category: 'bug', bugNumber: 5, createdAt: 200 };
    const bugC = { id: 'bug-c', category: 'bug', bugNumber: 5, createdAt: 300 };

    const docs = [bugC, bugA, bugB];
    const changed = api.DocStorage.deconflictBugNumbers(docs);

    assert.equal(changed, true);
    // bugA (createdAt 100) keeps 5
    assert.equal(bugA.bugNumber, 5);
    // bugB (createdAt 200) gets 6
    assert.equal(bugB.bugNumber, 6);
    // bugC (createdAt 300) gets 7
    assert.equal(bugC.bugNumber, 7);
    assert.equal(api.DocStorage._getMaxBugNumber(), 7);
});

test('document merge deconflicts colliding bug numbers from remote sync', () => {
    const { api } = loadStorage();

    const localBug = { id: 'bug-local', category: 'bug', bugNumber: 10, createdAt: 100, updatedAt: 150 };
    const remoteBug = { id: 'bug-remote', category: 'bug', bugNumber: 10, createdAt: 200, updatedAt: 250 };

    const merged = toPlain(api.DocStorage._merge([localBug], [remoteBug]));
    assert.equal(merged.length, 2);

    const byId = Object.fromEntries(merged.map(d => [d.id, d]));
    assert.equal(byId['bug-local'].bugNumber, 10);
    assert.equal(byId['bug-remote'].bugNumber, 11);
});


