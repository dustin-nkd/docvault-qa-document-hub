# CF-EV-P7-UI-007 Invitation acceptance

Status: PASS

Story: `CF-P7-008` — surface `invitation-accept`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/invitation-accept.js` | fragment reader, review states, acceptance |
| `config/cloudflare/phase-7-invitation-accept.json` | the frozen claim |
| `scripts/cloudflare-phase-7-accept-policy.mjs` | the gate |
| `tests/collaboration-invitation-accept.test.mjs` | 32 unit tests |
| `tests/cloudflare-phase-7-accept-policy.test.mjs` | 24 drift cases |

## The token, while it is in the address bar

This is the one surface where the secret is briefly somewhere the user can see,
a browser can remember, and an extension can read.

| Property | Result |
|---|---|
| Read from | the fragment only, matching `#/invite/<token>` |
| Address bar | overwritten in the same operation that reads the value |
| Order | cleared **before** the token is returned, so no caller can fail with it on screen |
| History | `replaceState` only; `pushState` absent from the whole module |
| Sent as | a POST body field, never a path or query |
| Persisted | nowhere — no storage, cookie, cache, log, or beacon |

`replaceState` rather than a push is the load-bearing choice: a pushed entry
would leave the token in the back stack, where Back would restore it into the
address bar long after the invitation was accepted.

The gate does not merely read the source for this — it **runs** the reader with a
fake location and history, and asserts the replacement URL no longer contains the
token, and that an ordinary page load with no invitation fragment does not rewrite
the address bar at all.

## The four review states

| State | Actionable | What it says |
|---|---|---|
| `pending` | yes | the workspace, the role, and when it expires |
| `expired` | no | invitations last 72 hours; ask for a new one |
| `revoked` | no | the inviter cancelled it |
| `consumed` | no | already used once; tell the owner if that was not you |

A mismatched GitHub identity is named before submit — "This invitation was sent
to octocat. Sign in as that account to accept it." — rather than letting the
server refuse it afterwards.

## What acceptance actually gets you

`InvitationAcceptRequest` carries a device id, and success creates a
`pending_key` membership that conveys **no usable key**. Both facts are on screen
before the choice is made: accepting without a device is blocked with a route to
the device journey, and the surface states that joining puts you in the workspace
but not yet able to open its documents until an owner or admin provisions the
key to this device.

A response claiming any membership state other than `pending_key` is refused
rather than trusted, because pretending otherwise would strand the user in a
workspace they cannot read.

## Gate

```
Cloudflare Phase 7 invitation acceptance gate passed
  CF-P7-008: PASS; P7-G3A authorizes CF-P7-009 only
  The token leaves the address bar before any caller can see it
  History is replaced, never pushed, so Back cannot restore the token
  Only a pending invitation is actionable; the other three explain themselves
  Acceptance says up front that it grants membership, not a usable key
```

## Not evidenced

The fragment reader is exercised against a fake `location` and `history` rather
than a real navigation; a live acceptance against Preview belongs to CF-P7-013,
which is gated behind `P7-G4`.
