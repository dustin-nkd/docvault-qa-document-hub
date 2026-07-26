# Collaboration Foundation Phase 7 — Conflict resolution dialog

Status: **PASS — `CF-P7-010`, entry `P7-G3B`, exit `P7-G3C`**

Surface 9 of twelve. `P7-G3C` authorizes `CF-P7-011` only. Gate UX **U4** is
decided here.

## 1. What U4 asks, and who answers each part

> A local draft is never lost to a conflict. It survives the dialog being
> dismissed, navigation away, and a full reload. It is discarded only by an
> explicit confirmed choice, and no automatic merge is ever performed.

Two of those three are **not this module's to implement**, and that is the point.

- **Survival across a reload** belongs to the outbox (CF-P6-006), which holds the
  queued mutation encrypted in IndexedDB and quarantines rather than deletes on
  every authority change.
- **The four resolutions and the refusal to merge** belong to CF-P6-007.

A dialog that stashed its own copy of the draft would be a second, unreviewed
persistence path for plaintext user work — exactly what the governing principle
forbids. So this module **checks** that a draft is held and withholds the
destructive option when it cannot see one, rather than holding it. The gate
rejects every storage API in the module, with one drift case per API.

## 2. Dismissing is not a decision

Closing the dialog leaves the conflict `unresolved` and the draft retained. A
dialog that resolved on dismissal would turn a stray Escape into a decision about
someone's unsaved work.

## 3. Discarding takes two acts

Arming, then confirming. `DISCARD_NOT_ARMED` and `DISCARD_NOT_CONFIRMED` are
separate refusals, and `NO_DRAFT_TO_DISCARD` covers the case where there is
nothing to lose. The gate drives each guard to its refusal rather than matching a
pattern in the source.

Once armed, the control changes text to "Yes, discard my draft" and a "Keep my
draft" control appears beside it — the way back is always visible.

## 4. Every choice states its consequence before it is chosen

Including the two phrases that matter most: *"Nothing is merged for you"* on
reapply, and *"This cannot be undone"* on discard. Each consequence is a text node
the choice points at with `aria-describedby`.

## 5. Focus is placed, not fenced

Focus moves to the first resolution on open and returns to the opener on close.
There is **no** key handling in the module at all, because the contract prohibits
a focus trap and the simplest way to guarantee its absence is to have nothing
that could become one. The gate rejects a `keydown` listener as "the beginning of
a focus trap".

## 6. Verification

- `cf:phase7:conflict:check`, wired into `check:cloudflare`.
- `tests/collaboration-conflict-dialog.test.mjs` — 27 unit tests.
- `tests/cloudflare-phase-7-conflict-policy.test.mjs` — 26 drift cases.

## 7. Boundaries held

No route, no schema, no remote environment, no storage of any kind, no
`innerHTML`, no `fetch`. The service layer is delegated to, never reimplemented.
