-- CF-P2-005 forward-only correction: pre-membership idempotency and authority guards.
PRAGMA defer_foreign_keys = true;

CREATE TABLE transition_guards (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    actor_user_id TEXT NOT NULL,
    actor_device_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) = 36 AND workspace_id = lower(workspace_id) AND substr(workspace_id, 15, 1) = '4'),
    operation TEXT NOT NULL CHECK (operation IN ('workspace.create', 'invitation.accept')),
    client_mutation_id TEXT NOT NULL CHECK (length(client_mutation_id) = 36 AND client_mutation_id = lower(client_mutation_id) AND substr(client_mutation_id, 15, 1) = '4'),
    request_fingerprint BLOB NOT NULL CHECK (length(request_fingerprint) = 32),
    invitation_id TEXT,
    credential_digest BLOB,
    http_status INTEGER NOT NULL CHECK (http_status BETWEEN 200 AND 299),
    result_json TEXT NOT NULL CHECK (length(result_json) BETWEEN 2 AND 4096 AND json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    authority_guard INTEGER NOT NULL CHECK (authority_guard = 1),
    UNIQUE (actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id),
    CHECK ((operation = 'workspace.create' AND invitation_id IS NULL AND credential_digest IS NULL) OR
           (operation = 'invitation.accept' AND invitation_id IS NOT NULL AND length(credential_digest) = 32)),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_device_id, actor_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_transition_guards_expiry_id
    ON transition_guards (expires_at, id);

CREATE TRIGGER transition_guards_authority_insert
BEFORE INSERT ON transition_guards
WHEN NOT EXISTS (
    SELECT 1 FROM users u
    JOIN devices d ON d.user_id = u.id
    WHERE u.id = NEW.actor_user_id AND u.status = 'active'
      AND d.id = NEW.actor_device_id AND d.state = 'active'
) OR (
    NEW.operation = 'workspace.create' AND EXISTS (
        SELECT 1 FROM workspaces WHERE id = NEW.workspace_id
    )
) OR (
    NEW.operation = 'invitation.accept' AND NOT EXISTS (
        SELECT 1 FROM invitations i
        JOIN users u ON u.id = NEW.actor_user_id
        WHERE i.id = NEW.invitation_id AND i.workspace_id = NEW.workspace_id
          AND i.target_provider = u.provider
          AND i.target_provider_subject = u.provider_subject
          AND i.token_digest = NEW.credential_digest
          AND i.state = 'pending' AND NEW.created_at <= i.expires_at
    )
)
BEGIN
    SELECT RAISE(ABORT, 'transition authority violation');
END;

CREATE TRIGGER transition_guards_no_update
BEFORE UPDATE ON transition_guards
BEGIN
    SELECT RAISE(ABORT, 'transition guard history is immutable');
END;

CREATE TRIGGER transition_guards_no_delete
BEFORE DELETE ON transition_guards
BEGIN
    SELECT RAISE(ABORT, 'transition guard history is immutable');
END;

UPDATE schema_metadata
SET schema_version = 8, maximum_runtime_schema = 8, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 7;

PRAGMA foreign_key_check;
