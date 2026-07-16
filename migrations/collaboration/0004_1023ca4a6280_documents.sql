-- CF-P2-002 immutable expansion: encrypted documents, revisions, and idempotency.
PRAGMA defer_foreign_keys = true;

CREATE TABLE documents (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    workspace_id TEXT NOT NULL,
    current_revision INTEGER NOT NULL CHECK (current_revision BETWEEN 1 AND 9007199254740991),
    current_key_version INTEGER NOT NULL CHECK (current_key_version BETWEEN 1 AND 2147483647),
    current_ciphertext_digest BLOB NOT NULL CHECK (length(current_ciphertext_digest) = 32),
    ciphertext_bytes INTEGER NOT NULL CHECK (ciphertext_bytes BETWEEN 18 AND 1048000),
    envelope_version INTEGER NOT NULL CHECK (envelope_version = 1),
    state TEXT NOT NULL CHECK (state IN ('active', 'tombstoned')),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    updated_at INTEGER NOT NULL CHECK (updated_at >= created_at),
    tombstoned_at INTEGER CHECK (tombstoned_at IS NULL OR tombstoned_at >= created_at),
    UNIQUE (id, workspace_id),
    CHECK ((state = 'active' AND tombstoned_at IS NULL) OR (state = 'tombstoned' AND tombstoned_at IS NOT NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, current_key_version) REFERENCES workspace_key_versions(workspace_id, key_version) ON DELETE RESTRICT
) STRICT;

CREATE TABLE document_revisions (
    document_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    base_revision INTEGER NOT NULL CHECK (base_revision BETWEEN 0 AND 9007199254740990),
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    key_version INTEGER NOT NULL CHECK (key_version BETWEEN 1 AND 2147483647),
    ciphertext_envelope BLOB NOT NULL CHECK (length(ciphertext_envelope) BETWEEN 18 AND 1048576),
    ciphertext_digest BLOB NOT NULL CHECK (length(ciphertext_digest) = 32),
    ciphertext_bytes INTEGER NOT NULL CHECK (ciphertext_bytes BETWEEN 18 AND 1048000),
    actor_user_id TEXT NOT NULL,
    actor_device_id TEXT NOT NULL,
    client_mutation_id TEXT NOT NULL CHECK (length(client_mutation_id) = 36 AND client_mutation_id = lower(client_mutation_id) AND substr(client_mutation_id, 15, 1) = '4'),
    server_time INTEGER NOT NULL CHECK (server_time >= 0),
    PRIMARY KEY (document_id, revision),
    UNIQUE (workspace_id, actor_user_id, actor_device_id, client_mutation_id),
    CHECK (base_revision = revision - 1),
    CHECK ((operation = 'create' AND revision = 1 AND base_revision = 0) OR (operation <> 'create' AND revision > 1)),
    FOREIGN KEY (document_id, workspace_id) REFERENCES documents(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, key_version) REFERENCES workspace_key_versions(workspace_id, key_version) ON DELETE RESTRICT,
    FOREIGN KEY (actor_device_id, actor_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE mutation_results (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    actor_user_id TEXT NOT NULL,
    actor_device_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (length(operation) BETWEEN 1 AND 64 AND operation NOT GLOB '*[^a-z0-9_.-]*'),
    client_mutation_id TEXT NOT NULL CHECK (length(client_mutation_id) = 36 AND client_mutation_id = lower(client_mutation_id) AND substr(client_mutation_id, 15, 1) = '4'),
    request_fingerprint BLOB NOT NULL CHECK (length(request_fingerprint) = 32),
    target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'membership', 'invitation', 'device', 'key_version', 'key_envelope', 'document', 'retention_hold')),
    target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 64),
    http_status INTEGER NOT NULL CHECK (http_status BETWEEN 200 AND 599),
    result_json TEXT NOT NULL CHECK (length(result_json) BETWEEN 2 AND 4096 AND json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at > created_at),
    UNIQUE (actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id),
    FOREIGN KEY (actor_device_id, actor_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT
) STRICT;

UPDATE schema_metadata
SET schema_version = 4, maximum_runtime_schema = 4, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 3;

PRAGMA foreign_key_check;
