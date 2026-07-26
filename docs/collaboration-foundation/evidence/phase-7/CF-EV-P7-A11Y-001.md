# CF-EV-P7-A11Y-001 Accessibility and responsive baseline freeze

Status: PASS

Story: `CF-P7-001`

The accessibility and responsive floors for every Phase 7 surface are frozen in
sections 5, 6, and 7 of [`phase-7-ui-contract.md`](../../phase-7-ui-contract.md)
and enforced by `cf:phase7:contract:check`.

## Accessibility floor

| Rule | Value | Enforced |
|---|---|---|
| Standard | WCAG 2.2 AA | yes |
| Focus indicator visible | required | yes |
| Focus indicator non-text contrast | ≥ 3:1 | yes |
| Focus trap | prohibited | yes |
| Dialog focus moved on open | required | yes |
| Dialog focus restored on close | required | yes |
| State signalled by colour alone | prohibited | yes |
| Disabled control pattern | must state a reason | yes |
| Sync state announcements | polite live region | recorded |
| Minimum target size | 24 px | recorded |

The disabled-control rule is checked by pattern rather than by presence alone:
the gate requires the stated pattern to mention a reason, so it cannot be
weakened to "visible and disabled" without failing.

## Why controls are disabled rather than hidden

Gate UX criterion **U3** requires that a control the current role may not use
stays visible, is programmatically disabled rather than merely styled, and states
why. Hiding is the easier implementation and the wrong one. A hidden control
makes the product feel broken rather than governed, and it withholds the single
piece of information that resolves the user's confusion: the action exists, and
their role is the reason they cannot take it. The contract also forbids the other
common failure — a control that looks enabled and fails only on submit.

This is a UI obligation layered on a server guarantee that already holds.
CF-P6-008 proved that a Viewer's create, update, and tombstone are each denied
with zero rows written, so the interface is not the security boundary here; it is
the explanation of one.

## Responsive floor

Minimum supported width is 320 px, with breakpoints at 320, 768, and 1024. The
contract prohibits horizontal page scroll and prohibits clipped or overlapping
controls, both enforced by the gate. Long workspace and account names truncate
with the full value still exposed to assistive technology rather than overflowing
their container — the failure mode most likely to appear first on a real
workspace name.

## Scope of this evidence

This story freezes the baseline; it does not measure conformance, because no
surface exists yet. Measured conformance across all twelve surfaces is
`CF-P7-012`, deliberately sequenced last so that a regression in an early surface
cannot pass on the strength of its own story having closed. `CF-EV-P7-A11Y-002`
and `CF-EV-P7-A11Y-003` cover the member list and conflict dialog as they ship.

## Boundary

No runtime code, no route, no schema, no remote environment. `P7-G1` authorizes
`CF-P7-002` only.
