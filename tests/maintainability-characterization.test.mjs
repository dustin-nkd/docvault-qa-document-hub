import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createMemoryStorage, toPlain } from './harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function loadActionSeam(options = {}) {
    const localStorage = createMemoryStorage(options.localStorage);
    const documents = options.documents || [];
    let modalHtml = '';
    const context = vm.createContext({
        console,
        window: {},
        localStorage,
        GUEST_MODE: options.guest === true,
        documents,
        FOCUS_SIGNAL_KEYS: new Set(['critical', 'retest', 'stale', 'task', 'release']),
        getFocusWorkflow: (doc, signalKey) => doc.focusWorkflow?.[signalKey] || { owner: '', dueDate: '', snoozedUntil: '', resolvedAt: null },
        getFocusWorkflowStatus: workflow => workflow.snoozedUntil ? 'snoozed' : workflow.resolvedAt ? 'done' : 'active',
        escHtml: escapeHtml,
        t: key => key,
        showModal: html => { modalHtml = html; },
        setTimeout: callback => callback(),
        document: { getElementById: () => null },
        state: {},
        location: { pathname: '/' }
    });
    const sources = ['js/utils.js', 'js/actions.js', 'js/actions-focus.js']
        .filter(relativePath => fs.existsSync(path.join(root, relativePath)))
        .map(relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8'))
        .join('\n');
    vm.runInContext(sources +
        '\n;globalThis.__actionSeamTest = {' +
        'getSavedViews: _getSavedViews, setSavedViews: _setSavedViews,' +
        'focusTarget: _focusWorkflowTarget, showFocusModal: window.showFocusWorkflowModal' +
        '};', context, { filename: 'actions-seam.js' });
    return { api: context.__actionSeamTest, localStorage, getModalHtml: () => modalHtml };
}

function loadTrendSeam() {
    const context = vm.createContext({
        console,
        window: {},
        state: { trendsRange: 90 },
        debounce: callback => callback
    });
    const sources = ['js/render-core.js', 'js/render-trends.js']
        .filter(relativePath => fs.existsSync(path.join(root, relativePath)))
        .map(relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8'))
        .join('\n');
    vm.runInContext(sources +
        '\n;globalThis.__trendSeamTest = {' +
        'buckets: _trendBuckets, line: _trendLine, card: _trendCard' +
        '};', context, { filename: 'render-seam.js' });
    return context.__trendSeamTest;
}

test('saved views preserve valid JSON, recover from corruption, and isolate guest mode', () => {
    const normal = loadActionSeam();
    const views = [{ id: 'view-1', name: 'Open bugs', category: 'bug' }];
    normal.api.setSavedViews(views);
    assert.deepEqual(toPlain(normal.api.getSavedViews()), views);

    normal.localStorage.setItem('docvault_saved_views', '{broken');
    assert.deepEqual(toPlain(normal.api.getSavedViews()), []);

    const guest = loadActionSeam({ guest: true });
    guest.api.setSavedViews(views);
    assert.equal(guest.localStorage.getItem('docvault_saved_views'), null);
});

test('focus workflow rejects invalid/deleted targets and preserves safe modal fields', () => {
    const documents = [
        {
            id: 'doc-1',
            title: 'Checkout <script>alert(1)</script>',
            status: 'draft',
            focusWorkflow: {
                critical: { owner: 'QA "Lead"', dueDate: '2026-07-20', snoozedUntil: '2026-07-21', resolvedAt: null }
            }
        },
        { id: 'deleted', title: 'Deleted', status: 'deleted' }
    ];
    const harness = loadActionSeam({ documents });
    assert.equal(harness.api.focusTarget('doc-1', 'unknown'), null);
    assert.equal(harness.api.focusTarget('deleted', 'critical'), null);
    assert.equal(harness.api.focusTarget('doc-1', 'critical').doc.id, 'doc-1');

    harness.api.showFocusModal('doc-1', 'critical');
    const html = harness.getModalHtml();
    assert.match(html, /Checkout &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /value="QA &quot;Lead&quot;"/);
    assert.match(html, /value="2026-07-20"/);
    assert.match(html.replace(/&quot;/g, '"'), /saveFocusWorkflow\((?:'|")doc-1(?:'|"),(?:'|")critical(?:'|")\)/);
});

test('trend bucketing keeps boundary events and chart SVG/card structure stable', () => {
    const api = loadTrendSeam();
    assert.deepEqual(toPlain(api.buckets([0, 24, 25, 100], 0, 100, 4)), [2, 1, 0, 1]);

    const svg = api.line([0, 50, 100], '#34d399', {
        yMax: 100,
        yFmt: value => Math.round(value) + '%',
        xLabels: ['Apr 1', 'Apr 30']
    });
    assert.match(svg, /<svg viewBox="0 0 300 118"/);
    assert.match(svg, /<polyline points="28\.0,92\.0 160\.0,51\.0 292\.0,10\.0"/);
    assert.match(svg, />Apr 1<\/text>/);
    assert.match(svg, />Apr 30<\/text>/);

    const card = api.card('Pass rate', '<b>80%</b>', svg, 'Estimated');
    assert.match(card, /class="doc-card trend-card p-4"/);
    assert.match(card, /<span class="trend-estimate">Estimated<\/span>/);
    assert.match(card, /<p class="trend-caption"><b>80%<\/b><\/p>/);
});
