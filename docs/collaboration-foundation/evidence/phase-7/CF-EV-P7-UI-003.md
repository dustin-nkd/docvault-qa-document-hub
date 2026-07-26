# CF-EV-P7-UI-003 Create workspace journey

Status: PASS

Story: `CF-P7-004` — surface `create-workspace`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/create-workspace.js` | name rule, journey state, rendering, orchestration |
| `config/cloudflare/phase-7-create-workspace.json` | the frozen claim this story is held to |
| `scripts/cloudflare-phase-7-create-workspace-policy.mjs` | the gate |
| `tests/collaboration-create-workspace.test.mjs` | 41 unit tests |
| `tests/cloudflare-phase-7-create-workspace-policy.test.mjs` | 32 drift cases |

## The ordering rule, proven in a browser

The API contract splits creation into a bootstrap intent that mutates nothing, a
client-side sealing step bound to what that intent returned, and an atomic create
carrying the same idempotency key. Run against stub services in a real browser,
the journey produced:

```
calls: [["intent","key-1"],["seal","5555…5555"],["create","key-1"]]
steps: binding → sealing → creating → created
selection written: ["5555…5555"]
status: created
```

The seal carries the workspace id the *server* returned, both calls carry one
key, and the created workspace becomes the active selection.

The gate holds this structurally rather than trusting the claim: it locates the
three call sites in the module and rejects sealing before the intent or creating
before the sealing, counts the idempotency-key minting sites and rejects a
second, and rejects a `crypto.randomUUID` anywhere in the module.

## Preconditions state themselves

| Situation | What the surface does |
|---|---|
| No active device | submit visible, `disabled`, `aria-disabled="true"`, reason in text and in `title`, plus a route to the device journey |
| Signed out | asks for sign-in; offers no device route |
| Session unknown | "Checking your session." — never rendered as signed out |
| Untrimmed name | input `aria-invalid="true"`, hint reads "Remove the spaces at the start or end of the name." |

Measured in the browser: the blocked submit reported `disabled: true`,
`aria-disabled: "true"`, and the title "Set up this device first. A workspace key
has to be sealed to an active device."; the device route was present; the ready
surface's submit was enabled.

## Accessibility — measured, and one real defect found and fixed

Contrast ratios computed in-page against the surface background:

| Element | Dark | Light | Bar |
|---|---|---|---|
| Focus ring | 8.86:1 | 5.48:1 | ≥ 3:1 non-text |
| Failure text | 4.53:1 | 6.47:1 | ≥ 4.5:1 |
| Blocked reason text | 7.93:1 | 5.02:1 | ≥ 4.5:1 |

The light column is the finding. On first measurement the light theme failed
three ways: the focus ring reached only **2.54:1** against a white card, the
failure text **3.76:1**, and the blocked reason **2.15:1**. The palette accents
`--acc-l`, `--c-bug`, and `--c-tc` are tuned for the dark theme and are too light
on white.

The focus failure was **not confined to this story** — the same `--acc-l` ring is
used by the CF-P7-002 and CF-P7-003 focus rules, so those surfaces carried the
same defect in light theme from the day they shipped.

Fixed by introducing three theme-aware tokens — `--collab-focus`,
`--collab-danger`, `--collab-warning` — with darker light-theme values, and
pointing every collaboration focus ring at the token. All three ratios above were
re-measured after the fix.

Keyboard: tabbing reaches the input and the enabled submit in source order; the
disabled submit is skipped; the focused control matched `:focus-visible` with a
2 px outline at 2 px offset. No focus trap — this surface opens no dialog.

## Responsive

| Width | Horizontal page scroll | Overflowing nodes | Clipped text | Targets under 24 px |
|---|---|---|---|---|
| 320 | none | 0 | none | 0 |
| 768 | none | 0 | none | 0 |
| 1024 | none | 0 | none | 0 |

At 320 px the submit measures 262 × 40 px and a long workspace name stays inside
its container. All four step states — `pending`, `active`, `done`, `stopped` —
render as distinct shapes, so no state rests on colour.

## Not evidenced

No screenshot is attached: the Browser pane was not compositing frames in this
session, so the capture timed out. Every claim above is instead a DOM or computed
-style measurement taken in the live page, which is the stronger record. No
remote environment, no deployment, and no real API was touched — the journey ran
against injected stubs.

## Gate

`npm run cf:phase7:create:check`, wired into `check:cloudflare` after
`cf:phase7:account:check`.

```
Cloudflare Phase 7 create workspace gate passed
  CF-P7-004: PASS; P7-G2B authorizes CF-P7-005 only
  The creator envelope is sealed only after the server returns its binding
  One idempotency key covers both calls, and a retry reuses it
  The name rule mirrors the server in code points; the server stays the authority
  A missing device explains itself instead of failing on submit
```
