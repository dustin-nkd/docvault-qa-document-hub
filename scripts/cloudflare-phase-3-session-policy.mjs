const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const SOURCES = [
    'functions/_lib/identity/crypto.ts',
    'functions/_lib/identity/session-repository.ts',
    'functions/_lib/identity/session-service.ts',
    'functions/_lib/identity/index.ts',
    'functions/_lib/identity/oauth-callback-repository.ts',
    'functions/_lib/persistence/retention.ts'
];
const EVIDENCE = ['CF-EV-P3-UT-003', 'CF-EV-P3-API-002', 'CF-EV-P3-INT-003', 'CF-EV-P3-SEC-005'];

export function validatePhase3SessionLifecycle({ manifest, sprintManifest, sprintSource, contractSource,
    sourceFiles, workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-005' && manifest.status === 'PASS', 'Unsupported session lifecycle evidence');
    assert(manifest.gate_authorization?.id === 'P3-G2B'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-005'
        && manifest.gate_authorization.next_gate === 'P3-G2C'
        && manifest.gate_authorization.next_story === 'CF-P3-006', 'P3-G2B authorization drifted');

    const scope = manifest.scope || {};
    for (const key of ['identity_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `CF-P3-005 exceeded authorized scope: ${key}`);
    }
    for (const key of ['production_identity_enabled', 'preview_identity_enabled',
        'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-005 enabled prohibited capability: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 2, 'Session module inventory drifted');

    assert(sprintManifest.authorization?.gate === 'P3-G3'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-007', 'Sprint authorization drifted');
    const completed = ['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007'];
    assert((sprintManifest.stories || []).filter(story => completed.includes(story.id))
        .every(story => story.status === 'PASS')
        && sprintManifest.stories.filter(story => !completed.includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint story disposition drifted');
    assert(sprintSource.includes('`CF-P3-007` PASS; awaiting Product Owner approval at Gate P3-G3A'),
        'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-007` PASS; awaiting Gate P3-G3A approval'),
        'Contract execution status drifted');

    assert(sameSet(manifest.source_files || [], SOURCES) && sameSet(Object.keys(sourceFiles), SOURCES),
        'Session source inventory drifted');
    const crypto = sourceFiles['functions/_lib/identity/crypto.ts'];
    const repository = sourceFiles['functions/_lib/identity/session-repository.ts'];
    const service = sourceFiles['functions/_lib/identity/session-service.ts'];
    const callbackRepository = sourceFiles['functions/_lib/identity/oauth-callback-repository.ts'];
    const retention = sourceFiles['functions/_lib/persistence/retention.ts'];
    const combined = Object.values(sourceFiles).join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\.(?:log|error)\s*\(/,
        /passThroughOnException\s*\(/, /as unknown as/, /api\.cloudflare\.com\/client\/v4/,
        /token[^\n]*(?:INSERT INTO sessions|UPDATE sessions SET token)/i]) {
        assert(!prohibited.test(combined), `Prohibited session implementation pattern: ${prohibited}`);
    }

    const profile = manifest.session_profile || {};
    assert(profile.creation_authority === 'existing-atomic-oauth-callback-batch'
        && profile.lookup_consistency === 'first-primary'
        && profile.token_storage === 'hmac-sha256-digest-only'
        && profile.digest_candidates === 2 && profile.idle_seconds === 43200
        && profile.absolute_seconds === 604800 && profile.recent_authentication_seconds === 900
        && profile.last_seen_coalescing_seconds === 300 && profile.maximum_lookup_reads === 2
        && profile.maximum_lookup_writes === 1 && profile.invalid_result === 'uniform-unauthenticated'
        && profile.cross_environment_acceptance === 'prohibited', 'Session profile drifted');
    for (const phrase of ['sessionTokenDigestCandidates', 'keyring.activeKeyId',
        "openAuthorizationSession(database)", 'const SESSION_IDLE_MS = 43_200_000',
        'const RECENT_AUTH_MS = 900_000', 'const LAST_SEEN_COALESCE_MS = 300_000',
        'Math.min(now + SESSION_IDLE_MS, record.absoluteExpiresAt)',
        'now - record.authenticatedAt <= RECENT_AUTH_MS']) {
        assert((crypto + service).includes(phrase), `Session boundary control missing: ${phrase}`);
    }
    assert(repository.includes('WHERE s.token_digest IN (?, ?) LIMIT 3')
        && repository.includes('last_seen_at = ? AND idle_expires_at > ? AND absolute_expires_at > ?')
        && service.includes('input.coalesceActivity !== false && now - record.lastSeenAt >= LAST_SEEN_COALESCE_MS')
        && service.includes('const reread = await lookup('), 'Lookup/touch amplification controls weakened');

    const rotation = manifest.rotation_profile || {};
    assert(sameSet(rotation.triggers || [], ['previous-pepper-match', 'security-risk', 'fixation-risk'])
        && rotation.predecessor_action === 'checked-revoke-before-successor'
        && rotation.consistency === 'single-d1-batch'
        && rotation.zero_change_assertion === 'constraint-failure-rolls-back-entire-d1-batch'
        && rotation.maximum_batch_statements === 5
        && rotation.absolute_lifetime_extension === 'prohibited'
        && rotation.authentication_age_refresh === 'reauthentication-only'
        && rotation.concurrent_valid_successors === 1, 'Session rotation profile drifted');
    assert(repository.includes('WHERE changes() <> 1')
        && repository.includes("revoke_reason = 'logout'")
        && repository.includes('await database.batch<Record<string, unknown>>(statements)')
        && callbackRepository.includes('sessionTokenDigest: ArrayBuffer'), 'Rotation/create authority controls weakened');
    assert(manifest.logout_profile?.ordering === 'server-revoke-before-cookie-expiry'
        && manifest.logout_profile.persistence_failure_cookie_expiry === 'prohibited'
        && service.indexOf('await revokeSession(session, record, now)')
            < service.indexOf('expireSessionCookie(input.cookieName)', service.indexOf('await revokeSession(session, record, now)')),
    'Logout revoke-first ordering drifted');

    assert(manifest.retention_profile?.implementation === 'existing-phase-2-retention-boundary'
        && manifest.retention_profile.terminal_session_retention_seconds === 2592000
        && manifest.retention_profile.maximum_rows_per_batch === 100
        && retention.includes('WHERE absolute_expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)')
        && retention.includes('ORDER BY absolute_expires_at, id LIMIT ?'), 'Bounded session retention drifted');

    assert(manifest.workers_test_file === 'tests/cloudflare/session-lifecycle.workers.test.ts'
        && manifest.workers_test_count === 12 && (workersTestSource.match(/\bit\s*\(/g) || []).length === 12,
    'Workers session test inventory drifted');
    for (const phrase of ['exactly five minutes', 'fifteen-minute recent-authentication boundary',
        'previous-pepper match', 'uniform unauthenticated result', 'exactly one concurrent security rotation',
        'successor insertion conflicts', 'touch race', 'revokes server-side before',
        'logout persistence fails', 'cookie namespaces', 'pre-batch fault', 'approved number of terminal sessions']) {
        assert(workersTestSource.includes(phrase), `Session security coverage missing: ${phrase}`);
    }

    assert(!routeSource.includes('resolveSessionToken') && !routeSource.includes('resolveSessionCookie')
        && !routeSource.includes('logoutSession'), 'Session lifecycle was routed before CF-P3-006');
    assert(migrationManifest.entries?.length === 10
        && migrationManifest.entries[9]?.story === 'CF-P3-007'
        && migrationManifest.entries[9]?.gate === 'P3-G3', 'Migration set contains an unauthorized post-story change');
    assert(!wrangler.ratelimits && !wrangler.secrets && !wrangler.d1_databases
        && !wrangler.env?.production?.d1_databases && !wrangler.env?.preview?.ratelimits,
    'Session binding was provisioned prematurely');
    assert([wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
        .every(vars => vars?.COLLABORATION_ENABLED === 'false' && !('IDENTITY_RUNTIME_MODE' in vars)),
    'Identity or collaboration runtime was enabled prematurely');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'CF-P3-005 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-005'),
            `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P3-G2C'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-006-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P3-G2C recommendation drifted');
    return true;
}

export { SOURCES, EVIDENCE };
