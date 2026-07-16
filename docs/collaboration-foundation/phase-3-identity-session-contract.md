# Phase 3 identity and session implementation contract

Status: **Contract frozen; `CF-P3-005` PASS; awaiting Gate P3-G2C approval**

Date: 2026-07-16

Owners: Technical Lead, Senior QA

Reviewers: Product Owner, Security Reviewer, Operations, Privacy Reviewer

## 1. Decision

The Phase 3 identity/session design is frozen and implementable without changing the approved identity, OAuth transaction, or session tables. Gate P3-G0 authorized this contract work only. No runtime code, migration, Cloudflare configuration, provider application, secret, identity data, or remote resource was created or changed.

Gate P3-G1 may authorize `CF-P3-002` only. Preview identity remains disabled until the separate P3-G4 remote gate, production remains without D1 or identity secrets, GitHub Pages remains static, and collaboration/business routes remain unavailable.

## 2. Reconciled contract

This profile resolves the implementation details left between ADR-002, the API contract, schema version 9, the operational runbook, and current Cloudflare/GitHub capabilities.

| Area | Frozen decision |
|---|---|
| Provider | GitHub OAuth web authorization-code flow with PKCE S256 |
| Stable identity | `provider=github` plus the decimal string form of GitHub's numeric `id` |
| Provider scopes | Empty scope set; no repository, organization, or email access requested |
| OAuth transaction | Ten minutes, 256-bit state, digest-only lookup, encrypted PKCE/purpose/return context, one-use compare-and-set |
| Callback | Exact registered preview callback; provider exchange and `/user`; atomic transaction/user/session batch |
| Browser session | 256-bit opaque token in a host-only secure cookie; HMAC digest only in D1 |
| Session lifetime | 12-hour idle, 7-day absolute, 15-minute recent authentication |
| CSRF | Exact Origin plus a session-derived synchronizer token held in browser memory |
| Rate control | GA Cloudflare binding for burst shielding plus a later forward-only D1 window for the exact ten-minute budget |
| Runtime | Local deterministic test mode; one approved preview branch after P3-G4; production and fallback disabled |

GitHub's current OAuth documentation recommends state and PKCE S256, sets the temporary code lifetime to ten minutes, requires identity revalidation through `GET /user`, and recommends the durable numeric `id` rather than mutable login/email. Cloudflare Pages provides stable normalized branch aliases, environment-specific bindings/secrets, and its current Wrangler schema supports GA rate-limit bindings with only 10- or 60-second simple periods.

Sources checked on 2026-07-16:

- [GitHub OAuth web flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [GitHub OAuth application best practices](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app)
- [Cloudflare Pages preview aliases](https://developers.cloudflare.com/pages/configuration/preview-deployments/)
- [Cloudflare Pages Functions bindings and secrets](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Cloudflare Workers Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- Local locked Wrangler `4.111.0` configuration schema

## 3. Environment freeze

### 3.1 Local

- Uses a per-test disposable schema-9 D1 database.
- Uses injected deterministic clock, random, OAuth, rate-limit, and failure adapters.
- Makes no GitHub or Cloudflare control-plane network call.
- Test keyrings are fixtures in test-only modules; production source cannot select them from a request, header, cookie, query, or environment bypass.

### 3.2 Preview

The only approved future identity preview is:

- branch: `codex-cf-p3-preview`;
- origin: `https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev`;
- callback: `https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev/api/v1/oauth/github/callback`;
- D1: the already-approved isolated `COLLAB_DB` preview binding;
- identity: a dedicated GitHub OAuth app and designated synthetic identities only;
- cookie: `__Host-docvault-preview-session`.

Cloudflare currently deploys all non-production branches except `gh-pages`. Preview secrets are environment-wide, so P3-G4 must first narrow preview branch control to include only `codex-cf-p3-preview` and exclude `gh-pages`. No secret is provisioned while the include rule remains `*`.

Preview identity enables only when every predicate is true:

1. `APP_ENV=preview`;
2. `IDENTITY_RUNTIME_MODE=preview-only`;
3. request origin equals the frozen preview origin;
4. `COLLAB_DB` exists;
5. all five preview identity secrets/identifiers exist and validate;
6. `COLLABORATION_ENABLED=false` remains exact.

Any partial, unexpected, production, alternate-preview, or missing configuration returns the disabled boundary without identifying the missing component.

### 3.3 Production and GitHub Pages

- Production keeps `IDENTITY_RUNTIME_MODE=disabled`, no D1 binding, no OAuth/session/CSRF/rate key, and `COLLABORATION_ENABLED=false`.
- The four identity route templates may exist in a disabled build only when they remain persistence-unreachable and return the existing no-store unavailable response.
- GitHub Pages has no Functions runtime, OAuth callback, session cookie, D1, or collaboration call.
- Personal Vault, Guest, public share, and GitHub Sync behavior remain independent and unchanged.

## 4. Exact HTTP surface

No route outside this table is authorized in Phase 3.

| Method and path | Gate | Authentication and request proof | Success |
|---|---|---|---:|
| `POST /api/v1/oauth/github/transactions` | Exact Origin, JSON, bounds, rate | `sign_in`: public; `reauthenticate`: live session plus CSRF | 201 |
| `GET /api/v1/oauth/github/callback` | Exact registered callback, state, PKCE, one-use transaction | Provider transaction | 303 |
| `GET /api/v1/session` | Same-origin API/cache boundary | Optional session; returns CSRF only for a live session | 200 |
| `POST /api/v1/session/logout` | Exact Origin, live session, CSRF | Current session | 204 |

Every response is `Cache-Control: no-store, private`; API/service-worker isolation remains mandatory. Callback is the only state-changing GET and is protected by its protocol transaction. No CORS credential sharing or wildcard/reflected origin exists.

## 5. OAuth transaction profile

### 5.1 Authorization request

- Generate 32 random bytes through Web Crypto and encode base64url without padding: 43-character state.
- Generate 64 random bytes and encode base64url without padding: 86-character PKCE verifier.
- Compute `code_challenge = base64url(SHA-256(ASCII(verifier)))`; send `code_challenge_method=S256`.
- Send the exact `client_id`, exact preview `redirect_uri`, state, and challenge. Omit `scope`, `login`, and mutable account hints.
- For reauthentication, `prompt=select_account` may be sent, but callback identity equality remains authoritative.

The raw state is returned only in the authorization URL and callback request. The raw verifier never leaves the server.

### 5.2 State digest and encrypted envelope

`OAUTH_TRANSACTION_KEY` is a versioned JSON keyring with one active and at most one previous 32-byte base64url key. Every Phase 3 keyring has exact fields `version:1`, `activeKeyId`, and `keys`; key IDs are 1–32 lowercase `a-z0-9_-` characters, every key is 43-character unpadded base64url decoding to 32 bytes, active ID must exist, IDs are unique, and unknown fields fail closed. HKDF-SHA-256 uses `SHA-256(UTF8("docvault:key-derivation-salt:v1"))` as salt and derives 32-byte independent keys using:

- `docvault:oauth-state-hmac:v1` for state lookup;
- `docvault:oauth-envelope-aead:v1` for AES-256-GCM.

D1 stores `HMAC-SHA-256(derivedStateKey, rawState)` in `state_digest`.

`pkce_verifier_envelope` binary version 1 is:

```text
version(1 byte) | keyIdLength(1 byte) | keyId | iv(12 bytes) | ciphertext | GCM tag(16 bytes)
```

Its plaintext is UTF-8 JSON with the exact property order shown below, no extra fields, and no alternate serialization:

```json
{
  "verifier": "base64url",
  "purpose": "sign_in | reauthenticate",
  "returnPath": "/normalized/path?query",
  "initiatingSessionId": "uuid-or-null",
  "initiatingUserId": "uuid-or-null"
}
```

AEAD additional authenticated data is a versioned, length-prefixed UTF-8 tuple binding `transactionId`, `callbackOrigin`, `callbackPath`, decimal `createdAt`, and decimal `expiresAt`; concatenated or ambiguous encodings are prohibited. The complete envelope must remain at most 4,096 bytes. Unknown version/key ID, malformed length, decrypt failure, or AAD mismatch is a generic failed transaction with no side effect.

### 5.3 Safe return path

The default is `/`. Input is measured as UTF-8 and limited to 512 bytes. It must start with one `/`, may contain a query, and may not contain a fragment.

Reject:

- `//`, a scheme, host, port, userinfo, literal/encoded backslash, controls, malformed percent encoding, or a parsed origin mismatch;
- case-insensitive query keys `code`, `state`, `token`, `access_token`, `invite`, or `invitation`;
- nested percent encoding of a forbidden byte, or a value that cannot be normalized to `pathname + search` against the approved origin.

Store only normalized `pathname + search`. Provider or callback parameters are never copied into it.

### 5.4 Provider adapter and atomic callback

1. Look up the pending transaction using active/previous state digests; require server time before expiry.
2. Decrypt and validate the envelope and exact callback metadata.
3. Exchange the code with a 5-second timeout and no automatic retry.
4. Call `GET https://api.github.com/user` with a 5-second timeout, at most one retry for 429/502/503/504, capped jitter/`Retry-After` delay of 1 second, and an 8-second total provider budget.
5. Require a positive decimal numeric `id`; treat `login`, name, and avatar as bounded display metadata only.
6. Discard the GitHub token immediately after identity lookup; never persist, log, return, cache, or audit it.
7. Execute one D1 batch: compare-and-set pending to consumed, upsert by `(provider, provider_subject)`, revoke predecessor when applicable, and insert the new session.
8. Any failed guard or statement rolls back the full batch and returns no authority.

Reauthentication creation requires a live session, exact Origin, and current CSRF. The encrypted transaction binds the initiating session/user, callback numeric subject must match, and success rotates the session and refreshes `authenticated_at`.

Expected callback/provider failures always produce a sanitized same-origin `303`. The fragment carries only a random non-authoritative result marker and a generic outcome; the client removes it with `history.replaceState` before analytics/navigation. `GET /session`, not the marker, is authoritative. Marker replay grants nothing.

## 6. Session and CSRF profile

### 6.1 Token and cookie

- Generate 32 random bytes and encode base64url without padding.
- Derive the D1 digest with the active `SESSION_TOKEN_PEPPER` key and label `docvault:session-token-hmac:v1`.
- Store only the 32-byte digest in `sessions.token_digest`.
- Preview cookie is `__Host-docvault-preview-session`; future production reserves `__Host-docvault-session`.
- Attributes are `Secure; HttpOnly; SameSite=Lax; Path=/` with no `Domain`; expiry never exceeds the D1 absolute expiry.

Session policy:

- idle: 43,200 seconds;
- absolute: 604,800 seconds;
- recent authentication: 900 seconds;
- `last_seen_at` write coalescing: at most one write per 300 seconds.

Rotate after login, reauthentication, fixation/security risk, security-relevant changes, or a lookup matching the previous pepper. Revoke the predecessor in the same guarded operation before returning its successor. Logout revokes D1 first, then expires the cookie.

The pepper is also a two-key ring. Planned rotation keeps the previous key for at most seven days while old matches rotate forward. Emergency rotation revokes all old sessions before removing the previous key.

### 6.2 Synchronizer CSRF token

`CSRF_TOKEN_KEY` is an independent two-key ring using label `docvault:csrf-token-hmac:v1`. The token is derived from the raw session token, returned only by authenticated `GET /session`, held in browser memory, never stored in D1/URL/local storage, and verified with Web Crypto HMAC verification rather than direct string comparison.

Validation order is exact Origin, live session, then CSRF. A token from a different, expired, revoked, rotated, or cross-environment session fails uniformly. SameSite is defense in depth only.

## 7. Rate-control decision

The approved API budget is 20 OAuth transaction/callback attempts per source IP per ten minutes. Wrangler `4.111.0` exposes only 10- or 60-second simple binding periods, so the binding cannot be the authoritative ten-minute control.

The frozen design is:

1. `AUTH_BURST_LIMITER`: GA Cloudflare binding, six attempts per keyed source per 60 seconds, used as an early burst shield.
2. A future forward-only schema-10 operational table added in `CF-P3-007`, after P3-G3 approval, atomically enforces 20 attempts per 600-second window.
3. `RATE_LIMIT_KEY` creates a window-scoped HMAC of route family, aligned 600-second server window, and Cloudflare-provided `CF-Connecting-IP`; raw IP is never stored or logged. Local tests inject the source discriminator without trusting a request header. Counter rows expire after 1,200 seconds.
4. Local tests use a deterministic injected adapter. Process-global counters and request-selectable bypasses are prohibited.

The planned table contains only `key_digest`, fixed route family, aligned window start, count, and expiry. Its exact migration/retention/query contract must be reviewed before `CF-P3-007`; no Phase 2 migration is edited and this story adds no migration.

## 8. Stable errors and disclosure

| Surface | Frozen behavior |
|---|---|
| Transaction validation | `VALIDATION_FAILED`; allow-listed field/rule only |
| Origin/CSRF | `CSRF_REJECTED`; no indication which proof failed |
| Limit | `RATE_LIMITED`; bounded `Retry-After`, no identity/session existence detail |
| Disabled runtime | Existing `COLLABORATION_UNAVAILABLE` |
| Callback/provider error | Generic same-origin `303`; no provider code/message/URI/state/token |
| `GET /session`, absent/invalid/expired | `200` with `authenticated:false`; expire invalid cookie |
| Logout with invalid/expired session | `401`, then expire cookie |
| Logout success | Revoke then `204` |

All identity responses include no-store/private cache policy, no-referrer, nosniff, approved CSP, and a server request ID. Allow-listed structured logs contain route template, method, coarse outcome, latency, environment, and request ID only—never bodies, queries, cookies, raw/digested state, PKCE, provider tokens, session/CSRF values, IP/digest, SQL, stack, login, email, name, or avatar.

## 9. Key and secret inventory

| Binding | Kind | Purpose | Phase 3 production state |
|---|---|---|---|
| `IDENTITY_RUNTIME_MODE` | Non-secret enum | `disabled`, `local-test-only`, `preview-only` | `disabled` |
| `GITHUB_OAUTH_CLIENT_ID` | Non-secret identifier | Dedicated environment OAuth app | absent |
| `GITHUB_OAUTH_CLIENT_SECRET` | Secret | Server code exchange | absent |
| `OAUTH_TRANSACTION_KEY` | Secret keyring | State digest and encrypted transaction subkeys | absent |
| `SESSION_TOKEN_PEPPER` | Secret keyring | Session token digest | absent |
| `CSRF_TOKEN_KEY` | Secret keyring | Session-bound synchronizer token | absent |
| `RATE_LIMIT_KEY` | Secret keyring | Window-scoped source discriminator | absent |

Secret values never enter `wrangler.jsonc`, Git, build output, evidence, screenshots, logs, or commands. Generated types list names only after an approved configuration change. Secret presence is validated fail-closed; values are never compared directly or displayed.

## 10. Threat, risk, and evidence closure

| Threat/risk | Contract control | Planned executable evidence |
|---|---|---|
| T01 / R01 OAuth substitution/replay | Numeric ID, exact callback, state, PKCE, AEAD, CAS, generic errors | P3 UT/INT/API/SEC 001–004 |
| T02 / R02 session theft/fixation | Opaque cookie, digest only, expiry, rotate/revoke, keyring | P3 UT/INT/API/SEC 002–005 |
| T03 / R02 CSRF | Exact Origin, session-bound HMAC token, SameSite defense in depth | P3 UT/API/SEC 004/006 |
| R15 cache/fallback | API/SW bypass, no-store, no GitHub Pages auth | P3 API/SEC/E2E 003/006/009 |
| R16 logging/privacy | Allow-list, no provider/token/IP data, canary scan | P3 SEC/OPS 002–009 |
| R17 environment crossover | Dedicated branch/app/D1/secrets/cookie/origin; prod absent | P3 SEC/OPS/E2E 008–009 |
| R20 provider outage | Bounded timeout/retry, no downgrade, existing sessions continue | P3 INT/OPS 004/007/009 |
| R21 resource exhaustion | Input bounds, edge burst, authoritative D1 window | P3 PERF/SEC 007/009 |
| R22 Personal/guest crossover | Bootstrap remains capability-gated; no implicit traffic or migration | P3 SEC/E2E 006/009 |

Story evidence is [`CF-EV-P3-STA-001`](evidence/phase-3/CF-EV-P3-STA-001.md) and [`CF-EV-P3-SEC-001`](evidence/phase-3/CF-EV-P3-SEC-001.md). Executable runtime claims remain pending by design; these records prove contract completeness and prohibited-boundary preservation only.

## 11. Rollback and next gate

There is no runtime rollback for CF-P3-001 because it changes no runtime or remote state. Revert the documentation/manifest commit if Gate P3-G1 rejects the profile.

Gate P3-G1 reviewers must explicitly accept:

1. the encrypted envelope and domain-separated keyring profile;
2. the safe-return and callback-result rules;
3. dedicated preview branch/origin/app/cookie isolation and branch-control narrowing before secrets;
4. independent `CSRF_TOKEN_KEY` and `RATE_LIMIT_KEY`;
5. the hybrid rate design and later forward-only operational migration;
6. the exact error/log disclosure policy;
7. authorization of `CF-P3-002` only, with zero remote changes.

Recommendation: **APPROVE Gate P3-G1 and authorize `CF-P3-002` only.**

## 12. Implementation progress

`CF-P3-002` through `CF-P3-005` now pass their executable gates. The bounded GitHub adapter and atomic callback create digest-only authority, while the server-side lifecycle enforces idle/absolute expiry, coalesced activity, recent authentication, active/previous pepper lookup, single-successor rotation, revoke-first logout, and bounded retention using existing schema version 9. Evidence `CF-EV-P3-UT-003`, `CF-EV-P3-API-002`, `CF-EV-P3-INT-003`, and `CF-EV-P3-SEC-005` closes the session story. No HTTP route, binding, secret, OAuth app, or remote resource is active. The next decision is Gate P3-G2C for `CF-P3-006` only.
