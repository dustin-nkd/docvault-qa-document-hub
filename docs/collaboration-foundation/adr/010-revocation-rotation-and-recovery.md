# ADR-010: Revocation, Rotation, and Recovery

## Status

Proposed for Gate G2 approval. Terminal-loss UX and retention values require Product Owner sign-off.

## Date

2026-07-15

## Owners

Product Owner (user and recovery policy), Security Reviewer (key policy), Technical Lead (state transitions), Senior QA (drills/evidence).

## Context

Server authorization can stop future API access immediately, but an E2EE system cannot erase plaintext, ciphertext, or keys already copied by an authorized member. Rotation must protect future content without pretending to revoke past knowledge. Recovery must not introduce server plaintext escrow.

## Decision

Membership/device revocation is immediate server-side denial. A confirmed lost/compromised device, member removal, ownership security event, or suspected workspace-key exposure triggers mandatory workspace DEK rotation. Role reduction without removal does not rotate unless exposure is suspected. Rotation creates `keyVersion + 1`, excludes removed/revoked principals, and makes the new version mandatory for all new writes.

Recovery uses another active key-ready Owner/Admin device. Foundation provides no exported recovery artifact and no server escrow. If no such provisioning device remains, encrypted workspace content is irrecoverable and the product says so. A future recovery artifact or WebAuthn-based recovery design requires a separate ADR and migration plan.

## Detailed contract

### Revocation transaction

- Member removal atomically marks membership removed, rejects subsequent reads/writes/envelope operations, invalidates pending invitations for that identity/workspace, revokes its workspace devices/envelope eligibility, quarantines its queued mutations on submission, and appends an audit event.
- Device revocation atomically marks the device revoked, rejects its API/device context and envelope retrieval/provisioning, and appends an audit event. Other devices for the user remain subject to current membership.
- Session validity never overrides membership/device state. Authorization is read from current server state for every request.
- Last-Owner removal is forbidden. Ownership transfer requires a 15-minute reauthentication window, strong confirmation, an eligible active/key-ready successor, and one atomic transaction.
- Revocation responses and UI explicitly state that previously downloaded plaintext, screenshots, exports, ciphertext, or keys cannot be remotely erased.

### Rotation

1. Freeze new workspace mutations briefly using a server rotation state; reads remain policy-controlled.
2. An active key-ready Owner device generates a fresh independent 256-bit AES-GCM DEK and proposes exactly `currentKeyVersion + 1`; Admin initiation is denied for Foundation rotation governance.
3. It creates bound envelopes for eligible active devices using ADR-004. Removed, revoked, and pending-key devices receive none.
4. The server atomically commits the new current version, envelope set, rotation reason/actor/time, and audit event. Duplicate/replayed proposals are idempotent; gaps and downgrade fail.
5. New writes must use the current key version. Offline writes using an older version are quarantined and require user-reviewed re-encryption against the latest revision; they never auto-submit.
6. Latest live documents are re-encrypted to the new version by authorized clients under an resumable, idempotent migration contract. Old ciphertext/revisions remain accessible only to currently authorized users who retain legitimate old-version envelopes until retention/purge policy removes them.

Rotation limits future access but cannot invalidate an old DEK already possessed by a removed principal. Re-encryption reduces future server retrieval of old ciphertext but cannot retract copies already downloaded.

### Provisioning and recovery

- A new/pending device requests provisioning; any active key-ready Owner/Admin device may validate its canonical fingerprint and create envelopes. Provisioning is not tied to the original workspace creator.
- Recovery from another active key-ready Owner/Admin device follows normal provisioning and is auditable.
- Foundation does not export/import device private keys, workspace DEKs, or recovery bundles. Support and operators cannot override this absence.
- Loss/revocation of all active key-ready Owner/Admin provisioning devices is terminal cryptographic loss for onboarding/recovery, even if Viewer/Editor devices retain read access under existing envelopes. Operators may restore D1 ciphertext/metadata from backup but cannot decrypt, provision a new device, or reset it into plaintext access.

### Deletion and incident behavior

- Workspace deletion and account removal follow approved retention/tombstone policy and do not claim cryptographic erasure of external copies.
- Suspected key exposure invokes: feature/mutation containment, membership/device revocation, session response where relevant, rotation, re-encryption, log/canary review, notification decision, and documented residual exposure window.
- Rotation/recovery failures are retryable and visible; they never fall back to the previous key for new writes or to server-held plaintext.

## Alternatives

- No rotation on removal: rejected because future content would remain decryptable with retained old keys.
- Revoke old keys remotely: impossible once copied to an uncontrolled endpoint.
- Server escrow or administrator master key: rejected because it breaks the stated E2EE boundary.
- Rotation on every role change: rejected as disproportionate unless membership/key exposure changes.
- Destructive replacement workspace after every event: rejected for usability, audit, and revision continuity.

## Consequences and residual risks

Removal is immediate for server access, but rotation is a distributed operation and may temporarily pause writes. Historical revisions need old keys for authorized members and therefore increase key-history complexity. Removed users can decrypt any ciphertext they already downloaded with any retained old key and can retain plaintext indefinitely. All-keys-lost recovery may be impossible. These limitations require explicit Product Owner acceptance and accurate UX.

## Security and privacy

Rotation reasons, revoked device/member IDs, recovery actions, and key versions are Restricted security metadata. Logs contain allow-listed identifiers/reason codes only. Recovery artifacts are Critical user-controlled files and must not be attached to support tickets, telemetry, or automatic cloud sync by the application.

## Operations

Provide member/device emergency revocation, rotation progress/retry, stalled-rotation alerting, key-version inventory, re-encryption progress, all-keys-lost, and incident runbooks. Backup/restore rehearsals verify that ciphertext and envelopes restore consistently without promising decryption. Feature rollback must preserve new key versions and never downgrade current version.

## Test implications

- State-machine tests cover member/device/pending-key removal, last Owner, ownership transfer, simultaneous revocation/write/envelope fetch, and immediate denial.
- Rotation tests cover monotonic versions, eligibility snapshots, atomic commit, replay, failure interruption, resumable re-encryption, offline old-version quarantine, and rollback compatibility.
- Recovery tests cover alternate Owner/Admin provisioner, lost original device, Editor/Viewer provisioning denial, revoked identity, absence of export/import recovery endpoints, and all-keys-lost terminal UX.
- Evidence confirms removed/revoked principals receive no new envelope or ciphertext and no test claims erasure of prior copies.

## Requirement and threat links

CF-DEV-003 and CF-DEV-004; CF-RBAC-003; CF-KEY-004 through CF-KEY-006; CF-SYNC-005; CF-WS-003 and CF-WS-004; threat-model T02, T05-T09, T12, T15-T16; abuse cases AB-14 and AB-21 through AB-25.

## Gate G2 acceptance

- [x] Security Reviewer approves rotation triggers, Owner-only rotation initiation, historical access, and no-artifact recovery policy.
- [ ] Product Owner accepts terminal-loss UX and inability to revoke previously downloaded plaintext, ciphertext, or old keys.
- [x] Role/owner and authorized-provisioner policies contain no unresolved `Allow*`/`Deny*` values.
- [x] Day 4 API/D1 schemas must reflect atomic state transitions and monotonic key-version contracts.
- [x] Senior QA owns the release-blocking revocation, race, rotation, recovery, and rollback drill plan.
- [x] Documentation explicitly states the inability to revoke previously downloaded plaintext, ciphertext, or old keys.
