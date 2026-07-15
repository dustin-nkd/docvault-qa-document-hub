# Collaboration Foundation — Domain Model and RBAC Contract

## Document control

| Field | Value |
| --- | --- |
| Document ID | CF-DOM-001 |
| Phase | Phase 0 — Specification and Threat Model |
| Sprint checkpoint | Day 2 — Domain, RBAC, and Gate G1 |
| Status | Phase 0 complete; controlled implementation authorized at Gate G4 |
| Language | English |
| Required approval | Product Owner, Technical Lead, Security Reviewer, Senior QA |

## 1. Purpose and authority

This document defines the Foundation domain objects, lifecycle rules, and server authorization policy. It refines CF-WS, CF-RBAC, CF-INV, CF-DEV, CF-KEY, CF-DOC, CF-SYNC, CF-AUD, and CF-ISO requirements without changing the product boundary.

The API is authoritative for identity, membership, authorization, server time, revision, and audit attribution. UI visibility is explanatory only. Every protected request is denied by default and re-evaluated against the current session, membership, device, workspace, and resource state.

## 2. Domain entities

| Entity | Minimum identity and relationships | Authoritative data |
| --- | --- | --- |
| User | Opaque `userId`; external identity links | Identity links and account status are server-authoritative; OAuth proves identity, not workspace authority |
| Session | Opaque session reference → User | Expiry, revocation, and security state; raw tokens are never persisted or logged |
| Workspace | Opaque `workspaceId`; one or more Memberships; key versions | Lifecycle, current key version, server timestamps; workspace name visibility remains an ADR decision |
| Membership | Unique (`workspaceId`, `userId`); role and access state | Role, `pending_key`/`active`/`removed`, server timestamps; removal is retained for audit as policy permits |
| Invitation | Workspace, intended identity, offered role, token digest | Single-use lifecycle, expiry, revocation, inviter, server timestamps; raw token is not stored or logged |
| Device | Opaque `deviceId`; belongs to one User; public key/fingerprint | Registration and revocation state; private key remains client-only |
| KeyEnvelope | Workspace key version → one target User/Device | Ciphertext plus authenticated workspace, target, fingerprint, algorithm, and version bindings |
| SharedDocument | Opaque `documentId`; belongs to one Workspace | Current authoritative revision and active/tombstoned state; protected fields remain encrypted |
| DocumentRevision | Append-only (`documentId`, `revision`) | Ciphertext envelope, key version, mutation reference, server actor/time, and tombstone marker |
| ClientMutation | Unique idempotency key bound to actor, device, workspace, and operation | Result/replay record; client actor, role, workspace authority, and time are never trusted |
| AuditEvent | Ordered event ID; actor, workspace, action, target reference | Server actor/time and allow-listed metadata only; never content, ciphertext bodies, tokens, or keys |
| OutboxEntry | Client-local mutation bound to account/device/workspace/key/base revision | Encrypted payload and minimum routing metadata; quarantined when its authority context changes |

## 3. Global invariants

1. A workspace has at least one valid Owner at all times; creation of workspace, Owner membership, initial key version, and creation audit event is atomic.
2. Membership is unique per user and workspace. A role never grants authority outside that workspace.
3. Personal Vault, Guest, public sharing, GitHub Sync, and Collaboration are separate providers and security contexts. No personal document is uploaded or linked automatically.
4. Credential documents are ineligible for collaboration through create, copy, import, batch, and category-change paths.
5. The server stores no plaintext protected document fields, plaintext workspace key, device private key, personal vault password, GitHub PAT, or raw session/invitation token.
6. A workspace key is a fresh random 256-bit client-generated key. The server stores only versioned, target-device envelopes and never unwraps or invents workspace key material.
7. A role grant and cryptographic readiness are independent. `pending_key` cannot be treated as readable access.
8. Every envelope is bound to the workspace, target user/device, canonical public-key fingerprint, allow-listed algorithm, and key version. Substitution, downgrade, and replay are rejected.
9. Shared writes use server revision compare-and-set, not client timestamps. Each accepted business mutation creates exactly one append-only revision and its attributable audit result.
10. Prior revisions are immutable. Delete creates a revisioned tombstone; physical deletion follows the approved retention policy.
11. Role change, membership removal, session revocation, and device revocation apply on the next request. Queued work is re-authorized when submitted.
12. Removing access prevents future service access and key delivery but cannot erase plaintext or keys already copied by a formerly authorized user.
13. Cross-workspace, missing, deleted, malformed, and unauthorized resource references receive privacy-safe, non-enumerating failures and no domain side effects.
14. Active context is explicit. Switching account, mode, or workspace clears incompatible plaintext, unwrapped keys, search state, and quarantines incompatible outbox entries.

## 4. State machines

Transitions not listed are invalid and must fail atomically without business side effects.

### 4.1 Workspace

`creating → active → deletion_pending → deleted`

- `creating → active`: authenticated creator, Owner membership, initial key version, and audit event commit together.
- `active → deletion_pending`: Owner only, strong confirmation; export, retention, grace period, and recovery behavior must be approved first.
- `deletion_pending → active`: Owner cancellation during an approved grace period, if policy permits.
- `deletion_pending → deleted`: retention job under the approved policy; tombstone/audit evidence retained as approved.
- A failed creation leaves no workspace or partial ownership/key records.

### 4.2 Membership

`absent → pending_key → active → removed`

- `absent → pending_key`: atomic acceptance of a valid invitation, or workspace creation before the initial device envelope commits.
- `pending_key → active`: at least one active device has a valid envelope for the current required key version.
- `active → pending_key`: only under an approved rotation/recovery rule when no active device has a usable required envelope.
- `pending_key|active → removed`: authorized removal; future resource access and envelope delivery stop immediately.
- Rejoining after removal requires a new invitation and creates a new authorization episode; it does not revive old queued authority.
- Role is `Owner`, `Admin`, `Editor`, or `Viewer` while pending/active. `removed` is an access state, not a role.

### 4.3 Invitation

`pending → accepted | revoked | expired`

- Creation requires an authorized inviter, allowed offered role, intended-identity binding, unpredictable token digest, server expiry, and audit event.
- `pending → accepted` is single-use and atomic with membership creation/reactivation rules. Acceptance by the wrong identity, after expiry/revocation, or twice is denied.
- `pending → revoked` requires authorized workspace administration.
- `pending → expired` uses authoritative server time.
- All terminal states are immutable; resend creates a new invitation/token.

### 4.4 Device and key readiness

Device lifecycle: `registering → active → revoked`.

Per-workspace device readiness: `not_entitled → pending_key → key_ready → stale_key | revoked`.

- Registration binds a validated public key and fingerprint to the authenticated User and opaque Device.
- Accepted membership makes an active device `pending_key`; invitation acceptance alone does not deliver a key.
- `pending_key|stale_key → key_ready`: a currently authorized, key-ready provisioning device wraps the workspace key to the server-returned canonical target key; the server validates all bindings before storing the envelope.
- `key_ready → stale_key`: a newer mandatory key version becomes current and no valid envelope for that device exists.
- Any device state → `revoked`: revocation is terminal and blocks device-bound operations and future envelopes immediately.
- Another authorized key-ready device may retry provisioning. If no such device or approved recovery artifact exists, show the documented recovery/unrecoverable state; the server has no plaintext recovery path.

### 4.5 Shared document and mutation

Document lifecycle: `absent → active → tombstoned`.

Mutation lifecycle: `draft → queued → submitting → applied | conflict | rejected | quarantined`.

- Create is allowed only for an eligible encrypted payload and produces revision 1.
- Update/delete requires `baseRevision == currentRevision`; success increments revision once.
- Delete appends a tombstone revision. A stale client cannot resurrect it through update.
- A stale base revision returns stable conflict semantics (normally `409`), preserves the local draft, and does not change document, revision, or business audit state.
- Replay of the same bound client mutation ID returns the original deterministic result and creates no duplicate revision/audit event.
- Offline entries remain visibly pending. Account, workspace, role, membership, device, or key changes cause re-authorization and rejection/quarantine when incompatible.
- Conflict resolution may review latest, retain the draft, or create a separately authorized copy; it never silently overwrites.

## 5. RBAC policy

Legend: **A** = allow when all state/resource/key gates pass; **D** = deny. Owner/Admin/Editor/Viewer below mean active membership. A `pending_key` principal may use only non-content membership, device, invitation-acceptance, and provisioning-recovery operations needed to become ready.

| Action | Owner | Admin | Editor | Viewer | Removed | Guest / unauthenticated |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| Read workspace summary | A | A | A | A | D | D |
| List/read eligible encrypted documents | A | A | A | A | D | D |
| Read document revision history | A | A | A | A | D | D |
| Create/update/delete eligible document | A | A | A | D | D | D |
| Copy eligible personal document into workspace | A | A | A | D | D | D |
| List members | A | A | A | A | D | D |
| Create invitation for Editor/Viewer | A | A | D | D | D | D |
| Create invitation for Admin | A | D | D | D | D | D |
| List pending invitations | A | A | D | D | D | D |
| Revoke Editor/Viewer invitation | A | A | D | D | D | D |
| Revoke Admin invitation | A | D | D | D | D | D |
| Change Editor ↔ Viewer | A | A | D | D | D | D |
| Grant/revoke Admin | A | D | D | D | D | D |
| Transfer ownership | A | D | D | D | D | D |
| Remove Editor/Viewer | A | A | D | D | D | D |
| Remove Admin | A | D | D | D | D | D |
| Remove Owner / last Owner | D | D | D | D | D | D |
| Register or revoke own device | A | A | A | A | D | D |
| Revoke another member's device | A | A¹ | D | D | D | D |
| Provision envelope for another device | A² | A² | D | D | D | D |
| View audit events | A | A | D | D | D | D |
| Export workspace | A³ | D | D | D | D | D |
| Request workspace deletion | A³ | D | D | D | D | D |

1. Admin may revoke devices belonging to Editors/Viewers, not an Owner or another Admin.
2. The acting device must itself be active and key-ready; the target must be an active member's active device. Provisioning conveys no role-management authority.
3. Allowed only after export/deletion format, retention, recovery, audit, and strong-confirmation contracts are approved. Until then the endpoint is deny-closed.

Additional policy rules:

- Ownership changes use an explicit transfer, not removal or ordinary role update. Transfer atomically promotes the target and demotes the prior Owner only if at least one Owner remains.
- Admin cannot grant a role equal to or above Admin, modify an Owner/Admin, or exceed the inviter's role ceiling.
- An invitee can read only minimal privacy-safe invitation context before acceptance and cannot access workspace documents or envelopes.
- A user may revoke their own device, but cannot use a revoked device to issue the request.
- Public-share possession, GitHub identity/provider authority, a client-supplied role, and a personal master password grant no workspace permission.

## 6. Explicitly invalid transitions and operations

- Create a workspace without atomically creating its Owner, initial key version, and audit event.
- Downgrade/remove the last Owner; Admin self-promotion; direct Owner assignment; concurrent transfers that produce zero Owners.
- Accept a mismatched, expired, revoked, already accepted, or concurrently consumed invitation.
- Move a terminal invitation back to pending or change its target/role after issue.
- Treat invitation acceptance or `pending_key` as decrypt-ready; fetch protected content or mutate documents before current-device readiness.
- Provision from a pending-key, stale-key, removed, or revoked principal/device; wrap to a substituted key; reuse an envelope across workspace/device/version/algorithm.
- Reactivate a revoked device or removed membership in place.
- Mutate across workspaces, trust forged actor/role/workspace/device/time fields, or reveal whether an unauthorized object exists.
- Update/delete with a stale base revision; reuse a mutation ID for different input; rewrite a prior revision; update a tombstone as if active.
- Create or import a credential document; automatically migrate or continuously link a Personal Vault document.
- Submit queued work after logout, account/workspace switch, removal, device revocation, or incompatible key rotation without fresh authorization.
- Claim that removal/revocation erases previously downloaded plaintext.

## 7. Journey acceptance contract

| Journey | Acceptance evidence |
| --- | --- |
| J1 — Sign in/device initialization | Stable user/session and independently revocable device are established; Personal Vault is unchanged and context is explicit |
| J2 — Create workspace | Atomic workspace/Owner/key-version/audit creation; creating device becomes key-ready; no plaintext key reaches server |
| J3 — Invite/onboard | Role-bound invitation accepts once for intended identity; membership may visibly remain `pending_key`; valid bound envelope advances readiness |
| J4 — Create/read | Editor produces encrypted revision 1; key-ready Viewer decrypts and direct Viewer mutations are denied with no side effects |
| J5 — Conflict | Two writes from one base yield one success and one conflict; losing draft remains recoverable; no silent overwrite |
| J6 — Offline recovery | Encrypted pending mutation survives supported reload; retry with original ID applies at most once or returns conflict |
| J7 — Revoke/change access | Next request reflects new role/removal/device state; no future envelope; attributable audit event; limitation on prior copies is stated |
| J8 — Personal copy | Explicit confirmation, selected workspace, eligibility check, new ID/key/revision; personal source unchanged and unlinked |
| J9 — Static fallback | GitHub Pages exposes personal/guest only, makes no collaboration background calls, and links to canonical Cloudflare origin |

For every journey, tests verify response and side effects across own-workspace, cross-workspace, nonexistent, deleted, malformed, forged-field, and replay variants as applicable. P0/P1 cases cannot be skipped or quarantined as passing evidence.

## 8. Open decisions

| Decision | Owner(s) | Blocking effect |
| --- | --- | --- |
| Invitation delivery channel, duplicate-pending behavior, privacy UX, and retention | Product Owner, Security Reviewer, UX Lead | Final invitation/API contract; identity binding, 72-hour expiry, token lifecycle, and role ceilings are accepted in ADR-009 |
| Session lifetime, renewal, security revocation, re-authentication, and CSRF | Security Reviewer, Product Owner | Identity and all mutations |
| Device-key algorithm, private-key protection, canonical fingerprint, recovery artifact | Security Reviewer, Product Owner | Device/envelope implementation |
| Key rotation triggers, completion, historical revision access, and offline-device treatment | Security Reviewer, Product Owner, UX Lead | Revocation and key-version states |
| Exact encrypted/server-visible metadata, envelope schema, bounds, and AAD fields | Security Reviewer, Product Owner | Document/key persistence |
| Workspace deletion/export format, confirmation, retention, tombstone, restore, and audit | Product Owner, Technical Lead, Security Reviewer | RBAC rows marked footnote 3 and GA |
| Revision/tombstone/invitation/session/audit/account retention periods | Product Owner, Technical Lead | Data lifecycle and deletion |
| Outbox ordering, quota, expiry, conflict UX, and quarantine/account-switch behavior | Product Owner, UX Lead, Senior QA | Offline implementation |
| Workload limits, pagination, browser matrix, and accessibility/performance thresholds | Product Owner, Senior QA | Release criteria |

## 9. Gate G1 — Domain and authorization readiness

Current assessment: **Gate G1 PASSED, its Phase 0 dependencies were resolved through Gates G2/G3, and Gate G4 authorizes controlled implementation.** Executable implementation/release evidence remains assigned to later phase gates.

Gate G1 passes only when:

- [x] Domain entities, ownership, trust authority, and provider isolation are explicit.
- [x] Workspace, membership, invitation, device/readiness, and document/mutation transitions are testable.
- [x] Owner, Admin, Editor, Viewer, removed, Guest, and unauthenticated authorization states are parameterized.
- [x] Last-Owner, pending-key, invitation replay, envelope substitution, stale write, idempotent replay, and queued-authority failures are explicit.
- [x] J1–J9 have measurable acceptance contracts.
- [x] Product Owner approves the role matrix and Admin ceilings in ADR-003.
- [x] Security Reviewer validates the authorization and non-enumeration contract.
- [x] Footnoted export/deletion permissions remain deny-closed and every Foundation lifecycle/security decision is resolved in the owning ADR/specification.
- [x] Device-key, envelope, recovery, rotation, encrypted metadata, session, and CSRF contracts are approved.
- [x] Deterministic test seams, local Functions/D1 runner, preview/production isolation, migration/restore, and outbox contracts are specified for executable implementation.
- [x] The traceability matrix is updated with approved decisions and evidence references; no P0/P1 requirement lacks measurable planned verification.

This gate does not authorize production code. Any later change to these states or permissions requires corresponding requirement, threat, test, and audit-contract updates.
