# Collaboration Foundation Phase 6 handoff

Status: **DRAFT — issued by CF-P5-008 assembly; becomes controlling once Phase 5 exits at `P5-G5`**

## Objective

Deliver encrypted collaborative documents on the isolated Preview runtime:
encrypted document envelopes, revisions, conflict handling, an offline outbox,
and sync — built entirely on top of the Phase 5 device/workspace-key foundation.
Phase 6 receives stable key interfaces and immutable vectors and **never**
receives plaintext device private keys, unlock secrets, KEKs, or workspace DEKs.
Production remains disabled until a separate explicit activation gate; full
collaboration document UX and Personal-to-workspace copy remain Phase 7.

## What Phase 5 hands over

- **Canonical crypto primitives** (`CF-P5-002`): RFC 8785 JCS, strict unpadded
  base64url, P-256 public JWK import + SHA-256 fingerprint, HKDF-SHA-256,
  AES-256-GCM helpers, constant-time digest comparison, CSPRNG generation, and
  an independently implemented reference oracle that agrees byte-for-byte with
  the production implementation across the immutable positive/negative vectors.
- **Protected device keys** (`CF-P5-003`): P-256 device pairs stored only as
  PBKDF2-600k / AES-256-GCM encrypted PKCS#8 envelopes in IndexedDB, unlocked as
  non-extractable `deriveBits` keys, with lifecycle clearing on lock, logout,
  account/workspace switch, revocation, and page termination.
- **Device services** (`CF-P5-004`): typed server-side registration, inventory,
  and revocation with server-recomputed canonical fingerprints; the server never
  accepts an encrypted private-key envelope; live session, Origin/CSRF, actor,
  device-ownership, idempotency, and audit are authoritative.
- **Workspace keys** (`CF-P5-005`): client-side 32-byte DEK generation, atomic
  first-provisioner bootstrap, per-target ephemeral ECDH/HKDF/AES-GCM envelopes,
  current-version binding, wrapper-envelope proof, and `pending_key`→active
  readiness transitions.
- **Rotation and recovery** (`CF-P5-006`): Owner-initiated monotonic rotation
  with an immutable eligible-device snapshot, interruption/resume/idempotency,
  removed/revoked future-key exclusion, alternate Owner/Admin provisioning, and
  truthful all-provisioners-lost terminal cryptographic loss (no server escrow,
  reset, or exported recovery artifact).
- **Schema**: schema 12 on isolated Preview (migrations 11 additive device
  journal, 12 additive rotation) with append-only key/rotation and audit
  history; `documents` and `document_revisions` tables exist and are empty.
- **Boundary posture**: isolated Preview exact Origin + session-bound CSRF,
  `no-store` responses, Service Worker bypass; Production fail-closed `503`;
  GitHub Pages static/API-less fallback.

## Phase 6 scope

1. **Encrypted document envelopes** — per-document content keys wrapped by the
   current workspace DEK; document ciphertext and metadata boundaries per
   `ADR-004`/`ADR-005`; only key-ready devices can decrypt.
2. **Revisions** — append-only encrypted revision chain with canonical
   content-addressed integrity; no plaintext document semantics on the server.
3. **Conflicts** — deterministic conflict detection/resolution across concurrent
   authorized editors; conflict envelopes preserve every branch's ciphertext.
4. **Offline outbox** — durable client-side queue for edits made offline, with
   idempotent replay that never double-applies or resurrects tombstoned state.
5. **Sync** — authenticated pull/push against isolated Preview with bounded
   bodies/pages/rates, idempotency keys, and privacy-safe audit.

## Entry constraints (carried forward, non-negotiable)

- Never send plaintext document semantics, device private keys, unlock secrets,
  KEKs, or workspace DEKs to the server; DEK/content-key unwrap stays in
  transient browser memory.
- No crypto downgrade, algorithm negotiation, plaintext fallback, or server
  escrow/reset/recovery of any key.
- Reuse server-derived identity, central deny-default RBAC, scoped repositories,
  atomic mutation recipes, and the privacy-safe audit registry — do not
  reimplement authority.
- No production D1 binding, production secret, test-only/authentication bypass,
  or fallback collaboration behavior.
- New persistence requires a separately reviewed forward-only migration; no
  applied migration is edited and none is silently added. A shared Preview
  restore requires separate destructive-operation approval and a disposable
  rehearsal first.
- Rotation and revocation semantics from Phase 5 are authoritative: a revoked
  device gets no future document or content-key access.

## Exit evidence Phase 6 will owe

- Immutable document/revision/conflict crypto vectors with negative
  tamper/downgrade/nonce tests, agreeing with the independent oracle.
- Cross-user, cross-device, cross-workspace, removed-member, stale-role, and
  revoked-device denial tests on every document/revision/sync path.
- Atomic envelope, revision, conflict, idempotency, and outbox-replay invariants
  under concurrency.
- Browser E2E for create, edit, share, concurrent-edit conflict, offline-edit
  replay, rotation-during-edit, and revocation-during-edit.
- Dependency, CSP, artifact, log/token/privacy-canary, performance, migration,
  rollback, and recovery evidence.
- Product Owner, Senior QA, Security Reviewer, Operations, Privacy Reviewer,
  UX Lead, and Technical Lead sign-off.

## Prerequisite

This handoff becomes controlling only after Phase 5 closes at `P5-G5`: the
isolated Preview D1 reconciled to zero active qualification authority while
retaining required history, the four `CF-P5-008` evidence records promoted to
PASS, and the seven cross-functional sign-offs recorded. See
[`phase-5-exit-report.md`](phase-5-exit-report.md) sections 6–8.
