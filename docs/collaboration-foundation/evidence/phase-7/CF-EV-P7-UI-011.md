# CF-EV-P7-UI-011 Responsive qualification across every surface

Status: PASS

Story: `CF-P7-012` — gate UX `U6`

## What was qualified

All **twelve** contract surfaces, rendered from the real modules against the real
stylesheet in a real browser — nothing re-implemented for the test.

| Width | Themes | Browsers |
|---|---|---|
| 320 | dark, light | chromium, firefox, webkit |
| 768 (tablet portrait) | dark, light | chromium, firefox, webkit |
| 1024 (tablet landscape) | dark, light | chromium, firefox, webkit |

Six measurements per browser, eighteen in total. A deliberately long name —
"Platform Quality Assurance and Release Engineering Working Group Alpha" — is
used as the workspace name, account login, member login, and invitee login, so
truncation is exercised rather than assumed.

## Results

| Measure | Result |
|---|---|
| Horizontal page scroll | **0** |
| Controls overflowing the viewport | **0** |
| Clipped text nodes | **0** |
| Targets under 24 px | **0** |

## The defect this story existed to find

At 320 px, **every collaboration list overflowed its container** — the member
list, the invitation list, the audit log, and the conflict options.

The cause was one line of CSS repeated four times: a grid track defaults to
`min-width: auto`, so a single wide row pushed the whole list past the page. Each
individual story had passed its own responsive check because each was measured
with short names; the long-name case across all surfaces at once is what exposed
it.

Fixed with `grid-template-columns: minmax(0, 1fr)` on each list and `min-width: 0`
on each row, plus `overflow-wrap: anywhere` on the reason text. Re-measured: zero
overflow at every width in both themes in all three browsers.

This is exactly why the sprint put this story last and made it cross-cutting.

## Declared limits

Two measurement exclusions, both stated rather than silently applied:

- **Form fields are excluded from the clipped-text check.** A single-line input
  whose value exceeds its box scrolls within the control; the caret reaches all
  of it and assistive technology reads the whole value, so it is not text a
  person cannot get to. Without this exclusion the create-workspace name field
  and the one-time invitation link would be reported as clipped, which would be
  wrong.
- **Controls inside a closed disclosure are excluded from the focus audit.** They
  are not rendered, cannot take focus, and are correctly unreachable by Tab, so
  auditing their focus ring would measure a style that never applies.

## Gate

```
Cloudflare Phase 7 qualification gate passed
  CF-P7-012: PASS; P7-G3E authorizes CF-P7-013 only
  All twelve surfaces qualified at 320, 768 and 1024 in both themes
  Zero overflow, zero clipped text, zero targets under 24 px
  Every focus ring visible, lowest measured contrast 5.48:1 against a 3:1 floor
  Narrowed coverage is declared with reasons, not silently dropped
```

The harness runs in `npm run test:e2e`, so it executes in CI on every push.
