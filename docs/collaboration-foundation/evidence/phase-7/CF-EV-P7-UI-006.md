# CF-EV-P7-UI-006 Invitation creation, copy, and revoke

Status: PASS

Story: `CF-P7-007` — surface `invitation-manage`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/invitations.js` | authority split, one-time URL holder, rendering, calls |
| `config/cloudflare/phase-7-invitations.json` | the frozen claim |
| `scripts/cloudflare-phase-7-invitation-policy.mjs` | the gate |
| `tests/collaboration-invitations.test.mjs` | 27 unit tests |
| `tests/cloudflare-phase-7-invitation-policy.test.mjs` | 23 drift cases |

## Authority, from the frozen matrix

| Actor | Invite admin | Invite editor/viewer | Revoke admin invitation |
|---|---|---|---|
| Owner | yes | yes | yes |
| Admin | **no** | yes | **no** |
| Editor | no | no | no |
| Viewer | no | no | no |

An owner cannot be invited at all. Every denial across create and revoke, for
every actor and target role, carries a reason of at least ten characters — the
gate sweeps the whole space rather than sampling it.

## The one-time link

| Property | Result |
|---|---|
| Rendered element | `input[readonly]`; zero anchors |
| Warning | `role="alert"`, "shown once and cannot be recovered" |
| Token outside the fragment | refused, `TOKEN_NOT_IN_FRAGMENT` |
| Any query string | refused, `TOKEN_MAY_NOT_REACH_A_QUERY_STRING` |
| Fragment too short to be a token | refused, `TOKEN_TOO_SHORT` |
| Read after `clear()` | throws `ACCEPTANCE_URL_CLEARED` |
| Blocked clipboard | reports the manual path and repeats the one-time warning |

## Presentation

Denied controls stay visible and disabled with an announced reason, and reason
ids are scoped per rendered instance — the collision CF-P7-006 found is not
repeated here.

## Gate

```
Cloudflare Phase 7 invitation gate passed
  CF-P7-007: PASS; P7-G3 authorizes CF-P7-008 only
  The one-time link never reaches storage, a log, a query string, or an anchor
  It is shown once, says so, and cannot be read after the caller clears it
  Only an owner invites or revokes an admin; every denial states a reason
```
