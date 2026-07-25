// CF-P6-002 characterization baseline.
//
// These tests were written and passing BEFORE the StorageProvider refactor and
// pin the Personal Vault's observable behaviour exactly as it shipped. They are
// deliberately picky — storage key strings, the null-vs-empty-array return of
// getAll(), and the exact public method surface are the on-disk and call-site
// contract that the refactor must not disturb. If a later change to
// PersonalVaultProvider makes one of these fail, that is the sprint gate
// "Personal documents unchanged" failing, not a stale test to update.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, toPlain } from './harness.mjs';

const PUBLIC_SURFACE = ['addDeletedIds', 'exportData', 'getAll', 'getSettings', 'getUsage',
    'hasPendingSync', 'importData', 'queueSync', 'save', 'saveSettings', 'setPendingSync'];

test('Personal Vault storage keys are unchanged', () => {
    const { api } = loadStorage({});
    assert.equal(api.DocStorage.STORAGE_KEY, 'docvault_docs');
    assert.equal(api.DocStorage.DELETED_IDS_KEY, 'docvault_deleted_ids');
    assert.equal(api.DocStorage.PENDING_SYNC_KEY, 'docvault_sync_pending');
});

test('Personal Vault exposes exactly its shipped public method surface', () => {
    const { api } = loadStorage({});
    const actual = Object.keys(api.DocStorage)
        .filter((key) => typeof api.DocStorage[key] === 'function' && !key.startsWith('_'))
        .sort();
    assert.deepEqual(actual, PUBLIC_SURFACE);
});

test('getAll returns null (not an empty array) when nothing is stored', async () => {
    const { api } = loadStorage({});
    assert.equal(await api.DocStorage.getAll(), null);
});

test('save round-trips documents byte-for-byte through local storage', async () => {
    const { api, localStorage } = loadStorage({});
    const docs = [
        { id: 'a', title: 'A', category: 'testcase', createdAt: 1, updatedAt: 2 },
        { id: 'b', title: 'B', category: 'bug', createdAt: 3, updatedAt: 4, bugStatus: 'open' }
    ];
    assert.equal(await api.DocStorage.save(docs), true);
    assert.deepEqual(toPlain(await api.DocStorage.getAll()), docs);
    assert.deepEqual(JSON.parse(localStorage.getItem('docvault_docs')), docs);
});

test('save without GitHub configured performs no remote call and leaves sync unpended', async () => {
    let fetched = 0;
    const { api } = loadStorage({ fetch: () => { fetched += 1; throw new Error('no network'); } });
    await api.DocStorage.save([{ id: 'a', title: 'A', category: 'testcase', createdAt: 1, updatedAt: 1 }]);
    assert.equal(fetched, 0);
    assert.equal(api.DocStorage.hasPendingSync(), false);
});

test('pending sync flag persists through localStorage and clears exactly', async () => {
    const { api, localStorage } = loadStorage({});
    assert.equal(api.DocStorage.hasPendingSync(), false);
    api.DocStorage.setPendingSync(true);
    assert.equal(localStorage.getItem('docvault_sync_pending'), '1');
    assert.equal(api.DocStorage.hasPendingSync(), true);
    api.DocStorage.setPendingSync(false);
    assert.equal(localStorage.getItem('docvault_sync_pending'), null);
    assert.equal(api.DocStorage.hasPendingSync(), false);
});

test('deleted ids accumulate without dropping earlier tombstones', async () => {
    const { api, localStorage } = loadStorage({});
    api.DocStorage.addDeletedIds(['x']);
    api.DocStorage.addDeletedIds(['y', 'x']);
    const stored = JSON.parse(localStorage.getItem('docvault_deleted_ids'));
    assert.deepEqual([...stored].sort(), ['x', 'y']);
});

test('credential passwords survive a save/getAll round trip when the vault is unlocked', async () => {
    const { api } = loadStorage({ sessionStorage: { docvault_pwd: 'correct horse battery staple' } });
    const docs = [{ id: 'c', title: 'C', category: 'credential', password: 'p@ssw0rd', createdAt: 1, updatedAt: 1 }];
    await api.DocStorage.save(docs);
    const loaded = await api.DocStorage.getAll();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].password, 'p@ssw0rd');
});

test('a stored credential password is never persisted in plaintext', async () => {
    const { api, localStorage } = loadStorage({ sessionStorage: { docvault_pwd: 'correct horse battery staple' } });
    await api.DocStorage.save([
        { id: 'c', title: 'C', category: 'credential', password: 'p@ssw0rd', createdAt: 1, updatedAt: 1 }
    ]);
    assert.ok(!String(localStorage.getItem('docvault_docs')).includes('p@ssw0rd'));
});

test('getUsage reports the shipped zeroed shape', async () => {
    const { api } = loadStorage({});
    assert.deepEqual(toPlain(await api.DocStorage.getUsage()), { used: 0, total: 0 });
});
