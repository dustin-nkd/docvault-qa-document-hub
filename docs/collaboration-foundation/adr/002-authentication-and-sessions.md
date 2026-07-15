# ADR-002: Authentication and Sessions

## Status

Proposed for Gate G2 approval. No implementation is authorized by this ADR alone.

## Date

2026-07-15

## Owners

Security Reviewer (decision owner), Technical Lead (implementation owner), Product Owner (policy owner), Senior QA (evidence owner).

## Context

Collaboration needs an individual, stable identity. The Personal Vault master password identifies neither a person nor a workspace member. Browser sessions must resist callback substitution, fixation, theft, replay, CSRF, and stale authorization without exposing provider or session secrets.

## Decision

GitHub OAuth is the sole Foundation identity provider. The canonical identity key is the provider name plus GitHub's stable numeric user `id`; login and email are mutable display/contact attributes and never authorization keys.

OAuth Authorization Code flow uses PKCE S256, a high-entropy single-use `state`, an exact pre-registered redirect URI, and server-side code exchange. Collaboration uses opaque application sessions, not GitHub access tokens. Raw session tokens exist only in a Secure, HttpOnly cookie and request runtime; D1 stores only a keyed hash. Sessions expire after 12 hours idle or 7 days absolute, whichever occurs first. A high-risk action requires authentication no older than 15 minutes.

## Detailed contract

### OAuth transaction

- Pages Functions creates at least 256 bits of random `state` and a PKCE verifier, stores only their protected transaction record with a 10-minute expiry, and sends `code_challenge_method=S256`.
- The callback accepts one exact scheme, host, path, and environment-specific redirect URI. No user-controlled post-login URL is used unless it is a validated same-origin relative path.
- State, transaction, and authorization code are single-use. Missing, expired, mismatched, or replayed values fail without creating or changing a user/session.
- Token exchange occurs only in Pages Functions using a Cloudflare secret. Authorization codes and provider tokens are never placed in application URLs, D1, browser storage, logs, telemetry, or build artifacts.
- The backend obtains and validates the GitHub numeric user ID. The stable key is `github:<decimal-id>`. Account linking or provider-subject replacement is not supported in Foundation and requires a later security ADR.
- Login/email/avatar changes update display attributes only. Generic callback errors do not disclose account existence.

### Session lifecycle

- A session token contains at least 256 random bits. D1 stores a keyed HMAC-SHA-256 token digest, user ID, creation time, last-seen time, absolute expiry, authentication time, revocation time/reason, and minimum device context; it never stores or returns the raw token.
- Cookie attributes are `Secure; HttpOnly; SameSite=Lax; Path=/`; no `Domain` attribute is set. Production and preview use different cookie names and signing/hash keys.
- The session is rotated after login, reauthentication, privilege-sensitive identity changes, and suspected fixation. The predecessor is atomically revoked.
- Idle expiry is 12 hours since server-observed activity. Absolute expiry is 7 days from creation and is never extended. Last-seen writes may be coalesced for at most 5 minutes without extending either limit incorrectly.
- Logout revokes the server record before clearing the cookie. Expired, revoked, malformed, unknown, or unhashed legacy tokens return `401` with no protected side effect.
- Membership and device authorization are re-evaluated from server state on every request; a valid session does not cache a role grant.
- Workspace deletion, account security response, and administrator-approved global logout revoke affected sessions. Member removal is immediately effective through membership denial even if the user's unrelated sessions remain valid.

### Reauthentication and CSRF

- Ownership transfer, workspace deletion, workspace export, recovery-artifact creation, adding an Owner/Admin, revoking another user's device, and recovery/key-reset operations require `now - authenticatedAt <= 15 minutes`; otherwise return a typed reauthentication requirement.
- Every state-changing request requires an exact allowed `Origin`, a server-generated synchronizer CSRF token bound to the session, and the token in a custom header. The token is not stored in local/session storage or accepted in a URL.
- SameSite is defense in depth, not the sole CSRF control. GET/HEAD/OPTIONS are side-effect free. Requests with missing/null/unapproved origins or token mismatch fail before domain mutation.
- CORS credentials are permitted only for the exact canonical environment origin; wildcard and reflected origins are forbidden.

## Alternatives

- Personal Vault passwords as identity: rejected because they are shared local unlock material with no stable person or server revocation.
- GitHub token as the application session: rejected because it expands token exposure and couples provider scope to workspace authorization.
- JWT bearer sessions: rejected for Foundation because immediate revocation and compact server-side policy are more important than stateless verification.
- Email/login as identity: rejected because both can change and create account-takeover/linking ambiguity.
- SameSite without a CSRF token: rejected as insufficient across browser behavior and future integration changes.

## Consequences and residual risks

Sessions are centrally revocable and provider tokens have minimal lifetime. D1 session lookups add latency and operational state. OAuth provider compromise, a compromised unlocked browser, malicious extensions, and stolen cookies used before detection remain residual risks. Reauthentication reduces but does not eliminate harm from an actively controlled session.

## Security and privacy

Provider subject, session metadata, IP-derived abuse signals, and user agent data are Internal/Restricted. Retain only fields approved by the logging/retention contract. Never log cookies, codes, provider tokens, CSRF tokens, state, PKCE verifiers, token digests, or full callback URLs. Authentication responses use `Cache-Control: no-store`.

## Operations

Preview and production require separate OAuth applications, redirect URIs, secrets, D1 databases, cookie names, session keys, and origin allow-lists. Operators need session-revocation and key-rotation runbooks, provider-outage behavior, aggregate failure/rate metrics, and an emergency feature flag that does not delete sessions or data.

## Test implications

- Positive and negative callback tests cover state/PKCE mismatch, expiry, replay, exact redirects, mutable login/email, and code-exchange failure.
- Session tests use deterministic clocks for 12-hour idle, 7-day absolute, rotation, logout, revocation, and 15-minute reauthentication boundaries.
- Hostile-origin tests cover missing/null/forged Origin, absent/wrong/replayed CSRF tokens, GET mutation attempts, and preview/production crossover.
- Sensitive canaries prove codes, tokens, cookies, PKCE/state/CSRF values, and digests are absent from D1 fields, logs, telemetry, URLs, storage, and artifacts.

## Requirement and threat links

CF-ID-001 through CF-ID-004; CF-SES-001 through CF-SES-004; CF-OPS-002 and CF-OPS-005; threat-model T01-T03, T16, T19; abuse cases AB-01 through AB-03, AB-08, AB-18.

## Gate G2 acceptance

- [x] Security Reviewer approves the stable-subject, OAuth transaction, session, CSRF, and reauthentication contracts.
- [ ] Product Owner approves high-risk actions and session durations.
- [x] Preview and production OAuth/session isolation is specified and provisionable.
- [x] Senior QA maps every contract boundary to deterministic positive and negative evidence.
- [x] No open P0/P1 auth/session threat lacks an owner, control, or test.
