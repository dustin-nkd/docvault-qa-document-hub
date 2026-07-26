// Which workspace the user is in, and making sure they always know.
//
// Gate UX U2 has two halves that are easy to conflate. The visible half is that
// the active workspace is identifiable on every collaboration surface without
// opening a menu. The harder half is that it "survives reload and
// back-navigation rather than silently defaulting" — so when the remembered
// workspace is no longer available, this module refuses to quietly pick another
// one. Silently landing the user in a different workspace than the one they left
// is exactly the failure U2 exists to prevent, and it is worse than showing
// nothing, because the user may then act on the wrong data believing it is theirs.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENVIRONMENTS = Object.freeze(['local', 'preview', 'production']);

/** How the resolver can answer. Every one is an explicit, renderable state. */
export const CONTEXT_STATUSES = Object.freeze([
    'active',       // a remembered, still-available workspace
    'none-selected',// workspaces exist, none chosen yet
    'unavailable',  // one was remembered and is no longer reachable
    'empty'         // the account belongs to no workspace
]);

export class WorkspaceContextError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'WorkspaceContextError';
        this.code = code;
    }
}

const fail = code => { throw new WorkspaceContextError(code); };

/**
 * Storage key for the active-workspace selection.
 *
 * Scoped by environment and subject and nothing else: the selection is *which*
 * workspace, so it cannot be keyed by workspace. Two accounts sharing a browser
 * get separate keys, and preview can never inherit production's choice.
 *
 * @param {{environment: string, subject: string}} input
 */
export function selectionKey({ environment, subject } = {}) {
    if (!ENVIRONMENTS.includes(environment)) fail('INVALID_ENVIRONMENT');
    if (typeof subject !== 'string' || subject.trim().length === 0) fail('INVALID_SUBJECT');
    return ['docvault', 'collab', environment, subject, 'active-workspace'].join(':');
}

/**
 * Decide the context from what was remembered and what is actually available.
 *
 * @param {{remembered: string|null,
 *          workspaces: ReadonlyArray<{workspaceId: string, displayName: string, role: string}>}} input
 */
export function resolveContext({ remembered, workspaces } = {}) {
    if (!Array.isArray(workspaces)) fail('WORKSPACES_REQUIRED');
    for (const workspace of workspaces) {
        if (!UUID_V4.test(workspace?.workspaceId ?? '')) fail('INVALID_WORKSPACE');
    }
    if (workspaces.length === 0) {
        return Object.freeze({ status: 'empty', workspaceId: null, workspace: null });
    }
    if (remembered === null || remembered === undefined) {
        return Object.freeze({ status: 'none-selected', workspaceId: null, workspace: null });
    }
    if (typeof remembered !== 'string' || !UUID_V4.test(remembered)) fail('INVALID_WORKSPACE');
    const match = workspaces.find(workspace => workspace.workspaceId === remembered);
    if (match === undefined) {
        // Deliberately not a fallback to workspaces[0].
        return Object.freeze({ status: 'unavailable', workspaceId: remembered, workspace: null });
    }
    return Object.freeze({ status: 'active', workspaceId: match.workspaceId, workspace: match });
}

/**
 * Read and write the remembered selection. The storage object is injected so
 * this stays testable and can never reach for a Personal Vault key by accident.
 *
 * @param {{storage: Storage, environment: string, subject: string}} input
 */
export function createWorkspaceSelection({ storage, environment, subject } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        fail('STORAGE_UNAVAILABLE');
    }
    const key = selectionKey({ environment, subject });
    return Object.freeze({
        key,
        read() {
            let value = null;
            try {
                value = storage.getItem(key);
            } catch {
                // A blocked or full store must not break the surface; an
                // unreadable selection is the same as no selection.
                return null;
            }
            return typeof value === 'string' && UUID_V4.test(value) ? value : null;
        },
        write(workspaceId) {
            if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
            try {
                storage.setItem(key, workspaceId);
                return true;
            } catch {
                return false;
            }
        },
        clear() {
            try {
                storage.removeItem(key);
                return true;
            } catch {
                return false;
            }
        }
    });
}

/**
 * The label shown in the always-visible context indicator.
 *
 * Never returns an empty string: a blank indicator is indistinguishable from a
 * missing one, and U2 requires the user to always know where they are.
 *
 * @param {ReturnType<typeof resolveContext>} context
 */
export function contextLabel(context) {
    if (!context || !CONTEXT_STATUSES.includes(context.status)) fail('INVALID_CONTEXT');
    switch (context.status) {
        case 'active': return context.workspace.displayName;
        case 'none-selected': return 'No workspace selected';
        case 'unavailable': return 'Workspace unavailable';
        default: return 'No workspaces';
    }
}
