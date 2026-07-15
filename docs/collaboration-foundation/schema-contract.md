# Collaboration Foundation D1 Schema Contract

Status: Approved at Gate G3; executable migrations and evidence pending

Date: 2026-07-15

Owners: Technical Lead, Security Reviewer, Senior QA, Operations

## 1. Purpose

This contract turns the approved domain and ADR decisions into a relational D1 model, integrity rules, indexes, atomic mutation recipes, retention boundaries, and migration obligations. It is a design contract, not an executable migration. Day 5 may authorize Phase 1 implementation only after API, crypto, operations, and quality contracts agree with it.

Official platform references:

- [D1 Workers Binding API](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Pages Functions bindings](https://developers.cloudflare.com/pages/functions/bindings/)

## 2. Storage conventions

- D1 binding name: `COLLAB_DB` in all environments; its bound database is environment-specific.
- IDs are lowercase UUID v4 strings generated with Web Crypto, validated by the API, and stored as `TEXT`.
- GitHub numeric subjects are decimal strings in `TEXT`, never JavaScript numbers.
- Server times are UTC Unix milliseconds in `INTEGER`; API responses render RFC 3339 UTC strings.
- Digests and random token hashes are 32-byte `BLOB` values. Encoded API forms are unpadded base64url.
- Booleans are `INTEGER NOT NULL CHECK(value IN (0,1))`.
- Enumerations use `TEXT NOT NULL CHECK(...)`; unknown values fail rather than degrade.
- JSON is permitted only for versioned, size-bounded, allow-listed audit metadata or deterministic result envelopes. Protected content never appears in JSON columns.
- Foreign keys are explicit and migration/integration tests enable and verify enforcement.
- Every query uses prepared statements and explicit columns. `SELECT *`, string-built SQL, and cross-workspace queries without a workspace predicate are prohibited in runtime repositories.

## 3. Entity tables

### 3.1 `users`

| Column | Contract |
|---|---|
| `id` | `TEXT PRIMARY KEY` |
| `provider` | `TEXT`, Foundation value `github` |
| `provider_subject` | Stable GitHub numeric subject string |
| `display_login`, `display_name`, `avatar_url` | Bounded mutable display attributes; never authorization keys |
| `status` | `active` or `deactivated` |
| `created_at`, `updated_at`, `deactivated_at` | Server times; deactivated time nullable |

Constraints/indexes: unique `(provider, provider_subject)`; display fields are never unique identity constraints.

### 3.2 `oauth_transactions`

Stores only a 10-minute authentication transaction: `id`, `state_digest`, encrypted PKCE verifier envelope, exact callback origin/path identifier, optional invitation ID, created/expiry/consumed times, and one-time status. The encryption key is a production/preview-specific Cloudflare secret and is not stored in D1. Unique `state_digest`; index `expires_at`. Terminal rows are purged within 24 hours.

### 3.3 `sessions`

Columns: `id`, `token_digest`, `user_id`, `device_hint`, `created_at`, `last_seen_at`, `authenticated_at`, `idle_expires_at`, `absolute_expires_at`, `revoked_at`, `revoke_reason`.

Constraints/indexes:

- unique 32-byte `token_digest`;
- foreign key `user_id`;
- idle expiry never exceeds absolute expiry;
- indexes `(user_id, revoked_at)` and `(absolute_expires_at)`;
- raw cookie/session values never enter D1.

### 3.4 `workspaces`

Columns: `id`, bounded server-visible `display_name`, encrypted `description_envelope`, `state` (`active`, `rotating`, `deletion_pending`, `deleted`), `current_key_version`, `created_by`, `created_at`, `updated_at`, `deleted_at`.

Rules: key version starts at `1`; display name is 1-80 normalized Unicode characters and excluded from operational logs; an active workspace must have at least one active Owner membership.

### 3.5 `memberships`

Columns: `workspace_id`, `user_id`, `role` (`owner`, `admin`, `editor`, `viewer`), `state` (`pending_key`, `active`, `removed`), inviter/acceptor/remover IDs, `created_at`, `activated_at`, `removed_at`, `role_version`.

Primary key `(workspace_id, user_id)`. Indexes `(user_id, state)` and `(workspace_id, role, state)`. A role/state transition increments `role_version`. Last-Owner, Admin ceiling, and transition rules are enforced by repository guard conditions inside the same D1 batch as the mutation and audit event.

### 3.6 `invitations`

Columns: `id`, `workspace_id`, `target_provider`, `target_provider_subject`, bounded target login snapshot, `offered_role`, `token_digest`, `state` (`pending`, `accepted`, `revoked`, `expired`), inviter/acceptor IDs, `created_at`, `expires_at`, terminal times, and `replacement_of`.

Constraints/indexes:

- unique 32-byte `token_digest`;
- partial unique index on `(workspace_id, target_provider, target_provider_subject)` while `state='pending'`;
- index `(workspace_id, state, expires_at)`;
- expiry is exactly 72 hours from server creation time;
- raw token and delivery URL are prohibited.

### 3.7 `devices`

Columns: `id`, `user_id`, bounded user label, canonical public JWK, 32-byte public-key fingerprint, algorithm suite, `state` (`active`, `revoked`), created/revoked times and reason.

Unique `(user_id, fingerprint)`; indexes `(user_id, state)`. Private keys, encrypted local PKCS#8 envelopes, unlock secrets, and KEKs never enter D1.

### 3.8 `workspace_key_versions`

Columns: `workspace_id`, `key_version`, `suite`, `state` (`preparing`, `current`, `retired`, `aborted`), rotation reason, creator device/user, created/committed/retired times.

Primary key `(workspace_id, key_version)`. The proposed version must equal current version plus one. Only one version is `current`; a partial unique index enforces this. Version gaps, reuse, and downgrade are prohibited.

### 3.9 `workspace_key_envelopes`

Columns: `id`, `workspace_id`, `key_version`, target user/device/fingerprint, wrapper user/device, suite, ephemeral public JWK, HKDF salt, nonce, DEK ciphertext/tag, canonical AAD digest, created/revoked times.

Unique `(workspace_id, key_version, target_device_id)`. Foreign keys bind workspace version, target device/user, and wrapper device/user. Strict lengths and algorithm identifiers follow `crypto-contract.md`. No plaintext DEK is stored.

### 3.10 `documents`

Columns: `id`, `workspace_id`, `current_revision`, `current_key_version`, `current_ciphertext_digest`, `ciphertext_bytes`, `envelope_version`, `state` (`active`, `tombstoned`), creator ID, server created/updated/tombstoned times.

Primary key `id`; unique `(workspace_id, id)`; indexes `(workspace_id, state, updated_at, id)` and `(workspace_id, updated_at, id)`. No title, category, status, tag, body, custom field, or search index is server-visible.

### 3.11 `document_revisions`

Columns: `document_id`, `workspace_id`, `revision`, `base_revision`, `operation` (`create`, `update`, `delete`), `key_version`, ciphertext envelope/digest/byte count, actor/device IDs, `client_mutation_id`, `server_time`.

Primary key `(document_id, revision)`; unique `(workspace_id, actor_user_id, actor_device_id, client_mutation_id)`; indexes `(workspace_id, server_time, document_id)` and `(document_id, server_time)`. Rows are append-only to application code. A delete revision has a tombstone intent and no plaintext reason.

### 3.12 `mutation_results`

This is both the idempotency ledger and the first atomic guard row. Columns: `id`, actor/device/workspace, operation, `client_mutation_id`, 32-byte canonical request fingerprint, target type/ID, HTTP status, bounded deterministic result JSON, created/expiry times.

Unique `(actor_user_id, actor_device_id, workspace_id, operation, client_mutation_id)`. Records expire after 30 days. Result JSON contains only opaque IDs, revision, server time, and stable status/error fields.

### 3.13 `audit_events`

Columns: monotonic `sequence INTEGER PRIMARY KEY AUTOINCREMENT`, unique event UUID, schema version, workspace ID, event type, outcome/reason, actor/device/target opaque IDs, request ID, server time, bounded allow-listed metadata JSON, optional correction/related event IDs, hold state.

Indexes `(workspace_id, sequence)`, `(workspace_id, server_time, sequence)`, `(server_time)`, and `(event_type, server_time)`. Application callers cannot update/delete events. Workspace audit baseline retention is 365 days unless an approved hold applies.

### 3.14 `retention_holds`

Columns: `id`, `workspace_id`, hold type/reason code, creator, created/expiry/released times, and status. It contains no free-form document content. Only an approved operational path may create or release a hold, and each action produces an audit event.

## 4. Atomic mutation model

D1 `batch()` is the required multi-statement boundary: statements execute sequentially and a statement failure rolls back the sequence. Runtime code must not emulate an interactive `BEGIN` across network calls.

### 4.1 Guard-row pattern

Every security/domain batch starts by inserting a `mutation_results` or dedicated transition guard row. Required conditions are expressed as scalar subqueries that return a non-null constant only when the live session, user, membership, role/version, device, workspace/resource state, key version, and revision all match. The guard column is `NOT NULL`; an unmet condition causes a constraint failure and rolls back the entire batch rather than producing a successful zero-row write.

The batch then applies domain rows and exactly one required audit event. The final statement returns the deterministic result. Repository code maps the guard/constraint reason to the stable API error without returning SQL text.

### 4.2 Idempotent replay and races

Before a new batch, the repository looks up the scoped mutation ID. A matching fingerprint may return the stored result only after current authentication and authorization are rechecked. A different fingerprint returns `IDEMPOTENCY_KEY_REUSED`.

If two first submissions race, one unique guard insert wins. The loser re-reads through a D1 session started with `first-primary`; it returns the stored result only if fingerprint and live authority match. No retry invents a new mutation ID.

### 4.3 Required atomic recipes

| Operation | One batch must contain |
|---|---|
| Workspace create | guard; workspace; initial Owner membership; key version 1 metadata; creator envelope; audit; deterministic result |
| Invitation replace/create | live inviter/role guard; revoke prior pending target invitation; insert one pending invitation; audit; result |
| Invitation accept | exact subject/token/state/expiry guard; consume invitation; create `pending_key` membership; audit; result |
| Role/member change | live policy/role-version/last-Owner guard; update membership; revoke affected invitations/devices when required; audit; result |
| Envelope provision | live wrapper and target/fingerprint/version guard; insert unique envelope; activate target readiness where complete; audit; result |
| Document mutation | live role/device/key/revision guard; append revision; advance document pointer/state; audit; result |
| Rotation commit | Owner/reauth/current-version/complete eligible envelope-set guard; insert/commit next version; retire prior version; update workspace; audit; result |

Failure injection must prove that no listed recipe leaves a partial membership, key, revision, idempotency, or audit state.

## 5. Read consistency and pagination

- Authorization-sensitive reads and read-after-write responses use a D1 session with `first-primary` or the previous valid bookmark.
- A response may return an opaque D1 bookmark only in a server-signed/opaque cursor; clients do not select arbitrary consistency modes.
- List cursors bind environment, user, workspace, route, sort fields, filter set, limit, and expiry. Cross-route/workspace replay fails.
- Stable keyset pagination uses `(updated_at, id)` for documents, `(server_time, sequence)` for audit, and equivalent unique tie-breakers; offset pagination is prohibited for mutable collections.
- Default page size is 50; maximum is 100.

## 6. Retention and deletion

| Data | Contract |
|---|---|
| OAuth transactions | Purge terminal/expired rows within 24 hours |
| Sessions | Purge 30 days after expiry/revocation |
| Invitations | Purge terminal row/token digest after 30 days; retain allow-listed audit |
| Mutation results | Purge 30 days after completion |
| Audit | 365 days unless legal/incident hold |
| Revisions/tombstones | Retained until a later approved physical-deletion policy |
| Devices/key versions/envelopes | Retain security history needed to explain versions/revocation; no plaintext secret exists |

Purge jobs are server-time based, bounded, idempotent, monitored, and isolated per record type. Workspace export and physical deletion endpoints remain unavailable in Foundation until their separate format and lifecycle contracts pass.

## 7. Migration and environment contract

- Immutable zero-padded SQL migrations live under a future `migrations/` directory and are applied with Wrangler outside request handling.
- `PRAGMA foreign_key_check`, schema-version checks, uniqueness/invariant queries, and canary reads run after each migration.
- Preview and production have different D1 database IDs; configuration generation/testing must fail if they match.
- Expand/contract compatibility and feature-flag sequence follow ADR-012. An applied migration is never edited.
- Before production migration, record the current D1 Time Travel bookmark and confirm the database uses the production storage backend.
- Restore rehearsal uses an isolated target/export workflow when available; an in-place Time Travel restore is an incident action with explicit authorization and traffic containment.

## 8. Prohibited schema designs

- plaintext document semantics, workspace description, credentials, keys, tokens, secrets, request bodies, or free-form audit text;
- role or workspace authority copied into untrusted client-controlled rows;
- authorization by opaque ID alone;
- timestamp last-write-wins;
- cascade deletion of audit, revision, key history, or last Owner from a normal application request;
- polymorphic rows without validated type-specific constraints;
- destructive migration combined with the first runtime that requires it.

## 9. Verification contract

- Run every migration on empty, populated, repeated, previous-version, malformed, and restored databases.
- Parameterize every role/resource/state path and inspect all table side effects.
- Race invitation acceptance, last-Owner transitions, document CAS, duplicate mutation IDs, envelope provisioning, and rotation commits.
- Inject a failure at every D1 batch statement and require complete rollback.
- Scan every column, audit JSON, error, log, export, and fixture for sensitive canaries.
- Measure index/query plans at the approved 10,000-document/50-revision workload.
- Rehearse retention boundaries and restore integrity with deterministic time.

## 10. Traceability

ADRs: 001, 002, 003, 004, 005, 006, 008, 009, 010, 012. Requirements: CF-ID, CF-SES, CF-WS, CF-RBAC, CF-INV, CF-DEV, CF-KEY, CF-DOC, CF-SYNC, CF-AUD, CF-OPS. Threats: T01-T23, especially T02, T05-T12, T15-T16, T19-T20, and T23.

## 11. Gate G3 acceptance

- [x] Technical Lead confirms every API resource and transition has a table, constraint, index, and atomic recipe.
- [x] Security confirms prohibited plaintext/secret fields and final authorization guards.
- [x] Senior QA confirms migration, constraint, race, failure-injection, canary, scale, retention, and restore evidence is measurable.
- [x] Operations confirms D1 binding isolation, Time Travel bookmark, migration, purge, and restore procedures are implementable.
- [x] API and crypto contracts use the same identifiers, envelopes, limits, and lifecycle states.
- [x] No core invariant depends on UI behavior, client time, or a successful zero-row SQL statement.
