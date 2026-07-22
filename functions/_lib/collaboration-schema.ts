export const COLLABORATION_SCHEMA_VERSION = 9 as const;
export const COLLABORATION_MINIMUM_RUNTIME_SCHEMA = 1 as const;

export type D1Blob = ArrayBuffer;
export type Nullable<T> = T | null;

export interface SchemaMetadataRow {
    singleton_id: 1;
    schema_version: number;
    minimum_runtime_schema: number;
    maximum_runtime_schema: number;
    migration_set_digest: D1Blob;
    updated_at: number;
}

export interface UserRow {
    id: string; provider: 'github'; provider_subject: string; display_login: string;
    display_name: Nullable<string>; avatar_url: Nullable<string>; status: 'active' | 'deactivated';
    created_at: number; updated_at: number; deactivated_at: Nullable<number>;
}

export interface OAuthTransactionRow {
    id: string; state_digest: D1Blob; pkce_verifier_envelope: D1Blob; callback_origin: string;
    callback_path: string; invitation_id: Nullable<string>; created_at: number; expires_at: number;
    consumed_at: Nullable<number>; status: 'pending' | 'consumed' | 'expired';
}

export interface SessionRow {
    id: string; token_digest: D1Blob; user_id: string; device_hint: Nullable<string>;
    created_at: number; last_seen_at: number; authenticated_at: number; idle_expires_at: number;
    absolute_expires_at: number; revoked_at: Nullable<number>; revoke_reason: Nullable<string>;
}

export interface WorkspaceRow {
    id: string; display_name: string; description_envelope: Nullable<D1Blob>;
    state: 'active' | 'rotating' | 'deletion_pending' | 'deleted'; current_key_version: number;
    created_by: string; created_at: number; updated_at: number; deleted_at: Nullable<number>;
}

export interface MembershipRow {
    workspace_id: string; user_id: string; role: 'owner' | 'admin' | 'editor' | 'viewer';
    state: 'pending_key' | 'active' | 'removed'; invited_by: Nullable<string>;
    accepted_by: Nullable<string>; removed_by: Nullable<string>; created_at: number;
    activated_at: Nullable<number>; removed_at: Nullable<number>; role_version: number;
}

export interface InvitationRow {
    id: string; workspace_id: string; target_provider: 'github'; target_provider_subject: string;
    target_login_snapshot: string; offered_role: 'admin' | 'editor' | 'viewer'; token_digest: D1Blob;
    state: 'pending' | 'accepted' | 'revoked' | 'expired'; invited_by: string;
    accepted_by: Nullable<string>; created_at: number; expires_at: number; accepted_at: Nullable<number>;
    revoked_at: Nullable<number>; expired_at: Nullable<number>; replacement_of: Nullable<string>;
}

export interface DeviceRow {
    id: string; user_id: string; label: string; public_jwk: string; fingerprint: D1Blob;
    suite: 'P256-ECDH-v1'; state: 'active' | 'revoked'; created_at: number;
    revoked_at: Nullable<number>; revoke_reason: Nullable<string>;
}

export interface WorkspaceKeyVersionRow {
    workspace_id: string; key_version: number; suite: 'P256-HKDF-SHA256-A256GCM-v1';
    state: 'preparing' | 'current' | 'retired' | 'aborted'; rotation_reason: string;
    created_by_device_id: string; created_by_user_id: string; created_at: number;
    committed_at: Nullable<number>; retired_at: Nullable<number>;
}

export interface WorkspaceKeyEnvelopeRow {
    id: string; workspace_id: string; key_version: number; target_user_id: string;
    target_device_id: string; target_fingerprint: D1Blob; wrapper_user_id: string;
    wrapper_device_id: string; suite: 'P256-HKDF-SHA256-A256GCM-v1'; ephemeral_public_jwk: string;
    hkdf_salt: D1Blob; nonce: D1Blob; ciphertext: D1Blob; aad_digest: D1Blob;
    created_at: number; revoked_at: Nullable<number>;
}

export interface DocumentRow {
    id: string; workspace_id: string; current_revision: number; current_key_version: number;
    current_ciphertext_digest: D1Blob; ciphertext_bytes: number; envelope_version: 1;
    state: 'active' | 'tombstoned'; created_by: string; created_at: number;
    updated_at: number; tombstoned_at: Nullable<number>;
}

export interface DocumentRevisionRow {
    document_id: string; workspace_id: string; revision: number; base_revision: number;
    operation: 'create' | 'update' | 'delete'; key_version: number; ciphertext_envelope: D1Blob;
    ciphertext_digest: D1Blob; ciphertext_bytes: number; actor_user_id: string;
    actor_device_id: string; client_mutation_id: string; server_time: number;
}

export interface MutationResultRow {
    id: string; actor_user_id: string; actor_device_id: string; workspace_id: string;
    operation: string; client_mutation_id: string; request_fingerprint: D1Blob; target_type: string;
    target_id: string; http_status: number; result_json: string; created_at: number; expires_at: number;
}

export interface TransitionGuardRow {
    id: string; actor_user_id: string; actor_device_id: string; workspace_id: string;
    operation: 'workspace.create' | 'invitation.accept'; client_mutation_id: string;
    request_fingerprint: D1Blob; invitation_id: Nullable<string>;
    credential_digest: Nullable<D1Blob>; http_status: number; result_json: string;
    created_at: number; expires_at: number; authority_guard: 1;
}

export interface DeviceMutationResultRow {
    id: string; actor_user_id: string; actor_session_id: string;
    operation: 'device.register' | 'device.revoke'; client_mutation_id: string;
    request_fingerprint: D1Blob; target_device_id: string; http_status: number;
    result_json: string; created_at: number; expires_at: number;
}

export interface DeviceAuditEventRow {
    sequence: number; event_id: string; schema_version: 11; user_id: string;
    event_type: 'device.registered' | 'device.revoked'; outcome: 'success';
    reason_code: 'registered' | 'user_requested'; actor_session_id: string;
    actor_device_id: Nullable<string>; target_device_id: string; request_id: string;
    server_time: number; metadata_json: '{}';
}
export interface AuditEventRow {
    sequence: number; event_id: string; schema_version: number; workspace_id: string; event_type: string;
    outcome: 'success' | 'denied' | 'failure' | 'correction'; reason_code: string;
    actor_user_id: Nullable<string>; actor_device_id: Nullable<string>; target_type: string;
    target_id: string; request_id: string; server_time: number; metadata_json: string;
    correction_of_event_id: Nullable<string>; related_event_id: Nullable<string>;
    hold_state: 'none' | 'held' | 'released';
}

export interface RetentionHoldRow {
    id: string; workspace_id: string; hold_type: 'legal' | 'security_incident' | 'operational';
    reason_code: string; created_by: string; created_at: number; expires_at: Nullable<number>;
    released_at: Nullable<number>; status: 'active' | 'released' | 'expired';
}

export interface RetentionPurgeRunRow {
    id: string; target: 'audit_events' | 'transition_guards'; cutoff_at: number;
    started_at: number; max_rows: number; status: 'running' | 'completed' | 'failed';
    completed_at: Nullable<number>;
}

export interface CollaborationTableRowMap {
    schema_metadata: SchemaMetadataRow; users: UserRow; oauth_transactions: OAuthTransactionRow;
    sessions: SessionRow; workspaces: WorkspaceRow; memberships: MembershipRow;
    invitations: InvitationRow; devices: DeviceRow; workspace_key_versions: WorkspaceKeyVersionRow;
    workspace_key_envelopes: WorkspaceKeyEnvelopeRow; documents: DocumentRow;
    document_revisions: DocumentRevisionRow; mutation_results: MutationResultRow;
    transition_guards: TransitionGuardRow;
    device_mutation_results: DeviceMutationResultRow; device_audit_events: DeviceAuditEventRow;
    audit_events: AuditEventRow; retention_holds: RetentionHoldRow;
    retention_purge_runs: RetentionPurgeRunRow;
}

export type CollaborationTableName = keyof CollaborationTableRowMap;
export type CollaborationWriteResult = D1Result<Record<string, never>>;

export function isRuntimeSchemaCompatible(metadata: Pick<SchemaMetadataRow,
    'minimum_runtime_schema' | 'maximum_runtime_schema'>, runtimeSchemaVersion: number): boolean {
    return Number.isInteger(runtimeSchemaVersion)
        && metadata.minimum_runtime_schema <= runtimeSchemaVersion
        && metadata.maximum_runtime_schema >= runtimeSchemaVersion;
}

export function isCompatibleSchema(metadata: Pick<SchemaMetadataRow,
    'schema_version' | 'minimum_runtime_schema' | 'maximum_runtime_schema'>): boolean {
    return metadata.schema_version >= COLLABORATION_SCHEMA_VERSION
        && isRuntimeSchemaCompatible(metadata, COLLABORATION_SCHEMA_VERSION);
}
