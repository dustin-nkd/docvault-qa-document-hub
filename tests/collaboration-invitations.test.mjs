// CF-P7-007 — invitation creation, copy, and revoke.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    INVITABLE_ROLES, InvitationError, invitationDecision, validateDisplayLogin,
    holdAcceptanceUrl, copyAcceptanceUrl, invitationModel, renderInvitations,
    createInvitation, revokeInvitation
} from '../js/collaboration/invitations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const INVITE = '66666666-6666-4666-8666-666666666666';
const URL_OK = `https://docvault.example/#/invite/${'a'.repeat(43)}`;

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', value: '', hidden: false, disabled: false,
        setAttribute(name, value) { this.attributes.set(name, String(value)); },
        getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; },
        removeAttribute(name) { this.attributes.delete(name); },
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...nodes) { this.children = nodes; },
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
const invite = (overrides = {}) => ({
    invitationId: INVITE, targetDisplayLogin: 'octocat', role: 'editor',
    state: 'pending', expiresAt: '2026-07-29T00:00:00.000Z', ...overrides
});

// ── who may invite whom ──────────────────────────────────────────────────────

test('only an owner invites an admin', () => {
    assert.equal(invitationDecision({ actorRole: 'owner', role: 'admin' }).allowed, true);
    assert.match(invitationDecision({ actorRole: 'admin', role: 'admin' }).reason,
        /Only an owner can invite an admin/);
});

test('an owner or admin invites editors and viewers', () => {
    for (const actorRole of ['owner', 'admin']) {
        for (const role of ['editor', 'viewer']) {
            assert.equal(invitationDecision({ actorRole, role }).allowed, true);
        }
    }
});

test('editors and viewers invite nobody', () => {
    for (const actorRole of ['editor', 'viewer']) {
        assert.match(invitationDecision({ actorRole, role: 'viewer' }).reason, /owner or admin/);
    }
});

test('revocation follows the same split as creation', () => {
    assert.match(invitationDecision({ actorRole: 'admin', role: 'admin', action: 'revoke' }).reason,
        /Only an owner can revoke an invitation for an admin/);
    assert.equal(invitationDecision({ actorRole: 'admin', role: 'editor', action: 'revoke' })
        .allowed, true);
});

test('an owner cannot be invited; ownership moves by transfer', () => {
    assert.equal(INVITABLE_ROLES.includes('owner'), false);
    assert.throws(() => invitationDecision({ actorRole: 'owner', role: 'owner' }),
        error => error instanceof InvitationError && error.code === 'INVALID_ROLE');
});

// ── the username mirror ──────────────────────────────────────────────────────

test('accepts a real GitHub username shape', () => {
    for (const name of ['octocat', 'dustin-nkd', 'a', 'a1-b2-c3']) {
        assert.equal(validateDisplayLogin(name).valid, true, name);
    }
});

test('rejects shapes GitHub itself would not issue', () => {
    for (const name of ['', '-leading', 'trailing-', 'double--hyphen', 'a'.repeat(40), 'has space']) {
        assert.equal(validateDisplayLogin(name).valid, false, name);
    }
});

// ── the one-time secret ──────────────────────────────────────────────────────

test('refuses a URL whose token is not in the fragment', () => {
    assert.throws(() => holdAcceptanceUrl('https://docvault.example/invite/abcdefghijklmnop'),
        error => error.code === 'TOKEN_NOT_IN_FRAGMENT');
});

test('refuses a URL carrying a query string, which would reach the server', () => {
    assert.throws(
        () => holdAcceptanceUrl(`https://docvault.example/?t=1#/invite/${'a'.repeat(43)}`),
        error => error.code === 'TOKEN_MAY_NOT_REACH_A_QUERY_STRING');
});

test('refuses a fragment too short to be a 256-bit token', () => {
    assert.throws(() => holdAcceptanceUrl('https://docvault.example/#short'),
        error => error.code === 'TOKEN_TOO_SHORT');
});

test('states that the value cannot be recovered', () => {
    const held = holdAcceptanceUrl(URL_OK);
    assert.equal(held.oneTimeOnly, true);
    assert.equal(held.recoverable, false);
});

test('a cleared URL cannot be read again', () => {
    const held = holdAcceptanceUrl(URL_OK);
    assert.equal(held.read(), URL_OK);
    held.clear();
    assert.equal(held.cleared(), true);
    assert.throws(() => held.read(), error => error.code === 'ACCEPTANCE_URL_CLEARED');
});

test('copies through the injected clipboard', async () => {
    const written = [];
    const result = await copyAcceptanceUrl({
        clipboard: { async writeText(value) { written.push(value); } },
        held: holdAcceptanceUrl(URL_OK)
    });
    assert.equal(result.copied, true);
    assert.deepEqual(written, [URL_OK]);
});

test('a blocked clipboard explains the manual path rather than failing silently', async () => {
    const result = await copyAcceptanceUrl({
        clipboard: { async writeText() { throw new Error('denied'); } },
        held: holdAcceptanceUrl(URL_OK)
    });
    assert.equal(result.copied, false);
    assert.match(result.reason, /copy it manually/);
    assert.match(result.reason, /cannot be shown again/);
});

test('a missing Clipboard API keeps the holder readable for manual copy', async () => {
    const held = holdAcceptanceUrl(URL_OK);
    const result = await copyAcceptanceUrl({ held });
    assert.equal(result.copied, false);
    assert.match(result.reason, /copy it manually/);
    assert.equal(held.read(), URL_OK);
});

test('the module never stores, logs, or links the secret', () => {
    const source = read('js/collaboration/invitations.js');
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'caches.',
        'console.', 'document.cookie', 'history.pushState']) {
        assert.equal(source.includes(forbidden), false, `the module reaches for ${forbidden}`);
    }
    assert.equal(/\.href\s*=/.test(source), false, 'the secret may be rendered into an anchor');
});

// ── the model and the surface ────────────────────────────────────────────────

test('an editor sees the create control disabled with a reason', () => {
    const model = invitationModel({ actorRole: 'editor', invitations: [], displayLogin: 'octocat' });
    assert.equal(model.canCreate, false);
    assert.match(model.create.reason, /owner or admin/);
});

test('an admin cannot revoke an admin invitation', () => {
    const model = invitationModel({
        actorRole: 'admin', invitations: [invite({ role: 'admin' })], displayLogin: 'octocat'
    });
    assert.equal(model.invitations[0].revoke.allowed, false);
});

test('shows the one-time link only while the caller still holds it', () => {
    const held = holdAcceptanceUrl(URL_OK);
    assert.equal(invitationModel({ actorRole: 'owner', invitations: [], issued: held })
        .issuedUrl, URL_OK);
    held.clear();
    assert.equal(invitationModel({ actorRole: 'owner', invitations: [], issued: held })
        .issuedUrl, null);
});

test('renders the link into a readonly input, never an anchor', () => {
    const node = renderInvitations(doc, invitationModel({
        actorRole: 'owner', invitations: [], issued: holdAcceptanceUrl(URL_OK)
    }), 'invites');
    const field = node.querySelector('.collab-invites__url');
    assert.equal(field.tagName, 'input');
    assert.equal(field.getAttribute('readonly'), 'readonly');
    assert.equal(field.value, URL_OK);
    assert.equal(node.querySelectorAll('a').length, 0);
});

test('warns, assertively, that the link is shown once', () => {
    const node = renderInvitations(doc, invitationModel({
        actorRole: 'owner', invitations: [], issued: holdAcceptanceUrl(URL_OK)
    }), 'invites');
    const warning = node.querySelector('.collab-invites__warning');
    assert.equal(warning.getAttribute('role'), 'alert');
    assert.match(warning.textContent, /shown once and cannot be recovered/);
});

test('a denied revoke stays visible with an announced reason', () => {
    const node = renderInvitations(doc, invitationModel({
        actorRole: 'admin', invitations: [invite({ role: 'admin' })]
    }), 'invites');
    const revoke = node.querySelector('[data-collab-action="revoke-invitation"]');
    assert.equal(revoke.disabled, true);
    assert.equal(revoke.getAttribute('aria-disabled'), 'true');
    const id = revoke.getAttribute('aria-describedby');
    assert.ok(node.querySelectorAll('.collab-invites__reason').some(item => item.id === id));
});

test('scopes its ids to the rendered instance', () => {
    const model = invitationModel({ actorRole: 'admin', invitations: [invite({ role: 'admin' })] });
    const ids = panel => renderInvitations(doc, model, panel)
        .querySelectorAll('.collab-invites__reason').map(node => node.id);
    assert.equal(ids('a').some(id => ids('b').includes(id)), false);
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/invitations.js')), false);
});

// ── the calls ────────────────────────────────────────────────────────────────

test('creates an invitation and takes hold of the one-time URL', async () => {
    const api = { async createInvitation(input) {
        assert.equal(input.idempotencyKey, 'key-1');
        return { invitation: invite(), acceptanceUrl: URL_OK };
    } };
    const result = await createInvitation({ api, workspaceId: WORKSPACE,
        displayLogin: 'octocat', role: 'editor', newIdempotencyKey: () => 'key-1' });
    assert.equal(result.held.read(), URL_OK);
    assert.equal(result.invitation.invitationId, INVITE);
});

test('refuses a creation response without a usable acceptance URL', async () => {
    const api = { async createInvitation() { return { invitation: invite() }; } };
    await assert.rejects(createInvitation({ api, workspaceId: WORKSPACE,
        displayLogin: 'octocat', role: 'editor', newIdempotencyKey: () => 'key-1' }),
    error => error.code === 'INVITATION_RESPONSE_INVALID');
});

test('will not send a username the server would reject', async () => {
    const api = { async createInvitation() { throw new Error('should not be called'); } };
    await assert.rejects(createInvitation({ api, workspaceId: WORKSPACE,
        displayLogin: '-nope', role: 'editor', newIdempotencyKey: () => 'key-1' }),
    error => error.code === 'INVALID_DISPLAY_LOGIN');
});

test('revokes through the service with an idempotency key', async () => {
    const seen = [];
    const api = { async revokeInvitation(input) { seen.push(input); } };
    const result = await revokeInvitation({ api, workspaceId: WORKSPACE,
        invitationId: INVITE, newIdempotencyKey: () => 'key-2' });
    assert.equal(result.status, 'revoked');
    assert.equal(seen[0].idempotencyKey, 'key-2');
});
