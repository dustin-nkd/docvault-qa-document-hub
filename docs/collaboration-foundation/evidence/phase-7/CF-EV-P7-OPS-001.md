# CF-EV-P7-OPS-001 Preview integration measurements

Status: PASS — amended 2026-07-28. Recorded `PARTIAL — integration proven, journeys not reachable` when written; the condition that held it short has since been cleared. See the amendment at the end.

Story: `CF-P7-013`, under `P7-G4` authorized by the owner on 2026-07-26

## What was deployed

| Field | Value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Environment | Preview |
| Branch | `codex-cf-p3-preview` |
| Deployment | `702d7419-aff3-433f-bb0b-23519f9d065b` |
| Source commit | `e053b85` |
| URL | `https://702d7419.docvault-qa-document-hub.pages.dev` |

A prior deployment `037fb093` (source `51518bb`) is retained; it is the one that
exposed the defect below.

## Measured on the deployment, not locally

| Measurement | Result |
|---|---|
| `content-type` of `/js/collaboration/entry.js` | `application/javascript` |
| Collaboration modules loaded **before** the opener is pressed | **0** |
| Collaboration modules loaded **after** it is pressed | **6** |
| Modules | `entry`, `shell`, `base-states`, `workspace-context`, `account-menu`, `workspace-switcher` |
| Shell root revealed | yes |
| Availability banner on Cloudflare | hidden |
| Rendered state | `loading` — "Checking your session" |

**Zero collaboration modules on startup is the Phase 7 budget, and it holds on
the real deployment**, not only in a local harness.

## The defect this story found

Deployment `037fb093` served `/js/collaboration/entry.js` as **`text/html`**,
status 200 — the SPA fallback. The dynamic import resolved to a page, its own
imports never loaded, and the shell never mounted.

The artifact did not contain the collaboration modules. `build-pages.mjs`
collected what `index.html`, `sw.js` and the CSS referenced, and the lazy design
deliberately means `index.html` references none of it. Neither half was wrong;
they did not know about each other.

Fixed in `e053b85`: the build now walks the JavaScript module graph, static
imports and `import()` alike, transitively. Re-measured on `702d7419` and
correct, as recorded above.

**Eleven prior stories passed without noticing, because no story before this one
went through the build.** That is the argument for CF-P7-013 existing.

## What is not proven, and why

The rendered state is `loading` and stays there. Per the frozen contract that is
correct — an unknown session must render loading and never guess — but it is not
a usable journey.

The cause is a real gap in Phase 7 as planned: **no API client layer was ever
built**. There is nothing to ask for the session, and for the same reason the
eight remaining surfaces — create workspace, device initialization, member list,
invitations, invitation acceptance, sync state, conflict dialog, audit activity —
are built, gated, and unreachable from the entry. They are absent from the
artifact because nothing imports them, which the build correctly reflects.

So this evidence is **PARTIAL and is not a PASS for CF-P7-013**:

- **Proven:** lazy budget, deployment availability rule, artifact correctness,
  shell mount, banner behaviour.
- **Not proven:** any journey, because none can run without a session.

## Second open item

`js/deployment.js` returns `available: true` for **any** `*.pages.dev` hostname,
including the Production Pages deployment built from `main` (`6cc6ae95`). The
opener is therefore offered on an environment where `COLLABORATION_ENABLED` is
false and no D1 exists. Before CF-P7-013 the verdict only controlled a hidden
banner; this story turned it into a clickable door, so the Phase 7 boundary "no
collaboration activation" now needs a decision rather than an assumption.

Recommended: ask the deployment rather than infer from the hostname.

**Closed by `CF-P7-015`.** The owner authorized exactly that on 2026-07-26: ask
the deployment, keep the hostname as a pre-filter. `js/deployment.js` is
unchanged in behaviour — it stays free, eager, and correct about GitHub Pages —
but on a Cloudflare origin its verdict now means "not ruled out". The
deployment's own `503 COLLABORATION_UNAVAILABLE` decides, requested by the entry
only after the opener is pressed, so the zero-modules-on-startup budget is
untouched. See [`CF-EV-P7-API-001`](CF-EV-P7-API-001.md).

The first open item — no API client layer — is also closed by `CF-P7-015`. The
entry no longer renders `loading` permanently; it resolves a real session. Eight
of the ten journey surfaces remain uncomposed, which is CF-P7-013's own
integration work and is declared rather than left implicit.

## Not evidenced

No authenticated journey, no second identity, no D1 state change. Nothing was
written to any database and no secret was read.

## Amendment — 2026-07-28

**This record was written while `CF-P7-013` had no qualified journey, and it
said so.** What it measured was the composed shell against a Preview deployment whose every collaboration route answered 503. Nothing in it is withdrawn: those
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
