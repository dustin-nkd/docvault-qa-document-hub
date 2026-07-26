# CF-EV-P7-OPS-001 Preview integration measurements

Status: PARTIAL — integration proven, journeys not reachable

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

## Not evidenced

No authenticated journey, no second identity, no D1 state change. Nothing was
written to any database and no secret was read.
