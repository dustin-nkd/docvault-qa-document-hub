# Collaboration Foundation Quality Strategy

**Status:** Day 1 draft

**Owner:** Senior QA

**Scope:** Phase 0 — Specification and threat model
**Applies to:** Collaboration Foundation only; realtime co-editing, comments, notifications, attachments, and credential sharing remain out of scope

## 1. Purpose

This document defines the quality contract that must exist before Collaboration Foundation implementation begins. It records the current regression surface, proposed test levels and environments, evidence expectations, initial risk traceability, and the unresolved testability decisions that must be closed during Phase 0.

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

Integration tests must run the actual request handlers with an isolated local D1 database:

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

Mock only external OAuth exchange endpoints. Do not mock the D1 repository in integration coverage.

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

Playwright must later use separate browser contexts for separate users and devices. Required journeys include:

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
- Database and log inspection for plaintext content, keys, secrets, cookies, OAuth codes, and invitation tokens.
- XSS and unsafe interpolation through encrypted fields after client decryption.
- Rate-limit and resource-exhaustion behavior.
- Dependency, secret, and production-header scans.

Any authorization bypass, plaintext secret exposure, silent overwrite, reusable revoked credential, or crypto downgrade is release-blocking.

### 4.7 Performance and resilience tests

The final workload profile remains a Phase 0 decision. Initial test dimensions should include:

- API read and write latency under expected concurrent workspace use.
- Large workspace/member/document pagination.
- Client decrypt and render cost for document batches.
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
| QR-12 | Credential documents are accidentally shared | Critical | Medium | Domain/API validation plus negative UI and direct-API tests |
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

## 8. Requirement–risk–test matrix scaffold

This matrix will become the authoritative traceability artifact during Phase 0. Requirement IDs are provisional until the product specification assigns stable identifiers.

| Requirement ID | Requirement | Risk/threat ID | Control/contract | Planned verification | Test level | Phase | Owner | Evidence | Status |
|---|---|---|---|---|---|---|---|---|---|
| CF-AUTH-001 | Establish GitHub identity securely | QR-04 | OAuth state, PKCE, callback allow-list | Valid and negative callback flows | Integration, E2E, security | 3 | TBD | TBD | Draft |
| CF-SESS-001 | Maintain revocable server-side session | QR-04, QR-05 | Opaque cookie token, server revocation | Expiry, logout, fixation, replay, revoke | Unit, integration, security | 3 | TBD | TBD | Draft |
| CF-WS-001 | Isolate every workspace | QR-02 | Central membership authorization | Cross-user and cross-workspace matrix | Unit, API, E2E | 4 | TBD | TBD | Draft |
| CF-RBAC-001 | Enforce Owner/Admin/Editor/Viewer permissions | QR-02 | Central role policy | All role/action combinations, direct API calls | Unit, API, E2E | 4 | TBD | TBD | Draft |
| CF-INV-001 | Invitations are expiring and single-use | QR-02, QR-04 | Hashed token and atomic state transition | Expire, revoke, reuse, concurrent accept | Integration, API, security | 4 | TBD | TBD | Draft |
| CF-KEY-001 | Server cannot recover workspace plaintext keys | QR-03, QR-15 | Client device keys and wrapped workspace key | Multi-device decrypt plus DB/log scan | Unit, integration, security | 5 | TBD | TBD | Draft |
| CF-KEY-002 | Revoked devices do not receive future keys | QR-05 | Revoked device state and key versions | Active/offline device revocation | Integration, E2E, security | 5 | TBD | TBD | Draft |
| CF-DOC-001 | Store encrypted shared documents | QR-03, QR-13 | Versioned authenticated ciphertext envelope | Round trip, tamper, malformed and hostile content | Unit, integration, E2E | 6 | TBD | TBD | Draft |
| CF-DOC-002 | Prevent silent lost updates | QR-06 | `baseRevision` compare-and-set | Simultaneous writers and stale update | Integration, API, E2E | 6 | TBD | TBD | Draft |
| CF-SYNC-001 | Retry mutations without duplication | QR-07 | `clientMutationId` and uniqueness constraint | Replay and reconnect storm | Integration, E2E, resilience | 6 | TBD | TBD | Draft |
| CF-ISO-001 | Preserve personal vault isolation | QR-01, QR-11 | Explicit storage-provider boundary | Switch, create, update, logout, reload | Unit, integration, E2E | 6 | TBD | TBD | Draft |
| CF-GUEST-001 | Keep guest mode isolated | QR-01 | Capability/auth bootstrap guard | No storage/auth/API calls in guest mode | Unit, E2E | 6–7 | TBD | TBD | Draft |
| CF-CRED-001 | Exclude credentials from workspace sharing | QR-12 | Client and server category validation | UI omission plus direct API rejection | Unit, API, E2E | 6–7 | TBD | TBD | Draft |
| CF-SW-001 | Never cache collaboration API responses | QR-08 | Network-only `/api/*` policy | Online, offline and navigation fallback tests | Unit, browser | 1–6 | TBD | TBD | Draft |
| CF-DEP-001 | Deploy compatible code and schema | QR-09 | Versioned compatible migrations and rollout gate | Migration/restore/deployment rehearsal | Integration, operational | 2–9 | TBD | TBD | Draft |
| CF-FALLBACK-001 | Keep GitHub Pages personal mode functional | QR-10, QR-11 | Capability detection and hidden collaboration UI | Static fallback browser smoke | E2E | 1–9 | TBD | TBD | Draft |

No requirement may be marked Ready for implementation until its acceptance criteria, control, planned verification, and evidence owner are populated.

## 9. Phase 0 entry gate

Phase 0 QA work may proceed when:

- Collaboration scope and non-goals are available.
- The proposed Pages Functions, D1, identity, encryption, and revision architecture is available for review.
- Product, Engineering, QA, and Security decision owners are named.
- Current Cloudflare and GitHub Pages deployment responsibilities are understood.
- Open architecture decisions are tracked rather than assumed.

## 10. Phase 0 exit gate

Phase 1 implementation must not begin until:

- Every P0/P1 product requirement has measurable acceptance criteria.
- Every P0/P1 threat has a control, owner, planned verification, and residual-risk disposition.
- The role/action matrix is complete and unambiguous.
- Authentication, session, CSRF, invitation, device, key, document, conflict, idempotency, and error contracts are approved.
- Personal, guest, public-share, offline, GitHub Sync, Cloudflare, and GitHub Pages compatibility requirements are traceable.
- Test environments and data isolation are approved.
- Migration, backup, restore, feature-flag, and rollback approaches are approved.
- Performance workload and budgets are approved.
- WCAG 2.2 AA is accepted as the collaboration UI target.
- There are no unresolved implementation-blocking testability decisions.
- Senior QA records `GO`, `GO WITH RECORDED CONDITIONS`, or `NO-GO` with evidence links.

## 11. Open testability decisions

The squad must resolve the following during Phase 0:

| ID | Decision required | Why QA needs it | Blocking |
|---|---|---|---|
| TD-01 | Exact OAuth provider contract and whether a separate preview OAuth app is used | Determines callback, identity, fixture, and preview test design | Yes |
| TD-02 | Session store, expiry, idle timeout, rotation, and immediate-revocation contract | Required for deterministic auth and revocation tests | Yes |
| TD-03 | CSRF mechanism for same-origin Pages Functions | Required to enumerate protected requests and negative cases | Yes |
| TD-04 | Stable user identity when GitHub username/email changes | Prevents duplicate or hijacked memberships | Yes |
| TD-05 | Device private-key protection and recovery mechanism | Defines recovery, multi-device, and lost-device acceptance tests | Yes |
| TD-06 | Member and device revocation semantics, including already downloaded data | Defines enforceable security claims and residual risk | Yes |
| TD-07 | Key rotation trigger, completion state, and offline-device behavior | Required for key-version compatibility tests | Yes |
| TD-08 | Exact encrypted-envelope schema and server-visible metadata | Required for crypto vectors, validation, and privacy inspection | Yes |
| TD-09 | Credential document exclusion point and category validation source | Must be enforced beyond UI | Yes |
| TD-10 | Revision and idempotency response contracts, including replay after a successful write whose response was lost | Required for duplicate-free sync tests | Yes |
| TD-11 | Conflict UX and local-draft retention behavior | Required for user-visible recovery E2E | Yes |
| TD-12 | Client storage for collaboration cache, device keys, and outbox | Determines quota, browser lifecycle, and offline testing | Yes |
| TD-13 | Data limits and pagination defaults for members, documents, revisions, and audit events | Required for validation and performance tests | Yes |
| TD-14 | D1 migration orchestration relative to Cloudflare automatic deployment | Required to prove schema/code compatibility and rollback | Yes |
| TD-15 | Test hooks for clock, UUID/token generation, and external OAuth without production bypasses | Required for reliable deterministic tests | Yes |
| TD-16 | Standard request ID, error envelope, error-code catalog, and log redaction fields | Required for contract and evidence assertions | Yes |
| TD-17 | Pages Functions local/integration harness and CI runner | Determines executable integration coverage | Yes |
| TD-18 | Expected workspace workload and measurable API/client performance budgets | Required before performance sign-off | No for Phase 1 scaffold; yes before feature release |
| TD-19 | Supported browsers and minimum versions, including Web Crypto behavior | Required for crypto and browser coverage matrix | Yes before key implementation |
| TD-20 | Production canary workspace and non-destructive smoke policy | Required for production evidence | No for Phase 1; yes before rollout |

## 12. Day 1 conclusion

The current repository has strong characterization around its static personal-vault runtime, Vault V2 migration, storage/sync resilience, strict CSP, offline shell, performance budgets, and production artifact. Collaboration introduces a new server, identity, authorization, database, key-distribution, revision, and multi-user failure domain that the existing tests do not cover.

The highest Day 1 quality priority is therefore isolation: collaboration must be introduced through explicit boundaries and contracts rather than by extending the current global persistence and timestamp-merge paths in place. Phase 0 should close the blocking decisions above and convert the matrix scaffold into complete acceptance and verification traceability before implementation starts.
