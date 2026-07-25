const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const REQUIRED_STORIES = Object.freeze({
    'CF-P5-001': ['CF-EV-P5-STA-001', 'CF-EV-P5-SEC-001'],
    'CF-P5-002': ['CF-EV-P5-UT-001', 'CF-EV-P5-VEC-001', 'CF-EV-P5-SEC-002'],
    'CF-P5-003': ['CF-EV-P5-UT-002', 'CF-EV-P5-E2E-001', 'CF-EV-P5-SEC-003', 'CF-EV-P5-PERF-001'],
    'CF-P5-004': ['CF-EV-P5-UT-003', 'CF-EV-P5-INT-001', 'CF-EV-P5-SEC-004', 'CF-EV-P5-QA-001'],
    'CF-P5-005': ['CF-EV-P5-UT-004', 'CF-EV-P5-INT-002', 'CF-EV-P5-SEC-005', 'CF-EV-P5-QA-002'],
    'CF-P5-006': ['CF-EV-P5-UT-005', 'CF-EV-P5-INT-003', 'CF-EV-P5-E2E-002', 'CF-EV-P5-SEC-006', 'CF-EV-P5-OPS-001'],
    'CF-P5-007': ['CF-EV-P5-E2E-003', 'CF-EV-P5-PERF-002', 'CF-EV-P5-SEC-007', 'CF-EV-P5-OPS-002', 'CF-EV-P5-QA-003'],
    'CF-P5-008': ['CF-EV-P5-QA-004', 'CF-EV-P5-SEC-008', 'CF-EV-P5-OPS-003', 'CF-EV-P5-STA-002']
});

export const REVIEW_ROLES = Object.freeze(['Product Owner', 'Senior QA', 'Security Reviewer',
    'Operations', 'Privacy Reviewer', 'UX Lead', 'Technical Lead']);

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase5Exit({ manifest, evidenceSources, storyContracts, migrationManifest,
    wrangler, riskRegister, exitReport, handoff, sprintSource, asOf = new Date() }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.story === 'CF-P5-008' && manifest.status === 'PASS', 'Unsupported Phase 5 exit manifest');
    assert(manifest.gate_authorization?.id === 'P5-G5'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P5-008', 'P5-G5 authorization drifted');
    const reviewDue = new Date(`${manifest.review_due}T23:59:59Z`);
    assert(Number.isFinite(reviewDue.getTime()) && asOf <= reviewDue, 'Phase 5 review has expired');

    const decision = manifest.decision || {};
    assert(decision.phase_5_preview_key_foundation === 'GO'
        && decision.phase_6_encrypted_documents === 'PLAN-ONLY'
        && decision.collaboration_activation === 'NO-GO'
        && decision.production_identity === 'NO-GO'
        && decision.production_business_routes === 'NO-GO', 'Phase 5 decision boundary drifted');

    // The sign-off record must stay truthful about how it was obtained. This
    // project has one maintainer, so the seven sprint roles are held by one
    // person. The gate refuses to let that be quietly upgraded into a claim of
    // seven independent reviews, or of an independent security/privacy review
    // that never happened.
    const signOff = manifest.sign_off || {};
    assert(signOff.model === 'single-maintainer-owner-authorization'
        && signOff.independent_reviewers_exist === false
        && signOff.independent_security_or_privacy_review_performed === false
        && sameSet(signOff.roles_covered || [], REVIEW_ROLES)
        && typeof signOff.note === 'string' && signOff.note.includes('single-maintainer'),
    'Phase 5 sign-off provenance drifted');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), Object.keys(REQUIRED_STORIES)), 'Phase 5 story inventory drifted');
    const referencedEvidence = [];
    for (const story of stories) {
        assert(story.status === 'PASS', `${story.id} is not PASS`);
        assert(sameSet(story.evidence || [], REQUIRED_STORIES[story.id]), `${story.id} evidence inventory drifted`);
        referencedEvidence.push(...story.evidence);
    }
    assert(new Set(referencedEvidence).size === referencedEvidence.length, 'Evidence IDs must belong to one story');
    assert(sameSet(Object.keys(evidenceSources), referencedEvidence), 'Committed Phase 5 evidence and manifest differ');
    assert(manifest.quality?.evidence_record_count === referencedEvidence.length, 'Evidence record count drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        const story = stories.find(candidate => candidate.evidence.includes(id));
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes(story.id),
            `${id} is not PASS evidence for ${story.id}`);
    }
    assert(Object.entries(storyContracts).every(([id, contract]) => contract.story === id && contract.status === 'PASS'),
        'A prior Phase 5 story contract is not PASS');

    const schema = manifest.schema_inventory || {};
    assert(schema.schema_version === 12 && schema.migration_count === 12
        && schema.migration_set_digest === migrationManifest.migration_set_digest
        && migrationManifest.entries?.length === 12
        && migrationManifest.entries[11]?.sequence === 12
        && migrationManifest.entries[11]?.story === 'CF-P5-006'
        && schema.minimum_runtime_schema === 1 && schema.maximum_runtime_schema === 12
        && schema.pending_remote_migrations === 0
        && schema.destructive_or_down_migrations === 0, 'Phase 5 schema reconciliation drifted');

    const boundary = manifest.remote_boundary || {};
    assert(boundary.preview_database_name === 'docvault-collab-preview'
        && boundary.preview_binding_name === 'COLLAB_DB' && boundary.preview_schema_version === 12
        && boundary.preview_foreign_key_violations === 0
        && boundary.production_d1_bindings === 0 && boundary.collaboration_enabled === 'false'
        && boundary.preview_unauthenticated_key_read_status === 401
        && boundary.preview_hostile_origin_mutation_status === 403
        && boundary.production_disabled_shell_status === 503
        && boundary.github_pages_api_status === 404, 'Remote environment boundary drifted');
    const authority = boundary.preview_active_authority || {};
    for (const key of ['users', 'sessions', 'pending_oauth_transactions', 'workspaces', 'memberships',
        'devices', 'unrevoked_key_envelopes', 'auth_rate_windows']) {
        assert(authority[key] === 0, `Preview active authority is not retired: ${key}`);
    }
    assert(boundary.preview_phase_6_rows?.documents === 0
        && boundary.preview_phase_6_rows?.document_revisions === 0, 'Phase 6 rows leaked into Phase 5');
    // History is retained on purpose; a zero here would mean the append-only
    // journals were destroyed rather than the authority retired.
    const history = boundary.preview_retained_history || {};
    assert(history.workspace_key_versions >= 1 && history.workspace_key_envelopes >= 1
        && history.audit_events >= 1, 'Append-only Phase 5 history is missing');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].binding === 'COLLAB_DB'
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Production or activation boundary drifted');

    const recovery = manifest.recovery || {};
    assert(recovery.mode === 'authority-retired-in-place-no-delete-no-restore'
        && recovery.disposable_rehearsal_result === 'PASS'
        && recovery.physical_deletes === 0
        && recovery.shared_preview_restore_executed === false
        && SHA256.test(recovery.pre_reconciliation_bookmark_sha256)
        && SHA256.test(recovery.post_reconciliation_bookmark_sha256)
        && recovery.pre_reconciliation_bookmark_sha256 !== recovery.post_reconciliation_bookmark_sha256
        && recovery.result === 'PASS', 'Phase 5 recovery evidence drifted');

    const deployments = manifest.verified_deployments || {};
    assert(SHA1.test(deployments.verified_baseline_commit)
        && Number.isSafeInteger(deployments.github_actions_run_id)
        && deployments.cloudflare_pages_project === 'docvault-qa-document-hub'
        && deployments.preview_qualification_branch === 'codex-cf-p3-preview'
        && ['cloudflare_production_deployment_id', 'cloudflare_preview_qualification_deployment_id',
            'compatible_previous_production_deployment_id'].every(key => UUID.test(deployments[key])),
    'Deployment evidence drifted');

    const zeroLists = ['p0_p1_skipped', 'p0_p1_quarantined', 'disabled_cases', 'accepted_flakiness',
        'secret_or_privacy_canary_matches', 'open_p0_p1_defects', 'plaintext_key_material_findings',
        'unauthorized_provisioning_successes', 'unowned_or_expired_critical_high_risks'];
    for (const key of zeroLists) assert(Array.isArray(manifest.quality?.[key])
        && manifest.quality[key].length === 0, `Phase 5 exception is not zero: ${key}`);
    assert(manifest.quality?.node_policy_tests_passed >= 195
        && manifest.quality.workers_d1_tests_passed >= 194
        && manifest.quality.workers_d1_test_files >= 29
        && manifest.quality.authenticated_local_read_p95_budget_ms === 250
        && manifest.quality.preview_remote_read_p95_ms <= 300
        && manifest.quality.browser_regression === 'PASS'
        && manifest.quality.artifact_boundary === 'PASS'
        && manifest.quality.dependency_vulnerabilities === 0, 'Phase 5 quality inventory drifted');
    // A defect found during exit verification may be recorded as resolved, but
    // never as an accepted flake — the sprint forbids the latter outright.
    assert(Array.isArray(manifest.quality.resolved_during_exit_verification)
        && manifest.quality.resolved_during_exit_verification.every(entry => /Fixed, not accepted\./.test(entry)),
    'A Phase 5 exit finding is not recorded as fixed');
    assert(manifest.known_limitations?.length >= 6
        && manifest.known_limitations.some(item => item.includes('Production has no collaboration D1'))
        && manifest.known_limitations.some(item => item.includes('no independent security or privacy review')),
    'Known limitations are incomplete');

    const riskRows = riskRegister.split(/\r?\n/).filter(line => /^\| R\d{2} \|/.test(line));
    assert(riskRows.length === 22 && riskRows.every(line => !/\|\s*Open\s*\|\s*$/.test(line)),
        'Risk register inventory is incomplete or contains an open unowned risk');

    assert(/^Status: PASS$/m.test(exitReport)
        && exitReport.includes('Phase 5 device/workspace-key foundation on isolated Preview: **GO**')
        && exitReport.includes('Collaboration activation: `NO-GO`')
        && exitReport.includes('single-maintainer project'), 'Phase 5 exit report drifted');
    for (const role of REVIEW_ROLES) {
        assert(exitReport.includes(role), `Exit report lacks ${role} sign-off`);
    }
    assert(/^Status: \*\*CONTROLLING/m.test(handoff)
        && handoff.includes('Phase 6') && handoff.includes('never')
        && handoff.includes('workspace DEKs'), 'Phase 6 handoff drifted');
    // The sprint header is a frozen literal; keep it pinned so a later edit
    // cannot quietly rewrite the approved sprint boundary.
    assert(/^Status: \*\*READY FOR APPROVAL AT `P5-G0`\*\*$/m.test(sprintSource),
        'Sprint document approval status drifted');
    return true;
}
