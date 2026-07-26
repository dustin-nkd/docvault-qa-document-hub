# Collaboration Foundation Phase 7 — exit report

Status: **DRAFT — 13 of 14 stories PASS; `P7-G5` NOT granted**

This report is assembled to the point the evidence supports and no further.
Sections 5 and 6 are held **OPEN** because the facts they need do not exist yet.
That follows the precedent set at the Phase 5 exit: a report that fills its own
gaps is worth less than one that names them.

## 1. What Phase 7 was for

Deliver the interface over the Phase 3–6 services. Add no cryptographic,
persistence, or authorization primitive; every read and write goes through a
service that already exists and was qualified in an earlier phase.

## 2. Story reconciliation

| Story | Title | Gate | Status |
|---|---|---|---|
| CF-P7-001 | Freeze the UI contract, surface inventory, a11y baseline | `cf:phase7:contract:check` | PASS |
| CF-P7-002 | Lazy shell, GitHub Pages banner, four base states | `cf:phase7:shell:check` | PASS |
| CF-P7-003 | Account menu and workspace switcher | `cf:phase7:account:check` | PASS |
| CF-P7-004 | Create workspace journey | `cf:phase7:create:check` | PASS |
| CF-P7-005 | Device and key initialization | `cf:phase7:device:check` | PASS |
| CF-P7-006 | Member list, role badge, explained role-disabled controls | `cf:phase7:members:check` | PASS |
| CF-P7-007 | Invitation creation, copy, revoke | `cf:phase7:invitations:check` | PASS |
| CF-P7-008 | Invitation acceptance | `cf:phase7:accept:check` | PASS |
| CF-P7-009 | Sync state model | `cf:phase7:sync:check` | PASS |
| CF-P7-010 | Conflict resolution dialog | `cf:phase7:conflict:check` | PASS |
| CF-P7-011 | Audit activity | `cf:phase7:audit:check` | PASS |
| CF-P7-012 | Responsive and keyboard/focus qualification | `cf:phase7:qualify:check` | PASS |
| CF-P7-015 | API client layer | `cf:phase7:api:check` | PASS |
| **CF-P7-013** | **Integrate and qualify on Preview** | — | **NOT PASS** |
| **CF-P7-014** | **Exit and Phase 8 handoff** | — | **this document, DRAFT** |

A story is PASS when its gate script exists and passes, never on assertion. All
thirteen gates run inside `check:cloudflare`, which is green with a real exit
code at `60fba01`.

## 3. Gate UX criteria

| | Criterion | Evidence | Standing |
|---|---|---|---|
| U1 | Personal and workspace data never mixed | zero personal storage keys asserted by every surface gate; zero collaboration modules on Personal startup, measured on the deployment | held |
| U2 | The user always knows which workspace they are in | `CF-EV-P7-UI-002`; the resolver refuses to fall back silently | held |
| U3 | Role-disabled controls carry an explanation | `CF-EV-P7-UI-005`, `CF-EV-P7-A11Y-002`; 60 disabled controls, zero without an announced reason | held |
| U4 | A local draft is never lost to a conflict | `CF-EV-P7-UI-009`; dismissal decides nothing, discard needs arming and confirming | held |
| U5 | Keyboard and focus meet the bar | `CF-EV-P7-A11Y-004`; zero rings missing, lowest contrast 5.48:1 against a 3:1 floor | held |
| U6 | Mobile and tablet layouts do not break | `CF-EV-P7-UI-011`; zero overflow, clipped text or sub-24 px targets across 18 measurements | held |

U1 through U6 are held **for the surfaces as composed**. None has been exercised
through a live journey, because no journey can run yet — see section 5.

## 4. What the phase found

Six real defects, each found by the process rather than by inspection:

1. **Focus ring below AA in the light theme** (2.54:1 against a 3:1 floor),
   inherited from CF-P7-002 and CF-P7-003 and latent since they shipped. Fixed
   with theme-aware tokens; a correction was appended to the earlier evidence.
2. **A readiness vocabulary read from the wrong place** — seven values taken from
   neighbouring SQL literals where the frozen type declares five. Caught by this
   phase's own gate, which now parses the server's union type.
3. **`aria-describedby` resolving to the wrong reason** when two member lists
   render on one page: confidently wrong, which is worse than silent.
4. **Every collaboration list overflowing at 320 px** — a grid track defaults to
   `min-width: auto`. Each story had passed its own responsive check because each
   was measured with short names.
5. **Collaboration modules absent from the deployed artifact** — the build walked
   references from `index.html`, and the lazy design means `index.html`
   references none of them. Found only on the real deployment.
6. **Two drift tests that tested nothing**, their mutation regexes silently
   failing to apply against CRLF-normalised sources.

Two further findings were defects in the measuring instruments, not the product,
and are recorded as declared exclusions rather than quietly patched away. One
diagnosis was wrong and has been retracted in `CF-EV-P7-OPS-002`.

## 5. OPEN — Preview qualification

**CF-P7-013 is not PASS.**

Integration is proven as far as a fail-closed deployment allows: on deployment
`4c5d7c8a`, zero collaboration modules load before the opener is pressed and
nineteen after, the shell mounts, and the surface correctly reports that
collaboration is not enabled on that deployment.

No journey is qualified. Both `/api/v1/session` and `/api/v1/workspaces` answer
`503 COLLABORATION_UNAVAILABLE`: collaboration is switched off there.

This cannot be resolved from inside the repository. `COLLABORATION_ENABLED` is
`'false'` in `wrangler.jsonc` for every environment, and **six gates across four
closed phases hard-assert exactly that**, including for Preview. The repository
is built to fail closed, and it does.

Closing this section requires the owner to enable collaboration for the Preview
environment at the deployment level and rebuild, then qualify the journeys.

## 6. OPEN — sign-off

Not recorded. DocVault is single-maintainer, so the sprint's cross-functional
review roles are one person; the Phase 5 precedent is to record **one owner
authorization covering all seven roles, stating explicitly that no independent
security or privacy review occurred**, rather than fabricating seven signatures.

That authorization has not been given and is not assumed here. `P7-G5` is not
granted and Phase 8 is not open.

## 7. Boundaries held

No production D1, no production identity, no production document route, no
collaboration activation, no server-visible plaintext, no automatic merge, no
automatic Personal Vault upload, no personal-provider fallback, no silent draft
discard. No new persistence and no migration. Personal Vault is untouched.
