# CF-EV-P7-SEC-002 Security review of one-time invitation token handling

Status: PASS

Story: `CF-P7-007`

## What is being reviewed

The only Phase 7 surface that holds a bearer secret in the browser. The token
grants workspace membership on acceptance, has at least 256 random bits, is
issued once, and exists server-side only as a digest — so a leak cannot be undone
by rotating anything the user controls, only by revoking the invitation.

## Threats considered, and what stops each

| Threat | Control | Verified by |
|---|---|---|
| Token reaches the server in a request line | fragment-only; any query string refused | `TOKEN_MAY_NOT_REACH_A_QUERY_STRING` + unit test |
| Token leaks through `Referer` | fragments are not sent in referrers; no anchor rendered | zero anchors asserted |
| Token retained in browser history | readonly input, never a link; no `history.pushState` | gate rejects `.href =` and `history.pushState` |
| Token persisted locally | no `localStorage`, `sessionStorage`, `indexedDB`, `caches.` | gate walks each sink; one drift case per sink |
| Token written to a log or analytics sink | no `console.`, no `navigator.sendBeacon` | gate + drift case |
| Token readable after the user is done | `clear()` nulls the value; `read()` then throws | unit test + gate check |
| Token silently lost | assertive `role="alert"` while on screen | unit test |
| A second, unreviewed exfiltration path | clipboard injected, not reached for | unit test |
| Escalation by invitation | admin invitations reserved to the owner; revocation split identically | gate checks the live decision |

## Residual risk

The value is visible on screen while the surface shows it, so shoulder-surfing
and screen-sharing are outside any client control. Revoking the invitation is the
remedy and sits on the same surface.

Clipboard contents leave this module's control once written — inherent to a copy
affordance. Forcing manual selection instead would be worse for the user without
being meaningfully safer.

The username mirror is deliberately permissive; the server resolves and pins the
immutable subject, so a mismatch is refused there rather than here.

## Sign-off

Reviewed by the maintainer as part of CF-P7-007. DocVault is single-maintainer,
so this is one owner review and **not** an independent security review, following
the precedent set at the Phase 5 exit. No live token was created and no remote
environment was touched.
