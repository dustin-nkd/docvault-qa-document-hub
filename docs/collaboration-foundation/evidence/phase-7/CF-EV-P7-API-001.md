# CF-EV-P7-API-001 Collaboration API client

Status: PASS

Story: `CF-P7-015`, entry gate `P7-G3E`, exit gate `P7-G3F`

Gate: `npm run cf:phase7:api:check`, wired into `check:cloudflare` after
`cf:phase7:qualify:check` and pinned in `scripts/cloudflare-ci-policy.mjs`.

## What was measured

Locally, and by driving the module rather than reading it. Nothing in this story
touched a deployed environment, a database, or a secret.

| Measurement | Result |
|---|---|
| Unit cases over the client | 56 pass |
| Wiring cases over the entry | 20 pass (8 new) |
| Drift cases over the gate | 54 pass |
| Collaboration modules scanned for transport | 20 |
| Modules permitted to perform transport | 1 (`js/collaboration/api-client.js`) |
| Frozen error codes handled | 12 of 12 |
| Server alias codes resolved into the frozen set | 3 |
| `npm run check` | pass, exit 0 |

Every refusal below is exercised against a recording transport, not asserted
from source. The gate fails if any one of them stops refusing.

| Refusal | Code |
|---|---|
| Absolute or protocol-relative path | `PATH_NOT_SAME_ORIGIN` |
| Path outside `/api/v1` | `PATH_OUTSIDE_API` |
| Mutation before the session is resolved | `SESSION_NOT_RESOLVED` |
| Mutation with no CSRF token held | `CSRF_TOKEN_REQUIRED` |
| Read carrying an idempotency key | `IDEMPOTENCY_KEY_ON_READ` |
| Key too short, too long, or not URL-safe | `INVALID_IDEMPOTENCY_KEY` |
| `offset`, `page`, `skip` | `UNSUPPORTED_QUERY_PARAMETER` |
| `token`, `csrf`, `csrfToken`, `sessionToken` in a query | `UNSUPPORTED_QUERY_PARAMETER` |
| `limit` above 100 | `LIMIT_OUT_OF_RANGE` |
| Empty or non-string cursor | `CURSOR_NOT_OPAQUE` |
| Response that is not JSON, including a 200 `text/html` | `NON_JSON_RESPONSE` |
| No usable transport | `TRANSPORT_REQUIRED` |

For a refused path and an unresolved mutation, the recorder confirms **zero**
calls reached the transport. The refusal happens before credentials leave.

## The gap this story closes

Phase 7 shipped eleven surface stories, each gated on `!/\bfetch\s*\(/` over its
own module, and all eleven still pass. No story owned the other side of that
boundary, so nothing ever called `/api/v1`. The surfaces were pure, proven, and
unreachable.

It surfaced in CF-P7-013 on Preview deployment `702d7419`: six collaboration
modules loaded on demand, the shell mounted, the lazy budget held — and the
rendered state was `loading`, permanently, because nothing could ask for a
session.

**Eleven gates checking eleven modules could not see the shape of the whole.**
That is the argument for this story, and it is the same argument CF-P7-013 made
about the build: a correct part-wise check is not a whole-system check.

## The single transport seam

The gate reads `js/collaboration/` from disk and requires exactly one module to
match a transport pattern. The pattern catches a bare `fetch(` **and** a
reference to `globalThis.fetch` / `window.fetch` / `self.fetch`, because a module
that resolves the global and passes it on has performed transport without ever
calling it under that name — and the eleven existing gates would not have caught
that.

Building the client revealed that the entry was doing exactly this: it resolved
`globalThis.fetch?.bind(globalThis)` as a default and handed it in. That is now
inside the client, so the directory really does have one door.

## Availability — the boundary decision

Owner authorization, 2026-07-26: **ask the deployment, keep the hostname as a
pre-filter.**

The open item recorded in `CF-EV-P7-OPS-001` is closed by this story.
`js/deployment.js` still answers `available: true` for any `*.pages.dev`
hostname, unchanged and deliberately so — it is free, eager, and correct about
GitHub Pages and unrecognised origins. On a Cloudflare origin its verdict now
means "not ruled out". The deployment's own `503 COLLABORATION_UNAVAILABLE`
decides, and is requested only after the user opens collaboration.

| Case | Before | After |
|---|---|---|
| Production Pages, `COLLABORATION_ENABLED=false` | opener clickable, shell stuck on `loading` | error state: "Collaboration is not enabled here" |
| Preview, enabled, signed out | `loading` | `unauthorized` with a sign-in action |
| Preview, enabled, signed in | `loading` | account chrome, built from the real session |
| GitHub Pages | banner, opener hidden | unchanged; no request made |
| API answers with the SPA shell (200 `text/html`) | read as data, silent | error state with a reason |

The probe does not run on Personal startup, and the gate asserts the eager
module contains no transport at all. The zero-modules-on-startup budget is
untouched: nothing here is reached until the opener is pressed.

A `401` is kept distinct from a disabled deployment. Reporting an authentication
failure as "not available here" would be a different and wrong message, and the
gate drives that case separately.

## Declared limits

Two of the ten journey surfaces are reachable from the entry after this story:
**account menu** and **workspace switcher**.

Eight are built, gated, and not yet composed into the shell: create workspace,
device and key initialization, member list, invitations, invitation acceptance,
sync state, conflict dialog, audit activity. Composing them is CF-P7-013's
integration work.

This is declared in the manifest with a reason, printed by the gate at run time,
and enforced: the gate requires every frozen surface to appear in exactly one of
the two lists, so a surface cannot quietly fall out of both.

## Measured in a browser

Local static server, Chromium, the module graph loaded exactly as it is served.

| Measurement | Result |
|---|---|
| Collaboration modules loaded before the opener is pressed | **0** |
| Modules loaded after it is pressed | 7, now including `api-client.js` |
| `/api/v1/session` requests before the press | 0 |
| `/api/v1/session` requests after the press | 1 |
| Signed-in path | 2 requests: session, then workspaces |
| Horizontal page scroll at 320 px and 1024 px | none |
| Error-state title contrast, dark / light | 16.74 / 15.78 |
| Error-state reason contrast, dark / light | 5.70 / 7.46 |
| Console errors | none |

Rendered states, driven against a stubbed transport in the live page:

| Case | Rendered |
|---|---|
| `503 COLLABORATION_UNAVAILABLE` | error — "Collaboration is not enabled here" |
| `authenticated: false` | unauthorized — sign-in action present |
| Signed in with two workspaces | account chrome; switcher and account menu present |
| Non-JSON `404` from a static host | error — "Collaboration could not be reached" |

Every one of these previously rendered `loading` and stayed there.

The states reuse the `base-states` surface CF-P7-012 already qualified, and
carry `role="status"`, `aria-live`, and a non-colour shape, so no new
accessibility surface was introduced.

## One thing this found

`resolveContext` refuses a workspace whose ID is not a UUID v4. That looked at
first like a contract mismatch — the API contract describes opaque IDs as
URL-safe strings of 16 to 64 characters — but it is not: `stableWorkspaceId` and
`deriveWorkspaceId` both set the version and variant nibbles, and the routes
enforce UUID v4 on the way in. The client and the surfaces agree with the server.

What it did expose is a failure mode. A record the surfaces refuse threw out of
`startCollaboration`, which left the shell mounted on `loading` — the exact
symptom this story exists to remove, reappearing through a different door. The
refusal is still loud, but it now lands as an error state with a reason.

## Not evidenced

No deployed environment was touched. No authenticated journey, no second
identity, no D1 state change, no secret read, no Preview measurement. Every
response in this evidence came from a recording transport in-process.

The client is proven to speak the contract correctly and to refuse to speak it
incorrectly. It is **not** proven against a live server; that is CF-P7-013,
which enters at `P7-G4`.
