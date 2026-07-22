const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const SOURCES = [
    'functions/_lib/identity/oauth-envelope.ts',
    'functions/_lib/identity/oauth-transaction-repository.ts',
    'functions/_lib/identity/oauth-transaction-service.ts',
    'functions/_lib/identity/index.ts'
];
const EVIDENCE = ['CF-EV-P3-UT-002', 'CF-EV-P3-INT-001', 'CF-EV-P3-SEC-003'];

export function validatePhase3OAuthTransactions({ manifest, sprintManifest, sprintSource, contractSource,
    sourceFiles, workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-003' && manifest.status === 'PASS', 'Unsupported OAuth transaction evidence');
    assert(manifest.gate_authorization?.id === 'P3-G2'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-003'
        && manifest.gate_authorization.next_gate === 'P3-G2A'
        && manifest.gate_authorization.next_story === 'CF-P3-004', 'P3-G2 authorization drifted');

    const scope = manifest.scope || {};
    for (const key of ['identity_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed', 'user_or_session_writes']) {
        assert(scope[key] === 0, `CF-P3-003 exceeded authorized scope: ${key}`);
    }
    for (const key of ['identity_enabled', 'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-003 enabled prohibited capability: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 2, 'OAuth lifecycle module inventory drifted');

    assert(sprintManifest.authorization?.gate === 'P3-G4B'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-008', 'Sprint authorization drifted');
    assert((sprintManifest.stories || []).filter(story => ['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'].includes(story.id))
        .every(story => story.status === 'PASS')
        && sprintManifest.stories.filter(story => !['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'].includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint story disposition drifted');
    assert(sprintSource.includes('`CF-P3-008` PASS; awaiting Product Owner approval at Gate P3-G4A'),
        'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-008` PASS; awaiting Gate P3-G4A approval'),
        'Contract execution status drifted');

    assert(sameSet(manifest.source_files || [], SOURCES) && sameSet(Object.keys(sourceFiles), SOURCES),
        'OAuth lifecycle source inventory drifted');
    const repository = sourceFiles['functions/_lib/identity/oauth-transaction-repository.ts'];
    const service = sourceFiles['functions/_lib/identity/oauth-transaction-service.ts'];
    const envelope = sourceFiles['functions/_lib/identity/oauth-envelope.ts'];
    const combined = Object.values(sourceFiles).join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\.(?:log|error)\s*\(/,
        /passThroughOnException\s*\(/, /as unknown as/, /SELECT[^;]*\$\{/s, /(?:state|verifier).*console/i]) {
        assert(!prohibited.test(combined), `Prohibited OAuth lifecycle pattern: ${prohibited}`);
    }
    assert(service.includes('const TRANSACTION_TTL_MS = 600_000')
        && service.includes("const CALLBACK_PATH = '/api/v1/oauth/github/callback'")
        && service.includes("openAuthorizationSession(database)")
        && service.includes("'OAUTH_TRANSACTION_INVALID'")
        && service.includes("'OAUTH_TRANSACTION_UNAVAILABLE'"), 'Lifecycle contract weakened');
    assert(repository.includes("status = 'pending'") && repository.includes('expires_at > ?')
        && repository.includes('consumed_at IS NULL') && repository.includes('requireCheckedChanges(results[0], 1)')
        && repository.includes('maximumCleanupRows: MAXIMUM_CLEANUP_ROWS'), 'D1 CAS or cleanup guard weakened');
    assert(envelope.includes('digestOAuthStateCandidates') && envelope.includes('hmacSign'),
        'Rotated state-digest lookup is missing');

    const lifecycle = manifest.lifecycle || {};
    assert(lifecycle.ttl_seconds === 600 && lifecycle.state_storage === 'hmac-sha256-digest-only'
        && lifecycle.verifier_context_storage === 'aes-256-gcm-envelope'
        && lifecycle.lookup_consistency === 'first-primary'
        && lifecycle.consume === 'compare-and-set-pending-unexpired'
        && lifecycle.cleanup_maximum_rows === 100 && lifecycle.terminal_retention_seconds === 86400,
    'OAuth lifecycle profile drifted');
    assert(manifest.workers_test_file === 'tests/cloudflare/oauth-transaction-lifecycle.workers.test.ts'
        && manifest.workers_test_count === 8 && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8,
    'Workers OAuth lifecycle test inventory drifted');
    for (const phrase of ['exact server boundary', 'exactly one concurrent consume', 'previous key',
        'wrong origin', 'corrupt envelopes', 'ambiguously match', 'bounds cleanup', 'never echoes']) {
        assert(workersTestSource.includes(phrase), `OAuth security coverage missing: ${phrase}`);
    }

    assert(migrationManifest.entries?.length === 12 && migrationManifest.entries[11]?.sequence === 12 && migrationManifest.entries[11]?.story === 'CF-P5-006' && migrationManifest.entries[11]?.gate === 'P5-G2C-M' && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M'
        && migrationManifest.entries[9]?.story === 'CF-P3-007'
        && migrationManifest.entries[9]?.gate === 'P3-G3', 'Migration set contains an unauthorized post-story change');
    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.ratelimits
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE !== 'preview-only',
    'Identity activation escaped into production');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'CF-P3-003 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-003'),
            `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P3-G2A'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-004-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P3-G2A recommendation drifted');
    return true;
}

export { SOURCES, EVIDENCE };
