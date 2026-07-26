# CF-EV-P7-UI-005 Member list and role badge

Status: PASS

Story: `CF-P7-006` — surface `member-list-role-badge`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/member-list.js` | the frozen matrix as decisions, rendering, member read |
| `config/cloudflare/phase-7-member-list.json` | the frozen claim |
| `scripts/cloudflare-phase-7-member-policy.mjs` | the gate |
| `tests/collaboration-member-list.test.mjs` | 32 unit tests |
| `tests/cloudflare-phase-7-member-policy.test.mjs` | 23 drift cases |

## The matrix, checked twice

Four rules are pinned against **both** the frozen `domain-and-rbac.md` table and
the live decision function, so neither can drift alone:

| Rule | Verified |
|---|---|
| An owner cannot be removed by anyone, including an owner | all four roles denied |
| Removing an admin is reserved to the owner | admin denied on admin |
| An admin revokes editor and viewer devices only | admin denied on owner and admin |
| Provisioning requires the acting device to hold the key | owner with `keyReady: false` denied |

A sweep over every action × actor role × target role × member state × self flag
asserts that **every** denial carries a reason of at least ten characters ending
as a sentence.

## In the browser

Four role perspectives rendered from the same member list:

| Measure | Result |
|---|---|
| Controls rendered | 96 |
| Controls disabled | 60 |
| Disabled without an announced reason | **0** |
| Controls hidden because denied | **0** |
| Viewer's controls present and disabled | 24 of 24 |
| Duplicate reason ids | 0 |

Spot checks of the announced text:

- owner on owner, remove → "An owner cannot be removed. Transfer ownership first."
- admin on admin, revoke device → "Revoke your own device from the device section."
- owner whose device lacks the key, provision → "Your own device is still waiting
  for the workspace key, so it cannot provision one for someone else."

## Responsive and contrast

At 320 px: no horizontal page scroll, zero overflowing nodes, zero targets under
24 px. Denial reason contrast 5.33:1 dark and 7.88:1 light, against a 4.5:1 bar.

## Gate

```
Cloudflare Phase 7 member list gate passed
  CF-P7-006: PASS; P7-G2D authorizes CF-P7-007 only
  U3 held: a denied control stays visible, is disabled, and says why in announced text
  Owner removal is denied to everyone; admin removal stays with the owner
  A device without the workspace key cannot provision it to another
  Readiness is reused from CF-P7-005 rather than restated
```
