-- CF-P2-002 immutable expansion: identity, sessions, and logical schema metadata.
PRAGMA defer_foreign_keys = true;

CREATE TABLE schema_metadata (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 2147483647),
    minimum_runtime_schema INTEGER NOT NULL CHECK (minimum_runtime_schema BETWEEN 1 AND schema_version),
    maximum_runtime_schema INTEGER NOT NULL CHECK (maximum_runtime_schema BETWEEN schema_version AND 2147483647),
    migration_set_digest BLOB NOT NULL CHECK (length(migration_set_digest) = 32),
    updated_at INTEGER NOT NULL CHECK (updated_at >= 0)
) STRICT;

INSERT INTO schema_metadata (
    singleton_id, schema_version, minimum_runtime_schema, maximum_runtime_schema,
    migration_set_digest, updated_at
) VALUES (
    1, 1, 1, 1,
    X'8fb7afd3e0d5da2fe756d2ae7a252a6bf3273a4846c726e407053a28a9efbdf8',
    1784160000000
);

CREATE TABLE users (
    id TEXT PRIMARY KEY CHECK (
        length(id) = 36 AND id = lower(id) AND
        substr(id, 9, 1) = '-' AND substr(id, 14, 1) = '-' AND
        substr(id, 15, 1) = '4' AND substr(id, 19, 1) = '-' AND
        substr(id, 20, 1) IN ('8', '9', 'a', 'b') AND substr(id, 24, 1) = '-' AND
        id NOT GLOB '*[^0-9a-f-]*'
    ),
    provider TEXT NOT NULL CHECK (provider = 'github'),
    provider_subject TEXT NOT NULL CHECK (
        length(provider_subject) BETWEEN 1 AND 20 AND
        provider_subject GLOB '[1-9]*' AND provider_subject NOT GLOB '*[^0-9]*'
    ),
    display_login TEXT NOT NULL CHECK (length(display_login) BETWEEN 1 AND 100),
    display_name TEXT CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 255),
    avatar_url TEXT CHECK (avatar_url IS NULL OR length(avatar_url) BETWEEN 1 AND 2048),
    status TEXT NOT NULL CHECK (status IN ('active', 'deactivated')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    deactivated_at INTEGER CHECK (deactivated_at IS NULL OR deactivated_at >= created_at),
    UNIQUE (provider, provider_subject),
    CHECK ((status = 'active' AND deactivated_at IS NULL) OR (status = 'deactivated' AND deactivated_at IS NOT NULL))
) STRICT;

CREATE TABLE oauth_transactions (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    state_digest BLOB NOT NULL UNIQUE CHECK (length(state_digest) = 32),
    pkce_verifier_envelope BLOB NOT NULL CHECK (length(pkce_verifier_envelope) BETWEEN 18 AND 4096),
    callback_origin TEXT NOT NULL CHECK (length(callback_origin) BETWEEN 8 AND 255),
    callback_path TEXT NOT NULL CHECK (length(callback_path) BETWEEN 1 AND 512 AND substr(callback_path, 1, 1) = '/'),
    invitation_id TEXT CHECK (invitation_id IS NULL OR length(invitation_id) = 36),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    consumed_at INTEGER CHECK (consumed_at IS NULL OR consumed_at BETWEEN created_at AND expires_at),
    status TEXT NOT NULL CHECK (status IN ('pending', 'consumed', 'expired')),
    CHECK ((status = 'consumed' AND consumed_at IS NOT NULL) OR (status <> 'consumed' AND consumed_at IS NULL)),
    FOREIGN KEY (invitation_id) REFERENCES invitations(id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_oauth_transactions_expires_at ON oauth_transactions (expires_at);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    token_digest BLOB NOT NULL UNIQUE CHECK (length(token_digest) = 32),
    user_id TEXT NOT NULL,
    device_hint TEXT CHECK (device_hint IS NULL OR length(device_hint) BETWEEN 1 AND 200),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    last_seen_at INTEGER NOT NULL CHECK (last_seen_at >= created_at),
    authenticated_at INTEGER NOT NULL CHECK (authenticated_at BETWEEN created_at AND last_seen_at),
    idle_expires_at INTEGER NOT NULL CHECK (idle_expires_at > last_seen_at),
    absolute_expires_at INTEGER NOT NULL CHECK (absolute_expires_at >= idle_expires_at),
    revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    revoke_reason TEXT CHECK (revoke_reason IS NULL OR (length(revoke_reason) BETWEEN 1 AND 64 AND revoke_reason NOT GLOB '*[^a-z0-9_-]*')),
    CHECK ((revoked_at IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_sessions_user_revoked ON sessions (user_id, revoked_at);
CREATE INDEX idx_sessions_absolute_expires ON sessions (absolute_expires_at);

PRAGMA foreign_key_check;
