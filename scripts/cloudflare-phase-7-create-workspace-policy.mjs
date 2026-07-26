const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['create-workspace']);
export const STEPS = Object.freeze(['name-workspace', 'bootstrap-key', 'create']);
export const STATUSES = Object.freeze([
    'naming', 'binding', 'sealing', 'creating', 'created', 'failed'
]);
/**
 * The two codes this journey demonstrably cannot produce.
 *
 * Named rather than derived because it is a claim about these two routes, not
 * arithmetic: a create has no base revision to conflict against and addresses no
 * existing resource. The rest of the unreachable set is the complement of the
 * reachable one and is computed below — CF-P7-016 took the taxonomy from twelve
 * to twenty-nine, and a hand-maintained list of the other seventeen would be a
 * copy that rots rather than a decision anybody made.
 */
export const NOT_PRODUCIBLE = Object.freeze(['DOCUMENT_REVISION_CONFLICT', 'RESOURCE_NOT_FOUND']);
export const NAME_REASONS = Object.freeze([
    'required', 'too-long', 'untrimmed', 'control-character'
]);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/**
 * Strip comments before asserting a construct is *absent*.
 *
 * This module documents what it must never do, so a naive search finds the
 * prohibition rather than a violation and fails a correct file.
 */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7CreateWorkspace({ manifest, contract, journeySource, journeyExports,
    styleSource, indexHtml, serviceWorker, serverSource, unitTestSource }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-004' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G2A' && manifest.next_gate === 'P7-G2B'
        && manifest.authorizes_on_approval === 'CF-P7-005',
    'Unsupported Phase 7 create workspace manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'create-workspace');
    assert(surface?.owner === 'CF-P7-004',
        'Surface create-workspace is not owned by CF-P7-004 in the frozen contract');
    assert(same(surface.actions || [], ['name-workspace', 'bootstrap-key', 'create']),
        'The journey no longer performs the actions the frozen contract gives this surface');

    // ── the ordering rule the protocol depends on ────────────────────────────
    const journey = manifest.journey || {};
    assert(same(journey.steps || [], STEPS), 'The journey step set drifted');
    assert(same(journey.statuses || [], STATUSES), 'The journey status set drifted');
    for (const key of ['intent_precedes_key_material', 'single_idempotency_key_for_both_calls',
        'retry_reuses_original_key', 'workspace_id_derived_by_server',
        'binding_device_compared_before_sealing',
        'created_workspace_id_compared_before_selection']) {
        assert(journey[key] === true, `The journey claim drifted: ${key}`);
    }
    assert(journey.automatic_retry === false, 'The journey may now retry a create on its own');
    assert(typeof journey.rationale === 'string' && journey.rationale.length > 120,
        'The ordering and idempotency rationale was dropped');

    // Structural: intent, then sealing, then create — in that order in the code.
    // Anchored on the call sites, not the names: the guard clause at the top of
    // the journey mentions all three and would otherwise be matched instead.
    const intentAt = journeyCode.indexOf('api.createBootstrapIntent({');
    const sealAt = journeyCode.indexOf('keys.sealCreatorEnvelope({');
    const createAt = journeyCode.indexOf('api.createWorkspace({');
    assert(intentAt > -1 && sealAt > -1 && createAt > -1,
        'The journey no longer performs all three calls');
    assert(intentAt < sealAt,
        'Key material is generated before the bootstrap intent returns its binding');
    assert(sealAt < createAt, 'The workspace is created before its creator envelope is sealed');

    // Structural: exactly one place mints a request key, and both calls use it.
    const minted = (journeyCode.match(/newIdempotencyKey\(\)/g) || []).length;
    assert(minted === 1,
        `A second idempotency key can be minted: ${minted} call sites, expected 1`);
    // Checked at the two call sites rather than by counting occurrences: the key
    // also travels in the returned result, so a global count proves nothing.
    assert(/idempotencyKey: requestKey/.test(journeyCode.slice(intentAt, sealAt)),
        'The bootstrap intent no longer sends the shared idempotency key');
    assert(/idempotencyKey: requestKey/.test(journeyCode.slice(createAt, createAt + 400)),
        'The create no longer sends the same idempotency key as the intent');
    assert(/typeof idempotencyKey === 'string'/.test(journeyCode),
        'A resumed attempt no longer reuses the caller-supplied original key');
    assert(!/randomUUID/.test(journeyCode),
        'The journey mints its own identifier instead of using the one the server derived');
    assert(/BINDING_DEVICE_MISMATCH/.test(journeySource),
        'The envelope may now be sealed to a device the server did not bind');
    assert(/WORKSPACE_ID_MISMATCH/.test(journeySource),
        'A created workspace id is no longer compared before it becomes the selection');
    assert(/selection\.write\(/.test(journeyCode),
        'The new workspace no longer becomes the active selection');

    // ── the name rule, mirrored but not authoritative ────────────────────────
    const rule = manifest.name_rule || {};
    // The upper bound is not repeated here. It is read out of the server file
    // below and compared, so this gate cannot become a third copy of a number
    // that then disagrees with the rule it is supposed to be mirroring.
    assert(rule.min_code_points === 1, 'The workspace name lower bound drifted');
    assert(rule.counts_code_points_not_utf16_units === true,
        'The name check may now count UTF-16 units and reject names the server allows');
    assert(rule.server_remains_the_authority === true,
        'The client name check claims to be authoritative');
    assert(same(rule.reasons || [], NAME_REASONS), 'The name rejection reason set drifted');
    assert(/\[\.\.\.value\]\.length/.test(journeyCode),
        'The name length check stopped counting code points');
    const serverBound = serverSource.match(/displayLength\s*<\s*1\s*\|\|\s*displayLength\s*>\s*(\d+)/);
    assert(serverBound !== null && Number(serverBound[1]) === rule.max_code_points,
        'The mirrored name bound no longer matches the server it mirrors');
    for (const reason of NAME_REASONS) {
        assert(journeySource.includes(`'${reason}'`),
            `The name check cannot report ${reason}`);
    }

    // ── preconditions, stated rather than discovered on submit ───────────────
    const preconditions = manifest.preconditions || {};
    assert(preconditions.requires_active_own_device === true,
        'The device precondition was dropped');
    assert(preconditions.blocked_control_hidden === false
        && preconditions.blocked_control_states_reason === true
        && preconditions.blocked_control_offers_device_journey === true,
    'A control the user cannot use may now be hidden instead of explained');
    assert(preconditions.unknown_session_does_not_render_signed_out === true,
        'An unknown session may now be rendered as signed out');
    assert(preconditions.fails_only_on_submit === false,
        'The submit control may now look enabled and fail on submit');
    assert(/aria-disabled/.test(journeySource) && /'title'/.test(journeySource),
        'A disabled submit no longer states its reason');
    assert(/device-setup-open/.test(journeySource),
        'A blocked-on-device user is no longer offered the device journey');
    assert(/collab-create__blocked/.test(styleSource),
        'The blocked explanation has no style hook');
    for (const state of ['done', 'active', 'pending', 'stopped']) {
        assert(styleSource.includes(`collab-create__shape--${state}`),
            `Step state ${state} has no shape, leaving colour as the only signal`);
    }

    // ── error taxonomy ───────────────────────────────────────────────────────
    //
    // The taxonomy is the frozen contract's, read from it rather than copied
    // here. CF-P7-016 corrected §4 from twelve codes to the full server catalog,
    // and a second copy in this file is exactly what let the first one be wrong
    // for as long as it was.
    const taxonomy = (contract.error_mapping || []).map(row => row.code);
    assert(taxonomy.length > 0, 'The frozen contract carries no error mapping to compare against');
    const mapping = manifest.error_mapping || {};
    // Compared against the frozen contract itself, value for value. A paraphrase
    // of the mapping would pass a text search and still present the wrong thing.
    const presentation = exported.PRESENTATION_BY_CODE || {};
    const reachable = exported.CREATE_WORKSPACE_CODES || [];
    assert(same(Object.keys(presentation), taxonomy),
        'The presentation table no longer covers exactly the frozen taxonomy');
    for (const row of contract.error_mapping || []) {
        assert(presentation[row.code] === row.ui,
            `The journey presents ${row.code} as ${presentation[row.code]}, `
            + `but the frozen contract says ${row.ui}`);
    }

    // The subset these two routes can return is the declared one; everything
    // else in the taxonomy is unreachable here by construction, not by list.
    // The claims about the subset come before the arithmetic about it, so a
    // drifted set is reported as the decision it broke rather than as a count.
    for (const codeName of reachable) {
        assert(taxonomy.includes(codeName),
            `${codeName} is declared reachable but is not in the frozen taxonomy`);
    }
    for (const codeName of NOT_PRODUCIBLE) {
        assert(!reachable.includes(codeName),
            `${codeName} became reachable on a surface that cannot produce it`);
    }
    const unreachable = taxonomy.filter(codeName => !reachable.includes(codeName));
    assert(mapping.codes_mapped === taxonomy.length,
        'The error mapping no longer covers the frozen taxonomy');
    assert(mapping.reachable_codes === reachable.length, 'The reachable code count drifted');
    assert(same(mapping.unreachable_codes || [], unreachable),
        'The unreachable code set drifted');
    assert(mapping.unexpected_code_reported_not_flattened === true
        && mapping.every_code_explains_itself === true,
    'The error mapping claim drifted');
    assert(exported.NAME_RULE?.maxCodePoints === rule.max_code_points,
        'The exported name bound disagrees with the manifest');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'generates_own_uuid', 'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The create journey reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The create journey renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode),
        'The create journey performs its own transport instead of going through a service');
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
