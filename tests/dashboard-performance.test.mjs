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

function createDashboardRenderer(docs = []) {
    const context = vm.createContext({
        console,
        window: {},
        documents: docs,
        state: { trendsRange: 90 },
        debounce: callback => callback,
        _renderTrends: () => '',
        URLSearchParams,
        location: { search: '' }
    });
    const constantsCode = fs.readFileSync(path.join(root, 'js/constants.js'), 'utf8');
    const utilsCode = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
    const stateCode = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8');
    const renderCoreCode = fs.readFileSync(path.join(root, 'js/render-core.js'), 'utf8');
    vm.runInContext(constantsCode, context, { filename: 'js/constants.js' });
    vm.runInContext(utilsCode, context, { filename: 'js/utils.js' });
    vm.runInContext(stateCode, context, { filename: 'js/state.js' });
    vm.runInContext(renderCoreCode, context, { filename: 'js/render-core.js' });
    vm.runInContext('documents = ' + JSON.stringify(docs), context);
    return (newDocs) => {
        if (newDocs) vm.runInContext('documents = ' + JSON.stringify(newDocs), context);
        return vm.runInContext('renderDashboard()', context);
    };
}

test('Test coverage card only lists modules with uncovered cases (< 100%), missing most first', () => {
    const docs = [
        {
            id: 'run-1',
            category: 'testrun',
            status: 'active',
            runData: { targetIds: ['tc-auth-1'] }
        },
        {
            id: 'tc-auth-1',
            category: 'testcases',
            status: 'active',
            subfolder: 'Auth',
            title: 'Login test'
        },
        {
            id: 'tc-order-1',
            category: 'apitest',
            status: 'active',
            subfolder: 'Orders Service',
            title: 'POST /api/v1/orders'
        }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    // HTML has 0% module name and "1 not in a run"
    assert.match(html, /Orders Service/);
    assert.match(html, /1 not in a run/);

    // HTML does not have 100% module name in insight card
    const coverageBlockMatch = html.match(/<span class="insight-modules">([\s\S]*?)<\/span>\s*<\/button>/);
    assert.ok(coverageBlockMatch, 'Must find insight-modules block');
    const coverageBlockHtml = coverageBlockMatch[1];
    assert.match(coverageBlockHtml, /Orders Service/);
    assert.doesNotMatch(coverageBlockHtml, /Auth/);
    assert.doesNotMatch(html, /width:100%/, 'Must not draw 100% progress bars');
});

test('Test coverage card renders "All cases are in a run." and no insight-module-row when all modules are 100%', () => {
    const docs = [
        {
            id: 'run-1',
            category: 'testrun',
            status: 'active',
            runData: { targetIds: ['tc-auth-1', 'tc-order-1'] }
        },
        {
            id: 'tc-auth-1',
            category: 'testcases',
            status: 'active',
            subfolder: 'Auth',
            title: 'Login test'
        },
        {
            id: 'tc-order-1',
            category: 'apitest',
            status: 'active',
            subfolder: 'Orders Service',
            title: 'POST /api/v1/orders'
        }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    // HTML has "All cases are in a run."
    assert.match(html, /All cases are in a run\./);

    // HTML does not contain any insight-module-row
    assert.doesNotMatch(html, /insight-module-row/);
});

test('Test coverage card with demo guest documents renders Orders Service and "1 not in a run", without Auth, Checkout, or General', () => {
    const context = vm.createContext({
        console,
        window: {},
        documents: [],
        state: { trendsRange: 90 },
        debounce: callback => callback,
        _renderTrends: () => '',
        URLSearchParams,
        location: { search: '' }
    });
    const constantsCode = fs.readFileSync(path.join(root, 'js/constants.js'), 'utf8');
    const utilsCode = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
    const stateCode = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8');
    const renderCoreCode = fs.readFileSync(path.join(root, 'js/render-core.js'), 'utf8');
    vm.runInContext(constantsCode, context);
    vm.runInContext(utilsCode, context);
    vm.runInContext(stateCode, context);
    vm.runInContext(renderCoreCode, context);
    vm.runInContext('documents = GUEST_DEMO_DOCS', context);

    const html = vm.runInContext('renderDashboard()', context);
    assert.match(html, /Orders Service/);
    assert.match(html, /1 not in a run/);

    const coverageBlockMatch = html.match(/<span class="insight-modules">([\s\S]*?)<\/span>\s*<\/button>/);
    assert.ok(coverageBlockMatch, 'Must find insight-modules block');
    const coverageBlockHtml = coverageBlockMatch[1];
    assert.match(coverageBlockHtml, /Orders Service/);
    assert.doesNotMatch(coverageBlockHtml, /Auth/);
    assert.doesNotMatch(coverageBlockHtml, /Checkout/);
    assert.doesNotMatch(coverageBlockHtml, /General/);
});

test('Test coverage card sorts uncovered modules by missing count descending and caps at 3 rows', () => {
    const docs = [
        // Module A has 3 uncovered cases
        { id: 'tc-a1', category: 'testcases', status: 'active', subfolder: 'ModA' },
        { id: 'tc-a2', category: 'testcases', status: 'active', subfolder: 'ModA' },
        { id: 'tc-a3', category: 'testcases', status: 'active', subfolder: 'ModA' },
        // Module B has 1 uncovered case
        { id: 'tc-b1', category: 'testcases', status: 'active', subfolder: 'ModB' },
        // Module C has 2 uncovered cases
        { id: 'tc-c1', category: 'testcases', status: 'active', subfolder: 'ModC' },
        { id: 'tc-c2', category: 'testcases', status: 'active', subfolder: 'ModC' },
        // Module D has 1 uncovered case
        { id: 'tc-d1', category: 'testcases', status: 'active', subfolder: 'ModD' }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    const rows = html.match(/class="insight-module-row"/g) || [];
    assert.equal(rows.length, 3, 'Must render at most 3 module rows');

    // ModA (3 missing) must appear before ModC (2 missing)
    const posA = html.indexOf('ModA');
    const posC = html.indexOf('ModC');
    assert.ok(posA !== -1 && posC !== -1 && posA < posC, 'ModA (3 uncovered) must appear before ModC (2 uncovered)');
});