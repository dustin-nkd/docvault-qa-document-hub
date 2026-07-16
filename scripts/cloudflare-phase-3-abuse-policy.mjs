const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const ABUSE_SOURCES = [
    'functions/_lib/identity/abuse-control.ts',
    'functions/_lib/identity/observability.ts',
    'functions/_lib/identity/provider-resilience.ts',
    'functions/_lib/identity/github-oauth-adapter.ts',
    'functions/_lib/identity/index.ts'
];
export const ABUSE_EVIDENCE = ['CF-EV-P3-INT-004', 'CF-EV-P3-PERF-001', 'CF-EV-P3-SEC-007', 'CF-EV-P3-OPS-001'];

export function validatePhase3AbusePolicy({ manifest, sprintManifest, sourceFiles, workersTestSource,
    routeSource, wrangler, migrationManifest, migrationSource, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-007' && manifest.status === 'PASS', 'Unsupported abuse evidence');
    assert(manifest.gate_authorization?.id === 'P3-G3'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-007'
        && manifest.gate_authorization.next_gate === 'P3-G3A', 'P3-G3 authorization drifted');
    assert(sprintManifest.authorization?.gate === 'P3-G3'
        && sprintManifest.authorization.authorized_story === 'CF-P3-007'
        && sprintManifest.stories.find(story => story.id === 'CF-P3-007')?.status === 'PASS',
    'Sprint disposition drifted');

    const scope = manifest.scope || {};
    assert(scope.schema_migrations_added === 1 && scope.isolated_runtime_modules_added === 3,
        'Authorized implementation inventory drifted');
    for (const key of ['identity_route_calls', 'business_route_calls', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed']) assert(scope[key] === 0, `Scope exceeded: ${key}`);
    for (const key of ['production_identity_enabled', 'preview_identity_enabled', 'collaboration_enabled']) {
        assert(scope[key] === false, `Prohibited capability enabled: ${key}`);
    }

    const rate = manifest.rate_limits || {};
    assert(rate.oauth_source?.limit === 20 && rate.oauth_source.window_seconds === 600
        && rate.identity_user?.limit === 120 && rate.identity_user.window_seconds === 60
        && rate.identity_source?.limit === 300 && rate.identity_source.window_seconds === 60
        && rate.edge_burst?.limit === 6 && rate.edge_burst.window_seconds === 60
        && rate.failure_mode === 'fail-closed-generic-429'
        && rate.stored_identity === 'window-scoped-hmac-digest-only', 'Rate profile drifted');
    assert(same(manifest.observability?.fields,
        ['requestId', 'route', 'method', 'outcome', 'status', 'latencyMs', 'environment']),
    'Operational event allowlist drifted');
    assert(manifest.observability?.prohibited?.length === 16, 'Privacy denylist drifted');
    assert(manifest.provider_resilience?.request_timeout_ms === 5000
        && manifest.provider_resilience.overall_budget_ms === 8000
        && manifest.provider_resilience.identity_retries === 1
        && manifest.provider_resilience.token_exchange_retries === 0
        && manifest.provider_resilience.maximum_retry_delay_ms === 1000, 'Provider budget drifted');

    const abuse = sourceFiles['functions/_lib/identity/abuse-control.ts'];
    const observability = sourceFiles['functions/_lib/identity/observability.ts'];
    const resilience = sourceFiles['functions/_lib/identity/provider-resilience.ts'];
    const provider = sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'];
    const index = sourceFiles['functions/_lib/identity/index.ts'];
    for (const phrase of ['ON CONFLICT (route_family, key_digest, window_started_at) DO UPDATE',
        'WHERE auth_rate_windows.attempt_count < ?', 'IdentityRateLimitError',
        'IDENTITY_KEY_LABELS.rateLimit', 'MAXIMUM_CLEANUP_ROWS = 100']) assert(abuse.includes(phrase), `Abuse control missing: ${phrase}`);
    assert(observability.includes('Object.keys(event).length !== 7') && !observability.includes('...event')
        && !/request\.headers|cookie|authorization/i.test(observability), 'Observability accepted unsafe input');
    assert(resilience.includes("state === 'open'") && resilience.includes("circuit.record('failure')")
        && !/setInterval|globalThis|Math\.random/.test(resilience), 'Circuit boundary drifted');
    for (const phrase of ['REQUEST_TIMEOUT_MS = 5_000', 'OVERALL_BUDGET_MS = 8_000',
        'MAXIMUM_RETRY_DELAY_MS = 1_000', 'RETRYABLE_IDENTITY_STATUSES', 'exchangeCode']) {
        assert(provider.includes(phrase), `Provider bound missing: ${phrase}`);
    }
    assert(index.includes("export * from './abuse-control'") && index.includes("export * from './observability'")
        && index.includes("export * from './provider-resilience'"), 'Identity exports drifted');

    const entry = migrationManifest.entries?.[9];
    assert(migrationManifest.entries?.length === 10 && entry?.story === 'CF-P3-007' && entry.gate === 'P3-G3'
        && entry.filename === manifest.migration && same(entry.tables, ['auth_rate_windows'])
        && migrationSource.includes('CREATE TABLE auth_rate_windows')
        && migrationSource.includes('schema_version = 10'), 'Authorized migration drifted');
    assert(manifest.workers_test_count === 8 && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8,
        'Workers abuse test inventory drifted');
    for (const phrase of ['twenty attempts', 'fails closed', 'raw discriminators', 'bounded batch',
        'low-cardinality', 'attacker-controlled', 'short-circuits', 'without replaying']) {
        assert(workersTestSource.includes(phrase), `Required abuse coverage missing: ${phrase}`);
    }

    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.ratelimits
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE !== 'preview-only',
    'Identity activation escaped into production');
    assert(same(Object.keys(evidenceSources).sort(), [...ABUSE_EVIDENCE].sort())
        && Object.entries(evidenceSources).every(([id, source]) => source.startsWith(`# ${id} `)
            && /^Status: PASS$/m.test(source) && source.includes('CF-P3-007')), 'Evidence inventory drifted');
    assert(manifest.next_decision?.gate === 'P3-G3A'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.remote_changes_authorized === false, 'Next gate boundary drifted');
    return true;
}
