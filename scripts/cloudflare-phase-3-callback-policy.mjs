const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const SOURCES = [
    'functions/_lib/identity/github-oauth-adapter.ts',
    'functions/_lib/identity/oauth-callback-repository.ts',
    'functions/_lib/identity/oauth-callback-service.ts',
    'functions/_lib/identity/oauth-transaction-service.ts',
    'functions/_lib/identity/index.ts'
];
const EVIDENCE = ['CF-EV-P3-API-001', 'CF-EV-P3-INT-002', 'CF-EV-P3-SEC-004'];

export function validatePhase3OAuthCallback({ manifest, sprintManifest, sprintSource, contractSource,
    sourceFiles, workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-004' && manifest.status === 'PASS', 'Unsupported OAuth callback evidence');
    assert(manifest.gate_authorization?.id === 'P3-G2A'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-004'
        && manifest.gate_authorization.next_gate === 'P3-G2B'
        && manifest.gate_authorization.next_story === 'CF-P3-005', 'P3-G2A authorization drifted');

    const scope = manifest.scope || {};
    for (const key of ['identity_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'oauth_apps_created', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `CF-P3-004 exceeded authorized scope: ${key}`);
    }
    for (const key of ['production_identity_enabled', 'preview_identity_enabled',
        'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-004 enabled prohibited capability: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 3, 'Callback module inventory drifted');

    assert(sprintManifest.authorization?.gate === 'P3-G2C'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-006', 'Sprint authorization drifted');
    const completed = ['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006'];
    assert((sprintManifest.stories || []).filter(story => completed.includes(story.id))
        .every(story => story.status === 'PASS')
        && sprintManifest.stories.filter(story => !completed.includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint story disposition drifted');
    assert(sprintSource.includes('`CF-P3-006` PASS; awaiting Product Owner approval at Gate P3-G3'),
        'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-006` PASS; awaiting Gate P3-G3 approval'),
        'Contract execution status drifted');

    assert(sameSet(manifest.source_files || [], SOURCES) && sameSet(Object.keys(sourceFiles), SOURCES),
        'Callback source inventory drifted');
    const adapter = sourceFiles['functions/_lib/identity/github-oauth-adapter.ts'];
    const repository = sourceFiles['functions/_lib/identity/oauth-callback-repository.ts'];
    const service = sourceFiles['functions/_lib/identity/oauth-callback-service.ts'];
    const combined = Object.values(sourceFiles).join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\.(?:log|error)\s*\(/,
        /passThroughOnException\s*\(/, /as unknown as/, /api\.cloudflare\.com\/client\/v4/,
        /client_secret[^\n]*console/i, /accessToken[^\n]*(?:INSERT|UPDATE)/i]) {
        assert(!prohibited.test(combined), `Prohibited callback implementation pattern: ${prohibited}`);
    }

    const provider = manifest.provider || {};
    assert(provider.token_endpoint === 'https://github.com/login/oauth/access_token'
        && provider.identity_endpoint === 'https://api.github.com/user'
        && provider.api_version === '2026-03-10' && provider.token_exchange_retries === 0
        && provider.identity_retries === 1 && sameSet(provider.retry_statuses || [], [429, 502, 503, 504])
        && provider.request_timeout_ms === 5000 && provider.overall_budget_ms === 8000
        && provider.maximum_retry_delay_ms === 1000 && provider.maximum_response_bytes === 16384
        && provider.redirect_policy === 'error' && provider.provider_token_storage === 'prohibited',
    'GitHub provider profile drifted');
    for (const phrase of ["const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token'",
        "const IDENTITY_ENDPOINT = 'https://api.github.com/user'", "const GITHUB_API_VERSION = '2026-03-10'",
        'const REQUEST_TIMEOUT_MS = 5_000', 'const OVERALL_BUDGET_MS = 8_000',
        'const MAXIMUM_RETRY_DELAY_MS = 1_000',
        'const RETRYABLE_IDENTITY_STATUSES = new Set([429, 502, 503, 504])',
        'const MAXIMUM_RESPONSE_BYTES = 16_384', "redirect: 'error'", 'new URLSearchParams',
        'response.body.getReader()', 'await response.body.cancel()', 'Number.isSafeInteger(value.id)']) {
        assert(adapter.includes(phrase), `GitHub adapter control missing: ${phrase}`);
    }
    assert((adapter.match(/transport\.request\(IDENTITY_ENDPOINT/g) || []).length === 1
        && adapter.includes('for (let attempt = 0; attempt < 2; attempt += 1)')
        && adapter.includes('await dependencies.sleep.wait(delay)'), 'Provider retry contract weakened');

    const atomic = manifest.atomic_callback || {};
    assert(atomic.consistency === 'first-primary'
        && atomic.transaction_guard === 'pending-unconsumed-unexpired-compare-and-set'
        && atomic.zero_change_assertion === 'constraint-failure-rolls-back-entire-d1-batch'
        && atomic.maximum_batch_statements === 9
        && atomic.session_token_storage === 'hmac-sha256-digest-only'
        && atomic.session_idle_seconds === 43200 && atomic.session_absolute_seconds === 604800
        && atomic.external_error === 'OAUTH_CALLBACK_FAILED', 'Atomic callback profile drifted');
    assert(repository.includes('WHERE changes() <> 1')
        && repository.includes("SELECT 'oauth-guard-failure', 'github', '0'")
        && repository.includes("status = 'pending' AND consumed_at IS NULL")
        && repository.includes("revoke_reason = 'reauthenticated'")
        && repository.includes('await database.batch<Record<string, unknown>>(statements)')
        && service.includes('digestSessionToken(input.sessionTokenPepper, sessionToken)')
        && service.includes('openAuthorizationSession(database)'), 'Atomic authority controls weakened');

    assert(manifest.workers_test_file === 'tests/cloudflare/oauth-callback.workers.test.ts'
        && manifest.workers_test_count === 10 && (workersTestSource.match(/\bit\s*\(/g) || []).length === 10,
    'Workers callback test inventory drifted');
    for (const phrase of ['never returns the provider token', 'eight-second provider budget',
        'non-numeric responses', 'mutable login changes', 'exactly one concurrent callback',
        'session insert conflicts', 'same numeric subject', 'wrong-subject reauthentication',
        'never echoes canaries']) {
        assert(workersTestSource.includes(phrase), `Callback security coverage missing: ${phrase}`);
    }

    assert(!routeSource.includes('completeOAuthCallback') && !routeSource.includes('createGitHubOAuthAdapter'),
        'OAuth callback was routed before CF-P3-006');
    assert(migrationManifest.entries?.length === 9, 'CF-P3-004 changed the approved migration set');
    assert(!wrangler.ratelimits && !wrangler.secrets && !wrangler.d1_databases
        && !wrangler.env?.production?.d1_databases && !wrangler.env?.preview?.ratelimits,
    'Identity binding was provisioned prematurely');
    assert([wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
        .every(vars => vars?.COLLABORATION_ENABLED === 'false' && !('IDENTITY_RUNTIME_MODE' in vars)),
    'Identity or collaboration runtime was enabled prematurely');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'CF-P3-004 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-004'),
            `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P3-G2B'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-005-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P3-G2B recommendation drifted');
    return true;
}

export { SOURCES, EVIDENCE };
