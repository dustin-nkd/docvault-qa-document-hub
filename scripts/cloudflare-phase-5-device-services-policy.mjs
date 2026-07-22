const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const sameSet = (actual, expected) => same([...actual].sort(), [...expected].sort());

export const EVIDENCE = ['CF-EV-P5-UT-003', 'CF-EV-P5-INT-001', 'CF-EV-P5-SEC-004', 'CF-EV-P5-QA-001'];

export function validatePhase5DeviceServices({ manifest, sprint, migrationManifest, migrationSource,
    repositorySource, serviceSource, indexSource, workersTest, routeSource, wrangler, evidenceSources,
    implementationSource, contract }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.story === 'CF-P5-004' && manifest.status === 'PASS', 'CF-P5-004 identity/status drifted');
    assert(manifest.gate_authorization?.id === 'P5-G2A-M'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_migration === 11
        && manifest.gate_authorization.rotation_moved_to_sequence === 12
        && manifest.gate_authorization.next_gate === 'P5-G2B', 'P5-G2A-M authorization drifted');
    assert(sprint.authorization?.gate === 'P5-G2A-M' && sprint.authorization.authorized_story === 'CF-P5-004'
        && sprint.stories?.slice(0, 4).every(story => story.status === 'PASS')
        && sprint.stories?.slice(4).every(story => story.status === 'PLANNED'), 'Sprint disposition drifted');

    const entry = migrationManifest.entries?.[10];
    assert(migrationManifest.entries?.length === 11 && entry?.sequence === 11
        && entry.story === 'CF-P5-004' && entry.gate === 'P5-G2A-M'
        && entry.slug === 'device_operation_journals'
        && same(entry.tables, ['device_mutation_results', 'device_audit_events']), 'Migration 11 drifted');
    for (const token of ['CREATE TABLE device_mutation_results', 'CREATE TABLE device_audit_events',
        'device_mutation_results_authority_guard', 'device_audit_events_authority_guard',
        'devices_security_identity_immutable', 'device_audit_events_no_update',
        'device_audit_events_no_delete', 'schema_version = 11']) {
        assert(migrationSource.includes(token), `Migration token missing: ${token}`);
    }
    assert(contract.rotation_schema?.planned_sequence === 12
        && contract.device_mutation_schema_correction?.sequence === 11
        && contract.device_mutation_schema_correction.remote_apply_authorized === false,
    'Rotation/device correction sequencing drifted');

    for (const token of ['readDeviceMutation', 'executeDeviceMutation', 'listUserDevices',
        'registerDevice', 'revokeDevice', 'inventoryDevices', 'requireActiveOwnedDevice',
        'parsePublicJwk', 'canonicalize', 'equal32']) {
        assert(repositorySource.includes(token) || serviceSource.includes(token), `Device service token missing: ${token}`);
    }
    for (const prohibited of [/private_jwk/i, /pkcs8/i, /console\./, /fetch\s*\(/, /Math\.random\s*\(/]) {
        assert(!prohibited.test(repositorySource + serviceSource), `Prohibited device-service pattern: ${prohibited}`);
    }
    assert(indexSource.includes("export * from './device-repository'")
        && indexSource.includes("export * from './device-service'"), 'Device service exports drifted');
    assert((workersTest.match(/\bit\s*\(/g) || []).length === 8
        && workersTest.includes('concurrent identical registration')
        && workersTest.includes('cross-user revocation')
        && workersTest.includes('stable keyset pagination')
        && workersTest.includes('append-only audit mutation'), 'Workers device test inventory drifted');

    assert(!/["'](?:\.\.\/){1,2}devices(?:\/|["'])/.test(routeSource),
        'Device services became route-reachable before Preview integration');
    const scope = manifest.scope || {};
    for (const key of ['runtime_route_calls', 'wrangler_bindings_added', 'remote_writes', 'secrets_created_or_changed']) {
        assert(scope[key] === 0, `Scope exceeded: ${key}`);
    }
    assert(scope.preview_deploy_authorized === false && scope.production_identity_enabled === false
        && scope.collaboration_enabled === false && !wrangler.env?.production?.d1_databases
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Activation boundary drifted');

    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'Evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P5-004'), `${id} is incomplete`);
    }
    assert(/^Status: PASS$/m.test(implementationSource)
        && implementationSource.includes('No HTTP route imports the device service'), 'Implementation report incomplete');
    assert(manifest.next_decision?.gate === 'P5-G2B'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P5-005-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P5-G2B ceiling drifted');
    return true;
}
