# CF-EV-P7-E2E-003 — CF-P7R-003 delivery closure

Status: **PASS**

Ticket: `CF-P7R-003`

Delivered implementation commit: `14c8ac6370bb35b1810adf6db72c44e58f86abc9`

Recorded: 2026-07-29

## Outcome

The rendered invitation `Revoke` control now dispatches only from the exact
`invitation-manage` surface and exact invitation row. One in-flight guard blocks
duplicate submissions. The existing invitation service supplies a fresh
idempotency key and the request client supplies the CSRF and acting-device
headers for the exact workspace and invitation DELETE.

Success refreshes the invitation list and removes the revoked row even if an
immediately stale read returns it. Refusal preserves the row, announces the
server reason, and permits a deliberate retry with a fresh idempotency key.
Neither path clears an unrelated one-time invitation URL held in memory.

The action-reachability inventory records
`invitation-manage:revoke-invitation` as resolved.

## Review and verification

- AGY implementation review: APPROVE/PASS.
- Targeted suite: PASS, 203/203 tests.
- Composed-entry and browser action-to-request integration: PASS.
- Relevant Phase 7 invitation, API, dispatch, and Phase 4 invitation lifecycle
  gates: PASS.
- Full Node test suite: PASS, 1226/1226 tests.
- Full Cloudflare gate: PASS, including 35 Worker test files/246 tests and
  2 additional Worker test files/7 tests.
- GitHub Actions run
  `https://github.com/dustin-nkd/docvault-qa-document-hub/actions/runs/30460476557`:
  PASS for delivered implementation commit
  `14c8ac6370bb35b1810adf6db72c44e58f86abc9`.

## Preview smoke and owner live qualification

Cloudflare Pages identified the qualified Preview build as:

| Field | Value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Environment | Preview |
| Branch | `codex-cf-p3-preview-v2` |
| Source commit | `b070c147c52c0221cfc014aa9709a67dca7658a4` |
| Deployment | `632536d4-c099-4e2d-b351-46cce78baeee` |
| Direct URL | `https://632536d4.docvault-qa-document-hub.pages.dev` |
| Branch alias | `https://codex-cf-p3-preview-v2.docvault-qa-document-hub.pages.dev` |

GET-only checks returned matching direct/alias content for the qualified runtime
bundle:

| Path | SHA-256 |
|---|---|
| `/` | `1faedc3e77ffd0f209ba5a1616f47be19bdf148ef588c129a3942c7f9060d394` |
| `/js/collaboration/entry.js` | `3af85af31345f533039129e878c7bd1dfc1b0cf215ebc5d1724ec44259d9fd1e` |
| `/js/collaboration/invitations.js` | `e0914a085928fe32ed50a8786b21c7d91ec25d67a9bb23f596b4702263bea87d` |
| `/js/collaboration/surface-panel.js` | `c952366b4868be3dc6af40b17423dc3f4c7075b1d7cb64963a37812769757469` |
| `/style.css` | `0c49a9c3df5dc9065e6dcd54baf4c840943056a54faac51fe45d7eb32aa439e6` |

The branch alias contained the R3 dispatch and single-flight markers. Anonymous
GET `/api/v1/session` returned 200 and anonymous GET `/api/v1/workspaces`
returned 401.

The Product Owner then opened the Preview in their own authenticated browser,
hard-refreshed the application, created or selected a disposable pending
invitation, activated its rendered `Revoke` control, and reported `Revoke OK`.
The required owner-driven live mutation qualification is therefore PASS.

## Privacy and mutation boundary

The agent used only GET requests for Preview smoke and did not possess or record
the authenticated browser state. The Product Owner performed the required
invitation revocation mutation explicitly in their own browser.

No invitation URL or token, invited identity, session cookie, CSRF token,
acting-device identifier, device private key, unlock secret, workspace key,
encrypted payload, workspace content, or production data is recorded here.
Production was not accessed or mutated. The evidence records only the owner's
PASS verdict and non-sensitive deployment metadata.
