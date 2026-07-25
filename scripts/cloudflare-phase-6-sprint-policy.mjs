const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const STORY_IDS = Object.freeze(['CF-P6-001', 'CF-P6-002', 'CF-P6-003', 'CF-P6-004',
    'CF-P6-005', 'CF-P6-006', 'CF-P6-007', 'CF-P6-008', 'CF-P6-009']);

export const GATE_SEQUENCE = Object.freeze(['P6-G0', 'P6-G1', 'P6-G2', 'P6-G2A', 'P6-G2B',
    'P6-G2C', 'P6-G3', 'P6-G3A', 'P6-G4', 'P6-G4A', 'P6-G5']);

export const DOCUMENT_ROUTES = Object.freeze([
    'GET /api/v1/workspaces/{workspaceId}/documents',
    'POST /api/v1/workspaces/{workspaceId}/documents',
    'GET /api/v1/workspaces/{workspaceId}/documents/{documentId}',
    'PUT /api/v1/workspaces/{workspaceId}/documents/{documentId}',
    'POST /api/v1/workspaces/{workspaceId}/documents/{documentId}/tombstone',
    'GET /api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions',
    'GET /api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions/{revision}'
]);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6SprintPlan({ manifest, sprintSource, handoff, apiContract,
    migrationManifest, wrangler }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.sprint === 'CF-P6-S01' && manifest.status === 'PLANNED',
    'Unsupported Phase 6 sprint manifest');

    // Sprint approval must never imply remote or story authority beyond the first
    // story. Phases 3-5 all leaked scope when this was left implicit.
    const authorization = manifest.authorization || {};
    assert(authorization.entry_gate === 'P6-G0' && authorization.decision === 'PENDING'
        && authorization.authorized_story_on_approval === 'CF-P6-001'
        && authorization.remote_authorization_gate === 'P6-G4'
        && authorization.remote_changes_authorized === false
        && authorization.exit_gate === 'P6-G5', 'Phase 6 sprint authorization drifted');
    assert(manifest.entry?.predecessor_phase === 'CF-P5'
        && manifest.entry.predecessor_status === 'PASS'
        && manifest.entry.predecessor_exit_gate === 'P5-G5', 'Phase 6 entry precondition drifted');

    // Schema 12 already carries the whole Phase 6 persistence surface. Recording
    // that as a finding is what keeps sprint approval from silently becoming
    // migration authority.
    const schema = manifest.schema_decision || {};
    assert(schema.finding === 'schema-12-sufficient-no-migration'
        && schema.migration_authorized_by_sprint_approval === false
        && sameSet(schema.required_tables_present || [], ['documents', 'document_revisions', 'mutation_results'])
        && Array.isArray(schema.idempotency_enforced_by) && schema.idempotency_enforced_by.length === 2,
    'Phase 6 schema decision drifted');
    assert(migrationManifest.entries?.length === 12
        && migrationManifest.entries[11]?.sequence === 12,
    'Phase 6 sprint plan implies a migration beyond the approved sequence 12');

    const providers = manifest.providers || {};
    assert(providers.contract === 'ADR-007'
        && sameSet(providers.names || [], ['PersonalVaultProvider', 'CollaborationProvider'])
        && providers.personal_github_sync_owner === 'PersonalVaultProvider'
        && providers.automatic_personal_upload === 'prohibited'
        && providers.personal_fallback_on_collaboration_failure === 'prohibited'
        && providers.guest_uses_provider === false, 'Provider isolation contract drifted');

    const routeScope = manifest.route_scope || {};
    assert(routeScope.document_routes_added === 7 && routeScope.other_routes_added === 0
        && routeScope.viewer_mutation_routes === 0
        && Array.isArray(routeScope.routes) && routeScope.routes.length === 7
        && sameSet(routeScope.routes.map(route => `${route.method} ${route.path}`), DOCUMENT_ROUTES),
    'Phase 6 route surface drifted');
    // Idempotency is required on exactly the three mutations.
    assert(routeScope.routes.filter(route => route.idempotency === true).length === 3
        && routeScope.routes.every(route => route.idempotency === (route.method !== 'GET')),
    'Phase 6 idempotency requirement drifted');
    for (const route of DOCUMENT_ROUTES) {
        const path = route.slice(route.indexOf('/'));
        assert(apiContract.includes(path), `API contract lacks the frozen route path: ${path}`);
    }

    const boundaries = manifest.boundaries || {};
    assert(boundaries.production_d1 === 'absent' && boundaries.production_document_routes === 'absent'
        && boundaries.collaboration_activation === 'NO-GO' && boundaries.production_identity === 'NO-GO'
        && boundaries.server_visible_plaintext === 'prohibited'
        && boundaries.automatic_merge === 'prohibited'
        && boundaries.client_timestamp_conflict_resolution === 'prohibited',
    'Phase 6 boundary drifted');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(vars => vars?.COLLABORATION_ENABLED === 'false'),
    'Production D1 or collaboration activation drifted');

    const conflict = manifest.conflict_contract || {};
    assert(conflict.authority === 'D1 monotonic integer revision'
        && conflict.precondition === 'compare-and-set on base_revision'
        && conflict.stale_base_status === 409
        && conflict.stale_base_error === 'DOCUMENT_REVISION_CONFLICT'
        && conflict.fingerprint_mismatch_error === 'IDEMPOTENCY_KEY_REUSED'
        && conflict.idempotency_retention_days === 30
        && conflict.automatic_merge === false
        && sameSet(conflict.resolution_options || [],
            ['review-latest', 'reapply-to-latest', 'save-as-separate-copy', 'discard-with-confirmation']),
    'Phase 6 conflict contract drifted');

    const outbox = manifest.outbox_contract || {};
    assert(outbox.storage === 'encrypted-indexeddb'
        && outbox.ordering === 'fifo-per-document-with-declared-predecessor'
        && outbox.max_pending_entries === 100 && outbox.max_bytes === 26_214_400
        && outbox.expiry_days === 7 && outbox.expiry_behavior === 'quarantine-not-delete'
        && sameSet(outbox.non_retryable_statuses || [], [401, 403, 409])
        && outbox.reauthorized_on_submission === true, 'Phase 6 outbox contract drifted');

    const copy = manifest.copy_to_workspace || {};
    assert(copy.mode === 'manual-one-time-unlinked'
        && copy.credential_documents === 'rejected-before-destination-encryption'
        && copy.destination_revision === 1 && copy.source_mutated === false
        && copy.idempotent === true
        && typeof copy.residual_risk === 'string' && copy.residual_risk.includes('cannot guarantee'),
    'Copy-to-workspace contract drifted');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), STORY_IDS), 'Phase 6 story inventory drifted');
    const referencedEvidence = [];
    for (const story of stories) {
        assert(story.status === 'PLANNED', `${story.id} must be PLANNED before P6-G0`);
        assert(GATE_SEQUENCE.includes(story.entry_gate) && GATE_SEQUENCE.includes(story.exit_gate),
            `${story.id} references an unknown gate`);
        assert(Array.isArray(story.evidence) && story.evidence.length > 0, `${story.id} lacks evidence`);
        referencedEvidence.push(...story.evidence);
    }
    assert(new Set(referencedEvidence).size === referencedEvidence.length,
        'Evidence IDs must belong to one Phase 6 story');
    assert(sameSet(manifest.gate_sequence || [], GATE_SEQUENCE), 'Phase 6 gate sequence drifted');

    const scenarios = manifest.sprint_gate_scenarios || [];
    assert(scenarios.length === 6 && sameSet(scenarios.map(item => item.id),
        ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']), 'Phase 6 sprint gate scenarios drifted');

    const budgets = manifest.quality_budgets || {};
    assert(budgets.vector_agreement_percent === 100
        && budgets.personal_provider_writes_allowed === 0
        && budgets.concurrent_writers_one_base_revision >= 20
        && budgets.identical_replays >= 32
        && budgets.preview_authenticated_read_p95_ms <= 300
        && budgets.preview_authenticated_write_p95_ms <= 500
        && budgets.eager_phase_6_modules_on_personal_startup === 0
        && budgets.collaboration_startup_ceiling_kib_gzip === 75
        && Array.isArray(budgets.zero_tolerance) && budgets.zero_tolerance.includes('accepted_flake'),
    'Phase 6 quality budgets drifted');

    const recovery = manifest.recovery_contract || {};
    assert(recovery.shared_preview_time_travel === 'read-only-bookmark-fingerprint-only'
        && recovery.shared_preview_restore === 'prohibited-without-separate-destructive-approval'
        && recovery.rollback_rule === 'preserve-append-only-revisions-and-monotonic-key-versions'
        && Array.isArray(recovery.rehearsals_required) && recovery.rehearsals_required.length >= 9,
    'Phase 6 recovery contract drifted');

    // Phases 3-5 each ship an automated exit gate; Phase 6 must not regress it.
    assert(manifest.exit_gate_requirement?.automated_check === 'cf:phase6:exit:check'
        && manifest.exit_gate_requirement.ships_with === 'CF-P6-009',
    'Phase 6 exit gate requirement drifted');

    assert(/^Status: \*\*READY FOR APPROVAL AT `P6-G0`\*\*$/m.test(sprintSource),
        'Sprint document approval status drifted');
    for (const id of STORY_IDS) assert(sprintSource.includes(`### \`${id}\``), `Sprint document lacks ${id}`);
    for (const gate of GATE_SEQUENCE) assert(sprintSource.includes(gate), `Sprint document lacks ${gate}`);
    for (const phrase of ['schema 12 is sufficient', 'no migration',
        'Viewer is deliberately absent from every mutation row',
        'PersonalVaultProvider', 'rejects stored Credential documents',
        'APPROVE `CF-P6-001` ONLY']) {
        assert(sprintSource.toLowerCase().includes(phrase.toLowerCase()),
            `Sprint document lacks boundary: ${phrase}`);
    }
    assert(/^Status: \*\*CONTROLLING/m.test(handoff), 'Phase 6 handoff is not controlling');
    return true;
}
