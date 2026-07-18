const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};
const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
export const SOURCES = [
    'functions/_lib/e2ee/errors.ts', 'functions/_lib/e2ee/canonical.ts',
    'functions/_lib/e2ee/jwk.ts', 'functions/_lib/e2ee/primitives.ts'
];
export const EVIDENCE = ['CF-EV-P5-UT-001', 'CF-EV-P5-VEC-001', 'CF-EV-P5-SEC-002'];

export function validatePhase5Primitives({ manifest, sprint, contractFreeze, sourceFiles, workersTest,
    referenceTest, vectorFixture, routeSource, migrationManifest, wrangler, evidenceSources, implementationSource }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.story === 'CF-P5-002' && manifest.status === 'PASS', 'CF-P5-002 identity/status drifted');
    assert(manifest.gate_authorization?.id === 'P5-G1'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P5-002'
        && manifest.gate_authorization.next_gate === 'P5-G2'
        && manifest.gate_authorization.next_story === 'CF-P5-003', 'P5-G1 authorization drifted');
    assert(['P5-G1', 'P5-G2'].includes(sprint.authorization?.gate)
        && sprint.stories?.[0]?.status === 'PASS' && sprint.stories?.[1]?.status === 'PASS',
    'Historical primitive disposition drifted');

    const scope = manifest.scope || {};
    for (const key of ['runtime_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed']) assert(scope[key] === 0, `Scope exceeded: ${key}`);
    for (const key of ['preview_deploy_authorized', 'production_identity_enabled', 'collaboration_enabled']) {
        assert(scope[key] === false, `Prohibited activation: ${key}`);
    }
    assert(scope.isolated_runtime_modules_added === 4 && sameSet(manifest.source_files || [], SOURCES)
        && sameSet(Object.keys(sourceFiles), SOURCES), 'E2EE source inventory drifted');

    const implementation = manifest.implementation || {};
    assert(implementation.runtime === 'cloudflare-workers-web-crypto'
        && implementation.canonical_json === 'RFC8785-JCS-strict-I-JSON'
        && implementation.binary_encoding === 'RFC4648-base64url-unpadded-canonical'
        && implementation.public_key === 'exact-six-field-on-curve-P256-JWK'
        && implementation.fingerprint === 'base64url-SHA256-JCS-public-JWK'
        && implementation.local_private_key === 'PBKDF2-HMAC-SHA256-600000-A256GCM-bound-AAD'
        && implementation.unlocked_private_key === 'non-extractable-ECDH-deriveBits-only'
        && implementation.workspace_wrap === 'ephemeral-non-extractable-P256-ECDH-HKDF-SHA256-A256GCM'
        && implementation.random === 'crypto-getRandomValues-only'
        && implementation.fallback === 'none-fail-closed', 'Primitive profile drifted');

    const combined = Object.values(sourceFiles).join('\n');
    for (const prohibited of [/Math\.random\s*\(/, /console\./, /localStorage|indexedDB|caches\./,
        /fetch\s*\(/, /AES-CBC|AES-CTR|SHA-1|MD5/, /plaintextFallback|passThroughOnException/]) {
        assert(!prohibited.test(combined), `Prohibited primitive pattern: ${prohibited}`);
    }
    const canonical = sourceFiles['functions/_lib/e2ee/canonical.ts'];
    assert(canonical.includes('Object.keys(record).sort()') && canonical.includes('assertUnicode')
        && canonical.includes('encodeBase64Url(bytes) !== value') && canonical.includes('Number.isSafeInteger'),
    'Canonical validation weakened');
    const jwk = sourceFiles['functions/_lib/e2ee/jwk.ts'];
    assert(jwk.includes("['crv', 'ext', 'key_ops', 'kty', 'x', 'y']")
        && jwk.includes("namedCurve: 'P-256'") && jwk.includes('decodeBase64Url(record.x, 32, 32)')
        && jwk.includes('encodeBase64Url(await sha256(utf8(canonical)))'), 'P-256 JWK validation weakened');
    const primitives = sourceFiles['functions/_lib/e2ee/primitives.ts'];
    for (const token of ['600_000', "name: 'PBKDF2'", "name: 'AES-GCM'", 'tagLength: 128',
        "name: 'ECDH'", "name: 'HKDF'", 'crypto.getRandomValues', "false, ['deriveBits']",
        'target.fingerprint !== aad.targetFingerprint']) assert(primitives.includes(token), `Primitive token missing: ${token}`);

    const frozenIds = contractFreeze.vector_contract.families.flatMap(family => family.cases);
    const vectors = vectorFixture.vectors || [];
    assert(vectorFixture.manifestVersion === 'CF-CRYPTO-V1'
        && vectorFixture.sourceClassification === 'synthetic-only'
        && vectors.length === 30 && sameSet(vectors.map(vector => vector.id), frozenIds)
        && vectors.every(vector => vector.sourceClassification === 'synthetic-only'
            && Object.keys(vector).length === 10), 'Immutable vector manifest drifted');
    assert(manifest.vector_manifest?.cases === 30 && manifest.vector_manifest.families === 6
        && manifest.vector_manifest.workers_runtime_cases === 10
        && manifest.vector_manifest.independent_node_oracle_cases === 3
        && manifest.vector_manifest.agreement_percent === 100
        && manifest.vector_manifest.mutable === false, 'Vector evidence summary drifted');
    assert((workersTest.match(/\bit\s*\(/g) || []).length === 10
        && workersTest.includes('production CSPRNG and a non-extractable generated ephemeral private key')
        && workersTest.includes('CRYPTO_BINDING_MISMATCH') && workersTest.includes('LOCAL_UNLOCK_FAILED')
        && referenceTest.includes("from 'node:crypto'") && !referenceTest.includes("functions/_lib/e2ee")
        && (referenceTest.match(/\btest\s*\(/g) || []).length === 3, 'Independent executable vector coverage drifted');

    assert(!routeSource.includes("from '../e2ee") && !routeSource.includes("from '../../e2ee")
        && !routeSource.includes('wrapWorkspaceKey'), 'E2EE primitives became route-reachable');
    assert(migrationManifest.entries?.length === 10 && !migrationManifest.entries.some(entry => entry.sequence === 11),
        'Unauthorized migration added');
    assert(!wrangler.env?.production?.d1_databases && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false',
        'Production boundary drifted');
    assert(implementationSource.includes('No request handler imports these modules')
        && /^Status: PASS$/m.test(implementationSource), 'Implementation report incomplete');
    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'Evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P5-002'),
            `${id} is incomplete`);
    }
    assert(manifest.next_decision?.gate === 'P5-G2'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P5-003-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P5-G2 ceiling drifted');
    return true;
}
