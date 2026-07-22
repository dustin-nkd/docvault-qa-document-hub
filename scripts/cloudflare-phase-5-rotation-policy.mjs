const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sameSet = (actual, expected) => JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());

export const EVIDENCE = ['CF-EV-P5-UT-005', 'CF-EV-P5-INT-003', 'CF-EV-P5-E2E-002',
    'CF-EV-P5-SEC-006', 'CF-EV-P5-OPS-001'];

export function validatePhase5Rotation({ manifest, sprint, contract, migrationManifest,
    migrationSource, serviceSource, indexSource, workersTest, routeSource, wrangler,
    evidenceSources, implementationSource }) {
    assert(manifest?.phase === 'CF-P5' && manifest.story === 'CF-P5-006' && manifest.status === 'PASS',
        'CF-P5-006 identity/status drifted');
    assert(manifest.gate_authorization?.entry_gate === 'P5-G2C'
        && manifest.gate_authorization.migration_gate === 'P5-G2C-M'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_migration === 12
        && manifest.gate_authorization.remote_apply_authorized === false
        && manifest.gate_authorization.next_gate === 'P5-G3', 'P5-G2C/P5-G2C-M authorization drifted');
    assert(['P5-G2C-M', 'P5-G3'].includes(sprint.authorization?.gate) && ['CF-P5-006', 'CF-P5-007'].includes(sprint.authorization.authorized_story)
        && sprint.stories?.slice(0, 6).every(story => story.status === 'PASS')
        && ['PLANNED','IN_PROGRESS'].includes(sprint.stories?.[6]?.status) && sprint.stories?.[7]?.status === 'PLANNED', 'Sprint disposition drifted');
    assert(contract.rotation_schema?.migration_authorized === true
        && contract.rotation_schema.authorization_decision === 'APPROVED'
        && contract.rotation_schema.planned_sequence === 12
        && contract.rotation_schema.remote_apply_authorized === false, 'Rotation contract authorization drifted');

    const migration = migrationManifest.entries?.[11];
    assert(migrationManifest.entries?.length === 12 && migration?.sequence === 12
        && migration.story === 'CF-P5-006' && migration.gate === 'P5-G2C-M'
        && migration.filename === manifest.schema.filename && migration.sha256 === manifest.schema.sha256
        && migration.backfill === 'none', 'Migration 12 inventory drifted');
    for (const token of ['CREATE TABLE workspace_key_rotations', 'CREATE TABLE workspace_key_rotation_targets',
        'uq_workspace_key_rotations_preparing', 'workspace_key_rotation_targets_insert_guard',
        'workspace_key_rotation_envelope_guard', 'workspaces_key_rotation_commit_guard',
        'workspace key rotation commit is incomplete or stale', 'schema_version = 12']) {
        assert(migrationSource.includes(token), `Migration 12 token missing: ${token}`);
    }

    for (const token of ['startWorkspaceKeyRotation', 'readWorkspaceKeyRotation',
        'stageWorkspaceRotationEnvelope', 'commitWorkspaceKeyRotation', 'abortWorkspaceKeyRotation',
        'readWorkspaceRecoveryState', 'rotation.start', 'rotation.envelope.stage',
        'terminal_cryptographic_loss', 'd1RestoreRecoversKeys: false']) {
        assert(serviceSource.includes(token), `Rotation service token missing: ${token}`);
    }
    for (const prohibited of [/console\./, /fetch\s*\(/, /Math\.random\s*\(/, /private_jwk/i,
        /plaintext.{0,16}dek/i, /recoverySecret/i, /serverReset:\s*true/i]) {
        assert(!prohibited.test(serviceSource), `Prohibited rotation service pattern: ${prohibited}`);
    }
    assert(indexSource.includes("export * from './rotation-service'"), 'Rotation service export missing');
    assert((workersTest.match(/\bit\s*\(/g) || []).length === 9
        && workersTest.includes('twenty concurrent Owner proposals')
        && workersTest.includes('changed snapshot') && workersTest.includes('same n plus one')
        && workersTest.includes('terminal loss') && workersTest.includes('alternate key-ready Admin'),
    'Workers rotation/recovery inventory drifted');

    assert(!routeSource.includes('rotation-service') && !routeSource.includes('key-rotations'),
        'Rotation became route-reachable before P5-G4');
    for (const key of ['runtime_route_calls', 'wrangler_bindings_added', 'remote_writes', 'secrets_created_or_changed'])
        assert(manifest.scope?.[key] === 0, `Scope exceeded: ${key}`);
    assert(manifest.scope.preview_deploy_authorized === false && manifest.scope.collaboration_enabled === false
        && !wrangler.env?.production?.d1_databases
        && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Activation boundary drifted');
    assert(manifest.recovery?.all_provisioners_lost === 'terminal-cryptographic-loss'
        && manifest.recovery.server_reset === false && manifest.recovery.server_escrow === false
        && manifest.recovery.recovery_artifact === false && manifest.recovery.operator_key_recovery === false
        && manifest.recovery.d1_restore_recovers_keys === false, 'No-escrow recovery contract drifted');
    assert(sameSet(manifest.evidence || [], EVIDENCE) && sameSet(Object.keys(evidenceSources), EVIDENCE),
        'Evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources))
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source) && source.includes('CF-P5-006'),
            `${id} is incomplete`);
    assert(/^Status: PASS$/m.test(implementationSource)
        && implementationSource.includes('No HTTP route imports the rotation service')
        && implementationSource.includes('D1 restore recovers ciphertext and metadata only'),
    'Implementation report incomplete');
    assert(manifest.next_decision?.gate === 'P5-G3' && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.remote_authorization_gate === 'P5-G4'
        && manifest.next_decision.remote_changes_authorized === false, 'P5-G3 ceiling drifted');
    return true;
}
