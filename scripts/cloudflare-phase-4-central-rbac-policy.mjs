const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
export const SOURCES = [
    'functions/_lib/rbac/policy.ts',
    'functions/_lib/rbac/repository.ts',
    'functions/_lib/rbac/index.ts'
];
export const EVIDENCE = ['CF-EV-P4-UT-001', 'CF-EV-P4-INT-002', 'CF-EV-P4-SEC-003'];

export function validatePhase4CentralRbac({ manifest, prerequisite, sourceFiles, workersTestSource,
    routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-003' && manifest.status === 'PASS', 'Unsupported CF-P4-003 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G2'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-003'
        && manifest.gate_authorization.next_gate === 'P4-G3', 'P4-G2 authorization drifted');
    assert(prerequisite?.story === 'CF-P4-002' && prerequisite.status === 'PASS'
        && prerequisite.next_decision?.gate === 'P4-G2'
        && prerequisite.next_decision.recommendation === 'APPROVE', 'CF-P4-002 prerequisite drifted');

    const policy = manifest.policy || {};
    assert(policy.version === 'rbac-v1' && policy.default === 'deny'
        && policy.actions?.length === 18 && new Set(policy.actions).size === 18
        && same(policy.roles, ['owner', 'admin', 'editor', 'viewer'])
        && same(policy.membership_states, ['active', 'pending_key', 'removed'])
        && same(policy.pending_key_allowlist, ['workspace.read-status', 'device.manage-own'])
        && same(policy.lifecycle_denylist, ['workspace.export', 'workspace.delete'])
        && policy.non_enumerating_scopes?.length === 4, 'Central RBAC policy inventory drifted');
    assert(manifest.authority?.source === 'live-d1-first-primary'
        && manifest.authority.role_and_state === 'server-derived'
        && manifest.authority.device_and_key_readiness === 'server-derived'
        && manifest.authority.client_authority_fields === 0
        && manifest.authority.cached_authority === false, 'RBAC authority source drifted');
    assert(manifest.invariants?.length === 9, 'RBAC invariant inventory drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()), 'RBAC source inventory drifted');
    const policySource = sourceFiles['functions/_lib/rbac/policy.ts'];
    const repositorySource = sourceFiles['functions/_lib/rbac/repository.ts'];
    for (const action of policy.actions) assert(policySource.includes(`'${action}'`), `RBAC action missing: ${action}`);
    for (const token of ['evaluateRbacPolicy', "return deny('OPERATION_NOT_PERMITTED')",
        "deny('LAST_OWNER_REQUIRED')", "deny('RECENT_AUTHENTICATION_REQUIRED')",
        "deny('LIFECYCLE_POLICY_UNAVAILABLE')", 'PENDING_KEY_ACTIONS', 'KEY_READY_ACTIONS']) {
        assert(policySource.includes(token), `RBAC control missing: ${token}`);
    }
    assert((policySource.match(/deny\('LAST_OWNER_REQUIRED'\)/g) || []).length === 2,
        'Last-Owner protection must cover role change and removal');
    for (const token of ['openAuthorizationSession(database)', 'LEFT JOIN memberships',
        'm.workspace_id = ?', 'LEFT JOIN workspaces', 'LEFT JOIN devices',
        'workspace_key_envelopes', 'w.current_key_version', 'LIMIT 1',
        'loadWorkspaceRbacPrincipal', 'resourceScope: resolved.resourceScope',
        'authorizeWorkspaceAction']) {
        assert(repositorySource.includes(token), `Live RBAC resolver control missing: ${token}`);
    }
    const combined = `${policySource}\n${repositorySource}`;
    assert(!/SELECT\s+\*|Math\.random\s*\(|console\.(?:log|error)\s*\(|passThroughOnException|\bas\s+(?:any|unknown)\b|\$\{/.test(combined),
        'Prohibited RBAC implementation pattern');
    assert(!/new\s+Set/.test(combined), 'RBAC policy contains mutable global Set state');

    assert(manifest.workers_test_file === 'tests/cloudflare/central-rbac-policy.workers.test.ts'
        && manifest.workers_test_count === 8
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8, 'RBAC Workers test inventory drifted');
    for (const phrase of ['complete active role/action matrix', 'pending_key only own readiness',
        'Admin target ceilings', 'last-Owner invariants', 'active key-ready device',
        'tenant/resource ambiguity uniformly', 'current D1 membership authority',
        'cross-tenant, deactivated-user, device, and key readiness']) {
        assert(workersTestSource.includes(phrase), `RBAC coverage missing: ${phrase}`);
    }

    for (const [key, value] of Object.entries(manifest.scope || {})) {
        assert(value === 0 || value === false, `CF-P4-003 expanded runtime scope: ${key}`);
    }
    assert(!routeSource.includes('authorizeWorkspaceAction') && !routeSource.includes('_lib/rbac'),
        'Central RBAC was routed before authorization');
    assert(migrationManifest.entries?.length === 10, 'CF-P4-003 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'), 'Collaboration runtime boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()), 'CF-P4-003 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-003') && source.includes('P4-G2'), `${id} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P4-G3'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-004-only'
        && manifest.next_decision.remote_changes_authorized === false, 'P4-G3 recommendation drifted');
    return true;
}
