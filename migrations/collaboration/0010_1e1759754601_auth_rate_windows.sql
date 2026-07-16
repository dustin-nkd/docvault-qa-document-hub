-- CF-P3-007: authoritative, privacy-preserving identity abuse-control windows.
PRAGMA defer_foreign_keys = true;

CREATE TABLE auth_rate_windows (
    key_digest BLOB NOT NULL CHECK (length(key_digest) = 32),
    route_family TEXT NOT NULL CHECK (route_family IN ('oauth_source', 'identity_source', 'identity_user')),
    window_started_at INTEGER NOT NULL CHECK (window_started_at >= 0),
    attempt_count INTEGER NOT NULL CHECK (
        (route_family = 'oauth_source' AND attempt_count BETWEEN 1 AND 20) OR
        (route_family = 'identity_user' AND attempt_count BETWEEN 1 AND 120) OR
        (route_family = 'identity_source' AND attempt_count BETWEEN 1 AND 300)
    ),
    expires_at INTEGER NOT NULL CHECK (expires_at = window_started_at + 1200000),
    CHECK ((route_family = 'oauth_source' AND window_started_at % 600000 = 0) OR
           (route_family IN ('identity_source', 'identity_user') AND window_started_at % 60000 = 0)),
    PRIMARY KEY (route_family, key_digest, window_started_at)
) STRICT, WITHOUT ROWID;

CREATE INDEX ix_auth_rate_windows_expiry
    ON auth_rate_windows (expires_at, route_family, window_started_at);

CREATE TRIGGER auth_rate_windows_update_guard
BEFORE UPDATE ON auth_rate_windows
WHEN NEW.key_digest <> OLD.key_digest OR NEW.route_family <> OLD.route_family OR
     NEW.window_started_at <> OLD.window_started_at OR NEW.expires_at <> OLD.expires_at OR
     NEW.attempt_count <> OLD.attempt_count + 1
BEGIN
    SELECT RAISE(ABORT, 'invalid auth rate window transition');
END;

UPDATE schema_metadata
SET schema_version = 10, maximum_runtime_schema = 10, updated_at = 1784246400000
WHERE singleton_id = 1 AND schema_version = 9;

PRAGMA foreign_key_check;
