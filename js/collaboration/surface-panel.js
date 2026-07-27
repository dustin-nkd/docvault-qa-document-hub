// Composing the built surfaces into the shell (CF-P7-013).
//
// Ten surfaces were built and gated in isolation and, until this file, none of
// them was reachable from the app. This composes them.
//
// The rule it follows: a surface is mounted with whatever is already known, and
// where a surface needs an authorized read that has not happened yet it is
// mounted in its own `loading` state rather than left out. A surface that is
// absent is indistinguishable from a surface that is broken; a surface that says
// it is loading is neither.
//
// Nothing here decides anything a surface already decides. Every model function
// is the one its own story shipped and gated, and every refusal those models
// make is left to surface rather than caught and smoothed over.

import { baseStateModel, renderBaseState } from './base-states.js';
import { createWorkspaceModel, renderCreateWorkspace } from './create-workspace.js';
import { deviceInitializationModel, renderDeviceInitialization } from './device-initialization.js';
import { memberListModel, renderMemberList } from './member-list.js';
import { invitationModel, renderInvitations } from './invitations.js';
import { invitationAcceptModel, renderInvitationAccept } from './invitation-accept.js';
import { presentSyncState, renderSyncState } from './sync-state.js';
import { conflictDialogModel, renderConflictDialog } from './conflict-dialog.js';
import { auditActivityModel, renderAuditActivity } from './audit-activity.js';

export const PANEL_ID = 'collaboration-panel';

/** The surfaces this panel composes, in the order they are mounted. */
export const COMPOSED_SURFACES = Object.freeze([
    'create-workspace',
    'device-key-initialization',
    'member-list-role-badge',
    'invitation-manage',
    'invitation-accept',
    'sync-state',
    'conflict-dialog',
    'audit-activity'
]);

/** Surfaces scoped to the account, which need no active workspace. */
const ACCOUNT_SCOPED = Object.freeze([
    'create-workspace', 'device-key-initialization', 'invitation-accept'
]);

export class SurfacePanelError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'SurfacePanelError';
        this.code = code;
    }
}

const fail = code => { throw new SurfacePanelError(code); };

/**
 * Mount one surface, or its loading state, or the reason it cannot be shown.
 *
 * A surface's own model may refuse the data it is handed — that is the whole
 * point of the eleven gates — so a refusal is turned into that surface's `error`
 * state with the surface named, rather than being allowed to take down the panel
 * around it. One broken surface must not hide nine working ones.
 */
function mountSurface(doc, section, surface, build) {
    try {
        section.appendChild(build());
    } catch (error) {
        section.appendChild(renderBaseState(doc, baseStateModel({
            state: 'error',
            surface,
            title: 'This section could not be shown',
            reason: `The data for ${surface} did not match what this version expects `
                + `(${error?.code ?? 'unknown'}). The rest of the page is unaffected.`
        })));
    }
}

/**
 * A read that did not come back, said out loud (CF-P7-013).
 *
 * The rule above — an undelivered list renders `loading`, never an empty one —
 * is right while a read is still in flight and wrong the moment it has failed.
 * A surface left on `loading` after its read was denied is the permanent-loading
 * defect this story exists to remove, wearing the honest state's clothes: the
 * user waits for something that is never coming.
 *
 * So a caller that knows a read failed says so, and that surface renders its own
 * `error` with the reason the server gave. Absence of a key still means "not
 * back yet"; presence here means "back, and it was a no".
 */
function mountFailure(doc, section, surface, failure) {
    section.appendChild(renderBaseState(doc, baseStateModel({
        state: failure.state === 'unauthorized' ? 'unauthorized' : 'error',
        surface,
        title: failure.title ?? 'This section could not be loaded',
        reason: failure.reason
            ?? 'The workspace could not be reached for this section. Nothing was changed.'
    })));
}

/**
 * Compose the panel.
 *
 * `data.failures` maps a surface id to the reason its read came back refused.
 * It is deliberately separate from the data itself: a missing key means the
 * answer has not arrived, and an entry here means it arrived and was a no. The
 * two look identical from inside the panel and mean opposite things to a user.
 *
 * @param {{document: Document, context: {status: string, workspaceId: string|null},
 *          session: {authenticated: boolean|null, login?: string},
 *          device?: object|null, data?: object}} input
 */
export function renderSurfacePanel({ document: doc, context, session, device = null,
    data = {} } = {}) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!context || typeof context.status !== 'string') fail('CONTEXT_REQUIRED');
    if (!session || typeof session !== 'object') fail('SESSION_REQUIRED');

    const panel = doc.createElement('div');
    panel.className = 'collab-panel';
    panel.id = PANEL_ID;
    panel.setAttribute('data-context-status', context.status);

    const active = context.status === 'active';

    for (const surface of COMPOSED_SURFACES) {
        const section = doc.createElement('section');
        section.className = `collab-panel__section collab-panel__section--${surface}`;
        section.setAttribute('data-surface', surface);
        section.setAttribute('data-scope',
            ACCOUNT_SCOPED.includes(surface) ? 'account' : 'workspace');

        // A read that came back refused outranks everything below it: there is
        // nothing to wait for and nothing to render from.
        const failure = (data.failures ?? {})[surface];
        if (failure !== undefined) {
            mountFailure(doc, section, surface, failure);
            panel.appendChild(section);
            continue;
        }

        // A workspace-scoped surface with no active workspace says so, rather
        // than rendering an empty list that looks like an empty workspace.
        if (!active && !ACCOUNT_SCOPED.includes(surface)) {
            section.appendChild(renderBaseState(doc, baseStateModel({
                state: 'empty',
                surface,
                title: 'No workspace selected',
                reason: 'Choose a workspace to see this.'
            })));
            panel.appendChild(section);
            continue;
        }

        mountSurface(doc, section, surface, () => build(doc, surface, {
            context, session, device, data, active
        }));
        panel.appendChild(section);
    }
    return panel;
}

function build(doc, surface, { context, session, device, data }) {
    switch (surface) {
        case 'create-workspace':
            return renderCreateWorkspace(doc, createWorkspaceModel({
                session, device, name: data.workspaceName ?? '',
                status: data.createStatus ?? 'naming',
                failure: data.createFailure ?? null
            }));

        case 'device-key-initialization':
            return renderDeviceInitialization(doc, deviceInitializationModel({
                session,
                status: data.deviceStatus ?? (device === null ? 'unregistered' : 'registered'),
                device,
                readiness: data.keyReadiness ?? null,
                guidance: data.deviceGuidance ?? null,
                failure: data.deviceFailure ?? null
            }));

        case 'member-list-role-badge':
            // Undelivered reads render as loading, never as an empty list: an
            // empty member list is a claim about the workspace, and this panel
            // is not entitled to make it before the read returns.
            if (!Array.isArray(data.members)) return loading(doc, surface, 'Loading members');
            return renderMemberList(doc, memberListModel({
                actor: data.actor, members: data.members
            }), 'panel-members');

        case 'invitation-manage':
            if (!Array.isArray(data.invitations)) {
                return loading(doc, surface, 'Loading invitations');
            }
            return renderInvitations(doc, invitationModel({
                actorRole: data.actor?.role, invitations: data.invitations,
                issued: data.issuedInvitation ?? null
            }), 'panel-invites');

        case 'invitation-accept':
            if (!data.invitationReview) {
                return renderBaseState(doc, baseStateModel({
                    state: 'empty',
                    surface,
                    title: 'No invitation to review',
                    reason: 'Open an invitation link to review and accept it here.'
                }));
            }
            return renderInvitationAccept(doc, invitationAcceptModel({
                session, device, review: data.invitationReview
            }), 'panel-accept');

        case 'sync-state':
            return renderSyncState(doc, presentSyncState(data.syncState ?? 'saved'),
                data.recovery ?? []);

        case 'conflict-dialog':
            if (!data.conflict) {
                return renderBaseState(doc, baseStateModel({
                    state: 'empty',
                    surface,
                    title: 'No conflict to resolve',
                    reason: 'This appears when someone else changes a document you are editing.'
                }));
            }
            return renderConflictDialog(doc, conflictDialogModel({
                conflict: data.conflict, draftHeld: data.draftHeld === true
            }), 'panel-conflict');

        case 'audit-activity':
            if (!Array.isArray(data.auditEvents)) return loading(doc, surface, 'Loading activity');
            return renderAuditActivity(doc, auditActivityModel({
                actorRole: data.actor?.role, events: data.auditEvents,
                nextCursor: data.auditCursor ?? null
            }), 'panel-audit');

        default:
            return fail('UNKNOWN_SURFACE');
    }
}

function loading(doc, surface, title) {
    return renderBaseState(doc, baseStateModel({ state: 'loading', surface, title }));
}
