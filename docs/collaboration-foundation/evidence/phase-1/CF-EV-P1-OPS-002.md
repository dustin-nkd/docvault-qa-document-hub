# CF-EV-P1-OPS-002 — Dashboard-to-Wrangler transition

Status: PASS locally; first deployment evidence pending

Date: 2026-07-15

Story: `CF-P1-003`

Owner: Operations

Reviewer: Technical Lead and Senior QA

## Approved transition

The Product Owner approved `CF-P1-003`. The machine-checked transition keeps the captured project, branch, build, output, and compatibility date. It adds only `nodejs_compat` and four non-secret variable names to preview and production. Every remote binding inventory remains empty.

The pre-deployment check uses [`pages-project-baseline.json`](../../../../config/cloudflare/pages-project-baseline.json), [`pages-wrangler-diff.json`](../../../../config/cloudflare/pages-wrangler-diff.json), and [`wrangler.jsonc`](../../../../wrangler.jsonc). No raw Cloudflare response is retained.

Immediate pre-deployment read: the live allow-list snapshot matched the baseline with empty variable/binding inventories and no compatibility flag. The known-good rollback target is commit `b6f5b371995ce86746ae36bca4aa26731a88eb3d`, Cloudflare Pages deployment `d18f2f0b-7b82-46e5-a2c1-62fd410ec3c0`.

## Required retained deployment result

1. GitHub Actions passes toolchain, config, generated types, full regression, production artifact, browser suite, and GitHub Pages deployment.
2. Cloudflare Pages deploys the same commit from `main` successfully.
3. A sanitized API read confirms `nodejs_compat`, the four expected variable names, and no remote binding in both environments.
4. Both production origins return HTTP 200 and Personal Vault/guest behavior remains available.
5. No Cloudflare mutation occurs other than the normal Git-connected deployment applying the reviewed source-of-truth configuration.

Rollback uses the preceding known-good deployment and the procedure in [`phase-1-pages-configuration.md`](../../phase-1-pages-configuration.md).

Traceability: `CF-OPS-002/003`, `CF-FB-002`, `R17/R18`, `T19/T20`.
