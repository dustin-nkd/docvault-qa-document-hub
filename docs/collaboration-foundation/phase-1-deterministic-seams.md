# Phase 1 deterministic runtime seams

Status: `CF-P1-006` implemented, deployed, and verified

Date: 2026-07-15

Owners: Senior Developer and Senior QA

Reviewers: Technical Lead and Security Reviewer

## Scope

This story introduces explicit dependencies for authoritative time, UUIDs, random bytes/tokens, GitHub OAuth exchange/identity lookup, and named failure checkpoints. It does not implement OAuth, sessions, D1, collaboration business behavior, remote bindings, production secrets, or a feature-enabling path.

## Production boundary

- [`runtime-dependencies.mjs`](../../functions/_lib/runtime-dependencies.mjs) defines the JSDoc contracts and one frozen `PLATFORM_DEPENDENCIES` object.
- Production clock uses `Date.now()`. UUIDs use `crypto.randomUUID()`. Random bytes use bounded `crypto.getRandomValues()` and tokens are base64url encoded.
- OAuth methods are deliberately unavailable until the approved OAuth story supplies configured production bindings and an adapter. They perform no network request and fail closed with `PlatformCapabilityUnavailableError`.
- The production failure checkpoint is an awaited no-op. It has no environment flag, deployed variable, request, query, cookie, header, or URL selector.
- [`functions/api/v1/[[path]].ts`](../../functions/api/v1/[[path]].ts) imports `PLATFORM_DEPENDENCIES` directly and passes it as the third request-handler argument. There is no default/test implementation in the production request path.
- The disabled API shell consumes the injected UUID and an awaited checkpoint; an injected failure maps to sanitized `500 INTERNAL_ERROR` with a deterministic request ID.

## Test boundary

The deterministic implementation exists only at [`tests/helpers/runtime-dependencies.mjs`](../../tests/helpers/runtime-dependencies.mjs). Tests can control time, sequential UUIDs, random bytes/tokens, OAuth responses/call inspection, and named failures without changing a Worker variable or request. The helper is not imported by any production module.

## Production exclusion gates

[`cloudflare-production-policy.mjs`](../../scripts/cloudflare-production-policy.mjs) walks the production import graph from the Pages Function entrypoint and rejects:

- imports outside `functions/`, test/spec/fixture/mock paths, and missing modules;
- request-selectable test/mock/fixed-token/fault markers;
- explicit `any`, unsafe double casts, TypeScript suppressions, direct secret comparisons, and module-level mutable `let`/`var` state;
- handler wiring other than the direct `PLATFORM_DEPENDENCIES` injection;
- compiled Wrangler metafile inputs from tests and deterministic fixture markers in the Worker bundle.

Both `cf:functions:build` and `cf:pages:dry-run` validate the source graph and compiled artifact after Wrangler succeeds. The production graph contains exactly three reviewed modules: the route, API shell, and platform dependencies. Static `_site` still excludes all `functions/`, `tests/`, scripts, config, and Worker types.

## Local verification

- clean `npm ci`: 161 packages; `npm audit`: zero vulnerabilities;
- focused deterministic/security suite: 18 passed;
- full Node regression: 90 passed, zero failed/skipped/retried;
- strict TypeScript, Wrangler config/generated types, and quality gates: pass;
- Wrangler Functions build and Pages production dry-run: pass; three production modules and zero test adapters/selectors;
- production static artifact: 49 runtime files, 1,887,978 bytes;
- Playwright browser regression: pass.

## Retained deployment result

- Implementation commit: `02c14b65d3f240a03f55f4996cd88b3db9f5e1c4`.
- GitHub Actions run: `29433322178`, success with all release gates and GitHub Pages deployment.
- Cloudflare production deployment: `a4bd3726-6214-46b8-ae0a-f4338784468d`, success from `main` at the implementation commit.
- Canonical API returned `503 COLLABORATION_UNAVAILABLE`, JSON/no-store headers, and a Web Crypto request ID. GitHub Pages guest fallback returned HTTP 200.
- Two production requests carrying hostile `TEST_MODE`/`failure` query values, `X-Test-Mode`, and `TEST_MODE`/`MOCK_OAUTH` cookies both remained unavailable and received different UUIDv4 request IDs. Request state could not select a deterministic adapter or failure.
- Local Wrangler compiled-artifact inspection retained exactly three production modules and found zero test imports, deterministic fixtures, selector markers, remote bindings, or secrets.

## Traceability

- Requirements: `CF-OPS-005`, future `CF-ID`/`CF-SES` testability contracts.
- Risks: `R01`, `R02`, `R16`, `R19`; threats: `T01`, `T02`, `T16`, `T19`, `T23`.
- Evidence: `CF-EV-P1-UT-002`, `CF-EV-P1-UT-003`, `CF-EV-P1-STA-005`, `CF-EV-P1-SEC-006`.

Official references: [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) and [Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/).
