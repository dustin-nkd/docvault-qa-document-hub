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

test('Structured bug view: Bug 2 renders structured card, triage, no viewer-container, handles sharedView', () => {
    const runSprint = {
        id: 'run-sprint24',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published'
    };
    const tcCheckout = {
        id: 'tc-checkout',
        title: 'Checkout — Credit Card Payment',
        category: 'testcases',
        status: 'published'
    };
    const bug2Data = {
        env: 'Staging · build #482',
        browser: 'Chrome 120',
        severity: 'Major',
        priority: 'P2',
        precond: 'The user is at the payment step',
        steps: [
            'Add a product to the cart and open Checkout',
            'Enter valid card details and click "Pay Now"',
            'Attempt payment with the declined test card (4000 0000 0000 0002)'
        ],
        expected: 'Show "Payment declined", keep the order Pending, and allow retry',
        actual: 'The server returns HTTP 500 without a user message and leaves the order in Processing',
        foundInRun: runSprint.id,
        foundInTc: tcCheckout.id,
        foundInStep: 1
    };
    const bug2 = {
        id: 'gd_bug_2',
        bugNumber: 2,
        title: 'Checkout — Declined payment returns HTTP 500',
        category: 'bug',
        status: 'published',
        bugStatus: 'in-progress',
        bugData: bug2Data,
        content: '# Checkout — Declined payment returns HTTP 500\n\n> Reported from test run **Sprint 24 — Regression Run**'
    };

    const renderer = createViewerCategoryRenderer([runSprint, tcCheckout, bug2], false);
    const html = renderer.render(bug2, false);

    assert.ok(html.includes('In Progress'), 'renders In Progress');
    assert.ok(html.includes('Major'), 'renders Major');
    assert.ok(html.includes('P2'), 'renders P2');
    assert.ok(html.includes('Staging · build #482'), 'renders env');
    assert.ok(html.includes('Chrome 120'), 'renders browser');
    assert.ok(html.includes('The user is at the payment step'), 'renders precond');
    assert.ok(html.includes('Add a product to the cart and open Checkout'), 'renders step 1');
    assert.ok(html.includes('Enter valid card details and click &quot;Pay Now&quot;'), 'renders step 2');
    assert.ok(html.includes('Attempt payment with the declined test card (4000 0000 0000 0002)'), 'renders step 3');
    assert.ok(html.includes('Show &quot;Payment declined&quot;, keep the order Pending, and allow retry'), 'renders expected');
    assert.ok(html.includes('The server returns HTTP 500 without a user message and leaves the order in Processing'), 'renders actual');
    assert.ok(html.includes('Step 2'), 'renders Step 2 from 0-based foundInStep 1');
    assert.ok(html.includes('BUG-002'), 'renders BUG-002');
    assert.ok(html.includes('Defect triage'), 'renders Defect triage');
    assert.ok(html.includes('Steps to Reproduce'), 'renders Steps to Reproduce label');
    assert.ok(html.includes('Sprint 24 — Regression Run'), 'renders run title');
    assert.ok(html.includes('Checkout — Credit Card Payment'), 'renders case title');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container for structured bug');
    assert.ok(!html.includes('Reported from test run'), 'does not render markdown content blockquote');

    // sharedView tests
    const htmlShared = renderer.render(bug2, true);
    assert.ok(htmlShared.includes('Sprint 24 — Regression Run'), 'sharedView includes run title');
    assert.ok(htmlShared.includes('Checkout — Credit Card Payment'), 'sharedView includes case title');
    assert.ok(htmlShared.includes('Step 2'), 'sharedView includes Step 2');
    assert.ok(!htmlShared.includes('data-onclick="viewDoc"'), 'sharedView has no data-onclick="viewDoc"');
});

test('Bug 1 shape: Open and Critical, no foundInTc, does not show Checkout TC title', () => {
    const bug1Data = {
        env: 'Staging',
        browser: 'Chrome 120',
        severity: 'Critical',
        priority: 'P1',
        precond: 'The cart contains at least two products',
        steps: ['Add two products to the cart', 'Open the Checkout page'],
        expected: 'The cart retains all products',
        actual: 'The cart becomes empty and must be rebuilt'
    };
    const bug1 = {
        id: 'gd_bug_1',
        bugNumber: 1,
        title: 'Cart loses products after refreshing Checkout',
        category: 'bug',
        status: 'published',
        bugStatus: 'open',
        bugData: bug1Data,
        content: '# Cart loses products'
    };

    const renderer = createViewerCategoryRenderer([bug1], false);
    const html = renderer.render(bug1, false);

    assert.ok(html.includes('Open'), 'renders Open');
    assert.ok(html.includes('Critical'), 'renders Critical');
    assert.ok(!html.includes('Checkout — Credit Card Payment'), 'does not render Checkout case title');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container for structured bug');
});

test('Unstructured notes-only bug: renders viewer-container and retains notes', () => {
    const notesBug = {
        id: 'bug_notes',
        title: 'Notes only bug',
        category: 'bug',
        status: 'published',
        bugStatus: 'open',
        content: '## Notes only'
    };

    const renderer = createViewerCategoryRenderer([notesBug], false);
    const html = renderer.render(notesBug, false);

    assert.ok(html.includes('id="viewer-container"'), 'renders viewer-container for notes-only bug');
});

test('Bug workflow status normalization: confirmed becomes Open, testing becomes Retest', () => {
    const bugConfirmed = {
        id: 'bug_confirmed',
        title: 'Confirmed bug',
        category: 'bug',
        status: 'published',
        bugStatus: 'confirmed',
        content: '## Notes only'
    };
    const bugTesting = {
        id: 'bug_testing',
        title: 'Testing bug',
        category: 'bug',
        status: 'published',
        bugStatus: 'testing',
        content: '## Notes only'
    };

    const renderer = createViewerCategoryRenderer([bugConfirmed, bugTesting], false);
    const htmlConfirmed = renderer.render(bugConfirmed, false);
    assert.ok(htmlConfirmed.includes('Open'), 'confirmed status normalizes to Open');

    const htmlTesting = renderer.render(bugTesting, false);
    assert.ok(htmlTesting.includes('Retest'), 'testing status normalizes to Retest');
});
