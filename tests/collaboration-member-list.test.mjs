// CF-P7-006 — member list, role badge, and explained role-disabled controls.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    ROLES, MEMBER_STATES, MEMBER_ACTIONS, MemberListError,
    memberActionDecision, memberListModel, renderMemberList, readMembers
} from '../js/collaboration/member-list.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';

// ── minimal DOM ──────────────────────────────────────────────────────────────

function element(tagName) {
    const node = {
        tagName, children: [], attributes: new Map(), className: '', textContent: '',
        type: '', id: '', hidden: false, disabled: false,
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

const decide = (action, actorRole, targetRole, extra = {}) => memberActionDecision({
    action, actorRole, targetRole, targetState: 'active', targetReadiness: 'key_ready',
    actorKeyReady: true, ...extra
});

const member = (userId, role, overrides = {}) => ({
    userId, role, state: 'active', keyReadiness: 'key_ready',
    displayLogin: `user-${role}`, ...overrides
});

// ── the frozen matrix: removal ───────────────────────────────────────────────

test('an owner cannot be removed by anyone, including an owner', () => {
    for (const actorRole of ROLES) {
        const decision = decide('remove-member', actorRole, 'owner');
        assert.equal(decision.allowed, false, actorRole);
        assert.match(decision.reason, /Transfer ownership first/);
    }
});

test('an owner may remove an admin, an editor, and a viewer', () => {
    for (const targetRole of ['admin', 'editor', 'viewer']) {
        assert.equal(decide('remove-member', 'owner', targetRole).allowed, true, targetRole);
    }
});

test('an admin may remove editors and viewers but not another admin', () => {
    assert.equal(decide('remove-member', 'admin', 'editor').allowed, true);
    assert.equal(decide('remove-member', 'admin', 'viewer').allowed, true);
    const admin = decide('remove-member', 'admin', 'admin');
    assert.equal(admin.allowed, false);
    assert.match(admin.reason, /Only an owner can remove an admin/);
});

test('editors and viewers may remove nobody', () => {
    for (const actorRole of ['editor', 'viewer']) {
        for (const targetRole of ['admin', 'editor', 'viewer']) {
            const decision = decide('remove-member', actorRole, targetRole);
            assert.equal(decision.allowed, false, `${actorRole} -> ${targetRole}`);
            assert.match(decision.reason, /owner or admin/);
        }
    }
});

test('nobody removes themselves from this surface', () => {
    assert.match(decide('remove-member', 'admin', 'admin', { isSelf: true }).reason,
        /cannot remove yourself/);
});

// ── the frozen matrix: roles ─────────────────────────────────────────────────

test('only an owner grants or revokes admin', () => {
    assert.equal(decide('grant-admin', 'owner', 'editor').allowed, true);
    for (const actorRole of ['admin', 'editor', 'viewer']) {
        assert.match(decide('grant-admin', actorRole, 'editor').reason, /Only an owner/);
    }
});

test('an admin may change an editor or viewer but not another admin', () => {
    assert.equal(decide('change-role', 'admin', 'editor').allowed, true);
    assert.equal(decide('change-role', 'admin', 'viewer').allowed, true);
    assert.match(decide('change-role', 'admin', 'admin').reason, /Only an owner/);
});

test('an owner is re-roled by transferring ownership, not by changing a role', () => {
    assert.match(decide('change-role', 'owner', 'owner').reason, /transferring ownership/);
});

test('only an owner transfers ownership, and only to an active member', () => {
    assert.equal(decide('transfer-ownership', 'owner', 'admin').allowed, true);
    assert.match(decide('transfer-ownership', 'admin', 'editor').reason, /Only an owner/);
    assert.match(
        decide('transfer-ownership', 'owner', 'editor', { targetState: 'pending_key' }).reason,
        /active member/);
});

test('nobody changes their own role', () => {
    assert.match(decide('change-role', 'admin', 'admin', { isSelf: true }).reason, /your own role/);
    assert.match(decide('grant-admin', 'owner', 'owner', { isSelf: true }).reason, /your own role/);
});

// ── the frozen matrix: devices and keys ──────────────────────────────────────

test('an admin revokes devices of editors and viewers only', () => {
    assert.equal(decide('revoke-device', 'admin', 'editor').allowed, true);
    assert.match(decide('revoke-device', 'admin', 'admin').reason, /editors and viewers only/);
    assert.match(decide('revoke-device', 'admin', 'owner').reason, /editors and viewers only/);
    assert.equal(decide('revoke-device', 'owner', 'admin').allowed, true);
});

test('your own device is revoked from the device section, not here', () => {
    assert.match(decide('revoke-device', 'owner', 'owner', { isSelf: true }).reason,
        /device section/);
});

test('provisioning needs an owner or admin whose own device already holds the key', () => {
    assert.equal(decide('provision-key', 'owner', 'editor',
        { targetReadiness: 'pending_key' }).allowed, true);
    const notReady = decide('provision-key', 'owner', 'editor',
        { targetReadiness: 'pending_key', actorKeyReady: false });
    assert.equal(notReady.allowed, false);
    assert.match(notReady.reason, /your own device is still waiting/i);
});

test('provisioning is refused where it would do nothing', () => {
    assert.match(decide('provision-key', 'owner', 'editor',
        { targetReadiness: 'key_ready' }).reason, /already has the workspace key/);
    assert.match(decide('provision-key', 'owner', 'editor',
        { targetReadiness: 'revoked' }).reason, /device was revoked/);
    assert.match(decide('provision-key', 'owner', 'editor',
        { targetState: 'removed', targetReadiness: 'pending_key' }).reason, /no longer in the workspace/);
});

test('editors and viewers cannot provision the workspace key', () => {
    for (const actorRole of ['editor', 'viewer']) {
        assert.match(decide('provision-key', actorRole, 'editor',
            { targetReadiness: 'pending_key' }).reason, /owner or admin/);
    }
});

// ── U3 itself ────────────────────────────────────────────────────────────────

test('every denial across the whole matrix states a reason', () => {
    let denials = 0;
    for (const action of MEMBER_ACTIONS) {
        for (const actorRole of ROLES) {
            for (const targetRole of ROLES) {
                for (const targetState of MEMBER_STATES) {
                    for (const isSelf of [true, false]) {
                        const decision = memberActionDecision({
                            action, actorRole, targetRole, targetState,
                            targetReadiness: 'pending_key', actorKeyReady: true, isSelf
                        });
                        if (decision.allowed) continue;
                        denials += 1;
                        assert.ok(decision.reason.length >= 10,
                            `${action}/${actorRole}/${targetRole} has no usable reason`);
                        assert.ok(/[.!]$/.test(decision.reason),
                            `${action}/${actorRole}/${targetRole} reason is not a sentence`);
                    }
                }
            }
        }
    }
    assert.ok(denials > 100, `expected a broad denial surface, saw ${denials}`);
});

test('rejects an action outside the frozen set', () => {
    assert.throws(() => memberActionDecision({
        action: 'promote-to-god', actorRole: 'owner', targetRole: 'editor', targetState: 'active'
    }), error => error instanceof MemberListError && error.code === 'UNKNOWN_ACTION');
});

test('rejects a readiness value outside the inherited vocabulary', () => {
    assert.throws(() => memberActionDecision({
        action: 'provision-key', actorRole: 'owner', targetRole: 'editor',
        targetState: 'active', targetReadiness: 'rotating'
    }), error => error.code === 'UNKNOWN_READINESS');
});

// ── the model ────────────────────────────────────────────────────────────────

test('marks the caller among the members', () => {
    const model = memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [member(ACTOR, 'owner'), member(OTHER, 'editor')]
    });
    assert.equal(model.members[0].isSelf, true);
    assert.equal(model.members[1].isSelf, false);
});

test('counts members still waiting for the workspace key', () => {
    const model = memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [
            member(ACTOR, 'owner'),
            member(OTHER, 'editor', { keyReadiness: 'pending_key', state: 'pending_key' }),
            member(THIRD, 'viewer', { keyReadiness: 'stale_key' })
        ]
    });
    assert.equal(model.waitingCount, 2);
});

test('decides every action for every member', () => {
    const model = memberListModel({
        actor: { userId: ACTOR, role: 'admin', keyReady: true },
        members: [member(OTHER, 'editor')]
    });
    assert.equal(model.members[0].actions.length, MEMBER_ACTIONS.length);
});

test('rejects a member carrying a role or state outside the contract', () => {
    assert.throws(() => memberListModel({
        actor: { userId: ACTOR, role: 'owner' },
        members: [member(OTHER, 'superuser')]
    }), error => error.code === 'INVALID_ROLE');
    assert.throws(() => memberListModel({
        actor: { userId: ACTOR, role: 'owner' },
        members: [member(OTHER, 'editor', { state: 'banned' })]
    }), error => error.code === 'INVALID_MEMBER_STATE');
});

// ── the rendered surface ─────────────────────────────────────────────────────

test('a control the role may not use stays visible and disabled', () => {
    const node = renderMemberList(doc, memberListModel({
        actor: { userId: ACTOR, role: 'viewer', keyReady: false },
        members: [member(OTHER, 'editor')]
    }), 'list-a');
    const remove = node.querySelector('[data-collab-action="remove-member"]');
    assert.notEqual(remove, null, 'the control was hidden instead of explained');
    assert.equal(remove.disabled, true, 'the control is only styled, not disabled');
    assert.equal(remove.getAttribute('aria-disabled'), 'true');
});

test('the reason is announced text, not only a tooltip', () => {
    const node = renderMemberList(doc, memberListModel({
        actor: { userId: ACTOR, role: 'viewer', keyReady: false },
        members: [member(OTHER, 'editor')]
    }), 'list-a');
    const remove = node.querySelector('[data-collab-action="remove-member"]');
    const describedBy = remove.getAttribute('aria-describedby');
    assert.ok(describedBy, 'no aria-describedby, so the reason is not announced');
    const reason = node.querySelectorAll('.collab-members__reason')
        .find(item => item.id === describedBy);
    assert.notEqual(reason, undefined, 'aria-describedby points at nothing');
    assert.ok(reason.textContent.length >= 10);
    assert.equal(reason.textContent, remove.getAttribute('title'));
});

test('an allowed control carries no disabled state and no reason', () => {
    const node = renderMemberList(doc, memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [member(OTHER, 'editor')]
    }), 'list-a');
    const remove = node.querySelector('[data-collab-action="remove-member"]');
    assert.equal(remove.disabled, false);
    assert.equal(remove.getAttribute('aria-disabled'), null);
});

test('renders a role badge and a key readiness for every member', () => {
    const node = renderMemberList(doc, memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [member(ACTOR, 'owner'), member(OTHER, 'viewer', { keyReadiness: 'pending_key' })]
    }), 'list-a');
    assert.equal(node.querySelectorAll('[data-collab-action="show-role-badge"]').length, 2);
    assert.equal(node.querySelectorAll('[data-collab-action="show-key-readiness"]').length, 2);
    assert.equal(node.querySelector('[data-readiness]').getAttribute('data-readiness'), 'key_ready');
});

test('names the caller in their own row', () => {
    const node = renderMemberList(doc, memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [member(ACTOR, 'owner')]
    }), 'list-a');
    assert.match(node.querySelector('.collab-members__name').textContent, /\(you\)$/);
});

test('builds every node through the document, never through innerHTML', () => {
    assert.equal(/\.innerHTML/.test(read('js/collaboration/member-list.js')), false);
});

// ── reading through the service ──────────────────────────────────────────────

test('carries the opaque cursor rather than constructing one', async () => {
    const seen = [];
    const api = { async listMembers(input) { seen.push(input);
        return { items: [], nextCursor: 'opaque-2' }; } };
    const page = await readMembers({ api, workspaceId: WORKSPACE, cursor: 'opaque-1' });
    assert.equal(seen[0].cursor, 'opaque-1');
    assert.equal(page.nextCursor, 'opaque-2');
});

test('refuses a member page that is not one', async () => {
    const api = { async listMembers() { return { items: 'nope' }; } };
    await assert.rejects(readMembers({ api, workspaceId: WORKSPACE }),
        error => error.code === 'MEMBER_PAGE_INVALID');
});

test('two lists on one page never share a reason id', () => {
    const model = memberListModel({
        actor: { userId: ACTOR, role: 'viewer', keyReady: false },
        members: [member(OTHER, 'editor')]
    });
    const ids = panel => renderMemberList(doc, model, panel)
        .querySelectorAll('.collab-members__reason').map(node => node.id);
    const first = ids('list-a');
    const second = ids('list-b');
    assert.ok(first.length > 0);
    assert.equal(first.some(id => second.includes(id)), false,
        'a screen reader would announce one list\'s reason for the other\'s control');
});

test('refuses to render without an instance id to scope its ids', () => {
    const model = memberListModel({
        actor: { userId: ACTOR, role: 'owner', keyReady: true },
        members: [member(OTHER, 'editor')]
    });
    assert.throws(() => renderMemberList(doc, model),
        error => error.code === 'INSTANCE_ID_REQUIRED');
});
