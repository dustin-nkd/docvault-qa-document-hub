const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const SOURCES = [
    'functions/api/v1/[[path]].ts',
    'functions/_lib/collaboration/runtime-handler.ts',
    'functions/_lib/collaboration/control-plane-cursor.ts',
    'functions/_lib/collaboration/index.ts',
    'functions/_lib/invitations/github-resolver.ts'
];

export const EVIDENCE = [
    'CF-EV-P4-INT-006', 'CF-EV-P4-SEC-007', 'CF-EV-P4-QA-005', 'CF-EV-P4-OPS-001'
];

export function validatePhase4PreviewApi({ manifest, prerequisite, sourceFiles,
    workersTestSource, wrangler, migrationManifest, evidenceSources, report }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-007' && manifest.status === 'PASS',
    'Unsupported CF-P4-007 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G6'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-007'
        && manifest.gate_authorization.scope_amendment === 'preview-api-integration'
        && manifest.gate_authorization.next_gate === 'P4-G7', 'P4-G6 authorization drifted');
    assert(prerequisite?.story === 'CF-P4-006' && prerequisite.status === 'PASS'
        && prerequisite.next_decision?.gate === 'P4-G6', 'CF-P4-006 prerequisite drifted');

    assert(manifest.runtime?.environment === 'preview-only'
        && manifest.runtime.origin === 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev'
        && manifest.runtime.collaboration_flag === false
        && manifest.runtime.production_enabled === false
        && manifest.runtime.github_pages_enabled === false, 'Preview runtime boundary drifted');
    assert(manifest.route_operations?.length === 11
        && new Set(manifest.route_operations).size === 11, 'Preview operation inventory drifted');
    assert(manifest.request_policy?.exact_origin === true
        && manifest.request_policy.session_bound_csrf === true
        && manifest.request_policy.mutation_idempotency === true
        && manifest.request_policy.maximum_body_bytes === 65536
        && manifest.request_policy.maximum_query_bytes === 4096
        && manifest.request_policy.duplicate_query_keys_rejected === true,
    'Preview request policy drifted');
    assert(manifest.pagination?.cursor === 'hmac-sha256-opaque'
        && manifest.pagination.ttl_minutes === 15
        && same(manifest.pagination.bindings, ['environment', 'route', 'workspace', 'position']),
    'Preview cursor policy drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()), 'Preview source inventory drifted');
    const route = sourceFiles['functions/api/v1/[[path]].ts'];
    const handler = sourceFiles['functions/_lib/collaboration/runtime-handler.ts'];
    const cursor = sourceFiles['functions/_lib/collaboration/control-plane-cursor.ts'];
    const resolver = sourceFiles['functions/_lib/invitations/github-resolver.ts'];
    assert(route.includes('handleIdentityRuntime') && route.includes('handlePreviewCollaborationApi')
        && route.includes('handleApiRequest')
        && route.indexOf('handleIdentityRuntime(') < route.indexOf('handlePreviewCollaborationApi(')
        && route.indexOf('handlePreviewCollaborationApi(') < route.lastIndexOf('handleApiRequest('),
    'Pages API dispatch order drifted');
    for (const control of ['routeFor(pathname: string, method: string)', 'matches.find',
        'verifyCsrfToken', 'resolveSessionToken', 'enforceIdentityRateLimit', 'assertQueryKeys',
        'stableWorkspaceId', 'hmacSign', 'deriveIdentityKey',
        "'docvault:collaboration-control-plane-cursor:v1'", 'Idempotency-Key',
        'MAXIMUM_BODY_BYTES = 64 * 1_024', 'MAXIMUM_QUERY_BYTES = 4 * 1_024',
        "url.origin !== PREVIEW_ORIGIN", "runtime.mode !== 'preview-only'"]) {
        assert(handler.includes(control), `Preview API control missing: ${control}`);
    }
    for (const service of ['bootstrapWorkspace', 'listWorkspaceMembers', 'changeMemberRole',
        'removeMember', 'transferOwnership', 'createInvitation', 'listPendingInvitations',
        'revokeInvitation', 'bootstrapInvitation', 'acceptInvitation', 'listAuditEvents']) {
        assert(handler.includes(service), `Preview service integration missing: ${service}`);
    }
    for (const control of ['hmacSign', 'hmacVerify', "environment: 'preview'", 'workspaceId',
        'TTL_MS = 15 * 60 * 1_000']) {
        assert(cursor.includes(control), `Control-plane cursor control missing: ${control}`);
    }
    assert(resolver.includes('readonly accessToken?: string')
        && resolver.includes('if (configuration.accessToken !== undefined)')
        && !resolver.includes('accessToken: string;'), 'Preview GitHub resolver boundary drifted');
    assert(!/console\.(?:log|error)\s*\(|passThroughOnException|Math\.random\s*\(|\bas\s+(?:any|unknown)\b/.test(
        [handler, cursor, resolver].join('\n')), 'Prohibited Preview implementation pattern');

    assert(manifest.workers_test_file === 'tests/cloudflare/preview-api-integration.workers.test.ts'
        && manifest.workers_test_count === 4
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 4,
    'Preview Workers test inventory drifted');
    for (const phrase of ['exact isolated Preview runtime', 'fails closed on authentication',
        'workspace, opaque pagination, invitation, acceptance, and revocation',
        'authenticated control-plane reads inside the Phase 4 local p95 budget']) {
        assert(workersTestSource.includes(phrase), `Preview test coverage missing: ${phrase}`);
    }

    assert(manifest.scope?.preview_route_operations === 11
        && manifest.scope.schema_migrations_added === 0
        && manifest.scope.wrangler_bindings_added === 0
        && manifest.scope.remote_d1_mutations === 0
        && manifest.scope.production_identity_enabled === false
        && manifest.scope.production_business_routes_enabled === false
        && manifest.scope.github_pages_business_routes_enabled === false
        && manifest.scope.collaboration_enabled === false, 'Preview scope drifted');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M', 'CF-P4-007 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'),
    'Production or collaboration activation boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()),
        'CF-P4-007 evidence inventory drifted');
    for (const [evidenceId, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${evidenceId} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-007') && source.includes('P4-G6'),
        `${evidenceId} is not PASS evidence`);
    }
    assert(/^Status: PASS$/m.test(report) && report.includes('CF-P4-007') && report.includes('P4-G6')
        && report.includes('P4-G7'), 'Preview integration report drifted');
    assert(manifest.next_decision?.gate === 'P4-G7'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-008-only', 'P4-G7 recommendation drifted');
    return true;
}
