# Collaboration Foundation Decision Log

Status: Phase 0 closed at Gate G4; retained as the controlling implementation decision history

Owner: Product Owner

Reviewers: Architecture, Security, Senior QA

## Purpose

This log records approved decisions, working assumptions, and blocking decisions. A working assumption is not implementation authorization. Decisions with architecture or security consequences must be expanded into the corresponding ADR before dependent Phase 1 work becomes Ready.

## Status definitions

- **Approved:** accepted by the accountable decision owner and safe to use as a specification baseline.
- **Working assumption:** direction accepted for discovery but not yet approved through its ADR.
- **Open:** options or consequences remain unresolved.
- **Blocked:** dependent work cannot proceed.
- **Superseded:** replaced by a later recorded decision.

## Decisions

| ID | Date | Decision | Status | Owner | Consequence / next artifact |
|---|---|---|---|---|---|
| DL-001 | 2026-07-15 | Gate G0 product boundary is approved. Foundation targets small internal QA/product teams and excludes realtime editing, comments, attachments, shared credentials, public workspaces, organization hierarchy, and automatic personal-data migration. | Approved | Product Owner | Day 2 may proceed. Phase 1 remains blocked by the complete Phase 0 exit gate. |
| DL-002 | 2026-07-15 | Personal Vault, guest mode, public sharing, and workspace collaboration are separate product and storage contexts. | Approved | Product Owner | Storage-provider isolation must be covered by architecture, domain rules, and regression tests. |
| DL-003 | 2026-07-15 | A personal document enters a workspace only through an explicit, one-time copy. Credentials are ineligible. | Approved | Product Owner | API and UI must both enforce eligibility; no background or login migration. |
| DL-004 | 2026-07-15 | Cloudflare Pages is the canonical collaboration origin; GitHub Pages is personal/guest fallback only. | Approved | Product Owner + Architect | Fallback must fail closed and link to the canonical origin without retry loops. |
| DL-005 | 2026-07-15 | Same-origin Pages Functions plus D1 are the preferred Foundation server boundary. | Working assumption | Architect | Finalize in ADR-001 after environment, migration, and consistency consequences are reviewed. |
| DL-006 | 2026-07-15 | Durable Objects and R2 are deferred because realtime coordination and attachments are outside Foundation. | Approved for Foundation scope | Product Owner + Architect | Revisit only through a new approved phase. |
| DL-007 | 2026-07-15 | Shared updates use server-authoritative revisions and idempotency; client timestamp last-write-wins is prohibited for collaboration. | Approved | Product Owner + Architect + QA | Finalize compare-and-set and conflict semantics in ADR-006. |
| DL-008 | 2026-07-15 | Server-side authorization is required for every workspace resource; UI visibility is not an authorization control. | Approved | Security | Day 2 must produce a complete role/action matrix and cross-workspace abuse cases. |
| DL-009 | 2026-07-15 | Invitation acceptance and cryptographic readiness are separate states. A server that never receives the plaintext workspace key cannot create a new member's key envelope. | Working assumption | Security + Architect | Day 2 domain and threat models must define `pending_key`, authorized envelope provisioning, substitution protection, timeout, and recovery. |
| DL-010 | 2026-07-15 | Gate G1 role policy is approved: Owner retains ownership and highest-risk lifecycle controls; Admin manages Editor/Viewer membership and devices; Editor mutates eligible shared documents; Viewer is read-only; removed, revoked, unauthenticated, Guest, and pending-key principals are deny-closed. | Approved | Product Owner | Day 3 ADRs must preserve these ceilings and finalize key-envelope provisioning. |
| DL-011 | 2026-07-15 | The twelve-ADR Day 3 package is approved as the architecture baseline while preserving Gates G0/G1. | Approved at Gate G2 | Product Owner + Architecture + Security + QA | Day 4 contracts may proceed; Phase 1 remains blocked by the Phase 0 exit gate. |
| DL-012 | 2026-07-15 | Adopt the Day 4 API, D1 schema, cryptographic, operations, risk, and quality contracts as the implementation baseline. The official client excludes Credentials, while the E2EE API cannot semantically inspect malicious authorized ciphertext. | Approved at Gate G3 | Product Owner + Architecture + Security + QA + Operations | Day 5 consolidation may proceed; Phase 1 remains blocked by the Phase 0 exit gate. |
| DL-013 | 2026-07-15 | Use the Day 5 sequenced backlog and evidence plan as the controlled path from specification to implementation. | Approved at Gate G4 / Phase 0 Exit | Product Owner + Architecture + Security + QA + Operations + UX | Phase 0 is closed and controlled Phase 1 runtime-shell work is authorized; later phases and production rollout remain separately gated by executable evidence. |
| DL-014 | 2026-07-15 | Execute Phase 1 as sprint `CF-P1-S01`: migrate Pages configuration to reviewed Wrangler source control, add only a disabled API shell, generated types, deterministic seams, and a disposable local D1 harness. | Approved by Product Owner | Product Owner + Architecture + Security + QA + Operations + UX | `CF-P1-001` authorized; remote D1, OAuth, collaboration business logic/UI, Phase 2, and production activation remain prohibited. |
| DL-015 | 2026-07-15 | Adopt the sanitized Cloudflare Pages baseline, exact drift assertion, reviewed ownership transition, and non-destructive rollback procedure before the first Wrangler-controlled deployment. | Implemented and verified | Operations + Technical Lead + Security + Senior QA | `CF-P1-001` passed without changing a Cloudflare setting; `wrangler.jsonc` remains blocked until `CF-P1-002` pins the toolchain. |
| DL-016 | 2026-07-15 | Pin the Phase 1 Cloudflare toolchain, compatibility date, portable command dispatcher, CI Node major, and GitHub Actions commits before introducing Wrangler configuration. | Implemented and verified | Technical Lead + Operations + Security + Senior QA | `CF-P1-002` passed without adding runtime or a remote resource; quarterly review is owned by Technical Lead and Operations. |

## Blocking decisions for Day 3

| ID | Decision | Accountable owner | Required evidence | Status |
|---|---|---|---|---|
| BD-001 | GitHub OAuth identity, account relinking, username change, and invitation targeting | Product + Security | Auth ADR and negative scenarios | Proposed in ADR-002/009 |
| BD-002 | Session lifetime, renewal, revocation, fixation defense, and CSRF contract | Security | Session ADR and QA contract | Proposed in ADR-002/011 |
| BD-003 | Device key algorithm, private-key protection, and browser support | Security + Architect | Crypto ADR, compatibility analysis, test vectors | Proposed in ADR-004 |
| BD-004 | Workspace envelope schema, AAD bindings, key versioning, and authorized provisioning actors | Security | Key-management ADR and threat traceability | Proposed in ADR-004 |
| BD-005 | Recovery kit and all-devices-lost behavior | Product + Security | User-impact decision and recovery ADR | Proposed in ADR-010 |
| BD-006 | Member/device revocation and key-rotation triggers | Product + Security | Lifecycle rules, residual-risk statement, tests | Proposed in ADR-010 |
| BD-007 | Exact encrypted versus server-visible metadata | Product + Security | Data-minimization decision and search impact | Proposed in ADR-005/008 |
| BD-008 | Invitation, membership, and key-readiness state transitions | Product + Security + QA | Domain model and invalid-transition tests | Proposed in ADR-003/009 |
| BD-009 | D1 consistency/transaction boundary for revision compare-and-set and invitation acceptance | Architect + QA | Storage ADR and integration-test plan | Proposed in ADR-001/006/009 |
| BD-010 | Offline outbox storage, ordering, quarantine, expiry, and account-switch behavior | Product + Architect + QA | Sync ADR and recovery UX | Proposed in ADR-006/007 |

## Change control

- Approved product-scope decisions require Product Owner approval to change.
- Approved security invariants require Security approval to weaken or replace.
- Any changed decision must update affected requirements, threats, tests, and ADRs in the same review.
- A superseded decision remains in this log with a pointer to its replacement.
- No implementation may resolve an open blocking decision implicitly.
