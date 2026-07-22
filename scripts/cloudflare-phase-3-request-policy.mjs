const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const ROUTES = [
    'POST /api/v1/oauth/github/transactions',
    'GET /api/v1/oauth/github/callback',
    'GET /api/v1/session',
    'POST /api/v1/session/logout'
];
const SOURCES = [
    'functions/_lib/identity/request-policy.ts',
    'functions/_lib/identity/index.ts',
    'functions/_lib/identity/crypto.ts',
    'functions/_lib/identity/session-service.ts',
    'sw.js'
];
const EVIDENCE = ['CF-EV-P3-UT-004', 'CF-EV-P3-API-003', 'CF-EV-P3-SEC-006'];

export function validatePhase3RequestPolicy({ manifest, sprintManifest, sprintSource, contractSource,
    sourceFiles, workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-006' && manifest.status === 'PASS', 'Unsupported request-policy evidence');
    assert(manifest.gate_authorization?.id === 'P3-G2C'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-006'
        && manifest.gate_authorization.next_gate === 'P3-G3'
        && manifest.gate_authorization.next_story === 'CF-P3-007', 'P3-G2C authorization drifted');

    const scope = manifest.scope || {};
    for (const key of ['identity_route_calls', 'business_route_calls', 'schema_migrations_added',
        'wrangler_bindings_added', 'remote_writes', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `CF-P3-006 exceeded authorized scope: ${key}`);
    }
    for (const key of ['production_identity_enabled', 'preview_identity_enabled',
        'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-006 enabled prohibited capability: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 1, 'Request-policy module inventory drifted');

    assert(sprintManifest.authorization?.gate === 'P3-G4B'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-008', 'Sprint authorization drifted');
    const completed = ['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'];
    assert((sprintManifest.stories || []).filter(story => completed.includes(story.id))
        .every(story => story.status === 'PASS')
        && sprintManifest.stories.filter(story => !completed.includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint story disposition drifted');
    assert(sprintSource.includes('`CF-P3-008` PASS; awaiting Product Owner approval at Gate P3-G4A'),
        'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-008` PASS; awaiting Gate P3-G4A approval'),
        'Contract execution status drifted');

    assert(sameSet(manifest.route_scope || [], ROUTES), 'Four-route scope drifted');
    assert(sameSet(manifest.source_files || [], SOURCES) && sameSet(Object.keys(sourceFiles), SOURCES),
        'Request-policy source inventory drifted');
    const policy = sourceFiles['functions/_lib/identity/request-policy.ts'];
    const index = sourceFiles['functions/_lib/identity/index.ts'];
    const crypto = sourceFiles['functions/_lib/identity/crypto.ts'];
    const service = sourceFiles['functions/_lib/identity/session-service.ts'];
    const serviceWorker = sourceFiles['sw.js'];
    const combined = Object.entries(sourceFiles)
        .filter(([file]) => file !== 'sw.js')
        .map(([, source]) => source)
        .join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\.(?:log|error)\s*\(/,
        /passThroughOnException\s*\(/, /as unknown as/, /Access-Control-Allow-Origin/i,
        /api\.cloudflare\.com\/client\/v4/]) {
        assert(!prohibited.test(combined), `Prohibited request-policy pattern: ${prohibited}`);
    }
    for (const phrase of ["request.headers.get('Origin') !== expectedOrigin",
        "request.headers.get('Content-Type')", "request.headers.get(CSRF_HEADER)",
        'resolveSessionToken(database', 'verifyCsrfToken(input.csrfTokenKey',
        'deriveCsrfToken(input.csrfTokenKey', "route.id === 'oauth-callback'",
        "route.id === 'session'", "route.id === 'logout'", "purpose === 'reauthenticate'",
        'coalesceActivity: !requiresSession']) {
        assert(policy.includes(phrase), `Request-policy control missing: ${phrase}`);
    }
    assert(index.includes("export * from './request-policy'")
        && crypto.includes('docvault:csrf-token-hmac:v1')
        && service.includes('resolveSessionToken')
        && serviceWorker.includes("url.pathname.startsWith('/api/')")
        && serviceWorker.includes("req.mode === 'navigate'"), 'Shared security boundary drifted');

    const requestProfile = manifest.request_profile || {};
    assert(requestProfile.mutation_origin === 'exact-approved-request-origin'
        && requestProfile.callback_origin === 'state-pkce-protocol-exception'
        && requestProfile.normal_api_cors === 'absent'
        && requestProfile.preflight === 'method-denied'
        && requestProfile.response_cache === 'no-store-private'
        && requestProfile.service_worker_api_mode === 'network-only-no-cache-lookup'
        && JSON.stringify(requestProfile.validation_order)
            === JSON.stringify(['route-method', 'exact-origin', 'live-session', 'session-bound-csrf']),
    'Request policy profile drifted');
    assert(manifest.session_profile?.csrf_header === 'X-CSRF-Token'
        && manifest.session_profile?.csrf_failure_session_activity === 'unchanged'
        && manifest.session_profile?.invalid_csrf === 'generic-CSRF_REJECTED'
        && manifest.session_profile?.invalid_required_session === 'generic-UNAUTHENTICATED',
    'Session-bound CSRF profile drifted');

    assert(manifest.workers_test_file === 'tests/cloudflare/identity-request-policy.workers.test.ts'
        && manifest.workers_test_count === 12
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 12, 'Workers policy test inventory drifted');
    for (const phrase of ['frozen four method/path pairs', 'before D1', 'preflight',
        'missing, null, lookalike, subdomain, port, scheme, and cross-environment origins',
        'callback GET', 'without session or CSRF', 'issues CSRF only for a live session',
        'exact Origin before live session', 'old-key, and cross-session CSRF',
        'current session-bound token', 'never reflects CORS']) {
        assert(workersTestSource.includes(phrase), `Request-policy security coverage missing: ${phrase}`);
    }

    assert(!routeSource.includes('authorizeIdentityRequest') && !routeSource.includes('request-policy'),
        'Identity request policy was routed before preview activation');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M'
        && migrationManifest.entries[9]?.story === 'CF-P3-007'
        && migrationManifest.entries[9]?.gate === 'P3-G3', 'Migration set contains an unauthorized post-story change');
    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.ratelimits
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE !== 'preview-only',
    'Identity activation escaped into production');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'CF-P3-006 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-006'),
            `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P3-G3'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-007-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P3-G3 recommendation drifted');
    return true;
}

export { EVIDENCE, ROUTES, SOURCES };
