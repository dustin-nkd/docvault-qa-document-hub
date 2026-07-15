# Collaboration Foundation: Data Classification and Trust-Boundary Inventory

Status: Gate G0 approved; Day 2 security baseline

Scope: current personal vault and the proposed Cloudflare collaboration foundation

Canonical collaboration origin: `https://docvault-qa-document-hub.pages.dev`

## Purpose

This document defines the data that DocVault currently handles, the data the collaboration foundation will introduce, who may act on that data, where it may be stored, and which trust boundaries it crosses. It is a security input to the authentication, authorization, encryption, storage, conflict-resolution, audit, and migration ADRs. It does not authorize implementation.

## Classification levels

| Level | Meaning | Examples |
| --- | --- | --- |
| Critical secret | Disclosure can directly decrypt protected data, impersonate a user, or administer infrastructure. It must never be logged or stored in plaintext outside the minimum trusted runtime. | Vault password, workspace data-encryption key, device private key, OAuth client secret, raw session token, GitHub PAT |
| Restricted | Confidential workspace or security data whose disclosure can materially harm a user or project. | Plaintext documents, credential documents, recovery material, encrypted key envelopes, document revisions |
| Internal | Collaboration metadata needed by the service. It may be server-visible only when explicitly approved and access-controlled. | Memberships, roles, device public keys, document IDs, revision numbers, audit events |
| Public or user-disclosed | Data intentionally published or non-sensitive runtime data. Public classification must be explicit, not inferred from storage in a public repository. | Static application assets, an intentionally created public share ciphertext |

## Current-state asset inventory

| Asset | Classification | Current storage and transport | Current server or third-party visibility | Target disposition |
| --- | --- | --- | --- | --- |
| Master vault password | Critical secret | Plaintext in `sessionStorage` as `docvault_pwd` while unlocked; used in browser memory for PBKDF2 and AES-GCM | Not intentionally sent to an application server; it can be exposed to same-origin script or an XSS-compromised browser | Keep personal-vault behavior isolated. A collaboration device-unlock secret must remain client-only and must not become an OAuth or workspace password |
| Vault V2 encryption key | Critical secret | Derived in browser with PBKDF2-SHA-256, per-vault 16-byte salt, 600,000 iterations; cached in JavaScript memory | Not exported or persisted as a raw key | Keep client-only; collaboration must use a separate workspace-key model |
| V2 KDF salt and envelope header | Internal | Salt in `localStorage` and in each `DV2:` envelope; work factor and IV are self-describing and authenticated as AES-GCM additional data | Visible wherever ciphertext is stored | May remain non-secret; validate algorithm, size, and work-factor bounds before use |
| Personal documents, titles, tags, category data, and embedded images | Restricted | One encrypted vault value in `localStorage` or `chrome.storage.local`; encrypted vault/shards can be pushed to GitHub | GitHub can see ciphertext, file sizes, paths, commit times, and repository metadata; the configured public vault can be fetched without authentication | Never migrate automatically. Collaboration copies must be explicit, client-side encrypted, and revisioned |
| Credential usernames and passwords | Critical secret / Restricted | Credential passwords are encrypted before the containing vault is encrypted; plaintext exists in browser memory while unlocked | Ciphertext may be present in GitHub vault storage; credentials are currently excluded from public sharing | Exclude credential documents from Collaboration Foundation until a separate permission, rotation, and recovery model is approved |
| Personal document history | Restricted | Up to 10 plaintext snapshots per non-credential document in `localStorage` keys named `docvault_history_<id>` | Not intentionally sent remotely, but readable by same-origin script and local browser access | Do not reuse for collaboration. Shared revision history must be encrypted and access-controlled |
| Personal activity log | Restricted metadata | Plaintext in `localStorage`; up to 200 records containing document ID, title, category, action, and timestamp; included in encrypted sharded-sync metadata | Plaintext locally; encrypted remotely when contained in the vault metadata payload | Replace with server-authoritative collaboration audit events containing no plaintext title, content, token, or key material |
| Deleted-document IDs and sync markers | Internal | Deleted IDs and pending-sync state are plaintext in `localStorage`; deleted IDs can be included in encrypted remote metadata | Local same-origin visibility; encrypted when carried inside protected remote metadata | Collaboration tombstones must be workspace-scoped, server-authoritative, revisioned, and retained under an approved policy |
| GitHub personal access token and sync settings | Critical secret | Settings are encrypted with the vault password when unlocked; legacy/plaintext fallback is possible when no password is available; token is sent to `api.github.com` | GitHub receives the token; same-origin script can access settings after unlock | Never copy to D1 or collaboration APIs. GitHub PAT remains a personal-provider secret only |
| Password verifier | Restricted authentication data | Encrypted verifier in `localStorage` under `docvault_master_hash`; legacy formats may be migrated | Local only | Must not be reused as collaboration identity or server authentication |
| Recovery blob and recovery code | Critical secret | Recovery blob in `localStorage` and optionally inside the remote vault envelope; recovery code is shown to the user and is not stored intentionally | Encrypted blob may be publicly retrievable with the vault envelope; holder of both blob and code can recover the password | Collaboration recovery must be designed separately; no plaintext recovery code or unencrypted private key on the server |
| Password hint | Restricted metadata | Plaintext in `localStorage`; optional explicit sync can place the hint in the remotely readable outer metadata | When sync is enabled, anyone able to fetch the public vault metadata may read it | Do not sync collaboration unlock hints by default; decide whether the feature is permitted at all |
| Public share ciphertext | Restricted ciphertext intentionally published | AES-GCM ciphertext stored under `shared/<shareId>.enc` in GitHub; decryption key is carried in the URL fragment | GitHub and anyone with the file URL see ciphertext; anyone with the full link can decrypt | Keep public sharing separate from workspace membership. Public share capability must not imply collaboration access |
| Public share registry | Restricted metadata | Plaintext `localStorage` list containing share ID, document ID, title, category, time, and GitHub SHA | Local same-origin visibility | Do not merge with collaboration audit or membership data; minimize title exposure if retained |
| Exported backup | Restricted plaintext | User-triggered JSON download contains decrypted documents | Visible to the browser, download directory, backup software, and anyone with file access | Shared-workspace export requires an explicit policy, role permission, warning, and audit event |
| Guest-demo documents | Public sample data | In-memory fixtures; current persistence path deliberately bypasses LocalAuth, local vault, and GitHub Sync | Visible to every guest user | Keep isolated from sessions, workspaces, D1, outbox, and real audit data |
| Static application shell | Public | Cloudflare Pages and GitHub Pages; network-first Service Worker cache for same-origin GET requests | Publicly downloadable | Continue runtime-asset allow-listing; collaboration API responses must never enter the application-shell cache |
| Source/configuration and deployment credentials | Internal / Critical secret | Source in GitHub; GitHub Actions deploys GitHub Pages; Cloudflare Pages builds from `main`; runtime artifact explicitly excludes repository-only files | Repository readers see source; platform administrators may see build metadata; secrets must remain in platform secret stores | Separate preview and production bindings, OAuth applications, D1 databases, and secrets |

## Target collaboration asset inventory

| Asset | Classification | Target storage | Server visibility | Required handling |
| --- | --- | --- | --- | --- |
| OAuth client secret | Critical secret | Cloudflare secret storage only | Pages Functions runtime only | Never expose to the browser, D1, build output, logs, or GitHub |
| OAuth authorization code and provider token | Critical secret | Runtime memory only unless a later ADR proves persistence is necessary | Pages Functions and GitHub OAuth provider | Single use, short-lived, redacted from logs; discard provider token after identity establishment when possible |
| User identity and provider subject | Internal | D1 | Visible to authorized backend operations and administrators | Use immutable provider subject as identity key; do not key authorization by username or email |
| Raw session token | Critical secret | Secure, HttpOnly cookie in browser; never stored raw in D1 | Browser cookie layer and Pages Functions request handling | Store only a cryptographic hash in D1; rotate on login and revoke on logout/security events |
| Session record and token hash | Restricted | D1 | Backend-visible | Expire, revoke, and purge under a defined retention policy; never return token hash to clients |
| Workspace membership, role, and ownership | Internal security data | D1 | Backend-visible; selectively visible to workspace members | Server-authoritative and deny-by-default; every workspace resource query must be membership-scoped |
| Invitation token | Critical secret while valid | Delivered to intended recipient; only a hash in D1 | Raw token visible only to creator/recipient flow and request runtime | Single-use, expiring, revocable, rate-limited, and excluded from URLs/logs where practical |
| Device public key | Internal | D1 | Backend and authorized workspace members as required for key wrapping | Bind to user and device; validate algorithm and key format; support revocation |
| Device private key | Critical secret | Browser only, encrypted at rest in IndexedDB or equivalent | Never server-visible | Must be non-exportable where feasible or exported only as an encrypted recovery artifact |
| Workspace data-encryption key | Critical secret | Browser memory; wrapped separately for authorized devices | Never server-visible in plaintext | Generate with Web Crypto; fresh random 256-bit key; version and rotate |
| Workspace key envelope | Restricted | D1 | Backend sees ciphertext and binding metadata | Authenticate workspace ID, device ID, algorithm, and key version; reject downgrade and replay |
| Encrypted document payload and revision | Restricted ciphertext | D1 | Server sees ciphertext, size, revision, key version, timestamps, and access pattern | Fresh IV per encryption; authenticated envelope; strict size limits; append-only revision semantics |
| Document title, tags, content, and category-specific fields | Restricted | Encrypted inside the document payload | Not server-visible in plaintext under the proposed E2EE model | Search/filter must be client-side unless a later ADR explicitly approves a privacy trade-off |
| Document/workspace IDs, revision, timestamps, deletion state | Internal metadata | D1 | Server-visible | Use opaque IDs, server timestamps, workspace scoping, pagination, and retention limits |
| Offline collaboration outbox | Restricted | IndexedDB, encrypted payload plus minimum routing metadata | Not server-visible until submitted | Bind every mutation to user, device, workspace, base revision, and idempotency key; quarantine on account changes |
| Audit event | Restricted metadata | D1 | Owners/admins and authorized operations | Server timestamp and actor; allow-listed event metadata only; no document plaintext, ciphertext bodies, tokens, or keys |
| Request and security telemetry | Internal / Restricted | Cloudflare logs/analytics under an approved retention period | Authorized operators | Use structured allow-list logging, request IDs, aggregation, and secret/PII redaction |

## Actors and minimum data access

| Actor | Permitted visibility | Explicitly prohibited |
| --- | --- | --- |
| Guest | Public application assets and isolated sample data | Sessions, real local vault data, workspace data, invitations, keys, D1-backed activity |
| Invitee | Invitation context necessary to accept or reject an invitation | Workspace documents or key envelopes before identity and invitation validation |
| Viewer | Workspace membership metadata and encrypted documents that its device can decrypt | Document mutation, member management, workspace-key distribution to other users |
| Editor | Viewer access plus document create/update/delete according to revision rules | Role changes, invitation management, ownership operations |
| Admin | Workspace/member administration and audit access defined by the RBAC ADR | Self-promotion to Owner, ownership transfer, access outside its workspace |
| Owner | Full workspace administration, including approved ownership and recovery operations | Bypassing cryptographic or audit controls; reading another workspace without membership |
| Removed member | No new server data or key envelopes | Reusing an old session, invitation, queued mutation, or revoked device to regain access |
| Cloudflare runtime/operator | Ciphertext and approved server-visible metadata needed to operate the service | Plaintext workspace keys, device private keys, document plaintext, local unlock secrets |
| GitHub OAuth provider | OAuth transaction and identity claims | Workspace documents, keys, membership authorization decisions |
| Existing GitHub Sync provider | Personal encrypted vault/shards and personal PAT-authorized operations | Collaboration sessions, workspace keys, D1 membership, implicit migration of personal data |
| External attacker | Public assets only | Every authenticated, workspace, device-key, invitation, and audit resource |

## Trust-boundary inventory

1. **Browser runtime boundary.** Plaintext documents and unwrapped keys exist here while a vault or workspace is unlocked. Any same-origin XSS or malicious extension can cross this boundary; CSP and safe rendering are critical but cannot eliminate a compromised device.
2. **Browser persistent-storage boundary.** The current app uses `localStorage`, `sessionStorage`, and optional `chrome.storage.local`. Collaboration is expected to add IndexedDB for encrypted device state and the outbox. Storage is origin-scoped, not a hardware security boundary.
3. **Service Worker boundary.** The current worker intercepts every same-origin GET and caches successful responses. Collaboration `/api/` requests must be explicitly network-only, and authentication/private responses must use `Cache-Control: no-store`.
4. **Cloudflare Pages boundary.** Public static runtime assets are served at the canonical Cloudflare origin. No secret or repository-only artifact may enter `_site`.
5. **Pages Functions API boundary.** This will terminate sessions, validate requests, enforce RBAC, create server timestamps, and access D1. Client-supplied actor, role, workspace membership, or clock values are untrusted.
6. **D1 boundary.** D1 is trusted for durable metadata and ciphertext, but not for document plaintext or raw cryptographic/session secrets. All queries must be parameterized and workspace-scoped.
7. **GitHub OAuth boundary.** Authorization redirects and token exchange cross an external identity-provider boundary. State, PKCE, exact redirect URIs, provider-subject uniqueness, and response validation are required.
8. **Personal GitHub Sync boundary.** The existing browser talks directly to the GitHub Contents API and may fetch a public encrypted vault without authentication. It remains a separate personal storage provider and is not an authorization source for collaboration.
9. **Public-share boundary.** A full share URL is a bearer decryption capability. Public sharing is distinct from an authenticated workspace and must never grant membership or expose credential documents.
10. **GitHub Pages fallback boundary.** GitHub Pages cannot provide the collaboration API. It must fail closed into personal/guest mode and must not create a local imitation of a team workspace.
11. **Preview/production boundary.** Preview and production must not share D1 data, OAuth credentials, session keys, administrative secrets, or accepted origins.
12. **CI/CD and Cloudflare control-plane boundary.** GitHub Actions, Cloudflare Git builds, deployment settings, and operators can affect production code and configuration. Least privilege, protected secrets, artifact allow-listing, and auditable deployment changes are required.

## Data-handling and retention constraints

- Do not log request bodies, authorization codes, cookies, raw invitation tokens, document ciphertext bodies, key envelopes, private keys, passwords, PATs, recovery codes, or decrypted values.
- Every log field must be allow-listed. Error messages returned to clients must not reveal account existence, SQL details, stack traces, tokens, or cross-workspace identifiers.
- Authentication and private API responses must be non-cacheable. The Service Worker must never cache `/api/*`.
- Secrets must be supplied through Cloudflare secret storage and must not be present in source, `_site`, D1, client JavaScript, or build logs.
- Preview and production must use separate D1 databases, OAuth credentials, secrets, session namespaces, and origin allow-lists.
- Personal data migration must be explicit, user-initiated, category-filtered, and performed after encryption for the destination workspace. There is no automatic upload on login or workspace creation.
- Credential documents are out of scope for collaboration and must be rejected by both UI and API migration validation.
- Document deletion initially produces a server-authoritative tombstone. Physical deletion and revision retention require a product/legal retention decision.
- Invitations must be single-use, expiring, revocable, and eventually purged. Only token hashes may be retained server-side.
- Sessions must have absolute expiry, idle/revocation behavior, and purge rules. Raw session values must never be retained server-side.
- Audit events require a defined minimum retention period and access policy. They must not become a secondary store of document titles or content.
- Device and workspace-key records must preserve enough history to explain key versions and revocations without retaining obsolete plaintext secrets.
- Account removal, workspace deletion, export, and backup/restore behavior must be specified before general availability.
- Browser account switching or member removal must clear in-memory plaintext, unwrapped keys, sensitive UI state, and any incompatible queued operations.

## Critical assumptions

1. Cloudflare Pages is the canonical origin for collaboration; GitHub Pages remains a personal/guest fallback only.
2. Pages Functions and D1 will enforce authorization even though document content is encrypted client-side.
3. GitHub OAuth establishes identity only. It does not replace the local secret or device mechanism used to protect a collaboration private key.
4. The browser and Web Crypto implementation are trusted while the user is actively working; a fully compromised browser or device is outside the protection offered by E2EE.
5. Server-visible metadata is not considered public. It still requires authorization, minimization, retention, and operator controls.
6. Every document mutation will carry a server-validated workspace, base revision, device context, and idempotency identifier.
7. Existing public sharing and personal GitHub Sync remain separate capabilities and are not reused as collaboration membership or key distribution.
8. No Durable Object or real-time collaborative editor is part of Collaboration Foundation.

## Known limitations

- An authorized member can copy plaintext after decrypting it; cryptography cannot prevent intentional exfiltration by that member.
- Removing a member or device cannot erase plaintext or keys already copied to an uncontrolled location. Revocation protects future access and future key versions.
- XSS or a malicious extension can read plaintext and keys while the workspace is unlocked.
- Encrypting titles and tags prevents useful server-side search, filtering, notification content, and some operational diagnostics.
- A lost device private key and missing recovery artifact may cause irreversible loss of access.
- The current personal vault stores its unlock password in `sessionStorage` while unlocked, and stores document history/activity metadata plaintext locally. Collaboration must not inherit those patterns without an explicit security decision.
- A public share remains accessible to anyone holding the full URL until the ciphertext is removed; a recipient may retain a copy after revocation.
- Cloudflare administrators and infrastructure still observe access timing, payload sizes, identifiers, and other traffic metadata even when content is encrypted.

## Open decisions for Phase 0 ADRs

- Which browser-supported device-key algorithm and wrapping construction will be used, and which fields are authenticated as additional data?
- How will a device private key be protected: local vault password, WebAuthn/passkey-derived capability, encrypted recovery artifact, or a phased combination?
- Is the workspace name server-visible, encrypted, or represented by a user-defined local alias?
- Which document routing fields, if any, may remain server-visible to support pagination and filtering?
- What are the exact session idle and absolute lifetimes, concurrent-session rules, and re-authentication requirements?
- How is an invitation delivered and matched to an identity without leaking email or GitHub username information?
- What are the owner/admin role-transition rules, last-owner safeguards, and emergency recovery procedure?
- When does member removal trigger session revocation, device revocation, and workspace-key rotation?
- What are the document revision, tombstone, invitation, session, audit, and account-deletion retention periods?
- Can workspace data be exported, by which roles, in which encrypted format, and how is export audited?
- What is the recovery UX and the accepted consequence when all device/recovery keys are lost?
- Which Cloudflare logs and analytics are enabled, who can access them, and how long are they retained?

## Gate G0 checklist: discovery and scope

- [x] Current vault encryption, local authentication, GitHub Sync, sharing, browser storage, Service Worker, runtime build, security headers, and GitHub Pages deployment flows were inspected.
- [x] Current and target assets are classified with storage location and server visibility.
- [x] Valid, removed, guest, privileged, external, and compromised actors are inventoried.
- [x] Browser, Service Worker, Pages, Functions, D1, OAuth, GitHub Sync, public share, CI/CD, fallback, and environment boundaries are identified.
- [x] Personal vault, public sharing, guest mode, and collaboration are explicitly separated.
- [x] Credential documents are declared out of scope for Collaboration Foundation.
- [x] Current plaintext-local metadata and session-password exposure are recorded as known limitations rather than assumed safe patterns.
- [x] Critical data-handling and retention constraints are documented.
- [x] Assumptions and unresolved product/security decisions are visible for ADR ownership.
- [x] BA/PO confirms the Day 1 product boundary, credential exclusion, and the proposed metadata-privacy direction; final export and retention values remain Day 3 decisions.
- [x] Security Architect approves the trust boundaries and confirms that no Critical asset or flow is missing.
- [x] Senior Developer confirms the inventory matches the proposed Pages Functions + D1 architecture.
- [ ] Senior QA maps every Critical and Restricted asset to at least one Phase 0 abuse case or later verification requirement.
- [x] Gate G0 was signed off by the Product Owner on 2026-07-15; production implementation remains blocked by the Phase 0 exit gate.
