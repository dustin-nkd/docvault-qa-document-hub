# CF-EV-P7-OPS-002 Preview integration after composing the surfaces

Status: PARTIAL — integration proven; journeys blocked on deployment configuration

Story: `CF-P7-013`, under `P7-G4` authorized by the owner on 2026-07-26

## Deployment

| Field | Value |
|---|---|
| Deployment | `4c5d7c8a-17ec-4469-bcb7-b266bce91aa6` |
| Source commit | `fe0fa2e` |
| Branch | `codex-cf-p3-preview` |
| URL | `https://4c5d7c8a.docvault-qa-document-hub.pages.dev` |

## Measured on the deployment

| Measurement | Result |
|---|---|
| Collaboration modules loaded **before** the opener is pressed | **0** |
| Collaboration modules loaded **after** | **19** — the whole composed graph |
| Shell mounted | yes |
| Rendered state | `error` |
| Title | "Collaboration is not enabled here" |
| Reason | "Team collaboration is not enabled on this deployment." |
| Horizontal page scroll | none |

The zero-on-startup budget holds after composition: adding eight surfaces to the
panel did not move a single byte onto the Personal startup path, because the
whole graph still hangs off one dynamic import behind one click.

## What the deployment says

Both `/api/v1/session` and `/api/v1/workspaces` answer **503
`COLLABORATION_UNAVAILABLE`** on this Preview build. Collaboration is switched
off here.

That is a configuration state, not a defect: `COLLABORATION_ENABLED` is not set
for this Preview deployment, and Cloudflare Pages binds environment variables at
build time, so enabling it requires a redeploy. Setting it is an owner action —
`wrangler pages secret put` is refused to the agent by the permission classifier.

**The surface behaves correctly under that state**, which is itself worth
recording: a deployment with collaboration off says so plainly instead of
offering a sign-in that cannot succeed.

## A misdiagnosis, corrected

An earlier measurement of this same deployment showed "Collaboration could not be
reached" — the transport-failure branch — and was written up as a client
classification defect.

It was not. Driving `resolveSession()` against the exact 503 response, both in
Node and in the page itself, returns `available: false, reason:
'deployment-disabled'`, and the deployed `entry.js` checks availability at byte
7085, well before the transport branch at 7604. Re-pressing the opener once the
worker was warm rendered the correct message.

The first reading was a cold-start artifact: the opener was pressed seconds after
the build went live, and the first request failed before the worker was serving.
The client was right both times; the measurement was taken too early.

Recorded because a wrong diagnosis left in an evidence trail is worse than no
diagnosis: the next person would have gone looking for a bug that does not exist.

## Not proven

No journey. Every multi-step flow — create workspace, register a device, invite,
accept, resolve a conflict, read audit — needs an enabled deployment to talk to.
The eight surfaces compose and render their own states, and stop there.

CF-P7-013 therefore remains **not PASS**. It closes when `COLLABORATION_ENABLED`
is set for Preview, the deployment is rebuilt, and the journeys are qualified
against it.
