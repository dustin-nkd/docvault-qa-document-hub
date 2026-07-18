const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export function validatePhase5ContractFreeze({ contract, sprint, apiContract, schemaContract,
    cryptoContract, freezeSource, stabilityEvidence, securityEvidence, migrations, runtimeSource }) {
    assert(contract?.schema_version === 1 && contract.phase === 'CF-P5'
        && contract.story === 'CF-P5-001' && contract.status === 'PASS', 'CF-P5-001 identity/status drifted');
    assert(sprint.status === 'ACTIVE' && sprint.authorization?.decision === 'APPROVED'
        && sprint.stories?.[0]?.status === 'PASS', 'P5-G0/story state drifted');
    assert(contract.next_gate?.id === 'P5-G1' && contract.next_gate.decision === 'APPROVED'
        && contract.next_gate.approved_on === '2026-07-18'
        && contract.next_gate.authorizes_on_approval === 'CF-P5-002-only', 'P5-G1 ceiling drifted');

    const bootstrap = contract.first_provisioner || {};
    assert(bootstrap.decision === 'stateless-deterministic-bootstrap-intent-then-atomic-create'
        && bootstrap.prepare_route === 'POST /api/v1/workspaces/bootstrap-intents'
        && bootstrap.prepare_persists_rows === false
        && same(bootstrap.workspace_id_binding, ['live-user', 'active-owner-device', 'idempotency-key'])
        && bootstrap.atomic_rows?.length === 6 && bootstrap.initial_key_version === 1
        && bootstrap.server_plaintext_dek === 'prohibited'
        && bootstrap.partial_workspace_state === 'prohibited', 'First-provisioner contract drifted');
    assert(apiContract.includes('POST /api/v1/workspaces/bootstrap-intents')
        && apiContract.includes('stores nothing and creates no workspace')
        && apiContract.includes('One D1 batch creates the mutation guard'), 'API bootstrap contract missing');

    const authority = contract.provisioning_authority || {};
    assert(same(authority.wrapper_roles, ['owner', 'admin'])
        && authority.wrapper_current_envelope === 'unrevoked-same-workspace-and-current-version-required'
        && authority.readiness_source === 'server-derived-only'
        && authority.mutation === 'guard-envelope-readiness-audit-result-one-batch',
    'Provisioning authority drifted');

    const rotation = contract.rotation_schema || {};
    assert(rotation.schema_10_sufficient === false && rotation.migration_required === true
        && rotation.planned_sequence === 11 && rotation.migration_type === 'forward-only-additive'
        && rotation.migration_authorized === false && rotation.remote_apply_authorized === false
        && rotation.authorization_gate === 'P5-G2C-M'
        && rotation.tables?.workspace_key_rotations?.length === 15
        && rotation.tables?.workspace_key_rotation_targets?.length === 6
        && rotation.invariants?.length === 7, 'Rotation persistence decision drifted');
    assert(schemaContract.includes('Phase 5 additive rotation expansion (frozen, not yet applied)')
        && schemaContract.includes('Schema 10 cannot represent'), 'Schema expansion contract missing');
    assert(migrations.entries?.length === 10 && !migrations.entries.some(item => item.sequence === 11),
        'Sequence 11 migration was created before authorization');

    const vectors = contract.vector_contract || {};
    const families = vectors.families || [];
    assert(vectors.manifest_version === 'CF-CRYPTO-V1' && vectors.source_classification === 'synthetic-only'
        && vectors.immutable_after_gate === 'P5-G1' && vectors.independent_oracle_required === true
        && vectors.agreement_percent === 100
        && same(families.map(item => item.id), ['CANON', 'JWK', 'LOCAL', 'WRAP', 'LIFECYCLE', 'CANARY'])
        && families.every(item => item.cases?.length === 5)
        && new Set(families.flatMap(item => item.cases)).size === 30
        && vectors.fixture_fields?.length === 10, 'Vector catalog drifted');
    assert(cryptoContract.includes('## 11. Test-vector manifest')
        && cryptoContract.includes('At least two independent implementations'), 'Crypto vector authority missing');

    assert(contract.scope?.deferred_to_phase_6?.length === 5
        && contract.authorization_boundary
        && Object.values(contract.authorization_boundary).every(value => value === false),
    'Scope or authorization boundary drifted');
    assert(/Status: PASS/.test(freezeSource) && /No runtime route, migration file/.test(freezeSource)
        && /Status: PASS/.test(stabilityEvidence) && /Status: PASS/.test(securityEvidence),
    'CF-P5-001 evidence incomplete');
    assert(!runtimeSource.includes('workspaces/bootstrap-intents'), 'Runtime route implemented before later authorization');
    return true;
}
