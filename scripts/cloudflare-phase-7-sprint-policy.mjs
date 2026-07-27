const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const STORY_IDS = Object.freeze(['CF-P7-001', 'CF-P7-002', 'CF-P7-003', 'CF-P7-004',
    'CF-P7-005', 'CF-P7-006', 'CF-P7-007', 'CF-P7-008', 'CF-P7-009', 'CF-P7-010',
    'CF-P7-011', 'CF-P7-012', 'CF-P7-013', 'CF-P7-014',
    'CF-P7-015', 'CF-P7-016', 'CF-P7-017']);

/** The twelve requested surfaces. Dropping one is a scope change, not a detail. */
export const SURFACES = Object.freeze(['account-menu', 'workspace-switcher', 'create-workspace',
    'device-key-initialization', 'member-list-role-badge', 'invitation-manage',
    'invitation-accept', 'sync-state', 'conflict-dialog', 'audit-activity',
    'base-states', 'github-pages-banner']);

export const SYNC_STATES = Object.freeze(['Saved', 'Saving', 'Offline', 'Conflict',
    'Access removed']);

export const BASE_STATES = Object.freeze(['empty', 'loading', 'unauthorized', 'error']);

export const GATE_UX = Object.freeze(['U1', 'U2', 'U3', 'U4', 'U5', 'U6']);

export const PROHIBITED = Object.freeze(['collaboration_activation', 'production_identity',
    'server_visible_plaintext', 'automatic_merge', 'automatic_personal_upload',
    'personal_provider_fallback', 'silent_draft_discard',
    'reimplementing_phase_6_services_in_ui']);

export function validatePhase7Sprint({ plan, sprintSource, phase6Exit }) {
    assert(plan?.schema_version === 2 && plan.phase === 'CF-P7',
        'Unsupported Phase 7 sprint plan');
    assert(phase6Exit?.status === 'PASS' && phase6Exit.exit_gate_granted === true,
        'Phase 7 cannot be planned while Phase 6 is open');

    const stories = plan.stories || [];
    assert(same(stories.map(story => story.id), STORY_IDS), 'Phase 7 story inventory drifted');
    assert(plan.story_count === STORY_IDS.length && stories.length === STORY_IDS.length,
        'The declared story count does not match the story inventory');
    for (const story of stories) {
        assert(typeof story.entry_gate === 'string' && typeof story.exit_gate === 'string',
            `${story.id} is missing an entry or exit gate`);
        assert(Array.isArray(story.evidence) && story.evidence.length >= 1,
            `${story.id} names no evidence`);
    }

    // Unbroken chain: no story starts before its predecessor closed. Two kinds
    // of story sit outside it and must say so. CF-P7-013 enters at the separate
    // remote gate. CF-P7-016 and CF-P7-017 were opened after the phase had
    // already run past the gates they touch — one re-opens the frozen contract
    // gate, one is a server story a UI phase turned out to need — so they are
    // excluded from the linear chain and owe a reason for it instead.
    const outOfSequence = stories.filter(story => story.out_of_sequence === true);
    for (const story of outOfSequence) {
        assert(typeof story.out_of_sequence_reason === 'string'
            && story.out_of_sequence_reason.length > 80,
        `${story.id} sits outside the gate chain without saying why`);
    }
    const sequenced = stories.filter(story => story.out_of_sequence !== true);
    for (let index = 1; index < sequenced.length; index += 1) {
        const previous = sequenced[index - 1];
        const current = sequenced[index];
        if (current.id === 'CF-P7-013') continue;
        assert(current.entry_gate === previous.exit_gate,
            `Gate chain broken between ${previous.id} and ${current.id}`);
    }
    const sequence = plan.gate_sequence || [];
    for (const story of stories) {
        assert(sequence.includes(story.entry_gate) && sequence.includes(story.exit_gate),
            `${story.id} uses a gate outside the declared sequence`);
    }
    assert(plan.authorization?.remote_authorization_gate === 'P7-G4'
        && plan.authorization.remote_changes_authorized === false,
    'Phase 7 remote authorization drifted');
    assert(stories.find(story => story.id === 'CF-P7-013')?.entry_gate === 'P7-G4',
        'Preview qualification must enter at the remote gate');

    // Every requested surface exists, is owned by exactly one real story, and is
    // written down. A surface with no owner is a surface nobody ships.
    const surfaces = plan.surfaces || [];
    assert(same(surfaces.map(item => item.id), SURFACES),
        'The requested surface inventory drifted');
    for (const surface of surfaces) {
        assert(STORY_IDS.includes(surface.owner),
            `Surface ${surface.id} is owned by an unknown story`);
        assert(typeof surface.name === 'string'
            && sprintSource.includes(`**${surface.name}**`),
        `Surface ${surface.id} is planned but undocumented in the sprint`);
    }

    // The five sync states and four base states are closed sets.
    assert(same(plan.sync_states || [], SYNC_STATES), 'The sync state set drifted');
    assert(same(plan.base_states || [], BASE_STATES), 'The base state set drifted');

    // Each acceptance criterion must state something checkable and be documented.
    const gateUx = plan.gate_ux || [];
    assert(same(gateUx.map(item => item.id), GATE_UX), 'The gate UX inventory drifted');
    for (const item of gateUx) {
        assert(typeof item.criterion === 'string' && item.criterion.length > 20,
            `${item.id} has no criterion`);
        assert(typeof item.required === 'string' && item.required.length > 80,
            `${item.id} has no actionable requirement`);
        assert(sprintSource.includes(`**${item.id} —`),
            `${item.id} is planned but undocumented in the sprint`);
    }

    for (const key of PROHIBITED) {
        const value = plan.boundaries?.[key];
        assert(value === 'NO-GO' || value === 'prohibited',
            `Phase 7 boundary drifted: ${key}`);
    }
    const budgets = plan.quality_budgets || {};
    assert(budgets.personal_startup_collaboration_modules === 0,
        'Personal startup must remain free of collaboration modules');
    assert(budgets.accessibility_standard === 'WCAG 2.2 AA',
        'The accessibility standard regressed');
    assert(budgets.minimum_supported_width_px === 320,
        'The minimum supported width regressed');
    for (const rule of ['unexplained_disabled_control', 'horizontal_page_scroll',
        'colour_only_state']) {
        assert((budgets.zero_tolerance || []).includes(rule),
            `Zero-tolerance rule dropped: ${rule}`);
    }

    // Anything cut from scope stays visible with its reason.
    const deferred = plan.deferred_to_phase_8 || [];
    assert(deferred.length >= 1, 'Deferred scope must be recorded, not dropped');
    for (const item of deferred) {
        assert(typeof item.reason === 'string' && item.reason.length > 40,
            `Deferred item "${item.item}" carries no reason`);
    }
    assert(deferred.some(item => /Copy to workspace/i.test(item.item)
        && item.service_already_enforces === true),
    'Copy to workspace was dropped without recording that the service still enforces it');

    assert(typeof plan.principle === 'string' && plan.principle.length > 80,
        'The no-new-primitive principle was dropped');
    assert(plan.exit_gate_requirement?.automated_check === 'cf:phase7:exit:check'
        && plan.exit_gate_requirement.ships_with === 'CF-P7-014',
    'Phase 7 must ship an automated exit gate');
    return true;
}
