# CF-EV-P1-UT-001 — Disabled request pipeline

Status: PASS locally; retained CI evidence pending

Date: 2026-07-15

Story: `CF-P1-004`

Result: Eight focused tests cover disabled response, unique server request IDs, route/method order, `Accept`, mutation media/size/JSON validation, tampered feature state, sanitized unexpected failure, and exact Pages routing. No test is skipped or retried.

Command: `node --test tests/api-shell.test.mjs` and full `npm run check`.

Side effects: none. Tests use Web-standard in-memory requests and do not call a provider, storage API, D1, OAuth, audit, cache, or network.

Traceability: `CF-OPS-001/004/005`, `CF-SES-004`, `R13/R15/R16/R21`, `T14/T16/T21/T23`.
