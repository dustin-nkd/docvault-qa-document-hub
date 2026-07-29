# Collaboration Foundation Phase 7 — Invitation acceptance

Status: **PASS — `CF-P7-008`, entry `P7-G3`, exit `P7-G3A`**

Surface 7 of twelve. `P7-G3A` authorizes `CF-P7-009` only.

## 1. The receiving half of CF-P7-007

Same secret, extra constraint: here the token arrives **in the address bar**. It
is the one moment the value sits somewhere the user can see, a browser can
remember, and an extension can read.

The API contract states what the official client does — extract the fragment
without logging, analytics, referrer, history persistence, or Cache Storage,
remove it from the address bar using history **replacement**, and send the token
in a POST body. This module does exactly that, and the gate checks the contract
still says so.

## 2. Replacement, not a push

`pushState` would leave the token in the back stack, where pressing Back restores
it into the address bar long after the invitation was accepted. `replaceState`
overwrites the entry that carried it. `pushState` is absent from the module
entirely, and the gate rejects its reappearance — naming it as a push rather than
as a missing replace, because that is the useful diagnosis.

Reading and clearing are one operation, in that order: the address bar is cleared
**before** the value is handed to any caller, so no caller can fail in a way that
leaves the token on screen. The gate proves this by running the reader, not by
reading it — a fake `location` and `history` go in, and the replacement URL is
asserted not to contain the token.

## 3. Four review states, three of which are dead ends

`pending` is the only actionable one. `expired`, `revoked`, and `consumed` each
say what happened and what to do next; none is rendered as a generic error, and
`consumed` in particular tells the user to raise it with the workspace owner if
the acceptance was not theirs.

A mismatched GitHub identity is named before submit rather than after: the server
refuses a subject mismatch, and a control that looks enabled and then fails is
exactly what the contract forbids.

## 4. Acceptance is honest about what it grants

`InvitationAcceptRequest` carries a device id, and success creates a `pending_key`
membership conveying **no usable key**. Both are surfaced before the choice:
without an active device the control is blocked with a route to the device
journey, and the surface states plainly that joining does not yet let you open
anything until an owner or admin provisions the key to this device.

A response claiming any other membership state is refused. Trusting it would
strand someone in a workspace they cannot read, and the failure would surface far
from its cause.

## 5. Verification

- `cf:phase7:accept:check`, wired into `check:cloudflare`.
- `tests/collaboration-invitation-accept.test.mjs` — 32 unit tests.
- `tests/cloudflare-phase-7-accept-policy.test.mjs` — 24 drift cases, including
  one per leak sink and one that swaps replacement for a push.

## 6. Boundaries held

No route, no schema, no remote environment, no personal storage key, no
`innerHTML`, no `fetch`. The token is never persisted, never logged, and never
placed where a browser would retain it.
