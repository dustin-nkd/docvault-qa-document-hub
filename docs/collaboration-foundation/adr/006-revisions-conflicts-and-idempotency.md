# ADR-006: Revisions, Conflicts, Idempotency, and Offline Outbox

## Status

Proposed for Gate G2 approval.

## Date

2026-07-15

## Owners

Technical Lead, Senior QA, UX Lead

## Context

Personal Vault currently reconciles trusted copies by client timestamp. That is not safe for multiple workspace editors: clocks can differ, a stale writer can silently overwrite a newer change, and a lost response can cause a retry to create a second revision. Collaboration Foundation needs one authoritative order, an explicit conflict state, and durable retry without weakening current authorization.

The client also needs to preserve encrypted work during temporary network loss. Queued work may outlive a session, role, device authorization, workspace selection, or workspace-key version, so an outbox is not permission to execute later.

## Decision

1. D1 owns a monotonically increasing integer revision for each shared document. Client timestamps never select a winner.
2. Every update or delete supplies the last observed `baseRevision`. The server performs an atomic compare-and-set. A stale base returns HTTP `409 Conflict` and creates no revision or business audit event.
3. Every successful create, update, or delete creates exactly one append-only revision with a server-generated timestamp and actor/device attribution. Delete creates a revisioned tombstone.
4. Every mutation supplies a high-entropy `clientMutationId`. Idempotency is bound to actor, device, workspace, operation, and mutation ID and is protected by a database uniqueness constraint.
5. An identical authorized replay returns the original deterministic result. Reusing the same binding with a different normalized request fingerprint fails closed and creates no side effect.
6. Current session, device, membership, role, document scope, and key-version policy are checked before applying or replaying a mutation. A previously successful mutation does not grant access after revocation.
7. Offline mutations are stored as encrypted IndexedDB outbox entries. They are retried with the original mutation ID and re-authorized on submission.
8. Conflict resolution is explicit. The client retains the local draft and offers review latest, reapply to the latest revision, save as a separate copy, or discard with confirmation. There is no automatic merge in Foundation.

## Detailed contract

### Mutation request

The API derives actor identity and effective role from the authenticated session. It never trusts client-supplied actor, role, or server time. A mutation contains only the required routing and encrypted-payload fields:

- `workspaceId`, `documentId`, `deviceId`, and operation;
- `baseRevision` for update/delete and an explicit create precondition;
- `clientMutationId` generated once and retained across retries;
- `keyVersion`, versioned encrypted payload or tombstone intent, and validated server-visible envelope metadata;
- no client field that can override actor, role, authoritative revision, or authoritative time.

The server calculates a canonical request fingerprint over the authenticated binding, operation, resource identifiers, precondition, key version, ciphertext digest, and validated mutation metadata. It does not place plaintext or full ciphertext in the idempotency ledger.

### Atomic processing order

For each request, the server:

1. authenticates the session and validates the current device;
2. authorizes current active membership, role, workspace scope, document state, operation, and key-version policy;
3. validates input bounds and computes the canonical fingerprint;
4. looks up the idempotency binding;
5. returns the stored result when the fingerprint matches, or a stable `IDEMPOTENCY_KEY_REUSED` conflict when it differs;
6. for a new binding, performs the revision precondition, append-only revision write, current-document pointer/tombstone update, idempotency result, and required audit event in one atomic consistency boundary;
7. commits once or leaves every business table unchanged.

Concurrent first submissions with the same mutation ID converge on one committed result. Concurrent different mutations against the same base revision allow at most one revision advance; the others return the stable document-conflict response.

### Results and conflicts

A successful response includes the opaque document ID, new revision, authoritative server timestamp, mutation ID, and stable operation result. An authorized identical replay returns the same result and does not append another audit event.

A stale revision returns HTTP `409` with error code `DOCUMENT_REVISION_CONFLICT`, request ID, submitted base revision, and current revision. The response does not disclose another workspace, plaintext, or unauthorized ciphertext. The client keeps the encrypted local draft until the user completes an explicit resolution action.

Malformed preconditions and mutation-ID reuse with different content are client errors, not revision conflicts. Authorization and scope denials remain non-disclosing and create no document, revision, or idempotency side effect.

### Offline outbox

- Storage: encrypted entries reside in IndexedDB under a versioned namespace containing environment, immutable user ID, device ID, and workspace ID. Personal Vault, guest, preview, and production never share an outbox namespace.
- Binding: each entry records the account/device/workspace binding, operation, document ID, base revision, key version, original mutation ID, encrypted payload, encrypted user-facing draft context, creation time, dependency identifier, retry count, and state. Only minimum routing metadata is plaintext locally.
- Ordering: processing is FIFO per document. An entry may declare an explicit predecessor mutation; a dependent entry cannot run until its predecessor succeeds. Independent documents may progress concurrently within bounded client limits.
- Retry: transient network and retryable server failures use bounded exponential backoff with jitter and the original mutation ID. `401`, `403`, `409`, key-version mismatch, validation failure, and terminal lifecycle responses never enter an automatic retry loop.
- Quota: Foundation permits at most 100 pending entries, 25 MiB of encrypted outbox data per environment/user/device, and the normal API payload limit per entry. At 80% capacity the UI warns the user; at the hard limit it prevents another queued save while preserving the editable local draft.
- Expiry: an entry expires seven days after creation. Expiry stops submission but does not silently delete the draft. The entry moves to an `expired` quarantine state until the user exports an encrypted draft backup, re-encrypts/saves a copy where authorized, or explicitly discards it. The draft backup contains no workspace key and is not a key-recovery artifact; ADR-010 prohibits recovery-artifact import/export in Foundation.
- Quarantine: logout, account change, workspace change, role removal, device revocation, membership loss, key rotation, unsupported schema change, or incompatible document lifecycle moves affected entries to quarantine. Reauthentication alone does not bypass a changed authority or key decision.
- Recovery UX: the client explains whether the user must sign in again, fetch the latest revision, request key provisioning, re-encrypt with an authorized current key, save as a separate copy, export an encrypted draft backup, or discard. No path silently changes workspace or account, and the backup cannot recover a lost workspace key.
- Disposal: successful entries may be removed only after the deterministic server result is durably recorded locally. Manual discard requires confirmation and a best-effort deletion of encrypted entry data. The product makes no claim of forensic erasure from browser storage.

### Retention of idempotency results

The server retains terminal idempotency records for 30 days from the authoritative completion time. A retry after that window receives a stable `IDEMPOTENCY_WINDOW_EXPIRED` response and must reconcile the current revision before any new mutation ID is created. Clients must not reinterpret an unknown old result as permission to repeat a create or delete.

## Alternatives

- **Client timestamp last-write-wins:** rejected because clock skew and concurrent editors cause silent loss.
- **Automatic field merge or CRDT:** deferred because realtime co-editing is outside Foundation and category-specific merges need separate product work.
- **Mutable single document row without history:** rejected because it weakens recovery, auditability, and conflict evidence.
- **Idempotency by mutation ID alone:** rejected because cross-actor, device, workspace, or operation collisions/replay would be ambiguous.
- **Unencrypted local queue or in-memory retry only:** rejected because it either exposes content at rest or loses work on reload.
- **Infinite retry and retention:** rejected because stale authority, stale keys, and unbounded storage are unsafe.

## Consequences and residual risks

- Saves require an atomic storage path and additional revision/idempotency rows.
- Users must resolve true conflicts, but their draft is preserved and no winner is chosen silently.
- Per-document FIFO reduces surprising ordering while still allowing bounded progress across independent documents.
- The 30-day idempotency window and seven-day outbox window are explicit operational limits and require visible expiry handling.
- A formerly authorized user may retain plaintext or ciphertext already obtained. Server revocation prevents future operations but cannot erase prior downloads.
- Foundation does not merge two valid drafts. A later merge design must preserve these revision and idempotency invariants.

## Security and privacy

- Every retry is authenticated and authorized against current state; queued authority is never trusted.
- Idempotency fingerprints and logs exclude plaintext, private keys, raw tokens, full ciphertext bodies, and decrypted draft context.
- Database queries are workspace-scoped and actor/device values are server-derived or verified against the session.
- Conflict and denial responses are non-disclosing across workspace boundaries.
- IndexedDB entries are encrypted, namespaced, bounded, and cleared or quarantined on identity/context changes without silent data loss.
- Server time prevents a forged client clock from influencing order, retention, or audit attribution.

## Operations

- Monitor conflict rate, idempotent replay rate, mismatched-fingerprint attempts, transaction failures, outbox depth/age, quarantine reasons, and expiry without document content.
- Alert on sustained transaction failures, abnormal mutation-ID mismatch, or replay storms.
- Keep server and client compatibility for the mutation envelope and stable error codes during staged rollout.
- Feature-flag disablement stops new submissions while preserving D1 revisions and local encrypted drafts.
- Retention cleanup must delete idempotency rows in bounded batches and must never delete document revisions through the same job.

## Test implications

- Unit-test canonical fingerprinting, revision decisions, stable errors, outbox transitions, quota, expiry, and dependency ordering with deterministic clocks and IDs.
- Integration-test simultaneous writers against one base revision, sequential and concurrent identical replay, different-payload mutation-ID reuse, and injected failure at every atomic write boundary.
- Verify one revision and one audit event after lost-response/retry storms; inspect D1 side effects, not only HTTP responses.
- Parameterize current role, removed member, revoked device, other workspace, tombstone, key rotation, logout/account switch, and malformed IDs.
- Browser-test offline save, reload, reconnect, quota warning/hard limit, seven-day expiry, quarantine, conflict recovery, reauthentication, re-encryption, save-as-copy, encrypted export, and explicit discard.
- Security-test forged actor/time/role, cross-workspace IDs, ciphertext/AAD tamper, and sensitive canaries in D1, logs, telemetry, caches, and build artifacts.
- Performance-test bounded concurrent processing and large permitted encrypted drafts without breaking per-document ordering.

## Requirement and threat links

- Requirements: `CF-DOC-003`, `CF-DOC-006`, `CF-SYNC-001` through `CF-SYNC-005`, `CF-AUD-001`, `CF-OPS-004`.
- Journeys: J5 Concurrent edit conflict, J6 Offline edit and recovery, J7 Change or revoke access.
- Threats: `T11`, `T12`, `T15`, `T16`, `T23`.
- Abuse cases: `AB-12`, `AB-13`, `AB-14`, `AB-19`.
- Closes architecture decision `BD-009` for document revision transactions and `BD-010` for the Foundation offline outbox contract.

## Gate G2 acceptance

- [ ] Product Owner accepts explicit manual conflict resolution, the seven-day outbox expiry, and the no-silent-discard UX.
- [x] Technical Lead confirms the atomic D1 consistency boundary, uniqueness constraints, fingerprint contract, and current-authorization-before-replay order.
- [x] Security Reviewer approves the binding, encrypted outbox boundary, non-disclosing errors, and quarantine rules.
- [x] Senior QA confirms every P1 concurrency, replay, stale-authority, and failure-injection case has measurable evidence ownership.
- [x] UX Lead approves conflict, capacity, expiry, reauthentication, re-encryption, export, and discard states, including accessible non-color status.
- [x] No runtime implementation begins until Gate G2 approves this ADR and the API/schema contract reflects it.
