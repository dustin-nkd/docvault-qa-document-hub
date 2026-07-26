# CF-EV-P7-UI-010 Audit activity

Status: PASS

Story: `CF-P7-011` — surface `audit-activity`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/audit-activity.js` | projection, filter narrowing, access, rendering |
| `config/cloudflare/phase-7-audit-activity.json` | the frozen claim |
| `scripts/cloudflare-phase-7-audit-policy.mjs` | the gate |
| `tests/collaboration-audit-activity.test.mjs` | 24 unit tests |
| `tests/cloudflare-phase-7-audit-policy.test.mjs` | 22 drift cases |

## The projection refuses rather than trims

The audit log is where a leak would be least noticed: a stray field rendered
among fifteen legitimate ones does not look wrong. So each event is projected
onto the frozen 17-field `AuditEventView` allow-list, and an event carrying
**anything** outside it is **refused**, not trimmed.

Verified refused, one case each: `freeText`, `ciphertext`, `token`, `secret`,
`stack`, `sql`, `documentTitle`, `plaintext`. A drift case additionally proves a
projection that silently trims is rejected by the gate.

The rendered field set is compared against the contract's own fenced declaration
in `api-contract.md`, parsed from it rather than copied, so the two cannot drift
apart independently.

## Filters

Exactly three: `eventType`, `occurredFrom`, `occurredTo`. A content query is
refused outright — `q`, `search`, `text`, `contains` each raise
`UNSUPPORTED_FILTER`, and nothing is sent to the service. An audit log with a
content search would become an index over material the contract says the server
never holds in the clear.

## Restricted, not hidden

Owner and Admin only. An editor or viewer still sees the surface, with the
paginate control **visible, disabled, `aria-disabled="true"`**, and the reason
stated — the contract forbids hiding a restricted surface. A denied role receives
**zero** events in its model and cannot paginate even if a cursor is present.

An exhausted log and a denied one are explained differently: "There is no older
activity to show" versus "Only an owner or admin can read the workspace activity
log."

## Presentation

Event type, outcome, and time are exposed as data (`data-event-type`,
`data-outcome`, `<time datetime>`), and outcome carries a shape as well as a
colour. Cursors are opaque and HMAC-bound by CF-P6-005 — carried, never
constructed.

## Gate

```
Cloudflare Phase 7 audit activity gate passed
  CF-P7-011: PASS; P7-G3D authorizes CF-P7-012 only
  Every row is projected onto the frozen allow-list, and a stray field is refused
  Three filters only; a content query over the log is refused outright
  Restricted to owner and admin, explained rather than hidden from the rest
```
