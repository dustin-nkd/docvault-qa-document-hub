// Conflict resolution dialog (CF-P7-010, surface 9). Gate UX U4 lives here.
//
// U4: a local draft is never lost to a conflict. It survives the dialog being
// dismissed, navigation away, and a full reload; it is discarded only by an
// explicit confirmed choice; and no automatic merge is ever performed.
//
// Two of those three are not this module's to implement, and that is the point.
//
// Survival across a reload is a property of the **outbox**, which holds the
// queued mutation encrypted in IndexedDB and quarantines rather than deletes on
// every authority change (CF-P6-006). A dialog that stashed its own copy would
// be a second, unreviewed persistence path for plaintext user work — exactly
// what the governing principle forbids. So this module *checks* that the draft
// is held and refuses to offer a discard when it cannot see one, rather than
// holding it.
//
// The four resolutions and the refusal to merge belong to CF-P6-007. This module
// presents them, keeps the confirmation honest, and manages focus.

import {
    RESOLUTION_OPTIONS, CONFLICT_STATES, resolveConflict, mergeConflict
} from './conflict-resolution.js';

export class ConflictDialogError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'ConflictDialogError';
        this.code = code;
    }
}

const fail = code => { throw new ConflictDialogError(code); };

/**
 * What each resolution does to the draft, said before it is chosen.
 *
 * `destroys` is the field that matters: exactly one option is true, and the
 * renderer uses it to decide which control needs a confirmation step.
 */
const OPTIONS = Object.freeze({
    'review-latest': {
        label: 'Review the latest version',
        consequence: 'Opens what is in the workspace now. Your draft is kept and nothing is sent.',
        destroys: false
    },
    'reapply-to-latest': {
        label: 'Reapply my changes',
        consequence: 'Puts your draft on top of the latest version so you can save it again. '
            + 'Nothing is merged for you.',
        destroys: false
    },
    'save-as-separate-copy': {
        label: 'Save mine as a separate document',
        consequence: 'Keeps both: the workspace version stays as it is, and your draft becomes '
            + 'a new document at revision 1.',
        destroys: false
    },
    'discard-with-confirmation': {
        label: 'Discard my draft',
        consequence: 'Throws your draft away and keeps the workspace version. This cannot be '
            + 'undone.',
        destroys: true
    }
});

/**
 * Describe the dialog.
 *
 * @param {{conflict: object, draftHeld: boolean, discardArmed?: boolean}} input
 */
export function conflictDialogModel({ conflict, draftHeld, discardArmed = false } = {}) {
    if (!conflict || !CONFLICT_STATES.includes(conflict.state)) fail('INVALID_CONFLICT');
    if (typeof draftHeld !== 'boolean') fail('DRAFT_HELD_REQUIRED');

    return Object.freeze({
        conflictId: conflict.conflictId,
        documentId: conflict.documentId,
        state: conflict.state,
        submittedBaseRevision: conflict.submittedBaseRevision,
        currentRevision: conflict.currentRevision,
        // Reported, not assumed. If the outbox does not hold the draft, the one
        // destructive option is withheld rather than offered on faith.
        draftHeld,
        draftRetained: conflict.draftRetained === true,
        discardArmed,
        options: Object.freeze(RESOLUTION_OPTIONS.map(option => Object.freeze({
            option,
            ...OPTIONS[option],
            // The destructive option needs arming first; the others never do.
            requiresConfirmation: OPTIONS[option].destroys,
            available: OPTIONS[option].destroys ? draftHeld : true
        }))),
        automaticMergeOffered: false
    });
}

/**
 * Dismissing is not a resolution.
 *
 * Closing the dialog leaves the conflict `unresolved` and the draft retained. A
 * dialog that resolved on dismissal would turn a stray Escape into a decision
 * about someone's unsaved work.
 *
 * @param {object} conflict
 */
export function dismissDialog(conflict) {
    if (!conflict || !CONFLICT_STATES.includes(conflict.state)) fail('INVALID_CONFLICT');
    return Object.freeze({
        conflictId: conflict.conflictId,
        state: conflict.state,
        resolved: false,
        draftRetained: true
    });
}

/**
 * Choose a resolution.
 *
 * Delegates to CF-P6-007 rather than reimplementing it, and refuses a discard
 * that has not been armed and confirmed — two separate acts, so no single click
 * destroys work.
 *
 * @param {{conflict: object, option: string, armed?: boolean, confirmed?: boolean,
 *          draftHeld: boolean, newDocumentId?: string, clientMutationId?: string}} input
 */
export function chooseResolution({ conflict, option, armed = false, confirmed = false,
    draftHeld, newDocumentId, clientMutationId } = {}) {
    if (!RESOLUTION_OPTIONS.includes(option)) fail('UNKNOWN_RESOLUTION');
    if (typeof draftHeld !== 'boolean') fail('DRAFT_HELD_REQUIRED');
    if (OPTIONS[option].destroys) {
        if (!draftHeld) fail('NO_DRAFT_TO_DISCARD');
        if (armed !== true) fail('DISCARD_NOT_ARMED');
        if (confirmed !== true) fail('DISCARD_NOT_CONFIRMED');
    }
    return resolveConflict(conflict, option, { confirmed, newDocumentId, clientMutationId });
}

/**
 * There is no automatic merge, and asking for one says so.
 *
 * Delegated so the refusal cannot be softened here while CF-P6-007 still holds.
 */
export function requestAutomaticMerge() {
    return mergeConflict();
}

/**
 * Build the dialog.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof conflictDialogModel>} model
 * @param {string} instanceId
 */
export function renderConflictDialog(doc, model, instanceId) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !Array.isArray(model.options)) fail('MODEL_REQUIRED');
    if (typeof instanceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(instanceId)) {
        fail('INSTANCE_ID_REQUIRED');
    }

    const root = doc.createElement('div');
    root.className = 'collab-conflict';
    root.setAttribute('data-collab-surface', 'conflict-dialog');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', `${instanceId}-conflict-title`);
    root.setAttribute('data-conflict-state', model.state);

    const title = doc.createElement('h2');
    title.className = 'collab-conflict__title';
    title.id = `${instanceId}-conflict-title`;
    title.textContent = 'Someone else changed this document';
    root.appendChild(title);

    const revisions = doc.createElement('p');
    revisions.className = 'collab-conflict__revisions';
    revisions.textContent = `You started from revision ${model.submittedBaseRevision}; `
        + `the workspace is now at revision ${model.currentRevision}.`;
    root.appendChild(revisions);

    // Said before any choice: the draft is safe until an explicit decision.
    const safety = doc.createElement('p');
    safety.className = 'collab-conflict__safety';
    safety.setAttribute('data-draft-held', model.draftHeld ? 'true' : 'false');
    safety.textContent = model.draftHeld
        ? 'Your draft is saved on this device. Closing this dialog, navigating away, or '
            + 'reloading will not lose it.'
        : 'Your draft is not on this device, so it cannot be discarded from here.';
    root.appendChild(safety);

    const list = doc.createElement('ul');
    list.className = 'collab-conflict__options';
    for (const item of model.options) {
        const row = doc.createElement('li');
        row.className = 'collab-conflict__option';
        row.setAttribute('data-resolution', item.option);
        if (item.destroys) row.setAttribute('data-destructive', 'true');

        const button = doc.createElement('button');
        button.type = 'button';
        button.className = `collab-conflict__choose collab-conflict__choose--${item.option}`;
        button.setAttribute('data-collab-action', item.option);
        button.textContent = item.destroys && !model.discardArmed
            ? item.label
            : (item.destroys ? 'Yes, discard my draft' : item.label);
        const consequenceId = `${instanceId}-consequence-${item.option}`;
        button.setAttribute('aria-describedby', consequenceId);
        if (!item.available) {
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
            button.setAttribute('title', 'There is no draft on this device to discard.');
        }
        row.appendChild(button);

        const consequence = doc.createElement('p');
        consequence.className = 'collab-conflict__consequence';
        consequence.id = consequenceId;
        consequence.textContent = item.consequence;
        row.appendChild(consequence);

        if (item.destroys && model.discardArmed) {
            const cancel = doc.createElement('button');
            cancel.type = 'button';
            cancel.className = 'collab-conflict__cancel-discard';
            cancel.setAttribute('data-collab-action', 'cancel-discard');
            cancel.textContent = 'Keep my draft';
            row.appendChild(cancel);
        }
        list.appendChild(row);
    }
    root.appendChild(list);

    const dismiss = doc.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'collab-conflict__dismiss';
    dismiss.setAttribute('data-collab-action', 'dismiss-conflict');
    dismiss.textContent = 'Close';
    root.appendChild(dismiss);
    return root;
}

/**
 * Move focus into the dialog, remembering where it came from.
 *
 * No focus trap: the contract prohibits one. Focus is *placed*, not fenced.
 *
 * @param {{root: Element, previouslyFocused: Element|null}} input
 */
export function focusDialog({ root, previouslyFocused = null } = {}) {
    if (!root || typeof root.querySelector !== 'function') fail('ROOT_REQUIRED');
    const first = root.querySelector('.collab-conflict__choose');
    if (first !== null && typeof first.focus === 'function') first.focus();
    return Object.freeze({ restoreTo: previouslyFocused });
}

/**
 * Put focus back where it was before the dialog opened.
 *
 * @param {{restoreTo: Element|null}} handle
 */
export function restoreFocus(handle) {
    const target = handle?.restoreTo;
    if (target !== null && target !== undefined && typeof target.focus === 'function') {
        target.focus();
        return true;
    }
    return false;
}
