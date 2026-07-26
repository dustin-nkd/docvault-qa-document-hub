// CF-P7-002 — lazy shell, deployment banner, and the four base states.
//
// Pure logic is tested directly; anything that touches nodes runs against a
// minimal document stub, so the suite stays in the Node runner with the rest of
// the collaboration unit tests rather than needing a browser.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BASE_STATES, baseStateModel, renderBaseState, BaseStateError }
    from '../js/collaboration/base-states.js';
import { mountDecision, mountShell, unmountShell, showState, SHELL_ROOT_ID, ShellError }
    from '../js/collaboration/shell.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

// ── a minimal DOM ────────────────────────────────────────────────────────────

function element(tagName) {
    return {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', hidden: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; }
    };
}

function documentStub(ids = [SHELL_ROOT_ID]) {
    const registry = new Map(ids.map(id => [id, element('div')]));
    return {
        createElement: element,
        getElementById(id) { return registry.has(id) ? registry.get(id) : null; },
        registry
    };
}

const find = (node, predicate) => node.children.find(predicate);

// ── deployment predicate ─────────────────────────────────────────────────────

// js/deployment.js is a classic script, so it is evaluated rather than imported.
function loadDeployment() {
    const source = read('js/deployment.js');
    const context = { window: {}, document: undefined, location: undefined };
    new Function('window', 'document', 'location', source)(
        context.window, undefined, undefined);
    return context.window.DocVaultDeployment;
}

test('collaboration is available on Cloudflare and local, refused elsewhere', () => {
    const { evaluate } = loadDeployment();
    assert.equal(evaluate({ hostname: 'codex-cf-p3-preview.docvault-qa-document-hub.pages.dev' }).available, true);
    assert.equal(evaluate({ hostname: 'localhost' }).available, true);
    assert.equal(evaluate({ hostname: 'dustin-nkd.github.io' }).available, false);
    assert.equal(evaluate({ hostname: 'dustin-nkd.github.io' }).reason, 'github-pages');
});

test('an unrecognised origin fails closed rather than guessing', () => {
    const { evaluate } = loadDeployment();
    const verdict = evaluate({ hostname: 'docs.example.test' });
    assert.equal(verdict.available, false);
    assert.equal(verdict.reason, 'unsupported-origin');
});

test('the banner is revealed only where collaboration cannot run', () => {
    const { evaluate, applyBanner, bannerId } = loadDeployment();
    const doc = documentStub([bannerId]);
    const banner = doc.getElementById(bannerId);

    banner.hidden = true;
    applyBanner(doc, evaluate({ hostname: 'x.pages.dev' }));
    assert.equal(banner.hidden, true, 'no banner on a deployment that supports collaboration');

    applyBanner(doc, evaluate({ hostname: 'x.github.io' }));
    assert.equal(banner.hidden, false);
    assert.equal(banner.getAttribute('data-reason'), 'github-pages');
});

// ── base states ──────────────────────────────────────────────────────────────

test('every base state carries a text label and a distinct shape', () => {
    const shapes = new Set();
    for (const state of BASE_STATES) {
        const model = baseStateModel({
            state, surface: 'base-states', title: `Title for ${state}`,
            reason: 'A stated reason.'
        });
        assert.equal(model.title.length > 0, true);
        assert.equal(typeof model.shape, 'string');
        shapes.add(model.shape);
    }
    assert.equal(shapes.size, BASE_STATES.length, 'shapes must not be reused between states');
});

test('unauthorized and error refuse to render without a reason', () => {
    for (const state of ['unauthorized', 'error']) {
        assert.throws(
            () => baseStateModel({ state, surface: 'base-states', title: 'Blocked' }),
            error => error instanceof BaseStateError && error.code === 'REASON_REQUIRED');
    }
    // empty and loading do not owe an explanation.
    for (const state of ['empty', 'loading']) {
        assert.doesNotThrow(() => baseStateModel({ state, surface: 'base-states', title: 'Fine' }));
    }
});

test('an unknown state is rejected rather than rendered as a default', () => {
    assert.throws(
        () => baseStateModel({ state: 'stale', surface: 'base-states', title: 'x' }),
        error => error.code === 'UNKNOWN_BASE_STATE');
});

test('rendered text goes through textContent, never markup', () => {
    const doc = documentStub();
    const hostile = '<img src=x onerror=alert(1)>';
    const node = renderBaseState(doc, baseStateModel({
        state: 'error', surface: 'base-states', title: hostile, reason: hostile
    }));
    const title = find(node, child => child.className === 'collab-state__title');
    assert.equal(title.textContent, hostile);
    assert.equal('innerHTML' in title, false, 'the renderer must never reach for innerHTML');
});

test('the decorative shape is hidden from assistive technology', () => {
    const doc = documentStub();
    const node = renderBaseState(doc, baseStateModel({
        state: 'empty', surface: 'base-states', title: 'Nothing here yet'
    }));
    const shape = find(node, child => child.getAttribute('aria-hidden') === 'true');
    assert.notEqual(shape, undefined);
    assert.equal(node.getAttribute('role'), 'status');
});

test('loading announces busy; blocking states announce assertively', () => {
    const doc = documentStub();
    const loading = renderBaseState(doc, baseStateModel({
        state: 'loading', surface: 'base-states', title: 'Loading'
    }));
    assert.equal(loading.getAttribute('aria-busy'), 'true');
    assert.equal(loading.getAttribute('aria-live'), 'polite');

    const denied = renderBaseState(doc, baseStateModel({
        state: 'unauthorized', surface: 'base-states', title: 'Sign in',
        reason: 'You are signed out.'
    }));
    assert.equal(denied.getAttribute('aria-live'), 'assertive');
    assert.equal(denied.getAttribute('aria-busy'), null);
});

// ── shell ────────────────────────────────────────────────────────────────────

test('the shell refuses to mount where the deployment cannot support it', () => {
    const doc = documentStub();
    const mounted = mountShell({ document: doc, deployment: { available: false, reason: 'github-pages' } });
    assert.equal(mounted, null);
    assert.equal(doc.getElementById(SHELL_ROOT_ID).getAttribute('data-collab-mounted'), null);
});

test('a signed-out user on a supported deployment still mounts', () => {
    // Availability is a property of the deployment, not the session: the shell
    // must be able to say "sign in" rather than "not available here".
    const decision = mountDecision({ available: true, reason: 'cloudflare-deployment' });
    assert.deepEqual({ ...decision }, { allowed: true, reason: null });
});

test('mounting shows loading and unmounting clears workspace content', () => {
    const doc = documentStub();
    const container = mountShell({ document: doc, deployment: { available: true, reason: 'local-development' } });
    assert.equal(container.hidden, false);
    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].getAttribute('data-collab-state'), 'loading');

    showState(doc, { state: 'error', surface: 'base-states', title: 'Failed', reason: 'Network error.' });
    assert.equal(container.children.length, 1, 'showState replaces rather than appends');

    assert.equal(unmountShell(doc), true);
    assert.equal(container.children.length, 0, 'no workspace content may survive unmount');
    assert.equal(container.hidden, true);
});

test('a missing verdict is an error, never an implied yes', () => {
    assert.throws(() => mountDecision(null),
        error => error instanceof ShellError && error.code === 'DEPLOYMENT_VERDICT_REQUIRED');
    assert.throws(() => mountDecision({}), error => error.code === 'DEPLOYMENT_VERDICT_REQUIRED');
});

// ── laziness ─────────────────────────────────────────────────────────────────

test('no collaboration module is eagerly loaded or precached', () => {
    const index = read('index.html');
    const serviceWorker = read('sw.js');
    assert.equal(/<script[^>]+collaboration\//.test(index), false,
        'a collaboration module became an eager script tag');
    assert.equal(/collaboration/.test(serviceWorker), false,
        'a collaboration module entered the service worker precache');
    // The banner must work without collaboration code, so its own module is
    // outside js/collaboration/ and is allowed to be eager.
    assert.equal(index.includes('<script defer src="js/deployment.js"></script>'), true);
    assert.equal(serviceWorker.includes('./js/deployment.js'), true);
});

test('the shell holds no personal vault storage key', () => {
    const shell = read('js/collaboration/shell.js');
    const states = read('js/collaboration/base-states.js');
    for (const key of ['docvault_docs', 'docvault_deleted_ids', 'docvault_sync_pending',
        'DocStorage', 'localStorage']) {
        assert.equal(shell.includes(key), false, `shell reached for ${key}`);
        assert.equal(states.includes(key), false, `base states reached for ${key}`);
    }
});
