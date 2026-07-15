# ADR-001: Runtime and Storage Boundary

Status: Approved at Gate G2

Date: 2026-07-15

Owners: Senior Developer / Architect; Security Reviewer; Senior QA

## Context

DocVault is a static, offline-first application deployed to Cloudflare Pages and GitHub Pages. Collaboration requires a server authority for identity, membership, revisions, audit, and encrypted shared records without weakening Personal Vault behavior. Foundation excludes realtime editing and attachments.

## Decision

Use the existing Cloudflare Pages project for static assets, same-origin Pages Functions under `/api/v1/*` for the collaboration API, and a D1 binding as the collaboration system of record. The browser encrypts protected document data before upload. GitHub Pages remains a personal/guest-only fallback and never emulates collaboration.

Durable Objects, R2, Queues, and Workflows are not Foundation dependencies. They require a later ADR when realtime coordination, attachments, or durable background processing becomes approved scope.

## Detailed contract

### Runtime boundary

- Static routes remain public application assets.
- `/api/v1/*` executes only in Pages Functions and returns `404` or a capability-unavailable response on hosts without the API.
- The API trusts neither browser-supplied actor/role/time nor identifiers outside the authenticated, workspace-scoped lookup.
- Functions access D1 through the environment binding, not through Cloudflare's public REST API.
- Request-scoped state is never stored in module-level mutable variables.
- Every asynchronous operation is awaited or deliberately scheduled through the execution context; security mutations complete before success is returned.
- Large or unknown bodies are rejected by a declared size limit or streamed. No handler buffers an unbounded body.

### D1 boundary

D1 stores users and provider subjects, workspaces, memberships, invitations, sessions, devices and public keys, workspace-key envelopes, encrypted documents and append-only revisions, idempotency records, tombstones, and allow-listed audit events.

D1 must never store document plaintext, raw workspace/data-encryption keys, device private keys, local unlock secrets, OAuth client secrets, raw session or invitation values, personal GitHub PATs, or request bodies in logs.

Queries are parameterized and scoped by the authenticated identity plus workspace. Multi-record security mutations use a transactionally safe D1 operation or an equivalent single-statement invariant. Read-after-write flows that require sequential consistency use the D1 session/bookmark mechanism selected during implementation.

### Environment isolation

- Production and preview bind different D1 databases, OAuth applications/secrets, session signing or hashing secrets, accepted origins, and telemetry datasets.
- A preview deployment cannot read or mutate production records.
- Local development uses disposable D1 data and deterministic identity/clock/token seams available only in test configuration.
- Configuration contains non-secret binding names; secrets remain in Cloudflare secret storage.

### Deployment

- Runtime assets continue through the allow-listed `_site` build.
- Database migrations complete and pass compatibility checks before code requiring the schema becomes active.
- A feature flag keeps collaboration unavailable until health, migration, security, and smoke checks pass.
- Structured logs contain request ID, route template, status, duration, environment, and approved security-event codes only.
- The Worker compatibility date is reviewed deliberately, bindings are type-generated from configuration, and production observability is configured before Phase 1 release.

## Alternatives considered

### Static client plus GitHub storage

Rejected because a browser-held PAT and repository writes cannot provide trustworthy team membership, server RBAC, atomic revisions, or authoritative audit.

### Durable Objects from Foundation start

Rejected for now because realtime presence and serialized collaborative editing are outside scope. D1 is sufficient for request/response workflows with explicit concurrency control.

### External database or separate API origin

Rejected for Foundation because it adds credential, CORS, network, and operational boundaries without a demonstrated requirement.

### GitHub Pages as an active fallback API

Rejected because GitHub Pages is static and cannot enforce collaboration authorization.

## Consequences and residual risks

- Same-origin Pages/Functions simplifies cookies, CSP, and CORS but makes origin compromise more consequential.
- D1 exposes access patterns, identifiers, sizes, timestamps, and approved metadata even when payloads are encrypted.
- D1 consistency and transaction limits constrain mutation design; invariants must be proven with integration and concurrency tests.
- GitHub Pages remains available during Cloudflare failure, but only personal/guest functionality works there.
- Realtime features later require a new coordination decision, likely Durable Objects.

## Security and privacy

- All private responses are `no-store`; the Service Worker excludes `/api/*`.
- No wildcard CORS is allowed. Production accepts only the canonical origin.
- Secrets are obtained from bindings and are never committed, returned, or logged.
- Error responses expose a stable code and request ID, not SQL, stack traces, account existence, or cross-workspace identifiers.

## Operations

- Health checks cover Functions routing, the correct environment binding, D1 read/write, and migration version without exposing data.
- Metrics cover latency, errors, conflicts, authorization denials, rate limits, and migration version using low-cardinality labels.
- Recovery requires the migration/backup contract in ADR-012; a static rollback alone is insufficient after a destructive schema change.

## Test implications

- Local Functions+D1 contract tests for bindings, parameterized workspace scoping, transaction invariants, and consistency-sensitive flows.
- Preview isolation test that seeds a marker and proves production cannot observe it, and the reverse.
- Browser tests that `/api/*` is never served by the Service Worker or browser cache.
- Artifact and secret scans proving repository-only files, plaintext fixtures, and secrets do not enter `_site`.
- Production and GitHub Pages smoke tests proving canonical collaboration and fail-closed fallback behavior.

## Requirement and threat links

Requirements: CF-ISO, CF-SEC, CF-SYNC, CF-AUD, CF-OPS. Threats: T01, T06, T08, T15, T18, T19, T20, T21, T22. Decisions: DL-002, DL-004, DL-005, DL-006.

## Gate G2 acceptance

- [x] Architecture and Security accept Pages Functions plus D1 as the Foundation boundary.
- [x] Senior QA accepts the local, preview, production, and fallback evidence plan.
- [x] Environment separation, API cache exclusion, binding use, observability, and migration ordering are non-optional Phase 1 controls.
- [x] Product accepts that collaboration is unavailable on GitHub Pages and during a canonical API outage.
