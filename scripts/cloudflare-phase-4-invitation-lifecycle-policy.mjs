const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const SOURCES = [
    'functions/_lib/invitations/token.ts',
    'functions/_lib/invitations/github-resolver.ts',
    'functions/_lib/invitations/invitation-lifecycle.ts',
    'functions/_lib/invitations/index.ts',
    'functions/_lib/persistence/mutation-recipes.ts'
];

export const EVIDENCE = [
    'CF-EV-P4-UT-002', 'CF-EV-P4-INT-003', 'CF-EV-P4-SEC-004', 'CF-EV-P4-QA-002'
];

export function validatePhase4InvitationLifecycle({ manifest, prerequisite, sourceFiles,
    workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-004' && manifest.status === 'PASS',
    'Unsupported CF-P4-004 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G3'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-004'
        && manifest.gate_authorization.next_gate === 'P4-G4', 'P4-G3 authorization drifted');
    assert(prerequisite?.story === 'CF-P4-003' && prerequisite.status === 'PASS'
        && prerequisite.next_decision?.gate === 'P4-G3'
        && prerequisite.next_decision.recommendation === 'APPROVE',
    'CF-P4-003 prerequisite drifted');

    assert(same(manifest.lifecycle?.operations,
        ['create', 'replace', 'list-pending', 'bootstrap', 'revoke', 'accept'])
        && same(manifest.lifecycle?.states, ['pending', 'accepted', 'revoked', 'expired'])
        && manifest.lifecycle.expiry_hours === 72
        && manifest.lifecycle.expiry_boundary === 'server-time-exclusive'
        && manifest.lifecycle.accepted_membership_state === 'pending_key'
        && manifest.lifecycle.single_use && manifest.lifecycle.replacement_invalidates_prior
        && manifest.lifecycle.terminal_states_immutable, 'Invitation lifecycle contract drifted');
    assert(manifest.capability?.secret_bits === 256
        && manifest.capability.format === 'opaque-invitation-id.secret'
        && manifest.capability.verification === 'webcrypto-hmac-sha256'
        && manifest.capability.storage === 'digest-only'
        && manifest.capability.returned_once && manifest.capability.replay_token_redacted
        && manifest.capability.url_transport === 'fragment-only', 'Invitation capability contract drifted');
    assert(manifest.identity?.provider === 'github'
        && manifest.identity.authority === 'immutable-numeric-provider-subject'
        && manifest.identity.display_login_authoritative === false
        && manifest.identity.lookup_redirect === 'manual'
        && manifest.identity.lookup_timeout_ms === 5_000
        && manifest.identity.maximum_response_bytes === 8_192, 'Invitation identity contract drifted');
    assert(same(manifest.authority?.owner_offer_roles, ['admin', 'editor', 'viewer'])
        && same(manifest.authority?.admin_offer_roles, ['editor', 'viewer'])
        && same(manifest.authority?.editor_viewer_offer_roles, [])
        && manifest.authority.acceptance_identity === 'exact-provider-subject-and-active-device'
        && manifest.authority.client_authority_fields === 0, 'Invitation authority contract drifted');
    assert(manifest.invariants?.length === 12, 'Invitation invariant inventory drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()),
        'Invitation source inventory drifted');
    const token = sourceFiles['functions/_lib/invitations/token.ts'];
    const provider = sourceFiles['functions/_lib/invitations/github-resolver.ts'];
    const lifecycle = sourceFiles['functions/_lib/invitations/invitation-lifecycle.ts'];
    const recipes = sourceFiles['functions/_lib/persistence/mutation-recipes.ts'];
    for (const control of ['random.bytes(32)', "name: 'HMAC'", "hash: 'SHA-256'",
        "crypto.subtle.verify", 'decodeBase64Url', 'INVITATION_TOKEN_INVALID']) {
        assert(token.includes(control), `Invitation token control missing: ${control}`);
    }
    for (const control of ["redirect: 'manual'", 'AbortController', 'MAXIMUM_RESPONSE_BYTES = 8_192',
        'REQUEST_TIMEOUT_MS = 5_000', 'providerSubject: String(value.id)',
        'headers.Authorization = `Bearer ${configuration.accessToken}`']) {
        assert(provider.includes(control), `Invitation provider control missing: ${control}`);
    }
    for (const control of ['authorizeWorkspaceAction', "'invitation.create'", "'invitation.revoke'",
        "'invitation.list'", 'openAuthorizationSession(database)', 'executeGuardedBatch',
        'executeIdempotentRecipe', "membershipState: 'pending_key'", 'identityMatch',
        "input.serverTime >= row.expires_at", 'parseCreateResult(replay, true, null)', 'replacement_of']) {
        assert(lifecycle.includes(control), `Invitation lifecycle control missing: ${control}`);
    }
    const authorizationIndex = lifecycle.indexOf("await authorize(database, 'invitation.create'");
    const providerLookupIndex = lifecycle.indexOf('dependencies.identityResolver.resolveLogin');
    assert(authorizationIndex >= 0 && providerLookupIndex > authorizationIndex,
        'Provider lookup moved before RBAC');
    assert(recipes.includes("VALUES (?, ?, ?, ?, 'invitation.accept', ?, ?, ?, ?, 201")
        && recipes.includes('ON CONFLICT(workspace_id, user_id) DO UPDATE SET')
        && recipes.includes("WHERE memberships.state = 'removed'")
        && recipes.includes('token_digest = ? AND expires_at > ?'),
    'Invitation acceptance atomicity or expiry drifted');

    const combined = Object.values(sourceFiles).join('\n');
    assert(!/SELECT\s+\*|Math\.random\s*\(|console\.(?:log|error)\s*\(|passThroughOnException|\bas\s+(?:any|unknown)\b/.test(combined),
        'Prohibited invitation implementation pattern');
    assert(!/invitation_token\s+(?:TEXT|BLOB)|raw_token\s+(?:TEXT|BLOB)/i.test(combined),
        'Raw invitation capability storage introduced');

    assert(manifest.workers_test_file === 'tests/cloudflare/invitation-lifecycle.workers.test.ts'
        && manifest.workers_test_count === 8
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8,
    'Invitation Workers test inventory drifted');
    for (const phrase of ['issues 256-bit structured tokens', 'normalizes provider lookups',
        'creates once, stores only the digest', 'applies Owner/Admin ceilings',
        'atomically replaces duplicate pending invitations', 'bootstraps minimum context',
        'enforces revoke ceilings, expiry boundaries', 'rejoins a removed member']) {
        assert(workersTestSource.includes(phrase), `Invitation coverage missing: ${phrase}`);
    }

    for (const [key, value] of Object.entries(manifest.scope || {})) {
        assert(value === 0 || value === false, `CF-P4-004 expanded runtime scope: ${key}`);
    }
    assert(!routeSource.includes('_lib/invitations') && !routeSource.includes('createInvitation(')
        && !routeSource.includes('acceptInvitation('), 'Invitation lifecycle was routed before authorization');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M', 'CF-P4-004 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'),
    'Collaboration runtime boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()),
        'CF-P4-004 evidence inventory drifted');
    for (const [evidenceId, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${evidenceId} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-004') && source.includes('P4-G3'),
        `${evidenceId} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P4-G4'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-005-only'
        && manifest.next_decision.remote_changes_authorized === false,
    'P4-G4 recommendation drifted');
    return true;
}
