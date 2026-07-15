-- CF-P1-007 disposable test harness only. This is not collaboration schema.
CREATE TABLE harness_records (
    id TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
