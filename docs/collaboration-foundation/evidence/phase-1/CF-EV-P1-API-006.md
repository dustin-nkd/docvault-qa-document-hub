# CF-EV-P1-API-006 — Sanitized runtime failure

Status: PASS

Date: 2026-07-15

Story: `CF-P1-004`

Result: An unexpected request-body stream failure returns `500 INTERNAL_ERROR` in the same no-store JSON envelope. The injected error marker and stack are absent. The handler never calls an asset fallback or `passThroughOnException`.

Traceability: `CF-OPS-001/005`, `R13/R16`, `T14/T16/T23`.
