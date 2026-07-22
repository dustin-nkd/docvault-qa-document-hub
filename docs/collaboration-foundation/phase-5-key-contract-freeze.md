# CF-P5-001 — E2EE key-foundation contract freeze

Status: PASS

Entry: P5-G0 APPROVED

Exit recommendation: P5-G1 APPROVE CF-P5-002 ONLY

## Frozen decisions

Phase 5 is limited to device and workspace-key foundations. Document ciphertext, revisions, conflicts, offline outbox, and sync remain Phase 6.

Workspace creation uses a stateless bootstrap intent. The server deterministically returns the future workspace binding from the live user, active device, and idempotency key without writing D1. The browser generates the DEK and creator envelope. The final request atomically writes the mutation result, workspace, active Owner, current key version 1, creator envelope, and audit event. It is impossible to commit a workspace without its first usable envelope, and the server never sees the plaintext DEK.

Provisioning authority is not inferred from role alone. A live Owner/Admin wrapper must use an active owned device that already holds an unrevoked envelope for the workspace's current version. Target membership/device/fingerprint and workspace version are reloaded and compare-and-set in the same batch as envelope, derived readiness, audit, and idempotent result. The client cannot write readiness.

Schema 10 is insufficient for safe rotation. A future sequence-12 additive migration will add rotation jobs and immutable target snapshots. The migration is not created or authorized here; `P5-G2C-M` is required before local migration implementation and `P5-G4` remains required before any remote Preview write. Rotation eligibility never mutates silently: changed authority aborts and restarts the job.

## Vector freeze

The stable vector families and case IDs are frozen in `config/cloudflare/phase-5-contract-freeze.json`. They cover canonical encoding, P-256 JWK/fingerprint validation, local PBKDF2/PKCS#8 protection, workspace wrapping, lifecycle denial, and sensitive canaries. All material is synthetic-only. `CF-P5-002` must freeze expected bytes/digests with an independent oracle before product primitive merge; 100% positive and negative agreement is required.

The cryptographic algorithms, exact AAD fields, decoded sizes, fail-closed errors, and performance ceilings remain those in `crypto-contract.md`. Counts are never reduced to pass a slow profile.

## Gate boundary

No runtime route, migration file, remote D1 write, Preview deployment, Production binding, Production identity, or collaboration activation was produced. Approval of P5-G1 authorizes only CF-P5-002 canonical primitives and immutable reference vectors.
