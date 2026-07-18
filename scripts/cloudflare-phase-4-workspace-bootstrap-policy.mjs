const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
export const SOURCES = [
    'functions/_lib/persistence/mutation-recipes.ts',
    'functions/_lib/workspaces/workspace-bootstrap.ts',
    'functions/_lib/workspaces/index.ts'
];
export const EVIDENCE = ['CF-EV-P4-INT-001', 'CF-EV-P4-SEC-002', 'CF-EV-P4-QA-001'];

export function validatePhase4WorkspaceBootstrap({ manifest, contract, sourceFiles, workersTestSource,
    routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-002' && manifest.status === 'PASS', 'Unsupported CF-P4-002 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G1'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-002'
        && manifest.gate_authorization.next_gate === 'P4-G2', 'P4-G1 authorization drifted');
    assert(contract?.story === 'CF-P4-001' && contract.status === 'PASS'
        && contract.gate_authorization?.next_gate === 'P4-G1', 'Phase 4 prerequisite contract drifted');

    const batch = manifest.batch_contract || {};
    assert(batch.statement_count === 5
        && same(batch.ordered_roles, ['guard', 'workspace', 'owner_membership', 'audit', 'result'])
        && batch.workspace_rows === 1 && batch.active_owner_rows === 1 && batch.audit_rows === 1
        && batch.initial_key_version_placeholder === 1
        && batch.workspace_key_version_rows === 0 && batch.workspace_key_envelope_rows === 0,
    'Atomic workspace bootstrap contract drifted');
    assert(manifest.authority?.actor_user === 'server-verified-active-user'
        && manifest.authority.actor_device === 'server-verified-active-own-device'
        && manifest.authority.role === 'server-owned-owner'
        && manifest.authority.membership_state === 'server-owned-active'
        && manifest.authority.client_authority_fields === 0, 'Workspace authority contract drifted');
    assert(same(manifest.idempotency?.binding, ['actor_user_id', 'actor_device_id', 'workspace_id',
        'operation', 'client_mutation_id']) && manifest.idempotency.request_fingerprint_bytes === 32,
    'Workspace idempotency binding drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()), 'Workspace source inventory drifted');
    const recipe = sourceFiles['functions/_lib/persistence/mutation-recipes.ts'];
    const workspaceContract = recipe.slice(recipe.indexOf("'workspace.create':"), recipe.indexOf("'invitation.accept':"));
    const service = sourceFiles['functions/_lib/workspaces/workspace-bootstrap.ts'];
    assert(workspaceContract.includes("VALUES (?, ?, ?, 'active', 1, ?, ?, ?, NULL)")
        && workspaceContract.includes("VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, ?, ?, NULL, 1)")
        && !/workspace_key_versions|workspace_key_envelopes/.test(workspaceContract),
    'Workspace recipe crossed the Phase 5 key boundary');
    for (const token of ['validateInput(input)', 'executeIdempotentRecipe', 'buildWorkspaceCreateRecipe',
        "operation: 'workspace.create'", 'stored.resultJson !== resultJson(input.workspaceId)']) {
        assert(service.includes(token), `Workspace bootstrap control missing: ${token}`);
    }
    assert(!/Math\.random\s*\(|console\.(?:log|error)\s*\(|\bas\s+(?:any|unknown)\b|\$\{/.test(service),
        'Prohibited workspace bootstrap implementation pattern');

    assert(manifest.workers_test_file === 'tests/cloudflare/workspace-bootstrap.workers.test.ts'
        && manifest.workers_test_count === 5
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 5, 'Workspace Workers test inventory drifted');
    for (const phrase of ['one workspace, one active Owner, one audit event',
        'distinct mutations race for the same workspace', 'audit event conflicts',
        'malformed input before any D1 side effect', 'revoked acting device',
        "workspace_key_versions", "workspace_key_envelopes"]) {
        assert(workersTestSource.includes(phrase), `Workspace bootstrap coverage missing: ${phrase}`);
    }

    for (const [key, value] of Object.entries(manifest.scope || {})) {
        assert(value === 0 || value === false, `CF-P4-002 expanded runtime scope: ${key}`);
    }
    assert(!routeSource.includes('bootstrapWorkspace') && !routeSource.includes('_lib/workspaces'),
        'Workspace bootstrap was routed before authorization');
    assert(migrationManifest.entries?.length === 10, 'CF-P4-002 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'), 'Collaboration runtime boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()), 'CF-P4-002 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-002') && source.includes('P4-G1'), `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P4-G2'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-003-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P4-G2 recommendation drifted');
    return true;
}
