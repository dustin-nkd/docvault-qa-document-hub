# Day 2 Cross-Functional Review

Status: Gate G1 passed

Date: 2026-07-15

Scope: Domain behavior, authorization, threat modeling, and test traceability

## 1. Review objective

Determine whether Collaboration Foundation has sufficiently explicit domain states, authorization behavior, threats, abuse cases, and planned verification to proceed to Day 3 architecture decisions without starting runtime implementation.

## 2. Evidence reviewed

- `domain-and-rbac.md`
- `threat-model.md`
- `traceability-matrix.md`
- `decision-log.md`
- All approved Day 1 artifacts
- Current Cloudflare Pages Functions, D1 binding, D1 consistency, and cache guidance referenced by the architecture workstream

## 3. Day 2 outcomes

### Domain behavior

- Workspace, membership, invitation, device/key-readiness, shared-document, mutation, and audit entities have explicit authority and invariants.
- State machines enumerate valid transitions; every unlisted transition fails atomically without business side effects.
- Invitation acceptance and cryptographic readiness are separate. Accepted members may remain `pending_key` until an authorized key-ready device creates a valid envelope.
- Stale shared writes return a conflict and cannot overwrite or resurrect a newer/tombstoned revision.
- Idempotent replay creates no duplicate revision or audit result.
- Offline queued work is re-authorized and quarantined after incompatible account, workspace, role, membership, device, revision, or key changes.

### Authorization proposal

- Owner retains ownership, Admin-role, workspace export/deletion, and highest-risk lifecycle authority.
- Admin performs routine Editor/Viewer invitation, role, removal, audit, and device administration but cannot grant/revoke Admin or affect Owner authority.
- Editor performs eligible document create/update/delete and explicit personal-document copy.
- Viewer reads eligible encrypted documents and revisions only.
- Removed, revoked, Guest, unauthenticated, and `pending_key` principals have no protected-content or document-mutation authority.
- Key-envelope provisioning provisionally required an Owner/Admin role plus a key-ready acting device; ADR-003/004 preserve that ceiling in the Day 3 proposal.

### Threat model

- Twenty-three stable STRIDE threats (`T01`–`T23`) cover identity, session, CSRF, IDOR/RBAC, invitation, key provisioning, envelope binding, recovery, cryptography, concurrency, offline authority, XSS, caching, D1, audit/logging, credentials, fallback, environment isolation, CI/CD, resource exhaustion, provider isolation, and fail-open behavior.
- Every threat has inherent likelihood/impact, P severity, prevention, detection, recovery, target residual risk, owner, and requirement/abuse-case mapping.
- No Critical threat lacks a mitigation candidate or accountable owner.
- Phase 1 remains a security `NO-GO` until the Day 3 ADRs turn proposed controls into approved contracts.

### QA traceability

- Sixty stable requirements cover journeys J1–J9.
- Twenty-five negative abuse cases cover same-workspace, cross-workspace, wrong-role, stale, replayed, malformed, revoked, offline, cache, environment, and sensitive-data variants.
- Tests are assigned across unit, Pages Functions+D1 integration, API contract, multi-user browser E2E, security, performance/resilience, accessibility, and operational evidence.
- Stable threat IDs are canonical in `threat-model.md`; reverse mappings connect them to requirement and abuse-case IDs in `traceability-matrix.md`.

## 4. Cross-document consistency decisions

1. `pending_key` is an access state, not a role.
2. Role authorization and device/key readiness are both required where the operation needs protected content.
3. The server returns the canonical registered public key/fingerprint; the wrapping client may not substitute request-provided key material.
4. An envelope binds workspace, target user, target device, public-key fingerprint, algorithm, and key version.
5. The server never generates, unwraps, or recovers the plaintext workspace key.
6. Last-Owner removal/downgrade is always denied; ownership changes use a dedicated atomic transfer.
7. Admin cannot create/revoke Admin invitations, modify Admin/Owner roles, revoke Admin/Owner devices, or transfer ownership.
8. Credential documents are denied across create, copy, import, batch, and category-change paths.
9. Client actor, role, membership, device authority, clock, and resource workspace are untrusted inputs.
10. Private API/auth responses are network-only and `no-store`; the Service Worker never handles `/api/*`.
11. Preview and production use separate D1, OAuth credentials, secrets, session namespaces, origins, logs, and test identities.
12. Phase 1 implementation remains blocked until the Phase 0 exit gate passes.

## 5. Open decisions for Day 3

- GitHub OAuth identity linking and invitation targeting.
- Session lifetime, renewal, revocation, high-risk re-authentication, and CSRF.
- Device-key algorithm, browser compatibility, private-key protection, and fingerprint format.
- Exact envelope schema, AAD fields, bounds, nonce, algorithm, and provisioning-role policy.
- Recovery artifact, all-devices-lost behavior, key rotation, historical access, and offline-device treatment.
- Exact encrypted/server-visible metadata boundary.
- Invitation expiry/delivery/privacy behavior.
- Workspace export/deletion, retention, and strong-confirmation behavior.
- D1 transaction/consistency boundaries and migration orchestration.
- Outbox quota, ordering, expiry, quarantine, and conflict UX.

## 6. Gate G1 assessment

| Gate condition | Result |
|---|---|
| Domain entities and invariants are explicit | Pass |
| Lifecycle transitions and invalid operations are explicit | Pass |
| All principal and role states are parameterized | Pass |
| Critical/High threats have mitigation candidates and owners | Pass |
| Threats map to requirements and abuse cases | Pass |
| P0/P1 requirements have planned verification levels | Pass |
| Security Reviewer and Senior QA review | Pass for continued Phase 0 |
| Product Owner approves role matrix and Admin ceilings | Pass |

## 7. Gate decision

Product Owner decision: **GO** for Day 3; **NO-GO** for Phase 1 implementation.

The Product Owner approved the role matrix and Admin ceilings below on 2026-07-15. Open Day 3 ADR decisions remain expected and do not prevent specification work.

## 8. Product Owner confirmation

The Product Owner is asked to approve this policy:

> Owner controls ownership, Admin-role changes, workspace export/deletion, and other highest-risk lifecycle actions. Admin manages Editor/Viewer invitations, Editor/Viewer role changes and removals, their devices, and audit review. Editor creates and modifies eligible shared documents. Viewer is read-only. Removed, revoked, unauthenticated, Guest, and pending-key principals cannot access protected content or mutate documents. Key-envelope provisioning is provisionally limited to key-ready Owner/Admin devices and will be finalized in the Day 3 key-management ADR.

- [x] Product Owner approves the role policy above.
- [x] Gate G1 is marked Passed after approval.
