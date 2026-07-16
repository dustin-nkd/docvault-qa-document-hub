-- CF-P2-006 forward-only correction: bounded hold-aware operational retention purge.
PRAGMA defer_foreign_keys = true;

CREATE TABLE retention_purge_runs (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    target TEXT NOT NULL CHECK (target IN ('audit_events', 'transition_guards')),
    cutoff_at INTEGER NOT NULL CHECK (cutoff_at >= 0),
    started_at INTEGER NOT NULL CHECK (started_at >= cutoff_at),
    max_rows INTEGER NOT NULL CHECK (max_rows BETWEEN 1 AND 100),
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    completed_at INTEGER CHECK (completed_at IS NULL OR completed_at >= started_at),
    CHECK ((status = 'running' AND completed_at IS NULL) OR
           (status IN ('completed', 'failed') AND completed_at IS NOT NULL)),
    CHECK (target <> 'audit_events' OR started_at - cutoff_at >= 31536000000)
) STRICT;

CREATE UNIQUE INDEX uq_retention_purge_runs_running_target
    ON retention_purge_runs (target) WHERE status = 'running';

CREATE TRIGGER retention_purge_runs_update_guard
BEFORE UPDATE ON retention_purge_runs
WHEN OLD.status <> 'running' OR NEW.status NOT IN ('completed', 'failed') OR
     NEW.id <> OLD.id OR NEW.target <> OLD.target OR NEW.cutoff_at <> OLD.cutoff_at OR
     NEW.started_at <> OLD.started_at OR NEW.max_rows <> OLD.max_rows
BEGIN
    SELECT RAISE(ABORT, 'invalid retention purge run transition');
END;

CREATE TRIGGER retention_purge_runs_no_delete
BEFORE DELETE ON retention_purge_runs
BEGIN
    SELECT RAISE(ABORT, 'retention purge run history is immutable');
END;

DROP TRIGGER audit_events_no_delete;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
WHEN NOT EXISTS (
    SELECT 1 FROM retention_purge_runs r
    WHERE r.target = 'audit_events' AND r.status = 'running'
      AND OLD.server_time < r.cutoff_at
      AND NOT EXISTS (
          SELECT 1 FROM retention_holds h
          WHERE h.workspace_id = OLD.workspace_id AND h.status = 'active'
            AND (h.expires_at IS NULL OR h.expires_at > r.started_at)
      )
)
BEGIN
    SELECT RAISE(ABORT, 'audit events are append-only outside an authorized retention purge');
END;

DROP TRIGGER transition_guards_no_delete;

CREATE TRIGGER transition_guards_no_delete
BEFORE DELETE ON transition_guards
WHEN NOT EXISTS (
    SELECT 1 FROM retention_purge_runs r
    WHERE r.target = 'transition_guards' AND r.status = 'running'
      AND OLD.expires_at <= r.cutoff_at
)
BEGIN
    SELECT RAISE(ABORT, 'transition guard history is immutable outside an authorized retention purge');
END;

UPDATE schema_metadata
SET schema_version = 9, maximum_runtime_schema = 9, updated_at = 1784160000000
WHERE singleton_id = 1 AND schema_version = 8;

PRAGMA foreign_key_check;
