// Sync state (CF-P7-009, surface 8).
//
// Exactly five user-visible states, frozen by CF-P7-001 §3: Saved, Saving,
// Offline, Conflict, Access removed. There is no sixth, and none of them is a
// synonym for a generic error.
//
// The shape mismatch this module has to absorb rather than paper over: the
// outbox has six internal states and this model has five, and they are not the
// same axis. `expired` and `quarantined` are not sync states — they are recovery
// situations, and flattening them into an error would hide a queue that needs a
// person to look at it.
//
// The hardest rule is `Access removed`. The API is deliberately non-disclosing:
// `RESOURCE_NOT_FOUND` comes back whether or not the resource exists, precisely
// so a stranger cannot probe for workspaces. Claiming "your access was removed"
// from that status code alone would undo it — the message itself would confirm
// the resource exists. So this state may only be claimed after a membership
// re-check says the user is no longer an active member, and the derivation
// refuses to produce it on any weaker evidence.

import { OUTBOX_STATES } from './outbox.js';

/** The five, in the order the contract lists them. */
export const SYNC_STATES = Object.freeze([
    'saved', 'saving', 'offline', 'conflict', 'access-removed'
]);

/** Terminal for the open document: recovery is re-entry, never an in-place retry. */
export const TERMINAL_SYNC_STATES = Object.freeze(['access-removed']);

/**
 * Outbox situations that are not sync states.
 *
 * Surfaced separately so a queue needing attention is visible rather than
 * collapsed into the word "error".
 */
export const RECOVERY_SITUATIONS = Object.freeze(['expired', 'quarantined']);

export class SyncStateError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'SyncStateError';
        this.code = code;
    }
}

const fail = code => { throw new SyncStateError(code); };

const PRESENTATION = Object.freeze({
    saved: {
        label: 'Saved', shape: 'check', live: 'polite', busy: false, terminal: false,
        detail: 'Everything on this document has reached the workspace.'
    },
    saving: {
        label: 'Saving', shape: 'spinner', live: 'polite', busy: true, terminal: false,
        detail: 'Changes are on their way to the workspace.'
    },
    offline: {
        label: 'Offline', shape: 'cloud-slash', live: 'polite', busy: false, terminal: false,
        detail: 'Changes are queued on this device and will be sent when the connection returns.'
    },
    conflict: {
        label: 'Conflict', shape: 'diamond', live: 'assertive', busy: false, terminal: false,
        detail: 'Someone else changed this document. Choose how to resolve it — nothing is '
            + 'merged automatically and your draft is kept.'
    },
    'access-removed': {
        label: 'Access removed', shape: 'lock', live: 'assertive', busy: false, terminal: true,
        detail: 'You are no longer a member of this workspace. Re-entry is through the '
            + 'workspace switcher; retrying here will not help.'
    }
});

/**
 * Decide the sync state from evidence.
 *
 * Order matters and is not arbitrary. `Access removed` is checked first because
 * it is terminal — a removed member whose queue also happens to be mid-flight is
 * not "Saving". `Conflict` outranks the queue for the same reason: it needs an
 * explicit choice, and showing "Saving" over it would suggest waiting is enough.
 *
 * @param {{entries: ReadonlyArray<{state: string}>, online?: boolean,
 *          transportAvailable?: boolean, lastErrorCode?: string|null,
 *          membershipRecheck?: {checked: boolean, activeMember: boolean}|null}} input
 */
export function deriveSyncState({ entries, online = true, transportAvailable = true,
    lastErrorCode = null, membershipRecheck = null } = {}) {
    if (!Array.isArray(entries)) fail('ENTRIES_REQUIRED');
    for (const entry of entries) {
        if (!OUTBOX_STATES.includes(entry?.state)) fail('UNKNOWN_OUTBOX_STATE');
    }

    // Access removed: a denial is not enough on its own. The API returns the
    // same non-disclosing code whether or not the resource exists, so this state
    // requires a completed membership re-check that says the user is out.
    const denied = lastErrorCode === 'RESOURCE_NOT_FOUND'
        || lastErrorCode === 'OPERATION_NOT_PERMITTED';
    if (denied && membershipRecheck !== null && membershipRecheck.checked === true
        && membershipRecheck.activeMember === false) {
        return present('access-removed');
    }

    if (lastErrorCode === 'DOCUMENT_REVISION_CONFLICT') return present('conflict');

    const pending = entries.filter(entry => entry.state === 'queued' || entry.state === 'inflight');
    if (!transportAvailable || (online === false && pending.length > 0)) return present('offline');
    if (pending.length > 0) return present('saving');
    return present('saved');
}

function present(state) {
    if (!SYNC_STATES.includes(state)) fail('UNKNOWN_SYNC_STATE');
    return Object.freeze({ state, ...PRESENTATION[state] });
}

/** The presentation of one state, without deriving it. */
export function presentSyncState(state) {
    return present(state);
}

/**
 * Outbox entries that need a person, reported separately from the sync state.
 *
 * @param {ReadonlyArray<{state: string, reason?: string}>} entries
 */
export function recoverySituations(entries) {
    if (!Array.isArray(entries)) fail('ENTRIES_REQUIRED');
    const found = entries.filter(entry => RECOVERY_SITUATIONS.includes(entry?.state));
    return Object.freeze(found.map(entry => Object.freeze({
        state: entry.state,
        detail: entry.state === 'expired'
            ? 'A queued change is too old to send. It is kept, not discarded, and needs a '
                + 'decision before it can be retried.'
            : 'A queued change was quarantined after the account, workspace, or device changed. '
                + 'It is kept, not discarded.'
    })));
}

/**
 * Whether leaving this state is possible in place.
 *
 * @param {string} state
 */
export function isTerminal(state) {
    if (!SYNC_STATES.includes(state)) fail('UNKNOWN_SYNC_STATE');
    return TERMINAL_SYNC_STATES.includes(state);
}

/**
 * Build the indicator.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof deriveSyncState>} model
 * @param {ReadonlyArray<object>} [recovery]
 */
export function renderSyncState(doc, model, recovery = []) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !SYNC_STATES.includes(model.state)) fail('MODEL_REQUIRED');

    const root = doc.createElement('div');
    root.className = `collab-sync collab-sync--${model.state}`;
    root.setAttribute('data-collab-surface', 'sync-state');
    root.setAttribute('data-sync-state', model.state);
    root.setAttribute('data-collab-action', 'announce-state');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', model.live);
    if (model.busy) root.setAttribute('aria-busy', 'true');
    if (model.terminal) root.setAttribute('data-terminal', 'true');

    // Shape carries the state as well as the label, so nothing depends on colour.
    const shape = doc.createElement('span');
    shape.className = `collab-sync__shape collab-sync__shape--${model.shape}`;
    shape.setAttribute('aria-hidden', 'true');
    root.appendChild(shape);

    const label = doc.createElement('span');
    label.className = 'collab-sync__label';
    label.textContent = model.label;
    root.appendChild(label);

    const detail = doc.createElement('p');
    detail.className = 'collab-sync__detail';
    detail.textContent = model.detail;
    root.appendChild(detail);

    for (const situation of recovery) {
        const node = doc.createElement('p');
        node.className = `collab-sync__recovery collab-sync__recovery--${situation.state}`;
        node.setAttribute('data-recovery', situation.state);
        node.textContent = situation.detail;
        root.appendChild(node);
    }
    return root;
}
