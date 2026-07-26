// Audit activity (CF-P7-011, surface 10).
//
// The audit log is the one place where a workspace's history is legible, and it
// is also the place where a leak would be least noticed: a stray field rendered
// among fifteen legitimate ones does not look wrong.
//
// So this module does not render what it is given. It projects each event onto
// the frozen `AuditEventView` allow-list and **refuses** an event carrying
// anything outside it, rather than dropping the extra silently. A server that
// began returning free text, ciphertext, a token, or a stack would surface here
// as a refusal instead of as content on a page.
//
// That is a deliberate trade. A genuinely new field requires a contract change,
// and a contract change is exactly the moment this refusal should be noticed.

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Frozen by the API contract §4.6. Nothing else may be rendered. */
export const AUDIT_VIEW_FIELDS = Object.freeze([
    'eventId', 'workspaceId', 'schemaVersion', 'eventType', 'occurredAt', 'order',
    'requestId', 'actorUserId', 'deviceId', 'systemReason', 'targetType', 'targetId',
    'outcome', 'reasonCode', 'approvedBefore', 'approvedAfter', 'linkedEventId'
]);

/** The only three filters the route accepts. There is no content query. */
export const AUDIT_FILTERS = Object.freeze(['eventType', 'occurredFrom', 'occurredTo']);

export class AuditActivityError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'AuditActivityError';
        this.code = code;
    }
}

const fail = code => { throw new AuditActivityError(code); };
const allow = () => Object.freeze({ allowed: true, reason: null });
const deny = reason => Object.freeze({ allowed: false, reason });

/**
 * Who may read the audit log.
 *
 * Owner and Admin only. An editor or viewer still **sees** this surface — the
 * contract forbids hiding a restricted surface — but the control is disabled
 * with the reason stated.
 *
 * @param {{actorRole: string}} input
 */
export function auditAccessDecision({ actorRole } = {}) {
    if (!['owner', 'admin', 'editor', 'viewer'].includes(actorRole)) fail('INVALID_ROLE');
    if (actorRole === 'owner' || actorRole === 'admin') return allow();
    return deny('Only an owner or admin can read the workspace activity log.');
}

/**
 * Keep an event to the allow-list, and refuse anything else.
 *
 * @param {object} event
 */
export function projectAuditEvent(event) {
    if (!event || typeof event !== 'object') fail('INVALID_AUDIT_EVENT');
    for (const key of Object.keys(event)) {
        // Refused, not dropped: a field nobody expected is a signal, and
        // silently discarding it would waste the only warning available.
        if (!AUDIT_VIEW_FIELDS.includes(key)) fail('UNEXPECTED_AUDIT_FIELD');
    }
    if (!UUID_V4.test(event.eventId ?? '')) fail('INVALID_AUDIT_EVENT');
    if (typeof event.eventType !== 'string' || event.eventType.length === 0) {
        fail('INVALID_AUDIT_EVENT');
    }
    if (typeof event.outcome !== 'string' || event.outcome.length === 0) {
        fail('INVALID_AUDIT_EVENT');
    }
    const projected = {};
    for (const key of AUDIT_VIEW_FIELDS) {
        if (event[key] !== undefined) projected[key] = event[key];
    }
    return Object.freeze(projected);
}

/**
 * Narrow the filters to the three the route accepts.
 *
 * @param {object} filters
 */
export function narrowFilters(filters = {}) {
    if (filters === null || typeof filters !== 'object') fail('INVALID_FILTERS');
    for (const key of Object.keys(filters)) {
        // A content query would turn an audit log into a search index over
        // things the contract says the server never stores in the clear.
        if (!AUDIT_FILTERS.includes(key)) fail('UNSUPPORTED_FILTER');
    }
    const narrowed = {};
    for (const key of AUDIT_FILTERS) {
        if (filters[key] !== undefined) narrowed[key] = filters[key];
    }
    return Object.freeze(narrowed);
}

/**
 * Describe the surface.
 *
 * @param {{actorRole: string, events: ReadonlyArray<object>, nextCursor?: string|null,
 *          state?: string}} input
 */
export function auditActivityModel({ actorRole, events, nextCursor = null,
    state = 'ready' } = {}) {
    if (!Array.isArray(events)) fail('EVENTS_REQUIRED');
    const access = auditAccessDecision({ actorRole });
    const projected = access.allowed ? events.map(projectAuditEvent) : [];
    return Object.freeze({
        state,
        actorRole,
        access,
        events: Object.freeze(projected),
        // Empty is its own state: a young workspace has little history, and that
        // is not an error.
        isEmpty: access.allowed && projected.length === 0,
        // Opaque and HMAC-bound by CF-P6-005: carried, never built.
        nextCursor,
        canPaginate: access.allowed && typeof nextCursor === 'string' && nextCursor.length > 0
    });
}

/**
 * Build the nodes.
 *
 * @param {Document} doc
 * @param {ReturnType<typeof auditActivityModel>} model
 * @param {string} instanceId
 */
export function renderAuditActivity(doc, model, instanceId) {
    if (!doc || typeof doc.createElement !== 'function') fail('DOCUMENT_REQUIRED');
    if (!model || !Array.isArray(model.events)) fail('MODEL_REQUIRED');
    if (typeof instanceId !== 'string' || !/^[a-z0-9-]{1,40}$/.test(instanceId)) {
        fail('INSTANCE_ID_REQUIRED');
    }

    const root = doc.createElement('section');
    root.className = 'collab-audit';
    root.setAttribute('data-collab-surface', 'audit-activity');
    root.setAttribute('data-collab-action', 'list-audit-events');

    const heading = doc.createElement('h2');
    heading.className = 'collab-audit__heading';
    heading.textContent = 'Activity';
    root.appendChild(heading);

    if (!model.access.allowed) {
        const reason = doc.createElement('p');
        reason.className = 'collab-audit__reason';
        reason.id = `${instanceId}-audit-reason`;
        reason.textContent = model.access.reason;
        root.appendChild(reason);
    }

    const list = doc.createElement('ol');
    list.className = 'collab-audit__list';
    for (const event of model.events) {
        const row = doc.createElement('li');
        row.className = 'collab-audit__row';
        row.setAttribute('data-event-type', event.eventType);
        row.setAttribute('data-outcome', event.outcome);

        const shape = doc.createElement('span');
        shape.className = `collab-audit__shape collab-audit__shape--${event.outcome}`;
        shape.setAttribute('aria-hidden', 'true');
        row.appendChild(shape);

        const type = doc.createElement('span');
        type.className = 'collab-audit__type';
        type.textContent = event.eventType;
        row.appendChild(type);

        const when = doc.createElement('time');
        when.className = 'collab-audit__when';
        when.setAttribute('datetime', String(event.occurredAt));
        when.textContent = String(event.occurredAt);
        row.appendChild(when);

        const outcome = doc.createElement('span');
        outcome.className = 'collab-audit__outcome';
        outcome.textContent = event.outcome;
        row.appendChild(outcome);

        if (event.reasonCode !== undefined) {
            const reasonCode = doc.createElement('span');
            reasonCode.className = 'collab-audit__reason-code';
            reasonCode.textContent = event.reasonCode;
            row.appendChild(reasonCode);
        }
        list.appendChild(row);
    }
    root.appendChild(list);

    const more = doc.createElement('button');
    more.type = 'button';
    more.className = 'collab-audit__more';
    more.setAttribute('data-collab-action', 'paginate');
    more.textContent = 'Show older activity';
    if (!model.canPaginate) {
        more.disabled = true;
        more.setAttribute('aria-disabled', 'true');
        const why = model.access.allowed
            ? 'There is no older activity to show.'
            : model.access.reason;
        more.setAttribute('title', why);
        more.setAttribute('aria-describedby', `${instanceId}-audit-reason`);
        if (model.access.allowed) {
            const note = doc.createElement('p');
            note.className = 'collab-audit__reason';
            note.id = `${instanceId}-audit-reason`;
            note.textContent = why;
            root.appendChild(note);
        }
    }
    root.appendChild(more);
    return root;
}

/**
 * Read a page of audit events.
 *
 * @param {{api: object, workspaceId: string, cursor?: string, filters?: object}} input
 */
export async function readAuditEvents({ api, workspaceId, cursor, filters } = {}) {
    if (!api || typeof api.listAuditEvents !== 'function') fail('API_REQUIRED');
    if (!UUID_V4.test(workspaceId ?? '')) fail('INVALID_WORKSPACE');
    const page = await api.listAuditEvents({
        workspaceId, cursor, filters: narrowFilters(filters ?? {})
    });
    if (!page || !Array.isArray(page.items)) fail('AUDIT_PAGE_INVALID');
    return Object.freeze({
        items: Object.freeze(page.items.map(projectAuditEvent)),
        nextCursor: page.nextCursor ?? null
    });
}
