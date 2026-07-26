// The lazy collaboration shell.
//
// Nothing in js/collaboration/ may be reachable from Personal startup: the
// Phase 7 budget is zero collaboration modules evaluated for a user who never
// opens collaboration. This module is therefore only ever reached through a
// dynamic import triggered by an explicit user action, and it must never be
// added to index.html as a script tag or to the service worker precache.
//
// The shell owns mounting and the four base states. It owns no data: it holds
// no personal record, and it refuses to mount at all where the deployment
// cannot support collaboration.

import { baseStateModel, renderBaseState } from './base-states.js';

export const SHELL_ROOT_ID = 'collaboration-root';

export class ShellError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'ShellError';
        this.code = code;
    }
}

const fail = code => { throw new ShellError(code); };

/**
 * Why the shell may refuse to mount, in the order the reasons are checked.
 * `deployment-unsupported` is first because it is the only one the user cannot
 * resolve from inside the app.
 */
export const REFUSAL_REASONS = Object.freeze([
    'deployment-unsupported',
    'container-missing'
]);

/**
 * Decide whether the shell may mount, without touching the DOM.
 *
 * Availability is a property of the deployment. A signed-out visitor on
 * Cloudflare is still allowed to mount; the shell then renders `unauthorized`,
 * which is a different and more useful message than "not available here".
 *
 * @param {{available: boolean, reason: string}} deployment
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function mountDecision(deployment) {
    if (deployment === null || typeof deployment !== 'object'
        || typeof deployment.available !== 'boolean') {
        fail('DEPLOYMENT_VERDICT_REQUIRED');
    }
    return deployment.available
        ? Object.freeze({ allowed: true, reason: null })
        : Object.freeze({ allowed: false, reason: 'deployment-unsupported' });
}

/**
 * Render one base state into the shell container, replacing whatever was there.
 *
 * @param {Document} doc
 * @param {{state: string, surface: string, title: string, reason?: string,
 *          action?: {label: string, id: string}}} input
 */
export function showState(doc, input) {
    if (!doc || typeof doc.getElementById !== 'function') fail('DOCUMENT_REQUIRED');
    const container = doc.getElementById(SHELL_ROOT_ID);
    if (container === null) fail('CONTAINER_MISSING');
    const node = renderBaseState(doc, baseStateModel(input));
    container.replaceChildren(node);
    return node;
}

/**
 * Mount the shell. Returns the mounted container, or null when the deployment
 * cannot support collaboration — the banner owned by the app shell has already
 * explained that case, so the shell stays silent rather than adding a second
 * message saying the same thing.
 *
 * @param {{document: Document, deployment: {available: boolean, reason: string}}} input
 */
export function mountShell(input) {
    const doc = input?.document;
    if (!doc || typeof doc.getElementById !== 'function') fail('DOCUMENT_REQUIRED');
    const decision = mountDecision(input.deployment);
    if (!decision.allowed) return null;

    const container = doc.getElementById(SHELL_ROOT_ID);
    if (container === null) fail('CONTAINER_MISSING');
    container.hidden = false;
    container.setAttribute('data-collab-mounted', 'true');
    showState(doc, {
        state: 'loading',
        surface: 'base-states',
        title: 'Loading your workspaces'
    });
    return container;
}

/**
 * Unmount and clear. Clearing on unmount is not tidiness: the shell must not
 * leave workspace-scoped content in the document once the user leaves the
 * collaboration context, or a later Personal render could show it.
 *
 * @param {Document} doc
 */
export function unmountShell(doc) {
    if (!doc || typeof doc.getElementById !== 'function') fail('DOCUMENT_REQUIRED');
    const container = doc.getElementById(SHELL_ROOT_ID);
    if (container === null) return false;
    container.replaceChildren();
    container.hidden = true;
    container.removeAttribute('data-collab-mounted');
    return true;
}
