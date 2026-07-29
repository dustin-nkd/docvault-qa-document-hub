// Member list, role badge, and explained role-disabled controls
// (CF-P7-006, surface 5). This is where gate UX U3 is actually decided.
//
// U3: a control the current role may not use stays visible, is programmatically
// disabled rather than merely styled, and states the reason in text assistive
// technology announces. Hiding is the easier implementation and the wrong one —
// it makes the product feel broken rather than governed, and it denies the user
// the one fact that would resolve their confusion: the action exists, and their
// role is why they cannot take it.
//
// Every decision here is read off the frozen matrix in `domain-and-rbac.md`.
// Nothing is invented, and nothing is enforced here: the server's SQL guards
// remain the authority. This layer exists so a control is never enabled into a
// refusal, which the contract forbids separately.

import { KEY_READINESS, presentReadiness } from './device-initialization.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
export const MEMBER_STATES = Object.freeze(['pending_key', 'active', 'removed']);

/** The member-management actions this surface offers. */
export const MEMBER_ACTIONS = Object.freeze([
    'change-role',        // Editor <-> Viewer
    'grant-admin',        // grant or revoke Admin
    'transfer-ownership',
    'remove-member',
    'revoke-device',      // another member's device
    'provision-key'       // an envelope for another member's device
]);

export const MEMBER_DEVICE_REVOCATION_DEFERRED_REASON =
    'Choose a specific member device before revoking it. Device selection is not available yet.';

export class MemberListError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'MemberListError';
        this.code = code;
    }
}

const fail = code => { throw new MemberListError(code); };
const allow = () => Object.freeze({ allowed: true, reason: null });
const deny = reason => Object.freeze({ allowed: false, reason });

/**
 * The frozen matrix, one predicate per action.
 *
 * Each returns the *reason* a person cannot act, never a bare false, because a
 * disabled control with no reason is the failure U3 exists to prevent.
 */
const DECISIONS = Object.freeze({
    'change-role'({ actorRole, targetRole, isSelf }) {
        if (actorRole !== 'owner' && actorRole !== 'admin') {
            return deny('Only an owner or admin can change a member\'s role.');
        }
        if (isSelf) return deny('You cannot change your own role.');
        if (targetRole === 'owner') return deny('An owner\'s role is changed by transferring ownership.');
        if (targetRole === 'admin') return deny('Only an owner can change an admin\'s role.');
        return allow();
    },
    'grant-admin'({ actorRole, isSelf }) {
        if (actorRole !== 'owner') return deny('Only an owner can grant or revoke admin.');
        if (isSelf) return deny('You cannot change your own role.');
        return allow();
    },
    'transfer-ownership'({ actorRole, targetRole, targetState, isSelf }) {
        if (actorRole !== 'owner') return deny('Only an owner can transfer ownership.');
        if (isSelf) return deny('You already own this workspace.');
        if (targetState !== 'active') return deny('Ownership can only be transferred to an active member.');
        if (targetRole === 'owner') return deny('This member already owns the workspace.');
        return allow();
    },
    'remove-member'({ actorRole, targetRole, isSelf }) {
        // The matrix denies removing an Owner to everyone, including an Owner.
        if (targetRole === 'owner') {
            return deny('An owner cannot be removed. Transfer ownership first.');
        }
        if (actorRole !== 'owner' && actorRole !== 'admin') {
            return deny('Only an owner or admin can remove a member.');
        }
        if (isSelf) return deny('You cannot remove yourself.');
        if (targetRole === 'admin' && actorRole !== 'owner') {
            return deny('Only an owner can remove an admin.');
        }
        return allow();
    },
    'revoke-device'({ actorRole, targetRole, isSelf }) {
        if (isSelf) return deny('Revoke your own device from the device section.');
        if (actorRole === 'owner') return allow();
        if (actorRole !== 'admin') return deny('Only an owner or admin can revoke a member\'s device.');
        if (targetRole === 'owner' || targetRole === 'admin') {
            return deny('An admin can revoke devices belonging to editors and viewers only.');
        }
        return allow();
    },
    'provision-key'({ actorRole, actorKeyReady, targetState, targetReadiness }) {
        if (actorRole !== 'owner' && actorRole !== 'admin') {
            return deny('Only an owner or admin can provision the workspace key.');
        }
        // Not a role rule: you cannot hand over a key you do not hold.
        if (actorKeyReady !== true) {
            return deny('Your own device is still waiting for the workspace key, so it cannot '
                + 'provision one for someone else.');
        }
        if (targetState === 'removed') return deny('This member is no longer in the workspace.');
        if (targetReadiness === 'key_ready') return deny('This member already has the workspace key.');
        if (targetReadiness === 'revoked') return deny('This member\'s device was revoked.');
        return allow();
    }
});

/**
 * Decide one action against one member.
 *
 * @param {{action: string, actorRole: string, actorKeyReady?: boolean,
 *          targetRole: string, targetState: string, targetReadiness?: string,
 *          isSelf?: boolean}} input
 */
export function memberActionDecision(input = {}) {
    if (!MEMBER_ACTIONS.includes(input.action)) fail('UNKNOWN_ACTION');
    if (!ROLES.includes(input.actorRole)) fail('INVALID_ROLE');
    if (!ROLES.includes(input.targetRole)) fail('INVALID_ROLE');
    if (!MEMBER_STATES.includes(input.targetState)) fail('INVALID_MEMBER_STATE');
    if (input.targetReadiness !== undefined && input.targetReadiness !== null
        && !KEY_READINESS.includes(input.targetReadiness)) fail('UNKNOWN_READINESS');
    const decision = DECISIONS[input.action]({
        actorRole: input.actorRole,
        actorKeyReady: input.actorKeyReady === true,
        targetRole: input.targetRole,
        targetState: input.targetState,
        targetReadiness: input.targetReadiness ?? null,
        isSelf: input.isSelf === true
    });
    // A denial that cannot say why is the exact failure U3 exists to prevent.
    if (!decision.allowed && (typeof decision.reason !== 'string' || decision.reason.length < 10)) {
        fail('DENIAL_WITHOUT_REASON');
    }
    return decision;
}

/**
 * Describe the member list.
 *
 * @param {{actor: {userId: string, role: string, keyReady?: boolean},
 *          members: ReadonlyArray<object>, state?: string}} input
 */
export function memberListModel({ actor, members, state = 'ready' } = {}) {
    if (!actor || !ROLES.includes(actor.role)) fail('INVALID_ROLE');
    if (!UUID_V4.test(actor.userId ?? '')) fail('INVALID_ACTOR');
    if (!Array.isArray(members)) fail('MEMBERS_REQUIRED');

    const rows = members.map(member => {
        if (!UUID_V4.test(member?.userId ?? '')) fail('INVALID_MEMBER');
        if (!ROLES.includes(member.role)) fail('INVALID_ROLE');
        if (!MEMBER_STATES.includes(member.state)) fail('INVALID_MEMBER_STATE');
        if (!KEY_READINESS.includes(member.keyReadiness)) fail('UNKNOWN_READINESS');
        const isSelf = member.userId === actor.userId;
        return Object.freeze({
            userId: member.userId,
            displayLogin: member.displayLogin,
            role: member.role,
            state: member.state,
            isSelf,
            // The same vocabulary CF-P7-005 renders, not a second one.
            readiness: presentReadiness(member.keyReadiness),
            actions: Object.freeze(MEMBER_ACTIONS.map(action => Object.freeze({
                action,
                ...memberActionDecision({
                    action,
                    actorRole: actor.role,
                    actorKeyReady: actor.keyReady === true,
                    targetRole: member.role,
                    targetState: member.state,
                    targetReadiness: member.keyReadiness,
                    isSelf
                })
            })))
        });
    });

    return Object.freeze({
        state,
        actorRole: actor.role,
        // Empty is a state of its own; a workspace always has at least its owner,
        // so an empty list means the read failed to return rather than "no one".
        isEmpty: rows.length === 0,
        members: Object.freeze(rows),
        waitingCount: rows.filter(row => row.readiness.waiting).length
    });
}

/**
 * Build the nodes.
 *
 * `instanceId` scopes the ids that `aria-describedby` points at. It is required
 * rather than defaulted because a default would silently collide: two member
 * lists on one page would emit the same ids, and a screen reader would announce
 * one control's reason for another. That is worse than no reason at all, since
 * it is confidently wrong, and it was found this way in a browser rather than
 * in a test.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof memberListModel>} model
 * @param {string} instanceId
 */
export function renderMemberList(doc, model, instanceId) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !Array.isArray(model.members)) fail('MODEL_REQUIRED');
    if (typeof instanceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(instanceId)) {
        fail('INSTANCE_ID_REQUIRED');
    }

    const root = doc.createElement('section');
    root.className = 'collab-members';
    root.setAttribute('data-collab-surface', 'member-list-role-badge');
    root.setAttribute('data-collab-action', 'list-members');

    const heading = doc.createElement('h2');
    heading.className = 'collab-members__heading';
    heading.textContent = 'Members';
    root.appendChild(heading);

    const list = doc.createElement('ul');
    list.className = 'collab-members__list';
    for (const member of model.members) {
        const row = doc.createElement('li');
        row.className = 'collab-members__row';
        row.setAttribute('data-user-id', member.userId);
        row.setAttribute('data-member-state', member.state);

        const name = doc.createElement('span');
        name.className = 'collab-members__name';
        name.textContent = member.isSelf
            ? `${member.displayLogin} (you)`
            : member.displayLogin;
        row.appendChild(name);

        const badge = doc.createElement('span');
        badge.className = `collab-role-badge collab-role-badge--${member.role}`;
        badge.setAttribute('data-collab-action', 'show-role-badge');
        badge.textContent = member.role;
        row.appendChild(badge);

        const readiness = doc.createElement('span');
        readiness.className = `collab-members__readiness collab-members__readiness--${member.readiness.readiness}`;
        readiness.setAttribute('data-collab-action', 'show-key-readiness');
        readiness.setAttribute('data-readiness', member.readiness.readiness);
        const shape = doc.createElement('span');
        shape.className = `collab-device__shape collab-device__shape--${member.readiness.readiness}`;
        shape.setAttribute('aria-hidden', 'true');
        readiness.appendChild(shape);
        const readinessText = doc.createElement('span');
        readinessText.className = 'collab-members__readiness-text';
        readinessText.textContent = member.readiness.title;
        readiness.appendChild(readinessText);
        row.appendChild(readiness);

        const actions = doc.createElement('div');
        actions.className = 'collab-members__actions';
        for (const decision of member.actions) {
            const memberDeviceRevocation = decision.action === 'revoke-device';
            const surfaceAction = memberDeviceRevocation
                ? 'revoke-member-device'
                : decision.action;
            // The frozen RBAC decision still says who may revoke a remote
            // device. Delivery is a separate fact: until CF-P7R-006 provides a
            // concrete device inventory and target id, no member row may emit
            // an actionable revoke. This keeps authorization semantics intact
            // without pretending a safe target journey already exists.
            const delivered = !memberDeviceRevocation;
            const allowed = decision.allowed && delivered;
            const reasonText = decision.allowed && !delivered
                ? MEMBER_DEVICE_REVOCATION_DEFERRED_REASON
                : decision.reason;
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = `collab-members__action collab-members__action--${decision.action}`;
            button.setAttribute('data-collab-action', surfaceAction);
            button.setAttribute('data-user-id', member.userId);
            button.textContent = ACTION_LABELS[decision.action];
            if (!allowed) {
                // Programmatically disabled, not merely styled, and the reason
                // travels as text rather than as a colour or a tooltip alone.
                button.disabled = true;
                button.setAttribute('aria-disabled', 'true');
                const reasonId = `${instanceId}-reason-${surfaceAction}-${member.userId}`;
                button.setAttribute('aria-describedby', reasonId);
                button.setAttribute('title', reasonText);
                const reason = doc.createElement('span');
                reason.className = 'collab-members__reason';
                reason.id = reasonId;
                reason.textContent = reasonText;
                actions.appendChild(button);
                actions.appendChild(reason);
                continue;
            }
            actions.appendChild(button);
        }
        row.appendChild(actions);
        list.appendChild(row);
    }
    root.appendChild(list);
    return root;
}

const ACTION_LABELS = Object.freeze({
    'change-role': 'Change role',
    'grant-admin': 'Make admin',
    'transfer-ownership': 'Transfer ownership',
    'remove-member': 'Remove',
    'revoke-device': 'Revoke device',
    'provision-key': 'Give workspace key'
});

/**
 * Read the member list through the existing service.
 *
 * @param {{api: object, workspaceId: string, cursor?: string}} input
 */
export async function readMembers({ api, workspaceId, cursor } = {}) {
    if (!api || typeof api.listMembers !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
    const page = await api.listMembers({ workspaceId, cursor });
    if (!page || !Array.isArray(page.items)) fail('MEMBER_PAGE_INVALID');
    // The cursor is opaque and HMAC-bound by CF-P6-005; it is carried, never built.
    return Object.freeze({ items: page.items, nextCursor: page.nextCursor ?? null });
}
