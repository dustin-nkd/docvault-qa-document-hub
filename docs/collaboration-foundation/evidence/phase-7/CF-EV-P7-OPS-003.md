# CF-EV-P7-OPS-003 The composed shell, filled from the deployment

Status: PASS — amended 2026-07-28. Recorded `PARTIAL — the composition is proven; no journey is qualified` when written; the condition that held it short has since been cleared. See the amendment at the end.

Story: `CF-P7-013`, under `P7-G4` authorized by the owner on 2026-07-26

Follows [`CF-EV-P7-OPS-002`](CF-EV-P7-OPS-002.md), which recorded the deployment
this story was measured against. That deployment has collaboration switched off,
so everything below is local, and it says so where it matters.

## What changed since OPS-002

`fe0fa2e` composed the eight remaining surfaces into a panel. Each one mounted,
and each one mounted in `loading` — permanently, because `renderSurfacePanel`
takes a `data` object that nothing populated. The panel was correct and it was
fed nothing.

Three things close that, and none of them adds a surface or a primitive:

| Added | Does |
|---|---|
| `js/collaboration/services.js` | Joins fourteen surface-shaped method names to fourteen frozen routes through the CF-P7-015 client |
| `js/collaboration/entry.js` | Asks each surface's own authorized read and paints the answers |
| `js/deployment.js` | Hands the entry a store, an environment, and the address bar |

The last one is smaller than it looks and was load-bearing. Without the store and
the environment the entry can never restore a remembered workspace, so every
workspace-scoped surface stays empty for a returning user; without the address
bar an invitation link is a fragment nothing reads.

## Measured in a browser

Chromium, Firefox, and WebKit. The real module graph, the real stylesheet, and
the shipped entry, loaded exactly as the app loads it. The transport is stubbed
and nothing else is.

| Measurement | Result |
|---|---|
| Panel surfaces mounted | 8 of 8 |
| Routes called through the client | 6 |
| Surfaces left on `loading` after every read returned | **0** |
| Horizontal page scroll at 320 / 768 / 1024, both themes | none |
| Clipped text, overlapping controls, targets under 24 px | none |
| Disabled controls with no announced reason | 0 |
| Console errors | none |
| Workspace chosen through the switcher, then remembered | yes |

Rendered from what the deployment answered, not from placeholders: the member
login, the pending invitation, the audit event type, and the key readiness all
appear in the DOM with the values the transport returned.

## The defect this found

At 320 px with a long workspace name, the chrome overflowed the page.

`.collab-switcher` and `.collab-account` are flex items of `.collab-chrome` and
default to `min-width: auto`, so they refused to shrink below the intrinsic width
of a `white-space: nowrap` workspace name. The ellipsis on
`.collab-context__name` could therefore never apply, and the chrome pushed past
the viewport.

CF-P7-012 could not have seen it. It qualified the switcher standing alone in a
host section, where there is no flex parent to refuse and no chrome padding to
subtract. The composed chrome is the only place the failure exists.

Fixed by giving both `min-width: 0` and `max-width: 100%`, and re-measured at all
three widths in both themes.

## Behaviour driven, not asserted

Every one of these is exercised by the gate against the shipped entry, not read
out of its source.

| Case | Result |
|---|---|
| A denied member read | that surface renders `error` with the server's reason; its neighbours render normally |
| A `401` mid-read | that surface renders `unauthorized`, not a generic failure |
| A code this build has never frozen | fails closed; the code is never shown to the user |
| An editor opening the workspace | the audit and invitation routes are never called; the surfaces state the role reason themselves |
| A membership removed while the workspace is open | `Access removed`, and only after the re-check |
| The same denial with the membership intact | **not** `Access removed` |
| A re-check that itself fails | claims nothing |
| An invitation link in the fragment | reviewed live; the token never reaches a URL; the address bar is cleared by replacement |
| A workspace id that is not the shape the server issues | refused before a URL exists |

## Not evidenced

**No journey, and no deployment.** Nothing here touched a deployed environment, a
database, or a secret. Every response came from a recording transport in-process
or from a stub in the page.

Five journeys cannot complete in this build at all — device registration,
workspace creation, invitation acceptance, conflict resolution, and sign-in —
each for a reason declared in the manifest and printed by the gate. Three of the
five sync states are unreachable for the same class of reason. None of that is a
surface defect; each is a seam between what Phase 7 was allowed to build and what
a complete journey needs.

## What would make this PASS

`COLLABORATION_ENABLED` set for the Preview environment, `codex-cf-p3-preview`
rebuilt, and the journeys qualified against the resulting deployment. That is an
owner action: Pages binds environment variables at build time, and
`wrangler pages secret put` is refused to an agent by the permission classifier.

Until then `CF-P7-013` is **not PASS**, `P7-G4A` is not reached, and `CF-P7-014`
is not authorized to begin.

## Amendment — 2026-07-28

**This record was written while `CF-P7-013` had no qualified journey, and it
said so.** What it measured was the composition driven against a recording transport, with no live session to drive it with. Nothing in it is withdrawn: those
measurements were correct on the day, and the 503 it records really was what the
deployment answered.

What changed is not this record but the thing it was waiting on. `CF-P7-017`
corrected the dispatch polarity (`D-P7-02`), a Preview build carrying that fix
was deployed, and on 2026-07-28 the Product Owner drove the journeys on
deployment `b2520460-8d70-4f83-972b-bc31f56f5a3a` in their own browser, signed in
to their own GitHub account: sign-in, device registration, workspace creation,
device revocation and workspace switching all completed. `CF-EV-P7-OPS-002`
carries that qualification and the read-only D1 corroboration behind it.

This record's status therefore reads PASS as part of a PASS story, with the
PARTIAL it originally carried preserved in the line above rather than
overwritten. Two journeys remain unqualified and are named in
`CF-EV-P7-OPS-002`: inviting someone and having them accept, and resolving a
conflict.
