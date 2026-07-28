# CF-EV-P7-OPS-002 Preview integration after composing the surfaces

Status: PASS — the journeys were driven, by the owner, on an enabled deployment

Story: `CF-P7-013`, under `P7-G4` authorized by the owner on 2026-07-26

## Deployment

| Field | Value |
|---|---|
| Deployment | `b2520460-8d70-4f83-972b-bc31f56f5a3a` |
| Source commit | `1ef0b06` |
| Branch | `codex-cf-p3-preview` |
| URL | `https://b2520460.docvault-qa-document-hub.pages.dev` |

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

## The journeys, driven by the owner (2026-07-28)

Everything above was measured against a deployment with collaboration switched
off, which is why this record said PARTIAL for two days. It is now PASS, and the
distinction matters: what changed is not that a gate was persuaded, but that a
person signed in to their own GitHub account and used the thing.

No agent could do this and none did. Obtaining an OAuth session means entering
credentials at github.com. Every step below was performed by the owner in their
own browser; the corroboration is read-only SQL against the Preview D1 database,
which is evidence an agent can gather but not manufacture.

| Journey | Surface | What the database shows |
|---|---|---|
| Sign in with GitHub | `account-menu` | `GET /api/v1/session` answered `authenticated: true` with the owner's login; the chrome rendered it. |
| Register this device | `device-key-initialization` | `devices`: 9 rows, 1 active and 8 revoked. Each registration generated a P-256 pair in the browser, sent only the public JWK, and re-bound the local key onto the server's device id. |
| Create a workspace | `create-workspace` | `workspaces`: 7 created through this UI, each at `current_key_version` 1 with its creator as sole member. `audit_events`: `workspace.created` x10. |
| Revoke this device | `device-key-initialization` | `devices`: 8 rows in state `revoked`. Server first, local key second. |
| Switch workspace | `workspace-switcher` | Owner-reported: the context indicator **and the panel below it** both moved to the newly selected workspace. |

**The envelopes are the part that could not have been faked.**
`workspace_key_envelopes` holds 10 unrevoked rows. Each was sealed in the
browser by `js/collaboration/workspace-key-envelope.js` — a hand-written port of
`functions/_lib/e2ee/primitives.ts`, written because the client bundle has no
build step to compile the server's TypeScript through — and each was accepted by
the server's own parser and stored. A single wrong byte in the AAD, the HKDF
`info`, or the canonical JSON would have been refused. The port and the original
agree on live data, not only in a round-trip test.

## What was not qualified, and is not claimed

| Journey | Why |
|---|---|
| Invite someone and have them accept | Not attempted; it needs a second real GitHub account. This database does contain `invitation.created` and `invitation.accepted` rows — they are from the `CF-P6-008` and `G2-G3` qualification runs of earlier phases, and nothing here claims them. |
| Resolve a conflict | Not reachable: it needs two devices editing one document at once, and the document surfaces are not Phase 7's. |

## What driving it actually found

Seven defects, every one of them invisible to the whole test suite beforehand and
every one found only because a real session existed:

1. `resolveSession` read a `{data, meta}` envelope for a route that answers
   unenveloped, so `authenticated` was **always** false regardless of the
   server's answer — the signed-in path had never once been exercised.
2. `beginSignIn` had the same defect, and crashed on `null.authorizationUrl`.
3. Every mutation sent with no body omitted `Content-Type` and was refused 415;
   this is all three of revoke-device, revoke-invitation and sign-out.
4. The acting-device header the server requires was never sent.
5. `create-workspace` reads `device.status` and `device-initialization` reads
   `device.state`; the entry set only one, so a registered device looked absent.
6. The create-workspace submit control could never enable, because the only thing
   that told its model the typed name was submitting — which the disabled control
   prevented.
7. The member list refused every row: it read a `keyReadiness` field the route
   does not send, and the server reports a boolean `keyReady`.

Each is fixed, tested against the shape the server actually returns, and pushed.
The pattern is worth naming: five of the seven are the same mistake — a fixture
written to match what the client assumed, rather than what the server sends — and
a suite made only of such fixtures agrees with itself forever.
