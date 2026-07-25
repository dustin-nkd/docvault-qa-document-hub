# CF-EV-P6-INT-001 Document mutation integration evidence

Status: PASS

Story: `CF-P6-004`

Sixteen Workers/D1 tests exercise the service against a real migrated schema-12 database rather than a mock, and every assertion inspects D1 side effects — document, revision, ledger, and audit row counts scoped to the workspace under test — rather than trusting the returned value alone.

**Sprint gate G4 (two browsers, one base revision).** Two concurrent updates submitted against base revision 1 settle as exactly one fulfilled and one rejected promise. The winner advances the document to revision 2; the loser receives `DOCUMENT_REVISION_CONFLICT` reporting submitted base revision 1 and current revision 2, and leaves no revision, ledger, or audit row. A separately submitted stale write reproduces the same outcome deterministically.

**Sprint gate G5 (network retry creates no duplicate revision).** Five sequential replays of an identical mutation each return the original document identifier, revision, and client mutation identifier with the replay flag set, and the four counters are unchanged after all five. The same mutation identifier submitted with a different ciphertext digest is rejected as `IDEMPOTENCY_KEY_REUSED` with no side effect, and a replay past the thirty-day window returns `IDEMPOTENCY_WINDOW_EXPIRED` rather than silently re-applying.

**Sprint gate G3 (Viewer cannot write).** A Viewer create, update, and tombstone are each denied with zero document, revision, ledger, and audit rows created. The same zero-row outcome is proven for a removed member, a revoked device, a cross-workspace identifier, and a tombstoned target.

Append-only behaviour is verified directly: after an update, revision 1 still records the create operation with base revision zero, and a tombstone adds a delete revision while the document row transitions to tombstoned with a timestamp instead of being removed.

Failure injection at a write boundary uses a duplicate audit event identifier, which violates the unique constraint at the audit statement. The revision insert and pointer update roll back with it: all four counters and the document's current revision are unchanged.
