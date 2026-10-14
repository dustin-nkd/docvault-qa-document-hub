import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createReleaseTestContext(initialDocs = [], sharedView = false) {
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
        evaluateReadiness: (doc, docs) => {
            context._evalDoc = doc;
            context._evalDocs = docs;
            return vm.runInContext('evaluateReleaseReadiness(_evalDoc, _evalDocs || documents)', context);
        },
        getQuality: (doc, docs) => {
            context._evalDoc = doc;
            context._evalDocs = docs;
            return vm.runInContext('getReleaseQuality(_evalDoc, _evalDocs || documents)', context);
        },
        render: (doc, isShared) => {
            if (isShared !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
            }
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        }
    };
}

test('Release view: main fixture renders NO-GO gate, quality score, closed details scorecard, no metric cards, and release notes', () => {
    const testRun = {
        id: 'run-1',
        category: 'testrun',
        title: 'Sprint 24 - Regression Run',
        status: 'published',
        runData: {
            targetIds: [],
            results: {}
        }
    };

    const criticalBug = {
        id: 'bug-1',
        category: 'bug',
        title: 'Checkout issue',
        status: 'open',
        bugStatus: 'open',
        bugData: {
            severity: 'Critical'
        }
    };

    const release = {
        id: 'rel-1',
        category: 'release',
        title: 'Release 2.4.0',
        content: '## Highlights',
        releaseData: {
            version: 'v2.4.0',
            status: 'in-progress',
            linkedRuns: ['run-1'],
            linkedBugs: ['bug-1'],
            linkedEnvs: []
        }
    };

    const docs = [release, testRun, criticalBug];
    const ctx = createReleaseTestContext(docs, false);

    const readiness = ctx.evaluateReadiness(release, docs);
    const quality = ctx.getQuality(release, docs);
    const html = ctx.render(release, false);

    assert.equal(readiness.outcome, 'no-go', 'readiness outcome should be no-go');
    assert.ok(html.includes('v2.4.0'), 'HTML renders release version v2.4.0');
    assert.ok(html.includes('NO-GO'), 'HTML renders gate label matching readiness.outcome (NO-GO)');
    assert.ok(html.includes('Pass rate threshold'), 'HTML renders Pass rate threshold check');
    assert.ok(html.includes('Defect policy'), 'HTML renders Defect policy check');
    assert.ok(html.includes(String(quality.score)), 'HTML renders quality score value');

    assert.ok(html.includes('<details class="quality-scorecard"'), 'scorecard is a details element');
    assert.ok(!html.includes('quality-scorecard" open'), 'details scorecard must not have open attribute');
    assert.ok(html.includes('quality-dimensions'), 'details scorecard retains quality-dimensions');

    assert.ok(!html.includes('Total Bugs'), 'does not contain removed Total Bugs card');
    assert.ok(!html.includes('>Test Runs</div>'), 'does not contain removed Test Runs metric card');

    assert.ok(html.includes('Release Notes'), 'renders Release Notes section');
    const containerMatches = html.match(/id="viewer-container"/g);
    assert.equal(containerMatches?.length, 1, 'renders exactly one viewer-container');
});

test('Release view: empty fixture renders INSUFFICIENT EVIDENCE, no viewer-container, and closed details scorecard', () => {
    const emptyRelease = {
        id: 'rel-empty',
        category: 'release',
        title: 'Release Empty',
        content: '   ',
        releaseData: {
            version: 'v1.0.0',
            status: 'planning',
            linkedRuns: [],
            linkedBugs: [],
            linkedEnvs: []
        }
    };

    const docs = [emptyRelease];
    const ctx = createReleaseTestContext(docs, false);

    const readiness = ctx.evaluateReadiness(emptyRelease, docs);
    const html = ctx.render(emptyRelease, false);

    assert.equal(readiness.outcome, 'insufficient', 'readiness outcome should be insufficient');
    assert.ok(html.includes('INSUFFICIENT EVIDENCE'), 'renders INSUFFICIENT EVIDENCE gate');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container when content is whitespace');
    assert.ok(html.includes('<details class="quality-scorecard"'), 'scorecard is a details element');
    assert.ok(!html.includes('quality-scorecard" open'), 'details scorecard must not have open attribute');
});

test('Release view: sharedView renders run title and no data-onclick="viewDoc"', () => {
    const testRun = {
        id: 'run-1',
        category: 'testrun',
        title: 'Sprint 24 - Regression Run',
        status: 'published',
        runData: {
            targetIds: [],
            results: {}
        }
    };

    const criticalBug = {
        id: 'bug-1',
        category: 'bug',
        title: 'Checkout issue',
        status: 'open',
        bugStatus: 'open',
        bugData: {
            severity: 'Critical'
        }
    };

    const release = {
        id: 'rel-1',
        category: 'release',
        title: 'Release 2.4.0',
        content: '## Highlights',
        releaseData: {
            version: 'v2.4.0',
            status: 'in-progress',
            linkedRuns: ['run-1'],
            linkedBugs: ['bug-1'],
            linkedEnvs: []
        }
    };

    const docs = [release, testRun, criticalBug];
    const ctx = createReleaseTestContext(docs, true);
    const htmlShared = ctx.render(release, true);

    assert.ok(htmlShared.includes('Sprint 24 - Regression Run'), 'renders linked run title in shared view');
    assert.ok(!htmlShared.includes('data-onclick="viewDoc"'), 'shared view contains no data-onclick="viewDoc"');
});
