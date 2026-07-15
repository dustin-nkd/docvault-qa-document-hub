# ADR-011: Browser and API Security

## Status

Approved at Gate G2.

## Date

2026-07-15

## Owners

Security Reviewer (security baseline), Technical Lead (browser/API implementation), Operations (edge/deployment), Senior QA (evidence).

## Context

E2EE depends on trustworthy browser code while unlocked. The existing Service Worker caches same-origin GET responses and must not intercept future collaboration APIs. Pages Functions will handle hostile input, ambient cookies, D1, OAuth, and sensitive metadata across canonical, preview, and fallback environments.

## Decision

Collaboration is available only at approved Cloudflare origins through same-origin `/api/v1`. All API/auth/invitation responses are `Cache-Control: no-store`; the Service Worker bypasses `/api/*` and auth callback paths before any cache lookup or fetch handler fallback. Browser rendering is text-safe under a strict nonce/hash-based CSP with no unsafe script execution. The API enforces exact origins, session/CSRF/RBAC, schema and size bounds, rate limits, parameterized D1 access, privacy-safe errors, and allow-listed logs.

## Detailed contract

### Browser execution and rendering

- Production CSP defaults to `default-src 'none'`; allow only required self-hosted scripts/styles/assets and explicitly approved connection/image sources. `script-src` uses hashes or nonces and forbids `'unsafe-inline'`, `'unsafe-eval'`, `data:` scripts, and unapproved third parties. Use `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, and `form-action 'self'`.
- Trusted Types is enforced where supported after compatibility validation. Dynamic HTML sinks are prohibited by default. User/decrypted/provider/error fields render via text APIs; approved rich content uses one reviewed sanitizer policy.
- Secrets, unwrapped keys, raw tokens, and decrypted payloads are not placed in DOM attributes, URLs, history, clipboard automatically, console, crash reports, analytics, or global long-lived state. Clear in-memory references and sensitive UI on lock, logout, account/workspace switch, removal, or device revocation.
- Static assets are allow-listed by the build. Source maps and repository/config files are excluded from production unless explicitly reviewed as public.

### Service Worker and caching

- The fetch handler checks URL/path before cache logic. `/api/`, OAuth callback, auth/session, invitation, and other private routes are always direct network requests and never read from or written to Cache Storage.
- API responses include `Cache-Control: no-store, private` and appropriate legacy cache directives where required. They never return app-shell/navigation HTML for API errors.
- Only versioned public application-shell assets are precached. Activation deletes obsolete app-shell caches without touching Personal Vault/IndexedDB data.
- Offline collaboration displays retained local state/drafts and a typed unavailable/pending state; it does not emulate an API success or authorization decision.

### API request security

- Accept HTTPS and exact configured Host/Origin only. CORS is absent for normal same-origin use; if emitted, it names one exact environment origin, uses `Vary: Origin`, and never uses wildcard with credentials.
- State-changing requests require ADR-002 session, CSRF header, exact Origin, JSON `Content-Type`, and role/device/workspace authorization. GET/HEAD are side-effect free.
- Endpoints accept explicit versioned JSON schemas with unknown-field rejection, type/range/length/count bounds, and a maximum request body of 1 MiB for Foundation. Ciphertext-specific limits may be lower. Parse/validation occurs before D1 mutation or expensive crypto-adjacent work.
- Resource queries are parameterized and scoped by authenticated membership/workspace. Actor, role, server time, revision result, and audit identity are server-derived. Denials do not distinguish nonexistent from out-of-scope resources.
- Mutations use D1 transactions, base revision compare-and-set, and scoped idempotency keys. Errors have stable codes, a request ID, safe user message, and no stack, SQL, secret, cross-workspace identifier, or request echo.

### Rate and abuse controls

- Default authenticated API budget: 120 requests per user per minute and 300 per source IP per minute, with bounded burst; ordinary document mutations additionally allow 60 per user per minute.
- Login start/callback: 20 attempts per source IP per 10 minutes. Invitation inspect/accept: 10 per token discriminator and 30 per source IP per 10 minutes. Workspace/device/key administration: 30 per user per 10 minutes.
- Limits return `429` with bounded `Retry-After`, do no domain mutation, and use privacy-preserving keys. Production values may be lowered by configuration; raising them requires load/abuse evidence and Security/Operations approval.
- Pagination has a default 50 and maximum 100 records. Batch operations are absent unless separately specified. D1 time/row work and outbox retry use bounded deadlines and exponential backoff with jitter.

### Logging and headers

- Structured logs use an allow-list: request ID, route template, method, coarse outcome/status, latency, environment, and approved opaque actor/workspace/device identifiers or keyed aggregates. Retention and access are approved operationally.
- Never log bodies, query strings containing capabilities, cookies, authorization headers, OAuth codes/tokens, state/PKCE/CSRF, raw invite/session tokens or digests, passwords, PATs, recovery secrets, private keys, DEKs, key envelopes, document ciphertext, plaintext, titles, tags, or stack/SQL details.
- Responses use HTTPS/HSTS on canonical production, `X-Content-Type-Options: nosniff`, restrictive `Referrer-Policy`, `Permissions-Policy`, CSP, and clickjacking protection through `frame-ancestors`.

### Environment and fallback

- Preview and production have separate D1, OAuth, secrets, cookie names/keys, accepted origins, log datasets, bindings, and migration controls. No test bypass or permissive origin exists in production.
- GitHub Pages is Personal Vault/guest fallback only. Collaboration controls fail closed and link to the canonical origin without session, invitation, key, workspace, OAuth, or document values in the URL.
- Capability detection is bounded and non-mutating. Missing API never triggers retry loops, cached API imitation, Personal Vault upload, or local data corruption.

## Alternatives

- Cache-first/network-first handling for `/api/*`: rejected because private/stale/cross-user responses could be served.
- Broad CORS or wildcard origin: rejected because collaboration is same-origin and uses ambient cookies.
- CSP with unsafe-inline/eval: rejected because XSS can directly defeat endpoint encryption.
- Request-body/debug logging: rejected because redaction after collection is unreliable.
- UI-only rate limiting and authorization: rejected because hostile clients bypass the UI.

## Consequences and residual risks

Strict CSP and schema validation constrain dependencies and legacy rendering patterns. Rate limits may reject unusual legitimate bursts and require clear retry UX. CSP/sanitization cannot protect an already compromised extension, browser, device, trusted dependency, or authorized user. GitHub Pages cannot provide equivalent headers and therefore cannot offer collaboration.

## Security and privacy

The browser is trusted only while uncompromised and unlocked. Minimize plaintext lifetime and telemetry. IP/user-agent abuse signals can be personal data; use coarse/short-lived or keyed forms and approved retention. Operational access to logs and Cloudflare metadata is least-privileged and audited.

## Operations

Maintain CSP violation review, dependency/secret/artifact scanning, rate-limit dashboards, sanitized error metrics, Service Worker cache-version rollback, D1 saturation alerts, environment configuration assertions, and incident/feature-disable runbooks. Deployments must be compatible with current/adjacent schemas and preserve encrypted local drafts.

## Test implications

- XSS corpus covers every decrypted field, provider/member display field, conflict/error path, rich-text sanitizer, and supported browser; CSP violations are asserted.
- Offline/seeded-cache tests prove `/api/*`, callback, session, and invitation routes never hit Cache Storage or return shell HTML.
- API matrices cover method/content type/origin/CSRF/session/role/device, unknown fields, 1 MiB boundary, malformed IDs, pagination, injection, concurrency, and non-disclosing errors with D1/audit side effects.
- Rate tests verify each tier, concurrency, bounded `Retry-After`, recovery, and no mutation at rejection.
- Canary scans inspect logs, telemetry, D1, caches, browser storage, source maps, `_site`, CI output, and error bodies.
- Cross-environment and GitHub Pages suites prove no shared session/data/secret/origin and no fallback retry or local corruption.

## Requirement and threat links

CF-SES-003 and CF-SES-004; CF-RBAC-001 through CF-RBAC-004; CF-DOC-002, CF-DOC-003, CF-DOC-005; CF-ISO-004 and CF-ISO-005; CF-FB-001 and CF-FB-002; CF-OPS-001 through CF-OPS-005; CF-NFR-001, CF-NFR-002, CF-NFR-004; threat-model T03-T04, T11, T13-T16, T18-T23; abuse cases AB-03 through AB-06, AB-08, AB-15 through AB-20.

## Gate G2 acceptance

- [x] Security Reviewer approves CSP, rendering, API, origin/CSRF, logging, error, and rate contracts.
- [x] Technical Lead accepts the requirement that Service Worker bypass precede all `/api/*` cache handling; executable proof remains a Phase 1 gate.
- [x] Operations approves environment isolation, header delivery, log access/retention, limits, alerts, and rollback as implementable controls.
- [x] Senior QA owns the executable XSS, cache, API abuse, canary, environment, and fallback evidence plan.
- [x] No P0/P1 browser/API threat is accepted solely through UI behavior or undocumented infrastructure defaults.
