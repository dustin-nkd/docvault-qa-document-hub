# Collaboration Foundation Phase 7 handoff

Status: **CONTROLLING — issued by CF-P6-009; Phase 6 closed at `P6-G5`**

## Objective

Deliver the collaboration document experience: the interface through which a
person actually creates, opens, edits, shares, and resolves conflicts on a
workspace document, plus the Personal-to-workspace copy journey. Phase 7 consumes
the Phase 6 slice and adds no new cryptographic or persistence primitive.

## What Phase 6 hands over

- **Provider boundary** (`CF-P6-002`): `PersonalVaultProvider` and
  `CollaborationProvider` with explicit selection, no fallback, namespaced state
  keyed by environment, subject, workspace, device, and document, and clearing on
  every context change. Personal Vault is at a zero-line diff and pinned by a
  ten-test characterization baseline in the authoritative gate.
- **Document envelope** (`CF-P6-003`): `A256GCM-doc-v1` with canonical AAD
  binding workspace, document, revision intent, key version, and envelope
  version; immutable vectors agreeing with an independent oracle.
- **Atomic mutations** (`CF-P6-004`): create, update, and tombstone as one
  guarded D1 batch each, append-only revisions, a 30-day idempotency ledger, and
  the frozen error taxonomy. Viewer exclusion lives in the SQL guard.
- **Authorized reads** (`CF-P6-005`): four read operations, workspace-scoped in
  SQL, one shared non-disclosing denial, HMAC-bound opaque cursors, `no-store`
  responses with a Service Worker bypass.
- **Offline outbox** (`CF-P6-006`): encrypted IndexedDB queue, per-document FIFO
  with predecessors, bounded jittered retry reusing the original mutation id,
  quarantine-not-delete on expiry and on every authority change.
- **Conflict and copy** (`CF-P6-007`): four explicit resolutions with no
  automatic merge and no silent draft loss, and a manual one-time unlinked copy
  that rejects Credential documents before destination encryption.
- **Live Preview surface** (`CF-P6-008`): eight registered routes, gated and
  probed, with a real authenticated journey producing a full revision chain.

## Phase 7 scope

1. **Document experience** — list, open, edit, and save a workspace document,
   with the Personal and workspace contexts always visually distinct.
2. **Conflict interface** — surface the four `CF-P6-007` resolutions as real UI,
   preserving the label-and-shape accessibility contract.
3. **Copy to workspace journey** — destination selection, data-classification
   confirmation, and the Credential exclusion presented as non-selectable.
4. **Outbox visibility** — pending, retrying, quarantined, and expired states
   with the recovery actions ADR-006 requires.
5. **Membership and role UX** — enough to make Editor and Viewer differences
   legible to a user.

## Entry constraints (non-negotiable)

- Never send plaintext document semantics, device private keys, unlock secrets,
  KEKs, or workspace DEKs to the server.
- No automatic Personal Vault upload, no mirroring, and no personal-provider
  fallback when a collaboration call fails.
- No automatic merge and no silent draft discard.
- Reuse the Phase 6 services; do not reimplement envelope, revision, idempotency,
  cursor, or outbox logic in the UI layer.
- No production D1 binding, production secret, test-only bypass, or fallback
  collaboration behaviour. GitHub Pages stays a static Personal/Guest fallback.
- New persistence requires a separately reviewed forward-only migration.

## Prerequisite — satisfied

Phase 6 has closed. `CF-P6-008` is PASS: sprint gate scenarios **G2** and **G3**
were exercised over Preview HTTP with a second designated GitHub identity, and
`CF-EV-P6-QA-004` is PASS. See
[`phase-6-exit-report.md`](phase-6-exit-report.md) section 5 for how they were
proven.

Two conditions carry forward as facts rather than blockers. The qualification
used two real GitHub accounts belonging to the project owner rather than
synthetic identities, so Phase 7 must not describe that evidence as synthetic.
And Preview cleanup is deliberately partial: revisions and audit events are
append-only by trigger, the Preview surface exposes no workspace delete route,
and three browser sessions could not be revoked without their tokens. Phase 7
inherits that residue and must not silently reset it.

This handoff is controlling.
