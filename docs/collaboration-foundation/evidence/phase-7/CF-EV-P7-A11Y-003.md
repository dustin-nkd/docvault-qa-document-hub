# CF-EV-P7-A11Y-003 Accessibility of the conflict dialog

Status: PASS

Story: `CF-P7-010`

## Dialog semantics

| Requirement | Implementation | Verified |
|---|---|---|
| Announced as a dialog | `role="dialog"` | unit test + gate |
| Modal | `aria-modal="true"` | unit test + gate |
| Has an accessible name | `aria-labelledby` → the title node's id | unit test asserts the id resolves |
| Each choice described | `aria-describedby` → its consequence text node | one assertion per resolution |
| Ids unique per instance | scoped by `instanceId` | two renders share no id |

## Focus

| Requirement | Result |
|---|---|
| Moved on open | focus lands on the first resolution control |
| Restored on close | returns to the element that opened the dialog |
| No element to restore to | handled without throwing; returns `false` |
| **No focus trap** | no `keydown` handler exists in the module at all |

The contract prohibits a focus trap, so the module contains no key handling
whatsoever — focus is *placed*, not fenced. Both the unit suite and the gate
assert the absence: a `keydown` listener added to the module is rejected as "the
beginning of a focus trap".

## The destructive control

Discarding is the only action that can lose work, and it is the only one that
changes shape under confirmation:

- unarmed, it reads "Discard my draft" and states that this cannot be undone;
- armed, it reads "Yes, discard my draft" and a second control, "Keep my draft",
  appears beside it;
- with no draft held, it is **visible, disabled, `aria-disabled="true"`**, and
  carries a title explaining there is nothing on this device to discard.

The destructive row also carries `data-destructive="true"`, so the distinction is
in the DOM and not only in the border colour.

## State without colour

`data-conflict-state`, `data-resolution`, `data-destructive`, and
`data-draft-held` all expose state as data. The safety statement — whether the
draft is held — is rendered as text and leads the dialog, because it is the
answer to the question the user is actually asking.

## Not evidenced

Screen reader announcement was verified structurally, by asserting every
`aria-describedby` and `aria-labelledby` resolves to a non-empty node. Listening
with an actual screen reader, and keyboard traversal across the whole surface
inventory, belong to CF-P7-012.
