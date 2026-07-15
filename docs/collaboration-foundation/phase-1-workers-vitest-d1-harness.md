# Phase 1 Workers Vitest and disposable D1 harness

Status: `CF-P1-007` implemented, deployed, and verified

Date: 2026-07-15

Owners: Senior QA and Senior Developer

Reviewers: Technical Lead, Security Reviewer, and Operations

## Scope

This story establishes the Workers-runtime integration-test boundary for later collaboration work. It does not add the Phase 2 collaboration schema, a remote D1 database, production or preview resource identifiers, OAuth, sessions, collaboration behavior, or a feature-enabling path.

## Runtime and binding boundary

- [`vitest.config.mts`](../../vitest.config.mts) uses the current Vitest 4 `cloudflareTest()` plugin and reads the reviewed [`wrangler.jsonc`](../../wrangler.jsonc).
- `COLLAB_DB` is injected only through Miniflare `d1Databases`; the production Wrangler configuration contains no D1 binding or resource ID.
- `remoteBindings` and D1 persistence are explicitly disabled. Every global outbound `fetch()` is intercepted by a local responder returning `599 OUTBOUND_NETWORK_BLOCKED`.
- [`0001_test_harness.sql`](../../tests/cloudflare/migrations/0001_test_harness.sql) is test-scoped and creates only `harness_records`. It is not a collaboration migration.
- `readD1Migrations()` loads migrations in Node configuration and `applyD1Migrations()` applies them inside the Workers runtime. A malformed migration is asserted to reject and roll back.

## Deterministic test boundary

[`tests/cloudflare/helpers/harness.ts`](../../tests/cloudflare/helpers/harness.ts) provides:

- deterministic schema reset and fixture installation;
- D1 side-effect snapshots with ordered records and counts;
- API request builders covering origin and session variants;
- privacy-canary and console capture helpers;
- reuse of the test-only clock, ID, random, OAuth, and failure adapters from `CF-P1-006`.

The shared runtime helper now uses platform `btoa()` rather than Node `Buffer`, so the same test-only adapter executes in workerd and Node without adding compatibility code to production.

## Isolation and behavior evidence

- Four Workers Vitest files and ten tests run in workerd against disposable local D1.
- D1 `prepare`, `bind`, `run`, `first`, `all`, and `batch` execute against the actual local D1 implementation.
- Each test resets to one deterministic baseline row. Two parallel files insert the same primary key with different values and each observes only its own database state.
- The complete Workers suite passes twice consecutively with no retry, skip, persistence, shared state, or remote resource access.
- Disabled, hostile-origin, and injected-failure API paths retain zero D1 changes; failure output is sanitized and the privacy canary never appears in captured logs.
- The Node policy suite rejects any production D1 binding, remote resource identifier, remote binding enablement, persistence, missing network interception, or test migration outside the test tree.

## Local verification

- Workers type gate and integration suite: 4 files, 10 passed, zero failed/skipped/retried; repeated twice.
- Node policy/regression suite: 93 passed, zero failed/skipped/retried.
- Clean `npm ci`: 161 packages; `npm audit`: zero vulnerabilities.
- Full quality/type/config gates: pass; Node regression 93/93 and Workers integration 10/10.
- Wrangler Functions build and Pages production dry-run: pass; three production runtime modules and zero test adapters/selectors.
- Static Pages artifact: 49 runtime files, 1,887,978 bytes; browser regression: pass across dashboard, category renderers, release hover, focus, mobile, and semantics.

## Retained deployment result

- Implementation commit: `dfaaa95224a25806487af7c0bbebc13ad4b775b5`.
- GitHub Actions run `29434622486`: success, including locked install, Cloudflare policy/type gates, production quality/build, browser regression, and GitHub Pages deployment.
- Cloudflare production deployment `225a0e5c-b9a8-445f-a137-68d16be918e8`: success from the implementation commit; `COLLABORATION_ENABLED=false`, production origin policy retained, and no D1 binding or resource ID added.
- Canonical and immutable Cloudflare guest pages returned HTTP 200. The canonical API returned JSON `503 COLLABORATION_UNAVAILABLE`, `Cache-Control: no-store, private`, and a Web Crypto request ID.
- GitHub Pages guest fallback returned HTTP 200; its API-shaped root URL returned static HTTP 404 and did not imitate the collaboration API.

## Traceability

- Requirements: `CF-OPS-002`, `CF-OPS-003`, future integration coverage.
- Risks: `R05`, `R06`, `R17`, `R18`.
- Evidence: `CF-EV-P1-INT-001` through `CF-EV-P1-INT-005`, `CF-EV-P1-SEC-007`.

Official references: [Workers Vitest configuration](https://developers.cloudflare.com/workers/testing/vitest-integration/configuration/), [Workers test APIs](https://developers.cloudflare.com/workers/testing/vitest-integration/test-apis/), and [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/).
