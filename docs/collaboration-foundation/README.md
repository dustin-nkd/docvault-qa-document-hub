# Collaboration Foundation

Status: Phase 3 active; `CF-P3-004` GitHub adapter and atomic callback passed; Gate P3-G2B is pending and collaboration activation remains NO-GO

Sprint: `CF-P3-S01` — `CF-P3-001` through `CF-P3-004` PASS; no remote identity resource; Gate P3-G2B pending

Language: English for all repository artifacts

## Purpose

This directory is the source of truth for the Collaboration Foundation discovery. Phase 0 defines product behavior, architecture, security boundaries, and future quality gates before any collaboration backend is implemented.

## Sprint rules

- Phase 0 changes documentation only.
- Personal Vault behavior remains the compatibility baseline.
- No personal document is uploaded to a workspace without an explicit user action.
- GitHub Pages remains a personal/guest fallback and must fail closed for collaboration.
- Collaboration implementation cannot begin while a P0 decision or Critical risk is unresolved.
- Every P0/P1 requirement and threat must map to planned verification evidence.

## Day 1 artifacts

- [Product specification](product-spec.md)
- [Current and target architecture](architecture.md)
- [Data classification](data-classification.md)
- [Quality strategy](quality-strategy.md)
- [Day 1 cross-functional review](day-1-review.md)
- [Decision log](decision-log.md)
- [Domain and RBAC contract](domain-and-rbac.md)
- [Threat model](threat-model.md)
- [Requirement-risk-test traceability](traceability-matrix.md)
- [Day 2 cross-functional review](day-2-review.md)
- [Day 3 architecture decision set](adr/README.md)
- [Day 3 cross-functional review](day-3-review.md)

Gate G0 was approved by the Product Owner on 2026-07-15.

Gate G1 was approved by the Product Owner on 2026-07-15.

Gate G2 was approved by the Product Owner on 2026-07-15.

Gate G3 was approved by the Product Owner on 2026-07-15.

Gate G4 / Phase 0 Exit was approved by the Product Owner on 2026-07-15.

## Day 4 artifacts approved at Gate G3

- [API contract](api-contract.md)
- [D1 schema contract](schema-contract.md)
- [Cryptographic contract](crypto-contract.md)
- [Operational runbook](operational-runbook.md)
- [Risk register](risk-register.md)
- [Day 4 quality strategy](quality-strategy.md)
- [Updated requirement-risk-test traceability](traceability-matrix.md)
- [Day 4 cross-functional review](day-4-review.md)

## Day 5 artifacts approved at Gate G4

- [Sequenced implementation plan](implementation-plan.md)
- [Implementation and release evidence plan](evidence-plan.md)
- [Day 5 Phase 0 exit review](day-5-review.md)

## Phase 1 sprint planning

- [Cloudflare foundation sprint](phase-1-sprint.md) — `CF-P1-001` through `CF-P1-009` complete
- [Cloudflare Pages configuration control](phase-1-pages-configuration.md) — `CF-P1-001` baseline, drift assertion, preflight, and rollback
- [Cloudflare toolchain control](phase-1-cloudflare-toolchain.md) — `CF-P1-002` exact dependencies, portable commands, pinned CI, and review lifecycle
- [Reviewed Pages Wrangler configuration](phase-1-wrangler-configuration.md) — `CF-P1-003` environment isolation, generated types, and source-of-truth transition
- [Phase 1 exit report](phase-1-exit-report.md) — Gate P1 evidence, cross-functional review, and constrained Phase 2 recommendation
- [Phase 2 D1 schema and persistence sprint](phase-2-sprint.md) — proposed story sequence, migration architecture, non-production resource gates, recovery, and Gate P2 evidence
- [Phase 2 schema inventory freeze](phase-2-schema-freeze.md) — `CF-P2-001` canonical tables, columns, relationships, invariants, ownership, and Gate P2-G1 disposition
- [Phase 2 migration governance](phase-2-migration-governance.md) — immutable naming/hash/manifest, compatibility, correction, validation, and unknown-history policy
- [Phase 2 immutable Foundation migrations](phase-2-immutable-migrations.md) — `CF-P2-002` SQL, manifest/hash chain, strict schema, typed rows, local D1 evidence, and remote denial
- [Phase 2 tenant constraints and index plans](phase-2-tenant-constraints-index-plans.md) — `CF-P2-003` tenant guards, keyset contracts, representative query plans, and approved P2-G2 evidence
- [Phase 2 typed persistence foundation](phase-2-sprint.md) — `CF-P2-004` checked persistence, guarded atomic batches, server-owned consistency, rollback tests, and evidence
- [Phase 2 security mutation recipes](phase-2-security-mutation-recipes.md) — `CF-P2-005` transition guards, authoritative idempotency, seven atomic recipes, race matrices, and Gate P2-G2A evidence
- [Phase 2 quality matrix](phase-2-quality-matrix.md) — `CF-P2-006` migration compatibility, bounded retention, privacy scans, representative scale, and Gate P2-G2B evidence
- `CF-P2-007` preview D1 state is machine-checked in `config/cloudflare/phase-2-preview-d1.json`; production remains unbound and collaboration remains disabled
- `CF-P2-008` recovery rehearsal is machine-checked in `config/cloudflare/phase-2-recovery-rehearsal.json`; the disposable D1 was restored, verified, and deleted without touching shared preview or production
- [Phase 2 exit report](phase-2-exit-report.md) — nine stories, 25 evidence records, remote reconciliation, and constrained Phase 3 identity/session recommendation
- [Phase 3 identity and sessions sprint](phase-3-sprint.md) — ten gated stories covering contract freeze, OAuth, sessions, CSRF, abuse controls, isolated preview verification, and Phase 4 handoff; `CF-P3-001` through `CF-P3-004` passed and Gate P3-G2B is pending
- [Phase 3 identity/session implementation contract](phase-3-identity-session-contract.md) — frozen OAuth, session, CSRF, preview isolation, rate-control, error, rollback, and evidence profile; atomic callback authority passed and Gate P3-G2B is pending
- `config/cloudflare/phase-3-identity-primitives.json` — machine-enforced `CF-P3-002` Web Crypto, vector, negative-security, evidence, and disabled-boundary record
- `config/cloudflare/phase-3-oauth-transactions.json` — machine-enforced `CF-P3-003` single-use, expiry, replay, cleanup, and disabled-boundary record
- `config/cloudflare/phase-3-oauth-callback.json` — machine-enforced `CF-P3-004` provider, numeric identity, atomic rollback, replay, and disabled-boundary record

## Review ownership

| Concern | Accountable reviewer |
|---|---|
| Product scope and user outcomes | BA / Product Owner |
| Architecture and implementation feasibility | Senior Developer / Architect |
| Threats, encryption, authentication, and authorization | Security owner |
| Testability, regression protection, and release gates | Senior QA |
