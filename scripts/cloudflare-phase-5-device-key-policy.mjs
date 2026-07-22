const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

export const EVIDENCE = ['CF-EV-P5-UT-002', 'CF-EV-P5-E2E-001', 'CF-EV-P5-SEC-003', 'CF-EV-P5-PERF-001'];

export function validatePhase5DeviceKeyLifecycle({ manifest, sprint, source, browserTest, routeSource,
    migrationManifest, wrangler, indexSource, packageJson, workflow, evidenceSources, implementationSource }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.story === 'CF-P5-003' && manifest.status === 'PASS', 'CF-P5-003 identity/status drifted');
    assert(manifest.gate_authorization?.id === 'P5-G2'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P5-003'
        && manifest.gate_authorization.next_gate === 'P5-G2A', 'P5-G2 authorization drifted');
    assert(sprint.stories?.slice(0, 5).every(story => story.status === 'PASS')
        && sprint.stories?.slice(5).every(story => story.status === 'PLANNED'), 'Sprint disposition drifted');

    const implementation = manifest.implementation || {};
    assert(implementation.runtime === 'secure-context-browser-web-crypto-and-indexeddb'
        && implementation.device_pair === 'extractable-P256-ECDH-during-enrollment-only'
        && implementation.persistent_value === 'exact-four-field-encrypted-private-key-envelope-only'
        && implementation.local_protection === 'PBKDF2-HMAC-SHA256-600000-A256GCM-bound-AAD'
        && implementation.unlocked_key === 'non-extractable-private-CryptoKey-deriveBits-only'
        && implementation.pair_integrity === 'bidirectional-ephemeral-ECDH-proof'
        && implementation.fallback === 'none-fail-closed-export-free-guidance', 'Lifecycle profile drifted');
    assert(sameSet(implementation.auto_lock || [], ['visibility-hidden', 'pagehide', 'beforeunload', 'freeze'])
        && sameSet(implementation.explicit_lock || [], ['manual', 'logout', 'account-change', 'workspace-change',
            'membership-loss', 'device-revocation']), 'Lifecycle clearing matrix drifted');

    for (const token of ["iterations: 600_000", "name: 'ECDH'", "namedCurve: PROFILE.curve",
        "exportKey('pkcs8'", "name: 'PBKDF2'", "name: 'AES-GCM'", 'tagLength: 128',
        "false, ['deriveBits']", 'encrypted-private-key-envelopes', '.add(exactEnvelope',
        "fail('LOCAL_UNLOCK_FAILED')", "addEventListener?.('pagehide'", "addEventListener?.('visibilitychange'",
        'first[index] ^ second[index]', 'pkcs8?.fill(0)', 'secret.fill(0)']) {
        assert(source.includes(token), `Lifecycle token missing: ${token}`);
    }
    for (const prohibited of [/Math\.random\s*\(/, /console\./, /localStorage|sessionStorage|caches\./,
        /fetch\s*\(/, /AES-CBC|AES-CTR|SHA-1|MD5/, /plaintextFallback|passThroughOnException/]) {
        assert(!prohibited.test(source), `Prohibited lifecycle pattern: ${prohibited}`);
    }

    const matrix = manifest.browser_matrix || {};
    assert(sameSet(matrix.required || [], ['chromium', 'firefox', 'webkit'])
        && matrix.real_web_crypto === true && matrix.real_indexeddb === true
        && matrix.wrong_secret_and_binding_error === 'LOCAL_UNLOCK_FAILED'
        && matrix.pbkdf2_600k_max_ms === 2500 && matrix.protect_or_unlock_target_ms === 2000,
    'Browser qualification matrix drifted');
    for (const token of ['chromium, firefox, webkit', 'indexedDB.deleteDatabase',
        'wrongCodes.length, 13', "code === 'LOCAL_UNLOCK_FAILED'", "extractable: false, usages: ['deriveBits']",
        'interruptedUnlock', 'storageUnavailableCode', 'contextSwitchState', 'pagehideState', 'reloadState', '2_500']) {
        assert(browserTest.includes(token), `Browser evidence token missing: ${token}`);
    }
    assert(packageJson.scripts?.['test:device-key:e2e'] === 'node tests/browser-device-key-lifecycle.mjs'
        && packageJson.scripts?.['test:e2e']?.includes('test:device-key:e2e'), 'Browser lifecycle is not a release gate');
    assert(workflow.includes('playwright install --with-deps chromium firefox webkit'), 'CI browser matrix is incomplete');

    const scope = manifest.scope || {};
    for (const key of ['runtime_route_calls', 'schema_migrations_added', 'wrangler_bindings_added',
        'remote_writes', 'secrets_created_or_changed', 'personal_guest_eager_phase5_crypto_bytes']) {
        assert(scope[key] === 0, `Scope exceeded: ${key}`);
    }
    for (const key of ['preview_deploy_authorized', 'production_identity_enabled', 'collaboration_enabled']) {
        assert(scope[key] === false, `Prohibited activation: ${key}`);
    }
    assert(!indexSource.includes('device-key-lifecycle') && !routeSource.includes('device-key-lifecycle'),
        'Device lifecycle became eager or route-reachable');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M',
        'Unauthorized migration added');
    assert(!wrangler.env?.production?.d1_databases && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false',
        'Production boundary drifted');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'Evidence inventory drifted');
    for (const [id, sourceText] of Object.entries(evidenceSources)) {
        assert(sourceText.startsWith(`# ${id} `) && /^Status: PASS$/m.test(sourceText)
            && sourceText.includes('CF-P5-003'), `${id} is incomplete`);
    }
    assert(/^Status: PASS$/m.test(implementationSource)
        && implementationSource.includes('No request handler imports the browser lifecycle'), 'Implementation report incomplete');
    assert(manifest.next_decision?.gate === 'P5-G2A'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P5-004-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P5-G2A ceiling drifted');
    return true;
}
