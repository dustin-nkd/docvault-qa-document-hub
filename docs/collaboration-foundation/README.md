# Collaboration Foundation

Status: Phase 1 complete; Gate P1 passed; controlled Phase 2 implementation recommended while collaboration activation remains NO-GO

Sprint: Phase 1 disabled foundation complete — Phase 2 implementation handoff ready

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

## Review ownership

| Concern | Accountable reviewer |
|---|---|
| Product scope and user outcomes | BA / Product Owner |
| Architecture and implementation feasibility | Senior Developer / Architect |
| Threats, encryption, authentication, and authorization | Security owner |
| Testability, regression protection, and release gates | Senior QA |
