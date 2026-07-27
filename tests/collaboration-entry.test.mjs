// CF-P7-013 — the lazy entry point and its wiring.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { openCollaboration, closeCollaboration, startCollaboration, CHROME_ID }
    from '../js/collaboration/entry.js';
import { createApiClient } from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        id: '', hidden: false, disabled: false, listeners: new Map(),
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        append(...nodes) { this.children.push(...nodes); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
        // Real enough to prove a delegated handler runs: registered listeners
        // are stored and actually invoked by simulateClick below, rather than
        // discarded the way a no-op stub would leave every click test unable
        // to distinguish a wired handler from an absent one.
        addEventListener(type, handler) {
            const list = this.listeners.get(type) ?? [];
            list.push(handler);
            this.listeners.set(type, list);
        },
        focus() {},
        querySelector(selector) { return descendants(this).find(matches(selector)) ?? null; },
        querySelectorAll(selector) { return descendants(this).filter(matches(selector)); }
    };
    return node;
}

/**
 * Simulate a click that bubbles to `root`, with `target` as the element the
 * user pressed. Mirrors just enough of the DOM event contract for
 * `event.target.closest(...)` to work inside a delegated handler.
 */
function simulateClick(root, target) {
    const event = {
        target: Object.assign(target, {
            closest(selector) {
                for (let node = target; node; node = node.parent) {
                    if (matches(selector)(node)) return node;
                }
                return null;
            }
        })
    };
    for (const handler of root.listeners.get('click') ?? []) handler(event);
    return event;
}

/** Simulate typing: sets `.value` and dispatches a bubbling `input` event. */
function simulateInput(root, target, value) {
    target.value = value;
    const event = {
        target: Object.assign(target, {
            closest(selector) {
                for (let node = target; node; node = node.parent) {
                    if (matches(selector)(node)) return node;
                }
                return null;
            }
        })
    };
    for (const handler of root.listeners.get('input') ?? []) handler(event);
    return event;
}

/** Wire `child.parent` for every descendant, so `closest` can walk upward. */
function withParents(root) {
    for (const child of root.children) {
        child.parent = root;
        withParents(child);
    }
    return root;
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
const matches = selector => node => {
    if (selector.startsWith('#')) return node.id === selector.slice(1);
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

// ── CF-P7-015: what the entry does once it can ask ───────────────────────────

const respond = (status, body, contentType = 'application/json; charset=utf-8') => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body
});

const clientAnswering = responses => {
    const queue = [...responses];
    return createApiClient({
        fetch: async () => (queue.length > 1 ? queue.shift() : queue[0]),
        randomId: () => 'a'.repeat(36)
    });
};

/** An in-memory `Storage`, so a pre-registered device can be seeded for a test. */
function fakeStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => { map.set(key, String(value)); },
        removeItem: key => { map.delete(key); }
    };
}

const DEVICE_ID = '44444444-4444-4444-8444-444444444444';
const CANONICAL_PUBLIC_JWK = Object.freeze({
    crv: 'P-256', ext: true, key_ops: [], kty: 'EC', x: 'x-value', y: 'y-value'
});
const signedInSession = () => respond(200, {
    authenticated: true, user: { userId: 'u_1', login: 'dustin-nkd' }, session: {}, csrfToken: 'csrf'
});
const emptyWorkspaceList = () => respond(200, { data: { items: [] }, meta: { page: { nextCursor: null } } });

test('the deployment opener reaches startCollaboration, not the hand-fed entry', () => {
    assert.match(read('js/deployment.js'), /module\.startCollaboration\(/);
});

test('a deployment that says collaboration is off says so, rather than staying on loading', async () => {
    const doc = documentWithRoot();
    await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([respond(503, { error: { code: 'COLLABORATION_UNAVAILABLE' } })])
    });
    const state = doc.container.children[0];
    assert.equal(state.getAttribute('data-collab-state'), 'error');
    // The hostname banner is hidden on a Cloudflare origin, so this message is
    // the only thing that would tell the user why the door led nowhere.
    assert.match(state.children.map(child => child.textContent).join(' '), /not enabled/i);
});

test('a signed-out visitor on an enabled deployment is offered a sign-in', async () => {
    const doc = documentWithRoot();
    await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([respond(200, { authenticated: false })])
    });
    const state = doc.container.children[0];
    assert.equal(state.getAttribute('data-collab-state'), 'unauthorized');
    assert.notEqual(state.querySelector('[data-collab-action="sign-in"]'), null);
});

// This is the wiring CF-P7-017's follow-up added: openCollaboration renders
// the sign-in control, but nothing listened for a click on it until now.
test('clicking sign-in redirects the browser to the returned authorization URL', async () => {
    const doc = documentWithRoot();
    doc.defaultView = { location: { href: '' } };
    await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([
            respond(200, { authenticated: false }),
            // This route's real body is {authorizationUrl, expiresAt} at the
            // top level, not the {data, meta} envelope every other route
            // uses -- see the REGRESSION test in collaboration-api-client
            // .test.mjs for why that distinction is load-bearing here.
            respond(201, { authorizationUrl: 'https://github.com/login/oauth/authorize?x=1', expiresAt: 1 })
        ])
    });
    withParents(doc.container);
    const button = doc.container.querySelector('[data-collab-action="sign-in"]');
    assert.notEqual(button, null);
    simulateClick(doc.container, button);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(doc.defaultView.location.href,
        'https://github.com/login/oauth/authorize?x=1');
});

test('a refused sign-in shows its own reason rather than navigating anywhere', async () => {
    const doc = documentWithRoot();
    doc.defaultView = { location: { href: '' } };
    await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([
            respond(200, { authenticated: false }),
            respond(429, { error: { code: 'RATE_LIMITED' }, meta: {} })
        ])
    });
    withParents(doc.container);
    const button = doc.container.querySelector('[data-collab-action="sign-in"]');
    simulateClick(doc.container, button);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(doc.defaultView.location.href, '', 'a refused sign-in must not navigate');
    const state = doc.container.children[0];
    assert.equal(state.getAttribute('data-collab-state'), 'error');
    assert.match(state.children.map(child => child.textContent).join(' '), /too many requests/i);
});

test('clicking sign-in twice before the first answer returns sends only one request', async () => {
    const doc = documentWithRoot();
    doc.defaultView = { location: { href: '' } };
    let calls = 0;
    const client = createApiClient({
        fetch: async () => {
            if (calls === 0) { calls += 1; return respond(200, { authenticated: false }); }
            calls += 1;
            return respond(201, { authorizationUrl: 'https://github.com/x', expiresAt: 1 });
        },
        randomId: () => 'a'.repeat(36)
    });
    await startCollaboration({ document: doc, deployment: available, client });
    withParents(doc.container);
    const button = doc.container.querySelector('[data-collab-action="sign-in"]');
    simulateClick(doc.container, button);
    simulateClick(doc.container, button);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls, 2, 'the second click must be ignored while the button is disabled');
});

test('a signed-in visitor gets the chrome built from the real session', async () => {
    const doc = documentWithRoot();
    await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([
            respond(200, {
                authenticated: true, user: { userId: 'u_1', login: 'dustin-nkd' },
                session: {}, csrfToken: 'csrf'
            }),
            respond(200, { data: { items: workspaces }, meta: { page: { nextCursor: null } } })
        ])
    });
    const chrome = doc.container.children[0];
    assert.equal(chrome.id, CHROME_ID);
    assert.notEqual(chrome.querySelector('[data-collab-surface="workspace-switcher"]'), null);
});

test('a workspace list that fails leaves the session standing and the list empty', async () => {
    const doc = documentWithRoot();
    const container = await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([
            respond(200, {
                authenticated: true, user: { userId: 'u_1', login: 'x' }, session: {}
            }),
            respond(500, { error: { code: 'INTERNAL_ERROR' }, meta: {} })
        ])
    });
    assert.notEqual(container, null);
    assert.equal(doc.container.children[0].id, CHROME_ID);
});

test('an unreachable API is an error state, never a sign-in the user cannot act on', async () => {
    const doc = documentWithRoot();
    await startCollaboration({
        document: doc, deployment: available,
        // The SPA fallback answering an API path: status 200, but a web page.
        client: clientAnswering([respond(200, { data: {} }, 'text/html')])
    });
    assert.equal(doc.container.children[0].getAttribute('data-collab-state'), 'error');
});

test('a workspace record the surfaces refuse is an error state, not a stuck loading', async () => {
    const doc = documentWithRoot();
    const container = await startCollaboration({
        document: doc, deployment: available,
        client: clientAnswering([
            respond(200, {
                authenticated: true, user: { userId: 'u_1', login: 'x' }, session: {}
            }),
            // Not the shape the server issues, so workspace-context refuses it.
            respond(200, { data: { items: [{ workspaceId: 'ws_1', displayName: 'X' }] }, meta: {} })
        ])
    });
    assert.notEqual(container, null);
    const state = doc.container.children[0];
    assert.equal(state.getAttribute('data-collab-state'), 'error');
    assert.notEqual(state.getAttribute('data-collab-state'), 'loading');
});

test('an unsupported deployment is still refused before any request is made', async () => {
    let reached = false;
    const doc = documentWithRoot();
    const result = await startCollaboration({
        document: doc, deployment: { available: false, reason: 'github-pages' },
        client: createApiClient({ fetch: async () => { reached = true; return respond(200, {}); } })
    });
    assert.equal(result, null);
    assert.equal(reached, false);
});

// ── register-device / create-workspace wiring (reported live, 2026-07-28) ───

// REGRESSION: createWorkspaceModel's own canSubmit reads data.workspaceName,
// which nothing set until a submit was attempted -- so the control stayed
// disabled no matter what was typed, since enabling it and learning the name
// were the same event. Reported live: the "Create workspace" button never
// responded to a click after a valid name was typed, because it was still
// disabled and a disabled button fires no click or submit event at all.
test('REGRESSION: the create-workspace submit control enables once a valid name is typed', async () => {
    const doc = documentWithRoot();
    const storage = fakeStorage({
        'docvault:collab:preview:u_1:device': JSON.stringify({
            deviceId: DEVICE_ID, fingerprint: 'fp', state: 'active',
            publicJwk: CANONICAL_PUBLIC_JWK, unlockSecret: 'secret'
        })
    });
    await startCollaboration({
        document: doc, deployment: available, storage, environment: 'preview',
        client: clientAnswering([signedInSession(), emptyWorkspaceList()])
    });
    withParents(doc.container);
    const submitControl = doc.container.querySelector('[data-collab-action="workspace-create-submit"]');
    assert.notEqual(submitControl, null);
    assert.equal(submitControl.disabled, true,
        'starts disabled: the model has not been told a name yet, even with a ready device');
    const nameInput = doc.container.querySelector('#collab-create-name');
    assert.notEqual(nameInput, null);
    simulateInput(doc.container, nameInput, 'Marketing');
    assert.equal(submitControl.disabled, false,
        'a valid typed name must enable the control without repainting the panel');
});

test('an invalid typed name keeps the submit control disabled', async () => {
    const doc = documentWithRoot();
    const storage = fakeStorage({
        'docvault:collab:preview:u_1:device': JSON.stringify({
            deviceId: DEVICE_ID, fingerprint: 'fp', state: 'active',
            publicJwk: CANONICAL_PUBLIC_JWK, unlockSecret: 'secret'
        })
    });
    await startCollaboration({
        document: doc, deployment: available, storage, environment: 'preview',
        client: clientAnswering([signedInSession(), emptyWorkspaceList()])
    });
    withParents(doc.container);
    const submitControl = doc.container.querySelector('[data-collab-action="workspace-create-submit"]');
    const nameInput = doc.container.querySelector('#collab-create-name');
    simulateInput(doc.container, nameInput, '   ');
    assert.equal(submitControl.disabled, true);
});

// REGRESSION: the "Set up this device" shortcut inside create-workspace's
// blocked message called `.focus()` on the real register button and nothing
// else -- indistinguishable from doing nothing on a page where every surface
// is already visible at once. Reported live as "vẫn không bấm được" after a
// device was revoked. This environment has no IndexedDB, so a real attempt
// fails visibly (data-device-status becomes "failed"); a mere focus() would
// leave the surface exactly as it started.
test('the create-workspace "Set up this device" shortcut starts registration, not a mere focus', async () => {
    const doc = documentWithRoot();
    const storage = fakeStorage();
    await startCollaboration({
        document: doc, deployment: available, storage, environment: 'preview',
        client: clientAnswering([signedInSession(), emptyWorkspaceList()])
    });
    withParents(doc.container);
    const shortcut = doc.container.querySelector('[data-collab-action="device-setup-open"]');
    assert.notEqual(shortcut, null);
    const deviceSurfaceBefore = doc.container.querySelector('[data-collab-surface="device-key-initialization"]');
    assert.equal(deviceSurfaceBefore.getAttribute('data-device-status'), 'unregistered');
    simulateClick(doc.container, shortcut);
    await new Promise(resolve => setTimeout(resolve, 0));
    withParents(doc.container);
    const deviceSurfaceAfter = doc.container.querySelector('[data-collab-surface="device-key-initialization"]');
    assert.equal(deviceSurfaceAfter.getAttribute('data-device-status'), 'failed');
});
