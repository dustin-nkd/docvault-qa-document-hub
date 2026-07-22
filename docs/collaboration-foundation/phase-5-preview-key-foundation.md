# CF-P5-007 — Isolated Preview key foundation preflight

Status: READY FOR P5-G4

Gate P5-G3 authorizes local integration and qualification preparation. The API shell now contains thirteen narrowly scoped device and workspace-key operations, but every checked-in environment keeps `KEY_FOUNDATION_MODE=disabled`. No remote D1 migration, variable change, secret change, or Preview deployment is included in this gate.

## Local qualification result

The Workers integration journey applies all twelve migrations to a disposable local D1 database and proves device registration, keyed workspace bootstrap, pending-member envelope provisioning, current-envelope read and cryptographic unwrap, and a complete current-plus-one rotation. Negative checks cover the exact Preview origin, CSRF path, disabled runtime, production isolation, unknown document routes, and no-store responses. Twenty authenticated reads must remain below the 300 ms local p95 budget.

The runtime uses request-scoped dependencies only, validates canonical public keys and envelopes before persistence, binds mutations to a session and CSRF token, requires idempotency keys, rate-limits authenticated callers, and never accepts or emits a plaintext workspace key.

## Deliberate hold at P5-G3

Remote evidence remains pending. Gate P5-G4 must explicitly authorize applying forward-only Preview migrations 11 and 12, setting the Preview-only route mode, deploying the isolated Preview, and running real-browser and remote security/performance qualification. Production remains out of scope and has no D1 binding.

Evidence placeholders `CF-EV-P5-E2E-003`, `CF-EV-P5-PERF-002`, `CF-EV-P5-SEC-007`, `CF-EV-P5-OPS-002`, and `CF-EV-P5-QA-003` are intentionally marked pending until those remote checks actually run.
