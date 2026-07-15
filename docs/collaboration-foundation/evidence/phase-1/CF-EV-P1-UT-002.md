# CF-EV-P1-UT-002 — Deterministic runtime dependencies

Status: PASS

Date: 2026-07-15

Story: `CF-P1-006`

Result: The test-only dependency implementation controls authoritative time and advancement, sequential UUIDv4 values, deterministic random bytes/base64url tokens, OAuth exchange/identity results and call capture, and named failure checkpoints. It is passed directly as the request handler's third argument; no environment or request selector is used.

The production implementation uses `Date.now()`, `crypto.randomUUID()`, bounded `crypto.getRandomValues()`, and a frozen dependency object. Production OAuth remains explicitly unavailable and performs no network request.

Traceability: `CF-OPS-005`, future `CF-ID/CF-SES` testability, `R01/R02/R19`, `T01/T02/T19`.
