const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

export const STORY_IDS = Object.freeze(['CF-P6-001', 'CF-P6-002', 'CF-P6-003', 'CF-P6-004',
    'CF-P6-005', 'CF-P6-006', 'CF-P6-007', 'CF-P6-008', 'CF-P6-009']);

export const SCENARIOS = Object.freeze(['G1', 'G2', 'G3', 'G4', 'G5', 'G6']);

export function validatePhase6Exit({ manifest, exitReport, handoff, sprintPlan, packageJson }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-009' && manifest.exit_gate === 'P6-G5',
    'Unsupported Phase 6 exit manifest');

    // A phase with an unproven gate scenario may not describe itself as closed.
    const scenarios = manifest.gate_scenarios || {};
    const open = (scenarios.not_verified_over_preview_http || []).length > 0;
    assert(open ? manifest.status === 'PARTIAL' : manifest.status === 'PASS',
        'Phase 6 exit status does not match its open gate scenarios');
    assert(open ? manifest.exit_gate_granted === false : true,
        'P6-G5 cannot be granted while a gate scenario is unverified over HTTP');
    assert(same(scenarios.verified_at_persistence_layer || [], SCENARIOS),
        'Persistence-layer scenario coverage regressed');
    // Every scenario is accounted for: verified, or explicitly listed as not.
    assert(same([...(scenarios.verified_over_preview_http || []),
        ...(scenarios.not_verified_over_preview_http || [])], SCENARIOS),
    'A gate scenario is neither verified nor recorded as unverified');
    assert(typeof scenarios.not_verified_reason === 'string'
        && scenarios.not_verified_reason.length > 40,
    'The unverified-scenario reason is missing or too vague to act on');

    const stories = manifest.stories || [];
    assert(same(stories.map(story => story.id), STORY_IDS), 'Phase 6 story inventory drifted');
    // A story cannot be PASS on assertion alone; it must name a gate that exists.
    for (const story of stories.filter(entry => entry.status === 'PASS')) {
        assert(typeof story.gate === 'string' && story.gate.startsWith('cf:phase6:'),
            `${story.id} is PASS without an automated gate`);
        assert(packageJson.scripts?.[story.gate],
            `${story.id} names a gate that does not exist: ${story.gate}`);
    }

    assert(manifest.closing_condition?.blocking === true
        && manifest.closing_condition.required_steps >= 1
        && typeof manifest.closing_condition.summary === 'string'
        && manifest.closing_condition.summary.length > 40,
    'The closing condition must stay explicit and blocking');

    // Provenance must never be quietly upgraded into a synthetic-identity claim.
    const identity = manifest.identity_provenance || {};
    assert(identity.synthetic_identity_used === false
        && identity.described_as_synthetic_anywhere === false
        && identity.owner_advised === true, 'Identity provenance drifted');
    assert(/personal GitHub account/.test(exitReport),
        'The exit report no longer records the real identity provenance');

    // If anything remains in Preview, cleanup may not be reported as complete.
    const cleanup = manifest.cleanup || {};
    const remaining = (cleanup.sessions_active ?? 0) + (cleanup.devices_active ?? 0)
        + (cleanup.workspaces_active ?? 0);
    assert(cleanup.complete === (remaining === 0), 'Cleanup completeness is misreported');
    assert(cleanup.documents_active === 0, 'An active test document remains in Preview');
    assert(cleanup.shared_preview_restore_executed === false,
        'A prohibited shared Preview restore was performed');

    const boundary = manifest.authorization_boundary || {};
    for (const key of ['collaboration_activation', 'production_identity', 'production_d1',
        'production_document_routes']) {
        assert(boundary[key] === 'NO-GO', `Phase 6 exit boundary drifted: ${key}`);
    }

    assert(/^Status: \*\*PARTIAL/m.test(exitReport) || /^Status: PASS$/m.test(exitReport),
        'Phase 6 exit report status line drifted');
    assert(exitReport.includes('OPEN — the condition for closing Phase 6'),
        'The exit report dropped its closing-condition section');
    assert(/^Status: \*\*DRAFT/m.test(handoff),
        'The Phase 7 handoff must stay DRAFT until P6-G5 is granted');
    assert(handoff.includes('Prerequisite — not yet satisfied'),
        'The Phase 7 handoff dropped its unmet prerequisite');
    assert(sprintPlan.stories?.length === 9, 'Sprint plan story inventory drifted');
    return true;
}
