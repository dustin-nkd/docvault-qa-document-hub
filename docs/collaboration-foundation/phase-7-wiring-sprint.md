# Collaboration Foundation Phase 7 remediation sprint — UI-to-backend wiring

Status: **READY — `CF-P7R-001` only**

Machine-readable plan:
[`phase-7-wiring-sprint-plan.json`](../../config/cloudflare/phase-7-wiring-sprint-plan.json).

This is sprint `CF-P7-S02`, owned by Phase 7. It does not grant `P7-G5`,
open Phase 8, authorize an agent to mutate Preview, or change production.

## Goal and baseline

Every enabled Collaboration control must be truthful: a user action either
reaches its intended effect through the composed entry under behavioral tests,
or is disabled with an accessible explanation. A rendered action name and an
isolated journey test are not delivery evidence.

The product baseline is commit
`0597f5c2e79078083581edb92d6e103a468a88a2`. Existing unrelated working-tree
changes remain outside this sprint.

## Sequential review and commit protocol

Only one ticket may be active.

1. Implement only the active ticket and record targeted, composed-entry,
   browser-behavior, relevant phase-gate, and full Cloudflare verification.
2. Report behavior, tests, and exact files to AGY. No implementation commit is
   allowed before AGY PASS.
3. After PASS, make one implementation commit and push it immediately.
4. Wait for its pipeline and perform a read-only Preview deployment/bundle
   smoke. A live mutation is performed only by the owner after an explicit
   request when the ticket marks it required.
5. A second, metadata-only closure commit is allowed to record immutable commit,
   pipeline, smoke, owner qualification, redacted evidence, ticket PASS, and the
   next ticket. It may contain no product/runtime change.
6. The next ticket starts only after the closure commit's pipeline is green.

The metadata-only closure exception avoids an impossible circular rule: pipeline
and deployment results do not exist until after the implementation commit is
pushed. AGY is an AI code reviewer and is recorded with
`independent_review: false`.

Evidence must redact invitation tokens, cookies, CSRF values, private keys,
unlock secrets, workspace DEKs, and raw encrypted payloads.

## Ordered tickets

| Ticket | Scope | Gate | Initial state |
|---|---|---|---|
| `CF-P7R-001` | Isolate current-device and member-device revocation; freeze the action-debt harness | `P7R-G0 → P7R-G1` | READY |
| `CF-P7R-002` | Wire one-time invitation Copy link | `P7R-G1 → P7R-G2` | BLOCKED |
| `CF-P7R-003` | Wire invitation Revoke | `P7R-G2 → P7R-G3` | BLOCKED |
| `CF-P7R-004` | Reconcile `{ token, deviceId }` and wire invitation Accept | `P7R-G3 → P7R-G4` | BLOCKED |
| `CF-P7R-005` | Wire Sign out without touching device keys | `P7R-G4 → P7R-G5` | BLOCKED |
| `CF-P7R-006` | Reconcile and wire all six member administration/device/key actions | `P7R-G5 → P7R-G6` | BLOCKED |
| `CF-P7R-007` | Wire Audit activity pagination | `P7R-G6 → P7R-G7` | BLOCKED |
| `CF-P7R-008` | Close remaining enabled-action debt and record the absent document-provider boundary | `P7R-G7 → P7R-G8` | BLOCKED |

## Scope decisions

### `CF-P7R-001` — safety first

The member row cannot reach `revokeThisDevice()`, clear the current actor device,
or destroy its local key. Member-device revocation stays visibly disabled until
ticket 6 has an exact remote target journey. Ticket 1 also creates the debt-aware
reachability harness: known debt may only decrease, and new unowned enabled
actions fail the gate.

### `CF-P7R-002` and `CF-P7R-003` — one action per review

Copy and Revoke remain separate tickets. Copy has no network effect and owns the
clipboard/manual fallback. Revoke owns the idempotent DELETE, in-flight guard,
row refresh, and retryable refusal.

### `CF-P7R-004` — preserve the frozen acceptance contract

The official request remains `{ token, deviceId }`. Runtime acceptance must
verify the body device equals the authenticated acting-device header. The token
is removed before paint and never persists. Success creates only `pending_key`.

### `CF-P7R-005` — session only

Sign out forgets session/CSRF state only after server success and never invokes a
device lifecycle or deletes key material.

### `CF-P7R-006` — explicit XL contract and crypto ticket

This is more than adding click handlers. It owns formal API and UI contract
reconciliation for `roleVersion`, `expectedRoleVersion`, role choice, admin
revocation, `TRANSFER_OWNERSHIP`, stale refresh, and recent authentication. It
also owns a separate remote-device revocation journey and the missing
provisioning prerequisites: authorized target inventory, actor envelope unwrap,
in-memory DEK lifecycle, exact target wrap, and envelope PUT. Plaintext DEK
remains browser-only.

### `CF-P7R-007` — Audit only

The backend-issued cursor is carried unchanged, results append without
duplicates, in-flight clicks coalesce, errors retain the current page, and stale
responses cannot cross a workspace switch.

### `CF-P7R-008` — truthful boundary, not a hidden epic

There is no active Collaboration document provider in the frozen Phase 7 surface
inventory. This ticket therefore does not pretend that provider/outbox/conflict
mutations are wiring work. It closes the small workspace-create shortcut,
disables every otherwise-dead conflict control with announced reasoning, and
stops claiming Saved from fixed placeholder inputs. The provider, encrypted
outbox, live Saving/Offline/Conflict states, reload resume, and conflict
mutations are recorded for a separately approved sprint.

## Evidence and exit

Each ticket owns `CF-EV-P7-E2E-00n` under
`docs/collaboration-foundation/evidence/phase-7/`. A ticket cannot PASS until its
verification is PASS, AGY review is PASS, implementation commit is pushed,
pipeline and read-only Preview smoke are PASS, required owner live qualification
is PASS, evidence exists and says PASS, and all action debt assigned to that
ticket is resolved.

`P7R-G8` requires all eight tickets PASS, no current ticket, zero enabled
unhandled controls, and the missing document-provider state recorded as deferred.
It does not grant Phase 8 entry.
