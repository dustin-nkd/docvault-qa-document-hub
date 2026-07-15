# CF-EV-P1-INT-004 — Repeat and parallel isolation

Status: PASS

Date: 2026-07-15

Story: `CF-P1-007`

Result: Per-test reset restores the deterministic fixture. Two independently scheduled test files insert the same primary key with different values and each reads only its own value. The complete suite passed twice consecutively with no persistence or shared state.

Verification: two runs each passed 4 files and 10 tests with zero retry, skip, or failure.

Traceability: `CF-OPS-002/003`, `R05/R17/R18`.
