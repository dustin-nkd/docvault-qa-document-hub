# CF-EV-P1-API-005 — Bounded body and JSON contract

Status: PASS locally; retained deployment evidence pending

Date: 2026-07-15

Story: `CF-P1-004`

Result: Declared and streamed request bytes are bounded at 1 MiB. Oversize requests return `413 PAYLOAD_TOO_LARGE`; malformed length/query metadata returns `400 VALIDATION_FAILED`; malformed UTF-8/JSON returns `400 INVALID_JSON`. Bodies are never logged or echoed.

Traceability: `CF-OPS-005`, `R16/R21`, `T16/T21/T23`.
