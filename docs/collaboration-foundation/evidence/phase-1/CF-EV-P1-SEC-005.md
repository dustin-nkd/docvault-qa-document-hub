# CF-EV-P1-SEC-005 — Service Worker, Cache Storage, and branch isolation

Status: PASS

Date: 2026-07-15

Story: `CF-P1-005`

Result: Service Worker `v45` bypasses `/api` and `/api/*` before `respondWith`, network-first handling, Cache Storage lookup/write, and navigation fallback. Instrumented tests recorded zero worker fetch, match, or put calls for API URLs while `/apiary` retained normal static behavior. A seeded production Cache Storage imitation was not served; the live API returned 503 JSON rather than cached HTML. Both production origins ship the reviewed bypass.

Cloudflare branch policy retains source previews but excludes `gh-pages`. Skipped record `2c5befbe-ef0c-4053-90f8-ce7e5380e1a9` remained idle through queue, clone, build, and deploy; the previous invalid artifact-branch build did not recur. Production auto-deploy from `main` remained enabled.

Traceability: `CF-OPS-001/002`, `CF-FB-001/002`, `R13/R15/R17`, `T14/T16/T21`.
