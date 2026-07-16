const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const REQUIRED_TABLE_COLUMNS = {
    schema_metadata: ['singleton_id', 'schema_version', 'minimum_runtime_schema', 'maximum_runtime_schema', 'migration_set_digest', 'updated_at'],
    users: ['id', 'provider', 'provider_subject', 'display_login', 'display_name', 'avatar_url', 'status', 'created_at', 'updated_at', 'deactivated_at'],
    oauth_transactions: ['id', 'state_digest', 'pkce_verifier_envelope', 'callback_origin', 'callback_path', 'invitation_id', 'created_at', 'expires_at', 'consumed_at', 'status'],
    sessions: ['id', 'token_digest', 'user_id', 'device_hint', 'created_at', 'last_seen_at', 'authenticated_at', 'idle_expires_at', 'absolute_expires_at', 'revoked_at', 'revoke_reason'],
    workspaces: ['id', 'display_name', 'description_envelope', 'state', 'current_key_version', 'created_by', 'created_at', 'updated_at', 'deleted_at'],
    memberships: ['workspace_id', 'user_id', 'role', 'state', 'invited_by', 'accepted_by', 'removed_by', 'created_at', 'activated_at', 'removed_at', 'role_version'],
    invitations: ['id', 'workspace_id', 'target_provider', 'target_provider_subject', 'target_login_snapshot', 'offered_role', 'token_digest', 'state', 'invited_by', 'accepted_by', 'created_at', 'expires_at', 'accepted_at', 'revoked_at', 'expired_at', 'replacement_of'],
    devices: ['id', 'user_id', 'label', 'public_jwk', 'fingerprint', 'suite', 'state', 'created_at', 'revoked_at', 'revoke_reason'],
    workspace_key_versions: ['workspace_id', 'key_version', 'suite', 'state', 'rotation_reason', 'created_by_device_id', 'created_by_user_id', 'created_at', 'committed_at', 'retired_at'],
    workspace_key_envelopes: ['id', 'workspace_id', 'key_version', 'target_user_id', 'target_device_id', 'target_fingerprint', 'wrapper_user_id', 'wrapper_device_id', 'suite', 'ephemeral_public_jwk', 'hkdf_salt', 'nonce', 'ciphertext', 'aad_digest', 'created_at', 'revoked_at'],
    documents: ['id', 'workspace_id', 'current_revision', 'current_key_version', 'current_ciphertext_digest', 'ciphertext_bytes', 'envelope_version', 'state', 'created_by', 'created_at', 'updated_at', 'tombstoned_at'],
    document_revisions: ['document_id', 'workspace_id', 'revision', 'base_revision', 'operation', 'key_version', 'ciphertext_envelope', 'ciphertext_digest', 'ciphertext_bytes', 'actor_user_id', 'actor_device_id', 'client_mutation_id', 'server_time'],
    mutation_results: ['id', 'actor_user_id', 'actor_device_id', 'workspace_id', 'operation', 'client_mutation_id', 'request_fingerprint', 'target_type', 'target_id', 'http_status', 'result_json', 'created_at', 'expires_at'],
    audit_events: ['sequence', 'event_id', 'schema_version', 'workspace_id', 'event_type', 'outcome', 'reason_code', 'actor_user_id', 'actor_device_id', 'target_type', 'target_id', 'request_id', 'server_time', 'metadata_json', 'correction_of_event_id', 'related_event_id', 'hold_state'],
    retention_holds: ['id', 'workspace_id', 'hold_type', 'reason_code', 'created_by', 'created_at', 'expires_at', 'released_at', 'status']
};

const REQUIRED_MIGRATIONS = [
    [1, 'identity', ['schema_metadata', 'users', 'oauth_transactions', 'sessions']],
    [2, 'workspaces', ['workspaces', 'memberships', 'invitations']],
    [3, 'devices_keys', ['devices', 'workspace_key_versions', 'workspace_key_envelopes']],
    [4, 'documents', ['documents', 'document_revisions', 'mutation_results']],
    [5, 'audit_retention', ['audit_events', 'retention_holds']],
    [6, 'invariants_indexes', []]
];

const REQUIRED_PROHIBITIONS = [
    'runtime-sql-interpolation',
    'select-star',
    'workspace-query-without-workspace-predicate',
    'unchecked-zero-row-security-write',
    'plaintext-protected-content',
    'raw-token-or-secret-storage',
    'migration-from-request-or-build',
    'edit-or-renumber-applied-migration',
    'same-release-destructive-contract',
    'normal-request-cascade-of-history-or-last-owner'
];

const REMOTE_BINDING_KEYS = ['d1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'queues', 'analytics_engine_datasets', 'hyperdrive'];
const same = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
const sorted = values => [...values].sort();
const sameSet = (actual, expected) => same(sorted(actual), sorted(expected));
const containsKey = (value, keys) => {
    if (!value || typeof value !== 'object') return false;
    if (Object.keys(value).some(key => keys.includes(key))) return true;
    return Object.values(value).some(child => containsKey(child, keys));
};

export function validatePhase2SchemaFreeze({ freeze, schemaDocument, governanceDocument, evidenceSources, wrangler }) {
    assert(freeze?.schema_version === 1 && freeze.phase === 'CF-P2' && freeze.story === 'CF-P2-001', 'Unsupported Phase 2 schema freeze');
    assert(freeze.status === 'PASS', 'CF-P2-001 must pass before Gate P2-G1 review');
    assert(freeze.gate?.id === 'P2-G1' && freeze.gate?.decision === 'PASS', 'Gate P2-G1 approval drifted');
    assert(freeze.gate?.approved_at === '2026-07-16' && freeze.gate?.authorized_story === 'CF-P2-002', 'Gate P2-G1 authorization is incomplete');
    assert(sameSet(freeze.gate.required_reviewers || [], ['Product Owner', 'Security Reviewer', 'Technical Lead', 'Operations', 'Senior QA']), 'Gate P2-G1 reviewer inventory drifted');

    const boundary = freeze.environment_boundary || {};
    assert(Object.values(boundary).every(value => value === false), 'CF-P2-001 must not authorize remote D1 or collaboration');
    assert(!containsKey(withoutApprovedPreviewD1(wrangler), REMOTE_BINDING_KEYS), 'Wrangler contains an unapproved remote binding');

    const tables = freeze.tables || [];
    assert(sameSet(tables.map(table => table.name), Object.keys(REQUIRED_TABLE_COLUMNS)), 'Canonical table inventory drifted');
    for (const table of tables) {
        assert(same(table.columns, REQUIRED_TABLE_COLUMNS[table.name]), `${table.name} canonical columns drifted`);
        assert(new Set(table.columns).size === table.columns.length, `${table.name} contains duplicate columns`);
        assert(Number.isInteger(table.migration) && table.migration >= 1 && table.migration <= 5, `${table.name} migration owner is invalid`);
        assert(typeof table.owner === 'string' && table.owner.length > 0, `${table.name} has no repository owner`);
        assert(Array.isArray(table.requirements) && table.requirements.length > 0, `${table.name} lacks requirement traceability`);
        assert(Array.isArray(table.invariants) && table.invariants.length > 0, `${table.name} lacks invariant traceability`);
        assert(new Set(table.invariants).size === table.invariants.length, `${table.name} repeats an invariant`);
    }

    const migrations = freeze.migration_sequence || [];
    assert(migrations.length === REQUIRED_MIGRATIONS.length, 'Initial migration sequence must contain six entries');
    REQUIRED_MIGRATIONS.forEach(([sequence, slug, owns], index) => {
        const migration = migrations[index];
        assert(migration?.sequence === sequence && migration.slug === slug && same(migration.owns, owns), `Migration 000${sequence} ownership drifted`);
    });
    const ownedTables = migrations.flatMap(migration => migration.owns);
    assert(ownedTables.length === new Set(ownedTables).size, 'A table belongs to multiple initial migrations');
    assert(sameSet(ownedTables, Object.keys(REQUIRED_TABLE_COLUMNS)), 'Initial migrations do not own every frozen table exactly once');
    assert(sameSet(freeze.prohibited_patterns || [], REQUIRED_PROHIBITIONS), 'Prohibited schema/repository pattern registry drifted');
    assert(same(freeze.evidence, ['CF-EV-P2-STA-001', 'CF-EV-P2-SEC-001']), 'CF-P2-001 evidence inventory drifted');

    for (const source of [schemaDocument, governanceDocument]) {
        assert(/^Status: PASS; Gate P2-G1 approved on 2026-07-16/m.test(source), 'A CF-P2-001 contract does not record Gate P2-G1 approval');
        assert(source.includes('no migration SQL') || source.includes('does not create that directory or any SQL file'), 'Contract does not preserve the no-SQL boundary');
        assert(source.includes('collaboration remains disabled') || source.includes('collaboration remains disabled.'), 'Contract does not preserve disabled collaboration');
    }
    assert(schemaDocument.includes('15 approved') || schemaDocument.includes('14 approved entity tables'), 'Schema inventory count is not documented');
    assert(schemaDocument.includes('Critical and High invariant evidence map'), 'Critical/High invariant evidence map is missing');
    assert(governanceDocument.includes('0001_<sha12>_identity.sql') && governanceDocument.includes('0006_<sha12>_invariants_indexes.sql'), 'Migration filename contract is incomplete');
    assert(governanceDocument.includes('Unknown or drifted history is not auto-repaired'), 'Unknown-history policy is missing');

    assert(sameSet(Object.keys(evidenceSources), freeze.evidence), 'CF-P2-001 evidence files and freeze differ');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `), `${id} heading is invalid`);
        assert(/^Status: PASS$/m.test(source), `${id} is not PASS`);
        assert(source.includes('CF-P2-001'), `${id} does not identify CF-P2-001`);
        assert(/No remote D1|no remote D1/i.test(source), `${id} lacks remote side-effect evidence`);
    }
    return true;
}

export { REQUIRED_MIGRATIONS, REQUIRED_PROHIBITIONS, REQUIRED_TABLE_COLUMNS };
import { withoutApprovedPreviewD1 } from './cloudflare-wrangler-policy.mjs';
