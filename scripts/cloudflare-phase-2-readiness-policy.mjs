const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const sorted = values => [...values].sort();
const sameSet = (actual, expected) => same(sorted(actual), sorted(expected));
const REMOTE_BINDING_KEYS = ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'queues', 'analytics_engine_datasets', 'hyperdrive'];
const REQUIRED_INDEXES = [
    'idx_memberships_user_state_workspace',
    'idx_invitations_workspace_state_expiry_id',
    'idx_devices_user_state_id',
    'idx_workspace_key_versions_state_version',
    'idx_workspace_key_envelopes_target_keyset',
    'idx_document_revisions_workspace_time_revision',
    'idx_mutation_results_expiry_id',
    'idx_retention_holds_workspace_status_expiry_id'
];
const REQUIRED_TENANT_GUARDS = [
    'invitations_tenant_guard_insert', 'invitations_tenant_guard_update',
    'memberships_workspace_immutable', 'invitations_workspace_immutable',
    'workspace_key_versions_tenant_guard', 'workspace_key_versions_sequence_guard',
    'workspace_key_versions_workspace_immutable', 'workspaces_current_key_guard',
    'workspace_key_envelopes_tenant_guard', 'workspace_key_envelopes_workspace_immutable',
    'documents_tenant_guard', 'documents_workspace_immutable',
    'document_revisions_tenant_guard', 'mutation_results_tenant_guard',
    'mutation_results_workspace_immutable', 'audit_events_tenant_guard',
    'retention_holds_tenant_guard', 'retention_holds_workspace_immutable',
    'workspaces_id_immutable'
];
const containsKey = (value, keys) => {
    if (!value || typeof value !== 'object') return false;
    if (Object.keys(value).some(key => keys.includes(key))) return true;
    return Object.values(value).some(child => containsKey(child, keys));
};

export function extractQueryContracts(source) {
    const contracts = [];
    const pattern = /\{\s*id:\s*'([^']+)'([\s\S]*?)stableKeyset:\s*\[([^\]]*)\]\s*\}/g;
    for (const match of source.matchAll(pattern)) {
        const body = match[2];
        const sql = body.match(/sql:\s*`([\s\S]*?)`/)?.[1] || '';
        const expectedIndex = body.match(/expectedIndex:\s*'([^']+)'/)?.[1] || '';
        contracts.push({
            id: match[1],
            sql,
            expectedIndex,
            workspaceScoped: /workspaceScoped:\s*true/.test(body),
            mutableCollection: /mutableCollection:\s*true/.test(body),
            stableKeyset: [...match[3].matchAll(/'([^']+)'/g)].map(item => item[1])
        });
    }
    return contracts;
}

export function validatePhase2LocalReadiness({ readiness, querySource, migrationSources, evidenceSources, wrangler }) {
    assert(readiness?.schema_version === 1 && readiness.phase === 'CF-P2' && readiness.story === 'CF-P2-003', 'Unsupported CF-P2-003 readiness contract');
    assert(readiness.status === 'PASS' && readiness.approved_start === '2026-07-16', 'CF-P2-003 implementation status drifted');
    assert(readiness.gate_candidate?.id === 'P2-G2'
        && readiness.gate_candidate.decision === 'APPROVED'
        && readiness.gate_candidate.approved_at === '2026-07-16'
        && readiness.gate_candidate.authorized_story === 'CF-P2-004', 'P2-G2 approval provenance drifted');
    assert(sameSet(readiness.gate_candidate.required_reviewers || [], ['Security Reviewer', 'Technical Lead', 'Senior QA']), 'P2-G2 reviewer inventory drifted');
    assert(Object.values(readiness.environment_boundary || {}).every(value => value === false), 'CF-P2-003 must not authorize remote D1 or collaboration');
    assert(!containsKey(wrangler, REMOTE_BINDING_KEYS), 'Wrangler contains a remote binding during CF-P2-003');
    assert(wrangler.vars?.COLLABORATION_ENABLED === 'false' && wrangler.env?.preview?.vars?.COLLABORATION_ENABLED === 'false' && wrangler.env?.production?.vars?.COLLABORATION_ENABLED === 'false', 'Collaboration must remain disabled');

    assert(readiness.representative_workload?.documents === 10000, 'Representative document scale drifted');
    assert(readiness.representative_workload?.revisions_per_hot_document === 50, 'Representative revision depth drifted');
    assert(readiness.representative_workload?.maximum_page_size === 100, 'Maximum page size drifted');
    assert((readiness.constraint_domains || []).length === 11, 'Constraint matrix is incomplete');
    assert(sameSet(readiness.required_indexes || [], REQUIRED_INDEXES), 'Required keyset index inventory drifted');
    assert(sameSet(readiness.tenant_guard_triggers || [], REQUIRED_TENANT_GUARDS), 'Tenant guard inventory drifted');

    const contracts = extractQueryContracts(querySource);
    assert(sameSet(contracts.map(contract => contract.id), readiness.approved_queries || []), 'Approved query inventory drifted');
    assert(contracts.length === 13, 'Exactly thirteen repository query contracts are required');
    assert(!/SELECT\s+\*/i.test(querySource), 'SELECT * is prohibited');
    assert(!/\bOFFSET\b/i.test(querySource), 'Offset pagination is prohibited');
    assert(!/\$\{/.test(querySource), 'Runtime SQL interpolation is prohibited');
    assert(!/document_(?:title|body)|plaintext|private_key|session_token|invitation_token/i.test(querySource), 'Protected content appears in a query contract');
    for (const contract of contracts) {
        assert(contract.sql && contract.expectedIndex, `${contract.id} lacks SQL or an index plan`);
        assert(/\bLIMIT\s+\?/i.test(contract.sql), `${contract.id} is not bounded`);
        if (contract.workspaceScoped) assert(/\bworkspace_id\s*=\s*\?/i.test(contract.sql), `${contract.id} lacks a bound workspace predicate`);
        if (contract.mutableCollection) {
            assert(/\bORDER\s+BY\b/i.test(contract.sql), `${contract.id} lacks deterministic ordering`);
            assert(contract.stableKeyset.length > 0, `${contract.id} lacks a stable keyset`);
            for (const column of contract.stableKeyset) assert(new RegExp(`\\b${column}\\b`, 'i').test(contract.sql), `${contract.id} keyset column is absent: ${column}`);
        }
    }

    const sql = Object.values(migrationSources).join('\n');
    for (const index of readiness.required_indexes || []) assert(sql.includes(`CREATE INDEX ${index}`), `Required keyset index is missing: ${index}`);
    for (const trigger of readiness.tenant_guard_triggers || []) assert(sql.includes(`CREATE TRIGGER ${trigger}`), `Required tenant guard is missing: ${trigger}`);
    assert(!/document_(?:title|body)|plaintext_dek|private_key|session_token|invitation_token/i.test(sql), 'Protected content appears in schema/index SQL');

    assert(sameSet(Object.keys(evidenceSources), readiness.evidence || []), 'CF-P2-003 evidence inventory drifted');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `), `${id} heading is invalid`);
        assert(/^Status: PASS$/m.test(source), `${id} is not PASS`);
        assert(source.includes('CF-P2-003'), `${id} does not identify CF-P2-003`);
        assert(/local-only|No remote D1/i.test(source), `${id} lacks local-only evidence`);
        assert(source.includes('P2-G2') && source.includes('APPROVED'), `${id} does not preserve the P2-G2 approval boundary`);
    }
    return true;
}
