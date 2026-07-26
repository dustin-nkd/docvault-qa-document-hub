const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['audit-activity']);
export const ACTIONS = Object.freeze(['list-audit-events', 'paginate']);
export const FILTERS = Object.freeze(['eventType', 'occurredFrom', 'occurredTo']);
/** Things an audit row must never be able to carry. */
export const FORBIDDEN_FIELDS = Object.freeze(['freeText', 'ciphertext', 'token', 'secret',
    'stack', 'sql', 'documentTitle', 'plaintext']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Audit({ manifest, contract, journeySource, styleSource,
    indexHtml, serviceWorker, apiContract, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-011' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3C' && manifest.next_gate === 'P7-G3D'
        && manifest.authorizes_on_approval === 'CF-P7-012',
    'Unsupported Phase 7 audit manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'audit-activity');
    assert(surface?.owner === 'CF-P7-011',
        'Surface audit-activity is not owned by CF-P7-011 in the frozen contract');
    assert(same(surface.actions || [], ACTIONS),
        'The surface no longer performs the actions the frozen contract gives it');
    assert(same(surface.roles || [], ['owner', 'admin']),
        'The surface role restriction drifted from the frozen contract');

    // ── the allow-list ───────────────────────────────────────────────────────
    const allowList = manifest.allow_list || {};
    assert(allowList.field_count === 17, 'The audit field allow-list count drifted');
    assert(allowList.unexpected_field_refused === true
        && allowList.unexpected_field_silently_dropped === false,
    'An unexpected audit field may now be dropped silently');
    assert(typeof allowList.rationale === 'string' && allowList.rationale.length > 200,
        'The reason unexpected fields are refused was dropped');
    // Compared against the contract's own list rather than a copy of it.
    const declared = apiContract.slice(apiContract.indexOf('`AuditEventView` contains only:'));
    const opens = declared.indexOf('```text');
    const closes = opens === -1 ? -1 : declared.indexOf('```', opens + 7);
    const block = opens === -1 || closes === -1 ? '' : declared.slice(opens + 7, closes);
    const contractFields = block.match(/[a-zA-Z]+/g) || [];
    assert(contractFields.length > 0, 'The API contract no longer declares the audit allow-list');
    assert(same(exported.AUDIT_VIEW_FIELDS || [], contractFields),
        'The rendered audit fields drifted from the frozen AuditEventView');

    const project = exported.projectAuditEvent;
    assert(typeof project === 'function', 'The projection was not provided');
    const sample = exported.sampleEvent;
    assert(sample !== undefined, 'A sample event was not provided');
    assert(project(sample).eventType === sample.eventType, 'The projection drops known fields');
    for (const field of FORBIDDEN_FIELDS) {
        let refused = null;
        try { project({ ...sample, [field]: 'x' }); } catch (error) { refused = error.code; }
        assert(refused === 'UNEXPECTED_AUDIT_FIELD',
            `An audit row carrying ${field} is no longer refused`);
    }

    // ── the filters ──────────────────────────────────────────────────────────
    const filters = manifest.filters || {};
    assert(same(filters.supported || [], FILTERS), 'The audit filter set drifted');
    assert(filters.content_query_supported === false
        && filters.unsupported_filter_refused === true,
    'A content query over the audit log may now be issued');
    const narrow = exported.narrowFilters;
    assert(typeof narrow === 'function', 'The filter narrowing was not provided');
    for (const key of ['q', 'search', 'text', 'contains']) {
        let refused = null;
        try { narrow({ [key]: 'x' }); } catch (error) { refused = error.code; }
        assert(refused === 'UNSUPPORTED_FILTER', `Filter ${key} is no longer refused`);
    }

    // ── authority ────────────────────────────────────────────────────────────
    const authority = manifest.authority || {};
    assert(same(authority.roles || [], ['owner', 'admin']), 'The audit role set drifted');
    assert(authority.restricted_surface_hidden === false
        && authority.denied_control_states_reason === true,
    'A restricted surface may now be hidden instead of explained');
    assert(authority.events_exposed_to_denied_role === 0,
        'Events may now be exposed to a role that cannot read them');
    assert(authority.enforced_here === false && authority.server_remains_the_authority === true,
        'The client claims to enforce authorization');
    const decide = exported.auditAccessDecision;
    assert(typeof decide === 'function', 'The access decision was not provided');
    for (const actorRole of ['editor', 'viewer']) {
        const decision = decide({ actorRole });
        assert(decision.allowed === false, `${actorRole} may now read the audit log`);
        assert(typeof decision.reason === 'string' && decision.reason.length >= 10,
            `${actorRole} is denied without a reason`);
    }
    const model = exported.auditActivityModel;
    assert(model({ actorRole: 'viewer', events: [sample] }).events.length === 0,
        'A denied role now receives audit events in its model');
    assert(model({ actorRole: 'viewer', events: [], nextCursor: 'opaque' }).canPaginate === false,
        'A denied role may now paginate');

    // ── pagination ───────────────────────────────────────────────────────────
    const pagination = manifest.pagination || {};
    assert(pagination.cursor_opaque === true
        && pagination.cursor_constructed_client_side === false
        && pagination.exhausted_and_denied_explained_differently === true,
    'The pagination claim drifted');
    assert(/aria-disabled/.test(journeySource) && /aria-describedby/.test(journeySource),
        'The paginate control no longer states its reason');
    assert(/\$\{instanceId\}-/.test(journeySource),
        'Reason ids are no longer scoped to the rendered instance');
    assert(/collab-audit__shape--/.test(styleSource),
        'Audit outcome has no shape, leaving colour as the only signal');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The audit surface reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The audit surface renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The audit surface performs its own transport');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');

    const tests = manifest.tests || {};
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(tests.unit_count === actual,
        `Unit test inventory drifted: manifest says ${tests.unit_count}, suite has ${actual}`);
    assert(typeof tests.policy === 'string', 'The story ships without a policy suite');
    return true;
}
