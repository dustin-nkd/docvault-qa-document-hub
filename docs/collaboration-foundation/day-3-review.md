# Day 3 Cross-Functional Review

Status: Gate G2 awaiting Product Owner approval

Date: 2026-07-15

Reviewers: Product/BA, Architecture, Security, Senior QA

## 1. Purpose

Determine whether the Collaboration Foundation architecture decisions are explicit, mutually consistent, secure, operable, and testable enough to proceed to Day 4 API, schema, and operational contracts. Gate G2 does not authorize runtime implementation.

## 2. Decision package

| Area | Approved direction proposed for Gate G2 |
|---|---|
| Runtime/storage | Canonical Cloudflare Pages, same-origin `/api/v1` Pages Functions, and environment-isolated D1; GitHub Pages is fail-closed personal/guest fallback. |
| Identity/session | GitHub OAuth numeric subject; Authorization Code + PKCE/state/exact callback; opaque hashed sessions with 12-hour idle, 7-day absolute, and 15-minute high-risk reauthentication. |
| Authorization | The Gate G1 Owner/Admin/Editor/Viewer ceilings are centralized and enforced on every server request. |
| Device/workspace keys | Browser Web Crypto P-256 ECDH, HKDF-SHA-256, AES-256-GCM, user-unlocked encrypted device private-key storage, versioned workspace DEKs, and fully bound per-device envelopes. |
| Metadata privacy | All document semantics and workspace description are encrypted; a bounded workspace display name and a strict routing/security/audit allow-list are server-visible. |
| Consistency/offline | Server revision compare-and-set, HTTP 409, immutable revisions, scoped idempotency, and an encrypted bounded outbox with explicit quarantine. |
| Provider isolation | Personal Vault, collaboration, Guest, public sharing, and GitHub Pages fallback never share persistence authority; transfer is an explicit one-time eligible copy. |
| Audit/retention | Server-authoritative allow-listed audit events; no content or secrets; bounded retention and purge contracts. |
| Invitations | Entered GitHub username is resolved once to an immutable subject; 256-bit fragment-link token, manual delivery, hash-only storage, 72-hour single use, single-pending replacement, revocation, and `pending_key` after acceptance. |
| Revocation/recovery | Immediate server denial; mandatory future-key rotation after removal/compromise; another key-ready Owner/Admin is the only Foundation recovery path; no escrow or exported recovery kit. |
| Browser/API | Strict CSP/text-safe rendering; `/api/*` network-only and `no-store`; exact origin + session + CSRF + RBAC; schema/size/rate limits and allow-listed logs. |
| Migration/rollback | Ordered immutable expand/contract migrations, preview/production separation, backup/restore rehearsal, code-schema compatibility, feature flags, and non-destructive rollback. |

## 3. Cross-functional findings

### Product/BA

- The architecture preserves the approved Foundation scope and role policy.
- The product must clearly explain `pending_key`, conflicts, quarantined offline changes, rotation pauses, GitHub Pages limitations, and terminal cryptographic loss.
- Realtime editing, comments, attachments, shared credentials, email invitations, server search of protected fields, and provider synchronization remain outside Foundation.

### Architecture

- Same-origin Pages Functions plus D1 is sufficient for Foundation request/response workflows.
- D1 bindings are used directly; Durable Objects, R2, Queues, and Workflows remain deferred until their use cases are approved.
- No implementation may activate before compatible migrations, environment assertions, and feature-flag controls are ready.

### Security

- The server never needs document plaintext, workspace DEKs, device private keys, local unlock secrets, raw session tokens, or raw invitation tokens.
- Revocation cannot erase plaintext, ciphertext, or old keys already copied by a formerly authorized user; all user and support messaging must state this limitation.
- A compromised unlocked browser, extension, device, OAuth provider, or authorized insider remains outside what E2EE alone can prevent.

### Senior QA

- Every decision contains positive, negative, abuse, race, inspection, environment-isolation, and rollback evidence expectations.
- Characterization tests for Personal Vault, Guest, GitHub Sync, public sharing, credentials, history, exports, dashboards, Service Worker, security headers, and both deployments remain release gates.
- Executable collaboration tests belong to later implementation phases; Gate G2 approves the test contracts and deterministic seams, not fabricated runtime evidence.

## 4. Residual risks accepted only with explicit Product Owner approval

1. Foundation recovery is unavailable when every key-ready Owner/Admin provisioning device is lost; Cloudflare/support cannot decrypt or reset the workspace.
2. Removed members may retain data or old keys already received. Rotation protects future key versions, not prior copies.
3. Encrypting document titles, categories, status, tags, workspace description, and content means document search/filter/dashboard derivation is client-side; the server-visible workspace name remains Internal metadata.
4. GitHub Pages cannot provide collaboration during a canonical Cloudflare/API outage.
5. Offline mutations can expire, conflict, or become unauthorized; the product preserves them for review/quarantine and never silently forces them through.

## 5. Gate G2 checklist

- [x] Twelve ADRs have stable identifiers, owners, alternatives, consequences, security/privacy, operations, and test implications.
- [x] The Gate G0 product boundary and Gate G1 role policy are preserved.
- [x] All Day 3 blocking decision areas have a proposed disposition.
- [x] Personal, Guest, public-share, collaboration, preview, production, and fallback boundaries remain explicit.
- [x] No design requires server plaintext or client-supplied authorization authority.
- [x] Critical residual risks and truthful UX obligations are explicit.
- [x] Senior Developer, Security, BA, and Senior QA cross-review is complete for the proposed baseline.
- [ ] Product Owner approves the complete decision package and residual risks.
- [ ] Gate G2 is marked Passed after approval.

## 6. Gate decision

Squad recommendation: **GO for Day 4 after Product Owner approval; NO-GO for Phase 1 runtime implementation.**

Approval statement:

> Approve the twelve Day 3 ADRs as the Collaboration Foundation architecture baseline, including the listed session limits, encrypted metadata boundary, user-unlocked device-key protection, no-escrow/no-export recovery policy, rotation limitations, retention baselines, offline conflict/quarantine behavior, Cloudflare-only collaboration availability, and required verification contracts.

- [ ] Product Owner approves the statement above.
- [ ] Day 4 API, schema, and operational contract work may begin.
