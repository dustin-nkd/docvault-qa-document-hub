# Collaboration Foundation Phase 7 sprint — Collaboration UI

Status: **PLANNED — awaiting `P7-G0`**

Entry: Phase 6 closed at `P6-G5` with all nine stories PASS and all six sprint
gate scenarios proven over Preview HTTP. The controlling document is
[`phase-7-handoff.md`](phase-7-handoff.md).

## Governing principle

Phase 7 adds **no** cryptographic, persistence, or authorization primitive. It is
the interface over the Phase 3 to Phase 6 services. Every read and write goes
through an existing service; the UI layer may not reimplement identity, envelope,
revision, idempotency, cursor, membership, or outbox logic. Where a surface needs
behaviour a service did not expose, the correct move is to extend that service
under its own review, never to inline the logic in a view.

## The twelve surfaces

Each surface is owned by exactly one story. Nothing ships half-owned.

| # | Surface | Story |
|---|---|---|
| 1 | **Account menu** | CF-P7-003 |
| 2 | **Workspace switcher** | CF-P7-003 |
| 3 | **Create workspace** | CF-P7-004 |
| 4 | **Device and key initialization** | CF-P7-005 |
| 5 | **Member list and role badge** | CF-P7-006 |
| 6 | **Invitation creation, copy, and revoke** | CF-P7-007 |
| 7 | **Invitation acceptance** | CF-P7-008 |
| 8 | **Sync state: Saved, Saving, Offline, Conflict, Access removed** | CF-P7-009 |
| 9 | **Conflict resolution dialog** | CF-P7-010 |
| 10 | **Audit activity** | CF-P7-011 |
| 11 | **Empty, loading, unauthorized, and error states** | CF-P7-002 |
| 12 | **GitHub Pages banner: collaboration is Cloudflare-only** | CF-P7-002 |

## Stories

| Story | Title | Entry | Exit |
|---|---|---|---|
| CF-P7-001 | Freeze the collaboration UI contract, surface inventory, and accessibility baseline | P7-G0 | P7-G1 |
| CF-P7-002 | Lazy collaboration shell, GitHub Pages banner, and the four base states | P7-G1 | P7-G2 |
| CF-P7-003 | Account menu and workspace switcher with persistent workspace identity | P7-G2 | P7-G2A |
| CF-P7-004 | Create workspace journey | P7-G2A | P7-G2B |
| CF-P7-005 | Device and key initialization | P7-G2B | P7-G2C |
| CF-P7-006 | Member list, role badge, and explained role-disabled controls | P7-G2C | P7-G2D |
| CF-P7-007 | Invitation creation, copy, and revoke | P7-G2D | P7-G3 |
| CF-P7-008 | Invitation acceptance | P7-G3 | P7-G3A |
| CF-P7-009 | Sync state model | P7-G3A | P7-G3B |
| CF-P7-010 | Conflict resolution dialog with guaranteed draft preservation | P7-G3B | P7-G3C |
| CF-P7-011 | Audit activity | P7-G3C | P7-G3D |
| CF-P7-012 | Responsive layout and keyboard/focus qualification across every surface | P7-G3D | P7-G3E |
| CF-P7-013 | Integrate and qualify the collaboration UI on Preview | P7-G4 | P7-G4A |
| CF-P7-014 | Assemble Phase 7 exit and Phase 8 handoff | P7-G4A | P7-G5 |

Each story ships an automated policy check wired into `check:cloudflare`, in the
pattern Phases 3 through 6 established. A story is not PASS on assertion; it is
PASS when its gate script exists and passes.

`P7-G4` is a **separate remote authorization**, exactly as `P6-G4` was. No story
before CF-P7-013 may touch a deployed environment.

### Notes on the harder stories

**CF-P7-005 — Device and key initialization.** The largest gap inherited from
Phase 6. The device register, workspace key envelope, and provisioning services
all exist and are proven, but no interface reaches them. Without this surface a
second member cannot join a workspace unaided — closing G2 and G3 in Phase 6
required driving these calls by hand. This story turns that manual sequence into
a journey: register this device, show its fingerprint, request access, and show
the pending-key state until an existing member provisions the envelope.

**CF-P7-006 — Explained role-disabled controls.** A Viewer's write controls stay
**visible and disabled with a stated reason**, rather than hidden. Hiding is the
easier implementation and the wrong one: it makes the product feel broken rather
than governed, and it hides the reason a user cannot act.

**CF-P7-009 — Sync state.** Exactly five states, no ad-hoc sixth: **Saved**,
**Saving**, **Offline**, **Conflict**, **Access removed**. `Access removed` is
distinct from `error` and must be reachable in practice — a membership revoked
while a document is open has to resolve to that state, not to a generic failure.

**CF-P7-012 — Responsive and focus qualification.** Cross-cutting and deliberately
last: it qualifies every surface the previous eleven stories shipped, so a
regression in an early surface cannot slip through on the strength of its own
story having passed.

## Gate UX — the six acceptance criteria

These decide whether Phase 7 closes.

**U1 — Personal vault and workspace data are never mixed.** No personal record is
ever rendered on a workspace surface and no workspace record on a personal
surface. Zero personal writes originate from any collaboration path. Zero
collaboration modules are evaluated on personal startup.

**U2 — The user always knows which workspace they are in.** The active workspace
is identifiable on every collaboration surface without opening a menu, at every
supported width, and it survives reload and back-navigation rather than silently
defaulting to something else.

**U3 — Role-disabled controls carry an explanation.** A control the current role
may not use stays visible, is programmatically disabled rather than merely
styled, and states the reason in text assistive technology announces. It is never
silently hidden and never fails only on submit.

**U4 — A local draft is never lost to a conflict.** The draft survives the dialog
being dismissed, navigation away, and a full reload. It is discarded only by an
explicit confirmed choice, and no automatic merge is ever performed.

**U5 — Keyboard navigation and focus states meet the bar.** Every surface is
completable by keyboard alone in a logical order, with a visible focus indicator
meeting WCAG 2.2 AA non-text contrast, no focus trap, and focus moved and
restored correctly around dialogs.

**U6 — Mobile and tablet layouts do not break.** Every surface renders without
horizontal page scroll, overlapping controls, clipped text, or unreachable
actions at 320 px width, tablet portrait, and tablet landscape — including long
workspace and account names.

## Quality budgets

| Budget | Limit |
|---|---|
| Collaboration modules on Personal startup | 0 |
| Collaboration startup ceiling | 75 KiB gzip |
| Lazy Phase 7 chunk | 60 KiB gzip |
| Decrypt and render 100 documents | p95 ≤ 500 ms |
| Preview authenticated read / write | p95 ≤ 300 ms / 500 ms |
| Accessibility | WCAG 2.2 AA |
| Minimum supported width | 320 px |

Zero tolerance for P0/P1 skips, quarantines, disabled cases, conditional
omissions, accepted flakes, open defects, plaintext canaries, colour-only state
signalling, unexplained disabled controls, and horizontal page scroll.

## Boundaries

Unchanged and non-negotiable: no production D1, no production document routes, no
production identity, no collaboration activation, no server-visible plaintext, no
automatic merge, no automatic Personal Vault upload, no personal-provider
fallback when a collaboration call fails, and no silent draft discard. New
persistence requires a separately reviewed forward-only migration.

GitHub Pages remains a static Personal and Guest fallback and must **say so**:
surface 12 is the banner stating that team collaboration is available only on the
Cloudflare deployment. A user on GitHub Pages should never be left guessing why
collaboration is absent.

## Deferred to Phase 8 — recorded, not forgotten

- **Copy to workspace and the Credential exclusion.** Outside the requested Phase 7
  surface inventory. CF-P6-007 already implements the refusal and ADR-007 records
  the residual risk, so the boundary stays enforced in the service layer while it
  is unexposed. This is a deliberate deferral, not an omission.
- **Rich text editing and a side-by-side conflict diff.** Outside the requested
  inventory; the four labelled resolutions satisfy U4 without a diff view.
