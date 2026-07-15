# ADR-008: Audit Events and Retention

## Status

Approved at Gate G2.

## Date

2026-07-15

## Owners

Security Reviewer, Product Owner, Senior QA, Operations

## Context

Collaboration needs attributable evidence for authentication, membership, device, key, workspace, and document lifecycle actions. The existing personal activity log is client-authored product history and can include document titles; it is not an authoritative team audit trail. A new audit store can itself become a privacy or secret leak unless events are server-derived, append-only, strictly allow-listed, access-controlled, and retained for a defined period.

Retention must also bound operational records without silently destroying document history. Foundation requires explicit baselines for audit events, terminal invitations, terminal sessions, and idempotency results while workspace deletion, legal hold, and physical revision deletion remain governed high-risk lifecycle actions.

## Decision

1. Security-relevant collaboration events are appended by the server using a versioned allow-list schema, authoritative server time, authenticated actor context, and a request ID.
2. Audit events never contain plaintext document fields, ciphertext bodies, workspace keys, key envelopes, device private keys, raw cookies/session tokens, OAuth codes/tokens, raw invitation tokens, passwords, PATs, recovery secrets, SQL, or stack traces.
3. Only Owner and Admin may read workspace audit events under the approved RBAC ceiling. Operational access is least-privilege and independently logged.
4. Workspace audit events have a 365-day baseline retention from server event time. A separately approved legal hold may extend, never shorten, that period.
5. Accepted, expired, or revoked invitations and expired or revoked session records are retained for 30 days after their terminal server time, then purged in bounded jobs. Raw secrets are never retained.
6. Idempotency results are retained for 30 days under ADR-006. Document revisions and tombstones are retained until an approved workspace deletion or revision-retention policy authorizes physical deletion; this ADR does not authorize revision purge.
7. Audit rows are append-only to application callers. Corrections use a new linked correction event; application APIs cannot update or delete prior events.

## Detailed contract

### Event schema

Every event contains:

- opaque `eventId`, `workspaceId`, event schema version, and allow-listed `eventType`;
- authoritative `occurredAt`, request ID, and stable ordering tie-breaker;
- server-derived actor user ID and verified device ID where applicable, or an allow-listed system actor reason;
- allow-listed target type and opaque target ID;
- allow-listed result such as `succeeded`, `denied`, or `failed`, plus a stable sanitized reason code when policy requires recording;
- minimal before/after security state such as role name, invitation status, key version, or revision number only when that field is approved for the event type;
- optional linked event ID for correction, reversal, or lifecycle correlation.

The event registry defines required and forbidden fields per event type. Unknown event types or extra metadata are rejected rather than stored. Free-form client metadata is not accepted.

### Required event families

- workspace create, ownership transfer, export request/result, deletion request/result, and lifecycle cancellation;
- invitation create, revoke, expire, accept, and failed acceptance categories where recording does not enable enumeration;
- membership role change and removal;
- device registration, key change, revocation, and recovery operation;
- workspace-key envelope creation/revocation and key-version rotation;
- document create, update, tombstone, and approved restore, recording opaque document ID and revision but no protected fields or ciphertext;
- session security revocation and high-risk reauthentication outcome where required by the session ADR;
- feature-flag or emergency collaboration disablement affecting workspace availability.

High-volume denied requests and infrastructure diagnostics belong in privacy-safe security telemetry unless the event registry explicitly requires a workspace audit event. This prevents the audit trail from becoming a denial-of-service or untrusted-input sink.

### Consistency and ordering

An event for a successful state-changing domain action is written in the same defined atomic consistency boundary as that action. If the required event cannot be appended, the business action does not commit. Idempotent replay returns the original result without a duplicate event.

Ordering uses authoritative server time plus a monotonic event identifier/order field. Clients may paginate by an opaque cursor and must not infer authority from display order alone.

### Access, export, and correction

- API authorization scopes every query to active Owner/Admin membership in the requested workspace.
- Pagination, time range, and event-type filters have bounded limits. Cross-workspace and nonexistent targets return non-disclosing responses.
- Operational database access follows least privilege, time-bounded elevation, and control-plane audit.
- A workspace audit export is a high-risk Owner-only lifecycle action until the export ADR approves its encrypted format and confirmation flow.
- Incorrect display metadata is corrected by appending a correction event linked to the original. Original rows remain unchanged.

### Retention schedule

| Record | Baseline | Start point | End-of-life action |
|---|---:|---|---|
| Workspace audit event | 365 days | Authoritative event time | Bounded purge unless legal hold or approved incident hold applies |
| Terminal invitation record | 30 days | Accepted, expired, or revoked server time | Purge token hash and terminal row/metadata not required by retained audit |
| Terminal session record | 30 days | Expired or revoked server time | Purge token hash and terminal session row; retain only allow-listed audit event |
| Idempotency result | 30 days | Mutation completion time | Bounded purge under ADR-006 |
| Active invitation/session | Until terminal | N/A | Not eligible for terminal purge |
| Document revision/tombstone | Not yet time-limited | N/A | Retain until separately approved deletion/retention policy |

Retention jobs use server time, deterministic cutoffs, bounded batches, idempotent execution, and per-record-type metrics. A failed job stops safely and resumes without widening the deletion scope. Legal or incident holds are explicit, attributable, and auditable.

## Alternatives

- **Reuse the personal activity log:** rejected because it is client-authored, local, title-bearing, and not authoritative.
- **Log request/response bodies for investigation:** rejected because bodies can contain protected ciphertext, tokens, secrets, and unbounded hostile input.
- **Store arbitrary JSON metadata:** rejected because an allow-list cannot be enforced and future callers will create a secondary content store.
- **Keep all operational records forever:** rejected because it increases privacy, breach, and storage exposure without a defined purpose.
- **Delete all revisions after 365 days:** rejected because audit retention and encrypted document-history retention have different product and recovery requirements.
- **Permit audit-row edits:** rejected because correction without history weakens accountability.

## Consequences and residual risks

- Domain mutations depend on reliable audit append behavior and need explicit transactional tests.
- The 365-day baseline improves investigation coverage but increases the duration of server-visible security metadata exposure.
- Purging terminal session/invitation rows does not remove a retained allow-listed audit event that records their lifecycle.
- Server-visible actor, role, device, time, and access-pattern metadata remains sensitive even without document content.
- Workspace deletion and legal jurisdiction may require later policy changes. Such changes need a new ADR and must not retroactively shorten retention without Product, Security, and legal review.

## Security and privacy

- Event and operational-log schemas are allow-list only, size-bounded, and reject extra fields.
- Sensitive canary values must be absent from D1 audit rows, platform logs, telemetry, client errors, build output, and exports.
- Actor, device, time, result, and request ID are server-derived or verified; client-provided display names are not authoritative evidence.
- Owner/Admin audit access does not grant document mutation, ownership transfer, or cross-workspace visibility.
- Raw session and invitation tokens never enter D1 audit records. Only hashes may exist in their dedicated short-lived stores.
- Retention purge permissions are separated from normal application write permissions and cannot target active rows or document revisions.

## Operations

- Monitor event append failures, missing-event integrity checks, event volume by allow-listed type, purge backlog/age, hold count, and audit-access anomalies.
- Run daily bounded retention jobs with dry-run counts, stable cutoffs, metrics, and alerting; do not log purged row bodies.
- Maintain a versioned event registry and a compatibility window so readers tolerate known older schema versions.
- Periodically reconcile domain records against required event presence using opaque IDs and counts.
- Document legal/incident hold creation, review, expiry, and release. Hold actions are themselves audited.
- Backup and restore procedures must preserve event ordering, links, and retention metadata.

## Test implications

- Unit-test the event registry, required/forbidden fields, size bounds, correction links, cursor ordering, and deterministic retention cutoffs.
- Integration-test every required domain action for exactly one event in the same atomic boundary, including injected append failure and idempotent replay.
- Parameterize Owner, Admin, Editor, Viewer, removed, revoked, unauthenticated, other-workspace, malformed, and nonexistent-resource access.
- Seed sensitive canaries in success and failure inputs and scan audit rows, logs, telemetry, errors, exports, and build artifacts.
- Test events with identical timestamps still have stable ordering and pagination without gaps or duplicates.
- Test 30-day and 365-day boundaries immediately before, at, and after cutoff with deterministic server time.
- Fault-inject purge batches, retry them, and prove active records, held events, revisions, and tombstones remain untouched.
- Restore a backup and verify event counts, ordering, request correlation, correction links, and retention eligibility.

## Requirement and threat links

- Requirements: `CF-AUD-001`, `CF-AUD-002`, `CF-DOC-003`, `CF-DOC-006`, `CF-OPS-003`, `CF-OPS-005`, `CF-WS-004`.
- Journeys: J2 through J8 security-relevant lifecycle actions.
- Threats: `T11`, `T15`, `T16`, `T20`.
- Abuse cases: `AB-13`, `AB-18`, `AB-19`.
- Resolves the Foundation baseline portion of `GAP-10` and `GAP-11`; workspace export/deletion and final physical revision retention remain separately gated.

## Gate G2 acceptance

- [x] Product Owner accepts the 365-day audit baseline, 30-day terminal-record baselines, and explicit deferral of physical revision deletion.
- [x] Security Reviewer approves the event registry, access model, correction model, sensitive-field exclusions, and hold controls.
- [x] Technical Lead confirms atomic domain-event writes, stable ordering, bounded pagination, and purge isolation.
- [x] Operations confirms monitoring, least-privilege access, retention job, hold, backup, and restore procedures are implementable.
- [x] Senior QA confirms event completeness, canary, authorization, ordering, boundary, purge, and restore evidence is release-blocking where P1 applies.
- [x] No runtime implementation begins until Gate G2 approves this ADR and the event/schema contracts reflect it.
