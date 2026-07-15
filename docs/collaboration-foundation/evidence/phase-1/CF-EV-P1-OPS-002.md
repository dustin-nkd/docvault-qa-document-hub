# CF-EV-P1-OPS-002 — Dashboard-to-Wrangler transition

Status: PASS

Date: 2026-07-15

Story: `CF-P1-003`

Owner: Operations

Reviewer: Technical Lead and Senior QA

## Approved transition

The Product Owner approved `CF-P1-003`. The machine-checked transition keeps the captured project, branch, build, output, and compatibility date. It adds only `nodejs_compat` and four non-secret variable names to preview and production. Every remote binding inventory remains empty.

The pre-deployment check uses [`pages-project-baseline.json`](../../../../config/cloudflare/pages-project-baseline.json), [`pages-wrangler-diff.json`](../../../../config/cloudflare/pages-wrangler-diff.json), and [`wrangler.jsonc`](../../../../wrangler.jsonc). No raw Cloudflare response is retained.

Immediate pre-deployment read: the live allow-list snapshot matched the baseline with empty variable/binding inventories and no compatibility flag. The known-good rollback target is commit `b6f5b371995ce86746ae36bca4aa26731a88eb3d`, Cloudflare Pages deployment `d18f2f0b-7b82-46e5-a2c1-62fd410ec3c0`.

## Retained deployment result

1. GitHub Actions run `29428921300` passed toolchain, config, generated types, 69 regression tests, production artifact, browser suite, and GitHub Pages deployment for commit `199f5a4f21a685751e0bb2bbd32e407f9d67ef83`.
2. Cloudflare Pages deployment `87812a90-ba85-4b83-9d85-04d2c693e26f` deployed that exact clean `main` commit successfully.
3. The Git-connected build did not consume `wrangler.jsonc` as a configuration deployment. A subsequent documented `wrangler pages deploy` attempt stopped before mutation because the non-interactive CLI had no API token.
4. Operations used the authenticated Pages API to apply only the approved `nodejs_compat` flag and four non-secret values. A sanitized read confirmed the four expected names and empty D1, KV, R2, Durable Object, service, queue, Analytics Engine, and Hyperdrive inventories in both environments.
5. The project, `main` branch, build command, `_site` output, compatibility date, Git source, and canonical deployment remained unchanged. No secret, route, Function, or remote resource was created.
6. Both Cloudflare Pages and GitHub Pages guest URLs returned HTTP 200 after the change.

The API synchronization is retained as an explicit operational exception, not represented as a Wrangler CLI deployment. A later least-privilege credential story may activate `wrangler pages deploy`; it must use this reviewed file and repeat the same sanitized drift check.

Rollback uses the preceding known-good deployment and the procedure in [`phase-1-pages-configuration.md`](../../phase-1-pages-configuration.md).

Traceability: `CF-OPS-002/003`, `CF-FB-002`, `R17/R18`, `T19/T20`.
