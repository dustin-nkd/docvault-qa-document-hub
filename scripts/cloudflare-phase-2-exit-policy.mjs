const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const REQUIRED_STORIES = {
    'CF-P2-001': ['CF-EV-P2-STA-001', 'CF-EV-P2-SEC-001'],
    'CF-P2-002': ['CF-EV-P2-STA-002', 'CF-EV-P2-INT-001', 'CF-EV-P2-SEC-002'],
    'CF-P2-003': ['CF-EV-P2-INT-002', 'CF-EV-P2-PERF-001', 'CF-EV-P2-SEC-003'],
    'CF-P2-004': ['CF-EV-P2-UT-001', 'CF-EV-P2-INT-003', 'CF-EV-P2-SEC-004'],
    'CF-P2-005': ['CF-EV-P2-INT-004', 'CF-EV-P2-INT-005', 'CF-EV-P2-SEC-005'],
    'CF-P2-006': ['CF-EV-P2-INT-006', 'CF-EV-P2-PERF-002', 'CF-EV-P2-SEC-006'],
    'CF-P2-007': ['CF-EV-P2-OPS-001', 'CF-EV-P2-INT-007', 'CF-EV-P2-SEC-007'],
    'CF-P2-008': ['CF-EV-P2-OPS-002', 'CF-EV-P2-OPS-003', 'CF-EV-P2-E2E-001', 'CF-EV-P2-SEC-008'],
    'CF-P2-009': ['CF-EV-P2-OPS-004']
};

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
const sameRecord = (actual, expected) => JSON.stringify(Object.entries(actual).sort()) === JSON.stringify(Object.entries(expected).sort());

const parseRisks = source => source.split(/\r?\n/)
    .filter(line => /^\| R\d{2} \|/.test(line))
    .map(line => {
        const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
        return { id: cells[0], contractOwner: cells[4], evidenceOwner: cells[5], status: cells[9] };
    });

export function validatePhase2ExitGate({
    manifest, evidenceSources, packageJson, wrangler, migrationManifest,
    storyContracts, riskRegister, exitReport, asOf = new Date()
}) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P2'
        && manifest.story === 'CF-P2-009' && manifest.status === 'PASS', 'Unsupported Phase 2 exit manifest');
    assert(manifest.gate_authorization?.id === 'P2-G5'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P2-009', 'P2-G5 authorization drifted');
    assert(manifest.recommendation?.phase_3_identity_session_implementation === 'GO', 'Phase 3 identity/session recommendation must be GO');
    assert(manifest.recommendation?.collaboration_activation === 'NO-GO', 'Collaboration activation must remain NO-GO');
    const reviewDue = new Date(`${manifest.review_due}T23:59:59Z`);
    assert(Number.isFinite(reviewDue.getTime()) && asOf <= reviewDue, 'Phase 2 risk review has expired');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), Object.keys(REQUIRED_STORIES)), 'Phase 2 story inventory drifted');
    const referencedEvidence = [];
    for (const story of stories) {
        assert(story.status === 'PASS', `${story.id} is not PASS`);
        assert(story.owners?.length > 0 && story.reviewers?.length > 0, `${story.id} lacks ownership or review`);
        assert(new Set([...story.owners, ...story.reviewers]).has('Senior QA'), `${story.id} lacks Senior QA accountability`);
        assert(story.requirements?.length > 0 && story.risks?.length > 0, `${story.id} lacks traceability`);
        assert(sameSet(story.evidence || [], REQUIRED_STORIES[story.id]), `${story.id} evidence inventory drifted`);
        referencedEvidence.push(...story.evidence);
    }
    assert(new Set(referencedEvidence).size === referencedEvidence.length, 'Evidence IDs must belong to one story');
    assert(sameSet(Object.keys(evidenceSources), referencedEvidence), 'Committed Phase 2 evidence and manifest differ');
    for (const [id, source] of Object.entries(evidenceSources)) {
        const story = stories.find(candidate => candidate.evidence.includes(id));
        assert(source.startsWith(`# ${id} `) && /^Status: PASS\b/m.test(source), `${id} is not PASS`);
        assert(source.includes(story.id), `${id} does not identify ${story.id}`);
    }

    assert(Object.entries(storyContracts).every(([id, contract]) => contract.story === id && contract.status === 'PASS'), 'A prior story contract is not PASS');
    assert(manifest.schema_inventory?.schema_version === 9
        && manifest.schema_inventory.migration_count === 9
        && manifest.schema_inventory.migration_set_digest === migrationManifest.migration_set_digest
        && sameSet(manifest.schema_inventory.migration_sha256 || [], migrationManifest.entries.slice(0, 9).map(entry => entry.sha256))
        && manifest.schema_inventory.minimum_runtime_schema === 1
        && manifest.schema_inventory.maximum_runtime_schema === 9
        && manifest.schema_inventory.destructive_or_down_migrations === 0, 'Schema checksum inventory drifted');

    assert(manifest.remote_boundary?.preview_database_name === 'docvault-collab-preview'
        && manifest.remote_boundary.preview_binding_name === 'COLLAB_DB'
        && manifest.remote_boundary.preview_schema_version === 9
        && manifest.remote_boundary.preview_entity_rows === 0
        && manifest.remote_boundary.preview_foreign_key_violations === 0
        && manifest.remote_boundary.recovery_database_name_matches === 0
        && manifest.remote_boundary.production_d1_bindings === 0
        && manifest.remote_boundary.production_collaboration_data === 'absent-no-storage-binding'
        && manifest.remote_boundary.collaboration_enabled === 'false', 'Remote boundary drifted');
    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases
        && wrangler.env?.preview?.d1_databases?.length === 1
        && wrangler.env.preview.d1_databases[0].binding === 'COLLAB_DB', 'Wrangler D1 isolation drifted');
    assert([wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
        .every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Collaboration no longer fails closed');

    const deployments = manifest.verified_deployments || {};
    assert(/^[0-9a-f]{40}$/.test(deployments.verified_commit)
        && Number.isSafeInteger(deployments.github_actions_run_id)
        && ['cloudflare_production_deployment_id', 'cloudflare_preview_deployment_id', 'compatible_previous_preview_deployment_id']
            .every(key => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(deployments[key])), 'Deployment inventory drifted');

    const zeroLists = [
        'p0_p1_skipped', 'p0_p1_quarantined', 'disabled_cases', 'accepted_flakiness',
        'secret_or_privacy_canary_matches', 'unexpected_side_effects', 'open_p0_p1_defects',
        'incompatible_schema_runtime_pairs', 'unowned_or_expired_critical_high_risks'
    ];
    for (const key of zeroLists) assert(Array.isArray(manifest.quality?.[key]) && manifest.quality[key].length === 0, `Phase 2 exception is not zero: ${key}`);
    assert(manifest.quality?.node_tests_passed >= 129 && manifest.quality.workers_d1_tests_passed >= 39
        && manifest.quality.browser_regression === 'PASS' && manifest.quality.artifact_boundary === 'PASS'
        && manifest.quality.dual_origin_smoke === 'PASS' && manifest.quality.dependency_vulnerabilities === 0, 'Quality inventory drifted');
    assert(sameRecord(manifest.dependency_inventory || {}, packageJson.devDependencies || {}), 'Dependency inventory drifted');
    assert(manifest.known_limitations?.length >= 5 && manifest.known_limitations.some(item => item.includes('Production has no collaboration D1')), 'Known limitations are incomplete');

    const risks = parseRisks(riskRegister);
    assert(sameSet(risks.map(risk => risk.id), Array.from({ length: 22 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`)), 'Risk register must contain R01-R22 exactly once');
    assert(risks.every(risk => risk.contractOwner && risk.evidenceOwner), 'Critical/High risk ownership is incomplete');
    assert(risks.every(risk => !/^Open\b/i.test(risk.status)), 'An open risk remains at Phase 2 exit');

    assert(/^Status: PASS$/m.test(exitReport), 'Phase 2 exit report is not PASS');
    assert(exitReport.includes('Phase 3 identity/session implementation: `GO`')
        && exitReport.includes('Collaboration activation: `NO-GO`'), 'Phase 2 exit decisions are incomplete');
    for (const reviewer of ['Product Owner', 'Senior QA', 'Security Reviewer', 'Operations', 'Privacy Reviewer', 'UX Lead', 'Technical Lead']) {
        assert(exitReport.includes(reviewer), `Exit report lacks ${reviewer} review`);
    }
    return true;
}

export { REQUIRED_STORIES };
