# CF-EV-P1-STA-007 — CI and Functions deployment gates

Status: PASS

Date: 2026-07-16

Story: `CF-P1-008`

Result: `npm run check` composes base quality with pinned Cloudflare config/type, API unit, Workers/D1 integration, rollback rehearsal, Pages artifact, and compiled Functions gates. GitHub Actions runs it before final artifact inspection, browser regression, and deployment. The final `_routes.json` invokes Functions only for `/api/v1/*`; the compiled graph contains three reviewed runtime modules and no test adapter.

Verification: CI order/bypass mutation cases, Pages dry run, Wrangler metafile/import-graph inspection, and exact route tests passed. GitHub Actions run `29436208626` and Cloudflare deployment `ffe6ce47-05ad-4e3d-8f73-28bfae7bab4f` exercised the protected sequence successfully.

Traceability: `CF-ID-004`, `CF-ISO-005`, `CF-OPS-001–004`, `R15/R17/R18/R19/R22`.
