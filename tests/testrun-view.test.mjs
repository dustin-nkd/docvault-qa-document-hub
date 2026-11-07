import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createTestRunViewerContext(initialDocs = [], sharedView = false, mockDocument = null) {
    const context = vm.createContext({
        console,
        window: {},
        document: mockDocument || { getElementById: () => null },
        state: { sharedView },
        URLSearchParams,
        location: { search: '' }
    });
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-viewer-categories.js',
        'js/render-viewer.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);
    vm.runInContext(`state.sharedView = ${Boolean(sharedView)};`, context);

    return {
        render: (doc, isShared) => {
            if (isShared !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
            }
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        },
        _runCaseOutcome: (steps, row) => {
            context._steps = steps;
            context._row = row;
            return vm.runInContext('_runCaseOutcome(_steps, _row)', context);
        },
        _traceRunOutcome: (run, tcId) => {
            context._run = run;
            context._tcId = tcId;
            return vm.runInContext('_traceRunOutcome(_run, _tcId)', context);
        },
        toggleAllTestRunCases: () => vm.runInContext('window.toggleAllTestRunCases()', context)
    };
}

test('Test Run view: Sprint 24 fixture renders three open details, case-level metrics, and step elements', () => {
    const tcLogin = {
        id: 'tc-login',
        title: 'Login',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [
                { action: 'Open /login, enter a valid email and password', expected: 'Login succeeds and redirects to /dashboard' },
                { action: 'Sign out and enter an incorrect password three times', expected: 'Show "Invalid credentials" and display CAPTCHA' }
            ]
        }
    };
    const tcCheckout = {
        id: 'tc-checkout',
        title: 'Checkout',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [
                { action: 'Add an in-stock product to cart and click "Proceed to Checkout"', expected: 'Checkout page loads' },
                { action: 'Fill shipping address and enter a test card with insufficient funds', expected: 'Show "Card declined" message' },
                { action: 'Replace with a valid card, submit, and confirm payment completes', expected: 'Redirects to order confirmation' }
            ]
        }
    };
    const tcSearch = {
        id: 'tc-search',
        title: 'Search',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [
                { action: 'Enter "wireless headphones" in top search bar', expected: 'Catalog filters down' },
                { action: 'Select "In Stock" filter and price range $50-$150', expected: 'List updates instantly' }
            ]
        }
    };
    const runSprint24 = {
        id: 'run-sprint24',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-login', 'tc-checkout', 'tc-search'],
            snapshot: {
                'tc-login': [
                    { action: 'Open /login, enter a valid email and password', expected: 'Login succeeds and redirects to /dashboard' },
                    { action: 'Sign out and enter an incorrect password three times', expected: 'Show "Invalid credentials" and display CAPTCHA' }
                ],
                'tc-checkout': [
                    { action: 'Add an in-stock product to cart and click "Proceed to Checkout"', expected: 'Checkout page loads' },
                    { action: 'Fill shipping address and enter a test card with insufficient funds', expected: 'Show "Card declined" message' },
                    { action: 'Replace with a valid card, submit, and confirm payment completes', expected: 'Redirects to order confirmation' }
                ],
                'tc-search': [
                    { action: 'Enter "wireless headphones" in top search bar', expected: 'Catalog filters down' },
                    { action: 'Select "In Stock" filter and price range $50-$150', expected: 'List updates instantly' }
                ]
            },
            results: {
                'tc-login': { 0: 'pass', 1: 'pass', note: 'CAPTCHA appears correctly after three failed attempts.' },
                'tc-checkout': { 0: 'pass', 1: 'fail', 2: 'blocked', note: 'The declined-payment case returns HTTP 500 instead of a clear message.' },
                'tc-search': { 0: 'pass', 1: 'untested' }
            }
        }
    };
    const bug2 = {
        id: 'bug-2',
        bugNumber: 2,
        title: 'Declined card returns 500',
        category: 'bug',
        status: 'open',
        bugStatus: 'open',
        bugData: {
            severity: 'Critical',
            foundInRun: 'run-sprint24',
            foundInTc: 'tc-checkout',
            foundInStep: 1
        }
    };

    const docs = [tcLogin, tcCheckout, tcSearch, runSprint24, bug2];
    const ctx = createTestRunViewerContext(docs, false);
    const html = ctx.render(runSprint24, false);

    assert.ok(html.includes('id="testrun-toggle-all"'), 'renders toggle all button');
    assert.ok(html.includes('data-onclick="toggleAllTestRunCases()"'), 'toggle button calls toggleAllTestRunCases()');
    assert.ok(html.includes('Collapse all'), 'toggle button shows Collapse all');
    assert.ok(!html.includes('Expand all'), 'toggle button must not show Expand all on initial render');
    assert.ok(html.includes('id="testrun-cases"'), 'cases container has id="testrun-cases"');
    assert.equal((html.match(/<details open/g) || []).length, 3, 'renders exactly 3 <details open> elements');
    assert.ok(html.includes('Login'), 'renders Login title');
    assert.ok(html.includes('Checkout'), 'renders Checkout title');
    assert.ok(html.includes('Search'), 'renders Search title');

    assert.ok(html.includes('Open /login, enter a valid email and password'), 'renders step action from Login');
    assert.ok(html.includes('Fill shipping address and enter a test card with insufficient funds'), 'renders step action from Checkout');
    assert.ok(html.includes('Enter &quot;wireless headphones&quot; in top search bar'), 'renders step action from Search');

    assert.ok(html.includes('Progress (3 cases)'), 'renders progress with cases count');
    assert.ok(html.includes('33% Passed'), 'renders 33% Passed');
    assert.ok(!html.includes('(7 steps)'), 'must not count 7 steps');

    assert.match(html, /#10b981[^>]*>\s*1\s*<\/div>/, 'Pass box is 1');
    assert.match(html, /#ef4444[^>]*>\s*1\s*<\/div>/, 'Fail box is 1');
    assert.match(html, /#f59e0b[^>]*>\s*0\s*<\/div>/, 'Blocked box is 0');
    assert.match(html, /var\(--tx-m\)[^>]*>\s*1\s*<\/div>/, 'Untested box is 1');

    const summaries = [...html.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)].map(m => m[1]);
    assert.equal(summaries.length, 3, 'renders 3 summary tags');
    assert.ok(summaries[0].includes('Pass'), 'Login summary contains Pass');
    assert.ok(summaries[1].includes('Fail'), 'Checkout summary contains Fail');
    assert.ok(summaries[2].includes('Untested'), 'Search summary contains Untested');

    assert.ok(html.includes('BUG-002'), 'Checkout body displays linked bug chip BUG-002');
    assert.ok(html.includes('updateTestRunStep'), 'renders step buttons calling updateTestRunStep');
    assert.ok(!html.includes('Report bug'), 'step 1 already has a linked bug so Report bug is not rendered');

    const viewerCatSource = fs.readFileSync(path.join(root, 'js/render-viewer-categories.js'), 'utf8');
    assert.ok(viewerCatSource.includes('reportBugFromStep'), 'source code retains reportBugFromStep');
});

test('Test Run view: partial results count case as untested, contrasting with _traceRunOutcome', () => {
    const tc = {
        id: 'tc-partial',
        title: 'Three Step Case',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [
                { action: 'Step 1', expected: 'Exp 1' },
                { action: 'Step 2', expected: 'Exp 2' },
                { action: 'Step 3', expected: 'Exp 3' }
            ]
        }
    };
    const run = {
        id: 'run-partial',
        title: 'Single Case Partial Run',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-partial'],
            snapshot: {
                'tc-partial': [
                    { action: 'Step 1', expected: 'Exp 1' },
                    { action: 'Step 2', expected: 'Exp 2' },
                    { action: 'Step 3', expected: 'Exp 3' }
                ]
            },
            results: {
                'tc-partial': { 0: 'pass' }
            }
        }
    };

    const ctx = createTestRunViewerContext([tc, run], false);
    assert.equal(ctx._runCaseOutcome(tc.tcData.steps, run.runData.results[tc.id]), 'untested');
    assert.equal(ctx._traceRunOutcome(run, tc.id), 'pass');

    const html = ctx.render(run, false);
    assert.ok(html.includes('Progress (1 case)'), 'renders Progress (1 case)');
    assert.ok(html.includes('0% Passed'), 'renders 0% Passed');
    assert.match(html, /#10b981[^>]*>\s*0\s*<\/div>/, 'Pass box is 0');
    assert.match(html, /var\(--tx-m\)[^>]*>\s*1\s*<\/div>/, 'Untested box is 1');
});

test('Test Run view: all steps pass yields 100% Passed', () => {
    const tc = {
        id: 'tc-allpass',
        title: 'Passing Case',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [
                { action: 'Step A', expected: 'Pass A' },
                { action: 'Step B', expected: 'Pass B' }
            ]
        }
    };
    const run = {
        id: 'run-allpass',
        title: 'All Pass Execution',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-allpass'],
            snapshot: {
                'tc-allpass': [
                    { action: 'Step A', expected: 'Pass A' },
                    { action: 'Step B', expected: 'Pass B' }
                ]
            },
            results: {
                'tc-allpass': { 0: 'pass', 1: 'pass' }
            }
        }
    };

    const ctx = createTestRunViewerContext([tc, run], false);
    const html = ctx.render(run, false);
    assert.match(html, /#10b981[^>]*>\s*1\s*<\/div>/, 'Pass box is 1');
    assert.ok(html.includes('Progress (1 case)'), 'renders Progress (1 case)');
    assert.ok(html.includes('100% Passed'), 'renders 100% Passed');
});

test('Test Run view: case without steps renders No steps defined and counts as untested', () => {
    const tc = {
        id: 'tc-nosteps',
        title: 'Empty Case',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [] }
    };
    const run = {
        id: 'run-nosteps',
        title: 'No Steps Run',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-nosteps'],
            snapshot: { 'tc-nosteps': [] },
            results: {}
        }
    };

    const ctx = createTestRunViewerContext([tc, run], false);
    const html = ctx.render(run, false);
    assert.ok(html.includes('No steps defined.'), 'renders "No steps defined." message');
    assert.match(html, /var\(--tx-m\)[^>]*>\s*1\s*<\/div>/, 'Untested box is 1');
    assert.ok(html.includes('Progress (1 case)'), 'renders Progress (1 case)');
    assert.ok(html.includes('0% Passed'), 'renders 0% Passed');
});

test('Test Run view: run with no targets renders No test cases selected and zero metrics', () => {
    const run = {
        id: 'run-notargets',
        title: 'Empty Run',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: [],
            results: {}
        }
    };

    const ctx = createTestRunViewerContext([run], false);
    const html = ctx.render(run, false);
    assert.ok(html.includes('No test cases selected.'), 'renders "No test cases selected."');
    assert.ok(!html.includes('testrun-toggle-all'), 'zero-targets run must not render toggle button');
    assert.ok(!html.includes('id="testrun-cases"'), 'zero-targets run must not render testrun-cases container');
    assert.ok(html.includes('Progress (0 cases)'), 'renders Progress (0 cases)');
    assert.match(html, /#10b981[^>]*>\s*0\s*<\/div>/, 'Pass box is 0');
    assert.match(html, /#ef4444[^>]*>\s*0\s*<\/div>/, 'Fail box is 0');
    assert.match(html, /#f59e0b[^>]*>\s*0\s*<\/div>/, 'Blocked box is 0');
    assert.match(html, /var\(--tx-m\)[^>]*>\s*0\s*<\/div>/, 'Untested box is 0');
});

test('Test Run view: Pass Rate Trend calculates case-level pass rates', () => {
    const run1 = {
        id: 'run-c1',
        title: 'Run Alpha 1',
        category: 'testrun',
        status: 'published',
        createdAt: 1000,
        runData: {
            cycleId: 'cycle-1',
            targetIds: ['tc1', 'tc2'],
            snapshot: {
                tc1: [{ action: 'A1' }, { action: 'A2' }],
                tc2: [{ action: 'B1' }, { action: 'B2' }]
            },
            results: {
                tc1: { 0: 'pass', 1: 'pass' },
                tc2: { 0: 'pass', 1: 'pass' }
            }
        }
    };
    const run2 = {
        id: 'run-c2',
        title: 'Run Alpha 2',
        category: 'testrun',
        status: 'published',
        createdAt: 2000,
        runData: {
            cycleId: 'cycle-1',
            targetIds: ['tc1', 'tc2'],
            snapshot: {
                tc1: [{ action: 'A1' }, { action: 'A2' }],
                tc2: [{ action: 'B1' }, { action: 'B2' }]
            },
            results: {
                tc1: { 0: 'pass', 1: 'pass' },
                tc2: { 0: 'pass', 1: 'fail' }
            }
        }
    };

    const ctx = createTestRunViewerContext([run1, run2], false);
    const html = ctx.render(run2, false);

    assert.ok(html.includes('Pass Rate Trend'), 'Trend chart is rendered');
    assert.ok(html.includes('50%'), 'Execution 2 renders 50% passed cases');
    assert.ok(!html.includes('75%'), 'Must not render step-based 75%');
    assert.ok(html.includes('100%'), 'Execution 1 renders 100% passed cases');
});

test('Test Run view: sharedView retains details and notes, omits action buttons and viewDoc', () => {
    const tcLogin = {
        id: 'tc-login',
        title: 'Login Test Case',
        category: 'testcases',
        status: 'published',
        tcData: {
            steps: [{ action: 'Open login', expected: 'Shows form' }]
        }
    };
    const run = {
        id: 'run-shared',
        title: 'Sprint 24 Shared View',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-login'],
            snapshot: {
                'tc-login': [{ action: 'Open login', expected: 'Shows form' }]
            },
            results: {
                'tc-login': { 0: 'pass', note: 'Login note shared view verification.' }
            }
        }
    };

    const ctx = createTestRunViewerContext([tcLogin, run], true);
    const htmlShared = ctx.render(run, true);

    assert.ok(htmlShared.includes('<details open'), 'details open is retained in sharedView');
    assert.ok(htmlShared.includes('id="testrun-toggle-all"'), 'toggle button is retained in sharedView');
    assert.ok(htmlShared.includes('Collapse all'), 'Collapse all is present in sharedView');
    assert.ok(htmlShared.includes('Login note shared view verification.'), 'execution note text is visible in sharedView');
    assert.ok(!htmlShared.includes('data-onclick="viewDoc"'), 'no data-onclick="viewDoc" in sharedView');
    assert.ok(!htmlShared.includes('updateTestRunStep'), 'no updateTestRunStep in sharedView');
});

test('Test Run contracts and source hygiene: style selectors, release loop, traceRunOutcome intact', () => {
    const styleSource = fs.readFileSync(path.join(root, 'style.css'), 'utf8');
    const testRunCssBlock = styleSource.slice(
        styleSource.indexOf('/* Test Run Execution UI */'),
        styleSource.indexOf('/* Metric summary cards: Pass, Fail, Blocked, Untested */')
    );
    assert.ok(testRunCssBlock.includes('> summary'), 'style.css Test Run UI uses > summary');
    assert.ok(!testRunCssBlock.includes('> div:first-child'), 'style.css Test Run UI no longer contains > div:first-child');
    assert.ok(styleSource.includes('.text-sm.leading-relaxed'), 'Bauhaus .text-sm.leading-relaxed rule remains');

    const stateSource = fs.readFileSync(path.join(root, 'js/state.js'), 'utf8');
    assert.ok(stateSource.includes('totalSteps += steps.length'), 'evaluateReleaseReadiness totalSteps loop intact');

    const renderCoreSource = fs.readFileSync(path.join(root, 'js/render-core.js'), 'utf8');
    assert.ok(renderCoreSource.includes("values.every(value => value === 'pass')"), '_traceRunOutcome intact in render-core.js');
});

test('Test Run view: window.toggleAllTestRunCases toggles details open state, label, icon, and handles missing container', () => {
    const d1 = { tagName: 'DETAILS', open: true };
    const d2 = { tagName: 'DETAILS', open: true };
    const d3 = { tagName: 'DETAILS', open: true };
    const label = { textContent: 'Collapse all' };
    const icon = { className: 'fa-solid fa-chevron-up' };
    const mockElements = {
        'testrun-cases': { children: [d1, d2, d3] },
        'testrun-toggle-all-label': label,
        'testrun-toggle-all-icon': icon
    };
    const mockDoc = {
        getElementById: id => mockElements[id] || null
    };

    const ctx = createTestRunViewerContext([], false, mockDoc);

    // Call 1: collapse all
    ctx.toggleAllTestRunCases();
    assert.equal(d1.open, false);
    assert.equal(d2.open, false);
    assert.equal(d3.open, false);
    assert.equal(label.textContent, 'Expand all');
    assert.equal(icon.className, 'fa-solid fa-chevron-down');

    // Call 2: expand all
    ctx.toggleAllTestRunCases();
    assert.equal(d1.open, true);
    assert.equal(d2.open, true);
    assert.equal(d3.open, true);
    assert.equal(label.textContent, 'Collapse all');
    assert.equal(icon.className, 'fa-solid fa-chevron-up');

    // When #testrun-cases is missing, returns without throwing
    delete mockElements['testrun-cases'];
    assert.doesNotThrow(() => {
        ctx.toggleAllTestRunCases();
    });
});
