const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['sync-state']);
export const STATES = Object.freeze(['saved', 'saving', 'offline', 'conflict', 'access-removed']);
export const RECOVERY = Object.freeze(['expired', 'quarantined']);
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function validatePhase7Sync({ manifest, contract, journeySource, styleSource,
    indexHtml, serviceWorker, unitTestSource, journeyExports }) {
    const journeyCode = code(journeySource);
    const exported = journeyExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-009' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3A' && manifest.next_gate === 'P7-G3B'
        && manifest.authorizes_on_approval === 'CF-P7-010',
    'Unsupported Phase 7 sync manifest');

    assert(same(manifest.surfaces || [], SURFACES), 'The owned surface set drifted');
    const surface = (contract.surfaces || []).find(item => item.id === 'sync-state');
    assert(surface?.owner === 'CF-P7-009',
        'Surface sync-state is not owned by CF-P7-009 in the frozen contract');

    // ── exactly five, and the frozen five ────────────────────────────────────
    const machine = manifest.machine || {};
    assert(same(machine.states || [], STATES), 'The sync state set drifted');
    assert(machine.count === 5 && machine.sixth_state_defined === false,
        'A sixth sync state was introduced');
    assert(same(machine.terminal || [], ['access-removed']), 'The terminal set drifted');
    assert(machine.distinct_shape_per_state === true && machine.state_by_colour_alone === false,
        'A state may now be signalled by colour alone');
    assert(machine.conflict_left_automatically === false,
        'Conflict may now be left without an explicit resolution');
    // The rendered set is compared to the frozen contract's own list.
    const contractStates = (contract.sync_state_machine?.states || [])
        .map(state => state.toLowerCase().replace(/\s+/g, '-'));
    assert(same(contractStates, STATES),
        'The frozen contract no longer lists exactly these five states');
    assert(same(exported.SYNC_STATES || [], STATES),
        'The module exposes a state set other than the frozen one');
    const shapes = new Set(STATES.map(state => exported.presentSyncState?.(state)?.shape));
    assert(shapes.size === STATES.length, 'Two states share a shape, leaving colour to tell them apart');
    for (const state of STATES) {
        assert(styleSource.includes(`collab-sync--${state}`)
            || styleSource.includes(`collab-sync__shape--${exported.presentSyncState(state).shape}`),
        `State ${state} has no style hook`);
    }

    // ── the non-disclosure rule ──────────────────────────────────────────────
    const removed = manifest.access_removed || {};
    assert(removed.requires_denial === true
        && removed.requires_completed_membership_recheck === true
        && removed.recovery_is_reentry_not_retry === true,
    'The access-removed claim drifted');
    assert(removed.claimable_from_status_code_alone === false,
        'Access removed may now be claimed from a status code, which leaks resource existence');
    assert(typeof removed.rationale === 'string' && removed.rationale.length > 200,
        'The non-disclosure rationale was dropped');
    const derive = exported.deriveSyncState;
    assert(typeof derive === 'function', 'The derivation was not provided');
    for (const lastErrorCode of ['RESOURCE_NOT_FOUND', 'OPERATION_NOT_PERMITTED']) {
        assert(derive({ entries: [], lastErrorCode }).state !== 'access-removed',
            `A bare ${lastErrorCode} now claims access removal`);
        assert(derive({ entries: [], lastErrorCode,
            membershipRecheck: { checked: false, activeMember: false } }).state !== 'access-removed',
        'An unfinished membership re-check now claims access removal');
        assert(derive({ entries: [], lastErrorCode,
            membershipRecheck: { checked: true, activeMember: true } }).state !== 'access-removed',
        'A confirmed membership now claims access removal');
        assert(derive({ entries: [], lastErrorCode,
            membershipRecheck: { checked: true, activeMember: false } }).state === 'access-removed',
        'A confirmed removal no longer reaches the terminal state');
    }
    assert(/membershipRecheck\.checked === true/.test(journeyCode),
        'The membership re-check is no longer required before claiming removal');
    assert(derive({ entries: [{ state: 'inflight' }], lastErrorCode: 'RESOURCE_NOT_FOUND',
        membershipRecheck: { checked: true, activeMember: false } }).state === 'access-removed',
    'A busy queue now outranks a terminal state');

    // ── the outbox is a different axis ───────────────────────────────────────
    const axis = manifest.outbox_axis || {};
    assert(axis.outbox_state_count === 6, 'The outbox state count drifted');
    assert(same(axis.recovery_situations || [], RECOVERY), 'The recovery situation set drifted');
    assert(axis.recovery_flattened_into_error === false,
        'A recovery situation may now be flattened into an error');
    assert(axis.second_vocabulary_defined === false, 'A second outbox vocabulary was defined');
    assert(/from '\.\/outbox\.js'/.test(journeySource),
        'The outbox vocabulary is no longer reused from CF-P6-006');
    for (const situation of RECOVERY) {
        assert(!STATES.includes(situation), `${situation} became a sync state`);
    }
    assert(derive({ entries: [{ state: 'quarantined' }] }).state === 'saved',
        'A quarantined entry is now treated as pending work');
    assert(typeof exported.recoverySituations === 'function'
        && exported.recoverySituations([{ state: 'expired' }]).length === 1,
    'Recovery situations are no longer reported separately');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'network_call_in_module']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!journeyCode.includes(key), `The sync surface reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(journeyCode), 'The sync surface renders through innerHTML');
    assert(!/\bfetch\s*\(/.test(journeyCode), 'The sync surface performs its own transport');
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
