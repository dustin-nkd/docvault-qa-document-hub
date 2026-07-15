# CF-EV-P1-INT-002 — Official migration and deterministic fixture

Status: PASS

Date: 2026-07-15

Story: `CF-P1-007`

Result: `readD1Migrations()` loads the test-only SQL migration and `applyD1Migrations()` records `0001_test_harness.sql` in local D1. Every test begins with the same single baseline record. An invalid migration rejects and leaves no partial table.

Verification: migration, fixture, reset, and rollback integration cases passed.

Traceability: `CF-OPS-002/003`, `R05/R06`.
