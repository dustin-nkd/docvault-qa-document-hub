# Collaboration Foundation Phase 5 handoff

Status: READY

## Objective

Deliver device-bound end-to-end encryption and encrypted document collaboration on the isolated Preview runtime. Production remains disabled until a later explicit activation gate.

## Ordered implementation stories

1. `CF-P5-001` freezes the device, key-envelope, encrypted-document, revision, sync, recovery, performance, and threat contracts.
2. `CF-P5-002` implements device enrollment and protected local private-key storage with approved browser cryptography.
3. `CF-P5-003` implements workspace key versions, provisioner authorization, device envelopes, rotation, and key-readiness state.
4. `CF-P5-004` implements encrypted documents and immutable encrypted revisions without server-visible semantic content.
5. `CF-P5-005` implements idempotent sync, optimistic concurrency, conflict retention, offline reauthorization, and bounded queues.
6. `CF-P5-006` proves cross-device vectors, key loss/rotation/removal recovery, privacy canaries, and performance budgets.
7. `CF-P5-007` integrates only the reviewed Preview document/key routes and collaboration UX.
8. `CF-P5-008` assembles Phase 5 exit evidence and the next activation recommendation.

## Entry constraints

- Preserve schema 10 compatibility until a separately approved forward-only migration is required.
- Reuse server-derived identity, central RBAC, scoped repositories, atomic mutation recipes, and privacy-safe audit registry.
- Never send plaintext document semantics, device private keys, unlock secrets, KEKs, or workspace DEKs to the server.
- Do not add test-only routes, production secrets, production D1 bindings, or fallback collaboration behavior.
- A rollback must remain compatible with the expanded schema; a shared Preview restore requires a separate destructive-operation approval and disposable rehearsal first.

## Exit evidence required

- Immutable browser/server crypto vectors and negative tamper/downgrade/nonce tests.
- Cross-user, cross-device, cross-workspace, removed-member, stale-role, and revoked-device denial tests.
- Atomic envelope, revision, audit, idempotency, and conflict invariants under concurrency.
- Browser E2E for enrollment, sharing, editing, conflict, rotation, removal, and terminal key-loss messaging.
- Dependency, CSP, artifact, log/token/privacy-canary, performance, migration, rollback, and recovery evidence.
- Product Owner, Senior QA, Security Reviewer, Operations, Privacy Reviewer, UX Lead, and Technical Lead sign-off.
