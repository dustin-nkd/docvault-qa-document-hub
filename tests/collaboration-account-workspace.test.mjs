// CF-P7-003 — account menu, workspace switcher, and persistent workspace identity.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    selectionKey, resolveContext, createWorkspaceSelection, contextLabel,
    WorkspaceContextError
} from '../js/collaboration/workspace-context.js';
import { accountMenuModel, renderAccountMenu, setAccountMenuOpen, AccountMenuError }
    from '../js/collaboration/account-menu.js';
import {
    workspaceSwitcherModel, renderWorkspaceSwitcher, renderContextIndicator, setSwitcherOpen
} from '../js/collaboration/workspace-switcher.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const WS_A = '11111111-1111-4111-8111-111111111111';
const WS_B = '22222222-2222-4222-8222-222222222222';
const GONE = '33333333-3333-4333-8333-333333333333';

const workspaces = [
    { workspaceId: WS_A, displayName: 'Platform QA', role: 'editor' },
    { workspaceId: WS_B, displayName: 'Release Team', role: 'viewer' }
];

// ── minimal DOM ──────────────────────────────────────────────────────────────

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', hidden: false, disabled: false, focused: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
        focus() { this.focused = true; },
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

function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        map
    };
}

// ── selection key ────────────────────────────────────────────────────────────

test('the selection key is scoped by environment and subject, never by workspace', () => {
    const key = selectionKey({ environment: 'preview', subject: 'user-1' });
    assert.equal(key, 'docvault:collab:preview:user-1:active-workspace');
    assert.notEqual(key, selectionKey({ environment: 'production', subject: 'user-1' }));
    assert.notEqual(key, selectionKey({ environment: 'preview', subject: 'user-2' }));
});

test('the selection key rejects an unknown environment', () => {
    assert.throws(() => selectionKey({ environment: 'staging', subject: 'user-1' }),
        error => error instanceof WorkspaceContextError && error.code === 'INVALID_ENVIRONMENT');
});

test('the selection key never collides with a personal vault key', () => {
    const key = selectionKey({ environment: 'local', subject: 'user-1' });
    for (const personal of ['docvault_docs', 'docvault_deleted_ids', 'docvault_sync_pending']) {
        assert.notEqual(key, personal);
    }
    assert.equal(key.startsWith('docvault:collab:'), true);
});

// ── the U2 behaviour that matters ────────────────────────────────────────────

test('a remembered workspace that is gone does NOT silently fall back to another', () => {
    const context = resolveContext({ remembered: GONE, workspaces });
    assert.equal(context.status, 'unavailable');
    assert.equal(context.workspace, null);
    // The critical assertion: it must not have quietly become WS_A.
    assert.notEqual(context.workspaceId, WS_A);
    assert.equal(context.workspaceId, GONE, 'the lost id is kept so the surface can name it');
});

test('a remembered, still-available workspace survives reload', () => {
    const storage = memoryStorage();
    const selection = createWorkspaceSelection({ storage, environment: 'local', subject: 'u' });
    selection.write(WS_B);

    // A new instance stands in for a fresh page load.
    const reloaded = createWorkspaceSelection({ storage, environment: 'local', subject: 'u' });
    const context = resolveContext({ remembered: reloaded.read(), workspaces });
    assert.equal(context.status, 'active');
    assert.equal(context.workspaceId, WS_B);
});

test('no selection and no workspaces are different, explicit states', () => {
    assert.equal(resolveContext({ remembered: null, workspaces }).status, 'none-selected');
    assert.equal(resolveContext({ remembered: null, workspaces: [] }).status, 'empty');
    assert.equal(resolveContext({ remembered: WS_A, workspaces: [] }).status, 'empty');
});

test('a corrupt stored value reads as no selection rather than throwing', () => {
    const storage = memoryStorage({ 'docvault:collab:local:u:active-workspace': 'not-a-uuid' });
    const selection = createWorkspaceSelection({ storage, environment: 'local', subject: 'u' });
    assert.equal(selection.read(), null);
});

test('a storage failure degrades instead of breaking the surface', () => {
    const hostile = {
        getItem() { throw new Error('blocked'); },
        setItem() { throw new Error('blocked'); },
        removeItem() { throw new Error('blocked'); }
    };
    const selection = createWorkspaceSelection({ storage: hostile, environment: 'local', subject: 'u' });
    assert.equal(selection.read(), null);
    assert.equal(selection.write(WS_A), false);
    assert.equal(selection.clear(), false);
});

test('every context status yields a non-empty label', () => {
    for (const context of [
        resolveContext({ remembered: WS_A, workspaces }),
        resolveContext({ remembered: null, workspaces }),
        resolveContext({ remembered: GONE, workspaces }),
        resolveContext({ remembered: null, workspaces: [] })
    ]) {
        assert.equal(contextLabel(context).length > 0, true, `${context.status} had a blank label`);
    }
});

// ── account menu ─────────────────────────────────────────────────────────────

test('a signed-out visitor gets an actionable sign-in, not an empty state', () => {
    const model = accountMenuModel({ session: { authenticated: false } });
    assert.equal(model.state, 'signed-out');
    assert.deepEqual(model.items.map(item => item.id), ['sign-in']);
});

test('an unknown session renders loading rather than guessing signed-out', () => {
    assert.equal(accountMenuModel({ session: null }).state, 'loading');
});

test('a signed-in menu requires a login and offers sign-out', () => {
    const model = accountMenuModel({ session: { authenticated: true, login: 'dustin-nkd' } });
    assert.equal(model.login, 'dustin-nkd');
    assert.deepEqual(model.items.map(item => item.id), ['sign-out']);
    assert.throws(() => accountMenuModel({ session: { authenticated: true } }),
        error => error instanceof AccountMenuError && error.code === 'LOGIN_REQUIRED');
});

test('a non-https avatar is dropped rather than rendered', () => {
    const model = accountMenuModel({
        session: { authenticated: true, login: 'x', avatarUrl: 'http://evil.test/a.png' }
    });
    assert.equal(model.avatarUrl, null);
});

test('the trigger always carries a text label, never an avatar alone', () => {
    const node = renderAccountMenu(doc, accountMenuModel({
        session: { authenticated: true, login: 'dustin-nkd', avatarUrl: 'https://x.test/a.png' }
    }));
    const label = node.querySelector('.collab-account__label');
    assert.equal(label.textContent, 'dustin-nkd');
    assert.equal(node.querySelector('.collab-account__avatar').getAttribute('aria-hidden'), 'true');
});

test('opening and closing the menu keeps aria-expanded and focus in step', () => {
    const node = renderAccountMenu(doc, accountMenuModel({
        session: { authenticated: true, login: 'dustin-nkd' }
    }));
    const trigger = node.querySelector('.collab-account__trigger');
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');

    setAccountMenuOpen({ root: node, open: true });
    assert.equal(trigger.getAttribute('aria-expanded'), 'true');
    assert.equal(node.querySelector('.collab-account__menu').hidden, false);
    assert.equal(node.querySelector('.collab-account__item').focused, true);

    setAccountMenuOpen({ root: node, open: false });
    assert.equal(trigger.getAttribute('aria-expanded'), 'false');
    assert.equal(trigger.focused, true, 'focus must return to the trigger on close');
});

// ── switcher ─────────────────────────────────────────────────────────────────

test('the context indicator renders outside the menu so U2 holds without opening it', () => {
    const context = resolveContext({ remembered: WS_A, workspaces });
    const model = workspaceSwitcherModel({ context, workspaces });
    const indicator = renderContextIndicator(doc, model);
    assert.equal(indicator.querySelector('.collab-context__name').textContent, 'Platform QA');
    assert.equal(indicator.getAttribute('data-context-status'), 'active');
    assert.equal(indicator.querySelector('.collab-context__name').getAttribute('aria-current'), 'true');
});

test('status is exposed as data, so a non-active context is not colour-only', () => {
    for (const remembered of [null, GONE]) {
        const model = workspaceSwitcherModel({ context: resolveContext({ remembered, workspaces }), workspaces });
        const indicator = renderContextIndicator(doc, model);
        assert.notEqual(indicator.getAttribute('data-context-status'), 'active');
        assert.equal(indicator.querySelector('.collab-context__name').textContent.length > 0, true);
    }
});

test('the active workspace is the only option marked selected', () => {
    const model = workspaceSwitcherModel({
        context: resolveContext({ remembered: WS_B, workspaces }), workspaces
    });
    const node = renderWorkspaceSwitcher(doc, model);
    const selected = node.querySelectorAll('[aria-selected="true"]');
    assert.equal(selected.length, 1);
    assert.equal(selected[0].getAttribute('data-workspace-id'), WS_B);
});

test('with no workspaces the switch control is disabled with a stated reason, not hidden', () => {
    const model = workspaceSwitcherModel({
        context: resolveContext({ remembered: null, workspaces: [] }), workspaces: []
    });
    const node = renderWorkspaceSwitcher(doc, model);
    const trigger = node.querySelector('.collab-switcher__trigger');
    assert.notEqual(trigger, null, 'the control must stay in the document');
    assert.equal(trigger.disabled, true);
    assert.equal(trigger.getAttribute('aria-disabled'), 'true');
    assert.equal((trigger.getAttribute('title') ?? '').length > 0, true);
    assert.equal(setSwitcherOpen({ root: node, open: true }), false);
});

test('every option shows its role', () => {
    const model = workspaceSwitcherModel({
        context: resolveContext({ remembered: WS_A, workspaces }), workspaces
    });
    const node = renderWorkspaceSwitcher(doc, model);
    const badges = node.querySelectorAll('.collab-role-badge');
    assert.deepEqual(badges.map(badge => badge.textContent), ['editor', 'viewer']);
});

test('an unknown role is rejected rather than rendered', () => {
    assert.throws(() => workspaceSwitcherModel({
        context: resolveContext({ remembered: null, workspaces }),
        workspaces: [{ workspaceId: WS_A, displayName: 'x', role: 'superuser' }]
    }), /INVALID_ROLE/);
});

test('closing the switcher restores focus to its trigger', () => {
    const model = workspaceSwitcherModel({
        context: resolveContext({ remembered: WS_A, workspaces }), workspaces
    });
    const node = renderWorkspaceSwitcher(doc, model);
    setSwitcherOpen({ root: node, open: true });
    assert.equal(node.querySelector('[aria-selected="true"]').focused, true);
    setSwitcherOpen({ root: node, open: false });
    assert.equal(node.querySelector('.collab-switcher__trigger').focused, true);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('these surfaces never reach for personal vault storage or innerHTML', () => {
    for (const file of ['js/collaboration/workspace-context.js', 'js/collaboration/account-menu.js',
        'js/collaboration/workspace-switcher.js']) {
        const source = read(file);
        for (const key of ['docvault_docs', 'docvault_deleted_ids', 'docvault_sync_pending', 'DocStorage']) {
            assert.equal(source.includes(key), false, `${file} reached for ${key}`);
        }
        assert.equal(/\.innerHTML/.test(source), false, `${file} renders through innerHTML`);
    }
});

test('the switcher modules stay lazy', () => {
    assert.equal(/<script[^>]+collaboration\//.test(read('index.html')), false);
    assert.equal(/collaboration/.test(read('sw.js')), false);
});
