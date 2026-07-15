# ADR-005: Metadata Encryption Boundary

## Status

Approved at Gate G2.

## Date

2026-07-15

## Owners

Product Owner and Security Reviewer (privacy decision), Technical Lead (schema), Senior QA (verification).

## Context

E2EE protects content only if protected fields never escape the encrypted client envelope. D1 still needs a minimal set of routing, authorization, concurrency, retention, and audit metadata. The boundary must be explicit so convenience features do not gradually expose document meaning.

## Decision

All user-authored document semantics are encrypted: title, content/body, tags, category, status, subfolder, favorite state, category-specific fields, embedded-image data, user-authored history, and any derived value that reveals those fields. Workspace description is encrypted. A bounded workspace display name remains server-visible Internal metadata so invitations, pending-key onboarding, workspace selection, and audit scoping remain usable before decryption. Document search, filtering, category calculations, and previews are client-side.

Only the minimum metadata listed below is server-visible. Adding a server-visible field requires a privacy/security schema review and an amendment to this ADR; absence from the list means encrypted or prohibited.

## Detailed contract

### Encrypted payload

- Document payload: `title`, `content`, `tags`, `category`, `status`, `subfolder`, `favorite`, all category-specific/custom fields, embedded image bytes/references, client presentation state deliberately synchronized, and content-schema version details not needed for routing.
- Workspace payload: description and any semantic/custom workspace fields beyond the bounded display name. The client may keep a local decrypted cache, cleared on lock/account switch.
- Revision payloads are independently authenticated ciphertext using the workspace key version recorded by the server-visible envelope.
- Credential documents and secret fields are prohibited from Collaboration Foundation, not merely encrypted.

Day 4 clarification approved at Gate G3: the official client enforces that product prohibition before encryption, but the API cannot inspect encrypted category/content semantics. It validates the declared envelope, authorization, key version, payload bounds, and revision rules and must not claim universal credential detection against a malicious authorized client. This accepted residual limitation preserves the approved E2EE boundary.

### Exact server-visible metadata

| Entity | Permitted server-visible fields |
| --- | --- |
| User | Opaque application user ID; provider name and stable numeric subject; approved display/account attributes; created/updated/deactivated timestamps |
| Session | Opaque ID; keyed token digest; user ID; created/last-seen/authenticated/absolute-expiry/revoked timestamps; reason codes; minimum device/security context |
| Workspace | Opaque workspace ID; normalized display name of 1-80 Unicode characters; encrypted description envelope; owner/member relationship; current key version; lifecycle timestamps/state |
| Membership | Workspace ID; user ID; role; `pending_key`/active/removed state; inviter/acceptance/removal identifiers and server timestamps |
| Invitation | Opaque ID; workspace ID; intended stable identity binding or approved delivery discriminator; role; token digest; expiry/accepted/revoked timestamps and state |
| Device/key | Opaque device/user IDs; public JWK and fingerprint; algorithm suite; device state/timestamps; workspace key version; envelope ciphertext and binding metadata |
| Document | Opaque document/workspace IDs; current server revision; key version; ciphertext byte length; content-envelope/schema version; tombstone state; server created/updated timestamps |
| Revision | Opaque document/workspace IDs; server revision; base revision; key version; ciphertext byte length/envelope version; actor/device IDs; client mutation ID; server timestamp |
| Audit | Opaque event/request/workspace/actor/device/resource IDs; allow-listed event type, outcome/reason code, server sequence/time, and non-content numeric counts |

The server must not see plaintext document title/category/status/tags/body/category fields, workspace description, conflict draft, search query derived from protected content, decrypted preview, or user-authored audit description. The workspace display name, ciphertext, identifiers, sizes, timestamps, membership graphs, roles, access patterns, and key versions remain observable metadata.

### Validation and API behavior

- Clients submit a versioned authenticated ciphertext envelope plus only permitted routing metadata. The API rejects unknown top-level metadata rather than storing it.
- Strict ciphertext and field-size bounds apply before D1 work. The API validates opaque ID format, envelope version, key version, base revision, mutation ID, and membership without parsing plaintext.
- Audit events use allow-listed types/reason codes and never interpolate document/workspace titles or request bodies.
- Workspace display names are normalized and bounded, rendered only through text-safe APIs, omitted from operational logs, and accompanied by UX guidance not to place secrets in the name.
- Pagination and filtering operate only on permitted opaque/lifecycle metadata. Foundation provides no server-side semantic search.
- Personal-to-workspace copy is explicit and client-side: decrypt personal source locally, reject credentials, encrypt the distinct destination payload, then upload. No automatic link or later synchronization remains.

## Alternatives

- Encrypt the workspace display name: rejected for Foundation because invitation confirmation and `pending_key` workspace selection need meaningful context before a device has the workspace key; the accepted leakage is explicit and minimized.
- Plaintext document title/category/status for server search: rejected because it exposes document meaning and creates an inconsistent privacy promise.
- Encrypt every identifier and timestamp: rejected because the server could not reliably enforce authorization, revisions, idempotency, retention, or audit.
- Deterministic/searchable encryption: rejected for Foundation due to leakage and complexity.
- Store decrypted audit descriptions: rejected because audit would become a secondary content store.

## Consequences and residual risks

Server-side document search, semantic filtering, notifications with document content, and content diagnostics are unavailable. Clients may download more ciphertext to search locally. Infrastructure and operators can observe the workspace display name, IDs, membership/role graphs, device keys, sizes, timing, revision counts, access patterns, tombstones, and audit actions. Encryption does not hide content from an authorized or compromised endpoint.

## Security and privacy

Metadata remains Internal/Restricted, never Public. Access is workspace-scoped, minimized, retained for approved periods, and excluded from broad analytics. Size/timing correlation and identity graph exposure are explicitly accepted residual privacy risks only after Product Owner/Security approval and truthful documentation.

## Operations

Maintain a machine-reviewable API/D1 field allow-list, schema migration review, retention/purge jobs, access controls for operators, and canary scans. Metrics aggregate reason codes/counts and must not introduce protected dimensions. Backup and restore preserve ciphertext and permitted metadata without decrypting it.

## Test implications

- Sensitive canaries in every protected field must be absent from API metadata, D1 columns, audit, logs, telemetry, caches, build output, and error messages.
- Schema tests reject unknown/plaintext top-level fields, oversized payloads, and mismatched envelope/key versions. Client workflow tests reject stored Credential categories; adversarial tests document that the API cannot semantically classify opaque ciphertext.
- Authorization tests cover list, pagination, tombstone, revision, audit, and cross-workspace metadata enumeration.
- Personal copy tests prove explicit confirmation, credential rejection, local-only plaintext, distinct IDs, and unchanged source.

## Requirement and threat links

CF-DOC-001, CF-DOC-004 through CF-DOC-006; CF-AUD-001 and CF-AUD-002; CF-ISO-001 through CF-ISO-004; CF-OPS-005; threat-model T04, T10, T13, T16-T17, T22; abuse cases AB-10, AB-11, AB-15, AB-18.

## Gate G2 acceptance

- [x] Security Reviewer approves the encrypted and exact server-visible field lists.
- [x] Product Owner accepts the workspace-name, identity, membership, audit, access-pattern, and retention privacy tradeoffs.
- [x] Day 4 API and D1 schemas must contain no undeclared semantic metadata.
- [x] Senior QA accepts the canary and unknown-field rejection plan for every protected field.
- [x] Any requested server search/filter field is rejected or approved through an ADR amendment.
