import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const TOAST_UI_ASSETS = [
    'vendor/toastui/toastui-editor.min.css',
    'vendor/toastui/toastui-editor-dark.min.css',
    'vendor/toastui/toastui-editor-all.min.js'
];

test('dashboard startup excludes the editor runtime and stays within its direct asset budget', () => {
    const html = read('index.html');
    for (const asset of TOAST_UI_ASSETS) assert.doesNotMatch(html, new RegExp(asset.replaceAll('/', '\\/')));

    const refs = [...html.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/g)]
        .map(match => match[1])
        .filter(value => !/^(?:[a-z]+:|\/\/|data:)/i.test(value));
    const bytes = [...new Set(refs)].reduce((total, relativePath) => {
        const absolutePath = path.join(root, relativePath);
        return total + (fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0);
    }, 0);
    // Raised from 850_000 for bug-lifecycle work, 880_000 for workspace registry
    // sync, 890_000 for backup resurrection tombstones, 895_000 for bug number deconfliction,
    // 900_000 for relational integrity and orphaned reference cleanup, 915_000 for
    // the Bauhaus design system UI switcher and lock screen styles, 930_000 for
    // Bauhaus App Shell and Dashboard Overview styling, 945_000 for
    // Document List, Explorer & Kanban Bauhaus styling, 955_000 for
    // Document Viewer and Category Viewers Bauhaus styling, 965_000 for
    // Document Editor and Template Picker Modal Bauhaus styling, 985_000 for
    // Focus Mode, Traceability Matrix, and Activity Log Bauhaus styling, 995_000 for
    // 1_015_000 for Bauhaus Search Modal, Category Editors, Subfolder Dropdowns, and Toast notifications, and
    // 1_025_000 for complete Bauhaus styling package (Release Cockpit, Quality Scorecard, Focus Modal, and Category Viewers).
    assert.ok(bytes <= 1_025_000, `Dashboard direct startup assets exceed 1025 KB: ${bytes} bytes`);
});

test('editor runtime remains offline-capable and is loaded through one shared lazy promise', () => {
    const utils = read('js/utils.js');
    const worker = read('sw.js');
    assert.match(utils, /function ensureToastUI\(/);
    assert.match(utils, /_toastUiLoadPromise/);
    for (const asset of TOAST_UI_ASSETS) {
        assert.match(utils, new RegExp(asset.replaceAll('/', '\\/')));
        assert.match(worker, new RegExp(asset.replaceAll('/', '\\/')));
    }
});

test('editor actions preserve markdown while the lazy runtime is still loading', () => {
    const utils = read('js/utils.js');
    const actions = ['js/actions-imports.js', 'js/actions-documents.js'].map(read).join('\\n');
    assert.match(utils, /function getEditorMarkdown\(\)/);
    assert.match(utils, /function setEditorMarkdown\(value\)/);
    assert.match(actions, /setEditorMarkdown\(md\)/);
    assert.doesNotMatch(actions, /window\.tuiEditor \? window\.tuiEditor\.getMarkdown\(\) : ''/);
});

test('content-only renders scope accessibility and favicon work to the changed subtree', () => {
    const core = read('js/render-core.js');
    assert.match(core, /enhanceInteractionSemantics\(c, false\)/);
    assert.match(core, /_restoreFaviconState\(c\)/);
    assert.match(core, /getElementById\('bottom-nav'\), false/);
    assert.doesNotMatch(core, /enhanceInteractionSemantics\(document\)/);
});
