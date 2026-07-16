# CF-EV-P3-SEC-003 — OAuth transaction security evidence

Status: PASS

Story: `CF-P3-003`

Date: 2026-07-16

Negative tests reject replay, exact-boundary expiry, unknown state, wrong origin, wrong purpose, callback substitution, corrupt envelopes, and ambiguous active/previous-key matches. Fault checkpoints execute before each write boundary. State and verifier canaries do not appear in stored JSON or surfaced error messages.

The browser receives raw state only at creation. D1 stores its domain-separated HMAC-SHA-256 digest and an AES-256-GCM envelope bound to transaction ID, callback origin/path, and timestamps. Validation exposes one generic invalid result; creation/cleanup exposes one generic unavailable result.

Runtime remains isolated: identity routes 0, bindings 0, secrets changed 0, remote writes 0, identity enabled false, collaboration enabled false.
