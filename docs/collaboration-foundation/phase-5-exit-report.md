# Collaboration Foundation Phase 5 exit report

Status: **DRAFT — assembly complete; PENDING final remote reconciliation (owned by Codex) and cross-functional sign-off**

Story: `CF-P5-008`
Authorization: `P5-G5` (not yet granted)

> This document was assembled to scaffold the Phase 5 exit. Every claim below
> that could be verified from the repository and read-only remote inspection is
> recorded as fact. The two items that remain open — final isolated Preview D1
> reconciliation and the seven cross-functional sign-offs — are called out
> explicitly in sections 6 and 7 and are **not** marked complete. Do not treat
> this report as a passed exit until those sections close.

## 1. Decision (proposed, pending sign-off)

- Phase 5 device/workspace-key foundation on isolated Preview: **GO (proposed)**
- Phase 6 encrypted documents, revisions, conflicts, and sync: `GO` to plan only
- Collaboration activation: `NO-GO`
- Production identity: `NO-GO`
- Production business/key routes: `NO-GO`

Phase 5 delivered a device-bound, no-escrow workspace-key foundation for
end-to-end encryption on the isolated Preview runtime: canonical crypto
primitives with an independent oracle, protected browser device keys
(PBKDF2-600k / AES-256-GCM encrypted PKCS#8, non-extractable unlock),
server-side device registration and revocation that never accepts a private-key
envelope, client-side workspace DEK generation with per-device ECDH/HKDF/AES-GCM
envelopes, and Owner-initiated monotonic rotation with truthful
all-provisioners-lost terminal loss. Cloudflare, D1, operators, logs, builds,
and fallback origins never receive plaintext device private keys, unlock
secrets, KEKs, or workspace DEKs.

## 2. Story completion

| Story | Scope | Exit gate | State | Evidence |
|---|---|---|---|---|
| `CF-P5-001` | Contract/vector/schema freeze | P5-G1 | PASS | STA-001, SEC-001 |
| `CF-P5-002` | Canonical crypto + independent oracle | P5-G2 | PASS | UT-001, VEC-001, SEC-002 |
| `CF-P5-003` | Protected browser device-key lifecycle | P5-G2A | PASS | UT-002, E2E-001, SEC-003, PERF-001 |
| `CF-P5-004` | Device registration/inventory/revocation | P5-G2B | PASS | UT-003, INT-001, SEC-004, QA-001 |
| `CF-P5-005` | Workspace key bootstrap/envelopes/readiness | P5-G2C | PASS | UT-004, INT-002, SEC-005, QA-002 |
| `CF-P5-006` | Monotonic rotation + no-escrow recovery | P5-G3 | PASS | UT-005, INT-003, E2E-002, SEC-006, OPS-001 |
| `CF-P5-007` | Isolated Preview integration/qualification | P5-G4A | PASS | E2E-003, PERF-002, SEC-007, OPS-002, QA-003 |
| `CF-P5-008` | Exit assembly + Phase 6 handoff | P5-G5 | **IN PROGRESS** | QA-004, SEC-008, OPS-003, STA-002 — **pending, owned by Codex** |

Stories 001–007 are confirmed PASS by their committed evidence and by the local
policy gates (`scripts/check-cloudflare-phase-5-*.mjs`), which report
"CF-P5-001 through CF-P5-007 PASS; P5-G4A exit review is next."

## 3. Local verification (reproducible from the repository)

- `node scripts/check-cloudflare-phase-5-sprint.mjs` → sprint plan passed;
  CF-P5-001 through CF-P5-007 PASS; encrypted documents/revisions/sync deferred
  to Phase 6; Production identity, D1, key routes, and collaboration activation
  remain NO-GO.
- `node scripts/check-cloudflare-phase-5-preview-key.mjs` → CF-P5-007 P5-G4
  remote qualification passed; Preview schema 12, read p95 238.7 ms; Production
  disabled with zero D1 bindings.
- The full `npm run check` / `check:cloudflare` chain wires every Phase 3/4/5
  policy check plus the Node, Workers/D1, Functions typecheck, dependency audit,
  browser regression, artifact, rollback, and deployment-boundary gates. Rerun
  it as the authoritative local exit gate before granting `P5-G5`.

## 4. Evidence inventory

31 evidence records are committed under
`docs/collaboration-foundation/evidence/phase-5/` covering STA, UT, VEC, INT,
E2E, SEC, PERF, OPS, and QA layers (see the mapping in section 2). The four
`CF-P5-008` records — `CF-EV-P5-QA-004`, `CF-EV-P5-SEC-008`,
`CF-EV-P5-OPS-003`, and `CF-EV-P5-STA-002` — are written as pending records.
They preserve the verified baseline and identify the exact remote reconciliation
and human sign-off conditions that still block PASS.

## 5. Cryptographic and boundary posture

- No plaintext device private key, PKCS#8, unlock secret, KEK, or workspace DEK
  is server-visible; DEK unwrap occurs only in transient browser memory
  (SEC-003, SEC-005, SEC-007).
- D1 stores only canonical public device keys/fingerprints and versioned
  per-device workspace-key envelopes; key and audit history is append-only.
- Isolated Preview enforces exact Origin and session-bound CSRF, `no-store`
  responses, and Service Worker bypass; unauthenticated key reads return `401`
  and hostile-Origin mutations return `403 CSRF_REJECTED` (SEC-007).
- Production stays fail-closed at `503 COLLABORATION_UNAVAILABLE` with zero D1
  bindings; GitHub Pages exposes no API route.
- Dependency audit resolves to zero vulnerabilities after the reviewed `sharp`
  0.35.3 override (SEC-007).

## 6. OPEN — final remote reconciliation (owned by Codex)

**This section blocks `P5-G5`.** A read-only inspection of the isolated Preview
D1 (`docvault-collab-preview`, `0454359c-d663-409e-8962-951f173efb79`) during
exit assembly found leftover synthetic rows from a recent qualification journey:

| table/state | observed | exit expectation |
|---|---:|---|
| active users | 1 | 0; retain the deactivated identity row |
| active sessions | 0 | 0; retain the revoked session journal row |
| pending OAuth transactions | 0 | 0; retain the consumed transaction row under retention policy |
| active workspaces | 1 | 0; retain the deleted workspace tombstone |
| active memberships | 1 | 0; retain the removed membership authorization episode |
| active devices | 1 | 0; retain the revoked device and immutable device journals |
| unrevoked workspace-key envelopes | 2 | 0; retain revoked encrypted envelopes |
| workspace-key versions / rotations | 2 / 1 | append-only history — retained |
| audit events / device audit events | 4 / 1 | append-only history — retained |
| documents / document_revisions | 0 / 0 | 0 (Phase 6 scope) |
| foreign-key violations | 0 | 0 |

Physical deletion of the six parent rows is neither a valid nor an achievable
exit condition while append-only key, rotation, mutation, and audit history is
retained: those history rows intentionally use restrictive foreign keys and
no-delete triggers. The correct cleanup is a controlled state transition that
revokes envelopes and the device, removes the membership, tombstones the
workspace, and deactivates the user while retaining every required historical
row. The zero-authority state and zero foreign-key violations must then be
re-verified before this exit can claim reconciliation.

This reconciliation changes remote Preview security state and requires explicit
destructive-operation authorization under the Phase 5 sprint. No remote mutation
was performed during exit assembly. `CF-EV-P5-OPS-003` records the verified
before-state, the reviewed transition plan, and the pending authorization.

## 7. OPEN — cross-functional sign-off

`CF-P5-008` acceptance requires Product Owner, Senior QA, Security Reviewer,
Operations, Privacy Reviewer, UX Lead, and Technical Lead sign-off, plus zero
P0/P1 exception or open defect and zero unowned/expired Critical/High risk. None
of these sign-offs are recorded yet. They are human decisions and are not
self-issued by this assembly.

| Role | Sign-off | Date |
|---|---|---|
| Product Owner | ☐ | |
| Senior QA | ☐ | |
| Security Reviewer | ☐ | |
| Operations | ☐ | |
| Privacy Reviewer | ☐ | |
| UX Lead | ☐ | |
| Technical Lead | ☐ | |

## 8. Remaining work to close Phase 5

1. After explicit destructive-operation authorization, Codex retires the
   isolated Preview qualification authority in place and re-verifies section 6.
2. Promote the four pending `CF-P5-008` evidence records to PASS after their
   recorded remote and review conditions are satisfied.
3. The authoritative `npm run check` gate passed on 2026-07-22 in 59.8 seconds;
   rerun it after the authorized remote reconciliation and final evidence edit.
4. Collect the seven sign-offs (section 7) and set this report to PASS under
   `P5-G5`.
5. Publish the Phase 6 handoff ([`phase-6-handoff.md`](phase-6-handoff.md)) as
   the controlling entry contract for encrypted documents, revisions, conflicts,
   and sync.
