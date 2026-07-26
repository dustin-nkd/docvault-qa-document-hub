const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const SURFACES = Object.freeze(['account-menu', 'workspace-switcher', 'create-workspace',
    'device-key-initialization', 'member-list-role-badge', 'invitation-manage',
    'invitation-accept', 'sync-state', 'conflict-dialog', 'audit-activity',
    'base-states', 'github-pages-banner']);

export const SYNC_STATES = Object.freeze(['Saved', 'Saving', 'Offline', 'Conflict',
    'Access removed']);

export const BASE_STATES = Object.freeze(['empty', 'loading', 'unauthorized', 'error']);

export const ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);

/** Codes the contract must presentation-map, drawn from the frozen server taxonomy. */
export const REQUIRED_CODES = Object.freeze(['UNAUTHENTICATED', 'OPERATION_NOT_PERMITTED',
    'RECENT_AUTHENTICATION_REQUIRED', 'DOCUMENT_REVISION_CONFLICT', 'KEY_VERSION_MISMATCH',
    'IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_WINDOW_EXPIRED', 'RESOURCE_NOT_FOUND',
    'RATE_LIMITED', 'COLLABORATION_UNAVAILABLE', 'VALIDATION_FAILED', 'CSRF_REJECTED']);

/** Pull an exported frozen string array out of a source file. */
function frozenArray(source, name) {
    const match = source.match(new RegExp(`${name}\\s*=\\s*Object\\.freeze\\(\\[([^\\]]*)\\]`));
    if (match === null) return null;
    return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

export function validatePhase7Contract({ contract, contractSource, plan,
    conflictSource, outboxSource, documentServiceSource }) {
    assert(contract?.schema_version === 1 && contract.phase === 'CF-P7'
        && contract.story === 'CF-P7-001' && contract.status === 'FROZEN'
        && contract.exit_gate === 'P7-G1', 'Unsupported Phase 7 UI contract');
    assert(typeof contract.amendment_rule === 'string' && contract.amendment_rule.length > 80,
        'A frozen contract must state how it may be amended');

    // Surfaces agree with the sprint plan; ownership is total and single.
    const surfaces = contract.surfaces || [];
    assert(same(surfaces.map(item => item.id), SURFACES), 'The contract surface inventory drifted');
    const planOwners = new Map((plan.surfaces || []).map(item => [item.id, item.owner]));
    for (const surface of surfaces) {
        assert(planOwners.get(surface.id) === surface.owner,
            `Surface ${surface.id} has a different owner in the contract and the plan`);
        assert(Array.isArray(surface.base_states) && surface.base_states.length >= 1,
            `Surface ${surface.id} declares no base state`);
        for (const state of surface.base_states) {
            assert(BASE_STATES.includes(state),
                `Surface ${surface.id} declares an unknown base state: ${state}`);
        }
        assert(Array.isArray(surface.roles) && surface.roles.length >= 1
            && surface.roles.every(role => ROLES.includes(role)),
        `Surface ${surface.id} declares an unknown role`);
        assert(Array.isArray(surface.actions) && surface.actions.length >= 1,
            `Surface ${surface.id} declares no action`);
    }

    // The sync model is a closed five-state machine with reachable transitions.
    const machine = contract.sync_state_machine || {};
    assert(same(machine.states || [], SYNC_STATES), 'The sync state set drifted');
    assert(machine.initial === 'Saved', 'The sync machine must start Saved');
    assert(same(machine.terminal || [], ['Access removed']),
        'Access removed must be the only terminal sync state');
    for (const state of SYNC_STATES) {
        assert(typeof machine.sources?.[state] === 'string' && machine.sources[state].length > 20,
            `Sync state ${state} has no defined source`);
    }
    const transitions = machine.transitions || [];
    for (const transition of transitions) {
        assert(SYNC_STATES.includes(transition.from) && SYNC_STATES.includes(transition.to),
            'A sync transition references an unknown state');
        assert(transition.from !== 'Access removed',
            'Access removed is terminal and may not transition onward');
    }
    // Every non-initial state must be reachable, or it is decoration.
    for (const state of SYNC_STATES.filter(item => item !== 'Saved')) {
        assert(transitions.some(transition => transition.to === state),
            `Sync state ${state} is unreachable`);
    }
    assert((machine.rules || []).length >= 3, 'The sync machine dropped its governing rules');

    // Every frozen server code has exactly one presentation, and all explain.
    const mapping = contract.error_mapping || [];
    assert(same(mapping.map(item => item.code), REQUIRED_CODES),
        'The error mapping does not cover the frozen server taxonomy exactly');
    for (const entry of mapping) {
        assert(typeof entry.ui === 'string' && entry.ui.length > 0,
            `Code ${entry.code} maps to nothing`);
        assert(entry.explains_reason === true,
            `Code ${entry.code} is presented without an explanation`);
    }
    assert(mapping.find(item => item.code === 'DOCUMENT_REVISION_CONFLICT')?.ui === 'Conflict',
        'A revision conflict must present as the Conflict sync state');

    // Inherited vocabularies must equal what the Phase 6 code actually exports.
    const inherited = contract.inherited_vocabularies || {};
    const resolutions = frozenArray(conflictSource, 'RESOLUTION_OPTIONS');
    const conflictStates = frozenArray(conflictSource, 'CONFLICT_STATES');
    const outboxStates = frozenArray(outboxSource, 'STATES');
    assert(resolutions && conflictStates && outboxStates,
        'Could not read the Phase 6 vocabularies to compare against');
    assert(same(inherited.conflict_resolutions || [], resolutions),
        'The contract conflict resolutions diverge from the implementation');
    assert(same(inherited.conflict_states || [], conflictStates),
        'The contract conflict states diverge from the implementation');
    assert(same(inherited.outbox_states || [], outboxStates),
        'The contract outbox states diverge from the implementation');
    assert(same(inherited.roles || [], ROLES), 'The contract role set drifted');
    for (const code of ['DOCUMENT_REVISION_CONFLICT', 'KEY_VERSION_MISMATCH']) {
        assert(documentServiceSource.includes(`'${code}'`),
            `The contract maps ${code}, which the document service does not raise`);
    }

    // Accessibility and responsive floors may not be lowered.
    const a11y = contract.accessibility || {};
    assert(a11y.standard === 'WCAG 2.2 AA', 'The accessibility standard regressed');
    assert(a11y.focus_visible_required === true && a11y.focus_indicator_min_contrast >= 3,
        'The focus indicator requirement regressed');
    assert(a11y.focus_trap_permitted === false, 'Focus traps were permitted');
    assert(a11y.dialog_focus_moved_on_open === true && a11y.dialog_focus_restored_on_close === true,
        'Dialog focus management regressed');
    assert(a11y.state_signalled_by_colour_alone === false, 'Colour-only state was permitted');
    assert(typeof a11y.disabled_control_pattern === 'string'
        && /reason/i.test(a11y.disabled_control_pattern),
    'The disabled-control pattern no longer requires a stated reason');

    const responsive = contract.responsive || {};
    assert(responsive.minimum_width_px === 320, 'The minimum supported width regressed');
    assert(responsive.horizontal_page_scroll_permitted === false,
        'Horizontal page scroll was permitted');
    assert(responsive.clipped_or_overlapping_controls_permitted === false,
        'Clipped or overlapping controls were permitted');

    const separation = contract.separation || {};
    assert(separation.personal_record_on_workspace_surface === 'prohibited'
        && separation.workspace_record_on_personal_surface === 'prohibited',
    'The personal and workspace separation rule was weakened');
    assert(separation.collaboration_modules_on_personal_startup === 0
        && separation.personal_writes_from_collaboration_path === 0,
    'The personal startup and write isolation budgets were weakened');
    assert(separation.active_workspace_visible_on_every_workspace_surface === true
        && separation.active_workspace_survives_reload === true,
    'The workspace identity requirement was weakened');

    // The written contract must actually document what it freezes.
    for (const surface of SURFACES) {
        const name = surfaces.find(item => item.id === surface);
        assert(name !== undefined, `Surface ${surface} vanished`);
    }
    for (const state of SYNC_STATES) {
        assert(contractSource.includes(`**${state}**`),
            `Sync state ${state} is frozen but undocumented`);
    }
    for (const code of REQUIRED_CODES) {
        assert(contractSource.includes(`\`${code}\``),
            `Code ${code} is mapped but undocumented`);
    }
    return true;
}
