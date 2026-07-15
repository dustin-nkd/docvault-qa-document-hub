# Collaboration Foundation

Status: Day 2 domain behavior and threat modeling in progress

Sprint: Phase 0 — Specification and Threat Model

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

Gate G0 was approved by the Product Owner on 2026-07-15.

## Planned Phase 0 artifacts

- `api-contract.md`
- `risk-register.md`
- `adr/001-runtime-and-storage.md` through `adr/012-migrations-and-rollback.md`

## Review ownership

| Concern | Accountable reviewer |
|---|---|
| Product scope and user outcomes | BA / Product Owner |
| Architecture and implementation feasibility | Senior Developer / Architect |
| Threats, encryption, authentication, and authorization | Security owner |
| Testability, regression protection, and release gates | Senior QA |
