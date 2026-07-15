# CF-EV-P1-API-003 — Method contract

Status: PASS locally; retained deployment evidence pending

Date: 2026-07-15

Story: `CF-P1-004`

Result: A resolved route with an unsupported method returns `405 METHOD_NOT_ALLOWED` and only its fixed `Allow` value. It does not read or dispatch business behavior.

Traceability: `CF-OPS-004/005`, `R16`, `T23`.
