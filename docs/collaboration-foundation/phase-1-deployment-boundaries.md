# Phase 1 build, CI, fallback, and deployment boundaries

Status: `CF-P1-008` implemented, deployed, and production verified

Date: 2026-07-16

Owners: Senior Developer, Senior QA, and Operations

Reviewers: Technical Lead and Security Reviewer

## Scope

This story protects how the disabled Cloudflare foundation is built, tested, published, and recovered. It does not enable collaboration, add a remote D1 binding, create user/workspace data, or change the Personal Vault and guest UI.

## Deployment artifact boundary

- [`build-pages.mjs`](../../scripts/build-pages.mjs) remains dependency-driven and now runs the reusable [`cloudflare-deployment-boundary-policy.mjs`](../../scripts/cloudflare-deployment-boundary-policy.mjs) before reporting success.
- `_site` accepts only reviewed root runtime files plus `icons/`, `js/`, and `vendor/` assets with approved extensions. Symbolic links and unexpected files fail the build.
- Protected server, Wrangler, test, fixture, migration, local D1, configuration, documentation/evidence, source-map, TypeScript, and SQL/database paths are rejected.
- Private-key, Cloudflare-token-name, deterministic-adapter, privacy-canary, test-migration, and fixture-token markers are rejected from text runtime assets.
- Every final file receives a SHA-256 digest in `.wrangler/pages-artifact-manifest.json`; the manifest is outside `_site` and remains ignored.
- `_routes.json` is parsed from the final artifact and must equal `{ version: 1, include: ["/api/v1/*"], exclude: [] }`.

## CI and Cloudflare Git build boundary

- `npm run check` now composes the established base gate with the complete Cloudflare gate.
- The Cloudflare gate runs pinned-toolchain, config, generated-type, API/security unit, Workers/D1 integration/isolation, read-only rollback, static artifact, and compiled Functions inspection.
- The existing Cloudflare Pages Git build command already begins with `npm run check`; therefore a failing Cloudflare gate now blocks its build before CSS/artifact publication.
- GitHub Actions runs the same full check before CSS, final artifact construction, artifact-boundary reinspection, Chromium/browser regression, and deployment.
- CI policy tests reject removed, reordered, bypassed, `continue-on-error`, or deploy-after-failure gates.

## Fallback and startup boundary

- Dashboard direct startup remains capped at 850 KB and cannot eagerly reference a collaboration module, collaboration control, workspace marker, or `/api/v1/` path.
- Browser regression proves guest/Personal flows issue zero collaboration API requests and render no collaboration controls.
- The repeatable production smoke script requires Cloudflare guest HTTP 200, disabled JSON/no-store API 503, GitHub guest HTTP 200, and a non-API GitHub root HTTP 404.

## Disablement and rollback rehearsal

- [`rollback-rehearsal.json`](../../config/cloudflare/rollback-rehearsal.json) pins compatible commit `10c4e657a19fb22ba5f2ba46a1cd36a5a10b8298` and successful Cloudflare deployment `2379fd92-420b-4805-b1de-78f3295a8722`.
- The rehearsal reads the previous commit directly with Git. It verifies locked dependencies, exact API routes, no D1/remote resource, and `COLLABORATION_ENABLED=false` in local, preview, and production.
- Rehearsal mode is `read-only`; it performs no checkout, force push, deployment mutation, database operation, or production rollback. Recovery uses a reviewed revert-and-redeploy commit so main-branch history is preserved.

## Local verification

- Node regression/policy suite: 98 passed, zero failed/skipped/retried.
- Cloudflare API/security unit suite: 18 passed.
- Workers Vitest/D1 integration suite: 10 passed across four files.
- Strict TypeScript, Wrangler config/generated types, Pages static build, Functions compilation/metafile/import graph, final artifact boundary, and rollback rehearsal: pass.
- Static artifact: 50 entries including `.nojekyll`, 1,887,978 bytes, zero protected path/content marker.
- Clean install and browser regression passed locally and in GitHub Actions run `29436208626`.
- Cloudflare deployment `ffe6ce47-05ad-4e3d-8f73-28bfae7bab4f` built and deployed commit `06395b4316f5f709d5706e925f151f36c98faa91` successfully with `COLLABORATION_ENABLED=false`.
- Production boundary smoke passed: Cloudflare guest `200`, disabled API `503 COLLABORATION_UNAVAILABLE` with `no-store`, GitHub Pages guest `200`, and GitHub Pages API absent with `404`.

## Traceability

- Requirements: `CF-ID-004`, `CF-ISO-005`, `CF-FB-001/002`, `CF-OPS-001–004`, `CF-NFR-002`.
- Risks: `R15`, `R17`, `R18`, `R19`, `R22`.
- Evidence: `CF-EV-P1-STA-006`, `CF-EV-P1-STA-007`, `CF-EV-P1-E2E-002`, `CF-EV-P1-OPS-003`, `CF-EV-P1-OPS-004`.

Official references: [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Pages Wrangler source of truth](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), and [Pages Functions compilation](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/#pages-functions-with-a-functions-folder).
