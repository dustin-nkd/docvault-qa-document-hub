# Phase 6 sprint - Shared document vertical slice

Status: **READY FOR APPROVAL AT `P6-G0`**

Sprint ID: `CF-P6-S01`

Planned dates: 2026-07-27 through 2026-08-28 (24 working days, Asia/Ho_Chi_Minh)

Owners: Product Owner, Technical Lead, Senior Developer, Senior QA

Required reviewers: Security Reviewer, Operations, Privacy Reviewer; UX Lead for conflict, offline, capacity, copy, and permission-denied journeys

## 1. Sprint decision and authorization boundary

Phase 5 is PASS and closed at `P5-G5` on 2026-07-25. [`phase-6-handoff.md`](phase-6-handoff.md) is the controlling entry contract. This sprint delivers the first end-to-end shared document slice on isolated Preview: encrypted document create/read/update/tombstone, append-only revisions, idempotent retry, an offline outbox, explicit conflict resolution, and a manual one-time Copy to workspace.

Approval of Gate `P6-G0` authorizes **`CF-P6-001` only**. It does not authorize remote changes, Preview deployment, Production activation, or any story beyond the contract freeze. Each later story requires its preceding gate, and remote Preview integration requires the separate `P6-G4` authorization.

The following remain prohibited throughout Phase 6:

- Production D1, identity, document routes, secrets, data, or feature activation;
- collaboration or document behavior on GitHub Pages beyond a redirect or unavailable state;
- a deployed test/authentication bypass or real customer data;
- server-visible plaintext document content, device private keys, unlock secrets, KEKs, or workspace DEKs;
- automatic upload, mirroring, or background synchronization of any Personal Vault document;
- a fallback that writes a failed collaboration mutation into Personal Vault or personal GitHub;
- automatic merge of two drafts, server-side conflict resolution, or client-timestamp last-write-wins;
- realtime co-editing, semantic server-side search, batch document APIs, export/hard-purge, or recovery artifacts;
- editing an applied migration, silently adding a migration, or restoring shared Preview without separate destructive approval.

## 2. Sprint goal and exit state

Deliver a reviewed, independently verified shared document slice on isolated Preview in which D1 owns revision order, no server component can read document plaintext, and Personal Vault is provably untouched.

At Phase 6 exit:

- `PersonalVaultProvider` and `CollaborationProvider` are separate providers with separate state namespaces, and a document belongs to exactly one of them;
- document content is encrypted client-side under the current workspace key version before it crosses the browser boundary;
- every successful create/update/tombstone appends exactly one revision with a server timestamp and actor/device attribution;
- D1 compare-and-set on `base_revision` makes exactly one concurrent writer win; the loser receives `409 DOCUMENT_REVISION_CONFLICT` with no side effect;
- an identical authorized replay returns the original result and appends no second revision or audit event;
- offline mutations persist as encrypted IndexedDB outbox entries and are re-authorized, not merely retried, on submission;
- conflict, capacity, expiry, quarantine, and permission-denied states are explicit, accessible, and never silently discard a draft;
- Copy to workspace is manual, one-time, unlinked, and rejects Credential documents in the official client;
- Personal Vault documents, personal GitHub sync, and guest fixtures are byte-for-byte unchanged;
- Production and collaboration activation remain `NO-GO`; Phase 7 receives contracts and evidence, never plaintext.

## 3. Controlling contracts

Implementation must conform to:

- `ADR-005` metadata encryption boundary and `ADR-006` revisions, conflicts, idempotency, and offline outbox;
- `ADR-007` provider isolation and the Copy-to-workspace contract;
- `ADR-003` workspace RBAC, `ADR-004` device and workspace keys, `ADR-010` revocation/rotation/recovery;
- `ADR-011` browser/API security and `ADR-012` migrations/rollback;
- [`api-contract.md`](api-contract.md) rows for the seven document routes, their authorization, idempotency, status, and cache policy;
- [`schema-contract.md`](schema-contract.md), [`crypto-contract.md`](crypto-contract.md), and [`quality-strategy.md`](quality-strategy.md);
- threats T11, T12, T15, T16, T23 and requirements `CF-DOC-001` through `CF-DOC-006`, `CF-SYNC-001` through `CF-SYNC-005`;
- Phase 5 exit: schema 12, twelve applied migrations, zero active Preview authority, Production D1 absent.

## 4. Frozen sprint-level decisions

### 4.1 Schema sufficiency — no migration is required or authorized

Schema 12 already contains the complete Phase 6 persistence surface. `CF-P6-001` must confirm this against the live Preview schema and record the finding; it must not create a migration.

- `documents` holds `workspace_id`, `current_revision`, `current_key_version`, `current_ciphertext_digest`, `envelope_version`, `state IN ('active','tombstoned')`, and `UNIQUE (id, workspace_id)`, with restrictive foreign keys to `workspaces`, `users`, and `workspace_key_versions`.
- `document_revisions` is append-only by `PRIMARY KEY (document_id, revision)` and enforces `base_revision = revision - 1`, `create ⇒ revision = 1 AND base_revision = 0`, and idempotency through `UNIQUE (workspace_id, actor_user_id, actor_device_id, client_mutation_id)`.
- `mutation_results` provides the idempotency ledger with `UNIQUE (actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id)`, a 32-byte `request_fingerprint`, `http_status`, bounded `result_json`, and `expires_at` for the 30-day window.

Therefore sprint approval carries **no** migration authority. If implementation later proves a genuine gap, it returns to a gate for a separately reviewed forward-only additive migration behind a conditional authorization; it is never added silently.

### 4.2 Route surface

Phase 6 adds exactly the eight contracted routes below and no others:

| Route | Method | Authorization | Idempotency |
|---|---|---|---|
| `/api/v1/workspaces/{workspaceId}/documents` | GET | active key-ready member/device | none |
| `/api/v1/workspaces/{workspaceId}/documents` | POST | Owner/Admin/Editor + key-ready device | required |
| `/api/v1/workspaces/{workspaceId}/documents/{documentId}` | GET | active key-ready member/device | none |
| `/api/v1/workspaces/{workspaceId}/documents/{documentId}` | PUT | Owner/Admin/Editor + key-ready device | required |
| `/api/v1/workspaces/{workspaceId}/documents/{documentId}/tombstone` | POST | Owner/Admin/Editor + key-ready device | required |
| `/api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions` | GET | active key-ready member/device | none |
| `/api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions/{revision}` | GET | active key-ready member/device | none |
| `/api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}` | GET | same active actor/device binding | none |

The eighth route is the outbox reconciliation endpoint. It was omitted from the
first draft of this plan and restored by the `CF-P6-001` reconciliation: without
it a client that lost a mutation response has no authorized way to learn whether
the mutation applied, so `ADR-006`'s "reconcile before creating a new mutation
ID" rule and sprint gate scenarios G5 and G6 would be unverifiable. It returns
`{ state, result }` only for the exact authenticated actor/device/workspace
binding and only within the 30-day idempotency window.

Viewer is deliberately absent from every mutation row. A Viewer mutation is an authorization denial, not a validation error, and creates no document, revision, idempotency, or business audit side effect. Export, hard purge, batch mutation, and semantic search remain unavailable.

### 4.3 Provider isolation

`ADR-007` names the two providers `PersonalVaultProvider` and `CollaborationProvider`; those names are controlling. The personal GitHub sync engine remains an internal concern of `PersonalVaultProvider`, not a third top-level provider.

- Provider selection is explicit at every call site. A collaboration failure never falls back to a personal write.
- Collaboration cache and outbox keys are namespaced by environment, immutable provider subject, workspace ID, device ID, and document ID.
- Logout, account switch, workspace switch, membership removal, device revocation, or key rotation clears unwrapped keys and plaintext view state and quarantines incompatible queued work before another context renders.
- The UI always labels whether a document is Personal or in a named workspace. Combined edit views are out of scope.

### 4.4 Copy to workspace

One-time, manual, explicitly confirmed, and unlinked. The official client rejects stored Credential documents **before** destination encryption. The destination receives a fresh document ID, mutation ID, revision `1`, server timestamp, audit event, and the current workspace key version. A failed or denied copy leaves the personal source unchanged and creates no partial workspace document. Repeating a completed copy with the same mutation ID returns the original result.

As recorded in `ADR-007` and accepted at Gate G3, the API cannot semantically inspect encrypted category and therefore cannot guarantee Credential rejection from a malicious authorized client. This is a known residual risk, restated here so the sprint does not overclaim.

### 4.5 Mutation envelope and conflict semantics

- Every mutation supplies `workspaceId`, `documentId`, `deviceId`, operation, `clientMutationId`, `keyVersion`, and the versioned encrypted payload; update and tombstone additionally supply `baseRevision`.
- The server derives actor identity, effective role, and authoritative time from the session. No client field may override actor, role, revision, or time.
- Processing order is fixed: authenticate session and device, authorize membership/role/scope/state/key-version, validate bounds and compute the canonical fingerprint, look up the idempotency binding, then commit the revision precondition, append-only revision, document pointer update, idempotency result, and audit event in one atomic boundary — or leave every business table unchanged.
- A matching fingerprint returns the stored result. A different fingerprint on the same binding returns a stable `IDEMPOTENCY_KEY_REUSED` conflict, which is a client error and not a revision conflict.
- A stale base returns `409 DOCUMENT_REVISION_CONFLICT` with the request ID, submitted base revision, and current revision, and discloses nothing about another workspace.

### 4.6 Offline outbox

Encrypted IndexedDB entries, FIFO per document, bounded exponential backoff with jitter, and the original mutation ID on every retry. `401`, `403`, `409`, key-version mismatch, validation failure, and terminal lifecycle responses never enter an automatic retry loop. Foundation limits are 100 pending entries and 25 MiB per environment/user/device, with an 80% warning and a hard limit that preserves the editable local draft. Entries expire after seven days into an `expired` quarantine that requires an explicit user action; nothing is silently deleted. An exported draft backup contains no workspace key and is not a recovery artifact.

### 4.7 Environment topology

| Environment | Maximum Phase 6 state | Document behavior |
|---|---|---|
| Local test | Disposable schema-12 D1, deterministic crypto/clock/ID seams at module boundaries | Full deterministic services, concurrency and fault injection; no external network |
| Browser test | Disposable origin/storage, synthetic users/devices | Real Web Crypto and IndexedDB; supported-browser qualification |
| Preview before `P6-G4` | Existing isolated D1 and key runtime | Document routes disabled; read-only preflight only |
| Preview after `P6-G4` | Reviewed document routes, synthetic users/devices only | Real sessions; no test bypass; cleanup and reconciliation required |
| Production | No D1 binding, key secret, identity, or business/document routes | Disabled `503` shell |
| GitHub Pages | Static Personal/Guest fallback | No collaboration session, document, API, or imitation UI |

## 5. Story backlog and gates

### `CF-P6-001` - Freeze document, revision, and sync contract

Size: M | Entry: `P6-G0` | Exit: `P6-G1`

Reconcile ADR-005/006/007, the API and schema contracts, quality strategy, threat/risk registers, and the Phase 5 handoff. Confirm against the live Preview schema that schema 12 is sufficient and record "schema 12 sufficient — no migration" or return to a gate. Freeze the exact seven-route surface, mutation envelope, canonical fingerprint input, error taxonomy, outbox state machine, conflict resolution options, copy eligibility rules, browser profiles, and evidence IDs. Publish immutable synthetic vectors for the envelope and fingerprint.

Acceptance: every decision and residual risk has an owner and reviewer; no migration, route, source implementation, binding, secret, remote write, or activation occurs. Evidence: `CF-EV-P6-STA-001`, `CF-EV-P6-SEC-001`.

### `CF-P6-002` - Implement StorageProvider abstraction and provider isolation

Size: L | Entry: `P6-G1` | Exit: `P6-G2`

Introduce the `StorageProvider` interface and the `PersonalVaultProvider` / `CollaborationProvider` implementations, explicit provider selection, namespaced collaboration state, and context-change clearing. Personal Vault behavior is refactored behind the interface without semantic change.

Acceptance: Personal Vault document read/write/sync/export/tombstone results are byte-for-byte identical before and after, proven by characterization tests captured before the refactor; no collaboration failure path writes to Personal Vault or personal GitHub; guest fixtures use neither provider; namespace keys include environment, subject, workspace, and device. Evidence: `CF-EV-P6-UT-001`, `CF-EV-P6-QA-001`, `CF-EV-P6-SEC-002`.

### `CF-P6-003` - Implement the encrypted document envelope

Size: L | Entry: `P6-G2` | Exit: `P6-G2A`

Implement client-side document encryption under the current workspace DEK: versioned AEAD envelope, canonical AAD binding workspace, document, revision intent, key version, and envelope version; ciphertext digest and byte accounting matching the `documents`/`document_revisions` bounds; deterministic vectors agreeing with an independent oracle.

Acceptance: 100% positive and negative vector agreement; every altered AAD field, key version, nonce, tag, or ciphertext byte fails closed; no plaintext, DEK, or draft context appears in any request field, log, telemetry, cache, or build artifact; oversize and malformed payloads fail before crypto work. Evidence: `CF-EV-P6-UT-002`, `CF-EV-P6-VEC-001`, `CF-EV-P6-SEC-003`.

### `CF-P6-004` - Implement atomic mutations, append-only revisions, and idempotency

Size: XL | Entry: `P6-G2A` | Exit: `P6-G2B`

Implement create, update, and tombstone as one atomic D1 boundary performing the compare-and-set precondition, append-only revision insert, document pointer/tombstone update, idempotency result, and audit event. Implement the canonical request fingerprint, the idempotency lookup order, and the stable error taxonomy. Enforce role, membership, device, scope, state, and key-version policy before apply and before replay.

Acceptance: two concurrent writers on one base revision produce exactly one revision advance and one stable `409`; identical replay returns the original result with no second revision and no second audit event; same binding with a different fingerprint returns `IDEMPOTENCY_KEY_REUSED` and no side effect; a Viewer, removed member, revoked device, cross-workspace ID, stale key version, or tombstoned target creates zero rows; injected failure at every atomic write boundary leaves all business tables unchanged. Evidence: `CF-EV-P6-UT-003`, `CF-EV-P6-INT-001`, `CF-EV-P6-SEC-004`, `CF-EV-P6-QA-002`.

### `CF-P6-005` - Implement authorized reads and revision history

Size: L | Entry: `P6-G2B` | Exit: `P6-G2C`

Implement the four read routes with workspace-scoped queries, opaque bounded pagination, tombstone metadata semantics, `no-store` responses, and Service Worker bypass. Reads require an active key-ready member and device.

Acceptance: a Viewer can read current documents and revision history; a non-member, removed member, revoked device, or cross-workspace identifier receives a non-disclosing denial; pagination cursors are opaque, bounded, and not forgeable across workspaces; no response is cacheable and none leaks another workspace's existence. Evidence: `CF-EV-P6-UT-004`, `CF-EV-P6-INT-002`, `CF-EV-P6-SEC-005`.

### `CF-P6-006` - Implement the encrypted offline outbox

Size: XL | Entry: `P6-G2C` | Exit: `P6-G3`

Implement encrypted IndexedDB outbox storage, per-document FIFO with declared predecessors, bounded backoff with jitter reusing the original mutation ID, the non-retryable response set, quota warning and hard limit, seven-day expiry into quarantine, and quarantine on logout, account/workspace change, role removal, device revocation, membership loss, or key rotation.

Acceptance: a queued mutation submitted after reconnect produces exactly one revision; a queued mutation whose authority changed is quarantined with an accurate reason and never silently executes; `401`/`403`/`409`/key-version mismatch never auto-retries; quota and expiry states preserve the editable draft; outbox entries contain no plaintext beyond minimum local routing metadata. Evidence: `CF-EV-P6-UT-005`, `CF-EV-P6-INT-003`, `CF-EV-P6-E2E-001`, `CF-EV-P6-SEC-006`.

### `CF-P6-007` - Implement conflict resolution and Copy to workspace

Size: XL | Entry: `P6-G3` | Exit: `P6-G3A`

Implement the explicit conflict experience — review latest, reapply to latest revision, save as a separate copy, discard with confirmation — with no automatic merge and no silent draft loss. Implement manual Copy to workspace with destination selection, data-classification confirmation, Credential rejection before encryption, and idempotent submission.

Acceptance: a `409` retains the local encrypted draft until the user acts; each resolution path is reachable, accessible without relying on color alone, and produces the expected revision outcome; Copy creates an unlinked destination document at revision 1 and leaves the personal source unchanged; a Credential document is not selectable and is rejected before destination encryption; a repeated copy returns the original result. Evidence: `CF-EV-P6-E2E-002`, `CF-EV-P6-QA-003`, `CF-EV-P6-SEC-007`, `CF-EV-P6-UX-001`.

### `CF-P6-008` - Integrate and qualify the isolated Preview document slice

Size: XL | Entry: `P6-G3A`; remote authorization: explicit `P6-G4` | Exit: `P6-G4A`

Integrate only the reviewed document routes on isolated Preview with real sessions, exact Origin and session-bound CSRF, live RBAC, scoped repositories, privacy-safe audit, bounded bodies/pages/rates, and synthetic users/devices. Run the multi-browser and multi-role journeys, the resilience and privacy matrices, the performance budgets, and the fallback, rollback, and cleanup procedures, then reconcile synthetic state.

Acceptance: the six sprint gate scenarios in section 6 pass on Preview; Production stays `503` with zero D1; GitHub Pages stays static and API-less; no test bypass, no shared Preview restore, and no plaintext leak. Evidence: `CF-EV-P6-E2E-003`, `CF-EV-P6-PERF-001`, `CF-EV-P6-SEC-008`, `CF-EV-P6-OPS-001`, `CF-EV-P6-QA-004`.

### `CF-P6-009` - Assemble Phase 6 exit and Phase 7 handoff

Size: M | Entry: `P6-G4A` | Exit: `P6-G5`

Reconcile every evidence record, schema digest, remote aggregate, deployment identifier, exception list, performance and browser profile, dependency and artifact result, rollback, recovery, risk review, and sign-off. Ship the automated `cf:phase6:exit:check` gate in the same commit as the exit report, matching Phases 3, 4, and 5. Publish stable document/revision/sync interfaces for Phase 7 without transferring plaintext.

Acceptance: zero P0/P1 exception or open defect, zero unowned or expired Critical/High risk, accurate recovery claims, an exit gate that rejects drift and records sign-off provenance truthfully, and recorded authorization. Production activation remains a separate later gate. Evidence: `CF-EV-P6-QA-005`, `CF-EV-P6-SEC-009`, `CF-EV-P6-OPS-002`, `CF-EV-P6-STA-002`.

## 6. Sprint gate scenarios

These six scenarios are the sprint's headline acceptance and must each hold on isolated Preview at `CF-P6-008`, with D1 side effects inspected rather than HTTP responses alone.

| # | Scenario | Required outcome |
|---|---|---|
| G1 | Personal documents unchanged | Personal Vault read/write/sync/export/tombstone byte-for-byte identical to the pre-refactor characterization baseline; zero personal writes triggered by any collaboration path |
| G2 | Editor creates, Viewer reads | Editor create returns `201` at revision 1; a Viewer in the same workspace reads the current document and its revision history successfully |
| G3 | Viewer cannot write | Viewer create/update/tombstone is denied by authorization with zero document, revision, idempotency, and business audit rows created |
| G4 | Two browsers, one base revision | Exactly one writer advances the revision; the other receives `409 DOCUMENT_REVISION_CONFLICT` with the current revision, retains its encrypted draft, and creates no revision |
| G5 | Network retry | A lost-response retry storm reusing the original mutation ID yields exactly one revision, one idempotency result, and one audit event |
| G6 | Offline mutation replay | A mutation queued while offline is submitted after reconnect, re-authorized at submission, and produces exactly one revision; a mutation whose authority changed while queued is quarantined instead |

## 7. Quality and performance budgets

- Correctness: 100% immutable envelope and fingerprint vector agreement with an independent oracle; zero downgrade or plaintext fallback.
- Concurrency: 20 concurrent writers on one base revision produce exactly one revision advance; 32 identical replays produce exactly one revision, one idempotency result, and one audit event.
- Isolation: zero personal-provider writes across the full collaboration test matrix, including every injected failure path.
- Preview authenticated document reads p95 ≤300 ms and writes p95 ≤500 ms under the approved ten-active-user profile, excluding provider latency.
- Client encrypt and decrypt of a representative document p95 ≤150 ms each; outbox flush of 25 queued entries p95 ≤5,000 ms.
- Personal/Guest startup requests zero eager Phase 6 collaboration modules; lazy Phase 6 chunk ≤60 KiB gzip, with the total collaboration startup ceiling remaining ≤75 KiB gzip.
- Bounds before crypto/D1: request ≤1 MiB, ciphertext envelope 18 B–1,048,576 B, `result_json` ≤4,096 B, page size bounded and opaque.
- Supported browsers: latest two stable Chrome, Edge, and Firefox plus Safari 17.4+. Unsupported, private-mode, or storage failure is an explicit fail-closed result, never a skip.
- Zero P0/P1 skip, quarantine, disabled case, conditional omission, accepted flake, open defect, plaintext canary, unauthorized write success, cross-workspace disclosure, or exploitable Critical/High dependency.

## 8. Recovery and operational matrix

Required rehearsals cover conflict during rotation, tombstone versus concurrent update, revoked device with pending outbox entries, removed member with pending outbox entries, outbox expiry and quarantine recovery, idempotency-window expiry, D1 fault at every atomic statement, adjacent-runtime and schema rollback, and disposable D1 restore.

Shared Preview Time Travel remains read-only with bookmark fingerprints only; a shared restore requires separate destructive approval and a disposable rehearsal first. Rollback preserves append-only revisions and monotonic key versions. Retention cleanup deletes idempotency rows in bounded batches and must never delete document revisions through the same job. Feature-flag disablement stops new submissions while preserving D1 revisions and local encrypted drafts.

## 9. Hard blockers and exit recommendation

The sprint stops on any plaintext document content outside transient authorized browser memory, any automatic Personal Vault upload or mirrored write, any personal-provider fallback on collaboration failure, crypto downgrade, malformed-input acceptance, nonce reuse, a Viewer or removed member completing a write, a second revision or audit event from a replay, silent conflict resolution, silent draft loss, partial atomic state, inaccurate recovery claim, first-party XSS able to use unlocked keys, a P0/P1 test exception, a Production binding or activation, or any fallback collaboration behavior.

`P6-G0` recommendation: **APPROVE `CF-P6-001` ONLY**. The recommendation does not pre-approve the schema-sufficiency finding, the route surface implementation, or any subsequent story.
