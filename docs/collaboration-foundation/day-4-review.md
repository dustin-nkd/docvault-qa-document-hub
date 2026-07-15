# Collaboration Foundation — Day 4 cross-functional review

Date: 2026-07-15

Status: Proposed for Gate G3; Phase 1 runtime implementation remains `NO-GO`

Reviewers: Product Owner / Senior BA, Technical Lead / Architect, Security Reviewer, Operations, Senior QA

## 1. Review objective

Determine whether the approved Day 3 architecture is expressed as precise API, D1, cryptographic, operational, risk, and quality contracts that can be consolidated on Day 5 without design-by-implementation. Gate G3 approves the contract baseline and Day 5 work only; it does not authorize runtime code, production resources, secrets, or migrations.

## 2. Artifact assessment

| Artifact | Day 4 outcome | Review status |
|---|---|---|
| [API contract](api-contract.md) | Versioned JSON protocol, sessions/CSRF/origin gates, route/RBAC matrix, schemas, limits, errors, idempotency, atomic side effects, export/delete denial, and privacy rules | Ready for Gate G3 |
| [D1 schema contract](schema-contract.md) | Entity/constraint/index model, guarded atomic batches, idempotency race handling, keyset pagination, retention, migration, and verification rules | Ready for Gate G3 |
| [Cryptographic contract](crypto-contract.md) | Canonical encodings, fixed algorithms and bounds, device/workspace/document envelopes, exact AAD, lifecycle, fail-closed errors, vectors, and browser gate | Ready for Gate G3 |
| [Operational runbook](operational-runbook.md) | Environment isolation, bindings/secrets, release/migration sequence, canary, rollback, Time Travel recovery, incidents, observability, and retention | Ready for Gate G3 |
| [Risk register](risk-register.md) | 22 owned risks, non-waivable outcomes, explicit residual limitations, evidence triggers, and review workflow | Ready for Gate G3 |
| [Quality strategy](quality-strategy.md) | Test levels/harnesses, regression surface, preview/production evidence, workload/budgets, browser/accessibility matrix, and TD-01–20 dispositions | Ready for Gate G3 |
| [Traceability matrix](traceability-matrix.md) | Stable requirements mapped to Day 4 contracts, threats, planned tests, owners, phases, and Gate G3 evidence | Ready for Gate G3 after final consistency check |

No Day 4 artifact adds runtime code or creates Cloudflare resources.

## 3. Contract decisions proposed for approval

### 3.1 API and authorization

- `/api/v1` is same-origin JSON over HTTPS; private responses are `no-store` and never served by the Service Worker.
- GitHub OAuth establishes identity by immutable provider subject. Opaque server-side sessions use a secure host-only cookie, 12-hour idle expiry, seven-day absolute expiry, and 15-minute recent authentication for high-risk operations.
- Every authenticated mutation requires exact Origin and a session-bound synchronizer token. Every protected request re-evaluates current session, device, membership, role, key readiness, and resource scope.
- Stable error codes are non-enumerating and privacy-safe. Request, page, payload, and rate limits are explicit.
- Document mutation uses authoritative revision compare-and-swap plus a scoped idempotency key. Required audit and mutation-result side effects are atomic.

### 3.2 D1 consistency

- UUIDv4 application identifiers and provider subjects remain distinct; server time is authoritative.
- Membership, invitation, device, envelope, document, revision, idempotency, audit, and retention records have explicit uniqueness and lifecycle constraints.
- Multi-statement mutations use D1 atomic `batch()` plus a failing guard statement so an unmet authorization, lifecycle, or revision condition rolls back the batch. A zero-row write must never be interpreted as success.
- Migrations are immutable and expand/contract compatible across old/new runtime versions. Preview and production have separate databases and migration evidence.

### 3.3 Cryptography

- Canonical JSON uses RFC 8785 JCS and unpadded base64url; unknown fields, aliases, malformed lengths, invalid points, and downgrade attempts fail closed.
- Device keys use P-256. Workspace-key delivery uses ephemeral P-256 ECDH, HKDF-SHA-256, and AES-256-GCM. Document payloads use AES-256-GCM with fresh 96-bit nonces and exact authenticated context.
- Local private-key envelopes use PBKDF2-HMAC-SHA-256 at exactly 600,000 iterations for v1 and AES-256-GCM. The slowest supported browser/device class must pass the performance gate before implementation approval.
- The server never receives plaintext private keys, workspace DEKs, document semantics, or recovery material. All-provisioners-lost may be terminal; prior downloaded plaintext/ciphertext cannot be remotely erased.

### 3.4 Operations and quality

- Local, preview, and production use isolated identity, D1, secret, origin, cookie, and synthetic-data boundaries.
- Initial recovery objectives are RPO `<= 5 minutes` and RTO `<= 60 minutes`, subject to Product/Operations approval and provider retention.
- The proposed small-team workload is 25 members/workspace, 10,000 documents/workspace, 50 revisions/document, and 10 concurrently active users.
- Preview budgets are API read p95 `<= 300 ms`, write p95 `<= 500 ms` excluding provider OAuth, 100% correctness, collaboration-only startup impact `<= 75 KiB` gzip, and decrypt/render of 100 representative documents p95 `<= 500 ms` on recorded reference hardware.
- The browser matrix is the latest two stable Chrome, Edge, and Firefox versions plus Safari 17.4 or later, with fail-closed feature detection. UX targets WCAG 2.2 AA.
- Production uses a dedicated non-destructive synthetic canary. P0/P1 suites allow zero skips, quarantines, disabled cases, or accepted flakiness.

## 4. E2EE credential-category clarification

Day 3 correctly approved both E2EE document semantics and exclusion of Credential documents. Day 4 makes the enforcement boundary precise:

- The official DocVault client blocks a stored Credential document before create, copy, import, or category-change encryption.
- All other current document categories are eligible through the official explicit workflow.
- The API validates authentication, authorization, workspace/provider routing, key version, envelope structure, size, revision, and idempotency.
- Because category and content are opaque ciphertext, the API cannot semantically determine whether an authorized malicious client hid credential content inside a valid payload. Claiming server-side plaintext validation would contradict E2EE.

This is a residual product/security limitation, not permission to share credentials. Gate G3 must explicitly accept the truthful boundary and require supported-client prevention, abuse detection/reporting, incident response, and user guidance. Weakening E2EE to enable server inspection is not proposed.

## 5. Cross-functional findings

### Product / BA

- The thin slice remains unchanged: identity, workspace, role-bound invitation, device/key provisioning, encrypted revision, conflict/idempotency, audit, and explicit personal-to-workspace copy.
- Credentials, realtime co-editing, comments, notifications, attachments, field-level permissions, organization hierarchy, and automatic personal migration remain out of scope.
- Day 4 resolves PD-10 as all current non-Credential categories eligible through official flows, with the E2EE enforcement limitation above.

### Architecture / Development

- Routes, schemas, cryptographic representations, atomic recipes, migration compatibility, and deterministic seams are specific enough to prevent implementation from inventing core behavior.
- Runtime implementation still requires Day 5 dependency ordering, work packages, resource naming, and the complete Phase 0 exit decision.

### Security

- Authentication, live authorization, E2EE, key binding, revocation, non-enumeration, environment isolation, log allow-lists, supply-chain controls, and recovery limitations are explicit.
- No Critical/High risk is unowned. Evidence remains intentionally open because Phase 0 contains no implementation.
- Product/Security acceptance is required for the credential semantic-inspection limitation and terminal key-loss behavior.

### Senior QA

- TD-01 through TD-20 have a contract source and honest disposition; TD-18 through TD-20 require Gate G3 approval.
- The future harness is `@cloudflare/vitest-pool-workers` with disposable real local D1, isolated preview resources, multi-context Playwright, fixed crypto vectors, supported-browser evidence, and production canary.
- Existing Personal Vault, Vault V2, guest, GitHub Sync, public share, offline shell, CSP, build artifact, performance, and both-deployment checks remain mandatory.

## 6. Gate G3 approval checklist

- [ ] Product Owner approves PD-10, workload/budgets, supported browsers, canary behavior, RPO/RTO, and visible residual-risk wording.
- [ ] Technical Lead approves the API/schema/crypto boundaries, D1 atomic recipes, deterministic seams, and migration compatibility model.
- [ ] Security Reviewer approves session/CSRF/origin policy, algorithm registry/vectors, secret/logging controls, risk dispositions, and E2EE credential limitation.
- [ ] Operations approves environment isolation, release/canary/rollback process, Time Travel recovery, incident ownership, and recovery objectives.
- [ ] Senior QA approves test levels, evidence policy, traceability, zero-skip P0/P1 rule, and Gate G3 regression baseline.
- [ ] No contract contradicts Gates G0–G2 or silently changes an approved ADR without an explicit clarification.
- [ ] No P0 decision or unowned Critical risk remains.
- [ ] Gate G3 is recorded as Passed only after the Product Owner explicitly approves this package.
- [ ] Phase 1 runtime remains blocked until Day 5 completes the full Phase 0 exit gate.

## 7. Squad recommendation

**GO to Product Owner Gate G3 review. NO-GO for Phase 1 runtime implementation.**

On Gate G3 approval, Day 5 may consolidate the specification, close cross-document inconsistencies, define the sequenced implementation backlog and evidence plan, and present the complete Phase 0 exit decision.
