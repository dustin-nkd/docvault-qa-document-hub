# Collaboration Foundation Phase 7 — Sync state

Status: **PASS — `CF-P7-009`, entry `P7-G3A`, exit `P7-G3B`**

Surface 8 of twelve. `P7-G3B` authorizes `CF-P7-010` only.

## 1. Five states, and no sixth

`Saved`, `Saving`, `Offline`, `Conflict`, `Access removed`. None of them is a
synonym for a generic error, and the gate compares the module's set against the
frozen contract's own list rather than against a copy.

Each carries a distinct shape as well as a label. The gate counts the shapes and
fails if two collide, because a shared shape leaves colour as the only difference
— which the contract prohibits.

## 2. The order of the derivation is a decision

`Access removed` is checked first because it is terminal: a removed member whose
queue happens to be mid-flight is not "Saving". `Conflict` outranks the queue for
the same reason — it needs an explicit choice, and showing "Saving" over it would
suggest that waiting is enough.

## 3. Access removed protects a non-disclosing API

This is the subtle one. `RESOURCE_NOT_FOUND` is returned whether or not the
resource exists, so a stranger cannot probe for workspaces. If the client
announced "your access was removed" on that status code alone, the message would
confirm the resource exists and undo the property the server works to maintain.

So the state requires **two** pieces of evidence: a denial, and a **completed**
membership re-check saying the user is no longer an active member. A denial
alone, an unfinished re-check, or a re-check that confirms membership all fail to
produce it. The gate runs the derivation across every one of those branches.

Recovery is re-entry through the workspace switcher, and the state says so
explicitly: retrying in place will not help.

## 4. The outbox is a different axis

The outbox has six internal states; this model has five. They do not line up, and
the mismatch is absorbed rather than papered over.

`expired` and `quarantined` are **not** sync states. They are recovery
situations, reported separately, and each says the queued work is *kept, not
discarded*. A quarantined entry therefore derives `Saved` — not `Saving`, which
would imply work in progress, and not an error, which would bury a queue that
needs a person to look at it.

The outbox vocabulary is imported from CF-P6-006; the gate rejects a second copy.

## 5. Verification

- `cf:phase7:sync:check`, wired into `check:cloudflare`.
- `tests/collaboration-sync-state.test.mjs` — 28 unit tests.
- `tests/cloudflare-phase-7-sync-policy.test.mjs` — 24 drift cases.

## 6. Boundaries held

No route, no schema, no remote environment, no personal storage key, no
`innerHTML`, no `fetch`. The module decides a state from evidence it is given and
never fetches that evidence itself.
