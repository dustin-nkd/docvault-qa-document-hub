// Invitation acceptance (CF-P7-008, surface 7).
//
// The receiving half of CF-P7-007. It handles the same secret, but under an
// extra constraint: the token arrives in the address bar, so this module is the
// one place where the value is briefly somewhere the user can see, a browser can
// remember, and an extension can read.
//
// The API contract is explicit about what the official client does: extract the
// fragment without logging, analytics, referrer, history persistence, or Cache
// Storage, remove it from the address bar using history *replacement*, and send
// the token in a POST body.
//
// Replacement, not a push. `pushState` would leave the token sitting in the back
// stack, where Back would restore it into the address bar long after the
// invitation was accepted. `replaceState` overwrites the entry that carried it.
//
// Acceptance also cannot stand alone: `InvitationAcceptRequest` carries a device
// id, and success creates a `pending_key` membership that conveys no usable key.
// Both facts are surfaced rather than hidden, because a user who accepts and
// then cannot open anything will otherwise believe the product is broken.

import { presentReadiness } from './device-initialization.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const INVITE_FRAGMENT = /^#\/invite\/([A-Za-z0-9_-]{16,512})$/;

/** The states the bootstrap response can report. */
export const INVITATION_REVIEW_STATES = Object.freeze([
    'pending', 'expired', 'revoked', 'consumed'
]);

export const ACCEPT_STATUSES = Object.freeze([
    'idle', 'reviewing', 'reviewed', 'accepting', 'accepted', 'failed'
]);

export class InvitationAcceptError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'InvitationAcceptError';
        this.code = code;
    }
}

const fail = code => { throw new InvitationAcceptError(code); };

const STATE_PRESENTATION = Object.freeze({
    pending: {
        actionable: true,
        title: 'You have been invited',
        reason: null
    },
    expired: {
        actionable: false,
        title: 'This invitation expired',
        reason: 'Invitations last 72 hours. Ask whoever invited you to send a new one.'
    },
    revoked: {
        actionable: false,
        title: 'This invitation was revoked',
        reason: 'Whoever invited you cancelled it. Ask them to send a new one.'
    },
    consumed: {
        actionable: false,
        title: 'This invitation was already used',
        reason: 'It can only be accepted once. If that was not you, tell the workspace owner.'
    }
});

/**
 * Take the token out of the address bar and put it beyond the browser's reach.
 *
 * Two things happen together and must not be separated: the value is read, and
 * the entry that carried it is overwritten. Returning the token without clearing
 * the bar would leave it visible and restorable; clearing without returning it
 * would lose the invitation.
 *
 * `history.replaceState` and never `pushState`: a push leaves the token in the
 * back stack, where Back would restore it into the address bar long after the
 * invitation was accepted.
 *
 * @param {{location: {hash: string, pathname: string, search: string},
 *          history: {replaceState: Function}}} input
 */
export function takeTokenFromFragment({ location, history } = {}) {
    if (!location || typeof location.hash !== 'string') fail('LOCATION_REQUIRED');
    if (!history || typeof history.replaceState !== 'function') fail('HISTORY_REQUIRED');
    const matched = INVITE_FRAGMENT.exec(location.hash);
    if (matched === null) return Object.freeze({ token: null, cleared: false });
    // The address bar is cleared before the token is handed to anyone, so no
    // caller can fail in a way that leaves it on screen.
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return Object.freeze({ token: matched[1], cleared: true });
}

/**
 * Describe the invitation being reviewed.
 *
 * @param {{session: {authenticated: boolean|null, login?: string},
 *          device: {deviceId: string, status: string}|null,
 *          review: object|null, status?: string, failure?: object|null}} input
 */
export function invitationAcceptModel({ session, device = null, review = null,
    status = 'idle', failure = null } = {}) {
    if (!session || typeof session !== 'object') fail('SESSION_REQUIRED');
    if (!ACCEPT_STATUSES.includes(status)) fail('INVALID_STATUS');
    if (device !== null && !UUID_V4.test(device.deviceId ?? '')) fail('INVALID_DEVICE');
    if (review !== null && !INVITATION_REVIEW_STATES.includes(review.state)) {
        fail('INVALID_INVITATION_STATE');
    }

    const authenticated = session.authenticated === true;
    const deviceReady = Boolean(device) && device.status === 'active';
    const inFlight = status === 'reviewing' || status === 'accepting';
    const presentation = review === null ? null : STATE_PRESENTATION[review.state];
    // The server refuses a mismatched subject; saying so here keeps the control
    // from being enabled into that refusal.
    const identityMismatch = review !== null && review.identityMatch === false;

    let blocked = null;
    if (session.authenticated !== true && session.authenticated !== false) {
        blocked = 'Checking your session.';
    } else if (!authenticated) {
        blocked = 'Sign in with GitHub to review this invitation.';
    } else if (identityMismatch) {
        blocked = `This invitation was sent to ${review.targetDisplayLogin}. `
            + 'Sign in as that account to accept it.';
    } else if (review !== null && !presentation.actionable) {
        blocked = presentation.reason;
    } else if (!deviceReady) {
        blocked = 'Set up this device first. Joining a workspace binds your membership to a '
            + 'device that can hold its key.';
    }

    return Object.freeze({
        status,
        authenticated,
        deviceReady,
        review: review === null ? null : Object.freeze({
            invitationId: review.invitationId,
            workspaceDisplayName: review.workspaceDisplayName,
            targetDisplayLogin: review.targetDisplayLogin,
            role: review.role,
            expiresAt: review.expiresAt,
            state: review.state,
            title: presentation.title,
            reason: presentation.reason,
            actionable: presentation.actionable
        }),
        identityMismatch,
        blocked,
        canAccept: blocked === null && review !== null && presentation.actionable && !inFlight
            && status !== 'accepted',
        inFlight,
        // Accepting does not grant a key. Saying so up front is the difference
        // between a product that looks broken and one that looks governed.
        pendingKeyAfterAccept: presentReadiness('pending_key'),
        failure: failure === null ? null : Object.freeze({ ...failure })
    });
}

/**
 * Build the nodes.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof invitationAcceptModel>} model
 * @param {string} instanceId
 */
export function renderInvitationAccept(doc, model, instanceId) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !ACCEPT_STATUSES.includes(model.status)) fail('MODEL_REQUIRED');
    if (typeof instanceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(instanceId)) {
        fail('INSTANCE_ID_REQUIRED');
    }

    const root = doc.createElement('section');
    root.className = `collab-accept collab-accept--${model.status}`;
    root.setAttribute('data-collab-surface', 'invitation-accept');
    root.setAttribute('data-accept-status', model.status);

    const heading = doc.createElement('h2');
    heading.className = 'collab-accept__heading';
    heading.setAttribute('data-collab-action', 'review-invitation');
    heading.textContent = model.review === null ? 'Invitation' : model.review.title;
    root.appendChild(heading);

    if (model.review !== null) {
        const summary = doc.createElement('p');
        summary.className = 'collab-accept__summary';
        summary.textContent = `${model.review.workspaceDisplayName} — as ${model.review.role}`;
        root.appendChild(summary);

        const badge = doc.createElement('span');
        badge.className = `collab-role-badge collab-role-badge--${model.review.role}`;
        badge.textContent = model.review.role;
        root.appendChild(badge);

        const expires = doc.createElement('p');
        expires.className = 'collab-accept__expires';
        expires.setAttribute('data-invitation-state', model.review.state);
        expires.textContent = model.review.actionable
            ? `Expires ${model.review.expiresAt}`
            : model.review.reason;
        root.appendChild(expires);
    }

    const accept = doc.createElement('button');
    accept.type = 'button';
    accept.className = 'collab-accept__action';
    accept.setAttribute('data-collab-action', 'accept-invitation');
    accept.textContent = model.status === 'accepted'
        ? 'Joined'
        : model.status === 'accepting' ? 'Accepting…' : 'Accept invitation';
    if (!model.canAccept) {
        accept.disabled = true;
        accept.setAttribute('aria-disabled', 'true');
        const why = model.blocked ?? (model.review === null ? 'No invitation to accept.' : 'Working…');
        accept.setAttribute('title', why);
        const reasonId = `${instanceId}-accept-reason`;
        accept.setAttribute('aria-describedby', reasonId);
        root.appendChild(accept);
        const reason = doc.createElement('p');
        reason.className = 'collab-accept__reason';
        reason.id = reasonId;
        reason.textContent = why;
        root.appendChild(reason);
        if (!model.deviceReady && model.authenticated && !model.identityMismatch) {
            const setup = doc.createElement('button');
            setup.type = 'button';
            setup.className = 'collab-accept__device-action';
            setup.setAttribute('data-collab-action', 'device-setup-open');
            setup.textContent = 'Set up this device';
            root.appendChild(setup);
        }
    } else {
        root.appendChild(accept);
    }

    // What acceptance actually gets you, said before it is chosen rather than
    // discovered afterwards.
    const after = doc.createElement('p');
    after.className = 'collab-accept__after';
    after.setAttribute('data-readiness', model.pendingKeyAfterAccept.readiness);
    after.textContent = model.status === 'accepted'
        ? model.pendingKeyAfterAccept.reason
        : 'Joining puts you in the workspace, but not yet able to open its documents: '
            + 'an owner or admin still has to give this device the workspace key.';
    root.appendChild(after);

    if (model.failure !== null) {
        const failureNode = doc.createElement('p');
        failureNode.className = 'collab-accept__failure';
        failureNode.setAttribute('role', 'alert');
        failureNode.setAttribute('data-failure-code', model.failure.code);
        failureNode.textContent = model.failure.reason;
        root.appendChild(failureNode);
    }
    return root;
}

/**
 * Review an invitation. Grants no authority; it only describes.
 *
 * @param {{api: object, token: string}} input
 */
export async function reviewInvitation({ api, token } = {}) {
    if (!api || typeof api.bootstrapInvitation !== 'function') fail('API_REQUIRED');
    if (typeof token !== 'string' || token.length < 16) fail('INVALID_TOKEN');
    // The token travels in the body, never in a path or query.
    const review = await api.bootstrapInvitation({ token });
    if (!review || !INVITATION_REVIEW_STATES.includes(review.state)) {
        fail('INVITATION_RESPONSE_INVALID');
    }
    return Object.freeze({ ...review });
}

/**
 * Accept. Requires the device the membership will be bound to.
 *
 * @param {{api: object, token: string, deviceId: string,
 *          newIdempotencyKey: () => string}} input
 */
export async function acceptInvitation({ api, token, deviceId, newIdempotencyKey } = {}) {
    if (!api || typeof api.acceptInvitation !== 'function') fail('API_REQUIRED');
    if (typeof token !== 'string' || token.length < 16) fail('INVALID_TOKEN');
    if (!UUID_V4.test(deviceId ?? '')) fail('INVALID_DEVICE');
    if (typeof newIdempotencyKey !== 'function') fail('IDEMPOTENCY_KEY_REQUIRED');
    const result = await api.acceptInvitation({
        token, deviceId, idempotencyKey: newIdempotencyKey()
    });
    const membership = result?.membership;
    if (!membership || membership.state !== 'pending_key') {
        // The contract says acceptance creates a pending_key membership and
        // conveys no usable key. Anything else is a response this journey does
        // not understand, and pretending otherwise would strand the user.
        fail('MEMBERSHIP_NOT_PENDING_KEY');
    }
    return Object.freeze({ status: 'accepted', membership });
}
