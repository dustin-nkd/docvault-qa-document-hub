# CF-EV-P7-STA-001 Collaboration UI contract and surface inventory freeze

Status: PASS

Story: `CF-P7-001`

The Phase 7 UI contract is frozen in
[`phase-7-ui-contract.md`](../../phase-7-ui-contract.md) with the machine-readable
form in `config/cloudflare/phase-7-ui-contract.json`, and is enforced by
`cf:phase7:contract:check`, wired into `check:cloudflare`.

## What is frozen

**Twelve surfaces**, each owned by exactly one story, each declaring the base
states it must render, the roles that may see it, and its actions. Surface
ownership is cross-checked against the sprint plan, so the contract and the plan
cannot disagree about who ships what.

**A five-state sync machine** — `Saved`, `Saving`, `Offline`, `Conflict`,
`Access removed` — with a defined source for each state, an explicit transition
set, `Saved` as the initial state, and `Access removed` as the only terminal one.
The gate rejects a transition out of a terminal state and rejects any state that
no transition can reach, so the model cannot carry decorative states.

**A total error mapping.** All twelve codes in the frozen server taxonomy map to
exactly one presentation, and every one is required to explain itself. The gate
asserts set equality rather than containment, so a new server code cannot be
silently left unmapped and an obsolete one cannot linger.

## Vocabularies are compared against the implementation, not restated

The contract's inherited vocabularies are checked against what the Phase 6 code
actually exports, by reading `RESOLUTION_OPTIONS` and `CONFLICT_STATES` from
`js/collaboration/conflict-resolution.js` and `STATES` from
`js/collaboration/outbox.js`. A contract that drifts from the implementation
fails the gate even if it is internally consistent. The two mapped document codes
are additionally confirmed to be raised by `document-service.ts`.

## One deliberate mismatch, recorded rather than flattened

The outbox has six internal states and the user-visible sync model has five, and
they are not the same axis. `expired` and `quarantined` are recovery situations
under ADR-006, not sync states, and section 8 of the contract says so explicitly
so that a later story does not collapse them into `error`.

## Negative testing

The gate was exercised against four deliberate drifts, each applied to the frozen
contract in isolation. All four were rejected:

| Drift | Result |
|---|---|
| Add `auto-merge` to the conflict resolutions | rejected — diverges from the implementation |
| Permit focus traps | rejected — accessibility floor lowered |
| Add a transition out of `Access removed` | rejected — terminal state may not transition onward |
| Drop `RATE_LIMITED` from the error mapping | rejected — taxonomy no longer covered exactly |

The contract was restored and re-verified clean afterwards: four resolutions, no
focus traps, ten transitions, twelve mapped codes.

## Boundary

No runtime code was written, no route registered, no schema touched, and no
remote environment contacted. `P7-G1` authorizes `CF-P7-002` only.
