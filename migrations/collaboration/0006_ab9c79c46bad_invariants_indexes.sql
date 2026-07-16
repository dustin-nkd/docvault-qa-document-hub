-- CF-P2-002 immutable expansion: cross-table query indexes and append-only guards.
PRAGMA defer_foreign_keys = true;

CREATE INDEX idx_workspaces_created_by_state ON workspaces (created_by, state);
CREATE INDEX idx_workspace_key_envelopes_target ON workspace_key_envelopes (workspace_id, target_user_id, target_device_id, key_version);
CREATE INDEX idx_workspace_key_envelopes_wrapper ON workspace_key_envelopes (workspace_id, wrapper_user_id, wrapper_device_id, key_version);

CREATE INDEX idx_documents_workspace_state_updated
    ON documents (workspace_id, state, updated_at, id);
CREATE INDEX idx_documents_workspace_updated
    ON documents (workspace_id, updated_at, id);
CREATE INDEX idx_document_revisions_workspace_time
    ON document_revisions (workspace_id, server_time, document_id);
CREATE INDEX idx_document_revisions_document_time
    ON document_revisions (document_id, server_time);
CREATE INDEX idx_mutation_results_expiry ON mutation_results (expires_at);

CREATE INDEX idx_audit_events_workspace_sequence ON audit_events (workspace_id, sequence);
CREATE INDEX idx_audit_events_workspace_time_sequence ON audit_events (workspace_id, server_time, sequence);
CREATE INDEX idx_audit_events_server_time ON audit_events (server_time);
CREATE INDEX idx_audit_events_type_time ON audit_events (event_type, server_time);
CREATE INDEX idx_retention_holds_workspace_status ON retention_holds (workspace_id, status, expires_at);

CREATE TRIGGER document_revisions_no_update
BEFORE UPDATE ON document_revisions
BEGIN
    SELECT RAISE(ABORT, 'document revisions are append-only');
END;

CREATE TRIGGER document_revisions_no_delete
BEFORE DELETE ON document_revisions
BEGIN
    SELECT RAISE(ABORT, 'document revisions are append-only');
END;

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only; write a correction event');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only');
END;

UPDATE schema_metadata
SET schema_version = 6, maximum_runtime_schema = 6, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 5;

PRAGMA foreign_key_check;
