# Phase 1 sprint — Cloudflare foundation

Status: Complete; Gate P1 passed with Phase 2 implementation GO and collaboration activation NO-GO

Sprint ID: `CF-P1-S01`

Dates: 2026-07-16 through 2026-07-29 (10 working days, Asia/Ho_Chi_Minh)

Owners: Senior Developer / Technical Lead, Senior QA, Senior BA / Product Owner

Required reviewers: Security Reviewer, Operations, UX Lead for fallback messaging

Delivery status: `CF-P1-001` through `CF-P1-009` are complete.

## 1. Sprint goal

Establish a production-safe, disabled-by-default Cloudflare Pages Functions foundation that is typed, locally executable, testable against a real local D1 runtime, isolated from the static application, and incapable of creating collaboration data or granting collaboration access.

At sprint exit:

- `/api/v1/*` exists only as the approved fail-closed runtime shell;
- disabled requests return the stable `COLLABORATION_UNAVAILABLE` JSON contract with a request ID and `Cache-Control: no-store`;
- no OAuth flow, workspace, membership, document, key, remote D1 data, production secret, or collaboration UI exists;
- GitHub Pages remains Personal Vault/guest-only and never imitates an API;
- the existing static application and all 55+ regression tests remain green;
- Phase 2 receives a reviewed toolchain, configuration source, typed boundary, deterministic seams, and executable evidence harness.

## 2. Sprint authority and non-goals

Gate G4 authorizes this sprint. The sprint does **not** authorize:

- provisioning or binding preview/production D1 databases;
- adding GitHub OAuth applications, callbacks, client IDs, or secrets;
- implementing sessions, CSRF tokens, workspace RBAC, invitations, audit persistence, device keys, encryption, revisions, outbox, or collaboration UI;
- enabling collaboration for any production or preview user;
- changing Personal Vault, Vault V2, GitHub Sync, public sharing, guest, credential, or fallback behavior;
- weakening CSP, security headers, Service Worker bypass, artifact allow-list, or evidence policy;
- placing secrets, Cloudflare account/resource IDs, or dashboard-exported sensitive values in the repository.

Any story that requires one of these outcomes stops and returns to the approved implementation plan instead of expanding sprint scope.

## 3. Current-state constraints

1. The Cloudflare Pages project `docvault-qa-document-hub` deploys automatically from `main` and serves `_site`.
2. The repository currently has no `wrangler.jsonc`, Pages `functions/` runtime, TypeScript Worker bindings, Vitest Workers integration, or D1 migration directory.
3. Adding a Pages Wrangler file makes it the configuration source of truth for supported fields. The team must snapshot and compare the existing Pages configuration before the first deployment containing that file.
4. Pages uses only `production` and `preview` environment overrides. Their configuration semantics differ from ordinary Workers environments.
5. Phase 1 requires a disposable local D1 runtime but does not need a remote D1 resource. The `COLLAB_DB` remote binding begins in Phase 2 after its own gate.
6. Cloudflare's current guidance is to use a current `compatibility_date`, `nodejs_compat`, Wrangler-generated binding types, bindings instead of REST calls, awaited promises, Web Crypto randomness, no mutable request state at module scope, and structured privacy-safe observability.

## 4. Team capacity and working agreement

| Role | Planned focus | Availability assumption |
|---|---|---|
| Senior Developer / Technical Lead | Toolchain, Pages configuration, runtime shell, seams, artifact boundary | 8 focused implementation days |
| Senior QA | Contract matrices, local D1/Vitest harness, privacy/security/regression evidence | 6 focused verification days, overlapping development |
| Senior BA / Product Owner | Scope/no-go enforcement, error/fallback behavior, sprint acceptance | Day 1, midpoint, and exit reviews |
| Security Reviewer | Request/origin/cache/error boundary, test-seam exclusion, privacy canaries | Two focused reviews plus exit sign-off |
| Operations | Wrangler source-of-truth migration, environment isolation, dry-run/deployment evidence | Configuration review and exit rehearsal |
| UX Lead | English fallback/unavailable messaging and accessibility semantics | One focused review |

Working agreement:

- one story has one primary contract outcome and stable requirement/risk references;
- negative and side-effect tests are written with the implementation, not deferred to sprint end;
- a package reaches `main` only after Senior QA passes its relevant baseline and new evidence;
- every promise is awaited/returned/explicitly scheduled; no request state is stored in mutable module globals;
- test adapters are dependency-injected and absent from production artifacts;
- a contract conflict blocks the story and creates a decision-log amendment; code does not choose silently.

## 5. Definition of Ready

A story may start only when:

- requirement, API/quality contract, risk, owner, inputs, and expected side effects are linked;
- acceptance criteria include success, denial, malformed input, privacy, cache, and state inspection where applicable;
- required Cloudflare behavior has been checked against current official documentation and the installed Wrangler schema/types;
- any production-impacting configuration field has a captured before/after value and rollback owner;
- no secret or real remote D1 dependency is needed;
- Senior QA agrees that the evidence can run locally or in an isolated preview.

## 6. Committed backlog

### `CF-P1-001` — Capture and protect the existing Pages configuration

Size: S | Owner: Operations + Technical Lead | Requirements: CF-OPS-002/003/004 | Risks: R17/R18/R19

Tasks:

1. Export an allow-listed snapshot of current project name, production branch, build command, output directory, compatibility settings, environment variable/binding names, and deployment source without secret values.
2. Record which fields are dashboard-controlled today and which will move to `wrangler.jsonc` source control.
3. Define a reviewed rollback procedure for the first deployment containing Wrangler configuration.
4. Add a configuration assertion that prevents project-name/output-directory drift and forbids committed resource IDs/secrets.

Acceptance:

- before/after configuration can be reviewed without exposing secret values;
- `_site` remains the exact Pages output directory and `main` remains production branch;
- the plan contains no D1 database ID, OAuth secret, session secret, or account ID;
- an unexpected binding or configuration deletion blocks deployment;
- evidence: `CF-EV-P1-OPS-001` and `CF-EV-P1-SEC-001`.

### `CF-P1-002` — Pin the Cloudflare toolchain and commands

Size: M | Owner: Technical Lead | Requirements: CF-OPS-002/003, CF-NFR-002 | Risks: R19

Tasks:

1. Add exact compatible versions of Wrangler v4, TypeScript, Vitest, and `@cloudflare/vitest-pool-workers` to `devDependencies` and the lockfile.
2. Add scripts for Wrangler version/config validation, generated types/check, local Pages development, Cloudflare tests, and Pages Functions build/dry-run inspection.
3. Ensure `npm ci` is the only CI install path and no command downloads an unreviewed CLI at runtime.
4. Pin the compatibility date to the implementation date and record a quarterly review owner.

Acceptance:

- clean `npm ci` produces the same lockfile/tool versions;
- Wrangler reports v4.x and resolves from local `node_modules`;
- commands run on Windows locally and Linux CI without shell-specific secret handling;
- no floating `latest`, unpinned GitHub action change, or global Wrangler dependency is required;
- evidence: `CF-EV-P1-STA-001` through `003`.

### `CF-P1-003` — Introduce reviewed Pages Wrangler configuration and generated types

Size: M | Owner: Technical Lead + Operations | Requirements: CF-OPS-002/003, CF-FB-002 | Risks: R17/R18

Tasks:

1. Add `wrangler.jsonc` with schema reference, project name, `pages_build_output_dir: "./_site"`, current compatibility date, and `nodejs_compat`.
2. Define complete local, preview, and production non-secret variable sets for `APP_ENV`, origin policy mode/canonical production origin, and `COLLABORATION_ENABLED=false`.
3. Use only Pages-supported `env.preview` and `env.production` overrides; duplicate all required non-inheritable configuration when one is overridden.
4. Generate binding/runtime types with Wrangler; do not hand-write or double-cast an `Env` type.
5. Keep remote D1 bindings and all secret bindings absent until their approved phases.

Acceptance:

- Wrangler schema/config/type checks pass and generated types are reproducible;
- preview and production environment values cannot be equal where isolation is required;
- production collaboration is statically and operationally disabled;
- Phase 1 accepts only the exact disabled value; missing, malformed, or enabled values still fail closed because no business route exists;
- the config contains no placeholder resource ID that could overwrite a live binding;
- the captured dashboard-to-Wrangler diff is approved before merge;
- evidence: `CF-EV-P1-STA-004`, `CF-EV-P1-OPS-002`, `CF-EV-P1-SEC-002`.

### `CF-P1-004` — Build the disabled `/api/v1` runtime shell

Size: L | Owner: Senior Developer | Requirements: CF-OPS-001/004/005, CF-SES-004 | Risks: R13/R15/R16/R21

Tasks:

1. Add Pages Functions file-based routing only under `/api/v1/*` and restrict invocation with `_routes.json` so static assets do not execute Functions.
2. Implement one request pipeline for request ID, method/media type, bounded body metadata, environment/feature state, error mapping, and response headers.
3. Return the versioned JSON error envelope and stable `503 COLLABORATION_UNAVAILABLE` while the feature is disabled.
4. Return sanitized `404/405/415/413/400` responses where request validation fails before feature handling, following the API contract's evaluation order.
5. Prohibit `passThroughOnException`, HTML fallbacks, stack/SQL/body echoes, floating promises, and mutable request-scoped module globals.

Acceptance:

- every `/api/v1/*` response is JSON, has a request ID, `Cache-Control: no-store`, `nosniff`, and the approved security headers;
- disabled calls perform zero D1/OAuth/storage/audit/background side effects;
- API requests never return `index.html`, static fallback, or an uncaught exception page;
- unknown route/method/media/size/error matrices have stable status/code/message shapes;
- request IDs use Web Crypto and never `Math.random()`;
- evidence: `CF-EV-P1-UT-001`, `CF-EV-P1-API-001` through `006`, `CF-EV-P1-SEC-003`.

### `CF-P1-005` — Enforce same-origin, cache, and Service Worker isolation

Size: M | Owner: Senior Developer + Security Reviewer | Requirements: CF-SES-003, CF-OPS-001/002, CF-FB-001/002 | Risks: R01/R13/R15/R17

Tasks:

1. Implement exact same-origin validation for mutation-shaped requests without wildcard/reflected credentialed CORS.
2. Treat production canonical origin and dynamic Pages preview origin under explicit environment policy; compare exact URL origins, not suffixes or substring matches.
3. Keep unauthenticated disabled shell behavior non-enumerating and ensure all private/error responses are non-cacheable.
4. Extend Service Worker and build tests to prove `/api/*` bypass occurs before cache/navigation fallback.
5. Prove GitHub Pages neither renders collaboration controls nor loops API retries.

Acceptance:

- missing, `null`, foreign, scheme-changed, port-changed, suffix-confusion, and preview/production crossover origins fail before any side effect;
- exact same-origin disabled requests reach only the stable unavailable response;
- API responses cannot be written to or served from Cache Storage;
- GitHub Pages guest/personal flows remain healthy and make zero collaboration network calls;
- evidence: `CF-EV-P1-API-007`, `CF-EV-P1-SEC-004/005`, `CF-EV-P1-E2E-001`.

### `CF-P1-006` — Add deterministic seams without production bypasses

Size: M | Owner: Senior Developer + Senior QA | Requirements: CF-OPS-005, CF-ID/SES future testability | Risks: R01/R02/R16/R19

Tasks:

1. Define dependency-injected interfaces for clock, UUID, random bytes/token, OAuth adapter, and failure injection.
2. Use real Web Crypto/platform implementations by default; test implementations exist only in test modules.
3. Add production artifact/import-graph checks that reject test adapters, fixed tokens, mock OAuth, fault flags, or test-only environment branches.
4. Prohibit `any`, unsafe double casts, direct secret comparisons, and global mutable request state at the boundary.

Acceptance:

- deterministic tests control time/IDs/failures without environment-variable backdoors;
- production code cannot select a mock adapter from a request, cookie, query, header, or deployed variable;
- artifact scan and import graph contain no test implementation or sensitive fixture;
- evidence: `CF-EV-P1-UT-002/003`, `CF-EV-P1-STA-005`, `CF-EV-P1-SEC-006`.

### `CF-P1-007` — Establish Workers Vitest and disposable local D1 harness

Size: L | Owner: Senior QA + Senior Developer | Requirements: CF-OPS-002/003, all future integration coverage | Risks: R05/R06/R17/R18

Tasks:

1. Configure the current Cloudflare Vitest integration against the reviewed Wrangler configuration.
2. Inject a **test-only local** D1 binding named `COLLAB_DB`; do not add a preview/production D1 resource ID.
3. Add a minimal test-only migration/fixture proving actual D1 prepare/bind/first/batch behavior and per-test isolation; it is not the Phase 2 collaboration schema.
4. Add helpers for API requests, origin/session variants, D1 side-effect snapshots, log/privacy canaries, deterministic time/IDs, and failure injection.
5. Ensure repeated, parallel, and failed tests do not share state or contact a remote database.

Acceptance:

- tests use Cloudflare's Worker runtime and a real disposable local D1 implementation, not an in-memory hand mock;
- zero network request reaches a remote D1/Cloudflare API during local/CI tests;
- each test begins from a deterministic schema/data state and can inspect zero/expected side effects;
- migrations can be read/applied by the official helper and failure is reported as a failed gate;
- evidence: `CF-EV-P1-INT-001` through `005`, `CF-EV-P1-SEC-007`.

### `CF-P1-008` — Protect build, CI, fallback, and deployment boundaries

Size: M | Owner: Senior Developer + Senior QA + Operations | Requirements: CF-ID-004, CF-ISO-005, CF-FB-001/002, CF-OPS-001–004, CF-NFR-002 | Risks: R15/R17/R18/R19/R22

Tasks:

1. Update quality/build checks so server source, Wrangler state, test fixtures/adapters, local D1 files, configuration secrets, and evidence artifacts cannot enter `_site`.
2. Add Cloudflare unit/integration/config/type checks to CI before browser regression/deployment.
3. Build the Pages Functions artifact for inspection and confirm only `/api/v1/*` invokes it.
4. Verify the main-branch deployment keeps `COLLABORATION_ENABLED=false`; rehearse non-destructive disablement and rollback to the previous compatible commit.
5. Smoke-test Cloudflare Pages and GitHub Pages after deployment.

Acceptance:

- existing `npm run check`, `npm run build:pages`, and `npm run test:e2e` pass unchanged;
- new Cloudflare checks block deployment on config/type/API/D1/isolation failure;
- personal/guest startup direct-asset budget does not regress and no collaboration module is eagerly loaded;
- Cloudflare Pages disabled API smoke passes; GitHub Pages API URL is absent/not functional and personal guest smoke passes;
- evidence: `CF-EV-P1-STA-006/007`, `CF-EV-P1-E2E-002`, `CF-EV-P1-OPS-003/004`.

### `CF-P1-009` — Assemble the Phase 1 gate evidence and handoff

Size: S | Owner: Senior QA + Product Owner | Requirements: all Phase 1 obligations | Risks: R01–R22 as applicable

Tasks:

1. Produce the Phase 1 evidence manifest, traceability delta, configuration diff, dependency inventory, deployment IDs, and known-issue/risk review.
2. Verify zero P0/P1 skip, quarantine, disabled case, accepted flakiness, secret/privacy canary, or unexpected side effect.
3. Review the final disabled behavior with Product, Security, Operations, UX, and Technical Lead.
4. Publish the Phase 1 exit report and explicit Phase 2 `GO/NO-GO` recommendation.

Acceptance:

- every committed story has passing evidence IDs and reviewers;
- all existing and new checks pass from a clean clone/install;
- no open P0/P1 defect or unowned/expired Critical/High risk exists;
- production collaboration remains disabled and contains no user/workspace data;
- evidence: `CF-EV-P1-OPS-005` and Phase 1 exit report.

## 7. Story dependency order

```text
P1-001 configuration capture
  -> P1-002 pinned toolchain
  -> P1-003 Wrangler source of truth + generated types
      -> P1-004 disabled API shell
          -> P1-005 origin/cache/SW isolation
          -> P1-006 deterministic seams
              -> P1-007 local D1 integration harness
                  -> P1-008 CI/artifact/deployment protection
                      -> P1-009 evidence and exit review
```

P1-005 and P1-006 may run in parallel after the API boundary is stable. P1-007 may prepare test infrastructure after P1-003, but it cannot finalize helpers until the P1-004/006 contracts exist.

## 8. Day 1–10 execution plan

| Day | Primary outcome | Review/evidence |
|---:|---|---|
| 1 | Kickoff, source-of-truth inventory, dashboard/config snapshot, threat/no-go review | Product + Ops + Security scope lock |
| 2 | Pinned Cloudflare toolchain, scripts, initial Wrangler config | Lockfile/config/schema review |
| 3 | Generated types and `/api/v1` request/error shell | Unit and artifact checks |
| 4 | Disabled response, bounded validation, request IDs, no-store/security headers | API matrix review |
| 5 | Exact-origin, Service Worker/cache, GitHub Pages isolation | Mid-sprint Gate M1: P1-001–005 evidence |
| 6 | Deterministic clock/ID/random/OAuth/failure seams and production exclusion | Security code/import review |
| 7 | Workers Vitest plus disposable local D1 and side-effect helpers | Integration/isolation evidence |
| 8 | CI gates, Pages Functions build inspection, `_site`/bundle/fallback protection | QA full local regression |
| 9 | Disabled preview/production-safe deployment rehearsal, rollback, both-origin smoke | Ops/Security deployment review |
| 10 | Full clean-run evidence, defect/risk closure, Phase 1 exit report | Gate P1 and Phase 2 recommendation |

## 9. Sprint test matrix

Required test families:

- JSON envelope/request ID stability for disabled, unknown route, method, media type, malformed body, oversized body, hostile Origin, and internal failure;
- exact origin cases across local, Pages preview, production, cross-environment, `null`, scheme, port, suffix, casing/normalization, and missing header;
- `no-store`, `nosniff`, CSP/security headers, no HTML response, no Service Worker/cache fallback;
- zero D1, OAuth, audit, storage, queue/background, and log-sensitive side effects for every disabled/denied request;
- real local D1 prepare/bind/first/batch/migration, isolation, parallel/retry, and fault behavior;
- production artifact absence of server source, secrets, test adapters, local D1 state, and collaboration eager loading;
- Cloudflare Pages disabled API smoke and GitHub Pages personal/guest/no-collaboration smoke;
- existing 55+ Node regression suite, production build, and browser E2E suite.

## 10. Definition of Done

A story is Done only when:

1. code/config/tests and English documentation satisfy its acceptance criteria;
2. stable requirement/risk/evidence IDs are linked;
3. unit/integration/API/browser/security checks applicable to the story pass;
4. D1, log, cache, storage, network, and artifact side effects are inspected;
5. Senior QA signs the evidence with zero unexplained skip/retry/flakiness;
6. Security/Operations/Product/UX reviewers sign where assigned;
7. `git diff --check`, clean `npm ci`, `npm run check`, production artifact build, and browser E2E pass;
8. the feature remains disabled and rollback is known;
9. the change is committed and pushed only after QA passes;
10. Cloudflare Pages and GitHub Pages deployment/smoke results are recorded when `main` changes.

## 11. Sprint risks and controls

| Sprint risk | Control | Stop condition |
|---|---|---|
| Wrangler file overwrites dashboard configuration | Snapshot/diff, schema validation, reviewed source-of-truth migration, rollback owner | Any unexplained deletion/change to build, binding, variable, branch, or compatibility field |
| Runtime shell accidentally enables collaboration | Two independent server/client false defaults, no enabling secret/var, API contract tests | Any route reaches business logic or returns success while disabled |
| Local test contacts remote D1 | Test-only local binding, network deny/assertion, no remote ID | Any remote resource access or real data mutation |
| API enters Service Worker/static fallback | `_routes.json`, SW early bypass, cache/no-store tests | HTML/app shell/cache response for `/api/*` |
| Test seam ships to production | Dependency injection, import graph/artifact scan, no request/env selector | Mock/fixed/fault adapter reachable in production artifact |
| Toolchain/config drift | Exact lockfile versions, generated types check, Wrangler schema check | Clean install changes types/config output |
| Existing product regression | Mandatory full baseline and both-origin smoke | Any Personal/guest/Vault/sync/share/offline/security regression |
| P0/P1 failure hidden by retry | Zero-skip/flaky policy and root-cause requirement | Unexplained retry, quarantine, conditional skip, or missing required environment |

## 12. Sprint ceremonies and gates

- Daily: 15-minute Dev/QA/BA risk and blocker review; update evidence/decision IDs, not percentage-only status.
- Day 3 design review: Technical Lead + Security approve request pipeline and Wrangler/config boundary.
- Day 5 Midpoint Gate M1: Product/Ops/QA confirm scope, configuration safety, disabled API, and fallback isolation.
- Day 8 test readiness review: Senior QA confirms clean execution path and evidence completeness.
- Day 9 deployment rehearsal: Operations + Security approve disabled behavior and rollback evidence.
- Day 10 Phase 1 Gate: all reviewers issue `PASS`, `CONDITIONAL NO-GO`, or `NO-GO`; only `PASS` permits Phase 2 planning/execution.

## 13. Sprint success metrics

- 100% committed story acceptance and evidence coverage;
- 0 P0/P1 skips, quarantines, accepted flaky tests, secrets, privacy-canary hits, or unexpected side effects;
- 0 remote D1/OAuth/session/workspace/document/key records created;
- 100% `/api/v1/*` disabled/error responses JSON and `no-store`;
- 0 `/api/*` Service Worker/cache/static HTML responses;
- 0 regression failures across current Node/browser suites;
- 0 collaboration JavaScript added to Personal/guest startup path;
- both production origins remain healthy, with collaboration production activation still disabled.

## 14. Sprint approval checklist

- [ ] Product Owner approves the sprint goal, committed backlog, non-goals, dates, and success metrics.
- [ ] Technical Lead approves story order, Cloudflare configuration migration, interfaces, and estimates.
- [ ] Security Reviewer approves origin/cache/error/seam controls and stop conditions.
- [ ] Operations approves source-of-truth snapshot/diff, disabled deployment, and rollback plan.
- [ ] Senior QA approves test matrix, evidence IDs, Definition of Done, and zero-skip P0/P1 policy.
- [ ] UX Lead approves the English unavailable/fallback behavior and accessibility evidence.
- [x] Sprint execution completed and Gate P1 passed; Phase 2 planning is proposed separately and production collaboration remains `NO-GO`.

Final squad status: **Gate P1 passed on 2026-07-16. Phase 2 foundation planning may proceed; production collaboration remains disabled.**

## 15. Current Cloudflare references

- [Pages Functions Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)
- [Workers Vitest integration](https://developers.cloudflare.com/workers/testing/vitest-integration/)
- [Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/)
- [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/)
