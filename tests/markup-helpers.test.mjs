import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadMarkupHelpers() {
    const context = vm.createContext({
        console,
        window: {},
        setTimeout,
        clearTimeout,
        btoa: globalThis.btoa,
        atob: globalThis.atob
    });
    const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') +
        '\n;globalThis.__markupTest = {' +
        'actionCode, actionAttr, decodeActionArgument, renderActionButton' +
        '};';
    vm.runInContext(source, context, { filename: 'js/utils.js' });
    return context.__markupTest;
}

test('delegated action arguments round-trip hostile punctuation without executable interpolation', () => {
    const api = loadMarkupHelpers();
    const value = 'view\\");deleteSavedView(\\"owned\\");\\\\next';
    const code = api.actionCode('applySavedView', value);
    const serializedArg = code.slice(code.indexOf('(') + 1, -1);

    assert.equal(api.decodeActionArgument(serializedArg), value);
    assert.equal(api.actionAttr('applySavedView', value).includes('"'), false);
    assert.throws(() => api.actionCode('bad.name', value), /Invalid delegated action name/);
});

test('shared action button escapes action, label, title, class, and icon fields', () => {
    const api = loadMarkupHelpers();
    const html = api.renderActionButton({
        className: 'btn-p" autofocus',
        action: 'saveFocusWorkflow',
        args: ['doc\\" onclick=\\"pwn', 'critical'],
        label: '<Save>',
        icon: 'fa-solid fa-check" onload="pwn',
        title: 'Save "now"'
    });

    assert.match(html, /^<button type="button"/);
    assert.match(html, /class="btn-p&quot; autofocus"/);
    assert.match(html, /data-onclick="saveFocusWorkflow\(&quot;/);
    assert.match(html, /,&quot;critical&quot;\)"/);
    assert.match(html, /title="Save &quot;now&quot;"/);
    assert.match(html, /<span>&lt;Save&gt;<\/span>/);
    assert.doesNotMatch(html, /onload="pwn"/);
});