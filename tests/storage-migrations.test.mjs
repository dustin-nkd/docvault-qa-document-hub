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
