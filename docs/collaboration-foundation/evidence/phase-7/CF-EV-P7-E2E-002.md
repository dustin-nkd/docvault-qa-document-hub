# CF-EV-P7-E2E-002 — CF-P7R-002 delivery closure

Status: **PASS**

Ticket: `CF-P7R-002`

Delivered implementation commit: `dfc36c7e039ae0737c0217a593e198768b7392b6`

Recorded: 2026-07-29

## Outcome

The rendered one-time invitation `Copy link` control now dispatches through the
injected Clipboard API boundary. It copies the exact URL held in memory without
navigation, logging, persistence, or a network request. A successful write
clears the holder and removes the URL and control; clipboard refusal or an
unavailable Clipboard API retains the readonly URL and announces the manual-copy
path. An in-flight guard prevents duplicate writes.

The action-reachability inventory records
`invitation-manage:copy-acceptance-link` as resolved.

## Review and verification

- AGY implementation review: APPROVE/PASS.
- Targeted suite: PASS, 69/69 tests.
- Composed-entry and browser action-to-request integration: PASS.
- Relevant Phase 7 invitation and dispatch gates: PASS.
- Full project test suite: PASS, 1221/1221 tests.
- Full Cloudflare gate: PASS, including 35 Worker test files/246 tests and
  2 additional Worker test files/7 tests.
- GitHub Actions run
  `https://github.com/dustin-nkd/docvault-qa-document-hub/actions/runs/30456380946`:
  PASS for delivered implementation commit
  `dfc36c7e039ae0737c0217a593e198768b7392b6`.

## Read-only Preview smoke and owner qualification

Cloudflare Pages identified the qualified Preview build as:

| Field | Value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Environment | Preview |
| Branch | `codex-cf-p3-preview-v2` |
| Source commit | `554b49690217cc5d6ba4cf7c5de9030230cb03a0` |
| Deployment | `0574d0fc-6016-43fa-a416-32d973c79715` |
| Direct URL | `https://0574d0fc.docvault-qa-document-hub.pages.dev` |
| Branch alias | `https://codex-cf-p3-preview-v2.docvault-qa-document-hub.pages.dev` |

GET-only checks returned matching direct/alias content for the qualified runtime
bundle:

| Path | SHA-256 |
|---|---|
| `/` | `1faedc3e77ffd0f209ba5a1616f47be19bdf148ef588c129a3942c7f9060d394` |
| `/js/collaboration/entry.js` | `f3094f779abc2b90809687f25871d8fc64cb720799225d8f7223f84c2aeb39a9` |
| `/js/collaboration/invitations.js` | `acb2b3d5c8be9d45f433233e2c7420f92aeed31fb345558f07ce0c451b018cd0` |
| `/js/collaboration/surface-panel.js` | `8a7d9d25ab5ce2f85d0bbeab87eb4773eb05d47486837c461945b8b9d1c4a461` |

On the branch alias, anonymous GET `/api/v1/session` returned 200 and anonymous
GET `/api/v1/workspaces` returned 401. The owner then opened the Preview,
hard-refreshed the application, verified the Collaboration and Invitations
surfaces, and reported `Preview OK`. Required owner live qualification is
therefore PASS. This ticket requires no live mutation.

## Privacy and mutation boundary

Only GET requests were used for agent qualification. No invitation URL or token,
session cookie, CSRF token, device private key, unlock secret, workspace key,
encrypted payload, or production data is recorded here. No invitation,
workspace, account, deployment, environment, or production state was mutated
during the read-only smoke check.
