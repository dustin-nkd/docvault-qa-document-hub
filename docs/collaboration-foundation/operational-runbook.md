# Collaboration Foundation operational runbook

Status: Approved at Gate G3; operational rehearsal evidence pending

Owners: Operations, Technical Lead, Security Reviewer, Senior QA

This runbook defines the deployment, migration, recovery, observability, and incident contract for Collaboration Foundation. It is a specification: no production binding, database, secret, or runtime route is authorized until the complete Phase 0 exit gate passes.

## 1. Environment contract

| Environment | Data and identity | Purpose | Hard boundary |
|---|---|---|---|
| Local | Disposable local D1; deterministic OAuth adapter; synthetic users | Unit, integration, migration, and developer verification | Never connects to preview or production data, OAuth credentials, or cookies |
| Preview | Dedicated preview D1, GitHub OAuth app/callback, secrets, cookie namespace, origins, and synthetic accounts | Integration, browser, security, performance, migration rehearsal, and canary rehearsal | Never shares a D1 database, OAuth app, session namespace, secret, or writable account with production |
| Production | Dedicated production D1, GitHub OAuth app/callback, secrets, cookie namespace, and canonical origin | Approved customer traffic only | No destructive test fixture, debug bypass, or preview credential is permitted |

Preview deployments from untrusted branches must not receive production or shared preview secrets. Production deployment is permitted only from the protected `main` branch after required checks pass.

## 2. Bindings and secrets

The future Pages Functions configuration must declare and type-check these logical values. Exact resource IDs and secret values remain outside the repository.

| Name | Kind | Purpose |
|---|---|---|
| `COLLAB_DB` | D1 binding | Collaboration schema and server-visible records |
| `APP_ENV` | Non-secret variable | `local`, `preview`, or `production` |
| `CANONICAL_ORIGIN` | Non-secret variable | Exact accepted application origin |
| `GITHUB_OAUTH_CLIENT_ID` | Non-secret variable | Environment-specific OAuth application |
| `GITHUB_OAUTH_CLIENT_SECRET` | Secret | OAuth code exchange |
| `SESSION_TOKEN_PEPPER` | Secret | Domain-separated session-token digest protection |
| `OAUTH_TRANSACTION_KEY` | Secret | OAuth transaction state protection where required by the API contract |
| `CURSOR_SIGNING_KEY` | Secret | Opaque pagination cursor authentication |

Rules:

- Secrets are provisioned with Cloudflare secret management, never `vars`, source control, build output, test snapshots, screenshots, or logs.
- Every preview and production secret has a named owner, rotation date, and emergency-revocation procedure in the restricted operations inventory.
- Configuration validation fails closed when a required binding, origin, or secret is absent or malformed.
- Generated binding types are refreshed and checked whenever configuration changes.
- The repository uses a reviewed `wrangler.jsonc`; compatibility-date changes are explicit pull-request changes with regression evidence.

## 3. Required release evidence

Every release record contains:

1. Git commit and immutable Cloudflare deployment ID.
2. Approved change scope, risk level, feature flags, and migration identifiers.
3. Dependency-lock integrity and clean-install result.
4. static, unit, integration, browser, security, accessibility, and applicable performance results.
5. preview migration rehearsal and schema-integrity output.
6. production pre-change D1 Time Travel bookmark and timestamp.
7. canary results, request/error/latency comparison, and approvers.
8. rollback owner, decision deadline, and final outcome.

No result may be marked passed from a skipped, retried-without-cause, or fabricated check. P0/P1 test skips are release blockers.

## 4. Release choreography

The operator substitutes the reviewed database name from restricted environment inventory. Commands shown here contain no resource ID or secret. Phase 1 must pin Wrangler in `devDependencies` and the lockfile; after `npm ci`, every `npx wrangler` command below must resolve that local pinned binary and must not download an unreviewed CLI version during release.

### 4.1 Preflight

```powershell
npm ci
npm run check
npm run build
npx wrangler types
npx wrangler d1 migrations list <preview-database> --remote
```

Then:

- confirm the branch, commit, Pages project, account, environment, D1 binding, and OAuth callback;
- confirm there is no unexpected working-tree or generated-artifact change;
- compare migration manifests to the last production release;
- exercise the old runtime against the expanded schema and the new runtime against the pre-contract compatibility fixture;
- confirm kill switches are off and the collaboration entry point remains inaccessible before approval.

### 4.2 Migration rehearsal

Apply every migration first to a new local database, a representative populated fixture, and the isolated preview D1:

```powershell
npx wrangler d1 migrations apply <preview-database> --remote
npx wrangler d1 migrations list <preview-database> --remote
```

Re-running the migration check must report no unapplied migration. Verify constraints, indexes, row counts, foreign-key behavior, idempotency races, and old/new code compatibility. A failed or ambiguous rehearsal blocks production.

### 4.3 Production expand deployment

1. Announce the change window and incident owner.
2. Record the current production deployment and a D1 Time Travel bookmark/timestamp.
3. Apply only reviewed, immutable, backward-compatible **expand** migrations:

```powershell
npx wrangler d1 migrations list <production-database> --remote
npx wrangler d1 migrations apply <production-database> --remote
npx wrangler d1 migrations list <production-database> --remote
```

4. Run read-only schema and integrity probes.
5. Deploy compatible application code with the new capability disabled.
6. Run the production synthetic canary against a dedicated non-customer workspace.
7. Enable the feature for the canary cohort, observe the defined window, and then expand gradually only while gates remain green.
8. Record the deployment result and close or escalate the change.

### 4.4 Contract migration

Destructive or narrowing schema changes are a later release after the old application version, queued mutation lifetime, rollback window, and retained data no longer depend on the old shape. Contract migrations require a new explicit approval and restore rehearsal; they never accompany the first code deployment that stops writing an old field.

## 5. Canary and release gates

The production canary uses synthetic accounts, a dedicated workspace, non-sensitive encrypted fixtures, and unique canary markers. It covers sign-in/session validation, workspace read, invitation lifecycle, device/envelope lookup, one encrypted document create/update/conflict/replay path, audit retrieval, and cleanup according to retention rules.

Release remains blocked or is rolled back when any of these occurs:

- any authorization, cross-workspace isolation, key-envelope binding, idempotency, or audit correctness failure;
- any P0/P1 test failure or unexplained test skip;
- error rate above 1% for collaboration requests over a five-minute canary window;
- preview/production API p95 beyond the approved quality budget without a documented external-provider exclusion;
- D1 error, migration ambiguity, schema mismatch, or privacy-sensitive log field;
- unexpected session, OAuth, CSRF, CSP, or origin-policy behavior;
- inability to disable the feature or identify the deployed commit.

## 6. Rollback decision tree

1. **Capability defect with compatible schema:** disable the collaboration flag and verify the personal vault remains healthy.
2. **Application regression with compatible schema:** disable the flag, deploy the last known-good compatible commit, and verify canaries.
3. **Migration defect with intact data:** disable writes and deploy a reviewed forward-fix migration; immutable migrations are never edited or deleted.
4. **Suspected data corruption or destructive migration:** contain traffic, preserve evidence, obtain incident-authority approval, and execute D1 Time Travel recovery.
5. **Key, membership, or authorization incident:** revoke affected sessions/devices/memberships, stop envelope distribution and writes as applicable, rotate future keys, and follow the security incident procedure. Do not claim deletion of already downloaded plaintext or old ciphertext.

Rollback must never silently discard accepted mutations. If a restore is required, accepted writes after the restore point are inventoried from audit/operational evidence and reconciled only through an approved, idempotent replay process.

## 7. D1 Time Travel recovery

Proposed objectives for Gate G3:

- Recovery point objective (RPO): at most 5 minutes for collaboration metadata and ciphertext.
- Recovery time objective (RTO): at most 60 minutes from declared database incident to a verified contained service or documented degraded mode.

D1 Time Travel is the production recovery mechanism, not a substitute for migration compatibility or application-level audit. Cloudflare documents Time Travel retention as 30 days for paid plans and 7 days for free plans; the operator must verify the active plan and available restore window before relying on a point.

In-place restore is destructive to database state after the selected point. The incident commander must:

1. disable collaboration writes and preserve logs/deployment/migration evidence;
2. identify the last verified-good timestamp or bookmark and the affected mutation interval;
3. obtain the named restore approval;
4. record the current bookmark returned by the restore operation so the pre-restore state remains addressable within the provider window;
5. restore through the reviewed Cloudflare procedure;
6. verify schema, membership, envelopes, revision chains, mutation uniqueness, and audit continuity before reopening reads or writes;
7. reconcile acknowledged post-point mutations or notify affected users truthfully;
8. complete the post-incident review and recovery-objective measurement.

Restoring a database never restores an unavailable user-held decryption key and never proves remote erasure from member devices.

## 8. Incident playbooks

| Incident | Immediate containment | Recovery and evidence |
|---|---|---|
| Session theft or OAuth compromise | Revoke affected/all sessions, disable callback or sign-in if necessary, rotate relevant server secret, preserve provider/request IDs | Validate no membership/key mutation occurred; audit sessions and actions; rotate OAuth secret; notify under policy |
| Unauthorized membership, role, or invitation | Disable mutations; revoke membership/invitation/session; block future key envelopes | Audit authoritative actor/time; rotate future workspace key; identify already downloaded material; do not promise retroactive unreadability |
| Lost or compromised device | Revoke device and sessions; stop new envelope delivery | Rotate future key version where policy requires; guide recovery; state historical/offline-copy limitation |
| D1 outage or corruption | Disable writes; preserve last healthy bookmark and deployment; use read-only/degraded mode only if safe | Provider status, integrity check, forward fix or authorized Time Travel restore, mutation reconciliation |
| GitHub OAuth outage | Keep existing valid sessions only; disable new sign-in/callback retries that can amplify load | Show non-enumerating retry guidance; verify transaction expiry and no code/state replay |
| XSS or dependency compromise | Disable collaboration UI/API as needed, revoke sessions, stop key use, freeze deployment | Identify exposed unlocked-browser scope; patch CSP/dependency; rotate secrets and future keys where justified; security review before reopen |
| Cloudflare Pages origin outage | Stop automated changes and monitor provider status | GitHub Pages remains a personal-vault fallback only; it must not serve collaboration APIs or imply workspace availability |

## 9. Observability and privacy

Structured operational events use an allow-list. Permitted examples are timestamp, environment, deployment ID, request ID, stable route template, method, result/error code, latency bucket, D1 operation count/duration, actor/workspace/device opaque identifiers where necessary and approved, and feature-flag state.

Logs must never contain document title/content/tags/category plaintext, ciphertext bodies, keys or envelopes, cookies, session/OAuth tokens, authorization headers, invitation bearer tokens, cursor contents/signatures, raw request/response bodies, SQL parameters, or stack traces returned to clients. User-facing failures contain only a request ID, stable error code, and sanitized message.

Alerts cover elevated error/latency, authentication anomalies, repeated CSRF/origin failures, invitation abuse, cross-tenant denials, device/envelope failure spikes, migration errors, D1 health, canary failure, and privacy-canary detection. Alert access and retention follow the data-classification contract.

## 10. Data retention and purge operations

- Expired OAuth transactions, sessions, invitations, idempotency results, and operational logs are purged by bounded, retry-safe jobs using the approved retention schedule.
- Audit events and retention holds follow ADR-008 and must not be removed through ordinary workspace deletion.
- Workspace deletion is deny-closed when retention, export, key, or referential state is ambiguous.
- Purge reports include counts and stable identifiers, never content or secret material.
- A purge failure alerts Operations and is retried without broadening access or bypassing a hold.

## 11. Routine operational checks

Daily after launch:

- canary health and collaboration error/latency budget;
- OAuth callback and session anomaly rate;
- D1 errors, capacity, and failed maintenance jobs;
- privacy canary and security alerts.

Per release:

- config/binding/secret inventory diff;
- dependency and migration diff;
- preview isolation and synthetic canary proof;
- production bookmark, deployment, smoke, and rollback evidence.

Monthly:

- secret and OAuth application ownership/rotation review;
- restore-window and Time Travel rehearsal in a non-production database;
- expired-record purge and retention-hold audit;
- browser, compatibility-date, dependency, and workload-budget review.

## 12. Gate G3 acceptance

- [x] Product Owner approves RPO `<= 5 minutes` and RTO `<= 60 minutes` as the initial objectives.
- [x] Operations approves environment isolation, release choreography, canary gates, and incident ownership.
- [x] Technical Lead approves the binding/secret/configuration and expand-contract migration contract.
- [x] Security approves the allow-listed telemetry, secret handling, containment, and restore authorization model.
- [x] Senior QA confirms migration, rollback, restore, privacy, and canary scenarios are traceable and executable.
- [x] The Day 5 implementation plan assigns logical Cloudflare resource names without committing IDs or secrets.
- [x] No runtime implementation begins until Gate G3 and the complete Phase 0 exit gate pass.

Current assessment: **Gate G3 PASSED; runtime implementation remains NO-GO until the Phase 0 exit gate.**

## 13. Current primary references

- [Cloudflare Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare D1 database API and atomic batch behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare Workers testing](https://developers.cloudflare.com/workers/testing/)
