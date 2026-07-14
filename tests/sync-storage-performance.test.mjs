import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStorage, toPlain } from './harness.mjs';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

async function nextTurn() {
    await new Promise(resolve => setTimeout(resolve, 0));
}

test('rapid saves use one sync flight and coalesce pending work to the latest state', async () => {
    const { api } = loadStorage();
    const storage = api.DocStorage;
    const sync = api.GitHubSync;
    const flights = [];
    let active = 0;
    let maxActive = 0;

    sync.isConfigured = async () => true;
    sync.syncPush = docs => {
        const flight = deferred();
        flights.push({ docs: toPlain(docs), flight });
        active++;
        maxActive = Math.max(maxActive, active);
        return flight.promise.finally(() => { active--; });
    };

    await storage.save([{ id: 'doc', updatedAt: 1, title: 'First' }]);
    await storage.save([{ id: 'doc', updatedAt: 2, title: 'Second' }]);
    await storage.save([{ id: 'doc', updatedAt: 3, title: 'Latest' }]);

    assert.equal(flights.length, 1);
    flights[0].flight.resolve({ mergedDocs: [] });
    await nextTurn();
    assert.equal(flights.length, 2);
    assert.equal(flights[1].docs[0].title, 'Latest');
    flights[1].flight.resolve({ mergedDocs: [] });
    await storage._syncInFlight;
    assert.equal(maxActive, 1);
    assert.equal(storage.hasPendingSync(), false);
});

test('a save queued at the completion boundary starts a fresh sync flight', async () => {
    const { api } = loadStorage();
    const storage = api.DocStorage;
    const sync = api.GitHubSync;
    const first = deferred();
    const flights = [];

    sync.syncPush = docs => {
        flights.push(toPlain(docs));
        return flights.length === 1 ? first.promise : Promise.resolve({ mergedDocs: [] });
    };

    storage.queueSync([{ id: 'doc', title: 'First' }]);
    first.resolve({ mergedDocs: [] });
    queueMicrotask(() => storage.queueSync([{ id: 'doc', title: 'Boundary' }]));
    await nextTurn();

    assert.equal(flights.length, 2);
    assert.equal(flights[1][0].title, 'Boundary');
});
test('a failed sync burst preserves retry intent without starting queued network storms', async () => {
    const { api } = loadStorage();
    const storage = api.DocStorage;
    const sync = api.GitHubSync;
    const first = deferred();
    let calls = 0;

    sync.isConfigured = async () => true;
    sync.syncPush = () => {
        calls++;
        return first.promise;
    };

    await storage.save([{ id: 'doc', updatedAt: 1 }]);
    await storage.save([{ id: 'doc', updatedAt: 2 }]);
    first.reject(new Error('offline'));
    const synced = await storage._syncInFlight;

    assert.equal(synced, false);
    assert.equal(calls, 1);
    assert.equal(storage.hasPendingSync(), true);
    assert.equal(storage._queuedSyncDocs, null);
});

test('confirmed sharded storage skips repeated remote format probes', async () => {
    const { api } = loadStorage();
    const sync = api.GitHubSync;
    let treeCalls = 0;
    sync.getSettings = async () => ({ owner: 'o', repo: 'r', branch: 'main', token: 't' });
    sync._getTree = async () => {
        treeCalls++;
        return { [sync.META_PATH]: 'meta-sha' };
    };

    assert.equal(await sync.isRemoteSharded(), true);
    assert.equal(await sync.isRemoteSharded(), true);
    assert.equal(treeCalls, 1);
});

test('changing the remote storage target invalidates repository-specific caches', async () => {
    const { api, localStorage } = loadStorage();
    const sync = api.GitHubSync;
    sync._remoteSharded = true;
    localStorage.setItem(sync.META_FP_KEY, 'meta');
    localStorage.setItem(sync.META_SHA_KEY, 'meta-sha');
    localStorage.setItem(sync.SHARD_FP_PREFIX + '0', 'shard');
    localStorage.setItem(sync.SHARD_SHA_PREFIX + '0', 'shard-sha');

    await sync.saveSettings({ owner: 'other', repo: 'vault', branch: 'release', token: 'token' });

    assert.equal(sync._remoteSharded, false);
    assert.equal(localStorage.getItem(sync.META_FP_KEY), null);
    assert.equal(localStorage.getItem(sync.META_SHA_KEY), null);
    assert.equal(localStorage.getItem(sync.SHARD_FP_PREFIX + '0'), null);
    assert.equal(localStorage.getItem(sync.SHARD_SHA_PREFIX + '0'), null);
});
test('unchanged sharded metadata is fingerprinted and not written again', async () => {
    const { api, localStorage } = loadStorage();
    const sync = api.GitHubSync;
    sync.SHARD_COUNT = 1;
    sync.getSettings = async () => ({ owner: 'o', repo: 'r', branch: 'main', token: 't' });
    sync._prepDocsForShards = async docs => docs;
    sync._applySecurityMeta = () => {};
    localStorage.setItem(sync.SHARD_FP_PREFIX + '0', '');
    let writes = 0;
    sync._putWithMerge = async (_path, _settings, _shaKey, _pwd, payload) => {
        writes++;
        return { payload, merged: false };
    };

    const metadata = { recoveryBlob: 'blob', passwordHint: 'hint' };
    await sync.pushSharded([], metadata);
    await sync.pushSharded([], metadata);
    assert.equal(writes, 1);
    assert.ok(localStorage.getItem(sync.META_FP_KEY));

    await sync.pushSharded([], { ...metadata, passwordHint: 'changed' });
    assert.equal(writes, 2);
});