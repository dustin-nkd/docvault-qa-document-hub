// CF-P7-008 — invitation acceptance.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    INVITATION_REVIEW_STATES, ACCEPT_STATUSES, InvitationAcceptError,
    takeTokenFromFragment, invitationAcceptModel, renderInvitationAccept,
    reviewInvitation, acceptInvitation
} from '../js/collaboration/invitation-accept.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const DEVICE = '44444444-4444-4444-8444-444444444444';
const INVITE = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'a'.repeat(43);

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

const signedIn = { authenticated: true, login: 'octocat' };
const activeDevice = { deviceId: DEVICE, status: 'active' };
const review = (overrides = {}) => ({
    invitationId: INVITE, workspaceDisplayName: 'Platform QA', targetDisplayLogin: 'octocat',
    role: 'editor', expiresAt: '2026-07-29T00:00:00.000Z', state: 'pending', ...overrides
});

function browser(hash) {
    const calls = [];
    return {
        calls,
        location: { hash, pathname: '/app', search: '' },
        history: { replaceState(...args) { calls.push(['replaceState', ...args]); } }
    };
}

// ── taking the token out of the address bar ──────────────────────────────────

test('reads the token from the fragment', () => {
    const fake = browser(`#/invite/${TOKEN}`);
    const taken = takeTokenFromFragment(fake);
    assert.equal(taken.token, TOKEN);
    assert.equal(taken.cleared, true);
});

test('overwrites the address bar entry that carried the token', () => {
    const fake = browser(`#/invite/${TOKEN}`);
    takeTokenFromFragment(fake);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0][0], 'replaceState');
    assert.equal(fake.calls[0][3], '/app', 'the replacement URL still carries the fragment');
});

test('clears the bar before handing the token to anyone', () => {
    const fake = browser(`#/invite/${TOKEN}`);
    const taken = takeTokenFromFragment(fake);
    // The call must already have happened by the time the caller sees the value.
    assert.equal(fake.calls.length, 1);
    assert.equal(taken.token.length, 43);
});

test('reports no token rather than throwing on an ordinary page load', () => {
    const taken = takeTokenFromFragment(browser(''));
    assert.equal(taken.token, null);
    assert.equal(taken.cleared, false);
});

test('ignores a fragment that is not an invitation', () => {
    for (const hash of ['#/settings', '#/invite/', '#/invite/short', `#/invite/${'a'.repeat(600)}`]) {
        assert.equal(takeTokenFromFragment(browser(hash)).token, null, hash);
    }
});

test('leaves the address bar alone when there is no token to hide', () => {
    const fake = browser('#/settings');
    takeTokenFromFragment(fake);
    assert.deepEqual(fake.calls, []);
});

test('never pushes a history entry', () => {
    assert.equal(/history\.pushState|pushState\(/.test(read('js/collaboration/invitation-accept.js')),
        false, 'a pushed entry would restore the token on Back');
});

test('the module never logs or stores the token', () => {
    const source = read('js/collaboration/invitation-accept.js');
    for (const forbidden of ['localStorage', 'sessionStorage', 'indexedDB', 'caches.',
        'console.', 'document.cookie', 'navigator.sendBeacon']) {
        assert.equal(source.includes(forbidden), false, `the module reaches for ${forbidden}`);
    }
});

test('requires both the location and a way to replace history', () => {
    assert.throws(() => takeTokenFromFragment({ history: { replaceState() {} } }),
        error => error instanceof InvitationAcceptError && error.code === 'LOCATION_REQUIRED');
    assert.throws(() => takeTokenFromFragment({ location: { hash: '' } }),
        error => error.code === 'HISTORY_REQUIRED');
});

// ── the review states ────────────────────────────────────────────────────────

test('carries exactly the four review states', () => {
    assert.deepEqual([...INVITATION_REVIEW_STATES].sort(),
        ['consumed', 'expired', 'pending', 'revoked']);
});

test('only a pending invitation is actionable, and the rest say why', () => {
    for (const state of INVITATION_REVIEW_STATES) {
        const model = invitationAcceptModel({
            session: signedIn, device: activeDevice, review: review({ state })
        });
        if (state === 'pending') {
            assert.equal(model.canAccept, true);
            continue;
        }
        assert.equal(model.canAccept, false, state);
        assert.ok(model.blocked.length > 20, `${state} does not explain itself`);
    }
});

test('an expired invitation names the 72-hour window', () => {
    const model = invitationAcceptModel({
        session: signedIn, device: activeDevice, review: review({ state: 'expired' })
    });
    assert.match(model.blocked, /72 hours/);
});

test('a consumed invitation tells the user what to do if it was not them', () => {
    const model = invitationAcceptModel({
        session: signedIn, device: activeDevice, review: review({ state: 'consumed' })
    });
    assert.match(model.blocked, /tell the workspace owner/);
});

// ── preconditions ────────────────────────────────────────────────────────────

test('a mismatched identity is named rather than failing on submit', () => {
    const model = invitationAcceptModel({
        session: { authenticated: true, login: 'someone-else' }, device: activeDevice,
        review: review({ identityMatch: false })
    });
    assert.equal(model.identityMismatch, true);
    assert.equal(model.canAccept, false);
    assert.match(model.blocked, /sent to octocat/);
});

test('acceptance needs a device, and says why', () => {
    const model = invitationAcceptModel({
        session: signedIn, device: null, review: review()
    });
    assert.equal(model.canAccept, false);
    assert.match(model.blocked, /Set up this device/);
});

test('an unknown session waits rather than guessing signed out', () => {
    const model = invitationAcceptModel({ session: { authenticated: null }, review: review() });
    assert.match(model.blocked, /Checking your session/);
});

test('a signed-out visitor is asked to sign in', () => {
    const model = invitationAcceptModel({ session: { authenticated: false }, review: review() });
    assert.match(model.blocked, /Sign in with GitHub/);
});

test('refuses to accept while a call is in flight', () => {
    for (const status of ['reviewing', 'accepting']) {
        const model = invitationAcceptModel({
            session: signedIn, device: activeDevice, review: review(), status
        });
        assert.equal(model.canAccept, false, status);
    }
});

test('rejects a status or invitation state outside the closed sets', () => {
    assert.throws(() => invitationAcceptModel({ session: signedIn, status: 'almost' }),
        error => error.code === 'INVALID_STATUS');
    assert.throws(() => invitationAcceptModel({
        session: signedIn, review: review({ state: 'maybe' })
    }), error => error.code === 'INVALID_INVITATION_STATE');
});

test('exposes the closed status vocabulary', () => {
    assert.equal(ACCEPT_STATUSES.length, 6);
});

// ── the rendered surface ─────────────────────────────────────────────────────

test('says what acceptance actually gets you, before it is chosen', () => {
    const node = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn, device: activeDevice, review: review()
    }), 'accept');
    const after = node.querySelector('.collab-accept__after');
    assert.equal(after.getAttribute('data-readiness'), 'pending_key');
    assert.match(after.textContent, /not yet able to open its documents/);
});

test('a blocked accept stays visible with an announced reason', () => {
    const node = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn, device: null, review: review()
    }), 'accept');
    const accept = node.querySelector('[data-collab-action="accept-invitation"]');
    assert.equal(accept.disabled, true);
    assert.equal(accept.getAttribute('aria-disabled'), 'true');
    const id = accept.getAttribute('aria-describedby');
    assert.equal(node.querySelector('.collab-accept__reason').id, id);
});

test('an in-flight acceptance is visibly disabled and named', () => {
    const node = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn,
        device: activeDevice,
        review: review(),
        status: 'accepting'
    }), 'accept');
    const accept = node.querySelector('[data-collab-action="accept-invitation"]');
    assert.equal(accept.disabled, true);
    assert.equal(accept.textContent, 'Accepting…');
});

test('offers the device journey only when the device is what is missing', () => {
    const missingDevice = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn, device: null, review: review()
    }), 'accept');
    assert.notEqual(missingDevice.querySelector('[data-collab-action="device-setup-open"]'), null);

    const wrongIdentity = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn, device: activeDevice, review: review({ identityMatch: false })
    }), 'accept');
    assert.equal(wrongIdentity.querySelector('[data-collab-action="device-setup-open"]'), null);
});

test('exposes the invitation state as data, not colour', () => {
    const node = renderInvitationAccept(doc, invitationAcceptModel({
        session: signedIn, device: activeDevice, review: review({ state: 'revoked' })
    }), 'accept');
    assert.equal(node.querySelector('[data-invitation-state]')
        .getAttribute('data-invitation-state'), 'revoked');
});

test('scopes its ids to the rendered instance', () => {
    const model = invitationAcceptModel({ session: signedIn, device: null, review: review() });
    const id = panel => renderInvitationAccept(doc, model, panel)
        .querySelector('.collab-accept__reason').id;
    assert.notEqual(id('a'), id('b'));
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/invitation-accept.js')), false);
});

// ── the calls ────────────────────────────────────────────────────────────────

test('reviews by sending the token in the body', async () => {
    const seen = [];
    const api = { async bootstrapInvitation(input) { seen.push(input); return review(); } };
    const result = await reviewInvitation({ api, token: TOKEN });
    assert.deepEqual(seen, [{ token: TOKEN }]);
    assert.equal(result.state, 'pending');
});

test('refuses a review response with a state it does not know', async () => {
    const api = { async bootstrapInvitation() { return { state: 'maybe' }; } };
    await assert.rejects(reviewInvitation({ api, token: TOKEN }),
        error => error.code === 'INVITATION_RESPONSE_INVALID');
});

test('accepts with the device the membership will bind to', async () => {
    const seen = [];
    const api = { async acceptInvitation(input) { seen.push(input);
        return { membership: { userId: INVITE, role: 'editor', state: 'pending_key' } }; } };
    const result = await acceptInvitation({ api, token: TOKEN, deviceId: DEVICE,
        newIdempotencyKey: () => 'key-1' });
    assert.equal(seen[0].deviceId, DEVICE);
    assert.equal(seen[0].idempotencyKey, 'key-1');
    assert.equal(result.membership.state, 'pending_key');
});

test('refuses a membership that claims more than pending_key', async () => {
    const api = { async acceptInvitation() {
        return { membership: { state: 'active' } }; } };
    await assert.rejects(acceptInvitation({ api, token: TOKEN, deviceId: DEVICE,
        newIdempotencyKey: () => 'key-1' }),
    error => error.code === 'MEMBERSHIP_NOT_PENDING_KEY');
});

test('will not accept without a device', async () => {
    const api = { async acceptInvitation() { throw new Error('should not be called'); } };
    await assert.rejects(acceptInvitation({ api, token: TOKEN, deviceId: 'nope',
        newIdempotencyKey: () => 'key-1' }), error => error.code === 'INVALID_DEVICE');
});
