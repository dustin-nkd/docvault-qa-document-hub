// The lazy entry point (CF-P7-013).
//
// Every module under js/collaboration/ has been built and gated in isolation.
// This is the one file that joins them to the app, and it exists to be reached
// *only* through a dynamic import triggered by an explicit user action — the
// Phase 7 budget is zero collaboration modules evaluated for a user who never
// opens collaboration.
//
// So the eager side of the app (js/deployment.js, which is dependency-free and
// ships in the initial payload) knows nothing about this file beyond its path,
// and imports it inside a click handler. Nothing here may ever be referenced by
// a script tag or entered into the service worker precache.

import { mountShell, showState, unmountShell, SHELL_ROOT_ID } from './shell.js';
import { resolveContext, createWorkspaceSelection } from './workspace-context.js';
import { accountMenuModel, renderAccountMenu, setAccountMenuOpen } from './account-menu.js';
import {
    workspaceSwitcherModel, renderWorkspaceSwitcher, setSwitcherOpen
} from './workspace-switcher.js';
import { createApiClient, API_BASE, ERROR_PRESENTATION } from './api-client.js';
import { renderSurfacePanel } from './surface-panel.js';
import { createCollaborationServices } from './services.js';
import { readMembers } from './member-list.js';
import { readAuditEvents } from './audit-activity.js';
import { readKeyReadiness } from './device-initialization.js';
import { reviewInvitation, takeTokenFromFragment } from './invitation-accept.js';
import { deriveSyncState } from './sync-state.js';

export const CHROME_ID = 'collaboration-chrome';

/**
 * Open collaboration.
 *
 * `deployment` is the verdict the eager module already computed, passed in
 * rather than recomputed, so there is exactly one answer to "can collaboration
 * run here" in the app.
 *
 * `session` and `workspaces` are supplied by the caller. This entry performs no
 * network call of its own: what it renders is what it was handed, and the shell
 * shows `loading` until the caller has something to hand it.
 *
 * @param {{document: Document, deployment: {available: boolean, reason: string},
 *          session?: {authenticated: boolean|null, login?: string, avatarUrl?: string},
 *          workspaces?: ReadonlyArray<object>, storage?: Storage,
 *          environment?: string, subject?: string}} input
 */
export function openCollaboration({ document: doc, deployment, session = { authenticated: null },
    workspaces = [], storage, environment, subject, device = null, data = {} } = {}) {
    const container = mountShell({ document: doc, deployment });
    // Null means the deployment cannot support collaboration. The banner owned
    // by the eager module has already said so; adding a second message here
    // would say the same thing twice.
    if (container === null) return null;

    if (session.authenticated === false) {
        showState(doc, {
            state: 'unauthorized',
            surface: 'base-states',
            title: 'Sign in to collaborate',
            reason: 'Team workspaces need a signed-in GitHub account.',
            action: { label: 'Sign in with GitHub', id: 'sign-in' }
        });
        return container;
    }
    if (session.authenticated !== true) {
        showState(doc, {
            state: 'loading', surface: 'base-states', title: 'Checking your session'
        });
        return container;
    }

    // A remembered selection is read only where a caller gave us somewhere to
    // read it from; a missing store is no selection, never an error.
    let remembered = null;
    if (storage && environment && subject) {
        try {
            remembered = createWorkspaceSelection({ storage, environment, subject }).read();
        } catch {
            remembered = null;
        }
    }

    const context = resolveContext({ remembered, workspaces });
    const chrome = doc.createElement('div');
    chrome.className = 'collab-chrome';
    chrome.id = CHROME_ID;
    const switcher = renderWorkspaceSwitcher(doc,
        workspaceSwitcherModel({ context, workspaces }));
    const account = renderAccountMenu(doc, accountMenuModel({ session }));
    chrome.append(switcher, account);
    // The chrome names where you are; the panel is everything you can do there.
    // Composed in one call so a surface is never quietly omitted -- see
    // surface-panel.js for why an absent surface is worse than a loading one.
    const panel = renderSurfacePanel({
        document: doc, context, session, device: device ?? null, data: data ?? {}
    });
    container.replaceChildren(chrome, panel);

    bindDisclosure(chrome, switcher, '.collab-switcher__trigger', setSwitcherOpen);
    bindDisclosure(chrome, account, '.collab-account__trigger', setAccountMenuOpen);
    return container;
}

/**
 * Wire one disclosure: toggle on its trigger, close on Escape.
 *
 * Escape is handled on the chrome rather than the document so collaboration
 * cannot swallow a key press meant for a Personal Vault view.
 */
function bindDisclosure(chrome, root, triggerSelector, setOpen) {
    const trigger = root.querySelector(triggerSelector);
    if (trigger === null) return;
    trigger.addEventListener('click', () => {
        setOpen({ root, open: trigger.getAttribute('aria-expanded') !== 'true' });
    });
    chrome.addEventListener('keydown', event => {
        if (event.key === 'Escape') setOpen({ root, open: false });
    });
}

/**
 * Open collaboration by asking the deployment, rather than being told.
 *
 * `openCollaboration` renders what it is handed and performs no transport; this
 * is what hands it something. The split is deliberate — every state below is
 * still reachable synchronously in a test without a fake network, and the one
 * function that awaits is the one that has a reason to.
 *
 * Two answers come back from a single `GET /api/v1/session`, because they are
 * one question asked of one deployment:
 *
 *   - whether collaboration runs here at all. `js/deployment.js` already said
 *     the hostname *could* host it, which is true of every *.pages.dev origin
 *     including the Production deployment where the feature is switched off and
 *     no database exists. The API answers `COLLABORATION_UNAVAILABLE` there,
 *     and that answer wins.
 *   - and, if it does, who the user is.
 *
 * When the deployment says no, the message has to come from here. The banner
 * that would normally explain an unavailable deployment is hidden on Cloudflare
 * — correctly, since the hostname really is a Cloudflare one — so staying quiet
 * would leave a user who pressed a button looking at nothing.
 *
 * @param {{document: Document, deployment: {available: boolean, reason: string},
 *          client?: object, fetch?: Function, storage?: Storage,
 *          environment?: string, subject?: string,
 *          loadWorkspaces?: (client: object) => Promise<Array<object>>}} input
 */
export async function startCollaboration({ document: doc, deployment, client, fetch: transport,
    storage, environment, subject, loadWorkspaces, location, history } = {}) {
    const container = mountShell({ document: doc, deployment });
    if (container === null) return null;

    // No `fetch` named here even as a fallback: the client resolves the global,
    // and it is the only module under js/collaboration/ that may.
    const api = client ?? createApiClient({ fetch: transport });
    const resolved = await api.resolveSession();

    if (resolved.available === false) {
        showState(doc, {
            state: 'error',
            surface: 'base-states',
            title: 'Collaboration is not enabled here',
            reason: ERROR_PRESENTATION.COLLABORATION_UNAVAILABLE.reason
        });
        return container;
    }

    if (resolved.authenticated !== true) {
        // A failure that is not a denial gets its own reason rather than being
        // shown as a sign-in prompt the user cannot act on.
        if (resolved.failure !== null && resolved.failure.ui === 'error') {
            showState(doc, {
                state: 'error',
                surface: 'base-states',
                title: 'Collaboration could not be reached',
                reason: resolved.failure.reason
            });
            return container;
        }
        return openCollaboration({
            document: doc, deployment, session: { authenticated: false }
        });
    }

    // Workspaces are a separate authorized read, and a failure to list them is
    // not a failure to sign in: the session stands, the list is simply empty,
    // and the switcher's own empty state says so.
    let workspaces = [];
    if (typeof loadWorkspaces === 'function') {
        workspaces = await loadWorkspaces(api);
    } else {
        const page = await api.list({ path: `${API_BASE}/workspaces` });
        workspaces = page.ok ? [...page.items] : [];
    }

    const session = {
        authenticated: true,
        login: resolved.user?.login,
        avatarUrl: resolved.user?.avatarUrl,
        userId: resolved.user?.userId
    };
    const identity = subject ?? resolved.user?.userId;
    const paint = data => openCollaboration({
        document: doc, deployment, session, workspaces, storage, environment,
        subject: identity, data
    });
    const services = createCollaborationServices({ client: api });

    // Taken out of the address bar before anything is painted, and the history
    // entry that carried it is overwritten in the same step — so no render, no
    // back-navigation, and no failure below can leave the token on screen.
    const invitationToken = location && history
        ? takeTokenFromFragment({ location, history }).token
        : null;

    // Choosing a workspace is what makes every workspace-scoped surface mean
    // anything, and the switcher renders its options as controls with nothing
    // listening to them until here. Delegated on the container rather than bound
    // per option: the panel and the chrome are both replaced on every repaint,
    // and handlers bound to nodes that no longer exist are how a shell of this
    // shape leaks listeners and stops responding.
    const selection = openSelection({ storage, environment, subject: identity });
    if (typeof container.addEventListener === 'function') {
        container.addEventListener('click', event => {
            const control = typeof event.target?.closest === 'function'
                ? event.target.closest('[data-collab-action="workspace-switch"]')
                : null;
            if (control === null || control.disabled === true) return;
            const workspaceId = control.getAttribute('data-workspace-id');
            if (!workspaces.some(item => item.workspaceId === workspaceId)) return;
            // Written before the reads start, so a reload lands the user back
            // where they chose rather than wherever the list happens to begin —
            // the half of U2 that is easiest to lose.
            selection?.write(workspaceId);
            void enter(workspaceId);
        });
    }

    /**
     * Load and paint one workspace, from nothing selected or from another one.
     *
     * The loading paint comes first every time, including on a switch: leaving
     * the previous workspace's members on screen while the next one's are
     * fetched would show one workspace's people under another workspace's name,
     * which is the mixing U1 and U2 exist to prevent.
     */
    async function enter(workspaceId) {
        const context = resolveContext({ remembered: workspaceId, workspaces });
        paint({});
        const [workspaceData, invitation] = await Promise.all([
            loadWorkspaceData({ services, context, session }),
            loadInvitationReview({ services, token: invitationToken })
        ]);
        // Merged rather than spread over: both halves can carry a `failures`
        // map, and letting the second replace the first would silently drop one
        // surface's reason for another's.
        paint({
            ...workspaceData,
            ...invitation,
            failures: { ...workspaceData.failures, ...invitation.failures }
        });
        return context.status;
    }

    // The surfaces validate what they render and refuse a record that does not
    // match the contract — a workspace ID that is not the shape the server
    // issues, for instance. That refusal is correct and must stay loud, but it
    // must not surface as a shell left on `loading` forever, which is precisely
    // the failure this story exists to remove. So it lands as an error state
    // with a reason, and the refusal itself is re-thrown to nobody's console but
    // preserved in the state the user can see.
    try {
        await enter(selection?.read() ?? null);
        return container;
    } catch {
        showState(doc, {
            state: 'error',
            surface: 'base-states',
            title: 'Collaboration could not be displayed',
            reason: 'The workspace data did not match what this version expects. '
                + 'Reload the page; if it keeps happening, the app needs an update.'
        });
        return container;
    }
}

/**
 * Open the remembered-workspace selection, or answer that there is none.
 *
 * A store that is missing, blocked, or full is no selection — never an error.
 * Returning the selection rather than the value it holds is what lets the switch
 * handler write through the same object the initial read came from, so the two
 * cannot disagree about which workspace is current and show one name in the
 * chrome over another one's members.
 */
function openSelection({ storage, environment, subject }) {
    if (!storage || !environment || !subject) return null;
    try {
        return createWorkspaceSelection({ storage, environment, subject });
    } catch {
        return null;
    }
}

/**
 * Review the invitation the address bar carried, if it carried one.
 *
 * Account-scoped and independent of every workspace read, which is why it runs
 * alongside them rather than after: someone opening an invitation link has no
 * workspace yet, and their one useful surface must not wait on reads that are
 * about a workspace they are not in.
 *
 * A review grants nothing. It describes an invitation so a person can decide,
 * and a failure to describe one is that surface's own error rather than the
 * page's.
 */
async function loadInvitationReview({ services, token }) {
    if (typeof token !== 'string') return {};
    const settled = await settle(() => reviewInvitation({ api: services, token }));
    if (settled.ok) return { invitationReview: settled.value };
    return {
        failures: {
            'invitation-accept': {
                code: settled.error?.code ?? null,
                state: settled.error?.ui === 'unauthorized' ? 'unauthorized' : 'error',
                title: 'This invitation could not be read',
                reason: settled.error?.reason
                    ?? 'The invitation link could not be checked. Ask for a new one.'
            }
        }
    };
}

/** Workspace-scoped reads that only an owner or an admin is entitled to make. */
const PRIVILEGED = Object.freeze(['owner', 'admin']);

/**
 * Ask the workspace everything the panel needs, and let each answer stand alone.
 *
 * Four independent reads, run together and settled independently. Together
 * because they do not depend on each other and a serial chain would make the
 * panel as slow as their sum; independently because a denial on one of them is
 * a fact about that surface and not about the other three — the member list
 * being refused says nothing at all about whether the activity log can be read.
 *
 * Nothing is asked that the current role is not entitled to ask. An editor's
 * invitation list would come back denied, and rendering that denial would be a
 * worse answer than the surface's own role-disabled explanation, which is
 * already correct and already says why.
 */
async function loadWorkspaceData({ services, context, session }) {
    if (context.status !== 'active') return {};
    const workspaceId = context.workspaceId;
    const role = context.workspace.role;
    const privileged = PRIVILEGED.includes(role);

    const data = {
        actor: {
            userId: session.userId,
            role,
            keyReady: context.workspace.keyReadiness === 'key_ready'
        },
        failures: {}
    };

    const [members, invitations, audit, readiness] = await Promise.all([
        settle(() => readMembers({ api: services, workspaceId })),
        privileged ? settle(() => services.listInvitations({ workspaceId })) : null,
        privileged ? settle(() => readAuditEvents({ api: services, workspaceId })) : null,
        settle(() => readKeyReadiness({ api: services, workspaceId }))
    ]);

    record(data, 'member-list-role-badge', members, page => { data.members = [...page.items]; });
    // A role that may not read these is not a failure and must not render as
    // one: the empty list lets each surface draw its own explained-disabled
    // state, which is what the contract asks for.
    if (invitations === null) data.invitations = [];
    else record(data, 'invitation-manage', invitations, page => {
        data.invitations = [...page.items];
    });
    if (audit === null) data.auditEvents = [];
    else record(data, 'audit-activity', audit, page => {
        data.auditEvents = [...page.items];
        data.auditCursor = page.nextCursor;
    });
    // Readiness is the one read whose failure is not worth a surface-wide error:
    // the device surface renders perfectly well without it, and it is the only
    // part of that surface a browser holding no enrolled key could show anyway.
    if (readiness.ok) data.keyReadiness = readiness.value.readiness;

    data.syncState = await deriveWorkspaceSyncState({ services, context, data });
    return data;
}

/** Run one read to a verdict rather than to an exception. */
async function settle(read) {
    try {
        return { ok: true, value: await read(), error: null };
    } catch (error) {
        return { ok: false, value: null, error };
    }
}

/** Apply a settled read: its value, or the reason there is none. */
function record(data, surface, settled, apply) {
    if (settled.ok) {
        apply(settled.value);
        return;
    }
    data.failures[surface] = {
        code: settled.error?.code ?? null,
        state: settled.error?.ui === 'unauthorized' ? 'unauthorized' : 'error',
        title: settled.error?.ui === 'unauthorized'
            ? 'Sign in to see this'
            : 'This section could not be loaded',
        reason: settled.error?.reason
            ?? 'The workspace could not be reached for this section. Nothing was changed.'
    };
}

/** The codes that could mean a membership ended, rather than a record missing. */
const REMOVAL_CANDIDATES = Object.freeze(['RESOURCE_NOT_FOUND', 'OPERATION_NOT_PERMITTED']);

/**
 * Which of the five sync states the open workspace is in.
 *
 * `Access removed` is the careful one and the reason this is a function rather
 * than a constant. The API answers the same non-disclosing code whether or not a
 * resource exists, precisely so a stranger cannot probe for workspaces — so the
 * state may not be inferred from a denial. It is claimed only after the
 * workspace list, which the caller is always entitled to read, comes back
 * without this workspace in it. A re-check that itself fails claims nothing.
 */
async function deriveWorkspaceSyncState({ services, context, data }) {
    // The code is carried from the read that was actually refused, never
    // supplied here: a state machine fed an invented input is not a state
    // machine, and `Access removed` is the one state that must not be guessable.
    const lastErrorCode = Object.values(data.failures)
        .map(failure => failure.code)
        .find(code => REMOVAL_CANDIDATES.includes(code)) ?? null;

    let membershipRecheck = null;
    if (lastErrorCode !== null) {
        try {
            const page = await services.listWorkspaces();
            membershipRecheck = {
                checked: true,
                activeMember: page.items
                    .some(item => item.workspaceId === context.workspaceId)
            };
        } catch {
            // Unknown is not removed. Claiming otherwise on a re-check that did
            // not complete would be exactly the disclosure the shared
            // non-disclosing denial code exists to prevent.
            membershipRecheck = null;
        }
    }

    return deriveSyncState({
        entries: [],
        online: true,
        transportAvailable: true,
        lastErrorCode,
        membershipRecheck
    }).state;
}

/**
 * Close collaboration and leave nothing behind.
 *
 * @param {Document} doc
 */
export function closeCollaboration(doc) {
    return unmountShell(doc);
}

export { SHELL_ROOT_ID };
