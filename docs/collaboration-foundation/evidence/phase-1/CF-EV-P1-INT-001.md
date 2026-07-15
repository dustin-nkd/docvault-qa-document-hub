# CF-EV-P1-INT-001 — Workers runtime and disposable D1

Status: PASS

Date: 2026-07-15

Story: `CF-P1-007`

Result: Vitest 4 executes four test files inside workerd through `cloudflareTest()`. `COLLAB_DB` is a Miniflare-only D1 binding with persistence disabled; the production Wrangler source has no D1 binding or resource ID.

Verification: `npm run cf:test` passed 10/10 tests and the static harness policy passed.

Traceability: `CF-OPS-002/003`, `R17/R18`.
