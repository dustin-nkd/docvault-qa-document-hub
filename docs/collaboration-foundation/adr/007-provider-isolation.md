# ADR-007: Personal and Collaboration Provider Isolation

Status: Approved at Gate G2

Date: 2026-07-15

Owners: Senior Developer / Architect; Product Owner; Senior QA

## Context

The existing application treats one mutable document array as the source for local storage, personal GitHub sync, exports, activity, and UI. Collaboration introduces identity, membership, encrypted shared revisions, and an offline outbox with different authority and conflict semantics. Mixing those records would risk silent uploads, credential disclosure, cross-account leakage, and regressions to the proven personal flows.

## Decision

Implement Personal Vault and Collaboration as separate storage providers, state namespaces, identity contexts, sync engines, and persistence records. A document belongs to exactly one provider context. There is no automatic migration, mirrored object, or ongoing synchronization link between providers.

The only Foundation transfer is an explicit one-time `Copy to workspace` operation. The client decrypts the eligible personal source, shows destination and data classification, creates a new collaboration identity/revision, encrypts it for the destination workspace, and submits it under current membership. The personal source remains unchanged.

## Detailed contract

### Provider identities

- `PersonalVaultProvider` owns local vault records, personal history/activity, personal GitHub sync, tombstones, exports, and Personal Vault credentials.
- `CollaborationProvider` owns workspace ciphertext, server revisions, memberships, invitations, key envelopes, collaboration audit display, and the encrypted offline outbox.
- Guest fixtures are memory-only and use neither provider.
- Public sharing remains a separate read-only capability and never grants workspace membership.

### State isolation

- Every cached collaboration record and outbox entry is keyed by environment, immutable provider subject, workspace ID, device ID, and document ID as applicable.
- Logout, account switch, membership removal, workspace switch, or key revocation clears unwrapped keys, plaintext view state, and incompatible queued work before another context renders.
- Provider selection is explicit. No fallback from a collaboration failure writes the record to Personal Vault or personal GitHub.
- UI labels show whether a document is Personal or in a named workspace; ambiguous combined edit views are out of scope.

### Copy eligibility and semantics

- The official client rejects stored Credential documents before copy/create encryption. The API enforces provider, authorization, envelope, and routing policy but, by design, cannot semantically inspect encrypted category/content or guarantee rejection from a malicious authorized client. This Day 4 clarification and residual risk were accepted at Gate G3.
- The user selects one eligible personal document and a destination workspace where the user is an Editor, Admin, or Owner and is key-ready.
- The confirmation identifies that a new independent copy will be created and that later edits do not synchronize.
- Destination encryption occurs before the request crosses the browser boundary.
- A fresh destination document ID, mutation ID, revision `1`, server timestamp, audit event, and workspace key version are used.
- Copy is idempotent for the submitted mutation ID. Repeating a completed request returns the original destination result instead of duplicating it.
- A failed or denied copy leaves the personal source unchanged and creates no partial workspace document.

### GitHub Pages fallback

GitHub Pages initializes only Personal Vault and Guest capabilities. Collaboration links redirect once to the canonical Cloudflare origin or show an unavailable state. It stores no imitation workspace, pending collaboration mutation, session, or key envelope.

## Alternatives considered

### One repository and document array with a provider flag

Rejected because mutable global data and shared persistence paths make missing filters a confidentiality failure.

### Automatic upload after OAuth login

Rejected because login does not express consent, destination, eligibility, or encryption readiness.

### Bidirectional personal/workspace synchronization

Rejected because the providers use different ownership, authorization, conflict, deletion, history, and key semantics.

### Move instead of copy

Rejected because a partially failed operation could delete the only personal source and because workspace access may later be revoked.

## Consequences and residual risks

- Some UI and rendering logic can be reused, but persistence and mutation calls require an explicit provider interface.
- Users may create intentional duplicates and must understand that copies diverge.
- Decrypted personal plaintext exists briefly in the trusted browser during copy; XSS or a compromised device remains a residual risk.
- Cross-provider search is deferred unless it can preserve provider and key boundaries.

## Security and privacy

- Personal GitHub PATs, vault passwords, recovery metadata, credential fields, and personal history never enter collaboration requests or D1.
- Collaboration sessions, keys, membership, audit events, and outbox records never enter personal GitHub shards.
- Provider/context identifiers are validated at every serialization boundary and cannot be overridden by imported document content.
- Telemetry records provider type and stable error code, never document title/content or local secret state.

## Operations

- Provider-specific metrics and errors must make accidental cross-provider calls detectable without logging protected content.
- A collaboration outage degrades only collaboration. Personal Vault and Guest mode continue locally; GitHub Pages remains their fallback.
- Data repair tools must require an explicit provider and environment and must never scan both namespaces by default.

## Test implications

- Characterization tests lock current Personal Vault, Guest, GitHub sync, public sharing, credentials, history, export, and offline-shell behavior.
- Matrix tests cover every provider/action pair and prove fail-closed behavior when context is absent or forged.
- Copy tests cover eligibility, credential rejection, authorization, key readiness, encryption before transport, idempotent replay, partial failure, and independent later edits.
- Account/workspace switch tests inspect memory, IndexedDB, local/session storage, network, and UI for cross-context residue.
- GitHub Pages tests prove no collaboration persistence or API emulation is enabled.

## Requirement and threat links

Requirements: CF-ISO-001 through CF-ISO-006, CF-DOC, CF-SYNC, CF-SEC. Threats: T06, T12, T15, T16, T18, T21. Decisions: DL-002, DL-003, DL-004.

## Gate G2 acceptance

- [x] Product accepts explicit one-time copy and independent histories as the only Foundation transfer at Gate G0.
- [x] Security accepts credential exclusion and storage/state namespace separation.
- [x] Architecture accepts separate provider interfaces and no automatic failure fallback across providers.
- [x] Senior QA accepts the provider/action and residue-inspection regression matrix.
