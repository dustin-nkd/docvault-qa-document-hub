const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const STORY_IDS = Array.from({ length: 10 }, (_, index) => `CF-P3-${String(index + 1).padStart(3, '0')}`);
const REQUIRED_GATES = ['P3-G1', 'P3-G2', 'P3-G2A', 'P3-G2B', 'P3-G2C', 'P3-G3', 'P3-G3A', 'P3-G4', 'P3-G4A', 'P3-G5', 'P3'];
const REQUIRED_ROUTES = [
    'POST /api/v1/oauth/github/transactions',
    'GET /api/v1/oauth/github/callback',
    'GET /api/v1/session',
    'POST /api/v1/session/logout'
];

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const tableIds = (source, prefix) => new Set(source.split(/\r?\n/)
    .map(line => line.match(new RegExp(`^\\| (${prefix}-[A-Z]+-\\d{3}|[TR]\\d{2}) \\|`))?.[1])
    .filter(Boolean));

export function validatePhase3SprintPlan({ manifest, sprintSource, traceability, threatModel, riskRegister, wrangler }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3' && manifest.sprint === 'CF-P3-S01', 'Unsupported Phase 3 sprint plan');
    assert(manifest.status === 'ACTIVE', 'Phase 3 sprint must be active after Gate P3-G0');
    assert(manifest.authorization?.gate === 'P3-G0'
        && manifest.authorization.decision === 'APPROVED'
        && manifest.authorization.authorized_story === 'CF-P3-001', 'P3-G0 authorization drifted');
    assert(manifest.entry?.phase_2_exit === 'PASS'
        && manifest.entry.identity_session_implementation === 'GO'
        && manifest.entry.collaboration_activation === 'NO-GO'
        && manifest.entry.production_d1_bindings === 0, 'Phase 3 entry boundary drifted');

    const boundary = manifest.boundaries || {};
    for (const key of ['production_identity_enabled', 'production_oauth_secrets_provisioned', 'github_pages_identity_enabled',
        'collaboration_enabled', 'business_api_routes_enabled', 'collaboration_ui_enabled', 'personal_vault_migration',
        'real_customer_data_allowed', 'deployed_test_bypass_allowed']) {
        assert(boundary[key] === false, `Phase 3 prohibited boundary enabled: ${key}`);
    }
    assert(boundary.production_d1_bindings === 0 && boundary.identity_runtime === 'preview-only-after-P3-G4', 'Identity environment boundary drifted');
    assert(sameSet(manifest.route_scope || [], REQUIRED_ROUTES), 'Phase 3 route scope drifted');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), STORY_IDS), 'Phase 3 story inventory drifted');
    const evidence = [];
    const requirementIds = tableIds(traceability, 'CF');
    const threatIds = tableIds(threatModel, 'T');
    const riskIds = tableIds(riskRegister, 'R');
    for (const story of stories) {
        assert(story.status === (story.id === 'CF-P3-001' ? 'PASS' : 'PLANNED')
            && story.owners?.length && story.reviewers?.length, `${story.id} status or ownership drifted`);
        assert(new Set([...story.owners, ...story.reviewers]).has('Senior QA'), `${story.id} lacks Senior QA accountability`);
        assert(story.requirements?.length && story.threats?.length && story.risks?.length && story.evidence?.length, `${story.id} lacks traceability`);
        for (const id of story.requirements) assert(requirementIds.has(id), `${story.id} references unknown requirement ${id}`);
        for (const id of story.threats) assert(threatIds.has(id), `${story.id} references unknown threat ${id}`);
        for (const id of story.risks) assert(riskIds.has(id), `${story.id} references unknown risk ${id}`);
        evidence.push(...story.evidence);
    }
    assert(new Set(evidence).size === evidence.length, 'Phase 3 evidence IDs must belong to one story');
    assert(stories.find(story => story.id === 'CF-P3-008')?.entry_gate === 'P3-G4', 'Remote provisioning must require P3-G4');
    assert(REQUIRED_GATES.every(gate => sprintSource.includes(`P3-G${gate === 'P3' ? 'ate P3' : gate.slice(4)}`) || sprintSource.includes(gate)), 'Sprint gate sequence is incomplete');

    const security = manifest.security_contract || {};
    assert(security.identity_key === 'provider+numeric-provider-subject'
        && security.oauth_flow === 'authorization-code-pkce-s256'
        && security.oauth_transaction_ttl_minutes === 10
        && security.session_idle_hours === 12
        && security.session_absolute_days === 7
        && security.recent_auth_minutes === 15
        && security.oauth_token_persistence === 'prohibited', 'Identity/session security contract drifted');
    assert(security.cookie_preview.startsWith('__Host-')
        && security.cookie_production_reserved.startsWith('__Host-')
        && security.cookie_preview !== security.cookie_production_reserved, 'Cookie namespace isolation drifted');

    const quality = manifest.quality_budgets || {};
    for (const key of ['p0_p1_skips', 'accepted_flakiness', 'secret_or_token_log_matches', 'oauth_replay_successes',
        'session_revocation_bypass_successes', 'csrf_bypass_successes', 'cross_environment_acceptance_successes']) {
        assert(quality[key] === 0, `Phase 3 quality exception is not zero: ${key}`);
    }
    assert(quality.authenticated_read_p95_ms === 300 && quality.authenticated_write_p95_ms === 500, 'Phase 3 performance budget drifted');

    assert(/^Status: \*\*ACTIVE — `CF-P3-001` PASS; awaiting Product Owner approval at Gate P3-G1\*\*$/m.test(sprintSource), 'Sprint document status drifted');
    for (const id of STORY_IDS) assert(sprintSource.includes(`### \`${id}\``), `Sprint document lacks ${id}`);
    for (const phrase of ['production D1 binding', 'collaboration activation', 'GitHub Pages', 'deployed test bypass']) {
        assert(sprintSource.toLowerCase().includes(phrase.toLowerCase()), `Sprint document lacks boundary: ${phrase}`);
    }

    assert(!wrangler.d1_databases && !wrangler.env?.production?.d1_databases, 'Production D1 must remain absent at sprint planning');
    assert([wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
        .every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Collaboration must remain disabled at sprint planning');
    return true;
}

export { STORY_IDS, REQUIRED_ROUTES };
