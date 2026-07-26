# Collaboration Foundation Phase 7 — Invitations

Status: **PASS — `CF-P7-007`, entry `P7-G2D`, exit `P7-G3`**

Surface 6 of twelve. `P7-G3` authorizes `CF-P7-008` only.

## 1. This surface handles a secret

Almost every decision here follows from one fact: the acceptance token has at
least 256 random bits, is returned **exactly once**, lives **only in a URL
fragment**, and is stored server-side only as a digest. It cannot be recovered.

So the surface:

- **says so while the value is on screen**, assertively, rather than letting
  someone navigate away and find out later;
- renders it into a **readonly input, never an anchor** — activating a link
  would push the secret into browser history, which is exactly what the fragment
  placement exists to avoid;
- refuses any URL carrying the token outside its fragment, and any URL with a
  query string at all, because a query string reaches the server in request
  lines, referrers, and proxy logs;
- hands it back inside a holder with `clear()`, so a caller can drop it the
  moment it has been copied; reading a cleared holder throws;
- takes the clipboard as an injected dependency, so the module cannot quietly
  acquire a second way to move the secret around;
- treats a blocked clipboard as a message, not a failure: the value is still on
  screen, and the copy that says so repeats that it will not be shown again.

The gate enforces the negative space structurally: `localStorage`,
`sessionStorage`, `indexedDB`, `caches.`, `console.`, `document.cookie`,
`history.pushState`, and `navigator.sendBeacon` may not appear anywhere in the
module, and neither may an `.href =` assignment. It also checks the one-time,
fragment-only promise against `api-contract.md` itself, so the surface cannot
outlive the rule it depends on.

## 2. Who may invite whom

From the frozen matrix: creating an **Admin** invitation is Owner-only; Editor
and Viewer invitations are Owner or Admin. Revocation follows the same split, so
an admin cannot revoke an invitation they could not have created. An **owner
cannot be invited at all** — ownership moves by transfer.

Denied controls stay visible, disabled, and explained, as CF-P7-006 established,
with reason ids scoped per rendered instance.

## 3. The username is a display snapshot

The server resolves the username to an immutable `github:<numeric-id>` at
creation; that subject is the acceptance authority and the username never is. The
client mirror exists only to keep the control from being enabled into a refusal,
and is shaped like GitHub's own rule rather than stricter.

## 4. Verification

- `cf:phase7:invitations:check`, wired into `check:cloudflare`.
- `tests/collaboration-invitations.test.mjs` — 27 unit tests.
- `tests/cloudflare-phase-7-invitation-policy.test.mjs` — 23 drift cases,
  including one that walks every leak sink individually.

## 5. Boundaries held

No route, no schema, no remote environment, no personal storage key, no
`innerHTML`, no `fetch`. The token is never persisted, never logged, and never
placed anywhere a browser or a proxy would retain it.
