# CF-EV-P7-UI-002 Account menu, workspace switcher, and persistent workspace identity

Status: PASS

Story: `CF-P7-003` — surfaces `account-menu` and `workspace-switcher`

## What shipped

| Module | Role |
|---|---|
| `js/collaboration/workspace-context.js` | selection key, persistence, context resolution |
| `js/collaboration/account-menu.js` | identity display, sign in/out, disclosure |
| `js/collaboration/workspace-switcher.js` | context indicator, workspace list, switching |

## Gate UX U2 — the half that is easy to lose

U2 has a visible half and a behavioural half. The visible half is that the active
workspace reads without opening a menu, so the context indicator renders in the
chrome as its own component rather than inside the switcher.

The behavioural half is that the selection "survives reload and back-navigation
**rather than silently defaulting**". When the remembered workspace is no longer
available, this implementation resolves to an explicit `unavailable` status and
**keeps the lost id** so the surface can name what went away. It does not fall
back to the first available workspace.

That choice is the point of the requirement. Silently landing someone in a
different workspace than the one they left is worse than showing nothing, because
they may then read or edit the wrong workspace's data believing it is the one
they were in. The policy enforces this structurally: the manifest must declare
`silent_fallback_on_unavailable: false`, and the gate rejects a resolver whose
code contains a `workspaces[0]` fallback.

Four statuses, each with a non-blank label, because a blank indicator is
indistinguishable from a missing one: `active`, `none-selected`, `unavailable`,
`empty`.

## Verified in a real browser

At a 320 px viewport:

| Check | Result |
|---|---|
| Selection key | `docvault:collab:local:u1:active-workspace` |
| Survives a simulated reload | yes — resolved `active`, "Release Team" |
| Remembered workspace removed | resolved `unavailable` |
| Did it silently become another workspace? | **no** |
| Indicator text in that state | "Workspace unavailable" |
| `data-context-status` | `unavailable` |
| Horizontal page scroll | none |
| Clipped children | none |
| Focus after opening the account menu | first menu item |
| Focus after closing | back on the trigger |
| Switcher focus on open | the selected workspace |
| `aria-expanded` after close | `false` |

## Other decisions the tests pin

- The selection key is scoped by **environment and subject only**. It is the
  answer to *which* workspace, so it cannot be keyed by workspace; and two
  accounts sharing a browser, or preview and production, never share a key. It
  can never collide with a Personal Vault key.
- A corrupt stored value and a storage failure both read as *no selection*
  rather than throwing, so a blocked or full store cannot break the chrome.
- A signed-out visitor gets an actionable **sign in**, not an empty state. An
  unknown session renders `loading` instead of guessing signed-out.
- A non-https avatar is dropped rather than rendered, so the collaboration chrome
  cannot introduce mixed content on every surface.
- The account trigger always carries a text label, never an avatar alone: an
  image-only control announces nothing and disappears if the image fails.
- With no workspaces the switch control stays **visible and disabled with a
  stated reason**, per the contract's rule against hiding controls the user
  cannot currently use.
- An unknown role is rejected rather than rendered.

`tests/collaboration-account-workspace.test.mjs` — 24 tests.
`tests/cloudflare-phase-7-account-policy.test.mjs` — 18 drift tests proving the
gate rejects each of these regressions rather than merely passing today.

## A policy improvement made here

These modules document the things they must never do, so a naive absence check
found the prohibition in a comment and failed a correct file. The policy now
strips comments before asserting a construct is *absent*, and a test proves that
documenting `workspaces[0]` passes while performing it fails.

## Correction recorded by CF-P7-004

This story's browser qualification checked that focus **moved and returned**
correctly, which it did, but never measured the focus ring's contrast. CF-P7-004
did measure it and found the ring these surfaces use — `2px solid var(--acc-l)` —
reaches only **2.54:1** against a white card in the light theme, below the 3:1
the contract requires for non-text. The accent is tuned for the dark theme, where
it measures 8.86:1.

The defect was latent from the day this story shipped. It is fixed in CF-P7-004
by a theme-aware `--collab-focus` token, and every collaboration focus rule —
including the ones added here — now points at it. Re-measured after the fix:
5.48:1 light, 8.86:1 dark. See `CF-EV-P7-UI-003`.

## Boundary

No route, no schema, no network call, no remote environment. Personal Vault code
untouched; collaboration stays lazy. `P7-G2A` authorizes `CF-P7-004` only.
