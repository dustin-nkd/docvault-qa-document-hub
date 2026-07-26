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
    workspaces = [], storage, environment, subject } = {}) {
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
    container.replaceChildren(chrome);

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
 * Close collaboration and leave nothing behind.
 *
 * @param {Document} doc
 */
export function closeCollaboration(doc) {
    return unmountShell(doc);
}

export { SHELL_ROOT_ID };
