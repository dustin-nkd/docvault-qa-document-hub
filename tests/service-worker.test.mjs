import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function loadServiceWorker({ fetchImpl, matchImpl, addAllImpl } = {}) {
    const listeners = {};
    let skipWaitingCalls = 0;
    const deletedCacheNames = [];
    const cache = {
        async addAll(items) {
            if (addAllImpl) return addAllImpl(items);
        },
        async put() {}
    };
    const caches = {
        async open() { return cache; },
        async keys() { return ['docvault-shell-v34', 'docvault-shell-v35', 'another-app-cache']; },
        async delete(name) { deletedCacheNames.push(name); return true; },
        async match(request) {
            return matchImpl ? matchImpl(request) : undefined;
        }
    };
    const self = {
        location: { origin: 'https://docvault.test' },
        clients: { async claim() {} },
        addEventListener(type, handler) { listeners[type] = handler; },
        async skipWaiting() { skipWaitingCalls++; }
    };
    const context = vm.createContext({
        console,
        self,
        caches,
        fetch: fetchImpl || (async () => new Response('network')),
        Response,
        URL
    });
    vm.runInContext(source, context, { filename: 'sw.js' });
    return { listeners, deletedCacheNames, getSkipWaitingCalls: () => skipWaitingCalls };
}

function dispatchFetch(handler, request) {
    let responsePromise;
    handler({
        request,
        respondWith(value) { responsePromise = Promise.resolve(value); }
    });
    return responsePromise;
}

test('service worker install fails atomically when a required shell asset cannot be cached', async () => {
    const expected = new Error('asset unavailable');
    const harness = loadServiceWorker({ addAllImpl: async () => { throw expected; } });
    let installPromise;
    harness.listeners.install({ waitUntil(value) { installPromise = Promise.resolve(value); } });

    await assert.rejects(installPromise, expected);
    assert.equal(harness.getSkipWaitingCalls(), 0);
});

test('offline navigation uses the cached app shell while an uncached asset returns 503', async () => {
    const shell = new Response('<!doctype html><title>DocVault</title>', {
        headers: { 'Content-Type': 'text/html' }
    });
    const harness = loadServiceWorker({
        fetchImpl: async () => { throw new Error('offline'); },
        matchImpl: async request => request === './index.html' ? shell.clone() : undefined
    });

    const navigation = await dispatchFetch(harness.listeners.fetch, {
        url: 'https://docvault.test/?guest=1',
        method: 'GET',
        mode: 'navigate'
    });
    assert.equal(navigation.status, 200);
    assert.match(await navigation.text(), /DocVault/);

    const asset = await dispatchFetch(harness.listeners.fetch, {
        url: 'https://docvault.test/js/missing.js',
        method: 'GET',
        mode: 'cors'
    });
    assert.equal(asset.status, 503);
    assert.equal(asset.headers.get('X-DocVault-Offline'), '1');
    assert.match(await asset.text(), /not available in the app cache/i);
});

test('offline requests prefer the exact cached resource before navigation fallback', async () => {
    const cachedAsset = new Response('cached-js', {
        headers: { 'Content-Type': 'application/javascript' }
    });
    const harness = loadServiceWorker({
        fetchImpl: async () => { throw new Error('offline'); },
        matchImpl: async request => typeof request === 'object' && request.url.endsWith('/js/app.js')
            ? cachedAsset.clone()
            : undefined
    });
    const response = await dispatchFetch(harness.listeners.fetch, {
        url: 'https://docvault.test/js/app.js',
        method: 'GET',
        mode: 'cors'
    });

    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'cached-js');
});
test('activation only removes stale DocVault caches on a shared origin', async () => {
    const harness = loadServiceWorker();
    let activationPromise;
    harness.listeners.activate({ waitUntil(value) { activationPromise = Promise.resolve(value); } });
    await activationPromise;

    assert.deepEqual(harness.deletedCacheNames, ['docvault-shell-v34']);
});
