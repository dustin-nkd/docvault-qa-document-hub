# CF-EV-P2-STA-002 — Immutable migration manifest and typed schema evidence

Status: PASS

Date: 2026-07-16

Story: `CF-P2-002`

Owner: Senior Developer

Reviewer: Senior QA

## Claims

- Six contiguous additive migrations match the Gate P2-G1 ownership sequence.
- Every filename short hash, full SHA-256, normalized byte count, previous-entry hash, table owner, reviewer, compatibility window, validation, rollback class, and privacy class is machine checked.
- SQL creates exactly the frozen ordered columns for one control plus 14 entity `STRICT` tables.
- The schema digest is derived from stable frozen schema content rather than mutable approval metadata.
- Typed row/result contracts cover every table without `any` or unsafe double casts.

Focused command: `node --test tests/cloudflare-phase-2-migration-policy.test.mjs && npm run cf:phase2:migrations:check && npm run check:functions`.

Focused result: four policy/type tests pass; manifest/hash-chain/schema/typed-contract checks pass; TypeScript strict compilation passes.

Full release result: `npm run check` passes 108/108 core-policy tests, 18/18 API/runtime tests, and 15/15 Workers/D1 tests with zero skipped or failed cases. The production dry run compiles successfully and retains a 49-file runtime-only artifact without migrations, tests, evidence, or server-only policy files.

Traceability: `CF-P2-002`, `CF-OPS-002/003`, `CF-ID`, `CF-SES`, `CF-WS`, `CF-RBAC`, `CF-INV`, `CF-DEV`, `CF-KEY`, `CF-DOC`, `CF-SYNC`, `CF-AUD`; threats `T01`–`T12`, `T15`–`T17`, `T19`–`T20`; risks `R03`, `R05`–`R07`, `R13`, `R16`–`R19`.

No remote D1 resource, binding, identifier, migration, secret, fixture, product data, or collaboration activation was introduced.
