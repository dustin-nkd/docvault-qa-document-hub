# CF-P6-001 — Shared document, revision, and sync contract freeze

Status: PASS

Story: `CF-P6-001`
Entry gate: `P6-G0` (approved 2026-07-25) · Exit gate: `P6-G1`

Owners: Product Owner, Technical Lead, Senior QA
Reviewers: Security Reviewer, Operations, Privacy Reviewer, UX Lead

This story reconciles the controlling contracts and freezes every decision the
implementation stories depend on. **No migration, route, source implementation,
binding, secret, remote write, or activation was created.**

## 1. Reconciliation findings

### 1.1 Schema 12 is sufficient — no migration is required or authorized

Verified by read-only inspection of the live isolated Preview D1
(`docvault-collab-preview`, `0454359c-d663-409e-8962-951f173efb79`) on
2026-07-25, not by reading the schema contract.

| Need | Provided by schema 12 |
|---|---|
| Workspace-scoped document identity | `documents.workspace_id`, `UNIQUE (id, workspace_id)` |
| Authoritative revision pointer | `documents.current_revision` |
| Key version binding | `documents.current_key_version`, FK to `workspace_key_versions(workspace_id, key_version)` |
| Tombstone | `documents.state IN ('active','tombstoned')` with a paired `tombstoned_at` CHECK |
| Append-only revisions | `document_revisions PRIMARY KEY (document_id, revision)` |
| Monotonic revision order | `CHECK (base_revision = revision - 1)` |
| Create precondition | `CHECK ((operation='create' AND revision=1 AND base_revision=0) OR (operation<>'create' AND revision>1))` |
| Per-actor idempotency | `document_revisions UNIQUE (workspace_id, actor_user_id, actor_device_id, client_mutation_id)` |
| Idempotency ledger | `mutation_results` with `UNIQUE (actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id)`, 32-byte `request_fingerprint`, `http_status`, bounded `result_json`, `expires_at` |
| Ciphertext bounds | `ciphertext_envelope` 18–1,048,576 B; `ciphertext_bytes` 18–1,048,000; `ciphertext_digest` exactly 32 B |
| Actor/device attribution | `actor_user_id`, `actor_device_id` with composite FK to `devices(id, user_id)` |
| Server time | `document_revisions.server_time` |

**Finding: `schema-12-sufficient-no-migration`.** Sprint approval therefore
carries no migration authority. If an implementation story later proves a
genuine gap, it returns to a gate for a separately reviewed forward-only
additive migration; it is never added silently.

### 1.2 The route surface is eight routes, not seven

The Phase 6 sprint plan's first draft listed seven document routes and omitted
`GET /api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}`
([`api-contract.md`](api-contract.md) row 157).

That route is not optional. `ADR-006` requires a retry past the 30-day window to
reconcile the current state before creating a new mutation ID, and a client that
lost a mutation response otherwise has no authorized way to learn whether its
mutation applied. Sprint gate scenarios **G5** (network retry creates no
duplicate revision) and **G6** (offline mutation replays correctly) are
unverifiable without it. The plan, manifest, and sprint policy were corrected to
eight before this freeze.

### 1.3 Provider naming

`ADR-007` is controlling and names the providers `PersonalVaultProvider` and
`CollaborationProvider`. Personal GitHub sync is an internal engine of
`PersonalVaultProvider`, not a third top-level provider. Requests phrased as
"PersonalGitHubProvider" map to `PersonalVaultProvider`.

### 1.4 Contracts reconciled

`ADR-003`, `ADR-004`, `ADR-005`, `ADR-006`, `ADR-007`, `ADR-010`, `ADR-011`,
`ADR-012`; [`api-contract.md`](api-contract.md) rows 150–157 and the error
taxonomy at rows 400–431; [`schema-contract.md`](schema-contract.md);
[`crypto-contract.md`](crypto-contract.md);
[`quality-strategy.md`](quality-strategy.md);
[`threat-model.md`](threat-model.md) T11, T12, T15, T16, T23;
[`risk-register.md`](risk-register.md); and the Phase 5 exit and
[`phase-6-handoff.md`](phase-6-handoff.md). No contradiction remains open.

## 2. Frozen route surface

| # | Method | Path | Authorization | Idempotency-Key |
|---|---|---|---|---|
| 1 | GET | `/api/v1/workspaces/{workspaceId}/documents` | active key-ready member/device | no |
| 2 | POST | `/api/v1/workspaces/{workspaceId}/documents` | Owner/Admin/Editor + key-ready device | yes |
| 3 | GET | `/api/v1/workspaces/{workspaceId}/documents/{documentId}` | active key-ready member/device | no |
| 4 | PUT | `/api/v1/workspaces/{workspaceId}/documents/{documentId}` | Owner/Admin/Editor + key-ready device | yes |
| 5 | POST | `/api/v1/workspaces/{workspaceId}/documents/{documentId}/tombstone` | Owner/Admin/Editor + key-ready device | yes |
| 6 | GET | `/api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions` | active key-ready member/device | no |
| 7 | GET | `/api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions/{revision}` | active key-ready member/device | no |
| 8 | GET | `/api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}` | same active actor/device/workspace binding | no |

Viewer appears in no mutation row. A Viewer mutation is an **authorization
denial**, not a validation error, and creates no document, revision, idempotency,
or business audit row. Export, hard purge, batch mutation, semantic search,
realtime co-editing, and recovery artifacts remain unavailable.

## 3. Frozen mutation envelope

A mutation carries only routing and encrypted-payload fields:

```
workspaceId, documentId, deviceId, operation,
baseRevision            (update and tombstone only; create has an explicit precondition)
clientMutationId        (UUIDv4, lowercase, generated once and reused on every retry)
keyVersion, envelopeVersion, ciphertext envelope
```

The server derives actor identity, effective role, and authoritative time from
the session. **No client field may override actor, role, revision, or time.**
Any request carrying such a field fails closed as a validation error.

### 3.1 Canonical request fingerprint

The fingerprint is a SHA-256 over the following inputs in exactly this order.
Implementation is `CF-P6-003`; the ordering is frozen here so the vectors and
the idempotency ledger cannot drift apart:

1. authenticated binding: `actorUserId`, `actorDeviceId`, `workspaceId`
2. `operation`
3. `documentId`
4. precondition: `baseRevision`, or the create sentinel `0`
5. `keyVersion`, `envelopeVersion`
6. `ciphertextDigest` (32 bytes)
7. `ciphertextBytes`

The ledger stores the digest only. **Plaintext, draft context, and full
ciphertext never enter the fingerprint input or the ledger.**

### 3.2 Atomic processing order

Frozen and non-negotiable:

1. authenticate session, validate current device;
2. authorize active membership, role, workspace scope, document state, key-version policy;
3. validate bounds, compute the canonical fingerprint;
4. look up the idempotency binding;
5. matching fingerprint → return the stored result, no new revision, no new audit event;
   differing fingerprint → `409 IDEMPOTENCY_KEY_REUSED`, no side effect;
6. new binding → revision precondition, append-only revision insert, document
   pointer/tombstone update, idempotency result, and audit event **in one atomic
   boundary**;
7. commit once, or leave every business table unchanged.

Authorization precedes replay. A previously successful mutation grants nothing
after revocation.

## 4. Frozen error taxonomy

| Status | Code | Disclosed detail |
|---|---|---|
| 400 | `VALIDATION_FAILED` | allow-listed field paths and rule IDs only |
| 403 | authorization denial | non-disclosing; no resource existence signal |
| 404 | `RESOURCE_NOT_FOUND` | shared mapping for nonexistent, other-workspace, removed, unauthorized, and hidden deleted resources |
| 409 | `DOCUMENT_REVISION_CONFLICT` | `submittedBaseRevision` and `currentRevision` only |
| 409 | `IDEMPOTENCY_KEY_REUSED` | neither stored nor request fingerprint |
| 409 | `IDEMPOTENCY_WINDOW_EXPIRED` | reconcile latest before a new action |
| 409 | `KEY_VERSION_MISMATCH` | expected and submitted versions, authorized members only |

Malformed preconditions and mutation-ID reuse with different content are client
errors, **not** revision conflicts. Conflict and denial responses never disclose
another workspace.

## 5. Frozen outbox state machine

```
queued ──submit──> inflight ──2xx──> applied ──durably recorded──> disposable
   │                   │
   │                   ├──retryable (network, 5xx)──> backoff ──> queued
   │                   ├──401 403 409 KEY_VERSION_MISMATCH VALIDATION──> terminal
   │                   └──uncertain (lost response)──> reconcile (route 8) ──> applied | conflict | rejected
   │
   ├──7 days──────────────> expired (quarantine)
   └──authority change────> quarantined
```

- Ordering: FIFO per document; an entry may declare a predecessor mutation and cannot run before it succeeds. Independent documents progress concurrently within bounded client limits.
- Retry: bounded exponential backoff with jitter, always reusing the original `clientMutationId`.
- Never auto-retried: `401`, `403`, `409`, `KEY_VERSION_MISMATCH`, validation failure, terminal lifecycle responses.
- Quarantine triggers: logout, account change, workspace change, role removal, device revocation, membership loss, key rotation, unsupported schema change, incompatible document lifecycle.
- Limits: 100 pending entries; 25 MiB per environment/user/device; warn at 80%; hard limit blocks new queued saves while preserving the editable local draft.
- Expiry: 7 days moves an entry to `expired` quarantine. **Expiry never silently deletes a draft.**
- Namespace: environment + immutable provider subject + workspace ID + device ID + document ID. Personal, guest, preview, and production never share a namespace.

## 6. Frozen conflict resolution

Exactly four user actions, no automatic merge, no silent winner:

1. review latest;
2. reapply to the latest revision;
3. save as a separate authorized copy;
4. discard with confirmation.

The encrypted local draft is retained until the user completes an explicit
action. Status must be conveyed without relying on colour alone.

## 7. Frozen copy eligibility

Manual, one-time, explicitly confirmed, and unlinked. The official client rejects
stored **Credential** documents before destination encryption. The destination
receives a fresh document ID, mutation ID, revision `1`, server timestamp, audit
event, and the current workspace key version. A failed or denied copy leaves the
personal source unchanged and creates no partial workspace document. Repeating a
completed copy with the same mutation ID returns the original result.

**Residual risk (accepted at Gate G3, restated so no story overclaims):** the API
cannot semantically inspect encrypted category and therefore cannot guarantee
Credential rejection from a malicious authorized client. The guarantee is
client-side only.

## 8. Frozen vector plan

Implementation belongs to `CF-P6-003`; the identifiers, coverage, and
independent-oracle requirement are frozen here.

| Vector set | ID | Coverage |
|---|---|---|
| Envelope | `CF-VEC-P6-ENV-001` | canonical AAD binding workspace, document, revision intent, key version, envelope version; positive and mutation cases for every field, nonce, tag, and ciphertext byte |
| Fingerprint | `CF-VEC-P6-FPR-001` | the seven ordered inputs of §3.1; mutation cases altering each input independently, including digest-equal/bytes-differ |

Requirements: 100% agreement between the production implementation and an
independently written oracle; every mutation case fails closed; no vector
contains plaintext, a DEK, or draft context.

## 9. Browser profiles

Latest two stable Chrome, Edge, and Firefox plus Safari 17.4+. Unsupported
browsers, private-mode restrictions, and storage failures are explicit
fail-closed results, never skips.

## 10. Evidence identifiers

Frozen for the sprint: `CF-EV-P6-STA-001`, `CF-EV-P6-SEC-001` (this story);
`UT-001`/`QA-001`/`SEC-002`; `UT-002`/`VEC-001`/`SEC-003`;
`UT-003`/`INT-001`/`SEC-004`/`QA-002`; `UT-004`/`INT-002`/`SEC-005`;
`UT-005`/`INT-003`/`E2E-001`/`SEC-006`;
`E2E-002`/`QA-003`/`SEC-007`/`UX-001`;
`E2E-003`/`PERF-001`/`SEC-008`/`OPS-001`/`QA-004`;
`QA-005`/`SEC-009`/`OPS-002`/`STA-002`.

## 11. Open residual risks and owners

| Risk | Owner | Reviewer | Disposition |
|---|---|---|---|
| Credential rejection is client-side only and unenforceable by the API | Product Owner | Security Reviewer | Accepted at Gate G3; restated in §7 |
| A formerly authorized member retains previously downloaded plaintext | Product Owner | Privacy Reviewer | Accepted; server revocation prevents future operations only |
| Foundation does not merge two valid drafts | Product Owner | UX Lead | Accepted; explicit resolution only, deferred to a later merge design |
| 30-day idempotency and 7-day outbox windows are operational limits | Technical Lead | Operations | Accepted; visible expiry handling required by `CF-P6-006` |
| Personal Vault refactor could change behaviour silently | Technical Lead | Senior QA | Mitigated: `CF-P6-002` must capture a characterization baseline **before** refactoring |

## 12. Gate boundary

`P6-G1` approves this freeze and authorizes **`CF-P6-002` only**. It does not
authorize the envelope implementation, any route, any remote change, or
collaboration activation. Production identity, Production D1, Production document
routes, and collaboration activation remain `NO-GO`.
