import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDashboardCache() {
    const context = vm.createContext({
        console,
        window: {},
        state: { trendsRange: 90 },
        debounce: callback => callback
    });
    const source = fs.readFileSync(path.join(root, 'js/render-core.js'), 'utf8') +
        '\n;globalThis.__dashboardPerformanceTest = {' +
        'cacheKey: _dashboardCacheKey, ttl: DASHBOARD_CACHE_TTL_MS,' +
        'setRange: value => { state.trendsRange = value; }' +
        '};';
    vm.runInContext(source, context, { filename: 'js/render-core.js' });
    return context.__dashboardPerformanceTest;
}

test('dashboard cache key reuses chart markup within a stable data revision', () => {
    const api = loadDashboardCache();
    const docs = [
        { id: 'a', createdAt: 100, updatedAt: 200 },
        { id: 'b', createdAt: 150, updatedAt: 250 }
    ];
    const start = api.ttl * 10 + 100;
    assert.equal(api.cacheKey(docs, start), api.cacheKey(docs, start + 500));
});

test('dashboard cache invalidates for document, range, and time-bucket changes', () => {
    const api = loadDashboardCache();
    const docs = [{ id: 'a', createdAt: 100, updatedAt: 200 }];
    const start = api.ttl * 10 + 100;
    const initial = api.cacheKey(docs, start);

    docs[0].updatedAt = 300;
    assert.notEqual(api.cacheKey(docs, start), initial);

    const revised = api.cacheKey(docs, start);
    api.setRange(30);
    assert.notEqual(api.cacheKey(docs, start), revised);
    assert.notEqual(api.cacheKey(docs, start + api.ttl), api.cacheKey(docs, start));
});