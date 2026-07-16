-- CF-P2-002 immutable expansion: workspaces, memberships, and invitations.
PRAGMA defer_foreign_keys = true;

CREATE TABLE workspaces (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    description_envelope BLOB CHECK (description_envelope IS NULL OR length(description_envelope) BETWEEN 18 AND 8192),
    state TEXT NOT NULL CHECK (state IN ('active', 'rotating', 'deletion_pending', 'deleted')),
    current_key_version INTEGER NOT NULL CHECK (current_key_version BETWEEN 1 AND 2147483647),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    deleted_at INTEGER CHECK (deleted_at IS NULL OR deleted_at >= created_at),
    CHECK ((state = 'deleted' AND deleted_at IS NOT NULL) OR (state <> 'deleted' AND deleted_at IS NULL)),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE memberships (
    workspace_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    state TEXT NOT NULL CHECK (state IN ('pending_key', 'active', 'removed')),
    invited_by TEXT,
    accepted_by TEXT,
    removed_by TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    activated_at INTEGER CHECK (activated_at IS NULL OR activated_at >= created_at),
    removed_at INTEGER CHECK (removed_at IS NULL OR removed_at >= created_at),
    role_version INTEGER NOT NULL CHECK (role_version >= 1),
    PRIMARY KEY (workspace_id, user_id),
    CHECK ((state = 'active' AND activated_at IS NOT NULL AND removed_at IS NULL) OR (state = 'pending_key' AND activated_at IS NULL AND removed_at IS NULL) OR (state = 'removed' AND removed_at IS NOT NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (removed_by) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_memberships_user_state ON memberships (user_id, state);
CREATE INDEX idx_memberships_workspace_role_state ON memberships (workspace_id, role, state);

CREATE TABLE invitations (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    workspace_id TEXT NOT NULL,
    target_provider TEXT NOT NULL CHECK (target_provider = 'github'),
    target_provider_subject TEXT NOT NULL CHECK (length(target_provider_subject) BETWEEN 1 AND 20 AND target_provider_subject GLOB '[1-9]*' AND target_provider_subject NOT GLOB '*[^0-9]*'),
    target_login_snapshot TEXT NOT NULL CHECK (length(target_login_snapshot) BETWEEN 1 AND 100),
    offered_role TEXT NOT NULL CHECK (offered_role IN ('admin', 'editor', 'viewer')),
    token_digest BLOB NOT NULL UNIQUE CHECK (length(token_digest) = 32),
    state TEXT NOT NULL CHECK (state IN ('pending', 'accepted', 'revoked', 'expired')),
    invited_by TEXT NOT NULL,
    accepted_by TEXT,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at = created_at + 259200000),
    accepted_at INTEGER CHECK (accepted_at IS NULL OR accepted_at BETWEEN created_at AND expires_at),
    revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    expired_at INTEGER CHECK (expired_at IS NULL OR expired_at >= expires_at),
    replacement_of TEXT,
    CHECK ((state = 'pending' AND accepted_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL) OR
           (state = 'accepted' AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL AND revoked_at IS NULL AND expired_at IS NULL) OR
           (state = 'revoked' AND revoked_at IS NOT NULL AND accepted_at IS NULL AND expired_at IS NULL) OR
           (state = 'expired' AND expired_at IS NOT NULL AND accepted_at IS NULL AND revoked_at IS NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (accepted_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (replacement_of) REFERENCES invitations(id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX uq_invitations_pending_target
    ON invitations (workspace_id, target_provider, target_provider_subject)
    WHERE state = 'pending';
CREATE INDEX idx_invitations_workspace_state_expiry ON invitations (workspace_id, state, expires_at);

UPDATE schema_metadata
SET schema_version = 2, maximum_runtime_schema = 2, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 1;

PRAGMA foreign_key_check;
