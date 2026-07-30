import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const runtimeFiles = [
    'index.html',
    ...fs.readdirSync(path.join(root, 'js'))
        .filter(name => name.endsWith('.js'))
        .sort()
        .map(name => path.join('js', name))
];

test('runtime markup uses CSS hover states instead of delegated mouse handlers', () => {
    const source = runtimeFiles.map(read).join('\n');
    assert.equal((source.match(/data-onmouseenter=/g) || []).length, 0);
    assert.equal((source.match(/data-onmouseleave=/g) || []).length, 0);

    const events = read('js/events.js');
    assert.doesNotMatch(events, /addEventListener\(['"]mouseover['"]/);
    assert.doesNotMatch(events, /addEventListener\(['"]mouseout['"]/);

    const css = read('style.css');
    for (const className of ['ui-hover-card', 'ui-hover-card-h', 'ui-hover-bg2', 'ui-hover-danger', 'ui-hover-text', 'ui-hover-accent']) {
        assert.match(css, new RegExp('\\.' + className.replace(/-/g, '\\-') + ':hover'));
    }
});

test('runtime markup contains no native inline click handlers', () => {
    for (const relativePath of runtimeFiles) {
        const source = read(relativePath);
        const matches = [...source.matchAll(/(?:^|\s)onclick=/gm)];
        assert.equal(matches.length, 0, relativePath + ' still contains native onclick handlers');
    }
});

test('user-controlled editor actions use the shared safe action serializer', () => {
    const editor = [read('js/render-editor-categories.js'), read('js/render-editor.js')].join('\\n');
    assert.match(editor, /actionAttr\('selectSubfolder', f\)/);
    assert.match(editor, /actionAttr\('selectCustomOption', id, o\.value, o\.label, onChangeCode\)/);
    assert.doesNotMatch(editor, /selectSubfolder\('\$\{escHtml/);
    assert.doesNotMatch(editor, /selectCustomOption\('\$\{id\}/);
});

test('service worker version is bumped for the strict CSP shell change', () => {
    assert.match(read('sw.js'), /const SW_VERSION = 'v47'/);
});

test('the runtime ships a single dark theme with no light-theme leftovers', () => {
    // A half-removed theme is what made the markdown viewer crash: a container
    // hardcoded to one theme while the runtime was told to use another. Keep the
    // theme surface at exactly one value so that mismatch cannot reappear.
    for (const relativePath of [...runtimeFiles, 'style.css']) {
        const source = read(relativePath);
        assert.doesNotMatch(source, /\[data-theme=["']light["']\]/,
            relativePath + ' still carries light-theme styling');
        assert.doesNotMatch(source, /toggleTheme|initTheme/,
            relativePath + ' still references the removed theme toggle');
        // The stored preference may only be cleaned up, never read or written.
        assert.doesNotMatch(source, /(?:get|set)Item\(\s*['"]qahub_theme['"]/,
            relativePath + ' still reads or writes the removed theme preference');
    }
    assert.match(read('index.html'), /<html[^>]+data-theme="dark"/);
    // Toast UI throws on a non-'light' falsy theme, so it must be passed a literal.
    assert.doesNotMatch(read('js/render-core.js'), /theme:\s*(?:undefined|null)/);
});

test('deployment blocks on the locked browser regression suite', () => {
    assert.ok(fs.existsSync(path.join(root, 'package-lock.json')));
    const workflow = read('.github/workflows/deploy.yml');
    assert.match(workflow, /run: npm ci/);
    assert.match(workflow, /run: npx playwright install --with-deps chromium/);
    assert.match(workflow, /run: npm run test:e2e/);
    assert.ok(workflow.indexOf('npm run test:e2e') < workflow.indexOf('peaceiris\/actions-gh-pages'));
});
