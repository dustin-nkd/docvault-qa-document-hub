const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);

export const SOURCES = [
    'functions/_lib/audit/audit-reader.ts',
    'functions/_lib/audit/cursor.ts',
    'functions/_lib/audit/event-registry.ts',
    'functions/_lib/audit/index.ts',
    'functions/_lib/invitations/invitation-lifecycle.ts',
    'functions/_lib/memberships/membership-administration.ts',
    'functions/_lib/persistence/mutation-recipes.ts'
];

export const EVIDENCE = [
    'CF-EV-P4-UT-004', 'CF-EV-P4-INT-005', 'CF-EV-P4-SEC-006', 'CF-EV-P4-QA-004'
];

export function validatePhase4AuditScopedReads({ manifest, prerequisite, sourceFiles,
    workersTestSource, routeSource, wrangler, migrationManifest, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P4'
        && manifest.story === 'CF-P4-006' && manifest.status === 'PASS',
    'Unsupported CF-P4-006 evidence');
    assert(manifest.gate_authorization?.id === 'P4-G5'
        && manifest.gate_authorization.decision === 'APPROVED'
        && manifest.gate_authorization.authorized_story === 'CF-P4-006'
        && manifest.gate_authorization.next_gate === 'P4-G6', 'P4-G5 authorization drifted');
    assert(prerequisite?.story === 'CF-P4-005' && prerequisite.status === 'PASS'
        && prerequisite.next_decision?.gate === 'P4-G5'
        && prerequisite.next_decision.recommendation === 'APPROVE',
    'CF-P4-005 prerequisite drifted');

    assert(same(manifest.operations,
        ['list-audit-events', 'filter-audit-events', 'page-audit-events']),
    'Audit operation inventory drifted');
    assert(same(manifest.authority?.allowed_roles, ['owner', 'admin'])
        && same(manifest.authority?.denied_roles, ['editor', 'viewer'])
        && manifest.authority.authorization_repeated_per_page === true
        && manifest.authority.non_enumerating_cross_tenant_denial === true
        && manifest.authority.client_authority_fields === 0,
    'Audit authority contract drifted');
    assert(same(manifest.pagination?.order, ['server_time-desc', 'sequence-desc'])
        && manifest.pagination.default_limit === 50
        && manifest.pagination.maximum_limit === 100
        && manifest.pagination.cursor_ttl_minutes === 15
        && manifest.pagination.cursor_integrity === 'hmac-sha256'
        && manifest.pagination.cursor_bindings?.length === 7,
    'Audit pagination contract drifted');
    assert(manifest.privacy?.event_registry === 'closed-versioned-allow-list'
        && manifest.privacy.schema_version === 8
        && manifest.privacy.raw_metadata_returned === false
        && manifest.privacy.content_search_supported === false
        && manifest.privacy.unknown_event_behavior === 'fail-entire-page-closed',
    'Audit privacy contract drifted');

    assert(same(Object.keys(sourceFiles).sort(), [...SOURCES].sort()),
        'Audit source inventory drifted');
    const reader = sourceFiles['functions/_lib/audit/audit-reader.ts'];
    const cursor = sourceFiles['functions/_lib/audit/cursor.ts'];
    const registry = sourceFiles['functions/_lib/audit/event-registry.ts'];
    for (const control of ['authorizeWorkspaceAction', "action: 'audit.read'", 'workspace_id = ?',
        'ORDER BY server_time DESC, sequence DESC LIMIT ?', 'MAXIMUM_PAGE_SIZE = 100',
        'DEFAULT_PAGE_SIZE = 50', 'readBounded', "throw new AuditReadError('AUDIT_UNAVAILABLE')"]) {
        assert(reader.includes(control), `Audit read control missing: ${control}`);
    }
    assert(reader.indexOf('authorizeWorkspaceAction') < reader.indexOf('cursorCodec.verify'),
        'Audit cursor is verified before live authorization');
    for (const control of ['hmacSign', 'hmacVerify', "route: 'audit-events'",
        'environment', 'workspaceId', 'eventType', 'occurredFrom', 'occurredTo',
        'CURSOR_TTL_MS = 15 * 60 * 1_000']) {
        assert(cursor.includes(control), `Audit cursor control missing: ${control}`);
    }
    for (const control of ['AUDIT_EVENT_TYPES', 'schemaVersion !== 8', 'exactKeys',
        'approvedBefore', 'approvedAfter', 'assertAuditWriteShape']) {
        assert(registry.includes(control), `Audit registry control missing: ${control}`);
    }
    for (const writer of ['functions/_lib/invitations/invitation-lifecycle.ts',
        'functions/_lib/memberships/membership-administration.ts',
        'functions/_lib/persistence/mutation-recipes.ts']) {
        assert(sourceFiles[writer].includes('assertAuditWriteShape'),
            `Audit writer bypasses the registry: ${writer}`);
    }
    const combined = Object.values(sourceFiles).join('\n');
    assert(!/SELECT\s+\*|Math\.random\s*\(|console\.(?:log|error)\s*\(|passThroughOnException|\bas\s+(?:any|unknown)\b/.test(combined),
        'Prohibited audit implementation pattern');

    assert(manifest.workers_test_file === 'tests/cloudflare/audit-scoped-reads.workers.test.ts'
        && manifest.workers_test_count === 8
        && (workersTestSource.match(/\bit\s*\(/g) || []).length === 8,
    'Audit Workers test inventory drifted');
    for (const phrase of ['versioned event registry', 'signs opaque cursors',
        'allows Owner and Admin scoped reads', 'without gaps or duplicates',
        'authoritative RFC3339 time filters', 'denies Editor, Viewer, non-member',
        'repeats live authorization', 'fails the whole page closed']) {
        assert(workersTestSource.includes(phrase), `Audit coverage missing: ${phrase}`);
    }

    for (const [key, value] of Object.entries(manifest.scope || {})) {
        assert(value === 0 || value === false, `CF-P4-006 expanded runtime scope: ${key}`);
    }
    assert(!routeSource.includes('_lib/audit') && !routeSource.includes('listAuditEvents('),
        'Audit reads were routed before authorization');
    assert(migrationManifest.entries?.length === 11 && migrationManifest.entries[10]?.sequence === 11 && migrationManifest.entries[10]?.story === 'CF-P5-004' && migrationManifest.entries[10]?.gate === 'P5-G2A-M',
        'CF-P4-006 added an unauthorized migration');
    assert(!wrangler.env?.production?.d1_databases
        && [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars]
            .every(value => value?.COLLABORATION_ENABLED === 'false'),
    'Collaboration runtime boundary drifted');

    assert(same(Object.keys(evidenceSources).sort(), [...EVIDENCE].sort()),
        'CF-P4-006 evidence inventory drifted');
    for (const [evidenceId, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${evidenceId} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P4-006') && source.includes('P4-G5'),
        `${evidenceId} is not PASS evidence`);
    }
    assert(manifest.next_decision?.gate === 'P4-G6'
        && manifest.next_decision.recommendation === 'APPROVE'
        && manifest.next_decision.authorizes === 'CF-P4-007-only'
        && manifest.next_decision.remote_changes_authorized === false,
    'P4-G6 recommendation drifted');
    return true;
}
