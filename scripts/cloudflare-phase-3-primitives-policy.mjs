const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
const LABELS = [
    'docvault:oauth-state-hmac:v1',
    'docvault:oauth-envelope-aead:v1',
    'docvault:session-token-hmac:v1',
    'docvault:csrf-token-hmac:v1',
    'docvault:rate-limit-hmac:v1'
];
const SOURCES = [
    'functions/_lib/identity/encoding.ts',
    'functions/_lib/identity/crypto.ts',
    'functions/_lib/identity/oauth-envelope.ts',
    'functions/_lib/identity/return-path.ts',
    'functions/_lib/identity/cookies.ts',
    'functions/_lib/identity/environment.ts',
    'functions/_lib/identity/index.ts'
];
const EVIDENCE = ['CF-EV-P3-UT-001', 'CF-EV-P3-SEC-002'];

export function validatePhase3IdentityPrimitives({ manifest, sprintManifest, sprintSource, contractSource,
    sourceFiles, workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P3'
        && manifest.story === 'CF-P3-002' && manifest.status === 'PASS', 'Unsupported Phase 3 primitive evidence');
    assert(manifest.gate_authorization?.id === 'P3-G1'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P3-002'
        && manifest.gate_authorization.next_gate === 'P3-G2'
        && manifest.gate_authorization.next_story === 'CF-P3-003', 'P3-G1 authorization drifted');

    const scope = manifest.scope || {};
    for (const key of ['identity_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `CF-P3-002 exceeded authorized scope: ${key}`);
    }
    for (const key of ['identity_enabled', 'collaboration_enabled', 'business_routes_enabled']) {
        assert(scope[key] === false, `CF-P3-002 enabled prohibited capability: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 6, 'Identity primitive module inventory drifted');

    assert(sprintManifest.authorization?.gate === 'P3-G4B'
        && sprintManifest.authorization.decision === 'APPROVED'
        && sprintManifest.authorization.authorized_story === 'CF-P3-008', 'Sprint authorization drifted');
    const stories = sprintManifest.stories || [];
    assert(stories.filter(story => ['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'].includes(story.id))
        .every(story => story.status === 'PASS')
        && stories.filter(story => !['CF-P3-001', 'CF-P3-002', 'CF-P3-003', 'CF-P3-004', 'CF-P3-005', 'CF-P3-006', 'CF-P3-007', 'CF-P3-008'].includes(story.id))
            .every(story => story.status === 'PLANNED'), 'Sprint story disposition drifted');
    assert(sprintSource.includes('`CF-P3-008` PASS; awaiting Product Owner approval at Gate P3-G4A'),
        'Sprint status text drifted');
    assert(contractSource.includes('`CF-P3-008` PASS; awaiting Gate P3-G4A approval'),
        'Contract execution status drifted');

    assert(sameSet(manifest.source_files || [], SOURCES)
        && sameSet(Object.keys(sourceFiles), SOURCES), 'Identity source inventory drifted');
    const implementation = manifest.implementation || {};
    assert(implementation.runtime === 'cloudflare-workers-web-crypto'
        && implementation.random === 'crypto-getRandomValues-only'
        && implementation.derivation === 'HKDF-SHA-256-domain-separated-32-byte-output'
        && implementation.message_authentication === 'HMAC-SHA-256-sign-and-subtle-verify'
        && implementation.oauth_envelope === 'AES-256-GCM-version-1-bound-AAD-4096-byte-maximum'
        && implementation.environment === 'exact-preview-or-explicit-harness-predicate-fail-closed',
    'Identity primitive profile drifted');
    assert(sameSet(manifest.approved_labels || [], LABELS), 'Cryptographic label inventory drifted');

    const combined = Object.values(sourceFiles).join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\.(?:log|error)\s*\(/,
        /passThroughOnException\s*\(/, /as unknown as/, /GITHUB_OAUTH_CLIENT_SECRET\s*[:=]\s*['"][^'"]+['"]/]) {
        assert(!prohibited.test(combined), `Prohibited identity implementation pattern: ${prohibited}`);
    }
    const cryptoSource = sourceFiles['functions/_lib/identity/crypto.ts'];
    assert(cryptoSource.includes("crypto.getRandomValues(new Uint8Array(length))")
        && cryptoSource.includes("crypto.subtle.deriveBits")
        && cryptoSource.includes("crypto.subtle.verify('HMAC'")
        && cryptoSource.includes("['sign']") && cryptoSource.includes("['verify']"), 'Web Crypto primitives weakened');
    const envelopeSource = sourceFiles['functions/_lib/identity/oauth-envelope.ts'];
    assert((envelopeSource.match(/name: 'AES-GCM'/g) || []).length === 2
        && (envelopeSource.match(/additionalData:/g) || []).length === 2
        && (envelopeSource.match(/tagLength: 128/g) || []).length === 2
        && envelopeSource.includes('MAX_ENVELOPE_BYTES = 4_096'),
    'OAuth AEAD contract weakened');
    const cookieSource = sourceFiles['functions/_lib/identity/cookies.ts'];
    assert(cookieSource.includes('Secure; HttpOnly; SameSite=Lax') && !cookieSource.includes('Domain='),
        'Host-only cookie contract weakened');
    const environmentSource = sourceFiles['functions/_lib/identity/environment.ts'];
    assert(environmentSource.includes("mode === 'preview-only' && input.APP_ENV === 'preview'")
        && environmentSource.includes('options.allowLocalTestMode === true')
        && environmentSource.includes("return { enabled: false, mode: 'disabled' }"), 'Environment fail-closed boundary weakened');

    assert(manifest.workers_test_file === 'tests/cloudflare/identity-primitives.workers.test.ts'
        && manifest.workers_test_count === 10
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 10, 'Workers primitive test inventory drifted');
    for (const vector of [manifest.fixed_vectors?.state_base64url,
        manifest.fixed_vectors?.pkce_challenge_base64url]) {
        assert(typeof vector === 'string' && workersTestSource.includes(vector), 'Fixed vector is not executable');
    }
    for (const phrase of ['tamper', 'AAD substitution', 'rotates through an explicit previous key',
        'malformed secret or token canaries', 'never production']) {
        assert(workersTestSource.includes(phrase), `Security coverage missing: ${phrase}`);
    }

    assert(migrationManifest.entries?.length === 12 && migrationManifest.entries[11]?.sequence === 12 && migrationManifest.entries[11]?.story === 'CF-P5-006' && migrationManifest.entries[11]?.gate === 'P5-G2C-M' && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M'
        && migrationManifest.entries[9]?.story === 'CF-P3-007'
        && migrationManifest.entries[9]?.gate === 'P3-G3', 'Migration set contains an unauthorized post-story change');
    assert(!wrangler.env?.production?.d1_databases && !wrangler.env?.production?.ratelimits
        && wrangler.env?.production?.vars?.IDENTITY_RUNTIME_MODE !== 'preview-only',
    'Identity activation escaped into production');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'CF-P3-002 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P3-002'),
            `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P3-G2'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P3-003-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P3-G2 recommendation drifted');
    return true;
}

export { LABELS, SOURCES, EVIDENCE };
