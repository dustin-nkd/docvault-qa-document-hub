# CF-EV-P7-UI-008 Sync state model

Status: PASS

Story: `CF-P7-009` — surface `sync-state`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/sync-state.js` | derivation, presentation, recovery reporting, rendering |
| `config/cloudflare/phase-7-sync-state.json` | the frozen claim |
| `scripts/cloudflare-phase-7-sync-policy.mjs` | the gate |
| `tests/collaboration-sync-state.test.mjs` | 28 unit tests |
| `tests/cloudflare-phase-7-sync-policy.test.mjs` | 24 drift cases |

## Exactly five, each with its own shape

| State | Shape | Announced | Terminal |
|---|---|---|---|
| Saved | filled circle | polite | no |
| Saving | dashed circle, spinning | polite, `aria-busy` | no |
| Offline | slashed square | polite | no |
| Conflict | diamond | assertive | no |
| Access removed | triangle | assertive | **yes** |

Five states, five distinct shapes — the gate counts them and fails if two
collide, because a shared shape leaves colour as the only difference.

## The rule that protects a non-disclosing API

`Access removed` is the hardest state in the contract. The API returns
`RESOURCE_NOT_FOUND` whether or not the resource exists, precisely so a stranger
cannot probe for workspaces. Claiming "your access was removed" from that status
code alone would undo the property — the message itself would confirm the
resource exists.

So the state requires **both** a denial **and** a completed membership re-check
reporting the user is no longer active. The gate exercises the derivation on
every branch rather than reading the source:

| Evidence | Result |
|---|---|
| `RESOURCE_NOT_FOUND`, no re-check | not access-removed |
| `OPERATION_NOT_PERMITTED`, no re-check | not access-removed |
| denial + re-check `checked: false` | not access-removed |
| denial + re-check says still a member | not access-removed |
| denial + completed re-check says removed | **access-removed** |
| the above, plus an inflight queue | **access-removed** — terminal outranks busy |

The state is terminal for the open document and says so: recovery is re-entry
through the workspace switcher, and the detail text states that retrying will not
help.

## The outbox is a different axis

The outbox has six states; this model has five, and they are not the same axis.
`expired` and `quarantined` are **not** sync states — they are recovery
situations, reported separately, each saying the queued work is *kept, not
discarded*. A quarantined entry derives `Saved`, not `Saving` and not an error:
flattening it would hide a queue that needs a person to look at it.

The outbox vocabulary is imported from CF-P6-006 rather than restated, and the
gate rejects a second copy.

## Gate

```
Cloudflare Phase 7 sync state gate passed
  CF-P7-009: PASS; P7-G3B authorizes CF-P7-010 only
  Exactly five states, each with its own shape, none left to colour
  Access removed needs a completed membership re-check, never a status code
  Expired and quarantined stay recovery situations, not a flattened error
```

## Not evidenced

Reaching `Access removed` against a live workspace — a membership revoked while a
document is open — belongs to CF-P7-013 under `P7-G4`. Here the derivation is
proven against constructed evidence on every branch.
