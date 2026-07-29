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

// ── the panel is an overlay, and the opener is the way back out ─────────────

// The collaboration panel used to be a block in the document flow, which
// pushed the Personal Vault app down by its own height: measured live, a real
// workspace panel left the app zero pixels tall and ran past the bottom of a
// viewport whose body clips overflow, so the end of the panel could not be
// reached at all. As an overlay it covers the app instead of deforming it --
// but only if it scrolls itself, since the body still cannot.
test('the collaboration panel is a self-scrolling overlay, not a block in the flow', () => {
    const css = read('style.css');
    const rule = css.match(/\.collab-root\s*\{[^}]*\}/);
    assert.notEqual(rule, null, 'the panel has no rule of its own');
    assert.match(rule[0], /position:\s*fixed/, 'in the flow it deforms the app around it');
    assert.match(rule[0], /overflow-y:\s*auto/, 'the body clips, so the panel must scroll itself');
});

// An overlay with no exit is a trap: nothing anywhere renders a close control,
// so the control that opens it has to be the one that closes it.
test('the opener closes the panel it opened, rather than trapping the user', () => {
    const source = read('js/deployment.js');
    assert.match(source, /closeCollaboration\(/,
        'nothing closes the overlay, so the only way back is a page reload');
    assert.match(source, /aria-expanded/,
        'a toggle that does not say which state it is in is not announced');
});

test('the opener sits above the overlay, or it cannot be pressed to close it', () => {
    const css = read('style.css');
    const rootRule = css.match(/\.collab-root\s*\{[^}]*\}/)[0];
    const openRule = css.match(/\.collab-open\s*\{[^}]*\}/)[0];
    const zOf = rule => Number((rule.match(/z-index:\s*(\d+)/) || [])[1] ?? NaN);
    assert.ok(zOf(openRule) > zOf(rootRule),
        `the toggle (${zOf(openRule)}) must stack above the panel (${zOf(rootRule)})`);
});

// The regression the app shell itself carried: `h-screen` on the shell plus a
// banner or opener above it made the page taller than the viewport by exactly
// their height, and the body clips, so the end of the sidebar -- the Lock /
// Theme / Settings row -- fell off the bottom on both deployments.
test('the app shell takes the height left over, not a second full viewport', () => {
    const html = read('index.html');
    const shell = html.match(/<div class="[^"]*app-shell[^"]*"/);
    assert.notEqual(shell, null, 'the app shell is not identifiable');
    assert.equal(/h-screen/.test(shell[0]), false,
        'a hard 100vh here is exactly what pushed the sidebar off the bottom');
    const rule = read('style.css').match(/\.app-shell\s*\{[^}]*\}/);
    assert.notEqual(rule, null);
    // Written as real CSS rather than Tailwind's `min-h-0`, which the prebuilt
    // vendor/tailwind/tailwind.generated.css does not contain -- the utility
    // would silently do nothing and the flex item would refuse to shrink.
    assert.match(rule[0], /min-height:\s*0/);
    assert.equal(/min-h-0/.test(read('vendor/tailwind/tailwind.generated.css')), false,
        'if this class now exists the note above is stale, but the rule stays correct');
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
        removeItem: key => { map.delete(key); },
        values: () => [...map.values()]
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

test('a signed-out invitation is cleared and explains that the link must be reopened', async () => {
    const doc = documentWithRoot();
    const location = { hash: `#/invite/${'q'.repeat(80)}`, pathname: '/', search: '' };
    const replacements = [];
    await startCollaboration({
        document: doc,
        deployment: available,
        location,
        history: { replaceState: (...args) => replacements.push(args) },
        client: clientAnswering([respond(200, { authenticated: false })])
    });
    assert.equal(replacements.length, 1);
    assert.equal(String(replacements[0][2]).includes('q'.repeat(80)), false);
    const state = doc.container.children[0];
    const text = state.children.map(child => child.textContent).join(' ');
    assert.match(text, /reopen the invitation link/i);
    assert.match(text, /does not save invitation links/i);
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

// REGRESSION: invitationModel has always taken a displayLogin and a role, and
// renderInvitations rendered neither a field to type one into nor a control to
// pick the other -- only a disabled "Send invitation" above the sentence "Enter
// a GitHub username." Reported live: there was nothing to type into.
test('REGRESSION: the invitation surface renders a username field and a role control', async () => {
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
    const surface = doc.container.querySelector('[data-collab-surface="invitation-manage"]');
    // The surface is workspace-scoped, so with no workspace it renders its
    // empty state rather than the form; the point of the assertion below is
    // that the module renders both controls when it renders the form at all.
    const source = read('js/collaboration/invitations.js');
    assert.match(source, /collab-invites__login-input/,
        'no field exists to type a GitHub username into');
    assert.match(source, /collab-invites__role-input/,
        'no control exists to choose the invited role');
    assert.ok(surface !== null, 'the invitation surface is not mounted at all');
});

test('the entry wires the invitation control it renders', () => {
    const source = read('js/collaboration/entry.js');
    assert.match(source, /create-invitation/,
        'the Send invitation control has no handler, so pressing it does nothing');
    assert.match(source, /collab-invites__login-input/,
        'nothing keeps the Send control in step with what was typed');
});

// REGRESSION: the live create call succeeded and returned the one-time URL, but
// entry handed `{ invitation, held }` to invitationModel where only `held` was
// accepted. The ensuing `issued.cleared is not a function` was isolated as an
// `(unknown)` invitation-manage schema error, and the already-created token
// could not be recovered.
test('REGRESSION: the rendered Copy link uses clipboard once and preserves the manual fallback',
    async () => {
    const doc = documentWithRoot();
    const workspace = {
        workspaceId: workspaces[0].workspaceId,
        displayName: workspaces[0].displayName,
        role: 'owner',
        keyReadiness: 'key_ready'
    };
    const invitationId = '66666666-6666-4666-8666-666666666666';
    const acceptanceUrl = `https://preview.example/#/invite/${'t'.repeat(80)}`;
    const requests = [];
    const clipboardWrites = [];
    let clipboardBlocked = false;
    const clipboard = {
        async writeText(value) {
            if (clipboardBlocked) throw new Error('permission denied');
            clipboardWrites.push(value);
        }
    };
    const client = createApiClient({
        fetch: async (url, init = {}) => {
            const path = String(url).split('?')[0];
            const method = String(init.method ?? 'GET').toUpperCase();
            requests.push({ method, path });
            if (path === '/api/v1/session') return signedInSession();
            if (path === '/api/v1/workspaces') {
                return respond(200, {
                    data: { items: [workspace] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/members')) {
                return respond(200, {
                    data: { items: [] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/invitations') && method === 'POST') {
                return respond(201, {
                    data: {
                        invitation: {
                            invitationId,
                            workspaceId: workspace.workspaceId,
                            role: 'viewer',
                            targetDisplayLogin: 'second-user',
                            state: 'pending',
                            expiresAt: '2026-07-30T00:00:00.000Z'
                        },
                        acceptanceUrl
                    },
                    meta: {}
                });
            }
            if (path.endsWith('/invitations')) {
                return respond(200, {
                    data: { items: [] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/audit-events')) {
                return respond(200, {
                    data: { items: [] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/key-envelopes/current')) {
                return respond(200, {
                    data: { readiness: 'key_ready', envelope: null },
                    meta: {}
                });
            }
            return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
        },
        randomId: () => 'a'.repeat(36)
    });
    const storage = fakeStorage({
        'docvault:collab:preview:u_1:active-workspace': workspace.workspaceId,
        'docvault:collab:preview:u_1:device': JSON.stringify({
            deviceId: DEVICE_ID, fingerprint: 'fp', state: 'active',
            publicJwk: CANONICAL_PUBLIC_JWK, unlockSecret: 'secret'
        })
    });

    await startCollaboration({
        document: doc, deployment: available, storage, environment: 'preview', client, clipboard
    });
    withParents(doc.container);
    const login = doc.container.querySelector('.collab-invites__login-input');
    const role = doc.container.querySelector('.collab-invites__role-input');
    const send = doc.container.querySelector('[data-collab-action="create-invitation"]');
    assert.notEqual(login, null);
    assert.notEqual(role, null);
    assert.notEqual(send, null);
    simulateInput(doc.container, login, 'second-user');
    role.value = 'viewer';
    simulateClick(doc.container, send);

    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__url') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    const field = doc.container.querySelector('.collab-invites__url');
    assert.notEqual(field, null,
        'the successful create response was replaced by an invitation-manage error');
    assert.equal(field.value, acceptanceUrl);
    assert.equal(requests.filter(request =>
        request.method === 'POST' && request.path.endsWith('/invitations')).length, 1);

    const beforeSuccessfulCopy = structuredClone(requests);
    const copy = doc.container.querySelector('[data-collab-action="copy-acceptance-link"]');
    assert.notEqual(copy, null, 'the held URL rendered without its Copy link control');
    simulateClick(doc.container, copy);
    simulateClick(doc.container, copy);
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__url') !== null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    assert.deepEqual(clipboardWrites, [acceptanceUrl],
        'the clipboard did not receive the exact held URL exactly once');
    assert.deepEqual(requests, beforeSuccessfulCopy,
        'copying the held URL issued a network request');
    assert.equal(doc.container.querySelector('.collab-invites__url'), null,
        'a copied one-time URL remained readable');
    assert.equal(doc.container.querySelector('[data-collab-action="copy-acceptance-link"]'), null,
        'a copied one-time URL can be copied twice');
    assert.match(doc.container.querySelector('.collab-invites__copy-notice')?.textContent ?? '',
        /copied and cleared/i);
    assert.equal(storage.values().some(value => String(value).includes(acceptanceUrl)), false,
        'the one-time URL entered browser storage');

    // Issue a second holder and refuse its clipboard write. The exact same
    // rendered control must keep the readonly field in place and announce the
    // manual-copy path rather than consuming the holder.
    withParents(doc.container);
    const retryLogin = doc.container.querySelector('.collab-invites__login-input');
    const retryRole = doc.container.querySelector('.collab-invites__role-input');
    const retrySend = doc.container.querySelector('[data-collab-action="create-invitation"]');
    simulateInput(doc.container, retryLogin, 'second-user');
    retryRole.value = 'viewer';
    simulateClick(doc.container, retrySend);
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__url') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }

    clipboardBlocked = true;
    const beforeBlockedCopy = structuredClone(requests);
    const blockedCopy = doc.container.querySelector(
        '[data-collab-action="copy-acceptance-link"]');
    simulateClick(doc.container, blockedCopy);
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__copy-notice') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    assert.equal(doc.container.querySelector('.collab-invites__url')?.value, acceptanceUrl,
        'a refused clipboard write consumed the one-time URL');
    const manual = doc.container.querySelector('.collab-invites__copy-notice');
    assert.equal(manual?.getAttribute('aria-live'), 'polite');
    assert.match(manual?.textContent ?? '', /copy it manually/i);
    assert.deepEqual(clipboardWrites, [acceptanceUrl],
        'a refused clipboard write was recorded as a successful copy');
    assert.deepEqual(requests, beforeBlockedCopy,
        'a refused clipboard write issued a network request');
});

test('REGRESSION: rendered invitation revoke is single-flight, retryable, and preserves its held URL',
    async () => {
    const doc = documentWithRoot();
    const workspace = {
        workspaceId: workspaces[0].workspaceId,
        displayName: workspaces[0].displayName,
        role: 'owner',
        keyReadiness: 'key_ready'
    };
    const existingId = '66666666-6666-4666-8666-666666666666';
    const createdId = '77777777-7777-4777-8777-777777777777';
    const acceptanceUrl = `https://preview.example/#/invite/${'r'.repeat(80)}`;
    const invitation = (invitationId, targetDisplayLogin) => ({
        invitationId,
        workspaceId: workspace.workspaceId,
        role: 'viewer',
        targetDisplayLogin,
        state: 'pending',
        expiresAt: '2026-07-30T00:00:00.000Z'
    });
    let pending = [invitation(existingId, 'first-user')];
    let releaseFirstDelete = null;
    let deleteAttempt = 0;
    let keySequence = 0;
    const requests = [];
    const client = createApiClient({
        fetch: async (url, init = {}) => {
            const path = String(url).split('?')[0];
            const method = String(init.method ?? 'GET').toUpperCase();
            requests.push({ method, path, headers: { ...(init.headers ?? {}) } });
            if (path === '/api/v1/session') return signedInSession();
            if (path === '/api/v1/workspaces') {
                return respond(200, {
                    data: { items: [workspace] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/members')) {
                return respond(200, { data: { items: [] }, meta: { page: { nextCursor: null } } });
            }
            if (path.endsWith('/audit-events')) {
                return respond(200, { data: { items: [] }, meta: { page: { nextCursor: null } } });
            }
            if (path.endsWith('/key-envelopes/current')) {
                return respond(200, {
                    data: { readiness: 'key_ready', envelope: null },
                    meta: {}
                });
            }
            if (path.endsWith('/invitations') && method === 'POST') {
                const created = invitation(createdId, 'second-user');
                pending = [...pending, created];
                return respond(201, {
                    data: { invitation: created, acceptanceUrl },
                    meta: {}
                });
            }
            if (path === `/api/v1/workspaces/${workspace.workspaceId}/invitations/${existingId}`
                && method === 'DELETE') {
                deleteAttempt += 1;
                if (deleteAttempt === 1) {
                    return await new Promise(resolve => {
                        releaseFirstDelete = () => resolve(respond(403, {
                            error: { code: 'OPERATION_NOT_PERMITTED' },
                            meta: {}
                        }));
                    });
                }
                return respond(204, null);
            }
            if (path.endsWith('/invitations') && method === 'GET') {
                return respond(200, {
                    data: { items: pending },
                    meta: { page: { nextCursor: null } }
                });
            }
            return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
        },
        randomId: () => `key-${++keySequence}`.padEnd(32, 'x')
    });
    const storage = fakeStorage({
        'docvault:collab:preview:u_1:active-workspace': workspace.workspaceId,
        'docvault:collab:preview:u_1:device': JSON.stringify({
            deviceId: DEVICE_ID,
            fingerprint: 'fp',
            state: 'active',
            publicJwk: CANONICAL_PUBLIC_JWK,
            unlockSecret: 'secret'
        })
    });

    await startCollaboration({
        document: doc, deployment: available, storage, environment: 'preview', client
    });
    withParents(doc.container);

    // Create a separate invitation solely to hold its one-time URL while the
    // pre-existing row is revoked. Revocation must never clear that holder.
    const login = doc.container.querySelector('.collab-invites__login-input');
    const role = doc.container.querySelector('.collab-invites__role-input');
    simulateInput(doc.container, login, 'second-user');
    role.value = 'viewer';
    simulateClick(doc.container,
        doc.container.querySelector('[data-collab-action="create-invitation"]'));
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__url') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    assert.equal(doc.container.querySelector('.collab-invites__url')?.value, acceptanceUrl);

    const revokeFor = invitationId => doc.container
        .querySelectorAll('[data-collab-action="revoke-invitation"]')
        .find(control => control.getAttribute('data-invitation-id') === invitationId);
    const firstRevoke = revokeFor(existingId);
    assert.notEqual(firstRevoke, undefined);
    simulateClick(doc.container, firstRevoke);
    simulateClick(doc.container, firstRevoke);
    await new Promise(resolve => setTimeout(resolve, 0));
    withParents(doc.container);

    let deletes = requests.filter(request => request.method === 'DELETE');
    assert.equal(deletes.length, 1, 'a double click sent more than one DELETE');
    assert.equal(deletes[0].path,
        `/api/v1/workspaces/${workspace.workspaceId}/invitations/${existingId}`);
    assert.equal(deletes[0].headers['X-CSRF-Token'], 'csrf');
    assert.equal(deletes[0].headers['X-DocVault-Device-ID'], DEVICE_ID);
    assert.equal(typeof deletes[0].headers['Idempotency-Key'], 'string');
    assert.equal(revokeFor(existingId)?.disabled, true);
    assert.match(revokeFor(existingId)?.textContent ?? '', /Revoking/);

    releaseFirstDelete();
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-invites__revoke-failure') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    const refusal = doc.container.querySelector('.collab-invites__revoke-failure');
    assert.equal(refusal?.getAttribute('role'), 'alert');
    assert.match(refusal?.textContent ?? '', /role in this workspace does not allow/i);
    assert.equal(revokeFor(existingId)?.disabled, false, 'a refusal did not permit retry');
    assert.equal(doc.container.querySelector('.collab-invites__url')?.value, acceptanceUrl,
        'a refused revoke cleared an unrelated one-time URL');

    simulateClick(doc.container, revokeFor(existingId));
    for (let turn = 0; turn < 10 && revokeFor(existingId) !== undefined; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    deletes = requests.filter(request => request.method === 'DELETE');
    assert.equal(deletes.length, 2, 'a deliberate retry did not send exactly one new DELETE');
    assert.notEqual(deletes[0].headers['Idempotency-Key'], deletes[1].headers['Idempotency-Key'],
        'a deliberate retry reused the earlier idempotency key');
    assert.equal(revokeFor(existingId), undefined, 'a revoked invitation remained in the pending list');
    assert.notEqual(revokeFor(createdId), undefined, 'the unrelated pending invitation was removed');
    assert.equal(doc.container.querySelector('.collab-invites__url')?.value, acceptanceUrl,
        'a successful revoke cleared an unrelated one-time URL');
});

test('REGRESSION: rendered invitation acceptance is scoped, single-flight, and retryable', async () => {
    const doc = documentWithRoot();
    const token = 's'.repeat(80);
    const invitationId = '66666666-6666-4666-8666-666666666666';
    const workspaceId = '55555555-5555-4555-8555-555555555555';
    const events = [];
    const requests = [];
    let acceptAttempt = 0;
    let releaseRefusal = null;
    let keySequence = 0;
    const location = { hash: `#/invite/${token}`, pathname: '/', search: '' };
    const history = {
        replaceState(_state, _title, url) {
            events.push({ type: 'history', url });
            location.hash = '';
        }
    };
    const client = createApiClient({
        fetch: async (url, init = {}) => {
            const path = String(url).split('?')[0];
            const method = String(init.method ?? 'GET').toUpperCase();
            const body = init.body ? JSON.parse(String(init.body)) : null;
            events.push({ type: 'fetch', path });
            requests.push({ path, method, body, headers: { ...(init.headers ?? {}) } });
            if (path === '/api/v1/session') return signedInSession();
            if (path === '/api/v1/workspaces') {
                return respond(200, {
                    data: {
                        items: acceptAttempt >= 2
                            ? [{ workspaceId, displayName: 'Platform QA', role: 'viewer',
                                state: 'pending_key', keyReady: false }]
                            : []
                    },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path === '/api/v1/invitations/bootstrap') {
                return respond(200, {
                    data: {
                        invitationId,
                        workspaceDisplayName: 'Platform QA',
                        targetDisplayLogin: 'dustin-nkd',
                        role: 'viewer',
                        expiresAt: '2026-07-30T00:00:00.000Z',
                        state: 'pending',
                        identityMatch: true
                    },
                    meta: {}
                });
            }
            if (path === '/api/v1/invitations/accept') {
                acceptAttempt += 1;
                if (acceptAttempt === 1) {
                    return await new Promise(resolve => {
                        releaseRefusal = () => resolve(respond(409, {
                            error: { code: 'INVITATION_UNAVAILABLE' },
                            meta: {}
                        }));
                    });
                }
                return respond(201, {
                    data: {
                        membership: {
                            userId: 'u_1',
                            role: 'viewer',
                            state: 'pending_key',
                            keyReadiness: 'pending_key'
                        }
                    },
                    meta: {}
                });
            }
            return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
        },
        randomId: () => `accept-key-${++keySequence}`.padEnd(32, 'x')
    });
    const storage = fakeStorage({
        'docvault:collab:preview:u_1:device': JSON.stringify({
            deviceId: DEVICE_ID,
            fingerprint: 'fp',
            state: 'active',
            publicJwk: CANONICAL_PUBLIC_JWK,
            unlockSecret: 'secret'
        })
    });

    await startCollaboration({
        document: doc,
        deployment: available,
        storage,
        environment: 'preview',
        client,
        location,
        history
    });
    withParents(doc.container);
    assert.equal(events[0].type, 'history',
        'the fragment was not removed before the first request or paint');
    assert.equal(location.hash, '');
    let accept = doc.container.querySelector('[data-collab-action="accept-invitation"]');
    assert.notEqual(accept, null);
    assert.equal(accept.disabled, false);

    simulateClick(doc.container, accept);
    simulateClick(doc.container, accept);
    await new Promise(resolve => setTimeout(resolve, 0));
    withParents(doc.container);
    let accepts = requests.filter(request => request.path === '/api/v1/invitations/accept');
    assert.equal(accepts.length, 1, 'a double click sent more than one acceptance');
    assert.deepEqual(accepts[0].body, { token, deviceId: DEVICE_ID });
    assert.equal(accepts[0].headers['X-DocVault-Device-ID'], DEVICE_ID);
    assert.equal(accepts[0].headers['X-CSRF-Token'], 'csrf');
    assert.equal(typeof accepts[0].headers['Idempotency-Key'], 'string');

    releaseRefusal();
    for (let turn = 0; turn < 10
        && doc.container.querySelector('.collab-accept__failure') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    const refusal = doc.container.querySelector('.collab-accept__failure');
    assert.equal(refusal?.getAttribute('role'), 'alert');
    assert.match(refusal?.textContent ?? '', /cannot be used/i);
    accept = doc.container.querySelector('[data-collab-action="accept-invitation"]');
    assert.equal(accept.disabled, false, 'a refusal did not permit deliberate retry');

    simulateClick(doc.container, accept);
    for (let turn = 0; turn < 10
        && doc.container.querySelector('[data-accept-status="accepted"]') === null; turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
        withParents(doc.container);
    }
    accepts = requests.filter(request => request.path === '/api/v1/invitations/accept');
    assert.equal(accepts.length, 2, 'a deliberate retry did not send one new acceptance');
    assert.notEqual(accepts[0].headers['Idempotency-Key'], accepts[1].headers['Idempotency-Key']);
    assert.deepEqual(accepts[1].body, { token, deviceId: DEVICE_ID });
    const accepted = doc.container.querySelector('[data-accept-status="accepted"]');
    assert.notEqual(accepted, null);
    assert.equal(accepted.querySelector('[data-collab-action="accept-invitation"]').textContent,
        'Joined');
    assert.match(accepted.querySelector('[data-readiness="pending_key"]').textContent,
        /provision it to this device/i);
    assert.equal(accepted.querySelector('[data-collab-action="accept-invitation"]').disabled, true);
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

// REGRESSION: member rows and the current-device surface both emitted
// `revoke-device`. The panel-wide delegated handler therefore treated a remote
// member control as "revoke this browser", clearing the actor's device state
// instead of targeting the selected member. The member journey does not yet
// have a device inventory, so it must stay disabled until CF-P7R-006.
test('REGRESSION: member-device revoke cannot reach this browser device lifecycle', async () => {
    const doc = documentWithRoot();
    const ownerId = '11111111-1111-4111-8111-111111111111';
    const memberId = '22222222-2222-4222-8222-222222222222';
    const workspaceId = workspaces[0].workspaceId;
    const deviceKey = `docvault:collab:preview:${ownerId}:device`;
    const requests = [];
    const client = createApiClient({
        fetch: async (url, init = {}) => {
            const path = String(url).split('?')[0];
            const method = String(init.method ?? 'GET').toUpperCase();
            requests.push({ path, method, headers: { ...(init.headers ?? {}) } });
            if (path === '/api/v1/session') {
                return respond(200, {
                    authenticated: true,
                    user: { userId: ownerId, login: 'owner' },
                    session: {},
                    csrfToken: 'csrf'
                });
            }
            if (path === '/api/v1/workspaces') {
                return respond(200, {
                    data: {
                        items: [{
                            workspaceId,
                            displayName: 'Platform QA',
                            role: 'owner',
                            keyReadiness: 'key_ready'
                        }]
                    },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/members')) {
                return respond(200, {
                    data: {
                        items: [
                            {
                                userId: ownerId,
                                role: 'owner',
                                state: 'active',
                                keyReady: true,
                                displayProfile: { login: 'owner' }
                            },
                            {
                                userId: memberId,
                                role: 'editor',
                                state: 'active',
                                keyReady: true,
                                displayProfile: { login: 'member' }
                            }
                        ]
                    },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/invitations') || path.endsWith('/audit-events')) {
                return respond(200, {
                    data: { items: [] },
                    meta: { page: { nextCursor: null } }
                });
            }
            if (path.endsWith('/key-envelopes/current')) {
                return respond(200, {
                    data: { readiness: 'key_ready', envelope: null },
                    meta: {}
                });
            }
            if (path === `/api/v1/devices/${DEVICE_ID}` && method === 'DELETE') {
                return respond(204, null);
            }
            return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
        },
        randomId: () => 'a'.repeat(36)
    });
    const initialDevice = JSON.stringify({
        deviceId: DEVICE_ID,
        fingerprint: 'ab'.repeat(32),
        state: 'active',
        publicJwk: CANONICAL_PUBLIC_JWK,
        unlockSecret: 'secret'
    });
    const storage = fakeStorage({
        [`docvault:collab:preview:${ownerId}:active-workspace`]: workspaceId,
        [deviceKey]: initialDevice
    });

    await startCollaboration({
        document: doc,
        deployment: available,
        storage,
        environment: 'preview',
        client,
        deviceLifecycleFactory: input => ({
            context: input.context,
            changeContext(context) { this.context = context; },
            async revokeLocalDevice() {}
        })
    });
    withParents(doc.container);

    const memberRevoke = doc.container
        .querySelectorAll('[data-collab-action="revoke-member-device"]')
        .find(control => control.getAttribute('data-user-id') === memberId);
    assert.notEqual(memberRevoke, undefined);
    assert.equal(memberRevoke.disabled, true);
    assert.equal(memberRevoke.getAttribute('aria-disabled'), 'true');
    assert.match(memberRevoke.getAttribute('title'), /specific member device/i);

    // Defence in depth: even if a future renderer accidentally gives the row
    // the current-device action and enables it, the surface guard still refuses
    // dispatch before any request or local cleanup.
    memberRevoke.disabled = false;
    memberRevoke.setAttribute('data-collab-action', 'revoke-this-device');
    simulateClick(doc.container, memberRevoke);
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests.some(request => request.method === 'DELETE'), false);
    assert.equal(storage.getItem(deviceKey), initialDevice);

    await client.list({ path: `/api/v1/workspaces/${workspaceId}/members` });
    assert.equal(requests.at(-1).headers['X-DocVault-Device-ID'], DEVICE_ID,
        'the member control cleared the acting-device header');

    const thisDevice = doc.container.querySelector('.collab-device__revoke');
    assert.notEqual(thisDevice, null);
    assert.equal(thisDevice.getAttribute('data-collab-action'), 'revoke-this-device');
    assert.equal(thisDevice.disabled, false);
    simulateClick(doc.container, thisDevice);
    for (let turn = 0; turn < 10
        && !requests.some(request => request.method === 'DELETE'); turn += 1) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    const deletions = requests.filter(request => request.method === 'DELETE');
    assert.deepEqual(deletions.map(request => request.path),
        [`/api/v1/devices/${DEVICE_ID}`],
        'the current-device control targeted anything except this registered device');
});
