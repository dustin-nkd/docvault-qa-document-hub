# Phase 1 disabled API runtime shell

Status: `CF-P1-004` implemented, deployed, and verified

Date: 2026-07-15

Owners: Senior Developer and Technical Lead

Reviewers: Security Reviewer and Senior QA

## Scope

This story adds a Cloudflare Pages Function only under `/api/v1/*`. It contains no collaboration business dispatch, OAuth exchange, session, D1 access, storage, audit write, background work, or UI. `COLLABORATION_ENABLED` remains the exact string `false`; malformed or tampered runtime configuration still reaches only the unavailable response.

Exact-origin/CSRF enforcement and Service Worker cache isolation remain assigned to `CF-P1-005`. Deterministic platform/failure adapters remain assigned to `CF-P1-006`. The runtime shell does not pre-implement either story.

## Runtime boundary

- [`_routes.json`](../../_routes.json) includes only `/api/v1/*`.
- [`functions/api/v1/[[path]].ts`](../../functions/api/v1/[[path]].ts) is the sole file-based route and uses the Wrangler-generated `Env` type.
- [`functions/_lib/api-shell.mjs`](../../functions/_lib/api-shell.mjs) owns request IDs, route/method/media/size/JSON gates, error envelopes, and response headers.
- Static assets never invoke the Function. The server module and TypeScript configuration remain outside `_site`.

## Evaluation order

1. Generate a new server request ID with `crypto.randomUUID()`; ignore any incoming `X-Request-ID` as authority.
2. Enforce the 4 KiB query bound and resolve an approved v1 route template.
3. Enforce the route's fixed method/`Allow` contract and compatible JSON `Accept` value.
4. For mutation-shaped methods, require `application/json; charset=utf-8`.
5. Reject declared or streamed bodies above 1 MiB before full unbounded buffering; reject malformed UTF-8/JSON.
6. Inspect the reviewed disabled environment state and return `503 COLLABORATION_UNAVAILABLE` without dispatch.
7. Map unexpected runtime failures to sanitized `500 INTERNAL_ERROR` JSON.

Every response contains the versioned failure envelope, `X-Request-ID`, `Cache-Control: no-store, private`, JSON content type, `nosniff`, deny-frame CSP, restrictive referrer and permissions policies, and no CORS reflection.

## Prohibited behavior

Release gates reject `passThroughOnException`, `context.next()`, `Math.random()`, Cloudflare REST calls, runtime logging, future binding/secret access, server files in `_site`, and a Functions route outside `/api/v1/*`. No promise is floated and no request-scoped mutable module state exists.

## Local verification

- clean `npm ci` and audit: 161 locked packages, zero vulnerabilities;
- TypeScript strict no-emit check: pass;
- focused API shell suite: eight cases pass;
- full regression: 77 tests pass;
- Wrangler Pages Functions build and production dry-run: pass;
- production artifact: 49 runtime files, 1,887,633 bytes, `_routes.json` included and server source excluded;
- browser regression: pass;
- local workerd smoke: static root `200`; session `503` JSON; unknown route `404` JSON; malformed JSON `400`; required security headers present.

## Evidence

- `CF-EV-P1-UT-001`: pure request pipeline and negative cases.
- `CF-EV-P1-API-001` through `006`: unavailable, route, method, media, bounds, and sanitized failure contracts.
- `CF-EV-P1-SEC-003`: side-effect/artifact/privacy review.
- Requirements: `CF-OPS-001/004/005`, `CF-SES-004`.
- Risks: `R13`, `R15`, `R16`, `R21`; threats: `T14`, `T16`, `T21`, `T23`.

## Retained deployment result

- Implementation commit: `60e37e2d8adb786a9a858711ad5daf1f9ed444d3`.
- GitHub Actions run: `29431093836`, success on Node 22 with all release gates and GitHub Pages deployment.
- Cloudflare production deployment: `c4657e36-265f-4ff3-ab39-60add79b3a45`, success from clean `main`.
- Canonical production matrix: session `503 COLLABORATION_UNAVAILABLE`; unknown route `404 RESOURCE_NOT_FOUND`; wrong method `405 METHOD_NOT_ALLOWED` with `Allow: GET`; missing media `415 UNSUPPORTED_MEDIA_TYPE`; malformed JSON `400 INVALID_JSON`.
- Cloudflare and GitHub static guest origins: HTTP 200.

Cloudflare also attempted a non-production build from the generated `gh-pages` artifact branch and failed before deploy because that branch is not an application source checkout. It did not affect the successful `main` deployment or either production origin. This is retained as a branch-control input for `CF-P1-005`; no preview-isolation evidence is claimed by this story.

Official references: [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [routing control](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes), [Workers TypeScript](https://developers.cloudflare.com/workers/languages/typescript/), and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
