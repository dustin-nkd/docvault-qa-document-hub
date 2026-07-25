// CF-P6-007 — Conflict resolution and Copy to workspace (ADR-006, ADR-007).
//
// Two user-facing decisions live here, and both are deliberately manual.
//
// Conflict: when the server rejects a write with DOCUMENT_REVISION_CONFLICT the
// local encrypted draft is retained and the user chooses one of exactly four
// actions. There is no automatic merge in Foundation, and no path silently
// discards a draft — discard requires explicit confirmation.
//
// Copy to workspace: a one-time, unlinked copy of a Personal Vault document into
// a workspace. The personal source is never mutated, later edits do not
// synchronise, and stored Credential documents are refused BEFORE the
// destination encryption step.
//
// Accessibility: every state exposes a text label and a shape token alongside
// any tone the interface may choose. Nothing here encodes meaning in colour
// alone, so a colour-blind or high-contrast user reads the same information.

export const RESOLUTION_OPTIONS = Object.freeze([
    'review-latest',
    'reapply-to-latest',
    'save-as-separate-copy',
    'discard-with-confirmation'
]);

export const CONFLICT_STATES = Object.freeze(['unresolved', 'reviewing', 'resolved', 'discarded']);

// Categories a workspace copy accepts. Credentials are excluded by contract.
export const COPY_INELIGIBLE_CATEGORIES = Object.freeze(['credential']);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_REVISION = 9_007_199_254_740_991;

export class ConflictError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'ConflictError';
        this.code = code;
    }
}

/** @param {string} code @returns {never} */
const fail = (code) => { throw new ConflictError(code); };

/** @param {unknown} value @param {string} code @returns {string} */
function requireUuid(value, code) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail(code);
    return /** @type {string} */ (value);
}

/** @param {unknown} value @param {string} code @returns {number} */
function requireRevision(value, code) {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > MAX_REVISION) fail(code);
    return Number(value);
}

/** @param {unknown} value @param {string} code @returns {Uint8Array} */
function requireBytes(value, code) {
    if (!(value instanceof Uint8Array) || value.length === 0) fail(code);
    return /** @type {Uint8Array} */ (value);
}

/**
 * Accessible status descriptors. `tone` is advisory for styling; `label` and
 * `shape` carry the meaning, so status is never conveyed by colour alone.
 */
export const RESOLUTION_STATUS = Object.freeze({
    unresolved: Object.freeze({ label: 'Conflict — your draft is safe', shape: 'alert-triangle', tone: 'warning' }),
    reviewing: Object.freeze({ label: 'Reviewing the latest version', shape: 'eye', tone: 'info' }),
    resolved: Object.freeze({ label: 'Resolved', shape: 'check', tone: 'success' }),
    discarded: Object.freeze({ label: 'Draft discarded', shape: 'trash', tone: 'neutral' })
});

/**
 * @typedef {object} ConflictRecord
 * @property {string} conflictId
 * @property {string} documentId
 * @property {number} submittedBaseRevision
 * @property {number} currentRevision
 * @property {Uint8Array} draft
 * @property {'unresolved'|'reviewing'|'resolved'|'discarded'} state
 * @property {string|null} chosenOption
 * @property {boolean} draftRetained
 * @property {number} openedAt
 */

/**
 * Open a conflict from a server rejection. The draft is retained from this
 * moment until the user completes an explicit action; nothing here can drop it.
 *
 * @param {{ conflictId?: string, documentId?: string, submittedBaseRevision?: number,
 *   currentRevision?: number, draft?: Uint8Array, now?: number }} input
 * @returns {ConflictRecord}
 */
export function openConflict(input) {
    const source = input ?? {};
    const submitted = requireRevision(source.submittedBaseRevision, 'INVALID_BASE_REVISION');
    const current = requireRevision(source.currentRevision, 'INVALID_CURRENT_REVISION');
    // A conflict means the server moved ahead; equal revisions are not a conflict.
    if (current <= submitted) fail('NOT_A_CONFLICT');
    return {
        conflictId: requireUuid(source.conflictId, 'INVALID_CONFLICT_ID'),
        documentId: requireUuid(source.documentId, 'INVALID_DOCUMENT'),
        submittedBaseRevision: submitted,
        currentRevision: current,
        draft: requireBytes(source.draft, 'INVALID_DRAFT'),
        state: 'unresolved',
        chosenOption: null,
        draftRetained: true,
        openedAt: Number.isInteger(source.now) ? Number(source.now) : 0
    };
}

/**
 * Apply one of the four resolutions.
 *
 * `review-latest` and `reapply-to-latest` keep the draft. `save-as-separate-copy`
 * turns it into a new document at revision 1. `discard-with-confirmation` is the
 * only path that drops it, and it refuses without an explicit confirmation flag,
 * so a stray click cannot destroy work.
 *
 * @param {ConflictRecord} conflict
 * @param {string} option
 * @param {{ confirmed?: boolean, newDocumentId?: string, clientMutationId?: string }} [options]
 */
export function resolveConflict(conflict, option, options = {}) {
    if (!conflict || !CONFLICT_STATES.includes(conflict.state)) fail('INVALID_CONFLICT');
    if (conflict.state === 'resolved' || conflict.state === 'discarded') fail('CONFLICT_ALREADY_RESOLVED');
    if (!RESOLUTION_OPTIONS.includes(option)) fail('UNKNOWN_RESOLUTION');

    if (option === 'review-latest') {
        // Reviewing is not resolving: the draft stays and the user may still pick
        // any other option afterwards.
        return {
            ...conflict,
            state: 'reviewing',
            chosenOption: option,
            draftRetained: true,
            intent: null
        };
    }

    if (option === 'reapply-to-latest') {
        return {
            ...conflict,
            state: 'resolved',
            chosenOption: option,
            draftRetained: true,
            intent: {
                kind: 'reapply',
                documentId: conflict.documentId,
                operation: 'update',
                // Rebased onto what the server actually holds now.
                baseRevision: conflict.currentRevision,
                expectedRevision: conflict.currentRevision + 1,
                clientMutationId: requireUuid(options.clientMutationId, 'INVALID_MUTATION_ID')
            }
        };
    }

    if (option === 'save-as-separate-copy') {
        return {
            ...conflict,
            state: 'resolved',
            chosenOption: option,
            draftRetained: true,
            intent: {
                kind: 'separate-copy',
                documentId: requireUuid(options.newDocumentId, 'INVALID_DOCUMENT'),
                operation: 'create',
                baseRevision: 0,
                expectedRevision: 1,
                clientMutationId: requireUuid(options.clientMutationId, 'INVALID_MUTATION_ID')
            }
        };
    }

    // discard-with-confirmation
    if (options.confirmed !== true) fail('CONFIRMATION_REQUIRED');
    return {
        ...conflict,
        state: 'discarded',
        chosenOption: option,
        draftRetained: false,
        intent: null
    };
}

/** No automatic merge exists in Foundation. Kept explicit so it cannot creep in. */
export function mergeConflict() {
    return fail('AUTOMATIC_MERGE_PROHIBITED');
}

// ------------------------------------------------------------ copy ---------

export const COPY_STATUS = Object.freeze({
    eligible: Object.freeze({ label: 'Can be copied to a workspace', shape: 'check', tone: 'success' }),
    ineligible: Object.freeze({ label: 'Cannot be copied', shape: 'blocked', tone: 'danger' })
});

/**
 * Copy eligibility, evaluated on the DECRYPTED personal document before any
 * destination encryption happens.
 *
 * ADR-007 records the residual risk this cannot close: the API cannot inspect an
 * encrypted category, so a malicious authorized client could still submit one.
 * This is the official client's guarantee, not a server guarantee.
 *
 * @param {{ id?: string, category?: string }} document
 */
export function assessCopyEligibility(document) {
    const source = document ?? {};
    if (typeof source.category !== 'string' || source.category.length === 0) {
        return Object.freeze({
            eligible: false, reason: 'UNKNOWN_CATEGORY', selectable: false, status: COPY_STATUS.ineligible
        });
    }
    if (COPY_INELIGIBLE_CATEGORIES.includes(source.category)) {
        return Object.freeze({
            eligible: false,
            reason: 'CREDENTIAL_NOT_COPYABLE',
            // Not merely rejected on submit: it must not be offered at all.
            selectable: false,
            status: COPY_STATUS.ineligible
        });
    }
    return Object.freeze({
        eligible: true, reason: null, selectable: true, status: COPY_STATUS.eligible
    });
}

/**
 * Build a one-time copy intent. Refuses a Credential before any encryption step,
 * and never touches the source: the returned intent carries a fresh document id,
 * a fresh mutation id, and revision 1.
 *
 * @param {{ source?: { id?: string, category?: string }, destinationWorkspaceId?: string,
 *   destinationRole?: string, keyReady?: boolean, newDocumentId?: string,
 *   clientMutationId?: string, confirmedClassification?: boolean }} input
 */
export function prepareWorkspaceCopy(input) {
    const request = input ?? {};
    const eligibility = assessCopyEligibility(request.source ?? {});
    // Ordering matters: the category check runs before anything that would
    // encrypt for the destination.
    if (!eligibility.eligible) fail(eligibility.reason ?? 'COPY_NOT_ELIGIBLE');

    if (!['owner', 'admin', 'editor'].includes(String(request.destinationRole))) {
        fail('DESTINATION_ROLE_NOT_PERMITTED');
    }
    if (request.keyReady !== true) fail('DESTINATION_NOT_KEY_READY');
    // The user must see and accept the data-classification consequence.
    if (request.confirmedClassification !== true) fail('CLASSIFICATION_CONFIRMATION_REQUIRED');

    return Object.freeze({
        kind: 'copy-to-workspace',
        sourceDocumentId: requireUuid(request.source?.id, 'INVALID_DOCUMENT'),
        sourceMutated: false,
        linked: false,
        destinationWorkspaceId: requireUuid(request.destinationWorkspaceId, 'INVALID_WORKSPACE'),
        destinationDocumentId: requireUuid(request.newDocumentId, 'INVALID_DOCUMENT'),
        operation: 'create',
        baseRevision: 0,
        expectedRevision: 1,
        clientMutationId: requireUuid(request.clientMutationId, 'INVALID_MUTATION_ID'),
        encryptForDestination: true
    });
}

/**
 * Repeating a completed copy returns the original result rather than creating a
 * second destination document.
 *
 * @param {Map<string, unknown>} completed keyed by client mutation id
 * @param {{ clientMutationId: string }} intent
 */
export function resolveCopyReplay(completed, intent) {
    const previous = completed?.get(intent?.clientMutationId);
    return previous === undefined
        ? Object.freeze({ replayed: false, result: null })
        : Object.freeze({ replayed: true, result: previous });
}

export const CONFLICT_CONTRACT = Object.freeze({
    options: RESOLUTION_OPTIONS,
    automaticMerge: false,
    silentDiscard: false,
    discardRequiresConfirmation: true,
    statusConveyedByColourAlone: false
});
