# CF-EV-P7-A11Y-004 Keyboard and focus qualification across every surface

Status: PASS

Story: `CF-P7-012` — gate UX `U5`

## Measured, in three real browsers

| Measure | chromium | firefox | webkit | Bar |
|---|---|---|---|---|
| Focusable controls audited | 16 | 16 | 16 | — |
| Controls with **no** visible focus ring | **0** | **0** | **0** | 0 |
| Lowest focus ring contrast | **5.48:1** | **5.48:1** | **5.48:1** | ≥ 3:1 |
| Disabled controls | 17 | 17 | 17 | — |
| Disabled controls with **no announced reason** | **0** | **0** | **0** | 0 |
| Disabled controls reached by Tab | **0** | **0** | **0** | 0 |
| Dialog accessible name resolves | yes | yes | yes | required |

Every focus ring is measured against the background actually behind the control,
walked up the tree until an opaque colour is found, rather than against an
assumed page background.

## Keyboard traversal

Tab reaches **16 distinct controls across 7 surfaces** in Chromium and WebKit,
never landing on a disabled control.

**Declared limit:** headless Firefox does not advance focus through this harness,
so a traversal assertion there would measure the driver rather than the page.
Firefox is therefore excluded from the traversal assertion **only** — every other
assertion in this file still runs on all three browsers, and the harness prints
`note: firefox traversal not driven` at run time so the narrowing is visible in
CI output and not only in this document.

The gate enforces the honesty rather than the coverage: it fails if a browser is
neither asserted nor declared undriven, so the gap cannot become silent.

## Live regions

Every `aria-live` value on the page is `polite` or `assertive` — no other value
appears. The sync-state indicator uses `polite` for Saved, Saving, and Offline,
and `assertive` for Conflict and Access removed, matching the contract.

## Not evidenced

Announcement was verified structurally: every `aria-describedby` and
`aria-labelledby` resolves to a non-empty node, and every disabled control has a
reason of at least ten characters reachable through one of them. Listening with
an actual screen reader is not automated here and is not claimed.

Focus behaviour **around** dialogs — moved on open, restored on close — is
asserted in the CF-P7-010 unit suite against a synthetic DOM; this story measures
the resulting focus ring in a real browser but does not re-drive the open/close
cycle.
