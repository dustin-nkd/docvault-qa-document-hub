# Phase 7 — the collaboration API client

Status: **PASS — `CF-P7-015`, entry gate `P7-G3E`, exit gate `P7-G3F`**

Module: [`js/collaboration/api-client.js`](../../js/collaboration/api-client.js)
Gate: `npm run cf:phase7:api:check`

## Why this story exists

Phase 7's governing principle is that it "adds no cryptographic, persistence, or
authorization primitive — it is the interface over the Phase 3 to Phase 6
services". Twelve stories read that as a rule about what not to build, and
eleven of them shipped a gate asserting that their own module performs no
network call. Every one of those assertions was correct and every one of them
still passes.

Nobody owned the other side. No module ever called `/api/v1`. The surfaces were
pure, complete, individually proven, and unreachable.

That is not a mistake any single story made. It is what happens when a
prohibition is enforced twelve times and the corresponding obligation is written
down once, in a sentence, with no story attached. Each gate could see its own
module; none could see the shape of the whole.

It surfaced in CF-P7-013, on Preview: the shell mounted, the lazy budget held,
six modules loaded on demand exactly as designed, and the interface rendered
"Checking your session" forever, because nothing existed that could check one.

## What it does, and what it refuses

The client speaks the frozen wire contract and refuses to speak it incorrectly.
Nothing here reimplements a service — identity, envelopes, revisions, idempotency
binding, cursors, membership, and the outbox all live in Phase 3 to Phase 6 code
that is already proven.

| Concern | Behaviour |
|---|---|
| Session | `GET /api/v1/session`, once, answering identity and availability together |
| CSRF | Held in a closure. Never returned to a caller, never in a URL, required on every mutation |
| Idempotency | Generated per mutation, or a caller's own key preserved exactly for a replay. Refused on a read |
| Cursors | Copied through byte for byte. Nothing here decodes, parses, or inspects one |
| Pagination | `limit` bounded at 100; `offset`, `page`, and `skip` refused outright |
| Origin | Absolute, protocol-relative, and non-`/api/v1` paths refused **before** the send |
| Errors | The frozen codes — twenty-nine since `CF-P7-016` — each to its one frozen presentation. Anything else fails closed |

Each refusal has a code, and the gate drives every one of them against a fake
transport rather than reading the source for a pattern.

### The two wire-spelling aliases

**Amended by `CF-P7-016`.** This section used to describe three aliases pointing
the other way, and to argue that the API contract and the frozen UI contract
simply named three failures differently, that neither was wrong, and that neither
could be edited to match the other. The middle claim was false. `UNAUTHENTICATED`
and `RECENT_AUTHENTICATION_REQUIRED` are spellings the API catalog does not
contain at all, so the client was aliasing two real catalog codes onto two
invented ones — and the frozen §4 map they belonged to covered twelve of the
catalog's twenty-nine while claiming to cover all of it. `CF-P7-016` corrected
§4, which the freeze permits through a story and forbids as an implementation
detail.

What is left is a genuine join, in the opposite direction. The implemented
Workers handlers emit `UNAUTHENTICATED` and `RECENT_AUTHENTICATION_REQUIRED` on
the wire, and no Phase 7 story may change a handler — reconciling the server with
its own catalog is the server's review, not this one. So those two wire spellings
map onto `AUTHENTICATION_REQUIRED` and `REAUTHENTICATION_REQUIRED`, and the gate
asserts every alias lands inside the frozen set. Without them a real 401 or 403
from Preview would reach the unrecognised bucket and lose its `unauthorized`
presentation without anything failing. `SESSION_EXPIRED` needs no alias now that
it has a mapping of its own.

### Why an unknown code fails closed

A code this build has never seen is, by definition, one whose safe presentation
nobody decided. Passing it through would put a guess in front of a user as though
it were a fact — and the code text itself may carry detail the disclosure policy
never cleared for display. It presents as `error`, and the raw code is not echoed.

## The single transport seam

Eleven gates assert "this surface performs no transport". That is only an
architecture if exactly one module does, so the gate checks the whole
`js/collaboration/` directory — read from disk, not from a list someone
remembered to update — and requires that `api-client.js` is the only file that
calls `fetch` or reaches for it as a global.

That second half matters. A module that resolves `globalThis.fetch` and hands it
elsewhere has performed transport without ever calling it under that name, and
the eleven existing gates would not have noticed.

## Availability: the owner's boundary decision

Recorded 2026-07-26. `js/deployment.js` returned `available: true` for any
`*.pages.dev` hostname — including the Production Pages deployment, where
`COLLABORATION_ENABLED` is false and no D1 exists. Until CF-P7-013 that verdict
only controlled a hidden banner. The lazy opener turned it into a clickable door,
which put the Phase 7 boundary "no collaboration activation" in play.

The decision was **ask the deployment, keep the hostname as a pre-filter**:

- The hostname check stays, unchanged, in the eager module. It is free, it runs
  for every visitor, and it is right about GitHub Pages and unrecognised origins
  — the cases where failing closed matters and where no request should be spent.
- On a Cloudflare origin it now means "not ruled out", not "confirmed".
- The confirmation is the deployment's own `503 COLLABORATION_UNAVAILABLE`,
  requested by the entry **after** the user opens collaboration.

The probe cannot move into the eager module: it ships in the initial payload for
everyone, and the Phase 7 budget is zero collaboration work for a user who never
opens collaboration. A probe there would spend that budget on every visitor to
answer a question almost none of them asks.

An unavailable deployment now says so in text. It has to come from here — the
banner that would normally explain an unavailable deployment is hidden on a
Cloudflare origin, correctly, because the hostname really is a Cloudflare one.
Staying silent would leave a user who pressed a button looking at nothing.

A denial is kept distinct from a disabled deployment. A `401` means the feature
is here and the user is not signed in; reporting that as "not available here"
would be a different and wrong message.

## The app-shell response

`interpret()` refuses any API response that is not JSON, including a `200` whose
content type is `text/html`.

This is the exact failure deployment `037fb093` shipped: the Pages SPA fallback
answered `/js/collaboration/entry.js` with the app shell at status 200, the
dynamic import resolved to a web page, and the shell never mounted. The build was
fixed in `e053b85`, but the class of defect — a missing route answered with a
page instead of an error — is a property of static hosting, not of that one bug.
A client that reads such a response as data turns it into silence. This one turns
it into an error state with a reason.

## Declared limits

Two of the twelve surfaces are reachable from the entry after this story:
**account menu** and **workspace switcher**. The other eight — create workspace,
device and key initialization, member list, invitations, invitation acceptance,
sync state, conflict dialog, audit activity — are built, gated, and still not
composed into the shell. That composition is CF-P7-013's integration work.

It is recorded here, in the manifest, and logged at run time rather than left to
be discovered, so the coverage this gate claims is exactly the coverage it has.

## Evidence

[`CF-EV-P7-API-001`](evidence/phase-7/CF-EV-P7-API-001.md)
