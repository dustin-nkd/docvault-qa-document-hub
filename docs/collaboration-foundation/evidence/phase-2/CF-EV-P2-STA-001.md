# CF-EV-P2-STA-001 — Canonical schema inventory and migration-governance evidence

Status: PASS

Date: 2026-07-16

Story: `CF-P2-001`

Owner: Technical Lead

Reviewer: Senior QA

## Claims

- The machine-readable freeze contains exactly one schema control table and 14 approved entity tables.
- Every table has one ordered canonical column inventory, repository owner, initial migration owner, requirement traceability, and invariant traceability.
- The initial expansion sequence is exactly 0001 through 0006 with non-overlapping table ownership.
- Ten stable prohibited schema/repository patterns are named and cannot be silently removed.
- Gate P2-G1 remains `REVIEW_REQUIRED`; this evidence does not approve SQL implementation.

## Execution

Focused commands: `node --test tests/cloudflare-phase-2-schema-policy.test.mjs` and `npm run cf:phase2:schema:check`.

Release command: `npm run check` before commit, followed by the protected GitHub Actions and deployment gates.

Expected and actual focused result: three policy tests pass; the checker reports 15 frozen tables, six governed migration entries, ten prohibited patterns, no executable migrations, and P2-G1 review required.

The first full regression correctly rejected the newly extended `check:cloudflare` command because the CI-order policy still encoded the Phase 1-only sequence. The policy and its negative test were updated to require `cf:phase2:schema:check`; the focused 12-test policy retest and the complete second run passed with 104/104 core-policy tests, 18/18 API/runtime tests, and 10/10 Workers/D1 tests, with zero skipped or failed cases.

## Traceability and side effects

Contracts: `schema-contract.md`, `api-contract.md`, `crypto-contract.md`, ADR-002 through ADR-010, and ADR-012. Requirements: `CF-ID`, `CF-SES`, `CF-WS`, `CF-RBAC`, `CF-INV`, `CF-DEV`, `CF-KEY`, `CF-DOC`, `CF-SYNC`, `CF-AUD`, and `CF-OPS`. Risks: `R03`, `R05`–`R07`, `R13`, `R16`–`R19`, `R21`, and `R22`.

No remote D1 was created, queried, migrated, restored, deleted, or bound. No Cloudflare configuration mutation, production data, fixture, SQL migration, runtime route, collaboration activation, or browser storage change occurred.
