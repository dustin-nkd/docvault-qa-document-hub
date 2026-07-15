# Collaboration Foundation Requirement–Risk–Test Traceability Matrix

**Document ID:** CF-QA-TRACE-001

**Phase:** Phase 0 — Specification and Threat Model

**Sprint checkpoint:** Day 4 — Quality architecture and Gate G3 readiness

**Status:** Phase 0 complete; Gate G4-approved implementation traceability baseline

**Owner:** Senior QA

**Required reviewers:** Product Owner, Technical Lead, Security Reviewer, UX Lead

**Last updated:** 2026-07-15

## 1. Purpose and authority

This document is the authoritative Phase 0 mapping between Collaboration Foundation product journeys, domain rules, quality and security risks, controls, planned verification, evidence ownership, and implementation phases.

Requirement IDs in this document are stable. Future specifications, ADRs, API contracts, test cases, defects, commits, and release evidence must reference these IDs rather than creating replacement identifiers. A requirement may be refined, but its ID must not be reused for a different obligation.

No requirement is Ready for implementation until:

- Its intended behavior and failure behavior are measurable.
- Its security or reliability control is identified.
- At least one appropriate verification level is assigned.
- An evidence owner and implementation phase are assigned.
- Any blocking open decision is resolved or explicitly recorded as accepted risk by the correct authority.

## 2. Identifier and test-level conventions

### 2.1 Requirement domains

| Prefix | Domain |
|---|---|
| `CF-ID` | External identity and sign-in |
| `CF-SES` | Sessions, CSRF, and logout |
| `CF-DEV` | Devices and private-key lifecycle |
| `CF-WS` | Workspace lifecycle and ownership |
| `CF-RBAC` | Membership and authorization |
| `CF-INV` | Invitations |
| `CF-KEY` | Workspace keys and cryptographic envelopes |
| `CF-DOC` | Shared documents and revisions |
| `CF-SYNC` | Offline outbox, retries, and conflicts |
| `CF-AUD` | Auditability and privacy-safe operations |
| `CF-ISO` | Personal, guest, public-share, and provider isolation |
| `CF-FB` | Static fallback behavior |
| `CF-OPS` | Deployment, migration, rollback, and observability |
| `CF-NFR` | Performance, accessibility, compatibility, and capacity |

### 2.2 Planned verification abbreviations

| Code | Level | Required evidence form |
|---|---|---|
| `U` | Unit | Machine-readable test result for pure policy, parser, state, or calculation |
| `I` | Integration | Actual Pages Functions handler plus isolated local D1; OAuth exchange may be mocked |
| `A` | API contract | Route, schema, status, authorization, error, caching, and idempotency assertions |
| `E` | Browser E2E | Playwright report; multi-user/device cases use isolated browser contexts |
| `S` | Security | Negative/abuse test, sensitive-data inspection, or security-tool evidence |
| `P` | Performance/resilience | Workload, latency, failure-injection, reconnect, or client render evidence |
| `X` | Accessibility | Automated scan plus manual keyboard/screen-reader evidence |
| `O` | Operational | Migration, backup/restore, deployment, feature-flag, monitoring, or rollback rehearsal |

### 2.3 Evidence owners

| Owner | Accountable evidence |
|---|---|
| Developer | Unit and integration implementation evidence, API schemas, migration execution details |
| Senior QA | Test design, automated regression, E2E, traceability, defect disposition, release sign-off |
| Security Reviewer | Threat/control approval, abuse coverage, crypto/auth review, residual security risk |
| UX Lead | Interaction states, conflict/draft recovery, accessibility manual evidence |
| Technical Lead | Architecture invariants, deployment compatibility, operational controls |
| Product Owner | Scope, role policy, accepted limitations, measurable success criteria, residual product risk |

### 2.4 Stable threat identifiers

The canonical threat identifiers are `T01` through `T23` in `threat-model.md`. That register provides the reverse mapping from each stable threat to the requirement and abuse-case IDs in this matrix. The descriptive threat/failure column below remains useful test context; it does not replace the canonical threat IDs. Any new or split threat must update both documents in the same review.

## 3. Master traceability matrix

In legacy rows below, `Draft` means the runtime/evidence has not yet been implemented; the requirement and measurable control are part of the Gate G3-approved contract baseline. Day 5 does not treat those rows as open product or architecture decisions.

### 3.1 Identity, sessions, and devices

| Requirement ID | Journey / domain rule | Threat or failure | Required control / measurable contract | Planned tests | Evidence owner | Phase | Status |
|---|---|---|---|---|---|---:|---|
| CF-ID-001 | J1: Collaboration uses an attributable external identity; a local vault password is not identity | Identity confusion, duplicate users, or a shared password authorizes team data | Use the immutable provider subject as the unique identity key; username/email changes cannot create a second authorization identity | U: claim normalization; I/A: callback identity upsert; S: changed username/email and subject collision | Developer, Senior QA, Security Reviewer | 3 | ADR-002 approved; verification planned |
| CF-ID-002 | J1: OAuth sign-in is bound to the initiating browser transaction | Login CSRF, callback tampering, authorization-code interception or replay | Exact redirect URI, unpredictable single-use state, PKCE, short transaction lifetime, and one-time code handling | U: state lifecycle; I/A: valid callback; S: missing/wrong/reused/expired state, wrong verifier, code replay, callback-origin tampering | Developer, Senior QA, Security Reviewer | 3 | ADR-002 approved; Day 4 harness proposed |
| CF-ID-003 | Identity establishment must not retain unnecessary provider credentials | OAuth code/token leaks through D1, logs, error responses, or build output | Provider code/token exists only for exchange/identity lookup unless an approved ADR requires storage; allow-listed logging and secret scan | I: inspect persisted records; A: sanitized failures; S: D1/log/build scan | Security Reviewer, Senior QA | 3 | Draft |
| CF-ID-004 | Guest and public-share views never start collaboration authentication | Guest trace, surprise redirect, or public-share identity coupling | Collaboration bootstrap is capability- and mode-gated before session/OAuth calls | U: bootstrap decision; E: guest and share URL network/storage inspection | Senior QA | 3, 7 | Draft |
| CF-SES-001 | J1/J7: Successful sign-in creates a revocable server-side session | Session theft, raw-token exposure, or client-forged identity | High-entropy opaque token in `HttpOnly; Secure; SameSite=Lax` cookie; only a token hash is stored; actor is derived server-side | U: cookie/session policy; I/A: session lookup; S: raw token absent from D1/logs and actor spoof ignored | Developer, Senior QA, Security Reviewer | 3 | ADR-002 approved; verification planned |
| CF-SES-002 | Logout, expiry, security events, and access removal invalidate subsequent protected requests | Old cookie remains usable or authorization is cached beyond revocation | Server checks live session and membership for every protected request; documented idle/absolute expiry and revocation events | U: expiry clock boundaries; I/A: logout/revoke/expiry; E/S: replay old cookie after each event | Senior QA, Security Reviewer | 3, 4 | ADR-002/003/010 approved; verification planned |
| CF-SES-003 | Every state-changing request is protected from cross-site request forgery | Attacker causes invite, role, document, or ownership mutations | Approved same-origin and CSRF contract applied centrally to every mutation route | U: middleware decision; A/S: missing/wrong/replayed proof, hostile Origin/Referer, safe-method behavior | Developer, Senior QA, Security Reviewer | 3 | ADR-002/011 approved; verification planned |
| CF-SES-004 | Authentication failures are non-enumerating, non-cacheable, and sanitized | Account discovery, secret leakage, or private response caching | Stable error codes; no stack/SQL/provider detail; `Cache-Control: no-store`; request ID present | A: status/error/header matrix; S: account-enumeration comparison and sensitive-string scan | Senior QA, Security Reviewer | 3 | ADR-011 approved; exact error catalog proposed for route contract |
| CF-DEV-001 | J1: Each collaboration device has an independently attributable key identity | One shared key prevents device-level revocation or allows device spoofing | Device public key is validated and bound server-side to authenticated user and opaque device ID | U: key/JWK validation; I/A: registration and ownership; S: malformed key, actor/device spoof, cross-user device ID | Developer, Senior QA, Security Reviewer | 5 | ADR-004 approved; browser matrix proposed at Gate G3 |
| CF-DEV-002 | Device private keys remain browser-only and encrypted at rest | Server/operator or local storage inspection reveals a private key | Approved local protection mechanism; no plaintext private key in D1, logs, local persistent storage, export, or telemetry | U: envelope parser; E/S: storage inspection while locked/unlocked, D1/log scan, wrong-unlock-secret test | Security Reviewer, Senior QA | 5 | ADR-004 approved; verification planned |
| CF-DEV-003 | J7: Device revocation immediately blocks device-authenticated operations and future key delivery | Revoked device continues writes or receives new key versions | Server-authoritative revoked state checked on each device-bound request; no future envelope creation for revoked device | I/A: revoke then request; E/S: active and offline device replay, pending mutation after revoke | Senior QA, Security Reviewer | 5, 6 | ADR-010 approved; verification planned |
| CF-DEV-004 | Lost-device/all-keys recovery behavior is explicit and testable | Users permanently lose data unexpectedly or server gains plaintext recovery capability | Another active key-ready Owner/Admin device is the only Foundation recovery path; no escrow or exported key-recovery artifact; terminal loss is stated accurately | U: recovery-state policy; E/S: alternate provisioner, no provisioner, revoked user, terminal-loss messaging | Product Owner, Security Reviewer, Senior QA | 5 | ADR-010 approved; verification planned |

### 3.2 Workspaces, membership, roles, and invitations

| Requirement ID | Journey / domain rule | Threat or failure | Required control / measurable contract | Planned tests | Evidence owner | Phase | Status |
|---|---|---|---|---|---|---:|---|
| CF-WS-001 | J2: Authenticated user creates a workspace and atomically becomes its Owner | Ownerless or partially created workspace | Workspace, Owner membership, initial key version, and audit event are created atomically or not at all | U: transition validation; I/A: transaction success/failure injection; E: first-workspace journey | Developer, Senior QA | 4, 5 | Draft |
| CF-WS-002 | J2: Workspace context is explicit and cannot alter Personal Vault context | Data saved to the wrong provider or stale workspace state shown | Active mode and workspace are explicit inputs to storage/actions; switching clears incompatible decrypted/search/cache state | U: provider routing; I/E: create/edit/switch/reload/logout isolation | Developer, Senior QA, UX Lead | 6, 7 | Draft |
| CF-WS-003 | A workspace must always have at least one valid Owner | Removal or role change leaves data ungoverned | Last-Owner downgrade/removal/delete is rejected atomically; ownership transfer follows approved strong confirmation | U: policy; I/A: last-owner and concurrent transfer; E/S: direct API and race attempts | Product Owner, Senior QA, Security Reviewer | 4 | ADR-003 approved; verification planned |
| CF-WS-004 | Workspace deletion, export, and retention behavior is explicit before general availability | Irreversible loss, privacy violation, or unaudited exfiltration | Approved role, confirmation, retention/tombstone, export encryption, audit, and recovery contracts | U/I/A/E/O according to approved contract | Product Owner, Technical Lead, Senior QA, Security Reviewer | 4, 8, 9 | Retention baseline approved; export/delete remain deny-closed pending separate contract |
| CF-RBAC-001 | Every workspace resource is scoped by authenticated membership | IDOR reveals or mutates another workspace | Deny-by-default centralized authorization; queries bind resource and membership to the same workspace; non-disclosing denial | U: policy matrix; I/A: cross-workspace IDs on every route; S: IDOR fuzz set | Developer, Senior QA, Security Reviewer | 4–8 | Draft |
| CF-RBAC-002 | Owner/Admin/Editor/Viewer capabilities follow the approved role/action matrix | Privilege escalation or inconsistent endpoint policy | One server policy source; UI state derives from but does not replace server authorization | U: parameterized matrix; A: direct calls for every role/action; E: visible states; S: role tampering | Product Owner, Senior QA, Security Reviewer | 4–8 | Approved at Gate G1 |
| CF-RBAC-003 | J7: Role change/removal is effective on the next request and auditable | Cached role or queued request retains authority | Live membership check; pending operations re-authorize; role/removal audit event uses server actor/time | I/A: change then immediate request; E/S: active/offline tabs, queued writes, stale UI | Senior QA, Security Reviewer | 4, 6 | ADR-003/006/010 approved; verification planned |
| CF-RBAC-004 | Client-supplied actor, role, membership, owner, and timestamps are ignored | Forged request attributes create privilege or false audit attribution | Server derives actor/role/workspace authorization and authoritative timestamps | U: normalization; I/A/S: submit forged fields and verify stored/audited values | Developer, Senior QA, Security Reviewer | 4 | Draft |
| CF-INV-001 | J3: Owner or authorized Admin creates a role-bound, expiring, revocable invitation | Unauthorized inviter, excessive role, or indefinite bearer access | Authorization at creation; approved role ceiling; hashed unpredictable token; server expiry; creation audit | U: policy/expiry; I/A: role and persistence; S: raw-token scan and unauthorized inviter | Developer, Senior QA, Security Reviewer | 4 | ADR-003/009 approved; verification planned |
| CF-INV-002 | J3: Only the intended authenticated identity can accept an invitation once | Token theft, identity mismatch, reuse, or concurrent double membership | Invitation identity binding, atomic single-use transition, expiry/revocation check, unique membership constraint | I/A: valid accept; S: wrong identity, expired, revoked, reused, concurrent acceptance | Senior QA, Security Reviewer | 4 | ADR-009 approved; verification planned |
| CF-INV-003 | Invitee cannot read workspace documents or key envelopes before acceptance completes | Invitation token becomes premature membership or document access | Invitation lookup reveals minimum context; only a validated, atomic acceptance may create membership; document/key routes still enforce membership and key-readiness state | I/A/S: pre-accept resource and envelope attempts, acceptance transaction failure injection | Senior QA, Security Reviewer | 4, 5 | Draft |
| CF-INV-004 | Invitation errors and delivery do not enumerate private membership information | Username/email or workspace enumeration | Privacy-safe responses, rate limiting, approved invitation addressing and delivery channel | A/S: response comparison, brute-force/rate test, log inspection | Product Owner, Security Reviewer, Senior QA | 4 | ADR-009/011 approved; exact route limits proposed before implementation |
| CF-INV-005 | J3: Successful invitation acceptance and usable cryptographic access are distinct states | Accepted member is treated as able to decrypt before an authorized device receives an envelope, or a provisioning outage leaves ambiguous access | Acceptance creates an explicit `pending_key` membership/device state when no valid envelope exists; UI/API report key readiness separately; pending-key members cannot fetch protected ciphertext as usable workspace content or perform document mutations | U: membership/key-readiness state machine; I/A: accept without envelope and later provision; E: pending-key UI then ready transition; S: direct document/mutation calls while pending | Product Owner, Senior QA, Security Reviewer, UX Lead | 4, 5, 7 | Draft |

### 3.3 Keys, encrypted documents, conflicts, and offline synchronization

| Requirement ID | Journey / domain rule | Threat or failure | Required control / measurable contract | Planned tests | Evidence owner | Phase | Status |
|---|---|---|---|---|---|---:|---|
| CF-KEY-001 | J2/J3: Workspace data-encryption key is generated on an authorized client and never reaches the server as plaintext | Backend/operator compromise reveals all workspace content | Fresh random 256-bit key; only versioned per-device envelopes stored remotely; no plaintext fallback | U: fixed envelope vectors; I: persisted record inspection; E: multi-device round trip; S: D1/log/telemetry scan | Security Reviewer, Senior QA | 5 | ADR-004 approved; verification planned |
| CF-KEY-002 | A key envelope is authenticated to workspace, device, algorithm, and key version | Envelope substitution, replay, downgrade, or cross-workspace unwrap | Versioned allow-listed algorithm; authenticated binding fields; strict size/format bounds | U: valid vectors and every tamper dimension; I/A/S: wrong workspace/device/version, downgrade, replay, oversized envelope | Developer, Senior QA, Security Reviewer | 5 | ADR-004/010 approved; browser matrix proposed at Gate G3 |
| CF-KEY-003 | J3: Only an accepted, active member's active device receives a workspace-key envelope | Key distribution bypasses membership or revocation | Server checks membership, invitation state, device ownership, device status, and key version on every envelope operation | I/A/S: invitee-before-accept, removed member, revoked device, cross-user device, forged version | Senior QA, Security Reviewer | 5 | Draft |
| CF-KEY-004 | J7: Rotation and historical revision behavior are defined without claiming remote erasure | Old member receives new material, or authorized users lose all historical access | Approved rotation trigger/completion state; future-key exclusion; explicit treatment of historical revisions and offline devices | U/I/E/S against approved rotation state machine | Product Owner, Security Reviewer, Senior QA | 5, 6 | ADR-010 approved; verification planned |
| CF-KEY-005 | J3: A workspace-key envelope for a new device is created only by an authorized, key-ready provisioning device and is bound to the intended registered public key | Attacker substitutes a public key, server invents key material, or unauthorized/pending member provisions another device | Server returns the canonical registered public key and fingerprint for the target active device; an authorized key-ready member device wraps client-side; submission is bound to workspace, target user/device, public-key fingerprint, algorithm, and key version; server never unwraps or generates the workspace key | U: provisioning authorization and binding parser; I/A: authorized/unauthorized wrapper and canonical-key checks; E: two-device provisioning; S: public-key substitution, forged wrapper identity, changed fingerprint, cross-workspace target | Developer, Senior QA, Security Reviewer | 5 | ADR-004/010 approved; verification planned |
| CF-KEY-006 | J3: A pending-key member cannot decrypt until a valid envelope exists, and unavailable provisioning has an explicit recovery/retry path | UI exposes ciphertext as usable content, client guesses/reuses a key, or onboarding deadlocks when the inviter/key-holding device is unavailable | Client remains locked in `pending_key`; no plaintext/decrypt path without an authenticated envelope for that device and current key version; another key-ready Owner/Admin device may provision; if none remains, product reports terminal cryptographic loss without server recovery | U: key-readiness and recovery state transitions; I/A: no-envelope, wrong/stale envelope, retry by second authorized device; E: unavailable provisioner, delayed provisioning, terminal-loss messaging; S: decrypt attempt before envelope and server-recovery bypass | Product Owner, Security Reviewer, Senior QA, UX Lead | 5, 7 | ADR-004/010 approved; verification planned |
| CF-DOC-001 | J4: Eligible shared-document protected fields are encrypted before upload | D1, logs, or operators see title/content/tags/category data | Approved encrypted-metadata boundary; authenticated versioned payload; fresh IV; no plaintext fallback | U: round trip/fresh IV/tamper; I: persisted records; E: Editor-to-Viewer; S: D1/log scan | Security Reviewer, Senior QA | 5, 6 | ADR-004/005 approved; verification planned |
| CF-DOC-002 | J4: Viewer can read authorized documents but cannot create, update, delete, or copy into workspace | UI-only enforcement permits direct mutation | Server RBAC on each mutation; read-only UI is a secondary control | U: policy; A/S: direct Viewer mutation attempts; E: read-only state | Senior QA, Security Reviewer, UX Lead | 6, 7 | ADR-003 approved; verification planned |
| CF-DOC-003 | Every successful mutation creates exactly one authoritative append-only revision and attributable audit event | History alteration, missing actor, or partial write | D1 transaction; server revision/time/actor; immutable prior revision; audit event in the same defined consistency boundary | I/A: create/update/delete and failure injection; S: forged actor/time; O: data inspection | Developer, Senior QA | 6 | Draft |
| CF-DOC-004 | The official client never offers a stored Credential document as eligible for Collaboration Foundation | Client copy/category flows expose stored credentials, or product claims imply ciphertext semantic inspection | UI/domain validation rejects Credential records before encryption for copy/import/category/batch flows; because category and content are encrypted, the API validates envelope/schema/authorization but cannot detect an authorized malicious client that labels or pastes secret content as an eligible document | U: official-client eligibility and category transitions; E: controls absent and truthful warning; S: verify no plaintext inspection path and record authorized-insider residual risk | Product Owner, Senior QA, Security Reviewer | 6, 7 | ADR-005/007 boundary and residual risk approved at Gate G3; evidence planned |
| CF-DOC-005 | Decrypted user-controlled fields render through existing safe markup/content boundaries | Ciphertext decrypts into XSS that steals plaintext keys/content | Safe rendering and action serialization; strict CSP retained; no unsafe HTML/inline handlers | U: hostile strings; E/S: stored XSS payloads across document fields; CSP regression | Developer, Senior QA, Security Reviewer | 6, 7 | Draft |
| CF-DOC-006 | Deletion uses an authoritative, revisioned tombstone until retention is approved | Deleted content reappears, history disappears unexpectedly, or old client resurrects it | Tombstone revision participates in conflict/idempotency and list filtering; physical revisions remain retained until a separately approved deletion policy | U: state; I/A: delete/retry/stale restore; E: offline old-client reconnect | Product Owner, Senior QA | 6 | ADR-006/008 approved baseline; physical purge deny-closed |
| CF-SYNC-001 | J5: Shared updates use server revision compare-and-set, never client timestamp last-write-wins | Concurrent Editor silently overwrites another | Mutation includes `baseRevision`; atomic compare-and-set; stale write returns stable `409` without changing latest revision | U: revision decision; I/A: simultaneous writers; E: two Editors; S: forged timestamp ignored | Developer, Senior QA | 6 | Draft |
| CF-SYNC-002 | J5: A conflict preserves the local draft and offers review-latest or save-as-copy | Conflict response destroys unsaved work or hides divergence | Durable draft retained until explicit resolution; UI states and actions follow approved conflict contract | U: client state; E/X: conflict journey, reload, keyboard/screen-reader; P: large draft | UX Lead, Senior QA | 6, 7 | ADR-006 approved; verification planned |
| CF-SYNC-003 | J6: Retrying a mutation with the same client mutation ID applies it at most once | Lost response or reconnect creates duplicate revisions/audit events | Server-side uniqueness and deterministic replay contract bound to actor/device/workspace/operation and request fingerprint | U: idempotency policy; I/A: sequential/concurrent replay and lost response; E/P: reconnect storm | Developer, Senior QA | 6 | ADR-006 approved; verification planned |
| CF-SYNC-004 | J6: Offline encrypted mutations survive supported reload/reconnect and remain visibly pending | Draft disappears, plaintext persists, or queued work is sent under the wrong account/workspace | Approved encrypted IndexedDB outbox, FIFO/dependency state machine, 100-entry/25 MiB quota, seven-day expiry/quarantine, explicit pending/error state | U: outbox state; E/P: offline reload, reconnect, quota, expiry, browser close | Senior QA, UX Lead | 6, 7 | ADR-006 approved; verification planned |
| CF-SYNC-005 | Account/workspace/key/access changes quarantine or reject incompatible queued mutations | Removed member or switched account replays stale authority/content | Outbox entries bind environment, user, device, workspace, base revision, key version, and client mutation ID; current authorization is checked before replay | U: compatibility decision; I/A/E/S: logout, account switch, removal, device revoke, key rotation while offline | Senior QA, Security Reviewer | 6 | ADR-006/010 approved; verification planned |

### 3.4 Audit, isolation, fallback, operations, and non-functional requirements

| Requirement ID | Journey / domain rule | Threat or failure | Required control / measurable contract | Planned tests | Evidence owner | Phase | Status |
|---|---|---|---|---|---|---:|---|
| CF-AUD-001 | J2–J8: Security-relevant actions produce attributable, ordered audit events | Missing accountability or client-forged history | Server actor/time/event type; stable ordering; allow-listed metadata; authorized audit access | U: event schema/redaction; I/A: event per action; S: actor/time spoof; E: Owner/Admin access | Senior QA, Security Reviewer | 4–8 | ADR-008 approved; verification planned |
| CF-AUD-002 | Audit and operational logs never become a second content/secret store | Plaintext title/content, ciphertext body, keys, token, cookie, OAuth code, or invitation appears in logs | Structured allow-list logging, size limits, redaction, 365-day audit baseline, 30-day terminal session/invitation/idempotency records, and access policy | U: redactor; I: emitted-field inspection; S: canary sensitive strings across success/error paths | Security Reviewer, Senior QA | 1–8 | ADR-008/011 approved; exact event/error schemas proposed before implementation |
| CF-ISO-001 | Personal Vault and Collaboration use explicit separate providers | Collaboration action mutates `DocStorage`/GitHub Sync or personal action reaches D1 | Provider interface and explicit active context; no implicit migration or synchronization link | U: routing; I/E: create/edit/delete/import/export/switch/reload; network/storage inspection | Developer, Senior QA | 6, 7 | Draft |
| CF-ISO-002 | J8: Personal-to-workspace transfer is an explicit one-time copy and leaves source unchanged | Automatic upload, hidden link, later propagation, or official-client copy of a Credential record | User confirmation, official-client eligibility validation before encryption, new ID/revision/encryption, and no source mutation/link; the ciphertext-only API cannot semantically inspect an authorized malicious client's payload | U: copy transformation/eligibility; E: confirm/cancel/copy/edit both sides and credential controls absent; S: residual-risk wording | Product Owner, Senior QA, Security Reviewer, UX Lead | 6, 7 | ADR-007 and credential residual risk approved at Gate G3; evidence planned |
| CF-ISO-003 | Existing GitHub PAT and GitHub Sync remain personal-only | PAT reaches backend or GitHub timestamp merge controls shared data | No collaboration API field accepts PAT; shared writes only use revision API; GitHub provider regression remains green | U/static: forbidden fields/dependencies; I/S: request/log scan; existing sync regression | Technical Lead, Senior QA, Security Reviewer | 1–9 | Accepted baseline |
| CF-ISO-004 | Existing public-share links remain distinct from authenticated membership | Bearer share grants workspace access or receives workspace key | Separate route/state/provider; share token/key cannot establish session, membership, or envelope access | U: capability routing; A/S: use share identifiers on workspace APIs; E: public-share regression | Senior QA, Security Reviewer | 3–9 | Draft |
| CF-ISO-005 | Guest mode remains in-memory and never calls collaboration, local vault, or GitHub Sync persistence | Demo changes pollute real data or generate real audit events | Existing guest early return preserved; collaboration disabled before storage/auth/network bootstrap | U: hydrate/persist; E: network, local/session/IndexedDB, D1/audit inspection | Senior QA | 1–9 | Draft |
| CF-FB-001 | J9: GitHub Pages is personal/guest-only and links to canonical Cloudflare collaboration origin | Broken API loops, misleading controls, or local corruption | Capability detection fails closed; no collaboration background calls; concise English explanation/link | U: capability state; E: GitHub Pages personal/guest journey and console/network assertions | Senior QA, UX Lead | 1, 7–9 | Draft |
| CF-FB-002 | Cloudflare Pages is the only Foundation collaboration origin | Sessions or data are incorrectly assumed portable across origins | Exact origin/callback/CSP policy; no collaboration cookie or local key transfer through GitHub Pages | A/S: Origin/CORS/cookie checks; E: cross-origin navigation behavior | Technical Lead, Senior QA, Security Reviewer | 1, 3 | Draft |
| CF-OPS-001 | `/api/v1/*` is network-only and never enters Service Worker app-shell caching | Private API response is cached or offline API request returns `index.html` | Explicit Service Worker bypass; private responses use `no-store`; offline request fails as API, not navigation | U: worker route logic; A: cache headers; E: online/offline/cache inspection | Developer, Senior QA, Security Reviewer | 1 | Draft |
| CF-OPS-002 | Preview and production are isolated | Preview tests or credentials affect production | Separate D1, OAuth app/callback, secrets, session namespace, allowed origins, synthetic users, and evidence namespace | O/S: binding/config review, cross-environment token/data attempts | Technical Lead, Senior QA, Security Reviewer | 1–3 | ADR-001/002/012 approved; Day 4 local/preview harness proposed at Gate G3 |
| CF-OPS-003 | Code and D1 schema deploy in a backward-compatible, recoverable order | Automatic Pages deploy runs incompatible code or corrupts data | Versioned immutable migrations, expand/contract compatibility, preflight, recovery point/restore, feature flag, canary, and rollback runbook | I: empty/populated/repeated/faulted migrations; O: old/new compatibility, restore and rollback rehearsal | Technical Lead, Developer, Senior QA | 2, 9 | ADR-012 approved; executable runbook/evidence proposed before implementation |
| CF-OPS-004 | Production can disable Collaboration without deleting shared data or breaking Personal Vault | Incident requires destructive rollback or full product outage | Server/client feature flag; non-destructive disable path; personal mode independent | U: flag routing; E/O: preview and canary disable/enable rehearsal | Technical Lead, Senior QA | 1, 9 | Draft |
| CF-OPS-005 | API errors are observable but privacy-safe | Failures cannot be diagnosed or leak internal/resource details | Request ID, stable error code, route/result/latency fields, sanitized client message, no stack/SQL/cross-workspace detail | U: mapper/redactor; A: error catalog; S: hostile/error-path scan; O: request-to-log correlation | Developer, Senior QA, Security Reviewer | 1–8 | ADR-008/011 approved; exact route error catalog proposed before implementation |
| CF-NFR-001 | Collaboration meets an approved initial workload and latency budget | Slow API or decrypt/render path makes team use unreliable | 25 members/workspace, 10,000 documents, 50 revisions/document, 10 active users; preview read p95 ≤300 ms, write p95 ≤500 ms, and decrypt/render 100 documents p95 ≤500 ms on recorded reference hardware | U/static: limits; A: pagination; P: API load and client decrypt/render; O: preview metrics | Product Owner, Senior QA, Technical Lead | 1–9 | Budget approved at Gate G3; evidence planned |
| CF-NFR-002 | Collaboration modules do not regress existing dashboard startup budget | Eager auth/editor/crypto code increases static startup cost | Feature-gated lazy loading; initial collaboration JS on personal/guest startup ≤75 KiB gzip; existing performance suites stay green | Static/U: dependency boundary; P: asset and startup comparison; E: guest/personal startup | Developer, Senior QA | 1–9 | Budget approved at Gate G3; evidence planned |
| CF-NFR-003 | Collaboration workflows meet WCAG 2.2 AA | Keyboard/screen-reader users cannot invite, manage roles, recover conflicts, or understand sync state | Semantic controls, visible focus, announced status/errors, non-color state, dialog focus management, AA contrast | X/E: automated scan plus keyboard, zoom, reduced motion, and screen-reader journeys | UX Lead, Senior QA | 7–9 | WCAG 2.2 AA contract approved at Gate G3; evidence planned |
| CF-NFR-004 | Supported browsers implement the selected crypto, storage, and session behavior consistently | Key generation/decryption or offline storage fails on a supported browser | Latest two stable Chrome, Edge, and Firefox plus Safari 17.4+; capability detection fails closed with recovery guidance | U: capability decisions; E/S: browser matrix, crypto vectors, IndexedDB and cookie behavior | Product Owner, Senior QA, Security Reviewer | 3–9 | Browser matrix approved at Gate G3; evidence planned |

## 4. Parameterized role/action verification matrix

This matrix is the minimum expected server authorization policy. Role ceilings are taken from `domain-and-rbac.md`; `Deny` must be enforced by the API even if the UI does not render the control. Key provisioning follows ADR-004/010. Workspace export and deletion remain deny-closed until their separate lifecycle contracts are approved.

| Action | Owner | Admin | Editor | Viewer | Removed / revoked | Unauthenticated / Guest | Required verification |
|---|---:|---:|---:|---:|---:|---:|---|
| Read workspace summary | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E, S |
| List/read eligible encrypted documents | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E, S |
| Create/update/delete eligible document | Allow | Allow | Allow | Deny | Deny | Deny | U, A, E, S |
| Read document revision history | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E |
| Create invitation | Allow | Allow for Editor/Viewer only | Deny | Deny | Deny | Deny | U, A, E, S |
| List/revoke invitation | Allow | Allow for Editor/Viewer invitations only | Deny | Deny | Deny | Deny | U, A, E, S |
| List members | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E |
| Change Viewer/Editor role | Allow | Allow | Deny | Deny | Deny | Deny | U, A, E, S |
| Grant/revoke Admin | Allow | Deny | Deny | Deny | Deny | Deny | U, A, S |
| Promote to Owner / transfer ownership | Allow with strong confirmation | Deny | Deny | Deny | Deny | Deny | U, A, E, S |
| Remove member | Allow except last Owner | Allow for Editor/Viewer only | Deny | Deny | Deny | Deny | U, A, E, S |
| Register own device | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E, S |
| Revoke own device | Allow | Allow | Allow | Allow | Deny | Deny | U, A, E, S |
| Revoke another member's device | Allow | Allow for Editor/Viewer devices only | Deny | Deny | Deny | Deny | U, A, E, S |
| Create workspace key envelope for another device | Allow only when acting device is key-ready | Allow only when acting device is key-ready | Deny | Deny | Deny | Deny | U, A, E, S |
| View audit events | Allow | Allow | Deny | Deny | Deny | Deny | U, A, E, S |
| Export workspace | Allow only after export contract approval | Deny | Deny | Deny | Deny | Deny | U, A, E, S, O |
| Delete workspace | Allow with strong confirmation | Deny | Deny | Deny | Deny | Deny | U, A, E, S, O |

Parameterization requirements:

1. Run each action for every role and principal state, not only one positive and one negative role.
2. Repeat each resource action with a valid resource in the caller's workspace, a valid resource in another workspace, a nonexistent opaque ID, a deleted resource, and a malformed ID.
3. Repeat mutations with forged `actorId`, `role`, `workspaceId`, `deviceId`, and client timestamp fields.
4. Verify both response and side effects: D1 rows, revisions, envelopes, audit events, logs, and outbox state.
5. Denial responses must not reveal whether an out-of-scope resource exists.
6. Treat key provisioning, export, and workspace deletion as deny-closed until their Day 3 controls are approved.

## 5. Negative abuse-case catalogue

| Abuse ID | Abuse case | Requirements covered | Expected result | Gate severity if exploitable |
|---|---|---|---|---|
| AB-01 | Reuse or swap OAuth state/PKCE verifier across browsers | CF-ID-002 | Callback rejected; no session/user mutation; sanitized audit/log | P1 |
| AB-02 | Replay a logged-out, expired, or security-revoked cookie | CF-SES-001, CF-SES-002 | `401`; no protected data or side effect | P1 |
| AB-03 | Submit a state-changing request from a hostile origin without valid CSRF proof | CF-SES-003 | Rejected before domain mutation | P1 |
| AB-04 | Replace workspace/document/member/device IDs with another workspace's valid IDs | CF-RBAC-001 | Non-disclosing denial; no side effect or audit leakage | P1 |
| AB-05 | Viewer calls create/update/delete directly | CF-RBAC-002, CF-DOC-002 | `403`/approved non-disclosing denial; no revision/audit mutation beyond denied-request telemetry | P1 |
| AB-06 | Admin promotes self to Owner or removes the last Owner | CF-WS-003, CF-RBAC-002 | Atomic rejection; ownership unchanged | P1 |
| AB-07 | Accept invitation as wrong identity, after expiry/revocation, twice, or concurrently | CF-INV-002 | No unauthorized/duplicate membership; acceptance does not itself imply key readiness | P1 |
| AB-08 | Brute-force invitation/auth/session endpoints and compare errors | CF-INV-004, CF-SES-004 | Rate limited; no account/workspace enumeration | P1/P2 by exposure |
| AB-09 | Substitute key envelope across workspace, user, device, algorithm, or version | CF-KEY-002, CF-KEY-003 | Validation/unwrap failure; no key downgrade or disclosure | P1 |
| AB-10 | Tamper with IV, ciphertext, authenticated metadata, or envelope size | CF-KEY-002, CF-DOC-001 | Authenticated decryption/validation failure; no plaintext fallback | P1 |
| AB-11 | Use the official client to copy/import/batch/category-change a stored Credential record, then attempt the equivalent with a modified authorized client and opaque ciphertext | CF-DOC-004, CF-ISO-002 | Official client rejects before encryption and exposes no copy control; API enforces authorization/envelope/schema limits but does not claim semantic inspection of encrypted category/content; authorized-insider residual risk is visible and accepted at Gate G3 | P1 for official-client bypass or plaintext inspection; accepted residual risk for undetectable authorized semantic misuse |
| AB-12 | Save two mutations with the same base revision | CF-SYNC-001 | Exactly one advances revision; loser receives `409`; no silent overwrite | P1 |
| AB-13 | Replay identical client mutation ID sequentially and concurrently after response loss | CF-SYNC-003 | One business mutation/revision/audit result only | P1 |
| AB-14 | Queue mutation, then remove member/revoke device/switch account/rotate key before reconnect | CF-DEV-003, CF-RBAC-003, CF-SYNC-005 | Mutation rejected or quarantined under approved contract; no stale authority | P1 |
| AB-15 | Inject markup/script through decrypted title, tags, content, conflict draft, member name, or error | CF-DOC-005 | Rendered safely under strict CSP; no script/action injection | P1 |
| AB-16 | Request `/api/*` offline or seed a cache entry with private response/HTML | CF-OPS-001 | API never served from app-shell cache and never receives navigation HTML | P1 |
| AB-17 | Open GitHub Pages with collaboration query/state or copied Cloudflare URL data | CF-FB-001, CF-FB-002 | Personal/guest fallback only; no loops, keys, cookies, or workspace imitation | P1/P2 by data impact |
| AB-18 | Insert sensitive canary values into every success/error path and inspect D1/logs/build artifacts | CF-ID-003, CF-SES-001, CF-DEV-002, CF-AUD-002 | No forbidden plaintext/token/key values outside authorized client boundary | P1 |
| AB-19 | Interrupt D1 transaction or deploy code against previous/next schema | CF-WS-001, CF-DOC-003, CF-OPS-003 | Atomic rollback or compatible behavior; restore path proven | P1 |
| AB-20 | Exhaust payload, pagination, invitation, session, or outbox limits | CF-INV-004, CF-NFR-001 | Bounded resource use, stable validation/rate response, no service degradation | P1/P2 by blast radius |
| AB-21 | Accept membership with no provisioning device online, then call document read/write/decrypt paths directly | CF-INV-005, CF-KEY-006 | Membership remains explicitly pending-key; no usable protected content or mutation; retry/recovery guidance is accurate | P1 |
| AB-22 | Replace the target device public key or fingerprint between lookup, wrapping, and envelope submission | CF-DEV-001, CF-KEY-002, CF-KEY-005 | Binding mismatch is rejected; attacker device cannot unwrap the workspace key; no envelope becomes ready | P1 |
| AB-23 | Pending-key, removed, or otherwise unauthorized device attempts to provision an envelope for another device | CF-KEY-003, CF-KEY-005 | Server rejects wrapper authorization; no envelope or readiness transition | P1 |
| AB-24 | Replay a valid envelope for another target device, workspace, algorithm, or key version | CF-KEY-002, CF-KEY-005, CF-KEY-006 | Binding/replay validation rejects it; pending device remains unable to decrypt | P1 |
| AB-25 | Original provisioning device is unavailable; retry from another authorized key-ready device or enter all-keys-lost recovery | CF-DEV-004, CF-KEY-005, CF-KEY-006 | Alternate authorized provisioning succeeds once; otherwise documented recovery/unrecoverable state appears without server plaintext recovery | P1 |

## 6. Severity and gating rules

| Severity | Definition for Collaboration Foundation | Gate result |
|---|---|---|
| P0 | Active compromise, broad or irreversible data loss, production-wide unavailability, or destructive unrecoverable migration | Immediate `NO-GO`; stop rollout and invoke incident/rollback procedure |
| P1 | Authorization bypass, IDOR, plaintext secret/content/key exposure, session takeover, crypto downgrade, silent lost update, duplicate business mutation, broken revocation, credential sharing, unrecoverable encrypted data, or migration without safe recovery | `NO-GO`; cannot be waived for production Foundation release |
| P2 | Major journey failure or severe accessibility/performance degradation with a practical workaround and no confidentiality/integrity loss | Requires documented Product Owner, Senior QA, and relevant Technical/Security acceptance with owner and deadline |
| P3 | Limited usability, low-impact compatibility, wording, or visual defect | May proceed only with tracked ownership and no accumulation that invalidates a success criterion |

Additional gate rules:

- Any skipped or quarantined P0/P1 traceability case counts as uncovered, not passed.
- A control described only in UI is incomplete when the server owns the trust boundary.
- A passing response assertion without verifying D1/audit/log side effects is insufficient for mutation security cases.
- Flaky tests require root-cause classification; repeated execution alone does not create valid evidence.
- Existing personal-vault, Vault V2, GitHub Sync, CSP, service-worker, performance, and browser suites remain mandatory throughout all phases.
- Security limitations such as inability to erase previously downloaded plaintext must be stated accurately in product UX and documentation.

## 7. Coverage summary

### 7.1 Requirement inventory

| Domain | Requirement count | P0/P1-sensitive requirements | Primary future phases |
|---|---:|---:|---|
| Identity | 4 | 4 | 3, 7 |
| Sessions | 4 | 4 | 3, 4 |
| Devices | 4 | 4 | 5, 6 |
| Workspaces | 4 | 4 | 4, 5, 8, 9 |
| RBAC | 4 | 4 | 4–8 |
| Invitations | 5 | 5 | 4, 5, 7 |
| Workspace keys | 6 | 6 | 5–7 |
| Shared documents | 6 | 6 | 5–7 |
| Sync/conflict | 5 | 5 | 6, 7 |
| Audit | 2 | 2 | 1–8 |
| Isolation | 5 | 5 | 1–9 |
| Fallback | 2 | 2 | 1, 3, 7–9 |
| Operations | 5 | 5 | 1–9 |
| Non-functional | 4 | 2 directly security-sensitive; all release-relevant | 1–9 |
| **Total** | **60** | **58 security/data/reliability-sensitive** | **1–9** |

### 7.2 Journey coverage

| Journey | Principal requirement coverage | Verification breadth |
|---|---|---|
| J1 — Sign-in and device initialization | CF-ID-001–004, CF-SES-001–004, CF-DEV-001–002, CF-WS-002 | U, I, A, E, S |
| J2 — Create workspace | CF-WS-001–003, CF-KEY-001, CF-AUD-001 | U, I, A, E, S |
| J3 — Invite/onboard member | CF-INV-001–005, CF-RBAC-001–004, CF-KEY-002–003, CF-KEY-005–006 | U, I, A, E, S |
| J4 — Create/read shared document | CF-DOC-001–005, CF-RBAC-001–002, CF-AUD-001 | U, I, A, E, S |
| J5 — Concurrent conflict | CF-SYNC-001–002, CF-DOC-003 | U, I, A, E, P, X |
| J6 — Offline recovery | CF-SYNC-003–005, CF-OPS-001 | U, I, A, E, S, P |
| J7 — Change/revoke access | CF-SES-002, CF-DEV-003, CF-RBAC-003, CF-KEY-004, CF-AUD-001 | U, I, A, E, S |
| J8 — Copy personal document | CF-ISO-001–003, CF-DOC-004 | U, I, A, E, S |
| J9 — Static fallback | CF-FB-001–002, CF-ISO-005, CF-OPS-001 | U, A, E, S |

Current status: the matrix provides Day 4 planned coverage, not executed collaboration evidence. Existing product regression evidence remains mandatory; no Collaboration Foundation runtime implementation exists yet.

## 8. Day 4 disposition and remaining contract work

| Gap ID | Day 4 disposition | Requirements | Status / owner |
|---|---|---|---|
| GAP-01 | G0 product boundary is approved; Day 4 quantifies the small-team workload | All | Closed; Product Owner confirms G3 budgets |
| GAP-02 | GitHub immutable-subject OAuth and a separate preview OAuth application/callback/D1 | CF-ID-001–003, CF-OPS-002 | ADR approved; preview evidence proposed, Security/Operations |
| GAP-03 | Session, expiry, reauth, revocation, Origin and CSRF contracts fixed | CF-SES-001–004, CF-WS-003 | Closed by ADR-002/011 |
| GAP-04 | Role matrix and Admin ceilings fixed; export/delete stay deny-closed | CF-WS-003–004, CF-RBAC-001–004, CF-INV-001, CF-DOC-002 | Closed by G1/ADR-003 except lifecycle contracts |
| GAP-05 | GitHub-identity-bound manual invitation delivery and privacy behavior fixed | CF-INV-001–005 | Closed by ADR-009 |
| GAP-06 | Device algorithm, private-key protection, provisioning, rotation and terminal loss fixed; browser matrix proposed | CF-DEV-001–004, CF-KEY-001–006, CF-NFR-004 | ADR approved; Product/Security approve G3 browser evidence |
| GAP-07 | Encrypted/server-visible allow-list and envelope schema fixed | CF-KEY-001–004, CF-DOC-001 | Closed by ADR-004/005 |
| GAP-08 | `pending_key`, revocation, rotation, provisioning and historical limitations fixed | CF-INV-005, CF-DEV-003, CF-RBAC-003, CF-KEY-003–006, CF-SYNC-005 | Closed by ADR-009/010 |
| GAP-09 | Conflict and encrypted outbox quota/expiry/order/quarantine fixed | CF-SYNC-002–005 | Closed by ADR-006 |
| GAP-10 | Privacy-safe observability fixed; exact per-route schema/error catalog remains a pre-implementation deliverable | CF-SES-004, CF-AUD-002, CF-OPS-005, CF-NFR-001 | Proposed at G3; Technical Lead/Security/Senior QA |
| GAP-11 | Retention, immutable expand/contract, recovery point, restore and rollback fixed; physical revision purge deny-closed | CF-WS-004, CF-DOC-006, CF-AUD-001, CF-OPS-003 | Closed baseline by ADR-008/012 |
| GAP-12 | `@cloudflare/vitest-pool-workers` Pages recipe plus real D1; deterministic seams dependency-injected and build-excluded | All I/A coverage | Proposed at G3; Technical Lead/Senior QA |
| GAP-13 | Workload, API/client/bundle budgets, WCAG 2.2 AA, and browser matrix quantified | CF-NFR-001–004 | Proposed at G3; Product/Senior QA/UX/Security |
| GAP-14 | Dedicated synthetic production canary with non-destructive smoke and cleanup | CF-OPS-004 and release evidence | Proposed at G3; Product/Technical Lead/Senior QA |
| GAP-15 | E2EE prevents server semantic validation of encrypted credential category/content | CF-DOC-004, CF-ISO-002, AB-11 | Explicit residual risk proposed at G3; Product/Security |

## 9. Gate G1 — Testability and traceability checklist

Gate G1 determines whether Phase 0 requirements are sufficiently traceable to continue detailed ADR and threat work. It does not authorize Phase 1 runtime implementation by itself.

### 9.1 Traceability completeness

- [x] Stable requirement ID taxonomy exists.
- [x] J1–J9 are mapped to stable requirement IDs.
- [x] Personal, guest, public-share, Cloudflare, and GitHub Pages boundaries are represented.
- [x] Every requirement has an identified threat/failure and required control.
- [x] Every requirement has planned verification levels and an evidence owner.
- [x] Existing regression suites remain mandatory evidence.
- [x] Negative abuse cases cover authentication, authorization, invitations, keys, documents, sync, caching, environments, and deployment.
- [x] Product Owner confirms the Day 1 scope statement and success/failure boundary at Gate G0.

### 9.2 Authorization testability

- [x] Role/action parameterization includes Owner, Admin, Editor, Viewer, removed/revoked, unauthenticated, and Guest states.
- [x] Cross-workspace, nonexistent, deleted, malformed, and forged-actor variants are required.
- [x] Product Owner approves the proposed role policy and Admin ceilings; the later RBAC ADR preserves that approved policy.
- [x] Ownership transfer, last-Owner, Admin limits, audit access, deny-closed export, and key-distribution policies are approved.

### 9.3 Security and cryptographic testability

- [x] OAuth, session, CSRF, IDOR, invitation, crypto tamper, secret scan, XSS, and revocation abuse classes are identified.
- [x] Plaintext/private-key/secret absence requires D1, log, build, browser-storage, and telemetry inspection.
- [x] Crypto verification requires fixed positive and negative vectors.
- [x] Invitation acceptance, pending-key membership, envelope provisioning, and decrypt-ready states are independently traceable.
- [x] Public-key substitution, unauthorized envelope wrapping, envelope binding/replay, and unavailable-provisioner cases are required negative coverage.
- [x] Device-key/private-key/recovery design is approved.
- [x] Encrypted-envelope fields, algorithms, bounds, and authenticated binding data are approved.
- [x] Authorized provisioning-device policy, canonical public-key/fingerprint lookup, and pending-key API/UX contract are approved.
- [x] Rotation and historical-revision access semantics are approved.

### 9.4 Reliability and operational testability

- [x] Revision conflict and idempotent replay are separately traceable.
- [x] Offline account/access/key-change abuse cases are required.
- [x] Service Worker `/api/*` exclusion is traceable.
- [x] D1 migration and compatibility rehearsal is traceable.
- [x] Outbox persistence, quota, expiry, and quarantine contracts are approved.
- [x] Migration ordering relative to Cloudflare automatic deployment is approved.
- [x] Backup/restore and production canary policies are approved.

### 9.5 Test infrastructure readiness

- [x] Unit, local Functions/D1, local browser, preview, production smoke, and GitHub Pages fallback environments are identified.
- [x] Multi-user/device browser isolation is required.
- [x] Evidence ownership and severity gates are defined.
- [x] Local Pages Functions/D1 runner and CI command are selected.
- [x] Deterministic clock, ID/token, OAuth mock, and fixture seams are approved without production bypasses.
- [ ] Preview/production D1, OAuth, secret, session, and origin isolation is configured and verifiable.
- [x] Workload, performance budgets, and supported browser matrix are approved.

### 9.6 Gate decision

**Gate G1 decision: `PASSED` for continued Phase 0 specification work; `NO-GO` for Phase 1 implementation.**

Conditions:

1. Product Owner confirmed Gate G0 scope on 2026-07-15.
2. Product Owner approved the role matrix and Admin ceilings at Gate G1 on 2026-07-15.
3. Blocking decisions listed in GAP-02 through GAP-12 must be resolved before their dependent implementation is marked Ready.
4. Each approved ADR or specification decision must update this matrix with its final contract, status, and planned evidence reference.

Senior QA marks Gate G1 Passed for Day 3 specification work. Unchecked implementation-readiness items remain mandatory for Gate G2, later Phase 0 contracts, or the Phase 0 exit gate as assigned; Gate G1 does not waive them.

## 10. Gate G3 — Quality architecture readiness

Gate G3 approves the executable quality contract, not fabricated runtime results. Phase 1 remains blocked until the required reviewers approve the proposed Day 4 choices and every route/schema implementation starts from its stable requirement IDs.

### 10.1 Contract completeness

- [x] All 60 stable requirements have measurable controls, planned verification levels, evidence owners, and phases.
- [x] Every P0/P1 threat and abuse case maps to a stable requirement and evidence family.
- [x] TD-01 through TD-20 have an ADR or Day 4 disposition.
- [x] The credential-category promise is limited honestly to official-client prevention; ciphertext semantic misuse is an explicit residual risk.
- [x] Export, workspace deletion, physical revision purge, and any other unapproved lifecycle remain deny-closed.

### 10.2 Harness and environment readiness

- [x] Local integration uses `@cloudflare/vitest-pool-workers`, the Pages recipe, and a real disposable local D1.
- [x] Multi-user/device Playwright uses isolated browser contexts.
- [x] Preview has separate OAuth, D1, secrets, session namespace, accepted origins, synthetic users, and evidence.
- [x] Deterministic clock/ID/token/OAuth/failure seams use dependency injection and are excluded from production builds.
- [x] GitHub Pages fallback, Personal Vault, guest, public share, GitHub Sync, and existing security/performance suites remain mandatory regression evidence.

### 10.3 Non-functional and evidence readiness

- [x] Workload is 25 members/workspace, 10,000 documents, 50 revisions/document, and 10 active users.
- [x] Proposed preview budgets are read p95 ≤300 ms and write p95 ≤500 ms, excluding OAuth-provider time.
- [x] Conflict and idempotent correctness is 100%; collaboration startup JS is ≤75 KiB gzip; decrypt/render 100 documents is p95 ≤500 ms on recorded reference hardware.
- [x] Browser support is latest two stable Chrome, Edge, Firefox plus Safari 17.4+; UI target is WCAG 2.2 AA.
- [x] Evidence naming, manifest fields, redaction, environment binding, and deployment/migration correlation are defined in `quality-strategy.md`.
- [x] P0/P1 evidence permits zero skip, disablement, quarantine, or accepted flakiness.
- [x] Production validation uses a dedicated synthetic canary and non-destructive smoke only.

### 10.4 Approval and decision

- [x] Product Owner approves workload, budgets, browser matrix, canary policy, and credential-content residual risk.
- [x] Technical Lead approves harness, deterministic seams, environment isolation, and exact API/schema follow-up ownership.
- [x] Security Reviewer approves threat coverage, evidence redaction, build exclusion, and credential limitation wording.
- [x] UX Lead approves WCAG 2.2 AA evidence and conflict/offline/terminal-loss journeys.
- [x] Senior QA records Gate G3 `PASSED` with reviewer record and no unowned P0/P1 contract.

**Gates G3/G4 decision: `PASSED` on 2026-07-15; controlled Phase 1 implementation is authorized and production activation remains `NO-GO`.**
