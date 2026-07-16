-- CF-P2-002 immutable expansion: audit history and retention holds.
PRAGMA defer_foreign_keys = true;

CREATE TABLE audit_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE CHECK (length(event_id) = 36 AND event_id = lower(event_id) AND substr(event_id, 15, 1) = '4' AND event_id NOT GLOB '*[^0-9a-f-]*'),
    schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 2147483647),
    workspace_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 64 AND event_type NOT GLOB '*[^a-z0-9_.-]*'),
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure', 'correction')),
    reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 64 AND reason_code NOT GLOB '*[^a-z0-9_-]*'),
    actor_user_id TEXT,
    actor_device_id TEXT,
    target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'membership', 'invitation', 'device', 'key_version', 'key_envelope', 'document', 'session', 'retention_hold', 'system')),
    target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 64),
    request_id TEXT NOT NULL CHECK (length(request_id) = 36 AND request_id = lower(request_id) AND substr(request_id, 15, 1) = '4'),
    server_time INTEGER NOT NULL CHECK (server_time >= 0),
    metadata_json TEXT NOT NULL CHECK (length(metadata_json) BETWEEN 2 AND 4096 AND json_valid(metadata_json)),
    correction_of_event_id TEXT,
    related_event_id TEXT,
    hold_state TEXT NOT NULL CHECK (hold_state IN ('none', 'held', 'released')),
    CHECK (actor_device_id IS NULL OR actor_user_id IS NOT NULL),
    CHECK ((outcome = 'correction' AND correction_of_event_id IS NOT NULL) OR (outcome <> 'correction' AND correction_of_event_id IS NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_device_id, actor_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (correction_of_event_id) REFERENCES audit_events(event_id) ON DELETE RESTRICT,
    FOREIGN KEY (related_event_id) REFERENCES audit_events(event_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE retention_holds (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    workspace_id TEXT NOT NULL,
    hold_type TEXT NOT NULL CHECK (hold_type IN ('legal', 'security_incident', 'operational')),
    reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 64 AND reason_code NOT GLOB '*[^a-z0-9_-]*'),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER CHECK (expires_at IS NULL OR expires_at > created_at),
    released_at INTEGER CHECK (released_at IS NULL OR released_at >= created_at),
    status TEXT NOT NULL CHECK (status IN ('active', 'released', 'expired')),
    CHECK ((status = 'active' AND released_at IS NULL) OR (status = 'released' AND released_at IS NOT NULL) OR (status = 'expired' AND expires_at IS NOT NULL AND released_at IS NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) STRICT;

UPDATE schema_metadata
SET schema_version = 5, maximum_runtime_schema = 5, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 4;

PRAGMA foreign_key_check;
