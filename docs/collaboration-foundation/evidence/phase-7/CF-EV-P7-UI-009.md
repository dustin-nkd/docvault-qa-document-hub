# CF-EV-P7-UI-009 Conflict resolution dialog

Status: PASS

Story: `CF-P7-010` — surface `conflict-dialog`, gate UX `U4`

## What shipped

| Artefact | Role |
|---|---|
| `js/collaboration/conflict-dialog.js` | presentation, confirmation, focus |
| `js/collaboration/conflict-resolution.js` | the CF-P6-007 service, unchanged |
| `config/cloudflare/phase-7-conflict-dialog.json` | the frozen claim |
| `scripts/cloudflare-phase-7-conflict-policy.mjs` | the gate |
| `tests/collaboration-conflict-dialog.test.mjs` | 27 unit tests |
| `tests/cloudflare-phase-7-conflict-policy.test.mjs` | 26 drift cases |

## U4 — a draft is never lost

| Path | Draft |
|---|---|
| Dialog dismissed | kept; conflict stays `unresolved`, nothing is decided |
| Navigated away | kept; the outbox holds the queued mutation |
| Full reload | kept; the outbox is encrypted IndexedDB and quarantines rather than deletes |
| `review-latest` | kept |
| `reapply-to-latest` | kept |
| `save-as-separate-copy` | kept, as a new document at revision 1 |
| `discard-with-confirmation`, armed **and** confirmed | **the only path that drops it** |

Two separate acts are required to discard: arming, then confirming. The gate
drives each guard to its refusal rather than matching a pattern —
`DISCARD_NOT_ARMED`, then `DISCARD_NOT_CONFIRMED`, then `NO_DRAFT_TO_DISCARD`
when nothing is held.

## Survival is the outbox's property, not the dialog's

The dialog does **not** hold the draft. Persistence across a reload belongs to
CF-P6-006, which keeps the queued mutation encrypted in IndexedDB and quarantines
rather than deletes on every authority change. A dialog that stashed its own copy
would be a second, unreviewed persistence path for plaintext user work.

So the dialog *checks* whether a draft is held and **withholds the destructive
option** when it cannot see one, rather than offering it on faith. The gate
rejects `localStorage`, `sessionStorage`, `indexedDB`, `caches.`, and
`document.cookie` anywhere in the module — one drift case per API.

## No automatic merge

`automaticMergeOffered` is `false` in the model, and asking for one calls through
to the service, which refuses with `AUTOMATIC_MERGE_PROHIBITED`. The gate proves
both: it calls the request and asserts the refusal, and it checks the service
still contains the refusal.

## Every choice states its consequence first

| Resolution | What it says |
|---|---|
| Review the latest version | your draft is kept and nothing is sent |
| Reapply my changes | puts your draft on the latest version; **nothing is merged for you** |
| Save mine as a separate document | keeps both; yours becomes a new document at revision 1 |
| Discard my draft | throws it away; **this cannot be undone** |

Each consequence is a DOM text node referenced by the choice's
`aria-describedby`, with ids scoped per rendered instance.

## Gate

```
Cloudflare Phase 7 conflict dialog gate passed
  CF-P7-010: PASS; P7-G3C authorizes CF-P7-011 only
  U4 held: dismissing decides nothing and the draft is kept
  Discarding needs arming and confirming, and is withheld without a held draft
  No automatic merge is offered, and the service refuses one
  The dialog opens no persistence path of its own
```

## Not evidenced

Draft survival across a **real** browser reload is asserted structurally here —
the dialog opens no storage of its own, and the outbox that does hold the draft
was qualified against real IndexedDB in three browsers by CF-P6-006. An
end-to-end reload with a live conflict belongs to CF-P7-013 under `P7-G4`.
