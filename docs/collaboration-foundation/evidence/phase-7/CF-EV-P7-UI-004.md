# CF-EV-P7-UI-004 Device and key initialization

Status: PASS

Story: `CF-P7-005` — surface `device-key-initialization`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/device-initialization.js` | the journey, readiness presentation, rendering |
| `js/collaboration/device-key-lifecycle.js` | extended with `rebindDeviceId` |
| `config/cloudflare/phase-7-device-initialization.json` | the frozen claim |
| `scripts/cloudflare-phase-7-device-policy.mjs` | the gate |
| `tests/collaboration-device-initialization.test.mjs` | 35 unit tests |
| `tests/cloudflare-phase-7-device-policy.test.mjs` | 31 drift cases |

## The journey, run in a browser

Against stub services in a real page:

```
calls: [["changeContext","8888…8888"],["enroll","8888…8888"],
        ["register","P256-HKDF-SHA256-A256GCM-v1"],["rebind","9999…9999"]]
steps: enrolling → registering → rebinding → registered
device id: 9999…9999
fingerprint unchanged: true
```

Enrolment happens before registration because registration carries the public
key; the re-bind happens after, onto the id the server assigned; the fingerprint
is the same one throughout.

## Readiness

All five values the server can report render, each with its own shape:

| Value | Shape | Waiting |
|---|---|---|
| `key_ready` | filled square | no |
| `pending_key` | dashed circle | yes |
| `stale_key` | dashed square | yes |
| `not_entitled` | triangle | no |
| `revoked` | slashed circle | no |

Measured in the page: five values rendered, five visually distinct shapes
(border radius, border style, and fill differ), so no state rests on colour.

**A defect found by the gate.** An earlier draft rendered seven values, having
read `active`, `removed`, and `rotating` out of neighbouring SQL literals instead
of out of the `WorkspaceKeyReadiness` type. The gate rejected it. The check now
parses the server's declared union rather than substring-matching the file —
`'rotating'` does occur in that source as a rotation literal and would have
satisfied a looser check.

## Fingerprint

Rendered grouped: `abcd EFGH 1234 ijkl MNOP 5678 qrst UVWX 90`, and the value
with spaces removed is byte-for-byte the original. It wraps between groups rather
than overflowing at 320 px.

## Accessibility and responsive

Contrast against the surface background:

| Element | Dark | Light | Bar |
|---|---|---|---|
| Fingerprint | 14.48:1 | 17.44:1 | ≥ 4.5:1 |
| Readiness reason | 4.93:1 | 8.25:1 | ≥ 4.5:1 |
| Blocked reason | 7.93:1 | 5.02:1 | ≥ 4.5:1 |

At 320 px: no horizontal page scroll, zero overflowing nodes, zero targets under
24 px. Both controls stay visible and disabled with a stated reason when they
cannot be used — signed out, session unknown, or browser unsupported. The
unsupported case states both what is wrong and what to do: "This browser cannot
protect a device key. Use a supported current browser in a secure context. No
private key was saved."

## Not evidenced

No screenshot: the Browser pane was not compositing frames in this session, so
capture timed out. Every claim above is a DOM or computed-style measurement taken
in the live page. No remote environment and no real API were touched.

## Gate

```
Cloudflare Phase 7 device and key initialization gate passed
  CF-P7-005: PASS; P7-G2C authorizes CF-P7-006 only
  Enrol, register, compare the fingerprint, then re-bind — in that order
  The re-bind moves the existing key and never mints new material
  All five server readiness values render, and waiting is not an error
  Revocation reaches the server before the local key is deleted
```
