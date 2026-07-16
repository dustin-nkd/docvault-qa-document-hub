# CF-EV-P3-INT-001 — OAuth transaction D1 integration evidence

Status: PASS

Story: `CF-P3-003`

Date: 2026-07-16

All nine immutable collaboration migrations are applied to disposable local D1 before the lifecycle tests. The implementation uses a first-primary D1 session, prepared statements, a guarded pending-and-unexpired compare-and-set, and checked mutation counts. Two simultaneous consumers produce exactly one success and one rejection; every later replay is rejected.

The existing schema version 9 is sufficient. Added migrations: 0. User/session side effects: 0. Production D1 bindings: 0.

Cleanup marks only pending rows whose expiry is at or before server time and deletes only terminal rows older than the 24-hour retention boundary. Each mutation is capped at 100 rows.
