const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const REQUIRED_STORIES = Object.freeze({
    'CF-P4-001': ['CF-EV-P4-STA-001', 'CF-EV-P4-SEC-001'],
    'CF-P4-002': ['CF-EV-P4-INT-001', 'CF-EV-P4-SEC-002', 'CF-EV-P4-QA-001'],
    'CF-P4-003': ['CF-EV-P4-UT-001', 'CF-EV-P4-INT-002', 'CF-EV-P4-SEC-003'],
    'CF-P4-004': ['CF-EV-P4-UT-002', 'CF-EV-P4-INT-003', 'CF-EV-P4-SEC-004', 'CF-EV-P4-QA-002'],
    'CF-P4-005': ['CF-EV-P4-UT-003', 'CF-EV-P4-INT-004', 'CF-EV-P4-SEC-005', 'CF-EV-P4-QA-003'],
    'CF-P4-006': ['CF-EV-P4-UT-004', 'CF-EV-P4-INT-005', 'CF-EV-P4-SEC-006', 'CF-EV-P4-QA-004'],
    'CF-P4-007': ['CF-EV-P4-INT-006', 'CF-EV-P4-SEC-007', 'CF-EV-P4-QA-005', 'CF-EV-P4-OPS-001'],
    'CF-P4-008': ['CF-EV-P4-QA-006', 'CF-EV-P4-SEC-008', 'CF-EV-P4-OPS-002', 'CF-EV-P4-STA-002']
});

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
const sameRecord = (actual, expected) => JSON.stringify(Object.entries(actual).sort())
    === JSON.stringify(Object.entries(expected).sort());

export function validatePhase4Exit({ manifest, evidenceSources, storyContracts, migrationManifest,
    wrangler, packageJson, riskRegister, exitReport, handoff, asOf = new Date() }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-008' && manifest.status === 'PASS', 'Unsupported Phase 4 exit manifest');
    assert(manifest.gate_authorization?.id === 'P4-G7'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-008', 'P4-G7 authorization drifted');
    const reviewDue = new Date(`${manifest.review_due}T23:59:59Z`);
    assert(Number.isFinite(reviewDue.getTime()) && asOf <= reviewDue, 'Phase 4 review has expired');

    const decision = manifest.decision || {};
    assert(decision.phase_4_preview_control_plane === 'GO'
        && decision.phase_5_device_keys_and_e2ee === 'GO'
        && decision.collaboration_activation === 'NO-GO'
        && decision.production_identity === 'NO-GO'
        && decision.production_business_routes === 'NO-GO', 'Phase 4 decision boundary drifted');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), Object.keys(REQUIRED_STORIES)), 'Phase 4 story inventory drifted');
    const referencedEvidence = [];
    for (const story of stories) {
        assert(story.status === 'PASS' && story.owners?.length > 0 && story.reviewers?.length > 0,
            `${story.id} lacks PASS ownership and review`);
        assert(new Set([...story.owners, ...story.reviewers]).has('Senior QA'), `${story.id} lacks Senior QA accountability`);
        assert(story.requirements?.length > 0 && story.risks?.length > 0, `${story.id} lacks traceability`);
        assert(sameSet(story.evidence || [], REQUIRED_STORIES[story.id]), `${story.id} evidence inventory drifted`);
        referencedEvidence.push(...story.evidence);
    }
    assert(new Set(referencedEvidence).size === referencedEvidence.length, 'Evidence IDs must belong to one story');
    assert(sameSet(Object.keys(evidenceSources), referencedEvidence), 'Committed Phase 4 evidence and manifest differ');
    for (const [id, source] of Object.entries(evidenceSources)) {
        const story = stories.find(candidate => candidate.evidence.includes(id));
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes(story.id),
            `${id} is not PASS evidence for ${story.id}`);
    }
    assert(Object.entries(storyContracts).every(([id, contract]) => contract.story === id && contract.status === 'PASS'),
        'A prior Phase 4 story contract is not PASS');

    const schema = manifest.schema_inventory || {};
    assert(schema.schema_version === 10 && schema.migration_count === 10
        && schema.migration_set_digest === migrationManifest.migration_set_digest
        && migrationManifest.entries?.length === 12 && migrationManifest.entries[11]?.sequence === 12 && migrationManifest.entries[11]?.story === 'CF-P5-006' && migrationManifest.entries[11]?.gate === 'P5-G2C-M' && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M' && schema.minimum_runtime_schema === 1
        && schema.maximum_runtime_schema === 10 && schema.pending_remote_migrations === 0
        && schema.destructive_or_down_migrations === 0, 'Phase 4 schema reconciliation drifted');

    const boundary = manifest.remote_boundary || {};
    assert(boundary.preview_database_name === 'docvault-collab-preview'
        && boundary.preview_binding_name === 'COLLAB_DB' && boundary.preview_schema_version === 10
        && boundary.preview_business_entity_rows === 0 && boundary.preview_operational_control_rows >= 0
        && boundary.preview_foreign_key_violations === 0 && boundary.production_d1_bindings === 0
        && boundary.production_collaboration_data === 'absent-no-storage-binding'
        && boundary.collaboration_enabled === 'false' && boundary.preview_unauthenticated_mutation_status === 401
        && boundary.production_disabled_shell_status === 503 && boundary.github_pages_api_status === 405,
    'Remote environment boundary drifted');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].binding === 'COLLAB_DB'
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Production or activation boundary drifted');

    const recovery = manifest.recovery || {};
    assert(recovery.mode === 'read-only-compatible-rollback-rehearsal'
        && recovery.time_travel_available === true
        && /^[0-9a-f]{64}$/.test(recovery.time_travel_bookmark_sha256)
        && recovery.shared_preview_restore_executed === false && recovery.shared_preview_writes === 0
        && recovery.current_runtime_schema === 10 && recovery.previous_runtime_schema === 10
        && /^[0-9a-f]{40}$/.test(recovery.previous_runtime_commit)
        && recovery.previous_deployment_status === 403 && recovery.result === 'PASS', 'Recovery evidence drifted');
    const deployments = manifest.verified_deployments || {};
    assert(/^[0-9a-f]{40}$/.test(deployments.verified_baseline_commit)
        && Number.isSafeInteger(deployments.github_actions_run_id)
        && ['cloudflare_production_deployment_id', 'cloudflare_preview_deployment_id', 'compatible_previous_deployment_id']
            .every(key => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deployments[key])),
    'Deployment evidence drifted');

    const zeroLists = ['p0_p1_skipped', 'p0_p1_quarantined', 'disabled_cases', 'accepted_flakiness',
        'secret_or_privacy_canary_matches', 'unexpected_side_effects', 'open_p0_p1_defects',
        'cross_tenant_bypasses', 'csrf_bypasses', 'replay_successes', 'revocation_bypasses',
        'incompatible_schema_runtime_pairs', 'unowned_or_expired_critical_high_risks'];
    for (const key of zeroLists) assert(Array.isArray(manifest.quality?.[key])
        && manifest.quality[key].length === 0, `Phase 4 exception is not zero: ${key}`);
    assert(manifest.quality?.node_tests_passed >= 179 && manifest.quality.workers_d1_tests_passed >= 156
        && manifest.quality.authenticated_local_read_p95_budget_ms === 250
        && manifest.quality.preview_boundary_probe_samples >= 10
        && manifest.quality.preview_boundary_probe_p95_ms <= 500
        && manifest.quality.browser_regression === 'PASS' && manifest.quality.artifact_boundary === 'PASS'
        && manifest.quality.dependency_vulnerabilities === 0, 'Phase 4 quality inventory drifted');
    assert(sameRecord(manifest.dependency_inventory || {}, packageJson.devDependencies || {}),
        'Dependency inventory drifted');
    assert(manifest.known_limitations?.length >= 6
        && manifest.known_limitations.some(item => item.includes('Production has no collaboration D1')),
    'Known limitations are incomplete');

    const riskRows = riskRegister.split(/\r?\n/).filter(line => /^\| R\d{2} \|/.test(line));
    assert(riskRows.length === 22 && riskRows.every(line => !/\|\s*Open\s*\|\s*$/.test(line)),
        'Risk register inventory is incomplete or contains an open unowned risk');
    assert(/^Status: PASS$/m.test(exitReport)
        && exitReport.includes('Phase 5 device keys and E2EE: `GO`')
        && exitReport.includes('Collaboration activation: `NO-GO`'), 'Phase 4 exit report drifted');
    for (const reviewer of ['Product Owner', 'Senior QA', 'Security Reviewer', 'Operations',
        'Privacy Reviewer', 'UX Lead', 'Technical Lead']) {
        assert(exitReport.includes(reviewer), `Exit report lacks ${reviewer} sign-off`);
    }
    assert(/^Status: (?:READY|ACTIVE\b.*)$/m.test(handoff) && handoff.includes('CF-P5-001')
        && handoff.includes('Production remains disabled'), 'Phase 5 handoff drifted');
    return true;
}
