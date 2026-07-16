# Phase 3 sprint — Identity and sessions

Status: **ACTIVE — `CF-P3-007` PASS; awaiting Product Owner approval at Gate P3-G3A**

Sprint ID: `CF-P3-S01`

Planned dates: 2026-07-17 through 2026-08-06 (15 working days, Asia/Ho_Chi_Minh)

Owners: Technical Lead / Senior Developer, Senior QA, Product Owner

Required reviewers: Security Reviewer, Operations, Privacy Reviewer; UX Lead at exit

## 1. Sprint decision and authorization boundary

Phase 2 is complete and its exit recommendation authorizes planning for identity and sessions. Phase 3 will implement a GitHub OAuth identity boundary, opaque server-side sessions, CSRF protection, and the four approved authentication routes. It will not activate collaboration.

Approval of Gate P3-G0 authorizes **`CF-P3-001` only**. It does not authorize remote changes, provider credentials, preview activation, production identity, collaboration UI, or business APIs. Each later story requires the preceding gate.

The following remain prohibited throughout Phase 3:

- a production D1 binding or production OAuth/session secret;
- identity or collaboration on GitHub Pages;
- workspace, membership, invitation, device, key, document, revision, or audit HTTP APIs;
- collaboration UI, automatic Personal Vault upload, or real customer data;
- persisted GitHub access tokens, raw session tokens in D1, token-bearing logs, or deploy-time test bypasses;
- sharing preview credentials, cookies, D1 identifiers, callback URLs, or provider applications with production.

Preview provisioning is a separate external-state operation at Gate P3-G4. Until that gate is approved, every deployed origin remains identity-disabled and the current collaboration `503` boundary remains authoritative.

## 2. Sprint goal and exit state

Deliver a secure, observable, revocable identity/session foundation in an isolated preview environment, while production and the static fallback remain fail-closed.

At Gate P3:

- GitHub Authorization Code with PKCE S256 uses single-use, ten-minute server-side transactions;
- stable identity is the provider plus GitHub's numeric user ID, never login or email;
- the callback consumes state and creates or rotates a session atomically;
- only an opaque session token reaches the browser; D1 stores its HMAC-SHA-256 digest;
- session idle, absolute, recent-authentication, rotation, logout, and revocation rules pass deterministic tests;
- exact-Origin and session-bound synchronizer CSRF checks protect every state-changing identity route;
- abuse, provider failure, privacy-safe logs, and secret-rotation behavior have evidence;
- a dedicated preview OAuth app and cookie namespace serve designated synthetic identities only;
- production has no D1, OAuth secrets, identity runtime, collaboration UI, or business routes;
- GitHub Pages remains a static personal/guest fallback;
- Phase 4 receives reviewed identity/session interfaces, not authority to activate RBAC or collaboration.

## 3. Controlling contracts

Implementation must conform to:

- [`ADR-002`](adr/002-authentication-and-sessions.md): OAuth, numeric identity, session, cookie, expiry, rotation, CSRF, and environment rules;
- [`api-contract.md`](api-contract.md): the four Phase 3 endpoints, payloads, errors, cache policy, and rate tiers;
- [`schema-contract.md`](schema-contract.md): `users`, `oauth_transactions`, and `sessions` schema version 9 boundary;
- [`quality-strategy.md`](quality-strategy.md): deterministic adapters, real local D1, preview E2E, and performance budgets;
- [`operational-runbook.md`](operational-runbook.md): binding, secret, deployment, incident, and rotation controls;
- [`threat-model.md`](threat-model.md), [`risk-register.md`](risk-register.md), and [`traceability-matrix.md`](traceability-matrix.md): threats T01–T03 and identity/session risks;
- Phase 2 exit: preview schema 9 with zero entity rows; production has no collaboration D1.

Any required semantic schema change is forward-only, separately reviewed, and blocked until Product, Security, Architecture, Operations, Privacy, and QA approve it. No applied migration may be edited.

## 4. Frozen implementation decisions

### 4.1 OAuth transaction

1. The browser requests `POST /api/v1/oauth/github/transactions` with `purpose` and an optional safe relative `returnPath` of at most 512 characters.
2. The server generates at least 256 bits of random state and a PKCE verifier, stores only a domain-separated state digest, and returns the provider authorization URL.
3. The existing `pkce_verifier_envelope` stores a versioned AEAD payload containing the verifier, purpose, validated return path, and—only for reauthentication—the initiating session/user binding. This avoids an unreviewed schema change.
4. `callback_origin` and `callback_path` remain the exact environment callback, not an arbitrary post-login redirect.
5. Callback state is looked up by digest, must be pending and unexpired, and is consumed exactly once by compare-and-set.
6. Provider code exchange and `/user` retrieval run through one reviewed adapter. The GitHub token exists only in request memory and is discarded after identity normalization.
7. One D1 batch consumes the transaction, upserts the provider/numeric-subject user, revokes a predecessor when required, and inserts the new session. A failed guard or statement creates no authority.
8. Reauthentication requires a live session plus CSRF at transaction creation; callback identity must equal the initiating numeric subject and rotates the session.

### 4.2 Session and CSRF

- Generate an opaque high-entropy session token. Put the raw value only in a host-only `Secure; HttpOnly; SameSite=Lax; Path=/` cookie with no `Domain` attribute.
- Store only a domain-separated HMAC-SHA-256 digest using `SESSION_TOKEN_PEPPER`.
- Preview cookie: `__Host-docvault-preview-session`. Reserved future production cookie: `__Host-docvault-session`.
- Enforce 12-hour idle expiry, 7-day absolute expiry, and recent authentication no older than 15 minutes for future high-risk operations.
- Rotate on login, reauthentication, fixation risk, and security-relevant changes; revoke the predecessor before returning the successor.
- Logout revokes server-side first, then expires the browser cookie. Reuse of a revoked, expired, rotated, malformed, or environment-mismatched token fails identically.
- Derive the synchronizer CSRF token from the live session using a dedicated `CSRF_TOKEN_KEY`, domain separation, and constant-time comparison. It is not stored in D1 and rotates with the session.
- Every state-changing route requires exact approved `Origin` and the synchronizer token. SameSite is defense in depth, not the CSRF decision.

`CSRF_TOKEN_KEY` is an implementation detail to be added to the runbook only after P3-G1 approves the design. It must be independent from OAuth and session keys.

### 4.3 Rate limiting and provider resilience

`CF-P3-001` must confirm the currently supported Pages/Wrangler configuration before implementation. The preferred production-shaped control is Cloudflare's GA Rate Limiting binding, with a deterministic local adapter. If the selected Pages path cannot use that binding, the team must return to a gate; it may not silently create a D1 limiter table or weaker process-local limiter.

Contract tiers are:

- OAuth transaction creation and callback: 20 attempts per source IP per ten minutes;
- default authenticated identity endpoints: 120 per user per minute and 300 per source IP per minute;
- generic non-enumerating responses, bounded provider timeouts, limited retry with jitter, and fail-closed provider outage behavior.

Cloudflare platform assumptions are rechecked at story execution against the official [Pages bindings documentation](https://developers.cloudflare.com/pages/functions/bindings/) and [Workers Rate Limiting documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## 5. Environment and resource topology

| Environment | Maximum Phase 3 state | Identity behavior | Data rule |
|---|---|---|---|
| Local test | Disposable schema-9 D1; injected OAuth and limiter adapters | Full deterministic identity/session flow | Synthetic fixtures; no provider network |
| Local development | Optional disposable local D1 | Disabled unless explicitly started in local mode | Never committed; reset documented |
| Pages preview before P3-G4 | Existing preview D1, no identity secrets | Disabled | Zero identity/session rows |
| Pages preview after P3-G4 | Dedicated GitHub OAuth app, secret set, cookie namespace, stable branch alias | Preview-only, designated synthetic identities | No workspace/document/customer data; cleanup required |
| Production | No D1 and no OAuth/session secret | Disabled, current `503` boundary | No collaboration data |
| GitHub Pages | Static fallback | No identity/API | Personal/guest browser storage only |

Stable preview callback proposed for provider registration:

`https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev/api/v1/oauth/github/callback`

The callback is frozen at P3-G1 and verified before provider provisioning. A mutable deployment URL is never registered as the OAuth callback.

### 5.1 Binding and secret inventory

| Name | Classification | Local | Preview after G4 | Production in Phase 3 |
|---|---|---:|---:|---:|
| `COLLAB_DB` | D1 binding | disposable | existing isolated preview | absent |
| `APP_ENV` | non-secret variable | `local` | `preview` | `production` |
| `IDENTITY_RUNTIME_MODE` | non-secret variable | `local`/`disabled` | `preview-only` | `disabled` |
| `COLLABORATION_ENABLED` | non-secret variable | `false` | `false` | `false` |
| `GITHUB_OAUTH_CLIENT_ID` | provider identifier | test fixture | dedicated preview value | absent |
| `GITHUB_OAUTH_CLIENT_SECRET` | secret | deterministic test seam | dedicated preview secret | absent |
| `SESSION_TOKEN_PEPPER` | secret | deterministic test seam | dedicated preview secret | absent |
| `OAUTH_TRANSACTION_KEY` | secret | deterministic test seam | dedicated preview secret | absent |
| `CSRF_TOKEN_KEY` | secret | deterministic test seam | dedicated preview secret | absent |

Identity enables only when all reviewed preview conditions match. Missing, partial, duplicated, production, or unexpected bindings fail startup/dispatch closed without revealing which value is absent.

## 6. Story backlog

### `CF-P3-001` — Freeze identity/session contract and platform decisions

Size: M | Owner: Technical Lead + Senior QA | Reviewers: Product, Security, Operations, Privacy

Tasks:

1. Reconcile ADR, API, schema, crypto, runbook, threat, risk, and Phase 2 handoff contracts.
2. Freeze transaction-envelope versioning, key separation, safe-return-path grammar, callback atomicity, CSRF derivation, cookie names, and error taxonomy.
3. Verify Pages preview callback stability, environment configuration, secret lifecycle, and rate-limit binding feasibility against current platform schemas.
4. Publish an exact four-route surface and deny all business routes.
5. Freeze evidence IDs, test adapters, provider timeout/retry policy, rollback triggers, and cleanup ownership.

Acceptance: no unresolved schema/key/rate-limit/callback decision; no remote change; all requirements, threats, risks, owners, and evidence are mapped.

Evidence: `CF-EV-P3-STA-001`, `CF-EV-P3-SEC-001`.

Execution result (2026-07-16): **PASS**. The canonical implementation profile is [`phase-3-identity-session-contract.md`](phase-3-identity-session-contract.md), backed by `config/cloudflare/phase-3-contract-freeze.json`. It freezes domain-separated OAuth/session/CSRF keys, safe return paths, callback atomicity, exact errors, the dedicated preview branch/app/cookie boundary, and a hybrid rate design. Current Wrangler supports only 10/60-second binding periods, so a reviewed forward-only operational rate-window migration is assigned to `CF-P3-007`; no migration, runtime, secret, provider app, configuration, or remote state changed in this story.

Gate P3-G1 approves the frozen design and authorizes `CF-P3-002` only.

### `CF-P3-002` — Build cryptographic, token, cookie, and secret primitives

Size: L | Owner: Senior Developer | Reviewers: Security, Senior QA, Technical Lead

Tasks: Web Crypto random generation, PKCE S256, domain-separated HMAC, versioned AEAD envelope, constant-time comparison, safe redirect parsing, cookie serialize/expire, and fail-closed typed environment validation.

Acceptance: deterministic vectors and negative/malformed/key-rotation cases pass; logs/errors/snapshots contain no raw state, verifier, provider token, session token, CSRF token, or secret; production cannot satisfy identity configuration.

Evidence: `CF-EV-P3-UT-001`, `CF-EV-P3-SEC-002`.

Execution result (2026-07-16): **PASS**. The isolated identity primitive library now provides strict versioned keyrings, domain-separated HKDF/HMAC, PKCE S256, opaque state/session/CSRF tokens, deterministic AES-256-GCM transaction envelopes with bound AAD, safe return-path normalization, host-only session cookies, and fail-closed environment validation. Ten Workers-runtime tests cover fixed vectors, malformed input, tamper, AAD substitution, key rotation, cookie ambiguity, open redirects, secret canaries, and production/preview isolation. No route invokes the library yet; no migration, Wrangler binding, secret, OAuth application, remote resource, identity runtime, or collaboration capability changed.

Gate P3-G2 authorizes `CF-P3-003` only.

### `CF-P3-003` — Implement single-use OAuth transaction lifecycle

Size: L | Owner: Senior Developer | Reviewers: Security, Senior QA, Technical Lead

Tasks: typed repository/service, ten-minute server-time expiry, state digest lookup, encrypted payload, validated return path, pending/consumed states, compare-and-set consume, bounded cleanup, and concurrent replay/fault injection.

Acceptance: exactly one concurrent callback can consume a transaction; expired, replayed, wrong-origin, wrong-purpose, corrupt-envelope, or unknown state creates no session/user; cleanup cannot delete active transactions.

Evidence: `CF-EV-P3-UT-002`, `CF-EV-P3-INT-001`, `CF-EV-P3-SEC-003`.

Execution result (2026-07-16): **PASS**. The isolated service and typed D1 repository implement a ten-minute server-time lifecycle, digest-only state lookup across active/previous keys, an AAD-bound encrypted verifier context, exact preview callback binding, guarded single-use consume, and capped retention cleanup. Eight Workers-runtime tests prove one winner under concurrent consume, replay rejection, exact expiry, unknown/tampered/substituted inputs, fail-closed key ambiguity, cleanup safety, fault boundaries, and protected-value non-echo. Existing schema version 9 is unchanged; no route, binding, secret, remote resource, user, session, identity runtime, or collaboration capability changed.

Gate P3-G2A authorizes `CF-P3-004` only.

### `CF-P3-004` — Implement GitHub adapter, numeric identity, and atomic callback

Size: XL | Owner: Senior Developer | Reviewers: Security, Senior QA, Technical Lead, Privacy

Tasks: bounded provider adapter, exact redirect and PKCE exchange, `/user` normalization, provider+numeric-subject upsert, token disposal, atomic transaction/user/session batch, reauthentication subject match, fault injection, and generic redirects/errors.

Acceptance: login/email changes do not change identity; missing/non-numeric subject fails; provider token is never stored; batch failure/replay creates no authority; reauthentication cannot switch users; local tests use only injected mock provider.

Evidence: `CF-EV-P3-API-001`, `CF-EV-P3-INT-002`, `CF-EV-P3-SEC-004`.

Execution result (2026-07-16): **PASS**. A bounded GitHub adapter now performs exact server-side code exchange with PKCE, revalidates `GET /user`, uses numeric `id` as the sole stable subject, discards the provider token after lookup, and caps response size, timeouts, retry statuses, delay, and total provider budget. The callback authority batch converts every failed compare-and-set into a SQL constraint failure so D1 rolls back transaction consumption, identity changes, predecessor revocation, and successor insertion together. Ten Workers/D1 tests prove mutable-login stability, concurrent single-winner behavior, replay denial, session-conflict rollback, same-subject reauthentication, expiry/fault denial, and canary non-echo. No route, migration, binding, secret, OAuth app, remote resource, or deployed identity capability changed.

Gate P3-G2B authorizes `CF-P3-005` only.

### `CF-P3-005` — Implement session lifecycle and recent authentication

Size: XL | Owner: Senior Developer | Reviewers: Security, Senior QA, Technical Lead

Tasks: session create/lookup, digest-only storage, cookie issuance, idle/absolute expiration, at-most-five-minute `last_seen_at` coalescing, rotation, revoke-first logout, predecessor revocation, recent-auth check, bounded purge, race/fault tests.

Acceptance: no raw session value reaches D1/logs; revoked/expired/predecessor/cross-environment cookies fail uniformly; rotation has one valid successor; failed rotation/logout never leaves two valid sessions; read amplification stays bounded.

Evidence: `CF-EV-P3-UT-003`, `CF-EV-P3-API-002`, `CF-EV-P3-INT-003`, `CF-EV-P3-SEC-005`.

Execution result (2026-07-16): **PASS**. The isolated lifecycle resolves at most two active/previous pepper digests through a `first-primary` D1 session, coalesces `last_seen_at` writes at five minutes, enforces 12-hour idle, seven-day absolute, and 15-minute recent-authentication boundaries, and rotates previous-pepper/security/fixation sessions with one rollback-enforced batch. Rotation preserves the original absolute lifetime and authentication age unless the OAuth reauthentication callback explicitly refreshes it. Logout revokes server-side before returning cookie expiry. Twelve Workers/D1 tests prove uniform invalid-session handling, cross-environment denial, exact boundary behavior, concurrent single-winner rotation, real constraint rollback, bounded race reread, fault safety, and capped terminal purge. No route, migration, binding, secret, OAuth app, remote resource, preview identity, production identity, or collaboration capability changed.

Gate P3-G2C authorizes `CF-P3-006` only.

### `CF-P3-006` — Enforce Origin, CSRF, and four-route scope

Size: L | Owner: Senior Developer + Senior QA | Reviewers: Security, Technical Lead

Tasks: centralized exact-Origin policy, synchronizer token issue/verify, method/content-type/cache policy, optional/session authentication middleware, route allowlist, service-worker isolation, CORS/preflight denial, and contract tests.

Acceptance: missing/null/lookalike/subdomain/port/scheme/cross-environment origins fail; missing/wrong/old/cross-session CSRF fails; callback remains GET and state-protected; only the four routes are reachable; business routes still return the disabled boundary with zero D1 calls.

Evidence: `CF-EV-P3-UT-004`, `CF-EV-P3-API-003`, `CF-EV-P3-SEC-006`.

Execution result (2026-07-16): **PASS**. A single isolated request-policy boundary now classifies only the four frozen identity method/path pairs, validates the exact HTTPS environment origin before mutation/session work, preserves the state/PKCE-protected callback GET exception, rejects preflight/CORS and non-contract media types, and applies optional or required server sessions with a separately keyed synchronizer CSRF token bound to the raw current session token. Twelve Workers/D1 tests prove missing/null/lookalike/subdomain/port/scheme/cross-environment Origin denial, method/path/query confusion denial, callback behavior, optional session issuance, validation order, old-key/cross-session CSRF denial, and no-store/no-CORS headers. The policy remains isolated: no production/preview route invokes it, business routes remain disabled, schema 9 and bindings are unchanged, and no secret or remote resource changed.

Gate P3-G3 authorizes `CF-P3-007` only.

### `CF-P3-007` — Add abuse controls, privacy-safe observability, and resilience

Size: L | Owner: Senior Developer + Operations | Reviewers: Security, Senior QA, Technical Lead, Privacy

Tasks: reviewed rate-limit adapter/binding, user/IP tiers, correlation IDs, structured allowlisted events, latency/error metrics, provider timeout, bounded retry/jitter, outage circuit behavior, and overload tests.

Acceptance: limits are deterministic and fail closed; errors do not enumerate users/state/sessions; no secret/token/PII canary reaches logs; provider slowdown does not consume unbounded Worker/D1 resources; retry never replays a consumed callback.

Evidence: `CF-EV-P3-INT-004`, `CF-EV-P3-PERF-001`, `CF-EV-P3-SEC-007`, `CF-EV-P3-OPS-001`.

Gate P3-G3A is the local security exit. Passing it permits requesting P3-G4; it does not itself authorize remote writes.

### `CF-P3-008` — Provision isolated preview OAuth and identity runtime

Size: M | Owner: Operations + Security | Reviewers: Product, Senior QA, Technical Lead, Privacy

Entry requires explicit **Gate P3-G4** approval.

Tasks: create/review the dedicated preview GitHub OAuth app, configure the frozen callback, provision preview-only secrets/variables, enable the two-key preview runtime, deploy the exact approved commit, and reconcile Pages/D1/provider state without printing secret values.

Acceptance: preview app and cookie are unique; stable callback and exact origin match; only designated synthetic identities are permitted; production has zero D1/OAuth/session bindings and identity remains disabled; GitHub Pages remains static.

Evidence: `CF-EV-P3-OPS-002`, `CF-EV-P3-SEC-008`.

Gate P3-G4A authorizes `CF-P3-009` only.

### `CF-P3-009` — Run preview quality, resilience, and cleanup matrix

Size: XL | Owner: Senior QA + Operations | Reviewers: Security, Technical Lead, Privacy, Product

Tasks: real-browser login/reauth/logout, replay/CSRF/fixation/revocation/expiry tests, provider outage and limiter tests, secret-rotation rehearsal, service-worker/cache scans, privacy scans, load budgets, production/fallback isolation, session cleanup, and deployment rollback.

Acceptance:

- zero P0/P1 skips, quarantine, accepted flakiness, secret matches, replay success, CSRF bypass, or revocation bypass;
- authenticated read p95 ≤300 ms and write p95 ≤500 ms excluding provider latency;
- preview sessions/OAuth transactions are revoked or purged after testing and no workspace/document row exists;
- rollback disables identity first, revokes preview sessions, restores the last safe deployment, and leaves production/fallback unchanged.

Evidence: `CF-EV-P3-E2E-001`, `CF-EV-P3-INT-005`, `CF-EV-P3-PERF-002`, `CF-EV-P3-SEC-009`, `CF-EV-P3-OPS-003`.

Gate P3-G5 authorizes `CF-P3-010` only.

### `CF-P3-010` — Assemble Phase 3 exit and Phase 4 handoff

Size: M | Owner: Technical Lead + Senior QA + Product | Reviewers: Security, Operations, Privacy, UX

Tasks: reconcile all evidence and remote state; close Critical/High risks; document limitations, recovery, rotation, and on-call ownership; publish typed identity/session interfaces for Phase 4; issue separate decisions for identity preview and collaboration activation.

Acceptance: all evidence is immutable and traceable; production/fallback boundaries are reconciled; no unowned P0/P1 defect or expired risk remains; identity preview may be `GO`, while collaboration activation must remain `NO-GO` until Phase 4 gates.

Evidence: `CF-EV-P3-OPS-004`.

Gate P3 is the Phase 3 exit and requires Product, Technical Lead, Senior QA, Security, Operations, Privacy, and UX sign-off.

## 7. Gate flow and authority

```text
P3-G0 sprint approval
  -> 001 contract freeze -> P3-G1
  -> 002 primitives -> P3-G2
  -> 003 OAuth transactions -> P3-G2A
  -> 004 callback/identity -> P3-G2B
  -> 005 sessions -> P3-G2C
  -> 006 Origin/CSRF/routes -> P3-G3
  -> 007 abuse/resilience -> P3-G3A local exit
  -> explicit P3-G4 remote authorization
  -> 008 preview provisioning -> P3-G4A
  -> 009 preview quality matrix -> P3-G5
  -> 010 exit/handoff -> Gate P3
```

Only P3-G4 authorizes external provider or Cloudflare secret/configuration changes. A gate approval never authorizes later stories by implication.

## 8. Quality and evidence matrix

| Layer | Required coverage | Hard failure condition |
|---|---|---|
| Unit | crypto vectors, parsers, cookies, expiry, CSRF, errors | non-determinism, secret output, unsupported algorithm |
| Real local D1 | transaction CAS, callback batch, session rotation/revoke/purge, races, faults | partial authority, replay winner >1, raw token storage |
| API contract | four routes, methods, payloads, status/errors/cache, disabled business routes | route drift, cacheable secret response, D1 call from disabled route |
| Security | OAuth replay/substitution, fixation, CSRF, origin, enumeration, key rotation, logs | any bypass or secret/PII canary |
| Browser preview | login, reauth, logout, cookie attributes, back/refresh/multi-tab | stale session accepted or wrong-origin cookie behavior |
| Resilience | provider timeout/outage, limiter, D1 faults, rollback | unbounded retry, unsafe partial state, production impact |
| Performance | representative authenticated reads/writes and abuse load | read p95 >300 ms or write p95 >500 ms without approved remediation |
| Boundary | preview/production/fallback, SW/cache, artifact/secret scan | production identity/D1, fallback API, deployed test bypass |

Every evidence document must identify commit, environment, command or procedure, expected/actual result, owner, reviewer, timestamp, sanitized logs, limitations, and disposition. P0/P1 evidence cannot be skipped, quarantined, retried into green, or accepted as flaky.

## 9. Rollback, incident, and cleanup order

For an identity/session incident:

1. set preview identity mode to disabled and deploy the last reviewed disabled configuration;
2. revoke all affected preview sessions and expire the cookie;
3. rotate the compromised OAuth, transaction, session, or CSRF secret as applicable;
4. revoke/replace the provider credential and callback configuration when involved;
5. reconcile OAuth transaction/session/user rows and privacy-safe audit/log evidence;
6. restore the last safe Pages deployment; do not copy preview resources into production;
7. rerun replay, revocation, CSRF, origin, cookie, provider, production, and fallback checks before re-enable;
8. retain only sanitized incident evidence and remove disposable/synthetic session data under the approved retention policy.

Production rollback remains the current static/disabled application because Phase 3 provisions no production identity resource.

## 10. Definition of Ready and Done

A story is Ready only when its entry gate is approved, contracts and dependencies are stable, owners/reviewers are named, test data contains no customer data, rollback is executable, and every external write is explicitly authorized.

A story is Done only when acceptance criteria and all mapped evidence pass, characterization/regression/security tests are green, no P0/P1 exception exists, secret/privacy scans are clean, remote state is reconciled where applicable, documentation and runbook are current, and Senior QA approves before commit.

## 11. Current recommendation

Cross-functional recommendation: **Approve Gate P3-G3 and authorize `CF-P3-007` only.**

This authorizes exact-Origin, session-bound CSRF, and four-route scope enforcement only. It does not provision OAuth, enable preview identity, or change production.
