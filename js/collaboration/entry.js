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
    storage, environment, subject, loadWorkspaces } = {}) {
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

    // The surfaces validate what they render and refuse a record that does not
    // match the contract — a workspace ID that is not the shape the server
    // issues, for instance. That refusal is correct and must stay loud, but it
    // must not surface as a shell left on `loading` forever, which is precisely
    // the failure this story exists to remove. So it lands as an error state
    // with a reason, and the refusal itself is re-thrown to nobody's console but
    // preserved in the state the user can see.
    try {
        return openCollaboration({
            document: doc,
            deployment,
            session: {
                authenticated: true,
                login: resolved.user?.login,
                avatarUrl: resolved.user?.avatarUrl
            },
            workspaces,
            storage,
            environment,
            subject: subject ?? resolved.user?.userId
        });
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
 * Close collaboration and leave nothing behind.
 *
 * @param {Document} doc
 */
export function closeCollaboration(doc) {
    return unmountShell(doc);
}

export { SHELL_ROOT_ID };
