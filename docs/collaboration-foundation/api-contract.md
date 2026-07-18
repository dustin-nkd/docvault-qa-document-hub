# Collaboration Foundation API Contract

## Document control

| Field | Value |
| --- | --- |
| Document ID | CF-API-001 |
| Status | Approved at Gate G3; implementation evidence pending |
| Version | 0.1 / API v1 |
| Date | 2026-07-15 |
| Owners | Technical Lead, Product Owner, Security Reviewer, Senior QA |
| Canonical production origin | `https://docvault-qa-document-hub.pages.dev` |
| Server boundary | Same-origin Cloudflare Pages Functions under `/api/v1` |
| Authority | Approved ADR-001 through ADR-012; requirements remain controlling where not refined here |

This is an implementation contract, not runtime code or implementation authorization. Normative terms **MUST**, **MUST NOT**, **SHOULD**, and **MAY** have their RFC 2119 meanings.

## 1. Protocol, versioning, and common representation

### 1.1 Transport and version

- Production accepts HTTPS only at the exact configured host. Preview uses its own exact origin, data, secrets, OAuth application, and cookie namespace.
- The major version is in the path: `/api/v1`. Breaking semantic or field changes require `/api/v2`; additive optional response fields MAY be introduced in v1 only when old clients safely ignore them.
- Requests with JSON bodies MUST use `Content-Type: application/json; charset=utf-8`. Missing or other media types return `415 UNSUPPORTED_MEDIA_TYPE`. Malformed JSON returns `400 INVALID_JSON`.
- Responses use `Content-Type: application/json; charset=utf-8`, except OAuth callback redirects and empty `204` responses.
- Clients SHOULD send `Accept: application/json`. An incompatible `Accept` returns `406 NOT_ACCEPTABLE`.
- Unknown request fields are rejected. Clients MUST treat unknown response fields as additive and ignore them.
- Opaque IDs are server-generated URL-safe strings of 16–64 characters unless stated otherwise. `clientMutationId` and `Idempotency-Key` are UUIDv4 or an equivalent 128-bit-or-greater opaque value, maximum 128 characters.
- Timestamps are authoritative UTC RFC 3339 strings with millisecond precision. Client timestamps never determine authorization, expiry, ordering, revision, or audit attribution.

### 1.2 Canonical envelopes

Every JSON success is:

```json
{
  "data": {},
  "meta": {
    "requestId": "req_opaque",
    "apiVersion": "v1"
  }
}
```

List responses add `page` to `meta`:

```json
{
  "data": { "items": [] },
  "meta": {
    "requestId": "req_opaque",
    "apiVersion": "v1",
    "page": { "limit": 50, "nextCursor": null }
  }
}
```

Every JSON failure is:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe English message.",
    "details": {}
  },
  "meta": {
    "requestId": "req_opaque",
    "apiVersion": "v1"
  }
}
```

`details` is omitted unless this contract explicitly allows fields. It never echoes request bodies, secrets, tokens, ciphertext, cross-workspace IDs, SQL, stack traces, or provider errors.

The server generates a unique request ID and returns it in both `X-Request-ID` and `meta.requestId`. An incoming `X-Request-ID` is untrusted correlation input and MUST NOT replace the server ID; if retained at all, it is separately bounded and sanitized.

### 1.3 Cache and browser rules

- All `/api/v1/*`, OAuth, session, invitation, device, key, audit, and error responses use `Cache-Control: no-store, private`; compatibility headers MAY add `Pragma: no-cache` and `Expires: 0`.
- The Service Worker bypasses `/api/*` and OAuth callback paths before any cache lookup or navigation fallback. An API request never returns app-shell HTML.
- API capability is absent on GitHub Pages. That origin makes no collaboration calls and cannot transfer collaboration cookies, local keys, or invitation tokens to itself.
- Responses use `X-Content-Type-Options: nosniff`, the approved CSP and `frame-ancestors`, restrictive `Referrer-Policy`, and approved `Permissions-Policy`.

## 2. Session, CSRF, origin, and request gates

### 2.1 Session cookie

- The opaque session token exists only in a cookie and request memory. D1 stores its keyed HMAC-SHA-256 digest.
- Cookie attributes: `Secure; HttpOnly; SameSite=Lax; Path=/`; no `Domain` attribute. Preview and production use different names and keys.
- Idle expiry is 12 hours; absolute expiry is 7 days. Session rotation occurs after login, reauthentication, relevant identity security changes, and suspected fixation.
- High-risk actions require `authenticatedAt` no more than 15 minutes old.
- Logout revokes the server session before clearing the cookie. A valid session never caches membership or device authority.

### 2.2 Origin and CSRF

- Every request validates exact configured scheme/host. No wildcard or reflected credentialed CORS is allowed.
- Every state-changing authenticated request requires exact allowed `Origin` and `X-CSRF-Token`, bound to the current session. The CSRF token is obtained from `GET /session`, held in memory, and never accepted in a URL.
- Missing, `null`, or unapproved Origin fails before domain mutation. SameSite is defense in depth, not a CSRF substitute.
- The unauthenticated OAuth transaction and invitation bootstrap POSTs require exact Origin but no session CSRF token. They are narrowly schema-bound and rate-limited.
- OAuth callback GET is the sole protocol exception to side-effect-free GET: it consumes the provider transaction after exact redirect, state, PKCE, and one-use validation.

### 2.3 Authorization evaluation

For every protected request, in this order, the API:

1. validates and derives the live session/user;
2. validates the acting device where the route is device-bound;
3. resolves membership and resource under the same workspace scope;
4. checks current membership state, role ceiling, device state, key readiness/version, resource lifecycle, and recent-auth requirement;
5. validates schema, bounds, preconditions, and idempotency binding;
6. commits the domain mutation and required audit event atomically.

Client `actorId`, role, owner, membership, device ownership, workspace authority, result revision, and server time are ignored. `pending_key` may use only status and its authorized device/provisioning flow; it cannot use protected document routes. Removed membership and revoked devices fail on the next request. Unauthorized/out-of-scope/not-found resources share a non-enumerating response.

## 3. Route catalog

Legend: `Public` still requires exact-origin and rate controls. Roles imply active membership unless `pending_key` is stated. `IK` means required `Idempotency-Key` header. All mutations require JSON, allowed Origin, and CSRF unless explicitly public.

| Method and path | Auth / role | Idempotency | Success | Contract |
| --- | --- | --- | --- | --- |
| `POST /api/v1/oauth/github/transactions` | Public | None | `201` | Create 10-minute, single-use state/PKCE transaction; body includes purpose |
| `GET /api/v1/oauth/github/callback` | Provider callback | Provider transaction | `303` | Exact callback; establishes/rotates session; redirects to safe relative route |
| `GET /api/v1/session` | Optional session | None | `200` | Current session/user plus in-memory CSRF token, or authenticated=false |
| `POST /api/v1/session/logout` | Session | Session operation | `204` | Revoke session, then clear cookie |
| `GET /api/v1/devices` | Session | None | `200` | List caller's devices |
| `POST /api/v1/devices` | Session | IK | `201` | Register caller's public device identity |
| `DELETE /api/v1/devices/{deviceId}` | Own device, or Owner/Admin ceiling | IK | `204` | Revoke; another-user revoke requires recent auth and ADR-003 ceiling |
| `GET /api/v1/workspaces` | Session | None | `200` | List caller's non-removed memberships and readiness |
| `POST /api/v1/workspaces/bootstrap-intents` | Session + active own device | IK | `200` | Deterministically prepare the opaque workspace ID and creator-envelope binding; no D1 mutation |
| `POST /api/v1/workspaces` | Session + active own device | IK | `201` | Atomic workspace/Owner/key v1/initial envelope/audit creation |
| `GET /api/v1/workspaces/{workspaceId}` | Member including `pending_key` | None | `200` | Workspace summary and caller readiness; no protected description without key-ready client |
| `GET /api/v1/workspaces/{workspaceId}/members` | Active member | None | `200` | Paginated members; approved server-visible fields only |
| `PATCH /api/v1/workspaces/{workspaceId}/members/{userId}` | Owner or Admin within ceiling | IK | `200` | Change role; Owner transfer is excluded |
| `DELETE /api/v1/workspaces/{workspaceId}/members/{userId}` | Owner or Admin within ceiling | IK | `204` | Atomic removal/revocation effects/audit; last Owner denied |
| `POST /api/v1/workspaces/{workspaceId}/ownership-transfers` | Owner + recent auth | IK | `200` | Atomic strongly confirmed transfer to active target member |
| `GET /api/v1/workspaces/{workspaceId}/invitations` | Owner/Admin | None | `200` | Paginated pending invitation metadata |
| `POST /api/v1/workspaces/{workspaceId}/invitations` | Owner/Admin within invite ceiling | IK | `201` | Resolve GitHub username to immutable subject; issue raw fragment token once |
| `DELETE /api/v1/workspaces/{workspaceId}/invitations/{invitationId}` | Owner/Admin within revoke ceiling | IK | `204` | Revoke pending invitation |
| `POST /api/v1/invitations/bootstrap` | Public/optional session | None | `200` | Inspect raw fragment token from JSON body; minimum context only, no membership |
| `POST /api/v1/invitations/accept` | Session + own active device | IK | `201` | Accept matching immutable subject once; create `pending_key` membership |
| `GET /api/v1/workspaces/{workspaceId}/devices` | Active Owner/Admin; pending target may list own only | None | `200` | Canonical public keys/fingerprints for authorized provisioning scope |
| `GET /api/v1/workspaces/{workspaceId}/key-envelopes/current` | Exact active target user/device | None | `200` | Return caller device's current bound envelope or typed pending state |
| `PUT /api/v1/workspaces/{workspaceId}/key-envelopes/{targetDeviceId}` | Active key-ready Owner/Admin device | IK | `200/201` | Create exact target/version envelope with fingerprint compare-and-set |
| `POST /api/v1/workspaces/{workspaceId}/key-rotations` | Owner + key-ready device + recent auth | IK | `201` | Prepare `current+1` rotation and eligible-device snapshot; no version change yet |
| `PUT /api/v1/workspaces/{workspaceId}/key-rotations/{rotationId}/envelopes/{targetDeviceId}` | Initiating Owner device | IK | `200/201` | Stage one bound new-version envelope |
| `POST /api/v1/workspaces/{workspaceId}/key-rotations/{rotationId}/commit` | Initiating Owner + recent auth | IK | `200` | Brief write freeze; atomically validate/commit new version, envelopes, audit |
| `DELETE /api/v1/workspaces/{workspaceId}/key-rotations/{rotationId}` | Initiating Owner | IK | `204` | Abort uncommitted preparation; current key remains unchanged |
| `GET /api/v1/workspaces/{workspaceId}/key-rotations/{rotationId}` | Active Owner/Admin | None | `200` | Rotation and re-encryption progress metadata |
| `GET /api/v1/workspaces/{workspaceId}/documents` | Active key-ready member/device | None | `200` | Paginated encrypted current-document envelopes; no semantic search/filter |
| `POST /api/v1/workspaces/{workspaceId}/documents` | Owner/Admin/Editor + key-ready device | IK | `201` | Create encrypted document at revision 1 |
| `GET /api/v1/workspaces/{workspaceId}/documents/{documentId}` | Active key-ready member/device | None | `200` | Current encrypted revision or tombstone metadata |
| `PUT /api/v1/workspaces/{workspaceId}/documents/{documentId}` | Owner/Admin/Editor + key-ready device | IK | `200` | Compare-and-set encrypted update |
| `POST /api/v1/workspaces/{workspaceId}/documents/{documentId}/tombstone` | Owner/Admin/Editor + key-ready device | IK | `200` | Compare-and-set revisioned soft delete |
| `GET /api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions` | Active key-ready member/device | None | `200` | Paginated encrypted revision metadata/payloads |
| `GET /api/v1/workspaces/{workspaceId}/documents/{documentId}/revisions/{revision}` | Active key-ready member/device | None | `200` | One authorized encrypted historical revision |
| `GET /api/v1/workspaces/{workspaceId}/mutations/{clientMutationId}` | Same active actor/device binding | None | `200` | Reconcile an uncertain outbox result within 30-day window |
| `GET /api/v1/workspaces/{workspaceId}/audit-events` | Owner/Admin | None | `200` | Paginated allow-listed audit events |
| `POST /api/v1/workspaces/{workspaceId}/exports` | Owner + recent auth | None | Denied | Reserved; `409 LIFECYCLE_POLICY_UNAVAILABLE`, no export side effect |
| `POST /api/v1/workspaces/{workspaceId}/deletion-requests` | Owner + recent auth | None | Denied | Reserved; `409 LIFECYCLE_POLICY_UNAVAILABLE`, no lifecycle side effect |

Methods not listed return `405 METHOD_NOT_ALLOWED` with a fixed `Allow` header only after route-template resolution. Batch document operations, server semantic search, recovery-artifact import/export, server key recovery, hard revision delete, and restore are absent in Foundation.

## 4. Field schemas

All objects reject unknown fields. Strings are Unicode, normalized only where explicitly stated, and rendered as text. Bytes are unpadded base64url. Hashes/digests and raw secrets are never returned unless the value is a one-time client capability explicitly described below.

### 4.1 OAuth and session

`OAuthTransactionRequest`:

| Field | Type / constraint |
| --- | --- |
| `purpose` | Enum `sign_in`, `reauthenticate` |
| `returnPath` | Optional same-origin relative path, maximum 512 characters; no scheme, host, backslash, or control character |

Response: `{ authorizationUrl, expiresAt }`. The URL names only the approved GitHub authorization origin and exact callback. State and PKCE verifier are not exposed elsewhere.

Callback query accepts exactly provider `code` and `state` (or allow-listed provider error fields); it returns no JSON secrets and redirects `303` to the validated stored relative path. Failure redirects to a generic same-origin auth result containing a one-time non-secret result code, never provider values.

`SessionView`:

| Field | Type / meaning |
| --- | --- |
| `authenticated` | Boolean |
| `user` | When authenticated: `{ userId, provider:"github", providerSubject, login, displayName, avatarUrl? }`; mutable display fields are not authority |
| `session` | When authenticated: `{ createdAt, authenticatedAt, idleExpiresAt, absoluteExpiresAt }` |
| `csrfToken` | When authenticated: synchronizer token for memory-only use |

### 4.2 Workspaces, memberships, and roles

`WorkspaceCreateRequest`:

| Field | Type / constraint |
| --- | --- |
| `displayName` | Unicode string normalized under the approved text rule, 1–80 characters; server-visible and must not contain secrets |
| `encryptedDescription` | Optional `CiphertextEnvelope`, maximum 64 KiB encoded |
| `ownerDeviceId` | Caller's active device ID |
| `initialKeyVersion` | Integer, exactly `1` |
| `initialKeyEnvelope` | `KeyEnvelope`, bound to creator/owner device and version 1 |

`WorkspaceBootstrapIntentRequest` contains exactly `displayName`, optional `encryptedDescription`, and `ownerDeviceId`. The server derives the same opaque `workspaceId` from the live user/device and `Idempotency-Key` that the final create will use, and returns `{ workspaceId, initialKeyVersion:1, ownerDeviceId, ownerFingerprint }`. It stores nothing and creates no workspace, membership, key, envelope, audit event, or mutation result. The response is `no-store`; replay with the same live authority and key is deterministic.

The client generates the workspace DEK and creator envelope only after receiving this binding. The final `POST /workspaces` uses the same `Idempotency-Key`, exact request fields above, and the returned binding. One D1 batch creates the mutation guard, workspace, active Owner membership, current key-version row, creator envelope, audit event, and deterministic result. Any mismatch or failure creates none of them. The server never generates, receives, logs, or recovers the plaintext DEK.

`WorkspaceView`: `{ workspaceId, displayName, encryptedDescription?, lifecycleState, currentKeyVersion, createdAt, updatedAt, callerMembership }`.

`callerMembership` and `MembershipView`: `{ userId, role, state, keyReadiness, joinedAt, removedAt?, displayProfile }`, where role is `owner|admin|editor|viewer`, state is `pending_key|active|removed`, and key readiness is `not_entitled|pending_key|key_ready|stale_key|revoked`. `displayProfile` contains approved mutable provider display fields only.

`RoleChangeRequest`: `{ role: "admin"|"editor"|"viewer" }`. Admin may send only `editor|viewer` and only for an Editor/Viewer target. Owner is never assigned here.

`OwnershipTransferRequest`: `{ targetUserId, confirmation: "TRANSFER_OWNERSHIP" }`. Target is an active Admin/Editor/Viewer member; commit promotes target to Owner and demotes prior Owner to Admin atomically while preserving at least one Owner.

### 4.3 Invitations and fragment bootstrap

`InvitationCreateRequest`: `{ githubUsername, role }` where username is 1–39 characters after approved GitHub syntax normalization and role is `admin|editor|viewer` within ADR-003 ceiling.

The server resolves the username at creation to `github:<stable-numeric-id>`. The immutable subject is acceptance authority; username is a display snapshot only. Success returns:

```json
{
  "invitation": {
    "invitationId": "inv_opaque",
    "workspaceId": "ws_opaque",
    "role": "editor",
    "targetDisplayLogin": "octocat",
    "state": "pending",
    "expiresAt": "2026-07-18T00:00:00.000Z"
  },
  "acceptanceUrl": "https://canonical.example/#/invite/RAW_TOKEN"
}
```

The token has at least 256 random bits, appears only in the URL fragment, is returned once, expires exactly 72 hours after server creation time, and is stored server-side only as an approved cryptographic digest. The server never receives the fragment during the initial page request.

The official client extracts the fragment without logging, analytics, referrer, history persistence, or Cache Storage, removes it from the address bar using history replacement, and sends `InvitationBootstrapRequest { token }` in the POST body. Bootstrap response contains only `{ invitationId, workspaceDisplayName, targetDisplayLogin, role, expiresAt, state, identityMatch? }`; it grants no authority.

`InvitationAcceptRequest`: `{ token, deviceId }`. The current user's immutable GitHub subject must match. Atomic success consumes the invitation and creates `{ membership: MembershipView }` in `pending_key`; it does not create or imply a usable key envelope.

Invitation list item: `{ invitationId, targetDisplayLogin, role, state:"pending", createdAt, expiresAt, inviterUserId }`. Terminal invitation records are not returned by this list and are retained 30 days for controlled/audit purposes.

### 4.4 Devices, envelopes, and rotation

`DeviceCreateRequest`:

| Field | Type / constraint |
| --- | --- |
| `displayLabel` | Optional text, 1–80 characters; no secrets |
| `publicJwk` | EC public JWK with `kty:"EC"`, `crv:"P-256"`, `x`, `y`, `ext:true`, `key_ops:[]`; no `d`, unknown fields, or alternate curve |
| `fingerprint` | base64url SHA-256 of canonical approved JWK fields; server recomputes and requires equality |
| `suite` | `P256-HKDF-SHA256-A256GCM-v1` |

`DeviceView`: `{ deviceId, userId, displayLabel?, publicJwk, fingerprint, suite, state:"active"|"revoked", createdAt, revokedAt? }`. Public keys are returned only within authorized own/provisioning scope.

`KeyEnvelope`:

| Field | Type / constraint |
| --- | --- |
| `version` | `1` |
| `suite` | `P256-HKDF-SHA256-A256GCM-v1` |
| `workspaceId`, `targetUserId`, `targetDeviceId`, `wrapperDeviceId` | Exact opaque binding IDs |
| `targetFingerprint` | Exact current canonical target fingerprint |
| `keyVersion` | Positive integer; exact required workspace version |
| `ephemeralPublicJwk` | Valid canonical EC/P-256 public JWK |
| `hkdfSalt` | Exactly 32 bytes; empty forbidden |
| `nonce` | Exactly 12 bytes |
| `ciphertext` | AES-GCM wrapped 32-byte DEK plus tag; bounded envelope total ≤ 8 KiB |

Envelope submission is compare-and-set against current target fingerprint, membership/device state, wrapper authority, suite, and key version. Server timestamps and wrapper actor are derived.

`RotationCreateRequest`: `{ reason }`, where reason is allow-listed `member_removed|device_compromised|owner_security_event|key_exposure_suspected`. Response identifies `{ rotationId, fromKeyVersion, toKeyVersion, eligibleDevices[], state:"preparing" }`.

Each staged envelope uses `KeyEnvelope` with `toKeyVersion`. Commit request is `{ expectedCurrentKeyVersion, eligibleSetDigest }`. Commit requires exactly `current+1`, validates the current eligible set, briefly blocks new writes, atomically commits the version/envelopes/reason/actor/audit, then unblocks. Replay is deterministic; gaps/downgrade fail. New writes require the new version. Old-version offline writes are quarantined for user-reviewed re-encryption.

Rotation status: `{ rotationId, fromKeyVersion, toKeyVersion, state, eligibleCount, stagedCount, committedAt?, reencryptedDocumentCount, liveDocumentCount }`. Counts and IDs reveal no document semantics. No recovery bundle, private-key import/export, escrow, reset, or server plaintext recovery schema exists.

### 4.5 Documents, revisions, conflicts, and outbox replay

#### Eligibility and E2EE limitation

The official Copy-to-workspace workflow MUST reject Credential documents before destination encryption. All other current DocVault document categories are eligible through the official workflow. The personal source is decrypted locally, validated locally, copied to a new document ID, encrypted under the workspace key, and uploaded; the source remains unchanged and unlinked.

`category`, title, status, tags, content, and category-specific fields are inside opaque ciphertext under ADR-005. Therefore the API **cannot inspect or prove** whether ciphertext contains a Credential document. It can validate only declared envelope/routing fields, cryptographic format/bounds, key version, authorization, and revision rules. An authorized malicious or modified client can falsely package credential content as an otherwise valid encrypted payload; E2EE prevents server-side semantic rejection. The server and tests MUST NOT claim plaintext credential validation or universal enforcement against an authorized malicious client. Gate G3 must reconcile CF-DOC-004/AB-11 wording with this technical boundary while preserving official-client rejection and truthful residual risk.

`CiphertextEnvelope`:

| Field | Type / constraint |
| --- | --- |
| `version` | `1` |
| `suite` | `A256GCM-v1` |
| `keyVersion` | Current required positive integer |
| `contentSchemaVersion` | Allow-listed non-semantic schema version |
| `nonce` | Exactly 12 bytes, fresh per encryption |
| `ciphertext` | Base64url bytes; complete encoded request remains within route limit |
| `aad` | Canonical object binding envelope version, workspace ID, document ID, revision intent, key version, and content-schema version |

No plaintext semantic field is accepted at document top level. Unsupported or mismatched envelope fields fail closed; the server does not decrypt or authenticate content on its own.

`DocumentCreateRequest`:

```json
{
  "documentId": "doc_client_opaque",
  "deviceId": "dev_opaque",
  "keyVersion": 1,
  "createPrecondition": "absent",
  "payload": { "version": 1, "suite": "A256GCM-v1", "keyVersion": 1, "contentSchemaVersion": 1, "nonce": "...", "ciphertext": "...", "aad": {} }
}
```

`DocumentUpdateRequest`: `{ deviceId, baseRevision, keyVersion, payload }`. `DocumentTombstoneRequest`: `{ deviceId, baseRevision, keyVersion, tombstone:true }`. The required `Idempotency-Key` is the `clientMutationId`; it is bound to actor, verified device, workspace, operation, resource, precondition, key version, ciphertext digest, and validated metadata.

`DocumentView`: `{ documentId, workspaceId, currentRevision, keyVersion, envelopeVersion, ciphertextByteLength, lifecycleState:"active"|"tombstoned", createdAt, updatedAt, payload? }`. Lists MAY omit `payload` only when explicitly requested with `includePayload=false`; they cannot filter on encrypted semantics.

`RevisionView`: `{ documentId, revision, baseRevision, keyVersion, envelopeVersion, ciphertextByteLength, actorUserId, deviceId, clientMutationId, occurredAt, tombstone, payload? }`. Prior revisions are immutable and retained until a later approved physical-deletion policy.

Successful create/update/tombstone returns `{ documentId, revision, occurredAt, clientMutationId, operation, replayed }`. Identical authorized replay returns the original result with `replayed:true`, without a new revision or audit event.

An authorized stale update returns `409 DOCUMENT_REVISION_CONFLICT` with only:

```json
{
  "error": {
    "code": "DOCUMENT_REVISION_CONFLICT",
    "message": "The document changed after your base revision.",
    "details": { "submittedBaseRevision": 4, "currentRevision": 5 }
  },
  "meta": { "requestId": "req_opaque", "apiVersion": "v1" }
}
```

No mutation/revision/business audit is created. The client retains its encrypted draft and explicitly reviews latest, reapplies to latest, saves an authorized separate copy, exports an encrypted draft backup, or discards with confirmation. No automatic merge exists.

Outbox entries remain client-side encrypted IndexedDB records; there is no bulk outbox upload API. Replay uses the same document route and original `Idempotency-Key`. Per-document FIFO and explicit dependency order are client requirements. `GET /mutations/{clientMutationId}` returns `{ state:"applied"|"conflict"|"rejected", result }` only for the exact authenticated actor/device/workspace binding. Idempotency results expire 30 days after completion; later reconciliation returns `IDEMPOTENCY_WINDOW_EXPIRED`.

The official outbox limits are 100 pending entries, 25 MiB per environment/user/device, 80% warning, seven-day entry expiry, and normal per-entry API size. `401`, `403`, `409`, key-version mismatch, validation, and lifecycle failures are not automatically retried. Account/workspace change, removal, device revoke, key rotation, incompatible schema, or expiry quarantines the entry.

### 4.6 Audit

`AuditEventView` contains only:

```text
eventId, workspaceId, schemaVersion, eventType, occurredAt, order,
requestId, actorUserId?, deviceId?, systemReason?, targetType?, targetId?,
outcome, reasonCode?, approvedBefore?, approvedAfter?, linkedEventId?
```

The versioned event registry defines fields per allow-listed event type. Unknown event types, arbitrary JSON, free text, client actor/time, document semantics, ciphertext bodies, envelopes, tokens, secrets, SQL, and stacks are rejected. Required event families cover workspace/ownership/lifecycle; invitations/membership/roles; devices/envelopes/rotation; document create/update/tombstone; and authorized audit access. Successful domain mutation and its required event commit together; replay does not duplicate an event.

Only Owner/Admin may list audit events. Filters are `eventType` allow-list, `occurredFrom`, and `occurredTo`; no content query. Workspace audit retention is 365 days; legal/incident hold may extend, never shorten, it. Application routes cannot update/delete events; corrections append a linked event.

## 5. Pagination and cursors

- List routes accept `limit` (default 50, maximum 100) and `cursor`. Offset pagination is not supported.
- Cursor is opaque, integrity-protected, and bound to route, workspace, normalized filters, ordering key, and environment. Clients MUST NOT construct or interpret it.
- Default ordering is a stable server tuple appropriate to the resource, normally `(serverTime DESC, opaqueId DESC)`; audit uses `(occurredAt DESC, order DESC)` and revisions use revision descending.
- `nextCursor` is `null` at the end. Invalid, expired, filter-mismatched, or cross-workspace cursors return `400 INVALID_CURSOR` without revealing embedded data.
- Page traversal never grants authority. Authorization is repeated on every page request; removal during traversal blocks the next page.
- No page contains more than 100 items. Filters not expressly listed are rejected; document semantic search/filter is client-side after authorized decryption.

## 6. Payload and field limits

| Input | Limit |
| --- | ---: |
| Any Foundation request body | 1 MiB encoded bytes |
| Document create/update body | 1 MiB; ciphertext field maximum 768 KiB decoded |
| Workspace encrypted description | 64 KiB encoded |
| Workspace display name | 1–80 Unicode characters |
| Device label | 80 characters |
| Public JWK | 2 KiB encoded |
| One workspace key envelope | 8 KiB encoded |
| Rotation staged envelopes | One per request; maximum 100 eligible devices in Foundation rotation |
| Invitation token | Exactly the approved 256-bit-or-greater token encoding; maximum 256 characters accepted |
| Opaque ID | 16–64 URL-safe characters |
| Idempotency key | Maximum 128 characters, at least 128 bits entropy |
| Pagination | Default 50; maximum 100 |
| Query string | 4 KiB; capabilities/tokens forbidden |

The server rejects an over-limit body before full buffering or expensive work using `413 PAYLOAD_TOO_LARGE`. Counts, nesting, decoded base64 size, numeric range, and encoded size are all bounded. Batch operations are absent except the explicitly staged one-envelope-per-request rotation workflow.

## 7. Rate-limit tiers

Limits apply concurrently; the most restrictive exhausted tier wins. Rejection returns `429 RATE_LIMITED` and bounded integer `Retry-After`, with no domain mutation. Keys use privacy-minimized/keyed identifiers and approved retention.

| Tier | Budget |
| --- | --- |
| Default authenticated API | 120 requests per user per minute and 300 per source IP per minute, bounded burst |
| Document mutations | 60 per user per minute, also subject to default tier |
| OAuth transaction/callback | 20 attempts per source IP per 10 minutes |
| Invitation bootstrap/accept | 10 per token discriminator and 30 per source IP per 10 minutes |
| Workspace/device/key administration | 30 per user per 10 minutes |

Repeated authorization failure, malformed input, token guessing, provider lookup, and expensive ciphertext submissions MAY receive stricter adaptive limits, but never a more permissive limit. Rate behavior must not create a membership/account enumeration oracle.

## 8. Stable error catalog and disclosure policy

| HTTP | Code | Safe meaning / allowed details |
| ---: | --- | --- |
| 400 | `INVALID_JSON` | Malformed JSON; no echoed fragment |
| 400 | `VALIDATION_FAILED` | Schema/type/range failure; allow-listed field paths and rule IDs only |
| 400 | `INVALID_CURSOR` | Cursor unusable; no decoded cursor data |
| 400 | `INVALID_PRECONDITION` | Missing/invalid revision/create precondition |
| 401 | `AUTHENTICATION_REQUIRED` | No valid live session |
| 401 | `SESSION_EXPIRED` | Current session expired/revoked; no account detail |
| 401 | `REAUTHENTICATION_REQUIRED` | High-risk action needs fresh auth; allowed detail `reauthenticate:true` |
| 403 | `CSRF_REJECTED` | Origin/token proof failed; generic message |
| 403 | `DEVICE_NOT_AUTHORIZED` | Acting device invalid/revoked; no other device detail |
| 403 | `KEY_PROVISIONING_REQUIRED` | Caller is valid but current device is pending/stale; own readiness only |
| 403 | `OPERATION_NOT_PERMITTED` | Known in-scope resource but role/action denied where disclosure is already authorized |
| 404 | `RESOURCE_NOT_FOUND` | Shared mapping for nonexistent, other-workspace, removed, unauthorized, and hidden deleted resources |
| 405 | `METHOD_NOT_ALLOWED` | Route method unsupported; fixed `Allow` only |
| 406 | `NOT_ACCEPTABLE` | Response media type unsupported |
| 409 | `DOCUMENT_REVISION_CONFLICT` | Authorized own-document conflict; base/current revisions only |
| 409 | `IDEMPOTENCY_KEY_REUSED` | Same binding/key with different fingerprint; no stored/request fingerprint |
| 409 | `IDEMPOTENCY_WINDOW_EXPIRED` | Result no longer retained; reconcile latest before new action |
| 409 | `STATE_TRANSITION_INVALID` | Invalid visible lifecycle transition; no hidden target state |
| 409 | `KEY_VERSION_MISMATCH` | Allowed details expected/submitted versions only for authorized workspace member |
| 409 | `FINGERPRINT_CHANGED` | Authorized provisioning flow must refetch canonical target key |
| 409 | `INVITATION_UNAVAILABLE` | Shared for invalid, expired, revoked, used, wrong identity, hidden duplicate, or unknown invitation |
| 409 | `LAST_OWNER_REQUIRED` | Authorized workspace context only; operation would leave no Owner |
| 409 | `LIFECYCLE_POLICY_UNAVAILABLE` | Export/deletion reserved but deny-closed |
| 413 | `PAYLOAD_TOO_LARGE` | Body/decoded field exceeds fixed limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JSON content type required |
| 422 | `UNSUPPORTED_ENVELOPE` | Version/suite/shape unsupported; no cryptographic input echo |
| 429 | `RATE_LIMITED` | Retry later; `Retry-After` only |
| 500 | `INTERNAL_ERROR` | Generic; request ID for support |
| 503 | `COLLABORATION_UNAVAILABLE` | Feature disabled, dependency unavailable, or migration incompatible; no internal detail |

### Non-enumeration mapping

- Workspace/document/member/device/envelope/audit access by a non-member, removed member, wrong workspace, wrong target, nonexistent ID, or hidden tombstone maps to `404 RESOURCE_NOT_FOUND` with materially equivalent body and side effects.
- Invitation bootstrap/accept invalid token, wrong immutable subject, expired, revoked, accepted, unknown, or privacy-sensitive duplicate maps to `409 INVITATION_UNAVAILABLE` after equivalent bounded work where practical.
- OAuth failures map to a generic same-origin result and never disclose account existence or provider tokens/errors.
- Only an already authorized caller may receive actionable own-resource details such as current revision, own key readiness, expected key version, last-Owner rule, or fingerprint refresh.
- Rate limits and latency tests compare sensitive cases; exact byte-for-byte/timing equality is not promised, but no practical enumeration distinction is accepted.

## 9. Side effects and atomicity

| Operation | Atomic success boundary | Failure/replay rule |
| --- | --- | --- |
| OAuth callback | Consume transaction, upsert stable subject/display, create/rotate session | Any validation/exchange failure creates no session/user authority; code/state replay denied |
| Logout | Revoke server session, then clear cookie | Old cookie cannot authorize next request |
| Register device | Device/public-key binding + audit | Fingerprint/key mismatch creates neither; identical IK replay returns original |
| Create workspace | Workspace + Owner membership + key version 1 + initial owner envelope + idempotency result + audit | All or none; no ownerless/partial workspace |
| Change role | Validated membership role + idempotency result + audit | Last Owner/Admin ceiling/race fails with no change |
| Transfer ownership | Promote target + demote actor as specified + idempotency result + audit | Always at least one Owner; concurrent invalid transfer rolls back |
| Remove member | Removed state + device/envelope eligibility effects + matching pending-invite invalidation + rotation-required marker + idempotency + audit | Immediate next-request denial; no partial revoke |
| Create invitation | Provider subject resolution result + hashed 72h invitation + idempotency + audit | Raw token returned once only after durable commit; replay returns same safe result without re-exposing raw token, so client must preserve the first response |
| Revoke invitation | Pending→revoked + idempotency + audit | Terminal transition replay deterministic; no resurrection |
| Accept invitation | Validate token/subject/time + pending→accepted + unique `pending_key` membership + idempotency + audit | One membership at most; transaction failure consumes nothing |
| Revoke device | Device revoked + workspace eligibility/rotation markers + idempotency + audit | Next device-bound request denied; other devices unaffected unless policy says otherwise |
| Create envelope | Current binding/fingerprint CAS + unique target/version envelope + readiness transition + idempotency + audit | No envelope/readiness on mismatch or unauthorized wrapper |
| Commit rotation | Brief write gate + current+1 version + exact eligible envelope set + rotation metadata + idempotency + audit | Gaps, downgrade, changed eligible set, or missing envelope commits nothing and releases gate |
| Document create/update/tombstone | Precondition + append-only revision + current pointer/tombstone + idempotency result + audit | One revision/event; conflict has no business side effect; identical replay returns stored result |
| Audit read | Optional audit-access event under registry policy | Read never mutates domain authority/content |
| Export/delete | None | Always deny-closed until later approved lifecycle contract |

For invitation creation, deterministic replay cannot safely reveal a stored raw token because none is stored. If the first success response is lost, the client revokes/recreates rather than retrieving the token. This is the intentional exception to “return original full result”; the idempotency result records creation identity/state but not raw capability.

## 10. Operations and compatibility

- Logs contain server request ID, route template, method, coarse status/outcome, latency, environment, and approved opaque/keyed identifiers only. Bodies, query capabilities, cookies, OAuth/state/PKCE/CSRF, invitation/session tokens or digests, PATs, recovery inputs, private keys, DEKs, envelopes, ciphertext, plaintext, titles/tags, SQL, and stacks are forbidden.
- Metrics cover latency/errors, conflicts, replay, fingerprint mismatch, authorization/rate denials, rotation progress, audit append integrity, migration version, and retention backlog using low-cardinality dimensions.
- Runtime supports the current/previous approved schema compatibility window. Feature flags keep new routes unreachable until migration and contract checks pass.
- Feature disablement returns `COLLABORATION_UNAVAILABLE`, preserves D1 data and encrypted local drafts, and does not affect Personal Vault/Guest/GitHub Pages fallback.
- Terminal invitation/session and idempotency records retain 30 days; audit retains 365 days; document revisions/tombstones have no time-based physical deletion approval. Cleanup is bounded, idempotent, and cannot delete active domain rows or revisions.

## 11. Requirement and ADR links

| Contract area | Requirements | Decisions |
| --- | --- | --- |
| Runtime/version/cache | CF-FB-001/002, CF-OPS-001–005 | ADR-001, ADR-011, ADR-012 |
| OAuth/session/CSRF | CF-ID-001–004, CF-SES-001–004 | ADR-002, ADR-011 |
| Workspace/RBAC | CF-WS-001–004, CF-RBAC-001–004 | ADR-003, CF-DOM-001 |
| Devices/keys | CF-DEV-001–004, CF-KEY-001–006 | ADR-004, ADR-010 |
| Metadata/E2EE | CF-DOC-001/004/005, CF-AUD-002 | ADR-005, ADR-011 |
| Invitations/membership | CF-INV-001–005 | ADR-003, ADR-009 |
| Revisions/outbox | CF-DOC-002/003/006, CF-SYNC-001–005 | ADR-006, ADR-010 |
| Provider isolation | CF-ISO-001–005 | ADR-007 |
| Audit/retention | CF-AUD-001/002, CF-WS-004 | ADR-008, ADR-012 |

Threat and abuse coverage includes T01–T23 as mapped in the ADRs, particularly AB-01–10, AB-12–25. CF-DOC-004/AB-11 requires the honest E2EE refinement in section 4.5: official-client rejection is enforceable; server inspection of opaque semantics is not.

## 12. Gate G3 acceptance

Current assessment: **APPROVED at Gate G3 and authorized for controlled Phase 1 implementation by Gate G4. Runtime and release evidence remains pending.**

- [x] Product Owner approves route capabilities, all current non-credential category eligibility, lifecycle deny-closed behavior, and truthful credential-content limitation.
- [x] Security Reviewer approves session/CSRF/origin gates, envelopes, non-enumeration map, error details, request limits, and capability-token handling.
- [x] Technical Lead confirms every route maps to a D1 schema/transaction, centralized policy action, audit event, and migration-compatible handler contract.
- [x] Senior QA maps each route to the required method/content type/origin/CSRF/session/role/device/workspace/state/idempotency/limit/rate verification families; executable side-effect evidence remains a phase gate.
- [x] CF-DOC-004, AB-11, product wording, and traceability are amended so no evidence claims server plaintext/category validation under E2EE.
- [ ] OAuth callback and invitation fragment bootstrap receive browser tests proving no token/code leakage through URL requests, referrers, analytics, history, logs, caches, or storage.
- [ ] Fixed cryptographic vectors and browser capability evidence validate the exact envelope schemas and bounds.
- [ ] Concurrency/failure injection proves workspace ownership, invitation acceptance, envelope readiness, rotation, revision, idempotency, and audit atomicity.
- [ ] Privacy tests prove shared non-enumeration behavior and absence of protected canaries from API metadata, D1, audit, logs, telemetry, caches, and artifacts.
- [ ] Rate, pagination, 1 MiB/body and decoded-field boundaries, outbox reconciliation, 30-day idempotency expiry, and seven-day client quarantine are executable.
- [x] Export, deletion, hard purge, recovery artifact, server recovery, batch documents, and semantic search remain unavailable in the approved Foundation contract.
- [ ] Preview/production/GitHub Pages isolation, Service Worker bypass, migration compatibility, backup/restore, and non-destructive feature disablement are demonstrated.

Gate G4 authorizes implementation against this fixed v1 contract baseline; it does not authorize production activation or weaken any later phase/release criterion.
