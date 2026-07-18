const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const SOURCES = [
    'functions/_lib/memberships/membership-administration.ts',
    'functions/_lib/memberships/index.ts',
    'functions/_lib/rbac/policy.ts',
    'functions/_lib/rbac/repository.ts',
    'functions/_lib/persistence/atomic-batch.ts'
];

export const EVIDENCE = [
    'CF-EV-P4-UT-003', 'CF-EV-P4-INT-004', 'CF-EV-P4-SEC-005', 'CF-EV-P4-QA-003'
];

export function validatePhase4MembershipAdministration({ manifest, prerequisite, sourceFiles,
    workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-005' && manifest.status === 'PASS',
    'Unsupported CF-P4-005 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G4'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-005'
        && manifest.gate_authorization.next_gate === 'P4-G5', 'P4-G4 authorization drifted');
    assert(prerequisite?.story === 'CF-P4-004' && prerequisite.status === 'PASS'
        && prerequisite.next_decision?.gate === 'P4-G4'
        && prerequisite.next_decision.recommendation === 'APPROVE',
    'CF-P4-004 prerequisite drifted');

    assert(same(manifest.operations,
        ['list-members', 'change-role', 'remove-member', 'transfer-ownership']),
    'Membership operation inventory drifted');
    assert(same(manifest.authority?.owner_role_changes, ['admin', 'editor', 'viewer'])
        && same(manifest.authority?.admin_role_changes, ['editor', 'viewer'])
        && manifest.authority.direct_owner_assignment === false
        && manifest.authority.ownership_transfer_recent_auth_minutes === 15
        && manifest.authority.ownership_transfer_confirmation === 'TRANSFER_OWNERSHIP'
        && manifest.authority.ownership_transfer_target === 'active-and-key-ready'
        && manifest.authority.client_authority_fields === 0,
    'Membership authority contract drifted');
    assert(manifest.removal_effects?.length === 6 && manifest.invariants?.length === 12,
        'Membership invariant inventory drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()),
        'Membership source inventory drifted');
    const service = sourceFiles['functions/_lib/memberships/membership-administration.ts'];
    for (const control of ['authorizeWorkspaceAction', 'openAuthorizationSession(database)',
        "'membership.change-role'", "'membership.remove'", "'ownership.transfer'",
        'role_version = role_version + 1', "state = 'removed'", "state = 'revoked'",
        'workspace_key_envelopes SET revoked_at', "state = 'rotating'",
        "confirmation !== 'TRANSFER_OWNERSHIP'", 'RECENT_AUTHENTICATION_MS',
        "eventType: string", 'executeGuardedBatch', 'equalFingerprint']) {
        assert(service.includes(control), `Membership control missing: ${control}`);
    }
    const removeGuard = service.indexOf("'membership.remove', target");
    const removalBatch = service.indexOf("operation, client_mutation_id", removeGuard);
    assert(removeGuard >= 0 && removalBatch > removeGuard,
        'Membership removal no longer authorizes before constructing its guarded batch');
    const combined = Object.values(sourceFiles).join('\n');
    assert(!/SELECT\s+\*|Math\.random\s*\(|console\.(?:log|error)\s*\(|passThroughOnException|\bas\s+(?:any|unknown)\b/.test(combined),
        'Prohibited membership implementation pattern');

    assert(manifest.workers_test_file === 'tests/cloudflare/membership-administration.workers.test.ts'
        && manifest.workers_test_count === 8
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8,
    'Membership Workers test inventory drifted');
    for (const phrase of ['lists bounded, keyset-paginated', 'changes a role once',
        'enforces Admin Editor/Viewer ceilings', 'denies self-removal',
        'atomically removes membership', 'transfers ownership atomically',
        'requires exact confirmation', 'rolls back every role and ledger write']) {
        assert(workersTestSource.includes(phrase), `Membership coverage missing: ${phrase}`);
    }

    for (const [key, value] of Object.entries(manifest.scope || {})) {
        assert(value === 0 || value === false, `CF-P4-005 expanded runtime scope: ${key}`);
    }
    assert(!routeSource.includes('_lib/memberships') && !routeSource.includes('changeMemberRole(')
        && !routeSource.includes('transferOwnership('),
    'Membership administration was routed before authorization');
    assert(migrationManifest.entries?.length === 10,
        'CF-P4-005 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'),
    'Collaboration runtime boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()),
        'CF-P4-005 evidence inventory drifted');
    for (const [evidenceId, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${evidenceId} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-005') && source.includes('P4-G4'),
        `${evidenceId} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P4-G5'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-006-only'
        && manifest.next_decision.remote_changes_authorized === false,
    'P4-G5 recommendation drifted');
    return true;
}
