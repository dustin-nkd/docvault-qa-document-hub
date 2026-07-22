const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

export const EVIDENCE = ['CF-EV-P5-UT-004', 'CF-EV-P5-INT-002', 'CF-EV-P5-SEC-005', 'CF-EV-P5-QA-002'];

export function validatePhase5WorkspaceKeys({ manifest, sprint, migrationManifest, serviceSource,
    indexSource, primitivesSource, workersTest, routeSource, wrangler, evidenceSources,
    implementationSource }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P5'
        && manifest.story === 'CF-P5-005' && manifest.status === 'PASS', 'CF-P5-005 identity/status drifted');
    assert(manifest.gate_authorization?.id === 'P5-G2B'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P5-005'
        && manifest.gate_authorization.next_gate === 'P5-G2C', 'P5-G2B authorization drifted');
    assert(sprint.authorization?.gate === 'P5-G2B' && sprint.authorization.authorized_story === 'CF-P5-005'
        && sprint.stories?.slice(0, 5).every(story => story.status === 'PASS')
        && sprint.stories?.slice(5).every(story => story.status === 'PLANNED'), 'Sprint disposition drifted');
    assert(migrationManifest.entries?.length === 11 && manifest.schema?.migration_added === false
        && manifest.schema.rotation_sequence_reserved === 12
        && manifest.schema.remote_apply_authorized === false, 'Schema authorization drifted');

    for (const token of ['createWorkspaceBootstrapIntent', 'bootstrapWorkspaceKey',
        'readProvisioningTarget', 'provisionWorkspaceEnvelope', 'readWorkspaceKeyReadiness',
        'initial_provision', 'workspace_key_envelopes', 'wrapper.role IN (\'owner\',\'admin\')',
        'current.target_device_id = wd.id', 'td.fingerprint = ?', 'mutation_results', 'audit_events']) {
        assert(serviceSource.includes(token), `Workspace-key service token missing: ${token}`);
    }
    assert(primitivesSource.includes('generateWorkspaceDek') && primitivesSource.includes('random.bytes(32)'),
        'Client workspace DEK generation drifted');
    for (const prohibited of [/console\./, /fetch\s*\(/, /Math\.random\s*\(/, /private_jwk/i,
        /pkcs8/i, /plaintext.{0,16}dek/i]) {
        assert(!prohibited.test(serviceSource), `Prohibited workspace-key service pattern: ${prohibited}`);
    }
    assert(indexSource.includes("export * from './workspace-key-service'"), 'Workspace-key exports drifted');
    assert((workersTest.match(/\bit\s*\(/g) || []).length === 8
        && workersTest.includes('32 identical submissions')
        && workersTest.includes('Editor, pending, removed, and cross-workspace')
        && workersTest.includes('never stores plaintext DEK or private key material'), 'Workers key test inventory drifted');

    assert(!/workspace-keys/.test(routeSource), 'Workspace-key services became route-reachable before P5-G4');
    for (const key of ['runtime_route_calls', 'wrangler_bindings_added', 'remote_writes', 'secrets_created_or_changed']) {
        assert(manifest.scope?.[key] === 0, `Scope exceeded: ${key}`);
    }
    assert(manifest.scope.preview_deploy_authorized === false && manifest.scope.collaboration_enabled === false
        && !wrangler.env?.production?.d1_databases
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Activation boundary drifted');
    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'Evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P5-005'), `${id} is incomplete`);
    }
    assert(/^Status: PASS$/m.test(implementationSource)
        && implementationSource.includes('No HTTP route imports the workspace-key service'),
    'Implementation report incomplete');
    assert(manifest.next_decision?.gate === 'P5-G2C'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P5-006-only'
        && manifest.next_decision.conditional_migration_gate === 'P5-G2C-M'
        && manifest.next_decision.remote_changes_authorized === false, 'P5-G2C ceiling drifted');
    return true;
}
