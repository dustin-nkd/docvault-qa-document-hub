// The four base states every collaboration surface must be able to render,
// frozen by CF-P7-001 §2: empty, loading, unauthorized, error.
//
// Split deliberately in two. `baseStateModel` is pure and decides *what* is
// shown, so it can be tested without a DOM; `renderBaseState` builds nodes and
// decides nothing. The contract forbids signalling state by colour alone, so
// every model carries a text label and a distinct shape, and the renderer never
// takes an HTML string — text goes in through textContent, never innerHTML.

/** @typedef {'empty'|'loading'|'unauthorized'|'error'} BaseState */

export const BASE_STATES = Object.freeze(['empty', 'loading', 'unauthorized', 'error']);

const SHAPES = Object.freeze({
    empty: 'square',
    loading: 'spinner',
    unauthorized: 'lock',
    error: 'triangle'
});

// `polite` for states the user caused, `assertive` only where the user is
// blocked and would otherwise keep typing into something that cannot save.
const LIVE = Object.freeze({
    empty: 'polite',
    loading: 'polite',
    unauthorized: 'assertive',
    error: 'assertive'
});

const BUSY = Object.freeze({ empty: false, loading: true, unauthorized: false, error: false });

export class BaseStateError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'BaseStateError';
        this.code = code;
    }
}

const fail = code => { throw new BaseStateError(code); };

const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;

/**
 * Describe one base state for one surface.
 *
 * `reason` is required for `unauthorized` and `error`: the contract says every
 * denial explains itself, and a state that cannot say why is the failure mode
 * this whole story exists to prevent.
 *
 * @param {{state: BaseState, surface: string, title: string, reason?: string,
 *          action?: {label: string, id: string}}} input
 */
export function baseStateModel(input) {
    const state = input?.state;
    if (!BASE_STATES.includes(state)) fail('UNKNOWN_BASE_STATE');
    if (!isNonEmptyString(input.surface)) fail('SURFACE_REQUIRED');
    if (!isNonEmptyString(input.title)) fail('TITLE_REQUIRED');
    if ((state === 'unauthorized' || state === 'error') && !isNonEmptyString(input.reason)) {
        fail('REASON_REQUIRED');
    }
    if (input.action !== undefined
        && !(isNonEmptyString(input.action.label) && isNonEmptyString(input.action.id))) {
        fail('ACTION_INCOMPLETE');
    }
    return Object.freeze({
        state,
        surface: input.surface,
        title: input.title,
        reason: isNonEmptyString(input.reason) ? input.reason : null,
        shape: SHAPES[state],
        live: LIVE[state],
        busy: BUSY[state],
        action: input.action === undefined
            ? null
            : Object.freeze({ label: input.action.label, id: input.action.id })
    });
}

/**
 * Build the nodes for a model. Takes a document so it is testable against any
 * DOM implementation and cannot reach for a global.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof baseStateModel>} model
 */
export function renderBaseState(doc, model) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !BASE_STATES.includes(model.state)) fail('UNKNOWN_BASE_STATE');

    const root = doc.createElement('div');
    root.className = `collab-state collab-state--${model.state}`;
    root.setAttribute('data-collab-state', model.state);
    root.setAttribute('data-collab-surface', model.surface);
    root.setAttribute('data-shape', model.shape);
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', model.live);
    if (model.busy) root.setAttribute('aria-busy', 'true');

    // The shape is decorative; the label below carries the meaning, so screen
    // readers must not hear it twice.
    const shape = doc.createElement('span');
    shape.className = `collab-state__shape collab-state__shape--${model.shape}`;
    shape.setAttribute('aria-hidden', 'true');
    root.appendChild(shape);

    const title = doc.createElement('p');
    title.className = 'collab-state__title';
    title.textContent = model.title;
    root.appendChild(title);

    if (model.reason !== null) {
        const reason = doc.createElement('p');
        reason.className = 'collab-state__reason';
        reason.textContent = model.reason;
        root.appendChild(reason);
    }

    if (model.action !== null) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'collab-state__action';
        button.textContent = model.action.label;
        button.setAttribute('data-collab-action', model.action.id);
        root.appendChild(button);
    }

    return root;
}
