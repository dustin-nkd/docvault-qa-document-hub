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
    assert.ok(bytes <= 850_000, `Dashboard direct startup assets exceed 850 KB: ${bytes} bytes`);
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
