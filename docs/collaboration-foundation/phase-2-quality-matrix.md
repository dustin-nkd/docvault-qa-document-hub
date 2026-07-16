# Phase 2 migration, retention, privacy, and scale matrix

Status: PASS

Story: `CF-P2-006` | Gate: `P2-G2B` APPROVED on 2026-07-16

## Forward-only correction

Migration `0009_16957b5a3089_retention_purge_control.sql` resolves the conflict between the 365-day audit-retention requirement and the unconditional delete guard introduced by migration `0006`. Migrations `0001` through `0008` remain unchanged.

Audit and transition-guard deletion remains denied by default. It becomes possible only inside a running, immutable operational purge record with a valid server-time cutoff and a maximum of 100 rows. Audit rows under an active unexpired workspace hold remain protected. Linked audit events are deleted from leaf to parent across bounded retries so referential history cannot be broken.

## Retention behavior

- Terminal OAuth transactions, sessions, and invitations use a 30-day inclusive terminal-time boundary.
- Mutation results and transition guards use their authoritative expiry.
- Audit events use an exclusive 365-day server-time boundary.
- Active records, the exact audit boundary, held events, document revisions, and tombstones are retained.
- Repeated runs are idempotent; an interrupted batch rolls back deletions and operational authorization together.

## Compatibility and scale

The disposable Workers D1 matrix covers empty, populated, repeated, previous-schema, malformed, interrupted, and restored synthetic state. Runtime schema 8 remains compatible with expanded schema 9, while runtime schema 9 fails closed on schema 8. The public API remains disabled and persistence-unreachable.

The representative workload contains 10,000 documents and 50 revisions for a hot document. All 13 prepared query contracts use their approved indexes without full scans or temporary sorting and remain below the 2,000 ms local release budget.

## Privacy and environment boundary

Schema, visible rows, fixtures, errors, logs, exports, and deployment artifacts are covered by protected-canary gates. No remote D1 was created, bound, queried, migrated, or restored. Collaboration remains disabled in local, preview, and production configuration. Evidence: `CF-EV-P2-INT-006`, `CF-EV-P2-PERF-002`, and `CF-EV-P2-SEC-006`.
