// CF-P7-013 — the panel filled from the deployment, not from nothing.
//
// The composition landed before anything fed it: every surface mounted, and
// every one of them mounted in `loading`, because the panel's `data` was never
// populated. These cases drive the whole path — session, workspaces, then each
// surface's own authorized read — over a routing transport, and assert what the
// user is left looking at.
//
// Kept apart from collaboration-entry.test.mjs, which pins the lazy budget and
// the hand-fed states. This file is about what happens once the entry is allowed
// to ask questions.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startCollaboration, CHROME_ID } from '../js/collaboration/entry.js';
import { createApiClient } from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── a DOM small enough to reason about ───────────────────────────────────────

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

const textOf = node => {
    const walk = current => [current.textContent ?? '', ...(current.children ?? []).flatMap(walk)];
    return walk(node).join(' ');
};

// ── the deployment, answering by route rather than by call order ─────────────

const available = { available: true, reason: 'cloudflare-deployment' };

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const INVITATION = '66666666-6666-4666-8666-666666666666';
const EVENT = '99999999-9999-4999-8999-999999999999';

const respond = (status, body, contentType = 'application/json; charset=utf-8') => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body
});

const okPage = items => respond(200, { data: { items }, meta: { page: { nextCursor: null } } });

// /api/v1/session answers with its fields directly at the top level, not the
// {data, meta} envelope every other route in this suite's fixtures uses --
// see js/collaboration/api-client.js's resolveSession() for why that
// distinction is load-bearing.
const sessionBody = {
    authenticated: true,
    user: { userId: OWNER, login: 'dustin-nkd' },
    session: {},
    csrfToken: 'csrf'
};

const workspaceRecord = role => ({
    workspaceId: WORKSPACE, displayName: 'Platform QA', role, keyReadiness: 'key_ready'
});

const memberRecord = {
    userId: OWNER, role: 'owner', state: 'active', keyReadiness: 'key_ready',
    displayProfile: { login: 'dustin-nkd' }
};

const invitationRecord = {
    invitationId: INVITATION, targetDisplayLogin: 'octocat', role: 'editor',
    state: 'pending', expiresAt: '2026-07-29T00:00:00.000Z'
};

const auditRecord = {
    eventId: EVENT, eventType: 'workspace.created', outcome: 'success',
    occurredAt: '2026-07-26T00:00:00.000Z'
};

const MEMBERS = `/api/v1/workspaces/${WORKSPACE}/members`;
const INVITATIONS = `/api/v1/workspaces/${WORKSPACE}/invitations`;
const AUDIT = `/api/v1/workspaces/${WORKSPACE}/audit-events`;
const ENVELOPE = `/api/v1/workspaces/${WORKSPACE}/key-envelopes/current`;

function routingClient(routes) {
    const seen = [];
    const client = createApiClient({
        fetch: async url => {
            const pathname = url.split('?')[0];
            seen.push(pathname);
            const answer = routes[pathname];
            if (answer === undefined) {
                return respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} });
            }
            return typeof answer === 'function' ? answer(seen) : answer;
        },
        randomId: () => 'a'.repeat(36)
    });
    return { client, seen };
}

const ownerRoutes = (overrides = {}) => ({
    '/api/v1/session': respond(200, sessionBody),
    '/api/v1/workspaces': okPage([workspaceRecord('owner')]),
    [MEMBERS]: okPage([memberRecord]),
    [INVITATIONS]: okPage([invitationRecord]),
    [AUDIT]: okPage([auditRecord]),
    [ENVELOPE]: respond(200, { data: { readiness: 'key_ready', envelope: {} }, meta: {} }),
    ...overrides
});

/** A store already holding the remembered workspace, as a reload would find it. */
function storageRemembering(workspaceId) {
    const map = new Map([[`docvault:collab:preview:${OWNER}:active-workspace`, workspaceId]]);
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, value),
        removeItem: key => map.delete(key)
    };
}

async function inWorkspace(doc, routes) {
    const { client, seen } = routingClient(routes);
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview'
    });
    return seen;
}

const sectionFor = (doc, surface) => doc.container.querySelector(`[data-surface="${surface}"]`);
const stateOf = (doc, surface) => sectionFor(doc, surface).children[0]
    .getAttribute('data-collab-state');

// ── what the deployment answers is what the surfaces show ────────────────────

test('an active workspace fills its surfaces from the deployment', async () => {
    const doc = documentWithRoot();
    const seen = await inWorkspace(doc, ownerRoutes());

    assert.ok(seen.includes(MEMBERS), 'the member list was never asked for');
    assert.ok(seen.includes(INVITATIONS), 'the invitation list was never asked for');
    assert.ok(seen.includes(AUDIT), 'the activity log was never asked for');

    // Rendered, not merely fetched. Every one of these was stuck on `loading`
    // before this story, because nothing joined the client to the surfaces.
    const members = sectionFor(doc, 'member-list-role-badge');
    assert.notEqual(members.querySelector('[data-collab-surface="member-list-role-badge"]'), null);
    assert.match(textOf(members), /dustin-nkd/);
    assert.match(textOf(sectionFor(doc, 'invitation-manage')), /octocat/);
    assert.match(textOf(sectionFor(doc, 'audit-activity')), /workspace\.created/);
});

test('key readiness reaches the device surface from the live deployment', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        [ENVELOPE]: respond(200, { data: { readiness: 'pending_key', envelope: null }, meta: {} })
    }));
    const device = sectionFor(doc, 'device-key-initialization')
        .querySelector('[data-readiness="pending_key"]');
    assert.notEqual(device, null, 'the readiness the deployment reported was not rendered');
});

test('the shell is painted before the workspace reads return', async () => {
    const doc = documentWithRoot();
    let paintedWhileInFlight = null;
    await inWorkspace(doc, ownerRoutes({
        [MEMBERS]: () => {
            paintedWhileInFlight = doc.container.children[0]?.id ?? null;
            return okPage([memberRecord]);
        }
    }));
    // Holding the whole shell back until the slowest read returns would put the
    // user in front of a blank page to save them one repaint.
    assert.equal(paintedWhileInFlight, CHROME_ID);
});

// ── a read that came back refused ────────────────────────────────────────────

test('a denied read becomes that surface error, never a permanent loading', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        [MEMBERS]: respond(403, { error: { code: 'OPERATION_NOT_PERMITTED' }, meta: {} })
    }));

    assert.equal(stateOf(doc, 'member-list-role-badge'), 'error',
        'a read that came back refused still says it is loading');
    // One refused read is a fact about one surface and about nothing else.
    assert.match(textOf(sectionFor(doc, 'audit-activity')), /workspace\.created/);
    assert.match(textOf(sectionFor(doc, 'invitation-manage')), /octocat/);
});

test('the refusal carries the reason the server gave, not a generic one', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        [MEMBERS]: respond(429, { error: { code: 'RATE_LIMITED' }, meta: {} })
    }));
    assert.match(textOf(sectionFor(doc, 'member-list-role-badge')), /Wait a moment and try again/);
});

test('a session that ended mid-read says so rather than showing a failure', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        [AUDIT]: respond(401, { error: { code: 'AUTHENTICATION_REQUIRED' }, meta: {} })
    }));
    assert.equal(stateOf(doc, 'audit-activity'), 'unauthorized');
});

test('an unrecognised code fails closed and is never echoed at the user', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        [MEMBERS]: respond(500, { error: { code: 'SOMETHING_NOBODY_FROZE' }, meta: {} })
    }));
    const rendered = textOf(sectionFor(doc, 'member-list-role-badge'));
    assert.equal(stateOf(doc, 'member-list-role-badge'), 'error');
    assert.equal(rendered.includes('SOMETHING_NOBODY_FROZE'), false);
});

// ── nothing is asked that the role may not ask ───────────────────────────────

test('a role is never asked for a read it may not make', async () => {
    const doc = documentWithRoot();
    const { client, seen } = routingClient({
        ...ownerRoutes(),
        '/api/v1/workspaces': okPage([workspaceRecord('editor')])
    });
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview'
    });

    // An editor's denial is already stated by the surface's own role-disabled
    // explanation. Spending a request to be told the same thing would replace
    // that explanation with a generic failure and lose the reason.
    assert.equal(seen.includes(INVITATIONS), false);
    assert.equal(seen.includes(AUDIT), false);
    assert.match(textOf(sectionFor(doc, 'audit-activity')),
        /Only an owner or admin can read the workspace activity log/);
});

test('no workspace selected reads nothing workspace-scoped', async () => {
    const doc = documentWithRoot();
    const { client, seen } = routingClient(ownerRoutes());
    await startCollaboration({ document: doc, deployment: available, client });
    assert.deepEqual(seen, ['/api/v1/session', '/api/v1/workspaces']);
    assert.equal(stateOf(doc, 'member-list-role-badge'), 'empty');
});

// ── Access removed, which may only be claimed after a re-check ───────────────

test('a membership removed while the workspace was open resolves to Access removed', async () => {
    const doc = documentWithRoot();
    let listed = 0;
    await inWorkspace(doc, ownerRoutes({
        // The first list is what put the user in the workspace; the re-check
        // afterwards is the only thing allowed to claim the terminal state.
        '/api/v1/workspaces': () => {
            listed += 1;
            return okPage(listed === 1 ? [workspaceRecord('owner')] : []);
        },
        [MEMBERS]: respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
    }));
    assert.ok(listed >= 2, 'the membership re-check never ran');
    const sync = sectionFor(doc, 'sync-state')
        .querySelector('[data-collab-surface="sync-state"]');
    assert.equal(sync.getAttribute('data-sync-state'), 'access-removed');
    assert.equal(sync.getAttribute('data-terminal'), 'true');
});

test('a denial alone never claims Access removed', async () => {
    const doc = documentWithRoot();
    await inWorkspace(doc, ownerRoutes({
        // Still a member; the record simply was not returned. The API answers
        // the same code either way, which is exactly why the re-check exists —
        // inferring removal from the code would confirm the resource's absence.
        [MEMBERS]: respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
    }));
    const sync = sectionFor(doc, 'sync-state')
        .querySelector('[data-collab-surface="sync-state"]');
    assert.equal(sync.getAttribute('data-sync-state'), 'saved');
});

test('a re-check that cannot complete claims nothing', async () => {
    const doc = documentWithRoot();
    let listed = 0;
    await inWorkspace(doc, ownerRoutes({
        '/api/v1/workspaces': () => {
            listed += 1;
            return listed === 1
                ? okPage([workspaceRecord('owner')])
                : respond(503, { error: { code: 'COLLABORATION_UNAVAILABLE' }, meta: {} });
        },
        [MEMBERS]: respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
    }));
    const sync = sectionFor(doc, 'sync-state')
        .querySelector('[data-collab-surface="sync-state"]');
    assert.notEqual(sync.getAttribute('data-sync-state'), 'access-removed');
});

// ── U2: the chrome and the panel agree about where the user is ───────────────

test('the remembered workspace is the one whose members are read', async () => {
    const doc = documentWithRoot();
    const seen = await inWorkspace(doc, ownerRoutes());
    // U2's harder half. If these disagreed the page would name one workspace in
    // the chrome and show another one's people underneath it.
    assert.match(textOf(doc.container.children[0]), /Platform QA/);
    assert.ok(seen.includes(MEMBERS));
});

test('a remembered workspace that is gone loads nothing rather than substituting one', async () => {
    const doc = documentWithRoot();
    const other = '77777777-7777-4777-8777-777777777777';
    const { client, seen } = routingClient({
        ...ownerRoutes(),
        '/api/v1/workspaces': okPage([{
            workspaceId: other, displayName: 'Another', role: 'owner', keyReadiness: 'key_ready'
        }])
    });
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview'
    });
    // Silently landing the user in a different workspace is the failure U2
    // exists to prevent, and it is worse than showing nothing: they may act on
    // the wrong data believing it is theirs.
    assert.equal(seen.some(entry => entry.includes(other)), false);
    assert.equal(seen.includes(MEMBERS), false);
});

// ── the invitation the address bar carried ───────────────────────────────────

const TOKEN = 'z'.repeat(48);

function addressBar(hash) {
    const location = { hash, pathname: '/', search: '' };
    const replaced = [];
    return {
        location,
        history: { replaceState: (state, title, url) => replaced.push(url) },
        replaced
    };
}

test('an invitation link is reviewed and rendered on its own surface', async () => {
    const doc = documentWithRoot();
    const bar = addressBar(`#/invite/${TOKEN}`);
    const { client, seen } = routingClient({
        ...ownerRoutes(),
        '/api/v1/invitations/bootstrap': respond(200, {
            data: {
                invitationId: INVITATION, workspaceDisplayName: 'Platform QA',
                targetDisplayLogin: 'dustin-nkd', role: 'editor',
                expiresAt: '2026-07-29T00:00:00.000Z', state: 'pending'
            },
            meta: {}
        })
    });
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview',
        location: bar.location, history: bar.history
    });

    assert.ok(seen.includes('/api/v1/invitations/bootstrap'),
        'the invitation was never reviewed');
    const accept = sectionFor(doc, 'invitation-accept');
    assert.match(textOf(accept), /Platform QA/);
    assert.match(textOf(accept), /You have been invited/);
    // Replacement, not a push: a push would leave the token in the back stack,
    // where Back would restore it into the address bar long afterwards.
    assert.deepEqual(bar.replaced, ['/']);
});

test('the invitation token never reaches a URL', async () => {
    const doc = documentWithRoot();
    const bar = addressBar(`#/invite/${TOKEN}`);
    const { client, seen } = routingClient({
        ...ownerRoutes(),
        '/api/v1/invitations/bootstrap': respond(200, {
            data: {
                invitationId: INVITATION, workspaceDisplayName: 'Platform QA',
                targetDisplayLogin: 'dustin-nkd', role: 'editor',
                expiresAt: '2026-07-29T00:00:00.000Z', state: 'pending'
            },
            meta: {}
        })
    });
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview',
        location: bar.location, history: bar.history
    });
    assert.equal(seen.some(entry => entry.includes(TOKEN)), false);
    assert.equal(bar.replaced.some(url => String(url).includes(TOKEN)), false);
});

test('an invitation that cannot be read is that surface error, not the page', async () => {
    const doc = documentWithRoot();
    const bar = addressBar(`#/invite/${TOKEN}`);
    const { client } = routingClient({
        ...ownerRoutes(),
        '/api/v1/invitations/bootstrap':
            respond(404, { error: { code: 'RESOURCE_NOT_FOUND' }, meta: {} })
    });
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview',
        location: bar.location, history: bar.history
    });
    assert.equal(stateOf(doc, 'invitation-accept'), 'error');
    assert.match(textOf(sectionFor(doc, 'member-list-role-badge')), /dustin-nkd/);
});

test('no invitation link means no bootstrap request', async () => {
    const doc = documentWithRoot();
    const bar = addressBar('#/settings');
    const { client, seen } = routingClient(ownerRoutes());
    await startCollaboration({
        document: doc, deployment: available, client,
        storage: storageRemembering(WORKSPACE), environment: 'preview',
        location: bar.location, history: bar.history
    });
    assert.equal(seen.includes('/api/v1/invitations/bootstrap'), false);
    assert.deepEqual(bar.replaced, [], 'an unrelated fragment was rewritten');
    assert.equal(stateOf(doc, 'invitation-accept'), 'empty');
});

// ── the environment the remembered selection is scoped to ───────────────────

/** js/deployment.js is a classic script, so it is evaluated rather than imported. */
function loadDeployment() {
    const source = fs.readFileSync(path.join(root, 'js', 'deployment.js'), 'utf8');
    const window = {};
    new Function('window', 'document', 'location', source)(window, undefined, undefined);
    return window.DocVaultDeployment;
}

test('a preview selection can never be restored in production', () => {
    const { environmentOf } = loadDeployment();
    // Pages names production `<project>.pages.dev` and every preview
    // `<something>.<project>.pages.dev`, so the label count is the distinction.
    assert.equal(environmentOf('docvault-qa-document-hub.pages.dev', 'cloudflare'), 'production');
    assert.equal(environmentOf('4c5d7c8a.docvault-qa-document-hub.pages.dev', 'cloudflare'),
        'preview');
    assert.equal(environmentOf('localhost', 'local'), 'local');
    // Unrecognised answers `preview`, the conservative side: a selection that
    // fails to restore costs a click; one restored into the wrong environment
    // shows a user a workspace they did not choose.
    assert.equal(environmentOf('docs.example.test', 'unknown'), 'preview');
});

test('the opener hands the entry a store, an environment, and the address bar', () => {
    const source = fs.readFileSync(path.join(root, 'js', 'deployment.js'), 'utf8');
    // Without these the entry can never restore a remembered workspace and an
    // invitation link is a fragment nothing reads — both surfaced as surfaces
    // that render but stay empty forever.
    for (const argument of ['storage:', 'environment:', 'location:', 'history:']) {
        assert.ok(source.includes(argument),
            `the opener no longer hands the entry ${argument}`);
    }
});

test('only an exact invitation fragment opts into automatic lazy opening', () => {
    const { hasInvitationFragment } = loadDeployment();
    assert.equal(hasInvitationFragment({ hash: `#/invite/${'a'.repeat(80)}` }), true);
    assert.equal(hasInvitationFragment({ hash: '#/settings' }), false);
    assert.equal(hasInvitationFragment({ hash: '#/invite/too-short' }), false);
    assert.equal(hasInvitationFragment({ hash: `#/invite/${'a'.repeat(80)}?leak=1` }), false);
    assert.equal(hasInvitationFragment(null), false);
});

// ── the personal boundary ────────────────────────────────────────────────────

test('no personal storage key is touched on any collaboration path', async () => {
    const touched = [];
    const doc = documentWithRoot();
    const storage = {
        getItem(key) {
            touched.push(key);
            return key.startsWith('docvault:collab:') ? WORKSPACE : null;
        },
        setItem(key) { touched.push(key); },
        removeItem(key) { touched.push(key); }
    };
    const { client } = routingClient(ownerRoutes());
    await startCollaboration({
        document: doc, deployment: available, client, storage, environment: 'preview'
    });
    for (const personal of ['docvault_docs', 'docvault_deleted_ids', 'docvault_sync_pending',
        'DocStorage']) {
        assert.equal(touched.includes(personal), false, `a collaboration path read ${personal}`);
    }
    assert.ok(touched.every(key => key.startsWith('docvault:collab:')),
        `an unexpected storage key was touched: ${touched.join(', ')}`);
});
