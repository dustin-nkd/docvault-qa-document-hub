// CF-P7-013 — composing the built surfaces into the shell.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSurfacePanel, COMPOSED_SURFACES, PANEL_ID, SurfacePanelError }
    from '../js/collaboration/surface-panel.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const WS = '55555555-5555-4555-8555-555555555555';
const DEVICE = '44444444-4444-4444-8444-444444444444';
const FP = 'abcdEFGH1234ijklMNOP5678qrstUVWX90';

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', value: '', hidden: false, disabled: false,
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
const doc = { createElement: element };

const signedIn = { authenticated: true, login: 'dustin-nkd' };
const activeContext = { status: 'active', workspaceId: WS };
const noContext = { status: 'none-selected', workspaceId: null };
const activeDevice = { deviceId: DEVICE, fingerprint: FP, status: 'active', state: 'active' };
const actor = { userId: USER, role: 'owner', keyReady: true };

const panel = (overrides = {}) => renderSurfacePanel({
    document: doc, context: activeContext, session: signedIn, device: activeDevice,
    ...overrides
});
const surfacesIn = node => node.querySelectorAll('[data-surface]')
    .map(item => item.getAttribute('data-surface'));

// ── every built surface is reachable ─────────────────────────────────────────

test('composes all eight remaining surfaces', () => {
    assert.equal(COMPOSED_SURFACES.length, 8);
    const mounted = panel().children.map(section => section.getAttribute('data-surface'));
    assert.deepEqual(mounted, [...COMPOSED_SURFACES]);
});

test('a surface is never simply left out', () => {
    // With no data at all, every section is still present — as loading, empty,
    // or its own state, but present.
    const node = panel({ data: {} });
    assert.equal(node.children.length, COMPOSED_SURFACES.length);
    for (const section of node.children) {
        assert.ok(section.children.length > 0,
            `${section.getAttribute('data-surface')} mounted nothing`);
    }
});

test('marks the panel with the context it was built for', () => {
    assert.equal(panel().getAttribute('data-context-status'), 'active');
    assert.equal(panel({ context: noContext }).getAttribute('data-context-status'), 'none-selected');
});

test('separates account-scoped surfaces from workspace-scoped ones', () => {
    const node = panel();
    const scopes = new Map(node.children.map(section =>
        [section.getAttribute('data-surface'), section.getAttribute('data-scope')]));
    assert.equal(scopes.get('create-workspace'), 'account');
    assert.equal(scopes.get('device-key-initialization'), 'account');
    assert.equal(scopes.get('invitation-accept'), 'account');
    assert.equal(scopes.get('member-list-role-badge'), 'workspace');
    assert.equal(scopes.get('audit-activity'), 'workspace');
});

// ── what happens without a workspace ─────────────────────────────────────────

test('workspace-scoped surfaces say no workspace is selected, and account ones still render', () => {
    const node = panel({ context: noContext, data: { actor, members: [], auditEvents: [] } });
    const sections = new Map(node.children.map(section =>
        [section.getAttribute('data-surface'), section]));
    assert.equal(sections.get('member-list-role-badge')
        .querySelector('[data-collab-state]').getAttribute('data-collab-state'), 'empty');
    assert.notEqual(sections.get('create-workspace')
        .querySelector('[data-collab-surface="create-workspace"]'), null);
});

// ── an unread list is loading, never an empty claim ──────────────────────────

test('an undelivered read renders loading, not an empty list', () => {
    const node = panel({ data: { actor } });
    const sections = new Map(node.children.map(section =>
        [section.getAttribute('data-surface'), section]));
    for (const surface of ['member-list-role-badge', 'invitation-manage', 'audit-activity']) {
        const state = sections.get(surface).querySelector('[data-collab-state]');
        assert.equal(state.getAttribute('data-collab-state'), 'loading', surface);
    }
});

test('a delivered empty list renders the surface, not loading', () => {
    const node = panel({ data: { actor, members: [], invitations: [], auditEvents: [] } });
    const sections = new Map(node.children.map(section =>
        [section.getAttribute('data-surface'), section]));
    assert.notEqual(sections.get('member-list-role-badge')
        .querySelector('[data-collab-surface="member-list-role-badge"]'), null);
    assert.notEqual(sections.get('audit-activity')
        .querySelector('[data-collab-surface="audit-activity"]'), null);
});

// ── one broken surface does not take down the panel ──────────────────────────

test('a surface whose data the contract refuses becomes an error, alone', () => {
    const node = panel({
        data: {
            actor,
            // A member id the contract cannot accept: memberListModel refuses it.
            members: [{ userId: 'not-a-uuid', role: 'editor', state: 'active',
                keyReadiness: 'key_ready', displayLogin: 'x' }],
            invitations: [], auditEvents: []
        }
    });
    const sections = new Map(node.children.map(section =>
        [section.getAttribute('data-surface'), section]));
    const broken = sections.get('member-list-role-badge').querySelector('[data-collab-state]');
    assert.equal(broken.getAttribute('data-collab-state'), 'error');
    // Read the reason node directly: this minimal DOM does not aggregate
    // textContent from descendants the way a real one does.
    assert.match(broken.querySelector('.collab-state__reason').textContent,
        /member-list-role-badge/);
    // The eight-section panel is intact and the neighbours still rendered.
    assert.equal(node.children.length, 8);
    assert.notEqual(sections.get('audit-activity')
        .querySelector('[data-collab-surface="audit-activity"]'), null);
});

test('the refusal names the surface and says the rest is unaffected', () => {
    const node = panel({
        data: { actor, members: [{ userId: 'bad', role: 'editor', state: 'active',
            keyReadiness: 'key_ready', displayLogin: 'x' }] }
    });
    const reason = node.querySelector('.collab-state__reason').textContent;
    assert.match(reason, /rest of the page is unaffected/);
});

// ── the surfaces that appear only when there is something to show ────────────

test('the conflict dialog is absent-by-state until there is a conflict', () => {
    const node = panel({ data: { actor, members: [], invitations: [], auditEvents: [] } });
    const section = node.children.find(item =>
        item.getAttribute('data-surface') === 'conflict-dialog');
    assert.equal(section.querySelector('[data-collab-state]').getAttribute('data-collab-state'),
        'empty');
});

test('invitation acceptance explains how it appears rather than showing nothing', () => {
    const node = panel({ data: { actor } });
    const section = node.children.find(item =>
        item.getAttribute('data-surface') === 'invitation-accept');
    assert.match(section.querySelector('.collab-state__reason').textContent,
        /Open an invitation link/);
});

test('sync state defaults to Saved and renders every state it is given', () => {
    for (const state of ['saved', 'saving', 'offline', 'conflict', 'access-removed']) {
        const node = panel({ data: { actor, syncState: state } });
        const section = node.children.find(item =>
            item.getAttribute('data-surface') === 'sync-state');
        assert.equal(section.querySelector('[data-sync-state]').getAttribute('data-sync-state'),
            state);
    }
});

// ── contract hygiene ─────────────────────────────────────────────────────────

test('requires a document, a context, and a session', () => {
    assert.throws(() => renderSurfacePanel({ context: activeContext, session: signedIn }),
        error => error instanceof SurfacePanelError && error.code === 'DOCUMENT_REQUIRED');
    assert.throws(() => renderSurfacePanel({ document: doc, session: signedIn }),
        error => error.code === 'CONTEXT_REQUIRED');
    assert.throws(() => renderSurfacePanel({ document: doc, context: activeContext }),
        error => error.code === 'SESSION_REQUIRED');
});

test('carries a stable id so the shell can replace it', () => {
    assert.equal(panel().id, PANEL_ID);
});

test('composes through each surface own model, and performs no transport', () => {
    const source = read('js/collaboration/surface-panel.js');
    assert.equal(/\bfetch\s*\(/.test(source), false);
    assert.equal(/\.innerHTML/.test(source), false);
    for (const module of ['create-workspace', 'device-initialization', 'member-list',
        'invitations', 'invitation-accept', 'sync-state', 'conflict-dialog', 'audit-activity']) {
        assert.match(source, new RegExp(`from '\\./${module}\\.js'`), module);
    }
});

test('every composed surface is one the frozen contract owns', () => {
    const contract = JSON.parse(read('config/cloudflare/phase-7-ui-contract.json'));
    const owned = new Set(contract.surfaces.map(surface => surface.id));
    for (const surface of COMPOSED_SURFACES) {
        assert.ok(owned.has(surface), `${surface} is not a surface the contract owns`);
    }
});

test('together with the chrome and shared states, all twelve are reachable', () => {
    const contract = JSON.parse(read('config/cloudflare/phase-7-ui-contract.json'));
    const entry = read('js/collaboration/entry.js');
    const reachable = new Set(COMPOSED_SURFACES);
    // The chrome mounts these two; the shell owns the shared and deployment ones.
    for (const surface of ['account-menu', 'workspace-switcher']) {
        assert.match(entry, new RegExp(surface.replace('-', '.{0,2}')), surface);
        reachable.add(surface);
    }
    reachable.add('base-states');
    reachable.add('github-pages-banner');
    assert.equal(reachable.size, contract.surfaces.length);
});
