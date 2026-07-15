# Collaboration Foundation Architecture Decision Records

Status: Day 3 review set

Date: 2026-07-15

Phase 1 implementation remains prohibited until Gate G2 and the complete Phase 0 exit gate pass.

## Decision set

| ADR | Decision | Owner | Status |
|---|---|---|---|
| [ADR-001](001-runtime-and-storage.md) | Runtime and storage boundary | Architect | Proposed for Gate G2 |
| [ADR-002](002-authentication-and-sessions.md) | Authentication and sessions | Security | Proposed for Gate G2 |
| [ADR-003](003-workspace-rbac.md) | Workspace RBAC | Product + Security | Proposed for Gate G2 |
| [ADR-004](004-device-and-workspace-keys.md) | Device and workspace keys | Security + Architect | Proposed for Gate G2 |
| [ADR-005](005-metadata-encryption-boundary.md) | Metadata encryption boundary | Product + Security | Proposed for Gate G2 |
| [ADR-006](006-revisions-conflicts-and-idempotency.md) | Revisions, conflicts, and idempotency | Architect + QA | Proposed for Gate G2 |
| [ADR-007](007-provider-isolation.md) | Personal and collaboration provider isolation | Architect + Product | Proposed for Gate G2 |
| [ADR-008](008-audit-and-retention.md) | Audit and retention | Product + Security + QA | Proposed for Gate G2 |
| [ADR-009](009-invitations-and-membership.md) | Invitations and membership | Product + Security | Proposed for Gate G2 |
| [ADR-010](010-revocation-rotation-and-recovery.md) | Revocation, rotation, and recovery | Product + Security | Proposed for Gate G2 |
| [ADR-011](011-browser-and-api-security.md) | Browser and API security | Security + Architect | Proposed for Gate G2 |
| [ADR-012](012-migrations-and-rollback.md) | Migrations and rollback | Architect + QA | Proposed for Gate G2 |

## Status rules

- `Proposed for Gate G2`: complete enough for cross-functional approval, but not an implementation authorization.
- `Approved`: accepted at Gate G2 and safe to use as a Phase 1 design baseline.
- `Superseded`: retained for history with a link to the replacement.
- `Rejected`: reviewed but not accepted.

## Required ADR contents

Every ADR records context, the exact decision and contract, rejected alternatives, consequences and residual risk, security/privacy constraints, operational requirements, test implications, traceability, and Gate G2 acceptance criteria. Implementation must not silently change an approved decision.

## Cross-cutting invariants

1. Cloudflare Pages is the canonical collaboration origin; GitHub Pages is personal/guest fallback only.
2. `/api/v1` is the only collaboration server boundary and authorization is deny-by-default.
3. D1 stores approved metadata and ciphertext, never document plaintext, raw workspace keys, device private keys, raw sessions, or raw invitation tokens.
4. Personal Vault, public sharing, Guest mode, and collaboration use separate providers and trust boundaries.
5. Preview and production use separate databases, OAuth credentials, secrets, session namespaces, and accepted origins.
6. Private API responses are network-only and `Cache-Control: no-store`.
7. Server revision numbers, authorization state, identity, and time are authoritative for collaboration.
8. Every Critical or Restricted asset has a negative test and an inspection-based absence test where applicable.

## Gate G2

Gate G2 approves architecture decisions, not runtime implementation. It passes only when Product, Architecture, Security, and Senior QA accept all twelve ADRs, every Day 3 blocking decision has a disposition, and no ADR contradicts the Gate G0/G1 product and role boundaries.
