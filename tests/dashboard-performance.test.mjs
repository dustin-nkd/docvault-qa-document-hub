import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDashboardCache(opts = {}) {
    const store = new Map(Object.entries(opts.localStorage || {}));
    const context = vm.createContext({
        console,
        window: {},
        __testStore: store,
        localStorage: {
            getItem: k => store.get(k) || null,
            setItem: (k, v) => store.set(k, String(v)),
            removeItem: k => store.delete(k)
        },
        state: { trendsRange: 90 },
        debounce: callback => callback
    });
    const source = fs.readFileSync(path.join(root, 'js/render-core.js'), 'utf8') +
        '\n;globalThis.__dashboardPerformanceTest = {' +
        'cacheKey: _dashboardCacheKey, ttl: DASHBOARD_CACHE_TTL_MS,' +
        'setRange: value => { state.trendsRange = value; },' +
        'setWorkspace: ws => { __testStore.set("docvault_active_workspace", ws); }' +
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

test('Test coverage card with 200 cases and 199 in run (rounded pct 100%) still shows "1 not in a run" and not "All cases are in a run."', () => {
    const targetIds = [];
    const docs = [];
    for (let i = 1; i <= 200; i++) {
        const id = `tc-large-${i}`;
        docs.push({
            id,
            category: 'testcases',
            status: 'active',
            subfolder: 'Large Module',
            title: `Case ${i}`
        });
        if (i <= 199) {
            targetIds.push(id);
        }
    }
    docs.push({
        id: 'run-large',
        category: 'testrun',
        status: 'active',
        runData: { targetIds }
    });

    const render = createDashboardRenderer(docs);
    const html = render();

    // 199/200 = 99.5% which rounds to 100%, but uncovered is 1 > 0
    assert.match(html, /Large Module/);
    assert.match(html, /1 not in a run/);
    assert.doesNotMatch(html, /All cases are in a run\./);
});

test('Dashboard Test Pass Rate: calculates case-level outcomes and includes untested cases in total', () => {
    const docs = [
        {
            id: 'tc-1',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }, { action: 'Step 2', expected: 'Pass' }] }
        },
        {
            id: 'tc-2',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
        },
        {
            id: 'tc-3',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
        },
        {
            id: 'tc-4',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
        },
        {
            id: 'run-1',
            category: 'testrun',
            status: 'active',
            runData: {
                targetIds: ['tc-1', 'tc-2', 'tc-3', 'tc-4'],
                results: {
                    // tc-1: all steps pass -> outcome 'pass'
                    'tc-1': { 0: 'pass', 1: 'pass' },
                    // tc-2: failed step -> outcome 'fail'
                    'tc-2': { 0: 'fail' },
                    // tc-3: blocked step -> outcome 'blocked'
                    'tc-3': { 0: 'blocked' }
                    // tc-4: unexecuted -> outcome 'untested'
                }
            }
        }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    // 1 pass out of 4 total test cases = 25% (not 50%!)
    assert.match(html, />25%<\/strong>/, 'Pass rate must be 25% (1 pass out of 4 targeted test cases)');
    assert.match(html, /Across 1 run/, 'Subtitle references runs count');
    // Legend must display breakdown
    assert.match(html, />Pass<\/em><b>1<\/b>/i);
    assert.match(html, />Fail<\/em><b>1<\/b>/i);
    assert.match(html, />Blocked<\/em><b>1<\/b>/i);
    assert.match(html, />Untested<\/em><b>1<\/b>/i);
});

test('Dashboard Test Pass Rate: partial steps executed in a case without failure is untested, not pass', () => {
    const docs = [
        {
            id: 'tc-1',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }, { action: 'Step 2', expected: 'Pass' }] }
        },
        {
            id: 'tc-2',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
        },
        {
            id: 'run-1',
            category: 'testrun',
            status: 'active',
            runData: {
                targetIds: ['tc-1', 'tc-2'],
                results: {
                    // tc-1: only step 0 passed, step 1 untested -> case is untested!
                    'tc-1': { 0: 'pass' }
                    // tc-2: untested
                }
            }
        }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    // 0 passed cases out of 2 = 0%
    assert.match(html, />0%<\/strong>/, 'Pass rate must be 0% when no test case has completed all passing steps');
    assert.match(html, />Untested<\/em><b>2<\/b>/i);
});

test('Dashboard Test Pass Rate: 1 passed case out of 10 targeted cases computes exactly 10%, not 100%', () => {
    const docs = [];
    const targetIds = [];
    for (let i = 1; i <= 10; i++) {
        const id = `tc-metric-${i}`;
        targetIds.push(id);
        docs.push({
            id,
            category: 'testcases',
            status: 'active',
            tcData: { steps: [{ action: 'Action', expected: 'Pass' }] }
        });
    }
    docs.push({
        id: 'run-ten',
        category: 'testrun',
        status: 'active',
        runData: {
            targetIds,
            results: {
                // Only tc-metric-1 is executed and passed
                'tc-metric-1': { 0: 'pass' }
            }
        }
    });

    const render = createDashboardRenderer(docs);
    const html = render();

    // 1 / 10 = 10%
    assert.match(html, />10%<\/strong>/, 'Pass rate must be 10%, not 100%');
    assert.match(html, />Pass<\/em><b>1<\/b>/i);
    assert.match(html, />Untested<\/em><b>9<\/b>/i);
});

test('Dashboard Test Pass Rate: test case with no steps defined evaluates to untested, matching test-run viewer', () => {
    const docs = [
        {
            id: 'tc-no-steps',
            category: 'testcases',
            status: 'active',
            tcData: { steps: [] }
        },
        {
            id: 'run-nostep',
            category: 'testrun',
            status: 'active',
            runData: {
                targetIds: ['tc-no-steps'],
                results: {
                    'tc-no-steps': { 0: 'pass' }
                }
            }
        }
    ];

    const render = createDashboardRenderer(docs);
    const html = render();

    // 0 passed, 1 untested -> 0%
    assert.match(html, />0%<\/strong>/);
    assert.match(html, />Untested<\/em><b>1<\/b>/i);
});

test('Dashboard cache key invalidates when switching active workspace in localStorage', () => {
    const api = loadDashboardCache();
    const docs = [{ id: 'doc-cache-test', createdAt: 100, updatedAt: 200 }];
    const now = api.ttl * 10 + 100;

    const keyDefault = api.cacheKey(docs, now);
    api.setWorkspace('ws-new');
    const keyNewWs = api.cacheKey(docs, now);
    assert.notEqual(keyDefault, keyNewWs, 'Cache key must invalidate across workspaces');
});