-- CF-P5-006 / P5-G2C-M: monotonic workspace-key rotation persistence.
PRAGMA defer_foreign_keys = true;

CREATE TABLE workspace_key_rotations (
    id TEXT PRIMARY KEY CHECK (length(id) = 36 AND id = lower(id) AND substr(id, 15, 1) = '4' AND id NOT GLOB '*[^0-9a-f-]*'),
    workspace_id TEXT NOT NULL,
    from_key_version INTEGER NOT NULL CHECK (from_key_version BETWEEN 1 AND 2147483646),
    to_key_version INTEGER NOT NULL CHECK (to_key_version = from_key_version + 1),
    initiator_user_id TEXT NOT NULL,
    initiator_device_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 64 AND reason NOT GLOB '*[^a-z0-9_-]*'),
    state TEXT NOT NULL CHECK (state IN ('preparing', 'committed', 'aborted')),
    eligibility_digest BLOB NOT NULL CHECK (length(eligibility_digest) = 32),
    eligible_count INTEGER NOT NULL CHECK (eligible_count BETWEEN 1 AND 100),
    staged_count INTEGER NOT NULL CHECK (staged_count BETWEEN 0 AND eligible_count),
    created_at INTEGER NOT NULL CHECK (created_at >= 0),
    expires_at INTEGER NOT NULL CHECK (expires_at BETWEEN created_at + 1 AND created_at + 86400000),
    committed_at INTEGER CHECK (committed_at IS NULL OR committed_at BETWEEN created_at AND expires_at),
    aborted_at INTEGER CHECK (aborted_at IS NULL OR aborted_at >= created_at),
    UNIQUE (id, workspace_id),
    CHECK ((state = 'preparing' AND committed_at IS NULL AND aborted_at IS NULL) OR
           (state = 'committed' AND committed_at IS NOT NULL AND aborted_at IS NULL AND staged_count = eligible_count) OR
           (state = 'aborted' AND committed_at IS NULL AND aborted_at IS NOT NULL)),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, from_key_version) REFERENCES workspace_key_versions(workspace_id, key_version) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, to_key_version) REFERENCES workspace_key_versions(workspace_id, key_version) ON DELETE RESTRICT,
    FOREIGN KEY (initiator_device_id, initiator_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX uq_workspace_key_rotations_preparing
    ON workspace_key_rotations (workspace_id) WHERE state = 'preparing';
CREATE INDEX ix_workspace_key_rotations_status
    ON workspace_key_rotations (workspace_id, state, created_at DESC, id DESC);

CREATE TABLE workspace_key_rotation_targets (
    rotation_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    target_user_id TEXT NOT NULL,
    target_device_id TEXT NOT NULL,
    target_fingerprint BLOB NOT NULL CHECK (length(target_fingerprint) = 32),
    state TEXT NOT NULL CHECK (state IN ('pending', 'staged', 'excluded')),
    PRIMARY KEY (rotation_id, target_device_id),
    FOREIGN KEY (rotation_id, workspace_id) REFERENCES workspace_key_rotations(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (target_device_id, target_user_id) REFERENCES devices(id, user_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX ix_workspace_key_rotation_targets_state
    ON workspace_key_rotation_targets (rotation_id, state, target_device_id);

CREATE TRIGGER workspace_key_rotations_insert_guard
BEFORE INSERT ON workspace_key_rotations
WHEN NEW.to_key_version <> NEW.from_key_version + 1 OR NOT EXISTS (
    SELECT 1 FROM workspaces AS w
    JOIN memberships AS m ON m.workspace_id = w.id
    JOIN users AS u ON u.id = m.user_id
    JOIN devices AS d ON d.id = NEW.initiator_device_id AND d.user_id = m.user_id
    WHERE w.id = NEW.workspace_id AND w.state = 'active'
      AND w.current_key_version = NEW.from_key_version
      AND m.user_id = NEW.initiator_user_id AND m.role = 'owner' AND m.state = 'active'
      AND u.status = 'active' AND d.state = 'active'
      AND EXISTS (SELECT 1 FROM workspace_key_envelopes AS e
        WHERE e.workspace_id = w.id AND e.key_version = w.current_key_version
          AND e.target_user_id = m.user_id AND e.target_device_id = d.id
          AND e.target_fingerprint = d.fingerprint AND e.revoked_at IS NULL)
)
BEGIN
    SELECT RAISE(ABORT, 'rotation start authority or version invalid');
END;

CREATE TRIGGER workspace_key_rotation_targets_insert_guard
BEFORE INSERT ON workspace_key_rotation_targets
WHEN NEW.state <> 'pending' OR NOT EXISTS (
    SELECT 1 FROM workspace_key_rotations AS r
    JOIN memberships AS m ON m.workspace_id = r.workspace_id
    JOIN users AS u ON u.id = m.user_id
    JOIN devices AS d ON d.id = NEW.target_device_id AND d.user_id = m.user_id
    WHERE r.id = NEW.rotation_id AND r.workspace_id = NEW.workspace_id AND r.state = 'preparing'
      AND m.user_id = NEW.target_user_id AND m.state = 'active'
      AND u.status = 'active' AND d.state = 'active' AND d.fingerprint = NEW.target_fingerprint
)
BEGIN
    SELECT RAISE(ABORT, 'rotation target is not eligible');
END;

CREATE TRIGGER workspace_key_rotation_envelope_guard
BEFORE INSERT ON workspace_key_envelopes
WHEN EXISTS (SELECT 1 FROM workspace_key_versions AS v
    WHERE v.workspace_id = NEW.workspace_id AND v.key_version = NEW.key_version AND v.state = 'preparing')
 AND NOT EXISTS (
    SELECT 1 FROM workspace_key_rotations AS r
    JOIN workspace_key_rotation_targets AS t ON t.rotation_id = r.id
    WHERE r.workspace_id = NEW.workspace_id AND r.to_key_version = NEW.key_version
      AND r.state = 'preparing' AND r.initiator_user_id = NEW.wrapper_user_id
      AND r.initiator_device_id = NEW.wrapper_device_id
      AND t.target_user_id = NEW.target_user_id AND t.target_device_id = NEW.target_device_id
      AND t.target_fingerprint = NEW.target_fingerprint AND t.state = 'pending'
)
BEGIN
    SELECT RAISE(ABORT, 'staged envelope is outside the immutable rotation snapshot');
END;

CREATE TRIGGER workspace_key_rotation_targets_update_guard
BEFORE UPDATE ON workspace_key_rotation_targets
WHEN NEW.rotation_id <> OLD.rotation_id OR NEW.workspace_id <> OLD.workspace_id OR
     NEW.target_user_id <> OLD.target_user_id OR NEW.target_device_id <> OLD.target_device_id OR
     NEW.target_fingerprint <> OLD.target_fingerprint OR OLD.state = 'excluded' OR
     NOT ((OLD.state = 'pending' AND NEW.state IN ('staged', 'excluded')) OR
          (OLD.state = 'staged' AND NEW.state = 'excluded')) OR
     (NEW.state = 'staged' AND NOT EXISTS (
        SELECT 1 FROM workspace_key_rotations AS r
        JOIN workspace_key_envelopes AS e ON e.workspace_id = r.workspace_id
          AND e.key_version = r.to_key_version AND e.target_device_id = OLD.target_device_id
        WHERE r.id = OLD.rotation_id AND r.state = 'preparing'
          AND e.target_user_id = OLD.target_user_id AND e.target_fingerprint = OLD.target_fingerprint
          AND e.revoked_at IS NULL))
BEGIN
    SELECT RAISE(ABORT, 'rotation target snapshot is immutable');
END;

CREATE TRIGGER workspace_key_rotations_update_guard
BEFORE UPDATE ON workspace_key_rotations
WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR
     NEW.from_key_version <> OLD.from_key_version OR NEW.to_key_version <> OLD.to_key_version OR
     NEW.initiator_user_id <> OLD.initiator_user_id OR NEW.initiator_device_id <> OLD.initiator_device_id OR
     NEW.reason <> OLD.reason OR NEW.eligibility_digest <> OLD.eligibility_digest OR
     NEW.eligible_count <> OLD.eligible_count OR NEW.created_at <> OLD.created_at OR NEW.expires_at <> OLD.expires_at OR
     OLD.state <> 'preparing' OR NOT (
       (NEW.state = 'preparing' AND NEW.committed_at IS NULL AND NEW.aborted_at IS NULL AND
        NEW.staged_count BETWEEN OLD.staged_count AND OLD.eligible_count) OR
       (NEW.state = 'aborted' AND NEW.committed_at IS NULL AND NEW.aborted_at IS NOT NULL) OR
       (NEW.state = 'committed' AND NEW.committed_at IS NOT NULL AND NEW.aborted_at IS NULL AND
        NEW.staged_count = NEW.eligible_count AND NEW.committed_at < NEW.expires_at AND
        EXISTS (SELECT 1 FROM workspaces AS w WHERE w.id = OLD.workspace_id
          AND w.state = 'active' AND w.current_key_version = OLD.to_key_version) AND
        NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
          WHERE t.rotation_id = OLD.id AND t.state <> 'staged') AND
        NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
          LEFT JOIN memberships AS m ON m.workspace_id = t.workspace_id AND m.user_id = t.target_user_id
          LEFT JOIN users AS u ON u.id = t.target_user_id
          LEFT JOIN devices AS d ON d.id = t.target_device_id AND d.user_id = t.target_user_id
          LEFT JOIN workspace_key_envelopes AS e ON e.workspace_id = t.workspace_id
            AND e.key_version = OLD.to_key_version AND e.target_device_id = t.target_device_id
          WHERE t.rotation_id = OLD.id AND (m.state <> 'active' OR u.status <> 'active' OR
            d.state <> 'active' OR d.fingerprint <> t.target_fingerprint OR
            e.target_user_id <> t.target_user_id OR e.target_fingerprint <> t.target_fingerprint OR e.revoked_at IS NOT NULL)) AND
        NOT EXISTS (SELECT 1 FROM memberships AS m
          JOIN users AS u ON u.id = m.user_id AND u.status = 'active'
          JOIN devices AS d ON d.user_id = m.user_id AND d.state = 'active'
          WHERE m.workspace_id = OLD.workspace_id AND m.state = 'active'
            AND NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
              WHERE t.rotation_id = OLD.id AND t.target_user_id = m.user_id
                AND t.target_device_id = d.id AND t.target_fingerprint = d.fingerprint)))
     )
BEGIN
    SELECT RAISE(ABORT, 'rotation transition violates snapshot or monotonicity');
END;

CREATE TRIGGER workspaces_key_rotation_commit_guard
BEFORE UPDATE OF current_key_version ON workspaces
WHEN NEW.current_key_version <> OLD.current_key_version AND NOT (
    OLD.state = 'rotating' AND NEW.state = 'active' AND
    NEW.current_key_version = OLD.current_key_version + 1 AND
    EXISTS (
      SELECT 1 FROM workspace_key_rotations AS r
      JOIN memberships AS owner ON owner.workspace_id = r.workspace_id
        AND owner.user_id = r.initiator_user_id
      JOIN users AS u ON u.id = owner.user_id
      JOIN devices AS initiator ON initiator.id = r.initiator_device_id
        AND initiator.user_id = owner.user_id
      WHERE r.workspace_id = OLD.id AND r.state = 'preparing'
        AND r.from_key_version = OLD.current_key_version
        AND r.to_key_version = NEW.current_key_version
        AND r.staged_count = r.eligible_count AND NEW.updated_at < r.expires_at
        AND owner.role = 'owner' AND owner.state = 'active'
        AND u.status = 'active' AND initiator.state = 'active'
        AND EXISTS (SELECT 1 FROM workspace_key_envelopes AS current
          WHERE current.workspace_id = OLD.id AND current.key_version = OLD.current_key_version
            AND current.target_user_id = owner.user_id
            AND current.target_device_id = initiator.id
            AND current.target_fingerprint = initiator.fingerprint AND current.revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
          WHERE t.rotation_id = r.id AND t.state <> 'staged')
        AND NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
          LEFT JOIN memberships AS m ON m.workspace_id = t.workspace_id AND m.user_id = t.target_user_id
          LEFT JOIN users AS target_user ON target_user.id = t.target_user_id
          LEFT JOIN devices AS d ON d.id = t.target_device_id AND d.user_id = t.target_user_id
          LEFT JOIN workspace_key_envelopes AS e ON e.workspace_id = t.workspace_id
            AND e.key_version = r.to_key_version AND e.target_device_id = t.target_device_id
          WHERE t.rotation_id = r.id AND (m.state <> 'active' OR target_user.status <> 'active' OR
            d.state <> 'active' OR d.fingerprint <> t.target_fingerprint OR
            e.target_user_id <> t.target_user_id OR e.target_fingerprint <> t.target_fingerprint OR
            e.revoked_at IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM memberships AS m
          JOIN users AS target_user ON target_user.id = m.user_id AND target_user.status = 'active'
          JOIN devices AS d ON d.user_id = m.user_id AND d.state = 'active'
          WHERE m.workspace_id = OLD.id AND m.state = 'active'
            AND NOT EXISTS (SELECT 1 FROM workspace_key_rotation_targets AS t
              WHERE t.rotation_id = r.id AND t.target_user_id = m.user_id
                AND t.target_device_id = d.id AND t.target_fingerprint = d.fingerprint))
    )
)
BEGIN
    SELECT RAISE(ABORT, 'workspace key rotation commit is incomplete or stale');
END;
CREATE TRIGGER workspace_key_rotations_no_delete
BEFORE DELETE ON workspace_key_rotations
BEGIN
    SELECT RAISE(ABORT, 'rotation history is append-only');
END;

CREATE TRIGGER workspace_key_rotation_targets_no_delete
BEFORE DELETE ON workspace_key_rotation_targets
BEGIN
    SELECT RAISE(ABORT, 'rotation target history is append-only');
END;

UPDATE schema_metadata
SET schema_version = 12, maximum_runtime_schema = 12, updated_at = 1784764800000
WHERE singleton_id = 1 AND schema_version = 11;

PRAGMA foreign_key_check;
