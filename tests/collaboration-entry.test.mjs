// CF-P7-013 — the lazy entry point and its wiring.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openCollaboration, closeCollaboration, CHROME_ID }
    from '../js/collaboration/entry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        id: '', hidden: false, disabled: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
        addEventListener() {},
        focus() {},
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('.')) return node.className.split(' ').includes(selector.slice(1));
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    if (attribute) {
        const value = node.getAttribute(attribute[1]);
        return attribute[2] === undefined ? value !== null : value === attribute[2];
    }
    return node.tagName === selector;
};

function documentWithRoot() {
    const container = element('div');
    container.id = 'collaboration-root';
    container.hidden = true;
    return {
        createElement: element,
        getElementById(id) { return id === 'collaboration-root' ? container : null; },
        container
    };
}

const available = { available: true, reason: 'cloudflare-deployment' };
const workspaces = [{
    workspaceId: '55555555-5555-4555-8555-555555555555',
    displayName: 'Platform QA', role: 'editor'
}];

// ── laziness, which is the whole budget ──────────────────────────────────────

test('no collaboration module is referenced by a script tag', () => {
    assert.equal(/<script[^>]+js\/collaboration\//.test(read('index.html')), false);
});

test('the eager deployment module imports collaboration only inside a handler', () => {
    const source = read('js/deployment.js');
    assert.equal(/^import\s/m.test(source), false, 'a top-level import would spend the budget');
    assert.match(source, /import\('\.\/collaboration\/entry\.js'\)/);
    const handlerAt = source.indexOf("addEventListener('click'");
    const importAt = source.indexOf("import('./collaboration/entry.js')");
    assert.ok(handlerAt > -1 && importAt > handlerAt,
        'the dynamic import is not inside the click handler');
});

test('the opener ships hidden and is revealed only where collaboration can run', () => {
    const markup = read('index.html');
    assert.match(markup, /id="collaboration-open"[^>]*hidden/);
    const source = read('js/deployment.js');
    assert.match(source, /if \(!availability\.available\) \{\s*opener\.hidden = true;/);
});

test('the service worker precaches no collaboration module', () => {
    assert.equal(/collaboration/.test(read('sw.js')), false);
});

test('a failed load re-enables the opener rather than breaking the page', () => {
    assert.match(read('js/deployment.js'), /catch\(function \(\) \{[\s\S]{0,200}opener\.disabled = false;/);
});

// ── what the entry renders ───────────────────────────────────────────────────

test('refuses to mount where the deployment cannot support collaboration', () => {
    const doc = documentWithRoot();
    assert.equal(openCollaboration({
        document: doc, deployment: { available: false, reason: 'github-pages' }
    }), null);
});

test('an unknown session renders loading, not a guess', () => {
    const doc = documentWithRoot();
    openCollaboration({ document: doc, deployment: available });
    assert.equal(doc.container.children[0].getAttribute('data-collab-state'), 'loading');
});

test('a signed-out visitor is offered a sign-in, not an empty state', () => {
    const doc = documentWithRoot();
    openCollaboration({
        document: doc, deployment: available, session: { authenticated: false }
    });
    const state = doc.container.children[0];
    assert.equal(state.getAttribute('data-collab-state'), 'unauthorized');
    assert.notEqual(state.querySelector('[data-collab-action="sign-in"]'), null);
});

test('a signed-in visitor gets the chrome, with the workspace readable', () => {
    const doc = documentWithRoot();
    openCollaboration({
        document: doc, deployment: available,
        session: { authenticated: true, login: 'dustin-nkd' }, workspaces
    });
    const chrome = doc.container.children[0];
    assert.equal(chrome.id, CHROME_ID);
    assert.notEqual(chrome.querySelector('[data-collab-surface="workspace-switcher"]'), null);
    assert.notEqual(chrome.querySelector('[data-collab-surface="account-menu"]'), null);
});

test('a blocked or missing store reads as no selection rather than throwing', () => {
    const doc = documentWithRoot();
    const hostile = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
    const container = openCollaboration({
        document: doc, deployment: available, session: { authenticated: true, login: 'dustin-nkd' },
        workspaces, storage: hostile, environment: 'preview', subject: 'u1'
    });
    assert.notEqual(container, null);
});

test('closing leaves nothing behind', () => {
    const doc = documentWithRoot();
    openCollaboration({
        document: doc, deployment: available, session: { authenticated: true, login: 'dustin-nkd' }, workspaces
    });
    assert.equal(closeCollaboration(doc), true);
    assert.deepEqual(doc.container.children, []);
    assert.equal(doc.container.hidden, true);
});

test('the entry performs no transport of its own', () => {
    const source = read('js/collaboration/entry.js');
    assert.equal(/\bfetch\s*\(/.test(source), false);
    assert.equal(/\.innerHTML/.test(source), false);
});
