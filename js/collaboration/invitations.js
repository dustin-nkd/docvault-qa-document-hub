// Invitation creation, copy, and revoke (CF-P7-006's sibling surface, CF-P7-007).
//
// This surface handles a secret, and that shapes almost every decision in it.
//
// The acceptance token has at least 256 random bits, is returned exactly once,
// lives only in a URL fragment, and is stored server-side only as a digest. If
// the person who created the invitation loses it, it cannot be recovered — the
// only remedy is to revoke and issue another. So the surface says so plainly
// while the value is on screen, rather than letting someone navigate away and
// discover it later.
//
// What this module must never do, and what the gate enforces structurally: put
// the acceptance URL in storage of any kind, log it, render it into an anchor
// whose activation would push it into browser history, or hold it after the
// caller clears it.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** An invitation may not create an owner; ownership moves by transfer only. */
export const INVITABLE_ROLES = Object.freeze(['admin', 'editor', 'viewer']);

/** The one state the pending list returns. Terminal records are not listed. */
export const INVITATION_STATES = Object.freeze(['pending']);

/** Clipboard delivery states owned by the composed entry. */
const COPY_STATUSES = Object.freeze(['idle', 'copying', 'copied', 'blocked']);

export class InvitationError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'InvitationError';
        this.code = code;
    }
}

const fail = code => { throw new InvitationError(code); };
const allow = () => Object.freeze({ allowed: true, reason: null });
const deny = reason => Object.freeze({ allowed: false, reason });

/**
 * Who may invite whom, from the frozen matrix.
 *
 * Creating an Admin invitation is Owner-only; Editor and Viewer invitations are
 * Owner or Admin. Revocation follows the same split, so an admin cannot revoke
 * an invitation they could not have created.
 *
 * @param {{actorRole: string, role: string, action?: string}} input
 */
export function invitationDecision({ actorRole, role, action = 'create' } = {}) {
    if (!['owner', 'admin', 'editor', 'viewer'].includes(actorRole)) fail('INVALID_ROLE');
    if (!INVITABLE_ROLES.includes(role)) fail('INVALID_ROLE');
    if (!['create', 'revoke'].includes(action)) fail('UNKNOWN_ACTION');
    const verb = action === 'create' ? 'invite' : 'revoke an invitation for';
    if (actorRole !== 'owner' && actorRole !== 'admin') {
        return deny(`Only an owner or admin can ${verb} someone.`);
    }
    if (role === 'admin' && actorRole !== 'owner') {
        return deny(`Only an owner can ${verb} an admin.`);
    }
    return allow();
}

/**
 * The GitHub username rule.
 *
 * Mirrors the provider's own shape so the control is not enabled into a refusal.
 * The server resolves the username to an immutable numeric subject at creation;
 * the username is a display snapshot and never the acceptance authority, so a
 * mirror being slightly permissive is safe while being strict is not.
 *
 * @param {string} value
 */
export function validateDisplayLogin(value) {
    if (typeof value !== 'string' || value.length === 0) {
        return Object.freeze({ valid: false, message: 'Enter a GitHub username.' });
    }
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value)) {
        return Object.freeze({
            valid: false,
            message: 'That is not a GitHub username. Use letters, numbers, and single hyphens.'
        });
    }
    return Object.freeze({ valid: true, message: null });
}

/**
 * Wrap the one-time acceptance URL.
 *
 * Deliberately not a plain string. The wrapper carries the fact that the value
 * cannot be recovered, exposes `clear()` so the caller can drop it as soon as it
 * has been copied, and refuses a URL whose secret is anywhere but the fragment —
 * a token in a query string would reach the server in logs, referrers, and proxy
 * traces, which is precisely what the fragment placement exists to prevent.
 *
 * @param {string} url
 */
export function holdAcceptanceUrl(url) {
    if (typeof url !== 'string' || url.length === 0) fail('ACCEPTANCE_URL_REQUIRED');
    const hash = url.indexOf('#');
    if (hash === -1) fail('TOKEN_NOT_IN_FRAGMENT');
    const beforeFragment = url.slice(0, hash);
    if (beforeFragment.includes('?')) fail('TOKEN_MAY_NOT_REACH_A_QUERY_STRING');
    if (url.slice(hash + 1).length < 16) fail('TOKEN_TOO_SHORT');
    let value = url;
    return Object.freeze({
        oneTimeOnly: true,
        recoverable: false,
        read() {
            if (value === null) fail('ACCEPTANCE_URL_CLEARED');
            return value;
        },
        cleared() { return value === null; },
        clear() { value = null; return true; }
    });
}

/**
 * Copy the acceptance URL through an injected clipboard.
 *
 * The clipboard is injected rather than reached for so this stays testable and
 * so the module cannot quietly acquire a second way to move the secret around.
 *
 * @param {{clipboard?: {writeText: Function}, held: ReturnType<typeof holdAcceptanceUrl>}} input
 */
export async function copyAcceptanceUrl({ clipboard, held } = {}) {
    if (!held || typeof held.read !== 'function') fail('ACCEPTANCE_URL_REQUIRED');
    const manualReason = 'Copying was blocked. Select the link and copy it manually before leaving '
        + 'this page — it cannot be shown again.';
    if (!clipboard || typeof clipboard.writeText !== 'function') {
        return Object.freeze({ copied: false, reason: manualReason });
    }
    try {
        await clipboard.writeText(held.read());
        return Object.freeze({ copied: true, reason: null });
    } catch {
        // A refused clipboard is not a failure of the invitation: the value is
        // still on screen and can be selected by hand, so say that instead.
        return Object.freeze({ copied: false, reason: manualReason });
    }
}

/**
 * Describe the invitation surface.
 *
 * @param {{actorRole: string, invitations: ReadonlyArray<object>, role?: string,
 *          displayLogin?: string, issued?: object|null, status?: string,
 *          copyStatus?: string, copyNotice?: string|null,
 *          revokePendingId?: string|null, revokeFailures?: object}} input
 */
export function invitationModel({ actorRole, invitations, role = 'editor', displayLogin = '',
    issued = null, status = 'idle', copyStatus = 'idle', copyNotice = null,
    revokePendingId = null, revokeFailures = {} } = {}) {
    if (!Array.isArray(invitations)) fail('INVITATIONS_REQUIRED');
    if (!INVITABLE_ROLES.includes(role)) fail('INVALID_ROLE');
    if (!COPY_STATUSES.includes(copyStatus)) fail('INVALID_STATUS');
    if (copyNotice !== null && typeof copyNotice !== 'string') fail('INVALID_NOTICE');
    if (revokePendingId !== null && !UUID_V4.test(revokePendingId)) {
        fail('INVALID_INVITATION');
    }
    if (typeof revokeFailures !== 'object' || revokeFailures === null
        || Array.isArray(revokeFailures)) fail('INVALID_FAILURES');
    const nameCheck = validateDisplayLogin(displayLogin);
    const create = invitationDecision({ actorRole, role, action: 'create' });
    const inFlight = status === 'creating' || status === 'revoking'
        || revokePendingId !== null;

    const rows = invitations.map(invitation => {
        if (!UUID_V4.test(invitation?.invitationId ?? '')) fail('INVALID_INVITATION');
        if (!INVITABLE_ROLES.includes(invitation.role)) fail('INVALID_ROLE');
        if (!INVITATION_STATES.includes(invitation.state)) fail('INVALID_INVITATION_STATE');
        const revoke = invitationDecision({ actorRole, role: invitation.role, action: 'revoke' });
        const revokeFailure = revokeFailures[invitation.invitationId] ?? null;
        if (revokeFailure !== null && typeof revokeFailure !== 'string') fail('INVALID_FAILURES');
        return Object.freeze({
            invitationId: invitation.invitationId,
            targetDisplayLogin: invitation.targetDisplayLogin,
            role: invitation.role,
            expiresAt: invitation.expiresAt,
            revoke,
            revokeDisabled: !revoke.allowed || inFlight,
            revokeInFlight: revokePendingId === invitation.invitationId,
            revokeFailure
        });
    });
    if (revokePendingId !== null
        && !rows.some(invitation => invitation.invitationId === revokePendingId)) {
        fail('INVALID_INVITATION');
    }

    return Object.freeze({
        status,
        actorRole,
        role,
        displayLogin,
        nameMessage: nameCheck.message,
        create,
        canCreate: create.allowed && nameCheck.valid && !inFlight,
        inFlight,
        copyStatus,
        copyNotice,
        copyInFlight: copyStatus === 'copying',
        // A pending list with nothing in it is empty, not broken.
        isEmpty: rows.length === 0,
        invitations: Object.freeze(rows),
        // Present only while the caller still holds it.
        issuedUrl: issued === null || issued.cleared() ? null : issued.read(),
        issuedIsOneTime: issued !== null
    });
}

/**
 * Build the nodes.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof invitationModel>} model
 * @param {string} instanceId
 */
export function renderInvitations(doc, model, instanceId) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !Array.isArray(model.invitations)) fail('MODEL_REQUIRED');
    if (typeof instanceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(instanceId)) {
        fail('INSTANCE_ID_REQUIRED');
    }

    const root = doc.createElement('section');
    root.className = 'collab-invites';
    root.setAttribute('data-collab-surface', 'invitation-manage');

    const heading = doc.createElement('h2');
    heading.className = 'collab-invites__heading';
    heading.textContent = 'Invitations';
    root.appendChild(heading);

    // The two things an invitation is made of. The model has always taken a
    // `displayLogin` and a `role`, and until now nothing rendered a way to
    // supply either: the surface showed a disabled control explaining that a
    // GitHub username was needed, above no field to type one into.
    const label = doc.createElement('label');
    label.className = 'collab-invites__label';
    label.setAttribute('for', `${instanceId}-login`);
    label.textContent = 'GitHub username';
    root.appendChild(label);

    const login = doc.createElement('input');
    login.className = 'collab-invites__login-input';
    login.type = 'text';
    login.id = `${instanceId}-login`;
    login.setAttribute('name', 'displayLogin');
    login.setAttribute('autocomplete', 'off');
    login.setAttribute('spellcheck', 'false');
    login.setAttribute('maxlength', '39');
    login.setAttribute('value', model.displayLogin);
    // Invalid only once something has been typed: an empty field on arrival is
    // not an error the user has made yet.
    if (model.nameMessage !== null && model.displayLogin.length > 0) {
        login.setAttribute('aria-invalid', 'true');
    }
    if (model.inFlight) login.disabled = true;
    root.appendChild(login);

    const roleLabel = doc.createElement('label');
    roleLabel.className = 'collab-invites__label';
    roleLabel.setAttribute('for', `${instanceId}-role`);
    roleLabel.textContent = 'Role';
    root.appendChild(roleLabel);

    const roleField = doc.createElement('select');
    roleField.className = 'collab-invites__role-input';
    roleField.id = `${instanceId}-role`;
    roleField.setAttribute('name', 'role');
    if (model.inFlight) roleField.disabled = true;
    for (const value of INVITABLE_ROLES) {
        const option = doc.createElement('option');
        option.setAttribute('value', value);
        // The owner role is deliberately absent: ownership moves by transfer,
        // not by invitation, and offering it here would promise otherwise.
        option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
        if (value === model.role) option.setAttribute('selected', 'selected');
        roleField.appendChild(option);
    }
    root.appendChild(roleField);

    const create = doc.createElement('button');
    create.type = 'button';
    create.className = 'collab-invites__create';
    create.setAttribute('data-collab-action', 'create-invitation');
    create.textContent = 'Send invitation';
    if (!model.canCreate) {
        create.disabled = true;
        create.setAttribute('aria-disabled', 'true');
        const why = model.create.reason ?? model.nameMessage ?? 'Working…';
        create.setAttribute('title', why);
        const reasonId = `${instanceId}-create-reason`;
        create.setAttribute('aria-describedby', reasonId);
        const reason = doc.createElement('p');
        reason.className = 'collab-invites__reason';
        reason.id = reasonId;
        reason.textContent = why;
        root.appendChild(create);
        root.appendChild(reason);
    } else {
        root.appendChild(create);
    }

    if (model.issuedUrl !== null) {
        const issued = doc.createElement('div');
        issued.className = 'collab-invites__issued';
        issued.setAttribute('role', 'group');
        issued.setAttribute('aria-labelledby', `${instanceId}-issued-warning`);

        const warning = doc.createElement('p');
        warning.className = 'collab-invites__warning';
        warning.id = `${instanceId}-issued-warning`;
        warning.setAttribute('role', 'alert');
        warning.textContent = 'Copy this link now. It is shown once and cannot be recovered — '
            + 'if it is lost, revoke the invitation and send a new one.';
        issued.appendChild(warning);

        // A readonly input, never an anchor: activating a link would push the
        // secret into browser history, which the token's fragment placement
        // exists to avoid.
        const field = doc.createElement('input');
        field.className = 'collab-invites__url';
        field.type = 'text';
        field.id = `${instanceId}-issued-url`;
        field.setAttribute('readonly', 'readonly');
        field.setAttribute('spellcheck', 'false');
        field.setAttribute('aria-label', 'One-time invitation link');
        field.value = model.issuedUrl;
        issued.appendChild(field);

        const copy = doc.createElement('button');
        copy.type = 'button';
        copy.className = 'collab-invites__copy';
        copy.setAttribute('data-collab-action', 'copy-acceptance-link');
        copy.textContent = model.copyInFlight ? 'Copying…' : 'Copy link';
        if (model.copyInFlight) {
            copy.disabled = true;
            copy.setAttribute('aria-disabled', 'true');
        }
        issued.appendChild(copy);
        root.appendChild(issued);
    }

    if (typeof model.copyNotice === 'string' && model.copyNotice.length > 0) {
        const notice = doc.createElement('p');
        notice.className = 'collab-invites__copy-notice';
        notice.setAttribute('role', 'status');
        notice.setAttribute('aria-live', 'polite');
        notice.setAttribute('data-copy-status', model.copyStatus);
        notice.textContent = model.copyNotice;
        root.appendChild(notice);
    }

    const list = doc.createElement('ul');
    list.className = 'collab-invites__list';
    for (const invitation of model.invitations) {
        const row = doc.createElement('li');
        row.className = 'collab-invites__row';
        row.setAttribute('data-invitation-id', invitation.invitationId);

        const who = doc.createElement('span');
        who.className = 'collab-invites__login';
        who.textContent = invitation.targetDisplayLogin;
        row.appendChild(who);

        const badge = doc.createElement('span');
        badge.className = `collab-role-badge collab-role-badge--${invitation.role}`;
        badge.textContent = invitation.role;
        row.appendChild(badge);

        const expires = doc.createElement('span');
        expires.className = 'collab-invites__expires';
        expires.textContent = `expires ${invitation.expiresAt}`;
        row.appendChild(expires);

        const revoke = doc.createElement('button');
        revoke.type = 'button';
        revoke.className = 'collab-invites__revoke';
        revoke.setAttribute('data-collab-action', 'revoke-invitation');
        revoke.setAttribute('data-invitation-id', invitation.invitationId);
        revoke.textContent = invitation.revokeInFlight ? 'Revokingâ€¦' : 'Revoke';
        if (invitation.revokeDisabled) {
            revoke.disabled = true;
            revoke.setAttribute('aria-disabled', 'true');
        }
        if (!invitation.revoke.allowed) {
            revoke.setAttribute('title', invitation.revoke.reason);
            const reasonId = `${instanceId}-revoke-reason-${invitation.invitationId}`;
            revoke.setAttribute('aria-describedby', reasonId);
            const reason = doc.createElement('span');
            reason.className = 'collab-invites__reason';
            reason.id = reasonId;
            reason.textContent = invitation.revoke.reason;
            row.appendChild(revoke);
            row.appendChild(reason);
        } else {
            row.appendChild(revoke);
        }
        if (invitation.revokeFailure !== null) {
            const failure = doc.createElement('p');
            failure.className = 'collab-invites__revoke-failure';
            failure.setAttribute('role', 'alert');
            failure.setAttribute('data-revoke-status', 'failed');
            failure.textContent = invitation.revokeFailure;
            row.appendChild(failure);
        }
        list.appendChild(row);
    }
    root.appendChild(list);
    return root;
}

/**
 * Create an invitation and take hold of the one-time URL.
 *
 * @param {{api: object, workspaceId: string, displayLogin: string, role: string,
 *          newIdempotencyKey: () => string}} input
 */
export async function createInvitation({ api, workspaceId, displayLogin, role,
    newIdempotencyKey } = {}) {
    if (!api || typeof api.createInvitation !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
    if (!INVITABLE_ROLES.includes(role)) fail('INVALID_ROLE');
    if (!validateDisplayLogin(displayLogin).valid) fail('INVALID_DISPLAY_LOGIN');
    if (typeof newIdempotencyKey !== 'function') fail('IDEMPOTENCY_KEY_REQUIRED');
    const result = await api.createInvitation({
        workspaceId, displayLogin, role, idempotencyKey: newIdempotencyKey()
    });
    if (!result?.invitation || typeof result.acceptanceUrl !== 'string') {
        fail('INVITATION_RESPONSE_INVALID');
    }
    return Object.freeze({
        invitation: result.invitation,
        // Held, not returned raw, so the caller has to opt into reading it.
        held: holdAcceptanceUrl(result.acceptanceUrl)
    });
}

/**
 * Revoke a pending invitation.
 *
 * @param {{api: object, workspaceId: string, invitationId: string,
 *          newIdempotencyKey: () => string}} input
 */
export async function revokeInvitation({ api, workspaceId, invitationId,
    newIdempotencyKey } = {}) {
    if (!api || typeof api.revokeInvitation !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
    if (!UUID_V4.test(invitationId ?? '')) fail('INVALID_INVITATION');
    if (typeof newIdempotencyKey !== 'function') fail('IDEMPOTENCY_KEY_REQUIRED');
    await api.revokeInvitation({ workspaceId, invitationId, idempotencyKey: newIdempotencyKey() });
    return Object.freeze({ status: 'revoked', invitationId });
}
