# Collaboration Foundation Phase 7 — Responsive and keyboard qualification

Status: **PASS — `CF-P7-012`, entry `P7-G3D`, exit `P7-G3E`**

Cross-cutting. `P7-G3E` authorizes `CF-P7-013` only. Gate UX **U5** and **U6**.

## 1. Why this story is last

It qualifies every surface the previous eleven stories shipped, so a regression
in an early surface cannot slip through on the strength of its own story having
passed. Each story checked its own layout; this one checks all twelve together,
at every width, in both themes, in three browsers, with a name long enough to
break anything that does not truncate.

## 2. It found what it was built to find

At 320 px **every collaboration list overflowed its container** — members,
invitations, audit, and the conflict options.

One cause, repeated four times: a CSS grid track defaults to `min-width: auto`,
so a single wide row pushes the whole list past the page. Every individual story
had passed its own responsive check, because each was measured with short names.
The long-name case across all surfaces at once is what exposed it.

Fixed with `grid-template-columns: minmax(0, 1fr)` on each list, `min-width: 0`
on each row, and `overflow-wrap: anywhere` on reason text.

The gate now **requires** this story to record at least one finding with a cause,
a fix, and the affected surfaces — a cross-cutting qualification that finds
nothing is more likely to be measuring nothing.

## 3. Narrowed coverage is declared, never silent

Three narrowings exist, and all three are in the manifest with reasons, checked
by the gate:

- **Firefox is excluded from the Tab traversal assertion.** Headless Firefox does
  not advance focus through this harness, so asserting there would measure the
  driver rather than the page. Chromium and WebKit are both asserted. The harness
  prints the narrowing at run time, and the gate fails if any browser is neither
  asserted nor declared undriven.
- **Form fields are excluded from the clipped-text check**, because a single-line
  input scrolls within itself and its whole value is reachable.
- **Controls in a closed disclosure are excluded from the focus audit**, because
  they are not rendered and cannot take focus.

This follows the sprint's rule against silent caps: if coverage is bounded, say
what was dropped.

## 4. Results

Zero horizontal page scroll, zero overflowing controls, zero clipped text nodes,
zero targets under 24 px — across 18 measurements. Zero controls without a
visible focus ring; lowest measured focus contrast 5.48:1 against a 3:1 floor.
Zero disabled controls without an announced reason, and zero reached by Tab.

## 5. Verification

- `cf:phase7:qualify:check`, wired into `check:cloudflare`.
- `tests/browser-collaboration-qualification.mjs`, wired into `npm run test:e2e`
  so it runs in CI on every push.
- `tests/cloudflare-phase-7-qualification-policy.test.mjs` — 22 drift cases,
  including one per surface proving a dropped surface is rejected.

## 6. Boundaries held

No route, no schema, no remote environment. The harness serves the real modules
and the real stylesheet from a local origin and renders them exactly as the app
would.
