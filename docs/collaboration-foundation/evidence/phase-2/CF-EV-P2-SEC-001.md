# CF-EV-P2-SEC-001 — Schema threat, privacy, and premature-state denial evidence

Status: PASS

Date: 2026-07-16

Story: `CF-P2-001`

Owner: Security Reviewer

Reviewer: Senior QA

## Claims

- Critical/High identity, session, tenant, RBAC, invitation, device/key, document/revision, idempotency, audit, retention, and migration invariants map to a constraint/immutable structure, guarded recipe, required negative/fault test, and closing evidence ID.
- Protected plaintext, secrets, private key material, raw capabilities, free-form audit content, client authority, and server-owned results are explicitly prohibited.
- Workspace repositories require workspace-scoped predicates; opaque IDs alone never authorize access.
- Unknown migration history, checksum drift, missing sequence, zero-row security writes, runtime/build migrations, and same-release destructive contraction fail closed.
- Policy tests reject premature SQL, remote D1 binding, collaboration activation, and an unreviewed Gate P2-G1 decision.

## Negative evidence

The focused suite mutates the freeze by removing a table, adding `sessions.raw_token`, assigning one table to two migrations, deleting a prohibition, deleting security evidence, simulating executable migrations, adding a remote `COLLAB_DB`, enabling collaboration, and marking P2-G1 `PASS`. Every mutation must throw.

## Privacy and side effects

The inventory names storage fields but contains no real user/workspace/provider identifier, token, secret, key, ciphertext/envelope body, protected plaintext, SQL parameter, or remote resource identifier. Evidence contains only contract identifiers and aggregate policy results.

No remote D1 was created, queried, migrated, restored, deleted, or bound. Wrangler remains without remote storage bindings; production collaboration remains disabled; GitHub Pages remains static and API-absent.

Traceability: threats `T01`–`T12`, `T15`–`T16`, `T19`–`T20`, and `T23`; especially cross-workspace IDOR, invitation races, key substitution, stale revision/idempotency races, audit loss, migration drift, and environment crossover.
