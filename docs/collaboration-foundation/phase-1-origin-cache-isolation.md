# Phase 1 origin, cache, and Service Worker isolation

Status: `CF-P1-005` implemented, deployed, and verified

Date: 2026-07-15

Owners: Senior Developer and Security Reviewer

Reviewers: Senior QA and Operations

## Scope

This story enforces the approved same-origin and cache boundary around the disabled `/api/v1` shell. It does not add a session, CSRF token, OAuth exchange, D1 binding, collaboration UI, business dispatch, or an enabling feature state. Collaboration remains the exact disabled string in every environment.

## Origin policy

- Production accepts only the canonical URL origin `https://docvault-qa-document-hub.pages.dev`.
- Preview accepts one structurally valid Pages preview label before the canonical hostname, then requires the supplied `Origin` to equal that complete request origin.
- Local development accepts only `localhost`, `127.0.0.1`, or `[::1]` and still requires exact request/header origin agreement for mutations.
- The environment name and origin policy mode must agree. Production/preview crossover fails closed.
- Mutation-shaped requests require an `Origin` header. Missing, `null`, foreign, scheme-changed, non-default-port, suffix-confusion, path-confusion, and environment-crossover inputs return `403 CSRF_REJECTED` before the body is read.
- URL-origin normalization accepts equivalent scheme/host casing and the default HTTPS port. No wildcard, reflected origin, credentialed CORS, or `Access-Control-Allow-Origin` header is emitted.

Every API response, including validation and unexpected errors, retains JSON, a server-generated request ID, `Cache-Control: no-store, private`, `Pragma: no-cache`, `Expires: 0`, and the approved security headers.

## Browser and cache boundary

Service Worker `v45` returns immediately for same-origin `/api` and `/api/*` before `respondWith`, network-first handling, Cache Storage read/write, or navigation fallback. The browser therefore owns the direct network request and an API URL cannot receive cached application HTML. Similar non-API paths such as `/apiary` retain normal app-shell behavior.

The browser regression records all requests across Dashboard, editor, release, Focus, category, and mobile guest/personal flows. It requires zero `/api` requests and zero collaboration controls. The same static artifact remains suitable for the GitHub Pages fallback.

## Pages branch control

Cloudflare preview branch control changed from `all` with no exclusion to `custom`, include `*`, exclude `gh-pages`. Production branch `main`, production auto-deploy, repository, build command, and output directory were unchanged. This prevents the generated GitHub Pages artifact branch from starting an invalid Cloudflare preview build while retaining previews for source branches.

The reviewed expected state is stored in [`config/cloudflare/pages-branch-control.json`](../../config/cloudflare/pages-branch-control.json). Operations rollback is to restore preview deployment setting `all`, include `*`, and an empty exclusion list through the Pages project API or dashboard. No secret, account ID, repository ID, or resource binding is stored.

## Local verification

- clean `npm ci`: 161 packages; `npm audit`: zero vulnerabilities;
- Cloudflare toolchain/config/generated-type checks: pass;
- TypeScript and quality gates: pass;
- full Node regression: 83 passed, zero failed/skipped/retried;
- Wrangler Functions build and Pages production dry-run: pass;
- production artifact: 49 runtime files, 1,887,978 bytes;
- Playwright browser regression: pass with zero collaboration API requests or controls;
- local workerd: exact local mutation `503 COLLABORATION_UNAVAILABLE`; missing and foreign origins `403 CSRF_REJECTED`; safe GET `503`; all JSON and no-store.

## Retained deployment result

- Implementation commit: `51e9e324c0d0538817f2570267fd3e530fb7108f`.
- GitHub Actions run: `29432147843`, success with all release gates and GitHub Pages deployment.
- Cloudflare production deployment: `5e605899-a046-4e1a-924e-7134a0651a6a`, success from `main` at the implementation commit.
- Canonical exact-origin mutation returned `503 COLLABORATION_UNAVAILABLE`; missing, `null`, foreign, scheme-changed, port-changed, suffix-confusion, preview-origin, and crossover variants returned `403 CSRF_REJECTED` with JSON and no-store headers.
- A probe issued during edge propagation was discarded. After the deployment reached success, the complete hostile-origin matrix was repeated against the canonical origin and passed.
- A seeded Cache Storage API imitation was not served: browser `fetch('/api/v1/session')` returned the live `503` JSON. Unit instrumentation recorded zero Service Worker fetch/cache read/cache write calls for `/api/*`.
- Fresh Playwright contexts loaded and reloaded both production guest origins with zero `/api` requests and zero collaboration controls.
- The generated `gh-pages` commit produced skipped deployment record `2c5befbe-ef0c-4053-90f8-ce7e5380e1a9`: queued, clone, build, and deploy stages all remained `idle`. No invalid preview build ran.
- Cloudflare Pages and GitHub Pages static guest origins returned HTTP 200; the GitHub Pages API path returned static 404 and never imitated the collaboration API.

## Traceability

- Requirements: `CF-SES-003`, `CF-OPS-001/002`, `CF-FB-001/002`.
- Risks: `R01`, `R13`, `R15`, `R17`; threats: `T01`, `T14`, `T16`, `T21`.
- Evidence: `CF-EV-P1-API-007`, `CF-EV-P1-SEC-004`, `CF-EV-P1-SEC-005`, `CF-EV-P1-E2E-001`.

Official references: [Pages branch deployment controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/), [Pages Functions routing](https://developers.cloudflare.com/pages/functions/routing/), [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/), and [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/).
