# ADR-009: Invitations and Membership

## Status

Accepted by Product Owner for the Phase 0 product contract. Security/technical review and Gate G2 evidence remain required; invitation delivery UX is still open.

## Date

2026-07-15

## Owners

- Decision owner: Product Owner
- Technical owner: Technical Lead
- Required assurance: Security Reviewer, Senior QA, and UX Lead

## Context

An invitation must grant a specific GitHub identity a bounded workspace role without turning a bearer link into membership. GitHub usernames are mutable display handles, so matching acceptance to the typed username would permit ambiguity or reassignment. Invitation acceptance also cannot imply E2EE readiness: an accepted member may not yet have a valid workspace-key envelope for their device.

The contract must prevent token disclosure, identity mismatch, replay, concurrent double acceptance, membership enumeration, excessive role grants, and ambiguous onboarding when no provisioning device is available.

## Decision

At invitation creation, DocVault resolves the entered GitHub username through the approved provider API and binds the invitation to the returned immutable GitHub provider subject ID. The normalized username is retained only as approved display/audit metadata and is never the acceptance authority. Foundation delivery is a manually shared acceptance URL whose high-entropy token is carried in the URL fragment; email delivery is deferred.

The server issues a cryptographically unpredictable invitation token, stores only its cryptographic hash/digest, and sets expiry to 72 hours from authoritative server creation time. The invitation is role-bound, single-use, and revocable while pending. Acceptance requires an authenticated DocVault identity linked to the exact immutable provider subject.

Successful acceptance atomically consumes the invitation and creates a unique membership in `pending_key`. The member remains unable to use protected document routes until an authorized key-ready Owner/Admin device provisions a valid envelope for an active target device; then the membership/device readiness advances under the key contract.

## Detailed contract

### Creation

1. Require an active Owner/Admin membership and apply ADR-003 ceilings: Owner may invite Admin/Editor/Viewer; Admin may invite only Editor/Viewer.
2. Normalize the submitted GitHub username for provider lookup, validate syntax/length, and rate-limit lookup and creation.
3. Resolve the username server-side through the approved GitHub API. Capture immutable provider subject ID plus the minimum approved display handle snapshot.
4. Do not reveal through public errors whether an account is already a member, already invited, or unknown beyond the approved UX contract.
5. Reject an existing active membership. If the same workspace/subject already has a pending invitation, atomically revoke it and replace it with one new invitation/token; multiple live invitations for one target are forbidden.
6. Generate a high-entropy single-use token. Return the raw token once to the inviter as `https://docvault-qa-document-hub.pages.dev/invite#token=<base64url-token>` for manual delivery through a channel chosen by the inviter; store only a cryptographic hash/digest and non-secret token identifier.
7. Persist workspace, provider, immutable subject, offered role, inviter, `createdAt`, and `expiresAt = createdAt + 72 hours`; append the creation audit event.

The invitation target, role, and expiry are immutable. A correction or resend atomically revokes the old invitation and creates one new token.

### Invitation lifecycle

`pending → accepted | revoked | expired`

- `pending → accepted`: exact provider-subject match, valid session, unexpired/unrevoked token, and membership uniqueness all pass in one transaction.
- `pending → revoked`: Owner may revoke any pending invitation; Admin may revoke only Editor/Viewer invitations and never Admin invitations.
- `pending → expired`: computed from authoritative server time; an expired token cannot be renewed in place.
- Terminal states never return to pending. Replay receives a privacy-safe deterministic failure and causes no membership/envelope side effect.

### Lookup and acceptance

- Token comparison uses the stored hash/digest through an approved constant-time verification construction.
- The invite page reads the fragment token into memory, removes the fragment immediately with `history.replaceState`, and sends the token once in a `no-store` POST body. It never writes the token to local/session storage, analytics, logs, referrers, or a query string.
- If authentication is required, that POST validates the token hash and binds only the invitation ID to the 10-minute OAuth transaction. The raw token is not persisted. The exact provider subject is rechecked after callback and again at acceptance.
- Pre-accept lookup returns only the bounded server-visible workspace display name, inviter display identity, offered role, and expiry needed for safe confirmation; it grants no membership, document, audit, device-key, or envelope access.
- The authenticated user's linked GitHub provider subject must exactly equal the invitation target subject. Username equality is insufficient.
- Acceptance atomically validates/consumes the invitation and creates one unique (`workspaceId`, `userId`) membership with the offered role and `pending_key` state.
- Acceptance does not create, unwrap, or expose a workspace key and does not mark any device key-ready.
- Concurrent accepts produce one accepted invitation and one membership at most.

### Membership and provisioning

- Membership lifecycle is `absent → pending_key → active → removed`.
- `pending_key` can read only minimum workspace/membership status and use its own device/provisioning-recovery flow. It cannot fetch protected ciphertext as usable workspace content or mutate documents.
- An active target device exposes its canonical registered public key/fingerprint only through authorized provisioning flow.
- An active, key-ready Owner/Admin device wraps the current workspace key client-side for the intended target device. The server verifies workspace, target user/device, public-key fingerprint, algorithm, key version, wrapper authority, and replay constraints.
- Once a valid current envelope exists for an active member device, that device becomes key-ready and membership can become active under the domain rule.
- If the original provisioner is unavailable, another authorized key-ready Owner/Admin device may retry. If none exists, the product reports the terminal unrecoverable state defined by ADR-010; Foundation has no recovery artifact or server plaintext recovery.
- Removal takes effect on the next request, blocks future envelope delivery, and does not revive old invitations. Rejoining requires a new invitation and authorization episode.

### Data fields

Minimum server-visible fields are opaque invitation ID, workspace ID, provider identifier, immutable provider subject, offered role, inviter user ID, token digest, state, server timestamps, and privacy-safe audit references. Raw token, OAuth credentials, document data, keys, and private device material are forbidden from storage and logs.

## Alternatives

- **Bind to GitHub username:** rejected because usernames may change or be reassigned and are not immutable identity keys.
- **Email invitation:** deferred because identity resolution, delivery, and retention would introduce a second PII/provider contract.
- **Reusable or non-expiring invite link:** rejected because it creates indefinite bearer authority and replay risk.
- **Store raw token:** rejected because database/log exposure would yield immediately usable invitations.
- **Create active membership at acceptance:** rejected because authorization acceptance and E2EE key readiness are distinct.
- **Server wraps/recovers the workspace key:** rejected because the E2EE boundary forbids server plaintext key access.

## Consequences

Positive consequences:

- Acceptance is bound to an immutable provider identity rather than a mutable handle.
- A database leak does not directly reveal raw invitation tokens.
- A 72-hour, revocable, single-use lifecycle bounds bearer exposure.
- `pending_key` makes onboarding and unavailable-provisioner behavior honest and testable.

Costs and limitations:

- Creation depends on an authenticated, rate-limited GitHub identity lookup.
- Username resolution can fail or be unavailable; retry and sanitized error UX are required.
- Manual delivery depends on the inviter selecting an appropriate external channel; DocVault cannot revoke a copied link, but revoking/replacing its server record makes that token unusable.
- Acceptance can complete before cryptographic use, requiring visible pending/recovery UX.

## Security/privacy

- Provider subject is internal identity/security data; username/display snapshot is minimized and retained only under the approved policy.
- Responses must resist username, account, workspace, membership, and invitation enumeration.
- Raw invitation tokens, provider access tokens, authorization codes, cookies, and request bodies are never logged.
- Creation, revocation, acceptance, mismatch, expiry, and rate-limit outcomes use allow-listed audit/operational metadata.
- Token URL handling uses the fragment/bootstrap POST contract above to avoid referrer and server-log leakage; the invite route and transaction are excluded from analytics and Service Worker caching.
- A token alone grants neither session nor membership; a membership alone grants no decrypt path while `pending_key`.

## Operations

- GitHub identity resolution uses bounded timeouts, rate limits, stable sanitized errors, and observable result categories without target PII.
- Server time owns the 72-hour expiry; clock-boundary behavior must be deterministic in tests.
- A scheduled cleanup/retention process may mark or purge expired terminal records only under the approved retention policy.
- Invitation endpoints and responses use `no-store`; `/api/v1/*` never enters app-shell caches.
- Preview and production use isolated OAuth/provider credentials, origins, D1 data, secrets, and synthetic identities.

## Test implications

- Create as Owner/Admin/Editor/Viewer and verify exact offered-role ceilings and side effects.
- Mock GitHub lookup for valid, renamed, missing, malformed, rate-limited, timed-out, and changed-username cases; acceptance follows immutable subject.
- Verify duplicate creation/resend leaves exactly one pending invitation and the prior token is unusable.
- Verify fragment capture/removal, bootstrap POST, OAuth transaction binding, refresh/back/history behavior, and absence from referrer, browser storage, analytics, Service Worker caches, platform logs, and callback URLs.
- Inspect D1/logs/telemetry/build/browser storage for raw-token and sensitive canaries.
- Test at creation, just before 72 hours, exactly 72 hours, and after expiry using deterministic server time.
- Accept as correct subject, wrong subject, expired, revoked, reused, malformed, and concurrently in isolated user contexts.
- Inject transaction failure between invitation consumption and membership insert; both must roll back.
- Verify acceptance creates `pending_key`, not protected read/write access; provision later and observe readiness transition.
- Substitute target public key/fingerprint, wrapper identity, workspace, device, algorithm, and key version; no envelope/readiness transition may occur.
- Remove member/revoke device with pending offline work; next submission and future key delivery are denied.
- Compare responses/timing across nonexistent, already-member, already-invited, revoked, and expired targets under the approved privacy contract.

## Requirement/threat links

- Requirements: CF-INV-001–005, CF-RBAC-001–004, CF-ID-001/003, CF-DEV-001/003/004, CF-KEY-002/003/005/006, CF-AUD-001/002, CF-OPS-001/002/005.
- Product journeys: J1, J3, J7.
- Abuse cases: AB-07, AB-08, AB-18, AB-21, AB-22, AB-23, AB-24, AB-25.
- Primary threats: identity reassignment, token theft/replay, concurrent acceptance, enumeration, excessive role grant, key substitution, unauthorized provisioning, onboarding deadlock.

## Gate G2 acceptance

- [x] Product Owner approves immutable GitHub-subject binding, role ceilings, 72-hour expiry, hashed token, single use, revocation, and `pending_key` acceptance.
- [x] Acceptance and key readiness are independent, testable states.
- [x] Owner/Admin invitation and revocation ceilings match ADR-003.
- [x] Security Reviewer approves token entropy/hash construction, provider lookup, anti-enumeration, and URL-handling contract.
- [x] Technical Lead approves GitHub API identity-resolution behavior, timeout/rate limits, and transaction contract.
- [x] UX Lead approves manual fragment-link delivery, single-pending replacement, invite preview, and recovery messaging.
- [ ] Product Owner approves manual fragment-link delivery, single-pending replacement, invite preview, and recovery messaging.
- [x] Retention and cleanup rules are approved through ADR-008.
- [x] Senior QA accepts the identity, lifecycle, race, privacy, and pending-key provisioning evidence plan; executable evidence remains a Phase 1 release gate.

Gate G2 remains open for Product Owner/UX acceptance of the delivery and onboarding experience. The accepted product contract does not authorize implementation.
