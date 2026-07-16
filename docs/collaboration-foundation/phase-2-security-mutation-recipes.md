# Phase 2 security mutation recipes

Status: PASS

Story: `CF-P2-005` | Gate: `P2-G2A` APPROVED on 2026-07-16

## Decision

Workspace creation and invitation acceptance occur before a usable workspace membership exists. Reusing the membership-scoped mutation ledger for their first guard would make both transitions impossible or require an authorization bypass. Gate P2-G2A therefore authorizes forward-only migration `0008_a3d0bd3e8ae7_transition_guards.sql`.

The new `transition_guards` table is immutable and stores only request fingerprints, credential digests, identifiers, result metadata, and expiry. Its insert trigger validates active user/device authority and the operation-specific precondition. It neither changes migrations `0001` through `0007` nor grants runtime or remote authority.

## Atomic recipes

The repository exposes seven static prepared-statement contracts:

1. `workspace.create`
2. `invitation.replace`
3. `invitation.accept`
4. `membership.change`
5. `envelope.provision`
6. `document.update`
7. `rotation.commit`

Every recipe uses the reviewed guarded batch topology: one authority/idempotency guard, bounded domain writes, exactly one audit event, and one deterministic result read. No recipe uses runtime SQL interpolation, `SELECT *`, client-selected consistency, or unchecked write results.

## Replay and race behavior

Replay resolution starts from a server-owned `first-primary` authorization session, verifies the original fingerprint and expiry, and rechecks live user, device, and membership authority before returning a result. Constraint races are re-read only after the authoritative batch loses; an unrelated database failure remains the original failure.

Disposable Workers D1 tests prove deterministic convergence or fail-closed behavior for workspace creation, invitation acceptance, Last-Owner protection, envelope provisioning, key rotation, document revision CAS, fingerprint reuse, expiry, and revoked authority. The CF-P2-004 every-position rollback suite remains part of the same release gate.

## Boundary

The production API still returns `503 COLLABORATION_UNAVAILABLE`. `COLLABORATION_ENABLED` remains `false` in every environment, Wrangler contains no remote D1 binding, and no Cloudflare resource or production data was created. Evidence: `CF-EV-P2-INT-004`, `CF-EV-P2-INT-005`, and `CF-EV-P2-SEC-005`.
