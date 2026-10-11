import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createViewerCategoryRenderer(initialDocs = []) {
    const context = vm.createContext({
        console,
        window: {},
        state: {},
        URLSearchParams,
        location: { search: '' }
    });
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-viewer-categories.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);

    return {
        render: (doc) => {
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        },
        setDocs: (docs) => {
            context._currentDocs = docs;
            vm.runInContext('documents = _currentDocs;', context);
        }
    };
}

test('Test Plan view: renders Passed, Needs attention, Incomplete badges, notes container, and progress text', () => {
    const tcLogin = {
        id: 'tc-login',
        title: 'Login — Valid & Invalid Credentials',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Enter creds', expected: 'Logged in' }, { action: 'Bad creds', expected: 'Error' }] }
    };
    const tcCheckout = {
        id: 'tc-checkout',
        title: 'Checkout — Credit Card Payment',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Add item', expected: 'Added' }, { action: 'Pay', expected: 'Success' }, { action: 'Confirm', expected: 'Done' }] }
    };
    const tcSearch = {
        id: 'tc-search',
        title: 'Product Search & Filter',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Search', expected: 'Results' }, { action: 'Filter', expected: 'Filtered' }] }
    };
    const runSprint = {
        id: 'run-sprint',
        title: 'Sprint 24 — Regression Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1700000000000,
        runData: {
            targetIds: [tcLogin.id, tcCheckout.id, tcSearch.id],
            results: {
                [tcLogin.id]: { 0: 'pass', 1: 'pass', note: 'All pass' },
                [tcCheckout.id]: { 0: 'pass', 1: 'fail', 2: 'blocked' },
                [tcSearch.id]: { 0: 'pass', 1: 'untested' }
            }
        }
    };
    const plan = {
        id: 'plan-1',
        title: 'Release v2.4.0 Test Plan',
        category: 'testplan',
        status: 'published',
        tcPlanData: {
            linkedTCs: [tcLogin.id, tcCheckout.id, tcSearch.id],
            linkedRuns: [runSprint.id]
        },
        content: '## Scope\nRun full regression before release.\n\n## Strategy\nExploratory and automated tests.\n\n## Timeline\nCode freeze T-3.'
    };

    const docs = [tcLogin, tcCheckout, tcSearch, runSprint, plan];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(plan);

    // Badges
    assert.ok(html.includes('Passed'), 'Should have Passed badge for Login');
    assert.ok(html.includes('Needs attention'), 'Should have Needs attention badge for Checkout');
    assert.ok(html.includes('Incomplete'), 'Should have Incomplete badge for Search');
    assert.ok(!html.includes('>Covered<'), 'Should not contain >Covered< badge');
    assert.ok(!html.includes('>Not run<'), 'Should not contain >Not run< badge');

    // Progress and notes container
    assert.ok(html.includes('3 / 3 in a run'), 'Should display "3 / 3 in a run"');
    assert.ok(html.includes('id="viewer-container"'), 'Should render viewer-container when content is non-empty');
    assert.ok(html.includes('>Notes<'), 'Should display Notes section title');
    assert.ok(!html.includes('>Release Notes<'), 'Should not display Release Notes title');
});

test('Test Plan view: empty or whitespace content does not render viewer-container', () => {
    const tc = {
        id: 'tc-1',
        title: 'Sample Case',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Do step', expected: 'OK' }] }
    };
    const planEmpty = {
        id: 'plan-empty',
        title: 'Empty Notes Plan',
        category: 'testplan',
        status: 'published',
        tcPlanData: { linkedTCs: [tc.id], linkedRuns: [] },
        content: ''
    };
    const planWhitespace = {
        id: 'plan-ws',
        title: 'Whitespace Notes Plan',
        category: 'testplan',
        status: 'published',
        tcPlanData: { linkedTCs: [tc.id], linkedRuns: [] },
        content: '   \n\t  '
    };

    const { render, setDocs } = createViewerCategoryRenderer([tc, planEmpty]);
    const htmlEmpty = render(planEmpty);
    assert.ok(!htmlEmpty.includes('viewer-container'), 'Empty content should not render viewer-container');
    assert.ok(!htmlEmpty.includes('>Notes<'), 'Empty content should not render Notes label');

    setDocs([tc, planWhitespace]);
    const htmlWhitespace = render(planWhitespace);
    assert.ok(!htmlWhitespace.includes('viewer-container'), 'Whitespace content should not render viewer-container');
    assert.ok(!htmlWhitespace.includes('>Notes<'), 'Whitespace content should not render Notes label');
});

test('Test Plan view: case not in any linked run is Incomplete even if unlinked run passed it', () => {
    const tc1 = {
        id: 'tc-1',
        title: 'Linked Case in Linked Run',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
    };
    const tc2 = {
        id: 'tc-2',
        title: 'Linked Case Not In Linked Run',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Step 1', expected: 'Pass' }] }
    };
    const runLinked = {
        id: 'run-linked',
        title: 'Linked Test Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 1000,
        runData: {
            targetIds: [tc1.id],
            results: { [tc1.id]: { 0: 'pass' } }
        }
    };
    const runUnlinked = {
        id: 'run-unlinked',
        title: 'Unlinked Test Run That Passed tc2',
        category: 'testrun',
        status: 'published',
        updatedAt: 2000,
        runData: {
            targetIds: [tc2.id],
            results: { [tc2.id]: { 0: 'pass' } }
        }
    };
    const plan = {
        id: 'plan-partial',
        title: 'Plan With Only runLinked Linked',
        category: 'testplan',
        status: 'published',
        tcPlanData: {
            linkedTCs: [tc1.id, tc2.id],
            linkedRuns: [runLinked.id]
        },
        content: 'Scope'
    };

    const docs = [tc1, tc2, runLinked, runUnlinked, plan];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(plan);

    // Find the badge following tc2 title
    const tc2Idx = html.indexOf(tc2.title);
    assert.ok(tc2Idx !== -1, 'tc2 title must be in HTML');
    const tc2HtmlChunk = html.slice(tc2Idx, tc2Idx + 300);
    assert.ok(tc2HtmlChunk.includes('Incomplete'), 'tc2 must have Incomplete badge because runUnlinked is not in linkedRuns');
    assert.ok(!tc2HtmlChunk.includes('Passed'), 'tc2 must NOT have Passed badge');
});

test('Test Plan view: newer linked run updatedAt determines outcome badge', () => {
    const tc = {
        id: 'tc-retest',
        title: 'Flaky Feature Case',
        category: 'testcases',
        status: 'published',
        tcData: { steps: [{ action: 'Do test', expected: 'Work' }] }
    };
    const runOlder = {
        id: 'run-old',
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
        id: 'run-new',
        title: 'Newer Test Run',
        category: 'testrun',
        status: 'published',
        updatedAt: 2000,
        runData: {
            targetIds: [tc.id],
            results: { [tc.id]: { 0: 'fail' } }
        }
    };
    const plan = {
        id: 'plan-retest',
        title: 'Plan With Two Runs',
        category: 'testplan',
        status: 'published',
        tcPlanData: {
            linkedTCs: [tc.id],
            // Older listed first
            linkedRuns: [runOlder.id, runNewer.id]
        },
        content: 'Plan notes'
    };

    const docs = [tc, runOlder, runNewer, plan];
    const { render } = createViewerCategoryRenderer(docs);
    const html = render(plan);

    assert.ok(html.includes('>Needs attention</span>'), 'Newer run failed, so badge must be Needs attention');
    assert.ok(!html.includes('>Passed</span>'), 'Badge should not be Passed despite older run passing');

    // Test with reverse linkedRuns order to verify timestamp sorting
    plan.tcPlanData.linkedRuns = [runNewer.id, runOlder.id];
    const htmlReversed = render(plan);
    assert.ok(htmlReversed.includes('>Needs attention</span>'), 'Array order does not affect timestamp priority');
    assert.ok(!htmlReversed.includes('>Passed</span>'), 'Array order does not affect timestamp priority');
});
