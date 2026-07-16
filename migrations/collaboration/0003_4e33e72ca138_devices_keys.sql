-- CF-P2-002 immutable expansion: devices and workspace key distribution.
PRAGMA defer_foreign_keys = true;

CREATE TABLE devices (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    user_id TEXT NOT NULL,
    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
    public_jwk TEXT NOT NULL CHECK (length(public_jwk) BETWEEN 1 AND 512 AND json_valid(public_jwk)),
    fingerprint BLOB NOT NULL CHECK (length(fingerprint) = 32),
    suite TEXT NOT NULL CHECK (suite = 'P256-ECDH-v1'),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    revoke_reason TEXT CHECK (revoke_reason IS NULL OR (length(revoke_reason) BETWEEN 1 AND 64 AND revoke_reason NOT GLOB '*[^a-z0-9_-]*')),
    UNIQUE (user_id, fingerprint),
    UNIQUE (id, user_id),
    CHECK ((state = 'active' AND revoked_at IS NULL AND revoke_reason IS NULL) OR (state = 'revoked' AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_devices_user_state ON devices (user_id, state);

CREATE TABLE workspace_key_versions (
    workspace_id TEXT NOT NULL,
    key_version INTEGER NOT NULL CHECK (key_version BETWEEN 1 AND 2147483647),
    suite TEXT NOT NULL CHECK (suite = 'P256-HKDF-SHA256-A256GCM-v1'),
    state TEXT NOT NULL CHECK (state IN ('preparing', 'current', 'retired', 'aborted')),
    rotation_reason TEXT NOT NULL CHECK (length(rotation_reason) BETWEEN 1 AND 64 AND rotation_reason NOT GLOB '*[^a-z0-9_-]*'),
    created_by_device_id TEXT NOT NULL,
    created_by_user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    committed_at INTEGER CHECK (committed_at IS NULL OR committed_at >= created_at),
    retired_at INTEGER CHECK (retired_at IS NULL OR retired_at >= created_at),
    PRIMARY KEY (workspace_id, key_version),
    CHECK ((state = 'preparing' AND committed_at IS NULL AND retired_at IS NULL) OR
           (state = 'current' AND committed_at IS NOT NULL AND retired_at IS NULL) OR
           (state = 'retired' AND committed_at IS NOT NULL AND retired_at IS NOT NULL) OR
           (state = 'aborted' AND committed_at IS NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by_device_id, created_by_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX uq_workspace_key_versions_current
    ON workspace_key_versions (workspace_id)
    WHERE state = 'current';

CREATE TABLE workspace_key_envelopes (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    workspace_id TEXT NOT NULL,
    key_version INTEGER NOT NULL CHECK (key_version BETWEEN 1 AND 2147483647),
    target_user_id TEXT NOT NULL,
    target_device_id TEXT NOT NULL,
    target_fingerprint BLOB NOT NULL CHECK (length(target_fingerprint) = 32),
    wrapper_user_id TEXT NOT NULL,
    wrapper_device_id TEXT NOT NULL,
    suite TEXT NOT NULL CHECK (suite = 'P256-HKDF-SHA256-A256GCM-v1'),
    ephemeral_public_jwk TEXT NOT NULL CHECK (length(ephemeral_public_jwk) BETWEEN 1 AND 512 AND json_valid(ephemeral_public_jwk)),
    hkdf_salt BLOB NOT NULL CHECK (length(hkdf_salt) = 32),
    nonce BLOB NOT NULL CHECK (length(nonce) = 12),
    ciphertext BLOB NOT NULL CHECK (length(ciphertext) = 48),
    aad_digest BLOB NOT NULL CHECK (length(aad_digest) = 32),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    revoked_at INTEGER CHECK (revoked_at IS NULL OR revoked_at >= created_at),
    UNIQUE (workspace_id, key_version, target_device_id),
    FOREIGN KEY (workspace_id, key_version) REFERENCES workspace_key_versions(workspace_id, key_version) ON DELETE RESTRICT,
    FOREIGN KEY (target_device_id, target_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (wrapper_device_id, wrapper_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

UPDATE schema_metadata
SET schema_version = 3, maximum_runtime_schema = 3, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 2;

PRAGMA foreign_key_check;
