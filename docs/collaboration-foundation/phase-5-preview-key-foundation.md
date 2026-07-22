# CF-P5-007 — Isolated Preview key foundation qualification

Status: REMOTE QUALIFICATION IN PROGRESS

Gate P5-G4 authorizes applying forward-only Preview migrations 11 and 12, activating `KEY_FOUNDATION_MODE=preview-only` only in the isolated Preview environment, deploying the Preview build, and collecting remote qualification evidence. Local and Production remain `disabled`; Production has no D1 binding.

## Local qualification result

The Workers integration journey applies all twelve migrations to a disposable local D1 database and proves device registration, keyed workspace bootstrap, pending-member envelope provisioning, current-envelope read and cryptographic unwrap, and a complete current-plus-one rotation. Negative checks cover the exact Preview origin, CSRF path, disabled runtime, production isolation, unknown document routes, and no-store responses. Twenty authenticated reads must remain below the 300 ms local p95 budget.

The runtime uses request-scoped dependencies only, validates canonical public keys and envelopes before persistence, binds mutations to a session and CSRF token, requires idempotency keys, rate-limits authenticated callers, and never accepts or emits a plaintext workspace key.

## Remote qualification boundary

Remote evidence remains pending until the migration invariants, Preview deployment, real-browser journey, and remote security/performance checks complete. Production remains out of scope and has no D1 binding.

Evidence placeholders `CF-EV-P5-E2E-003`, `CF-EV-P5-PERF-002`, `CF-EV-P5-SEC-007`, `CF-EV-P5-OPS-002`, and `CF-EV-P5-QA-003` are intentionally marked pending until those remote checks actually run.
