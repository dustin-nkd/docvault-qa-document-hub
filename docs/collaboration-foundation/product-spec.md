# Collaboration Foundation — Product Specification

## Document control

| Field | Value |
| --- | --- |
| Document ID | CF-PROD-001 |
| Phase | Phase 0 — Specification and Threat Model |
| Sprint checkpoint | Day 1 — Product framing and Gate G0 |
| Status | Draft — ready for cross-functional G0 review |
| Version | 0.1 |
| Owner | Product Owner / Senior Business Analyst |
| Required reviewers | Product Owner, Technical Lead, Senior QA, Security Reviewer, UX Lead |
| Last updated | 2026-07-15 |
| Decision authority | Product Owner owns scope; Technical Lead and Security Reviewer must approve architecture and security constraints before implementation |

This document defines the product boundary for Collaboration Foundation. It is not an implementation design and does not authorize production code. Authentication, encryption, data, API, conflict, migration, threat-model, and test-strategy decisions will be recorded in subsequent Phase 0 artifacts and traced back to this specification.

## 1. Problem statement

DocVault currently provides a strong personal, offline-first QA document workspace. A user can maintain documents locally, protect a vault with a master password, synchronize encrypted data through a configured GitHub repository, and create encrypted public share links for eligible documents.

That model does not provide safe team collaboration:

- A master password identifies and unlocks a vault; it is not an individual team identity.
- GitHub repository credentials and synchronization settings are local configuration, not workspace membership or authorization.
- There is no workspace, member, invitation, role, device, or server-side audit model.
- The current newer-timestamp merge strategy is suitable for personal multi-device recovery but can silently choose a winner when multiple people edit concurrently.
- Public share links are document distribution, not authenticated workspace collaboration.
- There is no secure mechanism to distribute an encrypted workspace key to individual members and devices.
- GitHub Pages can host the static application but cannot provide the collaboration API.

The product must add an authenticated, encrypted workspace mode without weakening or silently migrating the existing personal vault experience.

## 2. Product intent

Collaboration Foundation must make the smallest end-to-end team workflow safe and testable:

1. A person signs in with an individual identity.
2. An owner creates a workspace.
3. The owner invites another person with a defined role.
4. The invited person accepts on an initialized device.
5. The device receives an encrypted workspace-key envelope without exposing plaintext keys to the server.
6. An authorized editor creates or updates an encrypted shared document.
7. An authorized viewer can read but cannot mutate that document.
8. Concurrent changes are detected; no stale update silently overwrites a newer revision.
9. Security-relevant workspace actions produce attributable audit events.
10. Personal Vault, guest mode, and existing GitHub Sync continue to work independently.

The Foundation is successful only when this thin vertical slice is secure, observable, reversible, and protected by automated tests.

## 3. Current product constraints

The following constraints are treated as facts for Phase 0 unless a later approved decision explicitly changes them:

### 3.1 Existing personal storage and identity

- DocVault is currently an offline-first browser application with no required application backend.
- `LocalAuth` uses a master-password flow to unlock the local vault and its recovery material.
- `DocStorage` maintains the local encrypted document cache and queues synchronization.
- `GitHubSync` is the optional personal remote synchronization mechanism and stores its credentials in local protected settings.
- Existing document mutations use client timestamps such as `createdAt` and `updatedAt`.
- Existing personal merge behavior selects newer document state primarily by timestamp.

### 3.2 Existing sharing and sensitive data

- Public share links are encrypted payload links and are read-only distribution, not membership.
- Credential documents are intentionally excluded from the existing public-share workflow.
- Collaboration must not reuse a public share link as an invitation or authenticated access grant.
- Collaboration must not make credential documents shareable in the first release.

### 3.3 Deployment and availability

- Cloudflare Pages is the canonical environment for collaboration-capable production delivery.
- GitHub Pages remains a static fallback and may continue to serve Personal Vault and guest experiences.
- Collaboration controls must not appear operational when the collaboration API is unavailable.
- GitHub Pages must not enter API retry loops, corrupt local data, or block Personal Vault because collaboration is unavailable.

### 3.4 Compatibility and migration

- Existing personal data remains personal by default.
- No existing document may be uploaded to a workspace automatically.
- Moving a personal document to a workspace requires an explicit user action and clear destination context.
- Existing GitHub Sync must not become the collaboration system of record.
- Collaboration data requires authoritative server revisions; client clock time cannot decide the winning concurrent update.

### 3.5 Security and language

- Secrets, plaintext document content, master passwords, private device keys, OAuth credentials, and session tokens must not be written to application logs.
- Authorization must be enforced by the API; hiding or disabling a UI control is not an authorization control.
- New product UI and documentation are English-only.

## 4. Personas

### 4.1 Workspace Owner

The person accountable for the workspace. The Owner creates the workspace, controls ownership and destructive lifecycle actions, manages high-risk membership decisions, and needs confidence that access can be audited and revoked.

### 4.2 Workspace Admin

A trusted team lead who manages routine membership and workspace operations without owning the workspace. The Admin needs operational control but must not silently assume or transfer ownership.

### 4.3 QA Editor

A QA engineer, tester, or developer who creates and maintains shared QA documents. The Editor needs reliable save, offline recovery, and explicit conflict handling without responsibility for member administration.

### 4.4 Stakeholder Viewer

A product, engineering, compliance, or delivery stakeholder who consumes QA information but must not modify it. The Viewer needs current, readable information with a clear read-only state.

### 4.5 Personal-only user

An existing user who does not join a workspace. This user expects the current local vault and optional GitHub Sync workflows to remain unchanged.

### 4.6 Guest user

A visitor using sample data. The Guest must remain isolated from real authentication, persistence, synchronization, invitations, and workspace data.

## 5. Jobs and desired outcomes

| Persona | Job to be done | Desired product outcome |
| --- | --- | --- |
| Owner | Create a controlled shared QA space | A workspace with explicit ownership, membership, encryption state, and auditability |
| Owner/Admin | Give the correct person the correct access | Expiring, single-use invitations and role-based authorization with immediate revocation |
| Editor | Create and update shared evidence | Encrypted, revisioned saves that do not silently lose another person's work |
| Editor | Continue working through temporary network loss | A retained local draft/outbox with idempotent retry and visible synchronization state |
| Viewer | Review current quality information safely | Read access without any mutation capability through UI or direct API calls |
| Any member | Use a second or replacement device | A device-specific key flow that does not expose plaintext workspace keys to the server |
| Owner/Admin | Investigate a membership or document event | Attributable, ordered, privacy-safe audit events |
| Existing user | Adopt collaboration at their own pace | Personal data stays personal until the user explicitly copies an eligible document |

## 6. In scope for Collaboration Foundation

### 6.1 Identity and session foundation

- Individual sign-in and sign-out.
- Stable application user identity linked to an approved external identity provider.
- Server-side session validation, expiry, renewal policy, revocation, and CSRF protection.
- Device registration and device revocation.

### 6.2 Workspace and membership foundation

- Workspace creation, naming, selection, and deletion policy.
- One Owner, with rules preventing an ownerless workspace.
- Owner, Admin, Editor, and Viewer roles.
- Invitation creation, expiration, revocation, acceptance, and replay prevention.
- Member role changes, removal, and ownership transfer.
- Server-side enforcement of every workspace permission.

### 6.3 Encryption foundation

- A random workspace data-encryption key and a versioned key model.
- Device-specific key material and a workspace-key envelope per authorized device.
- Client-side document encryption with authenticated encryption and fresh nonces.
- Device revocation and a defined future key-rotation path.
- An explicit recovery decision and user-visible limitations of end-to-end encryption.

### 6.4 Shared document foundation

- Encrypted create, read, update, soft delete, and revision retrieval for eligible document categories.
- Authoritative server revision numbers.
- Optimistic concurrency with explicit conflict responses.
- Idempotent mutations and offline retry semantics.
- A manual, eligible-document copy flow from Personal Vault to a selected workspace.

### 6.5 Governance and operability

- Privacy-safe audit events for authentication, membership, key, and shared-document actions.
- Feature-flagged rollout.
- Separate preview and production data.
- Migration, backup, restore, rollout, and rollback runbooks.
- Regression coverage for Personal Vault, GitHub Sync, public sharing, and guest mode.

## 7. Non-goals

The following are explicitly excluded from Collaboration Foundation:

- Live cursors, presence indicators, real-time co-editing, CRDT, or operational transformation.
- WebSocket infrastructure or Durable Objects for realtime rooms.
- Comments, mentions, notifications, assignments, or approval workflows.
- File attachments or object storage.
- Shared credential documents, secret-field sharing, or field-level permissions.
- Public or anonymous workspaces.
- Organization hierarchy, enterprise directory synchronization, billing, or seat management.
- Mobile or desktop native applications.
- Automatic migration of Personal Vault data.
- Replacement or removal of Personal Vault, GitHub Sync, or existing encrypted public sharing.
- Guaranteeing deletion of plaintext or screenshots already saved by a previously authorized member.

Requests in these areas require a separate product phase and must not expand Foundation implicitly.

## 8. Core journeys

### J1 — First sign-in and device initialization

1. A non-guest user chooses team collaboration.
2. The user completes approved identity-provider authentication.
3. The application establishes a secure session.
4. The user initializes or unlocks device-specific cryptographic material.
5. The application shows personal and workspace contexts as separate destinations.

Expected outcome: the user has an attributable identity and initialized device without changing or uploading the Personal Vault.

### J2 — Create a workspace

1. An authenticated user creates a named workspace.
2. The user becomes its Owner.
3. The client creates the workspace encryption key and stores only authorized encrypted key material remotely.
4. The workspace appears in the workspace selector with a clear active-context indicator.

Expected outcome: one valid Owner exists, the workspace is usable on the creating device, and no server component receives the plaintext workspace key.

### J3 — Invite and onboard a member

1. An Owner or authorized Admin selects a role and creates an invitation.
2. The invitation has an expiry and can be revoked before acceptance.
3. The intended person signs in and accepts once.
4. Membership is created and an authorized device receives a workspace-key envelope.
5. The invitation cannot be reused.

Expected outcome: access is attributable, role-limited, auditable, and cryptographically usable only by an authorized device.

### J4 — Create and read a shared document

1. An Editor creates an eligible document in the active workspace.
2. The client encrypts protected fields and sends a mutation with a unique client mutation ID.
3. The server stores the first authoritative revision and audit event.
4. A Viewer retrieves and decrypts the document on an authorized device.
5. The Viewer sees an unmistakable read-only state and cannot mutate through the API.

Expected outcome: authorized members can use the document according to role; plaintext is not exposed to the server.

### J5 — Concurrent edit conflict

1. Two Editors load the same revision.
2. Editor A saves and creates the next revision.
3. Editor B attempts to save using the stale base revision.
4. The server rejects the stale mutation as a conflict.
5. Editor B retains the local draft and can review the latest revision, keep the draft, or save it as a separate copy.

Expected outcome: no silent overwrite and no loss of Editor B's draft.

### J6 — Offline edit and recovery

1. An Editor loses network access after editing.
2. The application retains the mutation locally and shows an Offline/Pending state.
3. On reconnect, the application retries with the original client mutation ID.
4. The server applies the mutation once or returns a conflict if the base revision became stale.

Expected outcome: retry is safe and visible; duplicate revisions are not created.

### J7 — Change or revoke access

1. An authorized administrator changes a member role, removes a member, or revokes a device.
2. Server authorization changes take effect immediately for subsequent requests.
3. Removed or revoked principals do not receive future key material.
4. The action appears in the audit trail.

Expected outcome: future access is blocked consistently. The UI must explain that previously downloaded plaintext cannot be remotely erased.

### J8 — Copy a personal document into a workspace

1. A user explicitly selects an eligible personal document.
2. The application shows the target workspace and warns that a distinct shared copy will be created.
3. The user confirms.
4. The client encrypts the new shared copy with the workspace key.
5. The original personal document remains unchanged.

Expected outcome: adoption is opt-in, reversible at the source, and does not create a hidden ongoing link between the personal and shared copies.

### J9 — Open collaboration on the static fallback

1. A user opens the GitHub Pages deployment.
2. The application detects that the collaboration API is unavailable or not enabled.
3. Collaboration actions are unavailable with a concise explanation and canonical Cloudflare link.
4. Personal Vault and guest mode remain usable.

Expected outcome: graceful capability degradation without failed background loops or local-data impact.

## 9. Product success criteria

Foundation is product-ready only when all of the following are demonstrated:

- A new user can sign in, initialize a device, and create a workspace without changing Personal Vault data.
- An Owner can invite an Editor and a Viewer; each receives only the authorized role.
- A Viewer cannot mutate a workspace document through either UI or direct API requests.
- Membership removal and device revocation block subsequent authorized operations immediately.
- Eligible shared document payloads remain encrypted outside authorized clients.
- Two concurrent Editors cannot silently overwrite each other.
- Retrying the same mutation does not create duplicate revisions.
- Offline drafts survive reload/reconnect within the supported browser-storage policy.
- Security-relevant workspace actions have attributable, ordered, privacy-safe audit events.
- GitHub Pages continues to support Personal Vault and guest mode without collaboration errors.
- Existing Personal Vault, GitHub Sync, and public-share regression suites remain green.
- Production can disable collaboration through a feature flag without deleting collaboration data.

Quantitative security, API-latency, bundle-size, retention, and accessibility thresholds will be fixed in the Phase 0 QA strategy and non-functional requirements artifact.

## 10. Product failure criteria

Any of the following is a release-blocking product failure:

- Personal documents are uploaded, converted, or linked to a workspace without explicit confirmation.
- An API route allows cross-workspace access or bypasses role enforcement.
- A Viewer, removed member, revoked device, guest, or unauthenticated user can perform an unauthorized mutation.
- The server, logs, telemetry, or audit data expose a master password, private device key, plaintext workspace key, plaintext protected document content, OAuth secret, or active session token.
- A stale write overwrites a newer revision without an explicit conflict.
- Retry creates duplicate business mutations or revisions.
- Invitation links are reusable after acceptance or remain usable after revocation/expiry.
- A workspace can exist without a valid Owner.
- GitHub Pages fallback blocks or corrupts Personal Vault because collaboration is unavailable.
- The product claims that revocation erases copies already downloaded by a member.
- A production deployment cannot be disabled or rolled back without destructive data loss.
- A critical threat remains unmitigated or lacks explicit risk acceptance.

## 11. Assumptions

The following assumptions require validation during Phase 0:

- Initial collaboration targets small internal QA/product teams rather than large enterprises.
- Members have an approved external identity account and can complete browser-based OAuth.
- One human may use multiple devices, and each device requires independent revocation.
- Collaboration documents are small enough for encrypted D1-backed revisions during Foundation; attachments are excluded.
- Client-side search over decrypted workspace content is acceptable for the first release.
- Members accept that end-to-end encryption limits server-side recovery and content inspection.
- Owners accept that removing a member cannot erase information previously viewed or downloaded.
- Cloudflare Pages is the required origin for collaboration; GitHub Pages is not an equivalent collaboration runtime.
- Personal Vault remains a supported product mode through Foundation rollout.
- English-only collaboration UX is acceptable to current users.

An invalidated assumption must create a recorded product decision and impact assessment before implementation continues.

## 12. Dependencies

### Product and stakeholder dependencies

- Product Owner confirmation of target team size and initial adopter group.
- Security approval of identity, key recovery, metadata classification, and revocation limitations.
- UX definition for account/workspace context, invitations, sync state, conflicts, and fallback messaging.
- Legal/privacy confirmation if email addresses or other personal data will be retained.

### Technical and operational dependencies

- Stable canonical Cloudflare Pages deployment and Git-connected production flow.
- Permission to provision and configure Pages Functions, D1, environment bindings, and secrets.
- Separate preview and production resources.
- An approved OAuth application and callback policy for production and preview.
- Existing Vault V2 and storage characterization tests remain available as regression protection.
- A controlled database migration, backup, restore, and feature-flag process before production enablement.

### Documentation dependencies

- Authentication/session ADR.
- Workspace/RBAC specification.
- Encryption and key-management ADR.
- Data model and API/error contract.
- Revision/conflict/offline ADR.
- Threat model and security-control matrix.
- Migration/rollout/rollback ADR.
- QA strategy and traceability matrix.

## 13. Open product decisions

| ID | Decision | Recommended starting position | Owner(s) | Required by | Status |
| --- | --- | --- | --- | --- | --- |
| PD-01 | External identity provider | GitHub OAuth using stable provider subject, not username | Product + Security | Day 3 | Open |
| PD-02 | Invitation addressing | GitHub identity/username for Foundation; email invitation deferred unless privacy and delivery requirements are approved | Product | Day 3 | Open |
| PD-03 | Workspace role matrix | Owner, Admin, Editor, Viewer with authorization enforced by API | Product + QA + Security | Day 3 | Open |
| PD-04 | Protected metadata | Encrypt title, content, tags, and category-specific content; retain only minimal operational metadata server-side | Product + Security | Day 4 | Open |
| PD-05 | Private device-key protection | User-specific local unlock secret; never reuse or distribute a shared workspace master password | Security + Product | Day 4 | Open |
| PD-06 | Lost-device/all-keys recovery | User-held encrypted recovery kit with explicit no-server-plaintext-recovery limitation | Product + Security | Day 5 | Open |
| PD-07 | Member removal and key rotation | Immediate authorization removal; future-key exclusion; define when rotation is mandatory | Security + Product | Day 5 | Open |
| PD-08 | Audit retention | Define minimum retention, export needs, and privacy-safe event fields | Product + Security | Day 5 | Open |
| PD-09 | Personal-to-workspace operation | Explicit one-time copy; no automatic migration or ongoing synchronization link | Product | Day 2 | Open |
| PD-10 | Eligible document categories | All current non-credential categories unless Security identifies additional exclusions | Product + Security | Day 4 | Open |
| PD-11 | Offline support boundary | Retain encrypted pending mutations locally; define storage quota and expiry behavior | Product + UX + QA | Day 6 | Open |
| PD-12 | Conflict UX | Preserve local draft and offer review-latest or save-as-copy; no automatic last-writer-wins | Product + UX + QA | Day 6 | Open |
| PD-13 | Ownership transfer safeguards | Re-authentication/strong confirmation and prevention of ownerless state | Product + Security | Day 5 | Open |
| PD-14 | Collaboration fallback messaging | GitHub Pages remains personal/guest-only and links to canonical Cloudflare deployment | Product + UX | Day 3 | Open |

Open decisions are not permission to make implicit implementation choices. Any P0 decision still open at its required-by date blocks the dependent Phase 1 work.

## 14. Day-1 Gate G0 checklist

Gate G0 verifies that the product problem and boundaries are ready for cross-functional specification work. It does not approve implementation.

### Product framing

- [x] The collaboration problem is stated independently of a proposed implementation.
- [x] Target personas and their primary jobs are identified.
- [x] The minimum end-to-end Foundation outcome is defined.
- [x] Success and release-blocking failure criteria are documented.
- [x] Foundation non-goals prevent realtime and adjacent feature creep.

### Existing-product protection

- [x] Personal Vault remains supported and separate.
- [x] Personal data migration is explicit and opt-in.
- [x] Existing public sharing is distinguished from workspace collaboration.
- [x] Credential documents are excluded from the first collaboration release.
- [x] Guest mode remains isolated from real identity, storage, and workspace data.
- [x] GitHub Pages fallback behavior is defined at the product level.

### Security and delivery readiness

- [x] Critical protected assets are identified at product level.
- [x] Server-side authorization is a non-negotiable constraint.
- [x] Silent last-writer-wins is rejected for team collaboration.
- [x] Revocation limitations are explicitly included in user expectations.
- [x] Required Phase 0 security, architecture, migration, and QA artifacts are listed.
- [x] Open decisions have recommended starting positions, owners, and deadlines.

### Required G0 review outcomes

- [ ] Product Owner confirms target users, initial team size, scope, and non-goals.
- [x] Technical Lead confirms that no product requirement contradicts known platform constraints.
- [x] Security Reviewer confirms that no critical asset or trust boundary is missing from the next threat-model step.
- [x] Senior QA confirms that the journeys and failure criteria are testable.
- [x] UX review confirms the required workspace, invitation, conflict, offline, and fallback states are enumerated for discovery.
- [x] Review comments are resolved or recorded as owned, dated product decisions.

**G0 exit rule:** Gate G0 passes only when all six review outcomes are checked. Until then, this document remains Draft and implementation must not begin.

## 15. Repository evidence reviewed on Day 1

The product framing above is grounded in the following current repository evidence:

- `README.md` describes DocVault as an offline-first QA document application with local browser operation and GitHub Pages delivery.
- `storage.js` defines `LocalAuth`, encrypted `DocStorage`, optional `GitHubSync`, conflict retry, deletion markers, and timestamp-based merge behavior.
- `js/state.js` owns the global personal document state, persistence/hydration boundary, guest isolation, and current activity state.
- `js/actions-documents.js` creates and updates documents with client-generated IDs and timestamps, without workspace, member, actor, or authoritative revision fields.
- `js/actions-sharing.js` implements encrypted public share links and blocks credential-document sharing.
- `js/events.js` keeps guest mode outside LocalAuth and GitHub Sync and routes encrypted public-share viewing separately.
- `.github/workflows/deploy.yml` provides the GitHub Pages deployment fallback.

This evidence is descriptive, not a commitment to preserve internal implementation. Behavioral compatibility and data safety are the required constraints.
