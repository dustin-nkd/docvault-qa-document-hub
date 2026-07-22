-- CF-P5-004 / P5-G2A-M: user-scoped device mutation and audit journals.
PRAGMA defer_foreign_keys = true;

CREATE TABLE device_mutation_results (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    actor_user_id TEXT NOT NULL,
    actor_session_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('device.register', 'device.revoke')),
    client_mutation_id TEXT NOT NULL CHECK (length(client_mutation_id) = 36 AND client_mutation_id = lower(client_mutation_id) AND substr(client_mutation_id, 15, 1) = '4' AND client_mutation_id NOT GLOB '*[^0-9a-f-]*'),
    request_fingerprint BLOB NOT NULL CHECK (length(request_fingerprint) = 32),
    target_device_id TEXT NOT NULL,
    http_status INTEGER NOT NULL CHECK (http_status BETWEEN 200 AND 299),
    result_json TEXT NOT NULL CHECK (length(result_json) BETWEEN 2 AND 1024 AND json_valid(result_json)),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at BETWEEN created_at + 1 AND created_at + 86400000),
    UNIQUE (actor_user_id, actor_session_id, operation, client_mutation_id),
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (target_device_id, actor_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX ix_device_mutation_results_expiry
    ON device_mutation_results (expires_at, actor_user_id);

CREATE TABLE device_audit_events (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT NOT NULL UNIQUE CHECK (length(event_id) = 36 AND event_id = lower(event_id) AND substr(event_id, 15, 1) = '4' AND event_id NOT GLOB '*[^0-9a-f-]*'),
    schema_version INTEGER NOT NULL CHECK (schema_version = 11),
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('device.registered', 'device.revoked')),
    outcome TEXT NOT NULL CHECK (outcome = 'success'),
    reason_code TEXT NOT NULL CHECK (reason_code IN ('registered', 'user_requested')),
    actor_session_id TEXT NOT NULL,
    actor_device_id TEXT,
    target_device_id TEXT NOT NULL,
    request_id TEXT NOT NULL CHECK (length(request_id) = 36 AND request_id = lower(request_id) AND substr(request_id, 15, 1) = '4' AND request_id NOT GLOB '*[^0-9a-f-]*'),
    server_time INTEGER NOT NULL CHECK (server_time >= 0),
    metadata_json TEXT NOT NULL CHECK (metadata_json = '{}'),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_session_id) REFERENCES sessions(id) ON DELETE RESTRICT,
    FOREIGN KEY (actor_device_id, user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    FOREIGN KEY (target_device_id, user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT,
    CHECK ((event_type = 'device.registered' AND reason_code = 'registered' AND actor_device_id IS NULL) OR
           (event_type = 'device.revoked' AND reason_code = 'user_requested' AND actor_device_id = target_device_id))
) STRICT;

CREATE INDEX ix_device_audit_events_user_sequence
    ON device_audit_events (user_id, sequence DESC);

CREATE INDEX ix_devices_user_inventory
    ON devices (user_id, created_at DESC, id DESC);

CREATE TRIGGER device_mutation_results_authority_guard
BEFORE INSERT ON device_mutation_results
WHEN NOT EXISTS (
    SELECT 1 FROM sessions AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.id = NEW.actor_session_id AND s.user_id = NEW.actor_user_id
      AND s.revoked_at IS NULL AND NEW.created_at < s.idle_expires_at
      AND NEW.created_at < s.absolute_expires_at AND u.status = 'active'
)
BEGIN
    SELECT RAISE(ABORT, 'device mutation authority revoked');
END;

CREATE TRIGGER device_audit_events_authority_guard
BEFORE INSERT ON device_audit_events
WHEN NOT EXISTS (
    SELECT 1 FROM sessions AS s
    JOIN users AS u ON u.id = s.user_id
    WHERE s.id = NEW.actor_session_id AND s.user_id = NEW.user_id
      AND s.revoked_at IS NULL AND NEW.server_time < s.idle_expires_at
      AND NEW.server_time < s.absolute_expires_at AND u.status = 'active'
)
BEGIN
    SELECT RAISE(ABORT, 'device audit authority revoked');
END;

CREATE TRIGGER devices_security_identity_immutable
BEFORE UPDATE ON devices
WHEN NEW.id <> OLD.id OR NEW.user_id <> OLD.user_id OR NEW.label <> OLD.label OR
     NEW.public_jwk <> OLD.public_jwk OR NEW.fingerprint <> OLD.fingerprint OR
     NEW.suite <> OLD.suite OR NEW.created_at <> OLD.created_at OR OLD.state = 'revoked' OR
     (OLD.state = 'active' AND NOT (
        (NEW.state = 'active' AND NEW.revoked_at IS NULL AND NEW.revoke_reason IS NULL) OR
        (NEW.state = 'revoked' AND NEW.revoked_at IS NOT NULL AND NEW.revoke_reason IS NOT NULL)
     ))
BEGIN
    SELECT RAISE(ABORT, 'device security identity is immutable');
END;

CREATE TRIGGER device_mutation_results_no_update
BEFORE UPDATE ON device_mutation_results
BEGIN
    SELECT RAISE(ABORT, 'device mutation results are immutable');
END;

CREATE TRIGGER device_mutation_results_no_delete
BEFORE DELETE ON device_mutation_results
BEGIN
    SELECT RAISE(ABORT, 'device mutation results require controlled retention');
END;

CREATE TRIGGER device_audit_events_no_update
BEFORE UPDATE ON device_audit_events
BEGIN
    SELECT RAISE(ABORT, 'device audit events are append-only');
END;

CREATE TRIGGER device_audit_events_no_delete
BEFORE DELETE ON device_audit_events
BEGIN
    SELECT RAISE(ABORT, 'device audit events are append-only');
END;

UPDATE schema_metadata
SET schema_version = 11, maximum_runtime_schema = 11, updated_at = 1784678400000
WHERE singleton_id = 1 AND schema_version = 10;

PRAGMA foreign_key_check;
