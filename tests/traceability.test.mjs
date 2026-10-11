import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createTraceabilityRenderer(initialDocs = [], initialFilter) {
    const context = vm.createContext({
        console,
        window: {},
        documents: initialDocs,
        state: { traceabilityFilter: initialFilter },
        debounce: callback => callback,
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
    vm.runInContext('documents = ' + JSON.stringify(initialDocs), context);
    if (initialFilter !== undefined) {
        vm.runInContext(`state.traceabilityFilter = ${JSON.stringify(initialFilter)}`, context);
    }
    return {
        render: (filter) => {
            if (filter !== undefined) vm.runInContext(`state.traceabilityFilter = ${JSON.stringify(filter)}`, context);
            return vm.runInContext('renderTraceability()', context);
        },
        setDocs: (docs) => {
            vm.runInContext('documents = ' + JSON.stringify(docs), context);
        }
    };
}

function getFourDemoDocs() {
    const tcLogin = {
        id: 'tc-login',
        category: 'testcases',
        title: 'Login — Valid & Invalid Credentials',
        status: 'published',
        tcData: { module: 'Auth' }
    };
    const tcCheckout = {
        id: 'tc-checkout',
        category: 'testcases',
        title: 'Checkout — Credit Card Payment',
        status: 'published',
        tcData: { module: 'Checkout' }
    };
    const tcApi = {
        id: 'tc-api',
        category: 'apitest',
        title: 'POST /api/v1/orders — order is confirmed',
        status: 'published',
        apiTcData: { module: 'Orders' }
    };
    const tcSearch = {
        id: 'tc-search',
        category: 'testcases',
        title: 'Product Search & Filter',
        status: 'published',
        tcData: { module: 'Search' }
    };

    const runSprint = {
        id: 'run-sprint',
        category: 'testrun',
        title: 'Sprint 24 — Regression Run',
        status: 'published',
        runData: {
            targetIds: ['tc-login', 'tc-checkout', 'tc-search'],
            results: {
                'tc-login': { 1: 'pass', 2: 'pass' },
                'tc-checkout': { 1: 'fail', 2: 'blocked' },
                'tc-search': { 1: 'untested', 2: 'pass' }
            },
            environment: 'Staging · build #482'
        }
    };

    const bugCheckout = {
        id: 'bug-checkout',
        category: 'bug',
        title: 'Checkout — Declined payment returns HTTP 500',
        status: 'published',
        bugStatus: 'open',
        bugData: { linkedTc: 'tc-checkout' }
    };

    const bugSearchClosed = {
        id: 'bug-search-closed',
        category: 'bug',
        title: 'Search field sends requests without debounce',
        status: 'archived',
        bugStatus: 'closed',
        bugData: { linkedTc: 'tc-search' }
    };

    const relCheckout = {
        id: 'rel-checkout',
        category: 'release',
        title: 'v2.4.0 — Checkout Reliability',
        status: 'published',
        releaseData: { linkedRuns: ['run-sprint'], linkedBugs: ['bug-checkout'] }
    };

    return [tcLogin, tcCheckout, tcApi, tcSearch, runSprint, bugCheckout, bugSearchClosed, relCheckout];
}

test('Traceability: default gaps view hides passed rows, shows gaps, counts hero 1/1/2, and removes Coverage & Impact', () => {
    const docs = getFourDemoDocs();
    const renderer = createTraceabilityRenderer(docs);
    const html = renderer.render();

    // Removed sections and terms
    assert.ok(!html.includes('Coverage & Impact'), 'Must not contain Coverage & Impact');
    assert.ok(!html.includes('Changed APIs'), 'Must not contain Changed APIs');
    assert.ok(!html.includes('Regression not run'), 'Must not contain Regression not run');
    assert.ok(!html.includes('Regression covered'), 'Must not contain Regression covered');
    assert.ok(!html.includes('Missing tests'), 'Must not contain Missing tests');
    assert.ok(!html.includes('Regression due'), 'Must not contain Regression due');
    assert.ok(!html.includes('impact-section'), 'Must not contain impact-section');

    // Hero summary format: 1 Passed, 1 Needs attention, 2 Incomplete
    assert.ok(html.includes('<b>1</b>Passed'), 'Hero must show 1 Passed');
    assert.ok(html.includes('<b>1</b>Needs attention'), 'Hero must show 1 Needs attention');
    assert.ok(html.includes('<b>2</b>Incomplete'), 'Hero must show 2 Incomplete');

    // Default filter is gaps: Passed row (Login) must NOT appear in the table rows
    assert.ok(!html.includes('Login — Valid & Invalid Credentials'), 'Passed case must not appear in gaps filter');

    // Checkout: Needs attention with bug title
    assert.ok(html.includes('Checkout — Credit Card Payment'), 'Checkout must appear in gaps filter');
    assert.ok(html.includes('Needs attention'), 'Checkout must have Needs attention status');
    assert.ok(html.includes('Checkout — Declined payment returns HTTP 500'), 'Checkout must link the open bug');
    assert.ok(html.includes('Staging · build #482'), 'Environment must be rendered');
    assert.ok(html.includes('v2.4.0 — Checkout Reliability'), 'Release must be rendered');

    // API test: Incomplete, no run link
    assert.ok(html.includes('POST /api/v1/orders — order is confirmed'), 'API test must appear');
    assert.ok(html.includes('<span class="trace-muted">Incomplete</span>'), 'API test with no run must render Incomplete in trace-muted');

    // Product search: Incomplete with run link
    assert.ok(html.includes('Product Search') && html.includes('Filter'), 'Search test must appear');
    assert.ok(html.includes('Sprint 24 — Regression Run'), 'Search test must show its run link');
});

test('Traceability: filter buttons filter table rows by state', () => {
    const docs = getFourDemoDocs();
    const renderer = createTraceabilityRenderer(docs);

    // Filter: all
    const allHtml = renderer.render('all');
    assert.ok(allHtml.includes('Login'), 'All filter must include Login');
    assert.ok(allHtml.includes('Passed'), 'All filter must show Passed badge for Login');
    assert.ok(allHtml.includes('Checkout — Credit Card Payment'));
    assert.ok(allHtml.includes('POST /api/v1/orders — order is confirmed'));
    assert.ok(allHtml.includes('Product Search'));

    // Filter: covered
    const coveredHtml = renderer.render('covered');
    assert.ok(coveredHtml.includes('Login'), 'Covered filter must include Login');
    assert.ok(!coveredHtml.includes('Checkout — Credit Card Payment'), 'Covered filter must not include Checkout');
    assert.ok(!coveredHtml.includes('POST /api/v1/orders — order is confirmed'), 'Covered filter must not include API test');
    assert.ok(!coveredHtml.includes('Product Search'), 'Covered filter must not include Search');

    // Filter: risk
    const riskHtml = renderer.render('risk');
    assert.ok(!riskHtml.includes('Login'), 'Risk filter must not include Login');
    assert.ok(riskHtml.includes('Checkout — Credit Card Payment'), 'Risk filter must include Checkout');
    assert.ok(!riskHtml.includes('POST /api/v1/orders — order is confirmed'), 'Risk filter must not include API test');
    assert.ok(!riskHtml.includes('Product Search'), 'Risk filter must not include Search');

    // Filter: missing
    const missingHtml = renderer.render('missing');
    assert.ok(!missingHtml.includes('Login'), 'Missing filter must not include Login');
    assert.ok(!missingHtml.includes('Checkout — Credit Card Payment'), 'Missing filter must not include Checkout');
    assert.ok(missingHtml.includes('POST /api/v1/orders — order is confirmed'), 'Missing filter must include API test');
    assert.ok(missingHtml.includes('Product Search'), 'Missing filter must include Search');
});

test('Traceability: case passing all steps but having an open bug is categorized as Needs attention', () => {
    const docs = [
        {
            id: 'tc-passed-with-bug',
            category: 'testcases',
            title: 'Profile — Edit Display Name',
            status: 'published',
            tcData: { module: 'Profile' }
        },
        {
            id: 'run-clean',
            category: 'testrun',
            title: 'Smoke Run',
            status: 'published',
            runData: {
                targetIds: ['tc-passed-with-bug'],
                results: { 'tc-passed-with-bug': { 1: 'pass', 2: 'pass' } }
            }
        },
        {
            id: 'bug-open-profile',
            category: 'bug',
            title: 'Profile — Emoji in name causes truncation',
            status: 'published',
            bugStatus: 'open',
            bugData: { linkedTc: 'tc-passed-with-bug' }
        }
    ];

    const renderer = createTraceabilityRenderer(docs, 'all');
    const html = renderer.render('all');
    assert.ok(html.includes('Profile — Edit Display Name'));
    assert.ok(html.includes('Needs attention'), 'Must display Needs attention badge due to open bug');
    assert.ok(!html.includes('is-pass'), 'Must not render is-pass badge');
});

test('Traceability: empty states render exact messages', () => {
    // 1. No test cases at all
    const emptyRenderer = createTraceabilityRenderer([]);
    const emptyHtml = emptyRenderer.render();
    assert.ok(emptyHtml.includes('No test cases yet.'), 'When no test cases exist, render "No test cases yet."');

    // 2. All cases Passed and filter is gaps
    const allPassedDocs = [
        {
            id: 'tc-pass-1',
            category: 'testcases',
            title: 'Case One',
            status: 'published'
        },
        {
            id: 'run-pass-1',
            category: 'testrun',
            title: 'Run One',
            status: 'published',
            runData: {
                targetIds: ['tc-pass-1'],
                results: { 'tc-pass-1': { 1: 'pass' } }
            }
        }
    ];
    const passedRenderer = createTraceabilityRenderer(allPassedDocs, 'gaps');
    const passedHtml = passedRenderer.render('gaps');
    assert.ok(passedHtml.includes('All cases passed.'), 'When all cases passed in gaps filter, render "All cases passed."');
    assert.ok(!passedHtml.includes('trace-row'), 'Must not contain any trace-row');

    // 3. Filter risk when no risk cases exist
    const noRiskHtml = passedRenderer.render('risk');
    assert.ok(noRiskHtml.includes('No test cases match this filter.'), 'When filter matches no cases, render "No test cases match this filter."');
    assert.ok(!noRiskHtml.includes('All cases passed.'), 'Must not use "All cases passed." for non-gaps filters');
});
