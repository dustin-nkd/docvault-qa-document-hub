# CF-EV-P7-E2E-001 — CF-P7R-001 delivery closure

Status: **PASS**

Ticket: `CF-P7R-001`

Delivered commit: `19864f03a8819a5ff9bc5027f2521f8f9510108e`

Reviewed implementation commit: `6ff9b904ba2dba3e2a1c477c88e1e015052a994a`

Recorded: 2026-07-29

## Outcome

Current-device revocation and member-device revocation now have distinct DOM
actions. The destructive current-device dispatch also requires the
`device-key-initialization` surface. A member row cannot enter the current
browser's revocation lifecycle, and remote-device revocation stays visibly
disabled with an announced reason until `CF-P7R-006` owns its exact target
journey.

The action-reachability gate rejects a new enabled action unless it has a
composed handler or an exact owner in the sprint debt inventory.

## Review and verification

- AGY review: PASS for the implementation delivered in `6ff9b90`.
- Targeted, composed-entry, browser action-to-request, Phase 7 device/member/
  dispatch gates, and the full Cloudflare gate: PASS.
- Test-fixture lifecycle assumptions exposed only as the machine-readable plan
  progressed. The approved test-only repairs `33e32b2` and `19864f0` made every
  negative policy test construct its own prerequisite state and load immutable
  evidence for already-closed tickets. No product/runtime file changed in
  either repair.
- Local reproduction of the pipeline command, `npm run check`: PASS.
- GitHub Actions run
  `https://github.com/dustin-nkd/docvault-qa-document-hub/actions/runs/30454453394`:
  PASS on delivered commit `19864f0`, including full gates, artifact checks,
  browser regression, and GitHub Pages deployment.

## Read-only Preview smoke

Cloudflare Pages identified the measured build as:

| Field | Value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Environment | Preview |
| Branch | `codex-cf-p3-preview-v2` |
| Source commit | `d36f874db8b9af6678aeb509d0ed32934d937afa` |
| Deployment | `1f27b337-b713-483f-9cb3-cf23f1689022` |
| Direct URL | `https://1f27b337.docvault-qa-document-hub.pages.dev` |
| Branch alias | `https://codex-cf-p3-preview-v2.docvault-qa-document-hub.pages.dev` |

The Preview merge commit has the reviewed implementation commit `6ff9b90` and
first test-only repair `33e32b2` as ancestors. Delivered commit `19864f0`
changes only `tests/cloudflare-phase-7-wiring-sprint-policy.test.mjs`, which is
outside the deployment artifact; the served runtime bundle is unchanged.

GET-only bundle checks returned 200 from both origins for `/` and these runtime
modules:

| Module | SHA-256 |
|---|---|
| `js/collaboration/device-initialization.js` | `e1a4388a75e2068c0d7e5f04fcc9b83dc9e41dfe4d3bdd2cdafdf982ba7316b7` |
| `js/collaboration/member-list.js` | `c346d1c306a285b2d15839906b77e31479cfde18dd04dc44d9746efd160c9def` |
| `js/collaboration/entry.js` | `e7ab7374e2c0aa95129293d9a6d5c4f7405f00ba8c7d9849db56b7dd98b6d7b4` |

Direct and alias hashes matched for every checked path. The served modules
contained the distinct self/member action names, the member deferral reason,
the programmatic disabled guard, and the destructive surface guard.

On the branch alias, anonymous GET `/api/v1/session` returned 200 and anonymous
GET `/api/v1/workspaces` returned 401 `UNAUTHENTICATED`. This confirms the
user-facing Preview Functions boundary without a credential or mutation.

The hashed direct deployment URL returned 503 `COLLABORATION_UNAVAILABLE` on
both API reads while serving the same static bundle. This Pages runtime-binding
difference is recorded rather than hidden; it is not used to claim API parity.
CF-P7R-001 changes client action dispatch, requires no live mutation, and its
branch-alias boundary and exact served bundle both passed.

## Privacy and mutation boundary

Only unauthenticated GET requests were sent. No invitation token, cookie, CSRF
token, private key, unlock secret, workspace key, encrypted payload, or raw
request identifier was recorded. No deployment was retried, no environment was
changed, no database was queried, and no Preview or production mutation was
performed by the agent.
