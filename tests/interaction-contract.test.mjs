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

test('service worker version is bumped for the Vault V2 shell change', () => {
    assert.match(read('sw.js'), /const SW_VERSION = 'v43'/);
});

test('deployment blocks on the locked browser regression suite', () => {
    assert.ok(fs.existsSync(path.join(root, 'package-lock.json')));
    const workflow = read('.github/workflows/deploy.yml');
    assert.match(workflow, /run: npm ci/);
    assert.match(workflow, /run: npx playwright install --with-deps chromium/);
    assert.match(workflow, /run: npm run test:e2e/);
    assert.ok(workflow.indexOf('npm run test:e2e') < workflow.indexOf('peaceiris\/actions-gh-pages'));
});
