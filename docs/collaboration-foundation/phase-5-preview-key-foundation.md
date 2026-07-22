# CF-P5-007 — Isolated Preview key foundation qualification

Status: PASS

Gate P5-G4 authorizes applying forward-only Preview migrations 11 and 12, activating `KEY_FOUNDATION_MODE=preview-only` only in the isolated Preview environment, deploying the Preview build, and collecting remote qualification evidence. Local and Production remain `disabled`; Production has no D1 binding.

## Local qualification result

The Workers integration journey applies all twelve migrations to a disposable local D1 database and proves device registration, keyed workspace bootstrap, pending-member envelope provisioning, current-envelope read and cryptographic unwrap, and a complete current-plus-one rotation. Negative checks cover the exact Preview origin, CSRF path, disabled runtime, production isolation, unknown document routes, and no-store responses. Twenty authenticated reads must remain below the 300 ms local p95 budget.

The runtime uses request-scoped dependencies only, validates canonical public keys and envelopes before persistence, binds mutations to a session and CSRF token, requires idempotency keys, rate-limits authenticated callers, and never accepts or emits a plaintext workspace key.

## Remote qualification result

Gate `P5-G4` completed on 2026-07-22. Preview advanced forward-only from schema 10 to schema 12 and retained zero foreign-key violations. The isolated branch deployment activated only `KEY_FOUNDATION_MODE=preview-only`; Production remained disabled without a D1 binding, and GitHub Pages remained API-less.

A real Microsoft Edge session completed device registration, keyed workspace bootstrap, v1 cryptographic unwrap, monotonic rotation, commit to version 2, and v2 cryptographic unwrap. Twenty authenticated current-envelope reads observed p95 238.7 ms against the 300 ms budget. Anonymous and hostile-Origin probes failed closed, all API responses remained non-cacheable, and no plaintext key or protected browser material was persisted in evidence.

The qualification session was revoked and rate state reconciled to zero. Append-only encrypted key, rotation, mutation, and audit evidence remains in the isolated Preview database by design; no prohibited shared Preview restore or history deletion was used. Production changes, Production secrets, and Production D1 bindings remain zero. The evidence package recommends approval of `P5-G4A` for the `CF-P5-007` exit review.
