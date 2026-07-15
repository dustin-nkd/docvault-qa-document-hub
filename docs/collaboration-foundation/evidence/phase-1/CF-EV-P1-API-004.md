# CF-EV-P1-API-004 — Media contract

Status: PASS

Date: 2026-07-15

Story: `CF-P1-004`

Result: Incompatible response media returns `406 NOT_ACCEPTABLE`. Mutation-shaped requests missing exact `application/json; charset=utf-8` return `415 UNSUPPORTED_MEDIA_TYPE`. Both use sanitized versioned JSON and perform no dispatch.

Traceability: `CF-OPS-004/005`, `R16/R21`, `T21/T23`.
