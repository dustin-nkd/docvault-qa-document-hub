import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createViewerCategoryRenderer(initialDocs = [], sharedView = false) {
    const context = vm.createContext({
        console,
        window: {},
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
        setDocs: (docs) => {
            context._currentDocs = docs;
            vm.runInContext('documents = _currentDocs;', context);
        }
    };
}

test('Test Case view: Checkout renders structured card with module, pre-condition, data, steps, Needs attention, run title, bug title, no viewer-container, no markdown table', () => {
    const tcCheckout = {
        id: 'tc-checkout',
        title: 'Checkout — Credit Card Payment',
        category: 'testcases',
        status: 'published',
        tcData: {
            module: 'Checkout',
            precond: 'The cart contains at least one product',
            data: 'card: 4242 4242 4242 4242',
            steps: [
                { action: 'Add a product to the cart and open Checkout', expected: 'Display the correct subtotal' },
                { action: 'Enter valid card details and click "Pay Now"', expected: 'Payment succeeds' },
                { action: 'Attempt payment with declined card', expected: 'Show "Payment declined"' }
            ]
        },
        content: '# Checkout\n\n| Step | Action | Expected Result |\n|---|---|---|\n| 1 | Add item | Subtotal |'
    };
    const runSprint = {
        id: 'run-sprint',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1700000000000,
        runData: {
            targetIds: [tcCheckout.id],
            results: {
                [tcCheckout.id]: { 0: 'pass', 1: 'fail', 2: 'blocked' }
            }
        }
    };
    const bugCheckout = {
        id: 'bug-checkout',
        bugNumber: 2,
        title: 'Checkout — Declined payment returns HTTP 500',
        category: 'bug',
        status: 'published',
        bugData: {
            foundInTc: tcCheckout.id,
            severity: 'Major'
        }
    };

    const docs = [tcCheckout, runSprint, bugCheckout];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(tcCheckout);

    // Module, pre-condition, test data
    assert.ok(html.includes('Checkout'), 'Should render module Checkout');
    assert.ok(html.includes('The cart contains at least one product'), 'Should render pre-condition');
    assert.ok(html.includes('card: 4242 4242 4242 4242'), 'Should render test data');

    // Steps
    assert.ok(html.includes('Add a product to the cart and open Checkout'), 'Should render step 1 action');
    assert.ok(html.includes('Enter valid card details and click &quot;Pay Now&quot;'), 'Should render step 2 action');
    assert.ok(html.includes('Attempt payment with declined card'), 'Should render step 3 action');

    // Run & outcome badge
    assert.ok(html.includes('Needs attention'), 'Outcome should be Needs attention');
    assert.ok(html.includes('Sprint 24 — Regression Run'), 'Should display run title');

    // Linked bug
    assert.ok(html.includes('Checkout — Declined payment returns HTTP 500'), 'Should display linked bug title');

    // No markdown container or table
    assert.ok(!html.includes('id="viewer-container"'), 'Should not contain viewer-container');
    assert.ok(!html.includes('| Step |'), 'Should not contain markdown table markup');
});

test('Test Case view: Search has no test data block and badge is Incomplete', () => {
    const tcSearch = {
        id: 'tc-search',
        title: 'Product Search & Filter',
        category: 'testcases',
        status: 'published',
        tcData: {
            module: 'Catalog',
            precond: 'The catalog contains at least 50 products',
            data: '',
            steps: [
                { action: 'Enter "t-shirt" in search', expected: 'Results returned' },
                { action: 'Apply filter', expected: 'Filtered results' }
            ]
        },
        content: '# Search'
    };
    const runSprint = {
        id: 'run-sprint',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1700000000000,
        runData: {
            targetIds: [tcSearch.id],
            results: {
                [tcSearch.id]: { 0: 'pass', 1: 'untested' }
            }
        }
    };

    const docs = [tcSearch, runSprint];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(tcSearch);

    // No test data block
    assert.ok(!html.includes('Test Data'), 'Should not render Test Data block when data is empty');

    // Badge Incomplete
    assert.ok(html.includes('Incomplete'), 'Outcome badge should be Incomplete');
});

test('Test Case view: Login badge is Passed', () => {
    const tcLogin = {
        id: 'tc-login',
        title: 'Login — Valid & Invalid Credentials',
        category: 'testcases',
        status: 'published',
        tcData: {
            module: 'Authentication',
            precond: 'An active user account exists',
            data: 'user: demo / pass: 123',
            steps: [
                { action: 'Open /login and submit valid creds', expected: 'Login succeeds' },
                { action: 'Enter invalid password three times', expected: 'CAPTCHA appears' }
            ]
        },
        content: '# Login'
    };
    const runSprint = {
        id: 'run-sprint',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1700000000000,
        runData: {
            targetIds: [tcLogin.id],
            results: {
                [tcLogin.id]: { 0: 'pass', 1: 'pass' }
            }
        }
    };

    const docs = [tcLogin, runSprint];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(tcLogin);

    assert.ok(html.includes('Passed'), 'Outcome badge should be Passed');
});

test('Test Case view: newer run updatedAt determines outcome badge', () => {
    const tc = {
        id: 'tc-retest',
        title: 'Flaky Feature Case',
        category: 'testcases',
        status: 'published',
        tcData: {
            module: 'Orders',
            steps: [{ action: 'Perform action', expected: 'Expected result' }]
        }
    };
    const runOlder = {
        id: 'run-older',
        title: 'Older Test Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1000,
        runData: {
            targetIds: [tc.id],
            results: { [tc.id]: { 0: 'pass' } }
        }
    };
    const runNewer = {
        id: 'run-newer',
        title: 'Newer Test Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 2000,
        runData: {
            targetIds: [tc.id],
            results: { [tc.id]: { 0: 'fail' } }
        }
    };

    const docs = [tc, runOlder, runNewer];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(tc);

    assert.ok(html.includes('>Needs attention</span>'), 'Newer failed run should determine Needs attention badge');
    assert.ok(!html.includes('>Passed</span>'), 'Older passed run should be superseded');
});

test('Test Case view: sharedView contains no data-onclick="viewDoc"', () => {
    const tc = {
        id: 'tc-shared',
        title: 'Shared View Case',
        category: 'testcases',
        status: 'published',
        tcData: {
            module: 'Checkout',
            steps: [{ action: 'Do step', expected: 'Expect' }]
        }
    };
    const run = {
        id: 'run-shared',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1000,
        runData: { targetIds: [tc.id], results: { [tc.id]: { 0: 'pass' } } }
    };
    const bug = {
        id: 'bug-shared',
        title: 'Checkout — Declined payment returns HTTP 500',
        category: 'bug',
        status: 'published',
        bugData: { foundInTc: tc.id }
    };

    const docs = [tc, run, bug];
    const { render } = createViewerCategoryRenderer(docs);
    const htmlShared = render(tc, true);

    assert.ok(!htmlShared.includes('data-onclick="viewDoc'), 'sharedView must contain no data-onclick="viewDoc"');
    assert.ok(htmlShared.includes('Sprint 24 — Regression Run'), 'Should still show run title as text');
    assert.ok(htmlShared.includes('Checkout — Declined payment returns HTTP 500'), 'Should still show bug title as text');
});

test('Test Case view: case without tcData but with content has viewer-container and no step card', () => {
    const tcNotesOnly = {
        id: 'tc-notes-only',
        title: 'Notes Only Document',
        category: 'testcases',
        status: 'published',
        content: '## Notes only'
    };

    const docs = [tcNotesOnly];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(tcNotesOnly);

    assert.ok(html.includes('id="viewer-container"'), 'Should render viewer-container for markdown content');
    assert.ok(!html.includes('testcase-viewer-card'), 'Should not render step card for unstructured testcase');
    assert.ok(!html.includes('No steps yet.'), 'Should not render step table');
});
