# Collaboration Foundation Phase 5 handoff

Status: ACTIVE — CF-P5-001 through CF-P5-003 PASS; P5-G2A PENDING

## Objective

Deliver the device and workspace-key foundation for end-to-end encryption on the isolated Preview runtime. Encrypted documents, revisions, conflicts, and sync remain Phase 6 scope. Production remains disabled until a later explicit activation gate.

## Ordered implementation stories

1. `CF-P5-001` freezes the key-foundation scope, byte contracts, route/state/error matrix, browser profiles, first-provisioner transition, rotation persistence decision, and evidence plan.
2. `CF-P5-002` implements strict canonical encodings, public-key validation/fingerprints, approved cryptographic primitives, and independently reviewed immutable vectors.
3. `CF-P5-003` implements browser device-key creation, encrypted local PKCS#8 storage, non-extractable unlock, lifecycle clearing, and capability failure.
4. `CF-P5-004` implements server-side device registration, inventory, revocation, idempotency, audit, and live authority without accepting a private-key envelope.
5. `CF-P5-005` implements workspace key bootstrap, per-device envelopes, authorized provisioning, canonical target binding, and key-readiness transitions.
6. `CF-P5-006` implements monotonic rotation, interruption/retry, historical-key rules, alternate provisioning, and truthful terminal no-escrow loss.
7. `CF-P5-007` integrates only the reviewed device/key operations on isolated Preview and runs the browser, security, privacy, performance, recovery, and boundary matrix.
8. `CF-P5-008` assembles Phase 5 exit evidence and the Phase 6 encrypted-document/revision/sync handoff.

## Entry constraints

- Preserve schema 10 compatibility until a separately approved forward-only migration is required.
- Reuse server-derived identity, central RBAC, scoped repositories, atomic mutation recipes, and privacy-safe audit registry.
- Never send plaintext document semantics, device private keys, unlock secrets, KEKs, or workspace DEKs to the server.
- Do not add test-only routes, production secrets, production D1 bindings, or fallback collaboration behavior.
- A rollback must remain compatible with the expanded schema; a shared Preview restore requires a separate destructive-operation approval and disposable rehearsal first.
- Encrypted document envelopes, revisions, conflicts, offline outbox, and sync remain Phase 6 scope and receive no route or persistence implementation in Phase 5.

## Exit evidence required

- Immutable browser/server crypto vectors and negative tamper/downgrade/nonce tests.
- Cross-user, cross-device, cross-workspace, removed-member, stale-role, and revoked-device denial tests.
- Atomic envelope, revision, audit, idempotency, and conflict invariants under concurrency.
- Browser E2E for enrollment, sharing, editing, conflict, rotation, removal, and terminal key-loss messaging.
- Dependency, CSP, artifact, log/token/privacy-canary, performance, migration, rollback, and recovery evidence.
- Product Owner, Senior QA, Security Reviewer, Operations, Privacy Reviewer, UX Lead, and Technical Lead sign-off.
