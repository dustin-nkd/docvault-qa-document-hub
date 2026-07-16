export interface CollaborationQueryContract {
    readonly id: string;
    readonly sql: string;
    readonly expectedIndex: string;
    readonly workspaceScoped: boolean;
    readonly mutableCollection: boolean;
    readonly stableKeyset: readonly string[];
}

export const COLLABORATION_QUERY_LIMITS = Object.freeze({
    defaultPageSize: 50,
    maximumPageSize: 100
});

export const COLLABORATION_QUERY_CONTRACTS: readonly CollaborationQueryContract[] = Object.freeze([
    {
        id: 'session-by-token',
        sql: `SELECT id, user_id, device_hint, created_at, last_seen_at, authenticated_at,
                     idle_expires_at, absolute_expires_at, revoked_at, revoke_reason
              FROM sessions
              WHERE token_digest = ?
              LIMIT ?`,
        expectedIndex: 'sqlite_autoindex_sessions_',
        workspaceScoped: false,
        mutableCollection: false,
        stableKeyset: []
    },
    {
        id: 'membership-by-workspace-user',
        sql: `SELECT workspace_id, user_id, role, state, invited_by, accepted_by, removed_by,
                     created_at, activated_at, removed_at, role_version
              FROM memberships
              WHERE workspace_id = ? AND user_id = ?
              LIMIT ?`,
        expectedIndex: 'sqlite_autoindex_memberships_',
        workspaceScoped: true,
        mutableCollection: false,
        stableKeyset: []
    },
    {
        id: 'memberships-by-user',
        sql: `SELECT workspace_id, user_id, role, state, role_version, created_at, activated_at, removed_at
              FROM memberships
              WHERE user_id = ? AND state = ? AND workspace_id > ?
              ORDER BY workspace_id ASC
              LIMIT ?`,
        expectedIndex: 'idx_memberships_user_state_workspace',
        workspaceScoped: false,
        mutableCollection: true,
        stableKeyset: ['workspace_id']
    },
    {
        id: 'invitations-by-workspace-expiry',
        sql: `SELECT id, workspace_id, target_provider, target_provider_subject, target_login_snapshot,
                     offered_role, state, invited_by, created_at, expires_at, replacement_of
              FROM invitations
              WHERE workspace_id = ? AND state = ? AND (expires_at, id) > (?, ?)
              ORDER BY expires_at ASC, id ASC
              LIMIT ?`,
        expectedIndex: 'idx_invitations_workspace_state_expiry_id',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['expires_at', 'id']
    },
    {
        id: 'devices-by-user-state',
        sql: `SELECT id, user_id, label, public_jwk, fingerprint, suite, state, created_at,
                     revoked_at, revoke_reason
              FROM devices
              WHERE user_id = ? AND state = ? AND id > ?
              ORDER BY id ASC
              LIMIT ?`,
        expectedIndex: 'idx_devices_user_state_id',
        workspaceScoped: false,
        mutableCollection: true,
        stableKeyset: ['id']
    },
    {
        id: 'key-versions-by-workspace',
        sql: `SELECT workspace_id, key_version, suite, state, rotation_reason, created_by_device_id,
                     created_by_user_id, created_at, committed_at, retired_at
              FROM workspace_key_versions
              WHERE workspace_id = ? AND state = ? AND key_version > ?
              ORDER BY key_version ASC
              LIMIT ?`,
        expectedIndex: 'idx_workspace_key_versions_state_version',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['key_version']
    },
    {
        id: 'key-envelopes-by-target',
        sql: `SELECT id, workspace_id, key_version, target_user_id, target_device_id, target_fingerprint,
                     wrapper_user_id, wrapper_device_id, suite, ephemeral_public_jwk, hkdf_salt,
                     nonce, ciphertext, aad_digest, created_at, revoked_at
              FROM workspace_key_envelopes
              WHERE workspace_id = ? AND target_user_id = ?
                AND (key_version, target_device_id, id) > (?, ?, ?)
              ORDER BY key_version ASC, target_device_id ASC, id ASC
              LIMIT ?`,
        expectedIndex: 'idx_workspace_key_envelopes_target_keyset',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['key_version', 'target_device_id', 'id']
    },
    {
        id: 'document-by-workspace-id',
        sql: `SELECT id, workspace_id, current_revision, current_key_version, current_ciphertext_digest,
                     ciphertext_bytes, envelope_version, state, created_by, created_at, updated_at,
                     tombstoned_at
              FROM documents
              WHERE workspace_id = ? AND id = ?
              LIMIT ?`,
        expectedIndex: 'sqlite_autoindex_documents_',
        workspaceScoped: true,
        mutableCollection: false,
        stableKeyset: []
    },
    {
        id: 'documents-by-workspace-state',
        sql: `SELECT id, workspace_id, current_revision, current_key_version, current_ciphertext_digest,
                     ciphertext_bytes, envelope_version, state, created_by, created_at, updated_at,
                     tombstoned_at
              FROM documents
              WHERE workspace_id = ? AND state = ? AND (updated_at, id) < (?, ?)
              ORDER BY updated_at DESC, id DESC
              LIMIT ?`,
        expectedIndex: 'idx_documents_workspace_state_updated',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['updated_at', 'id']
    },
    {
        id: 'revisions-by-workspace-time',
        sql: `SELECT document_id, workspace_id, revision, base_revision, operation, key_version,
                     ciphertext_envelope, ciphertext_digest, ciphertext_bytes, actor_user_id,
                     actor_device_id, client_mutation_id, server_time
              FROM document_revisions
              WHERE workspace_id = ? AND (server_time, document_id, revision) > (?, ?, ?)
              ORDER BY server_time ASC, document_id ASC, revision ASC
              LIMIT ?`,
        expectedIndex: 'idx_document_revisions_workspace_time_revision',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['server_time', 'document_id', 'revision']
    },
    {
        id: 'mutation-result-by-scope',
        sql: `SELECT id, actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id,
                     request_fingerprint, target_type, target_id, http_status, result_json,
                     created_at, expires_at
              FROM mutation_results
              WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
                AND operation = ? AND client_mutation_id = ?
              LIMIT ?`,
        expectedIndex: 'sqlite_autoindex_mutation_results_',
        workspaceScoped: true,
        mutableCollection: false,
        stableKeyset: []
    },
    {
        id: 'audit-by-workspace-sequence',
        sql: `SELECT sequence, event_id, schema_version, workspace_id, event_type, outcome, reason_code,
                     actor_user_id, actor_device_id, target_type, target_id, request_id, server_time,
                     metadata_json, correction_of_event_id, related_event_id, hold_state
              FROM audit_events
              WHERE workspace_id = ? AND sequence > ?
              ORDER BY sequence ASC
              LIMIT ?`,
        expectedIndex: 'idx_audit_events_workspace_sequence',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['sequence']
    },
    {
        id: 'retention-holds-by-workspace',
        sql: `SELECT id, workspace_id, hold_type, reason_code, created_by, created_at,
                     expires_at, released_at, status
              FROM retention_holds
              WHERE workspace_id = ? AND status = ? AND (expires_at, id) > (?, ?)
              ORDER BY expires_at ASC, id ASC
              LIMIT ?`,
        expectedIndex: 'idx_retention_holds_workspace_status_expiry_id',
        workspaceScoped: true,
        mutableCollection: true,
        stableKeyset: ['expires_at', 'id']
    }
]);
