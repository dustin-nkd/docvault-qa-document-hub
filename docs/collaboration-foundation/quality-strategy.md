# Collaboration Foundation Quality Strategy

**Status:** Approved at Gate G3; implementation evidence remains pending

**Owner:** Senior QA

**Scope:** Phase 0 — Specification and threat model
**Applies to:** Collaboration Foundation only; realtime co-editing, comments, notifications, attachments, and credential sharing remain out of scope

## 1. Purpose

This document defines the proposed Gate G3 quality contract that must be approved before Collaboration Foundation implementation begins. It records the regression surface, executable test levels and environments, evidence expectations, stable requirement traceability, workload and browser baselines, and the disposition of all Day 1 testability decisions.

The strategy protects the existing personal vault while adding a second, server-backed collaboration mode. Collaboration must not silently change the security, persistence, offline, guest, public-share, or deployment behavior already relied on by the application.

## 2. Quality objectives

Collaboration Foundation must eventually demonstrate that:

1. Authentication establishes a stable user identity without exposing OAuth credentials or application sessions.
2. Every workspace operation is authorized server-side against current membership and role.
3. Shared document content and workspace keys are never available to Cloudflare services as plaintext.
4. Concurrent updates cannot silently overwrite one another.
5. Retries and reconnects cannot create duplicate logical mutations.
6. Member and device revocation take effect according to a documented, testable contract.
7. Personal vault, GitHub Sync, guest mode, public sharing, offline shell, and GitHub Pages fallback do not regress.
8. Production changes are supported by reproducible evidence and a safe rollback path.

## 3. Current regression surface inventory

The following inventory is based on the repository state inspected during Phase 0 Day 1.

### 3.1 Runtime and state surfaces

| Surface | Current behavior to preserve | Principal collaboration risk |
|---|---|---|
| Global document state | `js/state.js` owns a global `documents` collection and `persist()` / `hydrate()` lifecycle | Personal and workspace documents could be mixed or written through the wrong provider |
| Guest mode | `?guest=1` clones isolated fixtures, does not call `DocStorage`, `LocalAuth`, or GitHub Sync, and leaves no real vault trace | Collaboration bootstrap could perform authentication, storage, or network work in guest mode |
| Personal persistence | `DocStorage` encrypts and writes the current vault to localStorage or Chrome local storage | A provider refactor could fall back to plaintext, lose local data, or exceed quota without safe feedback |
| Personal authentication | `LocalAuth` protects the local vault with a master password and session storage state | OAuth identity could be confused with vault unlock state; one mechanism must not bypass the other |
| Vault encryption | Vault V2 uses AES-GCM and PBKDF2 with migration support from V1 | New collaboration envelopes could weaken current crypto behavior or reuse incompatible key material |
| Credential handling | Credential fields receive nested encryption and credentials are excluded from public share links | Credential documents could accidentally enter a shared workspace or logs before field-level policy exists |
| GitHub Sync | Local encrypted vault syncs to GitHub, supports sharding, tombstones, pending retry state, and timestamp-based merge | Collaboration revisions could be routed through legacy sync, or legacy last-write behavior could leak into workspace writes |
| Offline retry | Current GitHub writes are coalesced and retain a pending-sync marker across reloads | A new outbox may duplicate writes, reorder operations, or conflict with the existing retry indicator |
| Public share links | `js/actions-sharing.js` uploads encrypted read-only payloads to GitHub and puts the key in the URL fragment | Public sharing could be mistaken for workspace sharing, inherit workspace secrets, or disclose private metadata |
| History and activity | Local document history and activity logs use localStorage and tolerate quota failures | Workspace audit events could be incomplete, contain secrets, or be treated as authoritative client history |
| Service worker | `sw.js` caches the static app shell, serves offline navigation, avoids cross-origin interception, and isolates stale DocVault caches | Same-origin `/api/*` requests could be cached or receive the offline HTML shell instead of a network error |
| CSP event model | Runtime uses delegated `data-onclick` actions and forbids native inline handlers | Collaboration UI could reintroduce CSP-blocked scripts or unsafe interpolation |
| Search and rendering | Search indexing, dashboard cache, category editor/viewer rendering, and lazy editor runtime have characterization coverage | Workspace switching or encrypted hydration could leave stale search/cache data or load the editor eagerly |

### 3.2 Hosting and deployment surfaces

| Surface | Current behavior to preserve | Principal collaboration risk |
|---|---|---|
| Cloudflare Pages | Canonical deployment serves the generated `_site` artifact with strict security headers | Pages Functions and D1 bindings may differ between preview and production or be deployed before a compatible schema |
| GitHub Pages | Existing fallback serves the static application without a collaboration backend | Collaboration UI could appear functional but fail, loop, or write personal data on the fallback origin |
| Build artifact | `scripts/build-pages.mjs` includes referenced runtime assets and rejects repository-only files in `_site` | Functions, configuration, or required client modules could be omitted or sensitive server files could leak into `_site` |
| CI dependency gate | `npm ci`, the committed lockfile, local Tailwind, quality checks, build, and Playwright are required before GitHub Pages publish | Cloudflare's independent build could diverge from CI or deploy before backend validation and migrations |
| Security headers | `_headers` enforces strict script policy, HSTS, clickjacking protection, permissions restrictions, and same-origin opener policy | OAuth redirects, API connections, or new scripts could prompt an unnecessary weakening of the policy |

### 3.3 Existing automated regression coverage

The current `npm test` runner imports 12 Node test modules. Current coverage includes:

- State calculations for release readiness, scorecards, focus workflow, and bug lifecycle.
- Storage migrations, guest isolation, deleted IDs, merges, activity logs, and pending sync recovery.
- Sync coalescing, completion-boundary behavior, retry storms, sharded storage, and metadata fingerprints.
- Vault V1 compatibility, Vault V2 parameters, tamper rejection, atomic migrations, password changes, rollback, and plaintext-fallback prevention.
- Security header and strict-CSP artifact checks.
- Search index invalidation and scoring.
- Service-worker atomic installation, offline navigation, exact-resource preference, and cache cleanup.
- Dashboard and runtime performance budgets.
- Maintainability characterization seams.
- Safe markup/action serialization and hostile punctuation.
- Interaction contracts that forbid inline handlers and sticky JavaScript hover behavior.

The Playwright browser smoke suite currently validates the generated production artifact in Chromium, including production headers, guest-mode startup, assets, and runtime console/page errors. It is a single-origin static smoke suite, not yet a multi-user or backend E2E suite.

### 3.4 Current gaps relevant to collaboration

There is no existing automated coverage for:

- Pages Functions request handling.
- D1 schema, migrations, transactions, or restore.
- OAuth start/callback/logout flows.
- Server-side sessions, cookies, CSRF, or session revocation.
- Workspace and cross-workspace authorization.
- Membership, roles, invitations, or ownership transfer.
- Device identity or workspace-key envelopes.
- Encrypted shared document revisions.
- Compare-and-set conflict handling or idempotency keys.
- Multi-user browser journeys.
- Collaboration-aware offline outbox behavior.
- Collaboration API load, latency, or rate limits.
- Collaboration UI accessibility.

These are planned additions. Phase 0 must first make their contracts unambiguous and testable.

## 4. Proposed test levels

### 4.1 Static and quality gates

Run on every change:

- JavaScript and server-module syntax/type checks.
- Migration file ordering and immutability checks.
- API schema validation.
- Secret and sensitive-string scanning.
- Dependency audit and lockfile validation.
- CSP and production-artifact checks.
- English-only product fixture and UI gate.
- Maintainability and bundle budgets.

### 4.2 Unit tests

Unit tests must cover pure decisions and parsers without requiring a browser or network:

- Request validation and canonical error mapping.
- RBAC policy decisions for every role/action pair.
- Invitation state transitions.
- Session expiry and revocation decisions.
- Encryption-envelope parsing and validation.
- Key-version compatibility decisions.
- Revision compare-and-set decisions.
- Idempotency behavior.
- Audit-event allow-listing and redaction.
- Capability detection between Cloudflare and static fallback deployments.

Unit tests must use fixed clocks and deterministic identifiers where relevant. Production cryptographic randomness must never be replaced by a test implementation in the runtime path.

### 4.3 Integration tests

Integration tests run actual Pages request handlers through `@cloudflare/vitest-pool-workers` using the official Pages recipe and an isolated real local D1 database:

- Schema creation and every migration path.
- Repository queries, constraints, indexes, and transactions.
- Session creation, lookup, expiry, logout, and revocation.
- Workspace creation and owner membership atomicity.
- Invitation acceptance and key-envelope assignment atomicity.
- Cross-workspace access rejection.
- Member/device revocation.
- Document creation, append-only revision, soft deletion, and conflict response.
- Idempotent replay under retry.
- Sanitized logging and audit persistence.

Mock only external OAuth exchange endpoints through injected adapters. Do not mock the D1 repository in integration coverage. Clock, UUID, token, provider, and failure seams are constructor/request-context dependencies selected by the test harness; no test bypass, deterministic secret, or mock-provider branch may be reachable in a production build.

### 4.4 API contract tests

Contract tests must lock:

- HTTP method and route.
- Authentication and CSRF requirements.
- Request and response schema.
- Status codes, including `400`, `401`, `403`, `404`, `409`, `413`, `422`, and `429` where applicable.
- Stable machine-readable error codes.
- Request ID propagation.
- Pagination and ordering.
- Payload and ciphertext limits.
- Idempotency response behavior.
- Cache-control and CORS/same-origin policy.

Authorization failures must avoid leaking whether a cross-workspace resource exists.

### 4.5 Browser E2E tests

Playwright uses separate browser contexts for separate users and devices. The release browser matrix is the latest two stable versions of Chrome, Edge, and Firefox plus Safari 17.4 or later. Required journeys include:

- Login, logout, session restoration, and revoked-session behavior.
- Owner creates a workspace and invites Editor and Viewer users.
- Invitation accept, expiry, revocation, and reuse rejection.
- Editor creates an encrypted document; Viewer reads but cannot edit it.
- Direct API attempts confirm that hidden/disabled UI is not the security boundary.
- Two editors update the same base revision; one succeeds and one receives a recoverable conflict.
- Offline mutation survives reload and replays once after reconnect.
- Membership or device is revoked while a client is active or offline.
- Personal vault remains isolated across workspace switching.
- Guest mode remains storage- and collaboration-network-isolated.
- GitHub Pages fallback suppresses collaboration controls and remains error-free.

### 4.6 Security tests

Security coverage must include:

- OAuth state, PKCE, callback origin, code replay, and login CSRF.
- Session fixation, cookie attributes, expiry, replay, rotation, and revocation.
- CSRF on every state-changing endpoint.
- IDOR and role escalation across every workspace route.
- Invitation token expiry, hashing, single use, and concurrent acceptance.
- Ciphertext and IV tampering, wrong key/device, malformed envelopes, unsupported algorithms, and excessive payloads.
- Credential-category controls in the official client, including absent copy/share controls and rejection before encryption. Because the server sees only authenticated ciphertext and minimal metadata, it cannot inspect semantic content or prevent an authorized member from pasting a secret into an otherwise eligible encrypted document; tests and product claims must state this limitation rather than claim server content inspection.
- Database and log inspection for plaintext content, keys, secrets, cookies, OAuth codes, and invitation tokens.
- XSS and unsafe interpolation through encrypted fields after client decryption.
- Rate-limit and resource-exhaustion behavior.
- Dependency, secret, and production-header scans.

Any authorization bypass, plaintext secret exposure, silent overwrite, reusable revoked credential, or crypto downgrade is release-blocking.

### 4.7 Performance and resilience tests

The Gate G3 small-team workload baseline is 25 members per workspace, 10,000 documents per workspace, up to 50 revisions per document, and 10 concurrently active users. Unless an endpoint contract is stricter, performance sign-off uses representative preview data and records p50/p95/max, error rate, D1 work, deployment ID, and test-runner profile.

The proposed release budgets are:

- Authenticated API reads: p95 no greater than 300 ms in Cloudflare preview, excluding OAuth-provider time.
- Authenticated API writes: p95 no greater than 500 ms in Cloudflare preview, excluding OAuth-provider time.
- Conflict compare-and-set and idempotent replay correctness: 100% under the approved concurrent/retry corpus; latency never excuses a duplicate or lost update.
- Initial collaboration-only JavaScript loaded by the personal/guest startup path: no more than 75 KiB gzip; editor, crypto, and administration modules remain lazy.
- Client decrypt and render of 100 representative documents: p95 no greater than 500 ms on the recorded reference hardware/browser profile.
- Accessibility: WCAG 2.2 AA for every collaboration workflow, with automated results supplemented by keyboard and screen-reader evidence.

Test dimensions include:

- API read and write latency under baseline concurrent workspace use.
- Member, document, revision, and audit pagination at the approved limits.
- Client decrypt and render cost for representative document batches.
- Duplicate-free behavior during retry and reconnect storms.
- Concurrent writes to the same document and different documents.
- D1 transient failures and transaction rollback.
- OAuth/provider unavailability.
- Offline use, browser reload, and service-worker update boundaries.
- Collaboration bundle and initial dashboard asset impact.

### 4.8 Accessibility tests

Target WCAG 2.2 AA for all collaboration workflows. Combine automated scanning with manual keyboard and screen-reader checks for:

- Workspace switching.
- Invitation and member management.
- Role selection and destructive confirmation.
- Key initialization and recovery messaging.
- Save, offline, conflict, and access-removed status announcements.
- Conflict-resolution dialogs and preservation of drafts.
- Visible focus, semantic labels, error association, contrast, zoom, and reduced motion.

## 5. Test environment strategy

| Environment | Purpose | Data | External dependencies | Allowed evidence |
|---|---|---|---|---|
| Node unit | Fast pure logic and characterization | In-memory deterministic fixtures | None | CI test report |
| Local Pages Functions | Handler and API development | Disposable local D1 database | Mock OAuth exchange | Integration and contract report |
| Local browser | UI and multi-context E2E | Disposable seeded local backend | Mock/test OAuth identity | Playwright report, trace, screenshots on failure |
| Cloudflare preview | Production-like bindings and headers | Dedicated preview D1, synthetic accounts only | Preview OAuth app/callback | Deployment ID, migration version, smoke and E2E report |
| Cloudflare production | Release verification | Real production data; non-destructive smoke only | Production OAuth | Deployment ID, header/API smoke, monitoring snapshot |
| GitHub Pages fallback | Personal-mode compatibility | Guest fixtures or isolated local vault only | No collaboration backend | Static fallback smoke report |

Environment rules:

1. Preview and production must never share D1 databases, OAuth credentials, session secrets, or test users.
2. Synthetic test records must be identifiable and have a cleanup policy.
3. Tests must not store real user secrets, real document content, or production exports as fixtures.
4. Production tests must be read-only or use a dedicated canary workspace with explicit cleanup.
5. OAuth callbacks, cookie origins, and CSP behavior must be tested on HTTPS preview rather than inferred from localhost.
6. Service-worker tests must prove that `/api/*` is network-only and never receives cached HTML.
7. GitHub Pages must be tested as an intentionally collaboration-incapable environment, not as a backend failover.
8. The local Functions environment uses `@cloudflare/vitest-pool-workers`, the Pages recipe, and a real disposable local D1; repository mocks do not qualify as integration evidence.
9. Preview uses a dedicated OAuth application/callback and D1 database. Production credentials, sessions, bindings, users, and origins are forbidden in preview.
10. Multi-user and multi-device Playwright journeys use isolated browser contexts and unique environment-scoped identities.

## 6. Quality risk register

| ID | Risk | Impact | Initial likelihood | Required mitigation and verification |
|---|---|---:|---:|---|
| QR-01 | Personal and workspace state are mixed | Critical | High | Explicit storage-provider boundary; isolation unit, integration, and E2E tests |
| QR-02 | Workspace IDOR or role bypass | Critical | High | Central authorization middleware; parameterized role/resource matrix |
| QR-03 | Plaintext content or keys reach D1/logs | Critical | Medium | Client-side encryption contract, allow-listed logs, DB/log scans |
| QR-04 | OAuth/session implementation permits account takeover | Critical | Medium | State, PKCE, secure opaque sessions, CSRF, negative auth suite |
| QR-05 | Member/device revocation is delayed or incomplete | High | High | Define enforcement point and key-version behavior; active/offline revocation tests |
| QR-06 | Concurrent edits silently overwrite data | High | High | Server revision compare-and-set and `409` conflict tests |
| QR-07 | Retry/reconnect creates duplicate revisions | High | High | Client mutation ID, uniqueness constraint, replay and reconnect-storm tests |
| QR-08 | Service worker caches API traffic or returns app shell | High | Medium | Network-only `/api/*` contract and offline integration tests |
| QR-09 | Cloudflare deploy runs against incompatible D1 schema | High | Medium | Versioned compatible migrations, deployment checks, restore rehearsal |
| QR-10 | GitHub Pages exposes broken collaboration UI | Medium | High | Runtime capability detection and fallback browser suite |
| QR-11 | Existing vault crypto or GitHub Sync regresses | Critical | Medium | Preserve all current encryption/storage/sync suites and add provider isolation tests |
| QR-12 | The official client copies a credential-category document, or product claims overstate what an E2EE server can inspect | Critical | Medium | Client/domain eligibility validation before encryption, absent copy controls, category-transition regression, and explicit insider/content-blindness limitation; the ciphertext-only server cannot detect an authorized user pasting secrets into an eligible encrypted document |
| QR-13 | Encrypted content becomes an XSS vector after decrypt | High | Medium | Safe rendering contract and hostile-content browser tests |
| QR-14 | Collaboration degrades dashboard/editor performance | Medium | Medium | Lazy loading, asset budgets, client decrypt/render benchmarks |
| QR-15 | Recovery design makes encrypted data permanently inaccessible | High | Medium | Explicit recovery contract, multi-device and recovery rehearsal |
| QR-16 | Test shortcuts enter production security paths | Critical | Low | Build-time inspection and prohibition of auth/encryption bypasses |

## 7. Evidence policy

### 7.1 General rules

- A passing statement must identify the command, commit SHA, environment, timestamp, and result.
- Evidence is valid only for the exact commit and deployment under review.
- Automated results must be machine-readable where the runner supports it.
- Browser failures retain trace, console errors, network failures, and screenshots.
- Security evidence must redact tokens, cookies, user content, ciphertext bodies, and personal data.
- Production sign-off must reference the Cloudflare deployment ID and D1 migration version.
- Manual checks require named tester, steps, expected result, actual result, and linked evidence.
- A retried flaky test is not a pass until the cause is classified and the gate owner accepts the evidence.
- Disabled, skipped, quarantined, or intermittently failing tests must be visible in the sign-off report.
- No runtime change may be committed under the squad workflow until the relevant QA gates pass.

### 7.2 Minimum evidence by phase

| Change type | Minimum evidence |
|---|---|
| Specification/ADR | Reviewer record, resolved comments, traceability update |
| D1 migration | Local migration report, populated-fixture result, compatibility result, backup/restore evidence |
| Auth/session | Unit, integration, negative security, cookie/header, and preview OAuth evidence |
| RBAC/membership | Complete role/action matrix plus cross-workspace negative tests |
| Encryption/key management | Fixed vectors, tamper tests, multi-device tests, DB/log plaintext scan |
| Document sync | Revision, idempotency, concurrent writer, offline/reconnect, and provider isolation evidence |
| UI | Browser E2E, accessibility, responsive states, console/network error report |
| Production release | Full CI, preview sign-off, migration version, deployment ID, production smoke, rollback readiness |

### 7.3 Defect severity and release policy

- **P0:** Active compromise, broad data loss, or production unavailable. Immediate no-go.
- **P1:** Authorization bypass, secret/plaintext exposure, silent data loss, broken recovery, or unrecoverable migration. No-go.
- **P2:** Major workflow failure with a practical workaround. Requires explicit Product and QA risk acceptance before release.
- **P3:** Limited usability or cosmetic defect. May be scheduled with documented ownership.

## 8. Stable requirement-to-contract coverage

The detailed requirement-level source is `traceability-matrix.md`. The table below uses only its stable IDs and covers every Foundation requirement, including all 58 P0/P1-sensitive requirements. `Planned` means the contract and evidence owner are fixed but runtime evidence does not yet exist.

| Stable IDs | Approved/proposed contract | Accountable evidence owners | Required evidence | Status |
|---|---|---|---|---|
| `CF-ID-001`–`004` | ADR-002 immutable GitHub subject, OAuth state/PKCE/exact callback, no retained provider credential, mode-gated bootstrap | Developer, Senior QA, Security Reviewer | U/I/A/E/S identity and callback abuse suite; provider-secret scans | Planned |
| `CF-SES-001`–`004` | ADR-002/011 opaque hashed session, 12-hour idle, 7-day absolute, 15-minute high-risk reauth, Origin plus CSRF, stable no-store errors | Developer, Senior QA, Security Reviewer | U/I/A/E/S cookie, expiry, revocation, CSRF, enumeration, cache, and log suite | Planned |
| `CF-DEV-001`–`004` | ADR-004/010 per-device P-256 keys, encrypted local private key, live revocation, truthful no-escrow/no-all-keys recovery | Developer, Senior QA, Security Reviewer, Product Owner | Crypto vectors, browser storage inspection, multi-device/revocation/loss E2E and abuse evidence | Planned |
| `CF-WS-001`–`004` | ADR-001/003/008/012 atomic owner creation, last-owner guard, lifecycle deny-closed until approved export/delete contract | Developer, Senior QA, Product Owner, Technical Lead | Transaction/fault tests, ownership races, retention and operational review | Planned; export/delete deny-closed |
| `CF-RBAC-001`–`004` | ADR-003 centralized deny-by-default workspace-scoped role policy with server-derived actor/time | Developer, Senior QA, Security Reviewer | Full role/action/resource-state API matrix and D1/audit side-effect inspection | Planned |
| `CF-INV-001`–`005` | ADR-009 identity-bound 72-hour hash-only single-use invitation and distinct `pending_key` readiness | Developer, Senior QA, Security Reviewer, UX Lead | State/race/rate/identity/replay tests and pending-key E2E | Planned |
| `CF-KEY-001`–`006` | ADR-004/010 versioned P-256 ECDH/HKDF/AES-GCM envelopes, canonical device binding, rotation and terminal-loss contract | Developer, Senior QA, Security Reviewer, Product Owner | Fixed positive/negative vectors, substitution/replay/downgrade scans, rotation/recovery drills | Planned |
| `CF-DOC-001`–`006` | ADR-005/006 encrypted semantic payload, append-only server revision/tombstone, Viewer denial, safe rendering | Developer, Senior QA, Security Reviewer, UX Lead | Encryption/tamper/DB scan, revision transaction, RBAC, XSS, tombstone and client eligibility tests | Planned |
| `CF-SYNC-001`–`005` | ADR-006 revision CAS/409, scoped idempotency, encrypted bounded seven-day outbox and quarantine | Developer, Senior QA, Security Reviewer, UX Lead | Concurrent writer, replay storm, offline lifecycle, quota/expiry/conflict/re-auth E2E | Planned |
| `CF-AUD-001`–`002` | ADR-008/011 server-derived append-only allow-list events, no bodies/secrets, 365-day baseline | Developer, Senior QA, Security Reviewer, Operations | Event completeness/atomicity, canary/redaction, access, retention and restore evidence | Planned |
| `CF-ISO-001`–`005` | ADR-007 separate providers/namespaces; explicit one-time eligible copy; guest/share/PAT isolation | Developer, Senior QA, Security Reviewer, UX Lead | Provider-routing, network/storage, regression and hostile cross-context tests | Planned |
| `CF-FB-001`–`002` | ADR-001/007/011 GitHub Pages personal/guest fallback; Cloudflare is the exact collaboration origin | Senior QA, Technical Lead, Security Reviewer | Both-origin browser/network/cookie/CSP/capability evidence | Planned |
| `CF-OPS-001`–`005` | ADR-001/008/011/012 network-only API, environment isolation, immutable expand/contract migration, feature flag, stable privacy-safe observability | Developer, Senior QA, Technical Lead, Security Reviewer, Operations | Local real-D1 integration, config isolation, migration/restore/rollback/canary and error evidence | Proposed at Gate G3 |
| `CF-NFR-001`–`004` | Day 4 workload/budgets, 75 KiB lazy-load ceiling, WCAG 2.2 AA, latest-two Chrome/Edge/Firefox and Safari 17.4+ | Senior QA, Product Owner, UX Lead, Security Reviewer, Technical Lead | Preview load/client benchmark, artifact budget, accessibility and browser matrix reports | Proposed at Gate G3 |

Credential exclusion is a client eligibility boundary, not server plaintext inspection. The official client omits copy/share controls and rejects credential-category transitions before encryption. An authorized user can still paste a secret into an eligible encrypted document; E2EE prevents the server from detecting that semantic misuse. Insider training, truthful UX, and incident response are residual controls.

## 9. Commands, environments, and evidence naming

The following command surface is the Gate G3 contract to implement before the corresponding phase can claim executable evidence. Existing `npm run check` remains the aggregate regression gate while scripts are added incrementally.

| Command contract | Environment | Evidence |
|---|---|---|
| `npm run check` | Node plus generated artifact | Existing regression, syntax, CSP, artifact, English-only, and maintainability results |
| `npm run test:collab:unit` | Node | Policy, parser, state-machine, crypto-vector, deterministic clock/ID result |
| `npm run test:collab:integration` | `@cloudflare/vitest-pool-workers` Pages recipe plus real disposable local D1 | Handler, repository, transaction, migration, audit, and fault result |
| `npm run test:collab:contract` | Local Pages Functions/D1 | Route/schema/auth/CSRF/error/cache/idempotency report |
| `npm run test:collab:e2e` | Playwright isolated contexts; local then preview | Multi-user/device browser report, trace and failure screenshots |
| `npm run test:collab:security` | Local, preview, artifact and storage inspection | Abuse matrix, canary scan, dependency/header and cross-environment result |
| `npm run test:collab:performance` | Representative Cloudflare preview plus recorded reference client | Workload, latency, correctness, bundle and decrypt/render report |
| `npm run test:collab:a11y` | Supported browser matrix | Automated WCAG scan plus linked manual keyboard/screen-reader record |
| `npm run test:collab:production-smoke` | Dedicated production canary workspace | Non-destructive health/capability/header/read-only canary report |

Evidence paths use `artifacts/qa/<commit-sha>/<environment>/<suite>/<UTC-timestamp>/`. Every suite writes `manifest.json` containing commit SHA, branch, command, runner/tool versions, environment, deployment ID where applicable, D1 migration version, start/end UTC time, result counts, skipped/quarantined count, and artifact hashes. No token, cookie, content, ciphertext body, key, invitation URL, or personal data may appear in evidence.

Gate rules:

- P0/P1 suites have zero skipped, disabled, quarantined, or accepted-flaky cases.
- A P0/P1 result without required D1/audit/log/storage side-effect inspection is incomplete.
- A retry after flaky failure is not a pass until root cause and disposition are recorded.
- Preview evidence uses its dedicated OAuth app, D1, secrets, origins, and synthetic users.
- Production evidence is non-destructive and uses an approved canary workspace; no production user data is a fixture.

## 10. Testability decision disposition

| ID | Day 4 disposition | Source | Status |
|---|---|---|---|
| TD-01 | GitHub OAuth; preview has a separate OAuth application, callback, subjects, and D1 | ADR-002, ADR-012 | Resolved |
| TD-02 | Hash-only opaque session; 12-hour idle, 7-day absolute, immediate revocation, 15-minute high-risk reauth | ADR-002 | Resolved |
| TD-03 | SameSite cookie plus exact Origin and session-bound synchronizer CSRF proof on every mutation | ADR-002, ADR-011 | Resolved |
| TD-04 | Immutable numeric GitHub subject is identity; login/email is display metadata only | ADR-002, ADR-009 | Resolved |
| TD-05 | P-256 device key, encrypted local private key, key-ready Owner/Admin provisioning, no escrow/exported recovery kit | ADR-004, ADR-010 | Resolved |
| TD-06 | Current authorization on every request; immediate server/device denial; prior downloads cannot be erased | ADR-003, ADR-010 | Resolved |
| TD-07 | Rotation on removal/compromise for future versions; explicit paused migration and historical-access limits | ADR-010 | Resolved |
| TD-08 | Versioned P-256/HKDF/AES-GCM envelope and strict encrypted/server-visible field allow-list | ADR-004, ADR-005 | Resolved |
| TD-09 | Official client rejects credential category before encryption; server cannot inspect opaque semantic content | ADR-005, ADR-007 plus Day 4 limitation | Resolved with accepted residual risk |
| TD-10 | Atomic revision CAS, stable 409, scoped fingerprinted 30-day idempotency replay | ADR-006 | Resolved |
| TD-11 | Draft retained; review latest, reapply, save copy, encrypted draft backup, or confirmed discard | ADR-006 | Resolved |
| TD-12 | Encrypted IndexedDB, environment/user/device/workspace namespace, FIFO dependency, 100 entries/25 MiB, seven-day quarantine | ADR-006, ADR-007 | Resolved |
| TD-13 | API default page 50/max 100 plus Day 4 workload baseline; route-specific body/envelope bounds stay in API schema | ADR-011 and Day 4 | Resolved for quality design; exact schemas required before route implementation |
| TD-14 | Immutable ordered expand/contract migration, dedicated step, compatibility window, recovery point, flag and restore drill | ADR-012 | Resolved |
| TD-15 | Deterministic seams only through dependency injection; production build excludes test adapters and bypasses | Day 4 quality contract | Resolved |
| TD-16 | Stable error code/request ID, allow-listed log fields, no body/secret/stack/SQL echo | ADR-008, ADR-011 | Resolved for quality design; exact catalog required before route implementation |
| TD-17 | `@cloudflare/vitest-pool-workers` Pages recipe with real disposable local D1; Playwright multi-context browser layer | Day 4 quality contract | Resolved |
| TD-18 | 25 members, 10,000 documents, 50 revisions/document, 10 active users; API/client/bundle budgets in section 4.7 | Day 4 quality contract | Approved at Gate G3 |
| TD-19 | Latest two stable Chrome, Edge, Firefox; Safari 17.4+ with fail-closed capability detection | Day 4 quality contract | Approved at Gate G3 |
| TD-20 | Dedicated synthetic production canary; non-destructive smoke, explicit cleanup, deployment/migration evidence | ADR-012 and Day 4 quality contract | Approved at Gate G3 |

## 11. Gate G3 Senior QA checklist

- [x] All 60 stable requirements retain a control, planned verification, evidence owner, and phase in the traceability matrix.
- [x] Every P0/P1 threat maps to a stable requirement, contract, owner, and required evidence family.
- [x] TD-01 through TD-20 have a decision source and honest status.
- [x] Local Functions/D1 and multi-user browser harnesses are selected without production test bypasses.
- [x] Preview/production OAuth, D1, secret, session, origin, user, and evidence isolation is explicit.
- [x] Workload, API/client/bundle budgets, browser support, and WCAG 2.2 AA target are measurable.
- [x] Credential-category prevention and the ciphertext-only server limitation are both stated accurately.
- [x] Evidence commands, naming, redaction, side-effect inspection, and production canary policy are defined.
- [x] P0/P1 evidence permits zero skips, quarantines, disabled cases, or accepted flakiness.
- [x] Product Owner approves workload, budgets, browser matrix, production canary, and accepted credential-content residual risk.
- [x] Technical Lead approves harness, command surface, preview isolation, exact API/schema contract ownership, and migration evidence.
- [x] Security Reviewer approves deterministic-seam exclusion, canary/evidence redaction, and credential limitation wording.
- [x] Senior QA records Gate G3 `PASSED`; Phase 1 remains `NO-GO` until the Phase 0 exit gate.

## 12. Day 4 conclusion

The Day 4 quality design was approved at Gate G3. Existing personal-vault, Vault V2, storage/sync, CSP, offline-shell, performance, artifact, guest, public-share, and both-deployment regressions remain mandatory. Collaboration adds a second executable evidence stack: real local Pages Functions/D1, contract/security suites, isolated multi-user Playwright, production-like preview, and a non-destructive production canary.

Gate G3 passed on 2026-07-15. Squad recommendation: `GO` to Day 5 sign-off, `NO-GO` for Phase 1 runtime implementation until the Phase 0 exit package is approved.
