-- CF-P2-003 forward-only hardening: tenant guards and stable keyset query plans.
PRAGMA defer_foreign_keys = true;

CREATE INDEX idx_memberships_user_state_workspace
    ON memberships (user_id, state, workspace_id);
CREATE INDEX idx_invitations_workspace_state_expiry_id
    ON invitations (workspace_id, state, expires_at, id);
CREATE INDEX idx_devices_user_state_id
    ON devices (user_id, state, id);
CREATE INDEX idx_workspace_key_versions_state_version
    ON workspace_key_versions (workspace_id, state, key_version);
CREATE INDEX idx_workspace_key_envelopes_target_keyset
    ON workspace_key_envelopes (workspace_id, target_user_id, key_version, target_device_id, id);
CREATE INDEX idx_document_revisions_workspace_time_revision
    ON document_revisions (workspace_id, server_time, document_id, revision);
CREATE INDEX idx_mutation_results_expiry_id
    ON mutation_results (expires_at, id);
CREATE INDEX idx_retention_holds_workspace_status_expiry_id
    ON retention_holds (workspace_id, status, expires_at, id);

CREATE TRIGGER invitations_tenant_guard_insert
BEFORE INSERT ON invitations
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.invited_by
) OR (
    NEW.replacement_of IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM invitations
        WHERE id = NEW.replacement_of AND workspace_id = NEW.workspace_id
    )
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER invitations_tenant_guard_update
BEFORE UPDATE OF workspace_id, invited_by, replacement_of ON invitations
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.invited_by
) OR (
    NEW.replacement_of IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM invitations
        WHERE id = NEW.replacement_of AND workspace_id = NEW.workspace_id
    )
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER memberships_workspace_immutable
BEFORE UPDATE OF workspace_id ON memberships
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER invitations_workspace_immutable
BEFORE UPDATE OF workspace_id ON invitations
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER workspace_key_versions_tenant_guard
BEFORE INSERT ON workspace_key_versions
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.created_by_user_id
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER workspace_key_versions_sequence_guard
BEFORE INSERT ON workspace_key_versions
WHEN NEW.key_version <> COALESCE((
    SELECT MAX(key_version) + 1 FROM workspace_key_versions
    WHERE workspace_id = NEW.workspace_id
), 1)
BEGIN
    SELECT RAISE(ABORT, 'key version sequence violation');
END;

CREATE TRIGGER workspace_key_versions_workspace_immutable
BEFORE UPDATE OF workspace_id ON workspace_key_versions
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER workspaces_current_key_guard
BEFORE UPDATE OF current_key_version ON workspaces
WHEN NOT EXISTS (
    SELECT 1 FROM workspace_key_versions
    WHERE workspace_id = NEW.id AND key_version = NEW.current_key_version AND state = 'current'
)
BEGIN
    SELECT RAISE(ABORT, 'current key scope violation');
END;

CREATE TRIGGER workspace_key_envelopes_tenant_guard
BEFORE INSERT ON workspace_key_envelopes
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.target_user_id
) OR NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.wrapper_user_id
) OR NOT EXISTS (
    SELECT 1 FROM devices
    WHERE id = NEW.target_device_id AND user_id = NEW.target_user_id
      AND fingerprint = NEW.target_fingerprint
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER workspace_key_envelopes_workspace_immutable
BEFORE UPDATE OF workspace_id ON workspace_key_envelopes
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER documents_tenant_guard
BEFORE INSERT ON documents
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.created_by
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER documents_workspace_immutable
BEFORE UPDATE OF workspace_id ON documents
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER document_revisions_tenant_guard
BEFORE INSERT ON document_revisions
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.actor_user_id
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER mutation_results_tenant_guard
BEFORE INSERT ON mutation_results
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.actor_user_id
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER mutation_results_workspace_immutable
BEFORE UPDATE OF workspace_id ON mutation_results
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER audit_events_tenant_guard
BEFORE INSERT ON audit_events
WHEN NEW.actor_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.actor_user_id
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER retention_holds_tenant_guard
BEFORE INSERT ON retention_holds
WHEN NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.created_by
)
BEGIN
    SELECT RAISE(ABORT, 'tenant scope violation');
END;

CREATE TRIGGER retention_holds_workspace_immutable
BEFORE UPDATE OF workspace_id ON retention_holds
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

CREATE TRIGGER workspaces_id_immutable
BEFORE UPDATE OF id ON workspaces
BEGIN
    SELECT RAISE(ABORT, 'workspace scope is immutable');
END;

UPDATE schema_metadata
SET schema_version = 7, maximum_runtime_schema = 7, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 6;

PRAGMA foreign_key_check;
