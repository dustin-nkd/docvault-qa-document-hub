# Collaboration Foundation Phase 6 exit report

Status: **PARTIAL — seven of nine stories PASS; CF-P6-008 carries an open gap and Phase 6 does not exit at P6-G5**

Story: `CF-P6-009`
Authorization: `P6-G5` (not granted)

> Phase 6 delivered the shared document vertical slice end to end and proved it
> against a real database and a live Preview deployment. It does not close,
> because two of the six sprint gate scenarios were never exercised over Preview
> HTTP. That gap is stated here rather than absorbed, and section 5 is the
> honest condition for closing later.

## 1. Decision

- Phase 6 document slice on isolated Preview: **GO with a recorded gap**
- Phase 7 collaboration document UX: `GO` to plan only
- Collaboration activation: `NO-GO`
- Production identity, Production D1, Production document routes: `NO-GO`

Phase 6 built encrypted collaborative documents on the Phase 5 key foundation: a
provider boundary that leaves Personal Vault untouched, a versioned AEAD document
envelope, atomic mutations with append-only revisions and a 30-day idempotency
ledger, authorized reads with unforgeable pagination, an encrypted offline outbox
that never treats queued work as standing authority, and explicit conflict
resolution with a manual unlinked Copy to workspace.

## 2. Story completion

| Story | Scope | Exit gate | State |
|---|---|---|---|
| `CF-P6-001` | Contract, vector, and schema freeze | P6-G1 | PASS |
| `CF-P6-002` | StorageProvider abstraction and provider isolation | P6-G2 | PASS |
| `CF-P6-003` | Encrypted document envelope | P6-G2A | PASS |
| `CF-P6-004` | Atomic mutations, append-only revisions, idempotency | P6-G2B | PASS |
| `CF-P6-005` | Authorized reads and revision history | P6-G2C | PASS |
| `CF-P6-006` | Encrypted offline outbox | P6-G3 | PASS |
| `CF-P6-007` | Conflict resolution and Copy to workspace | P6-G3A | PASS |
| `CF-P6-008` | Preview integration and qualification | P6-G4A | **IN PROGRESS** |
| `CF-P6-009` | Exit and Phase 7 handoff | P6-G5 | **IN PROGRESS** |

Each of the seven passing stories ships its own automated gate wired into
`check:cloudflare`: `cf:phase6:{sprint,contract,provider,envelope,mutations,reads,outbox,conflict}:check`.

## 3. Sprint gate scenarios

| # | Scenario | Persistence layer (real D1) | Preview HTTP |
|---|---|---|---|
| G1 | Personal documents unchanged | ✅ `storage.js` zero-line diff | ✅ |
| G2 | Editor creates, Viewer reads | ✅ `CF-EV-P6-INT-002` | ❌ **not verified** |
| G3 | Viewer cannot write | ✅ `CF-EV-P6-INT-001` | ❌ **not verified** |
| G4 | Two writers, one base revision | ✅ `CF-EV-P6-INT-001` | ✅ 409/200, loser wrote nothing |
| G5 | Retry creates no duplicate revision | ✅ `CF-EV-P6-INT-001` | ✅ replay returned the original revision |
| G6 | Offline mutation replays correctly | ✅ `CF-EV-P6-INT-003` | ✅ reconcile route reported applied |

All six hold at the persistence layer against the same schema-12 database the
Preview runtime uses. Four are additionally confirmed over live HTTP.

## 4. What was verified remotely

Preview deployment `ea66d321-fd38-4e0c-bcc5-d30c8191f5d1` from commit `dd402b9`
serves all eight document routes. Unauthenticated, every route returns `401` and
none returns `404` or `405`. Every mutation returns `403` for a hostile Origin,
so origin and CSRF validation precede authentication. Production returns `503`
for both documents and session with zero D1 bindings, and GitHub Pages returns
`404`.

An authenticated journey with a real session, a real device, and a workspace
bootstrapped with a genuine 32-byte DEK produced the revision chain
`create, update, update, delete`, with a tombstoned document still serving its
historical revisions. Authenticated read p95 was 102 ms against a 300 ms budget,
network round trip included.

## 5. OPEN — the condition for closing Phase 6

**G2 and G3 were never exercised over Preview HTTP.** Both require a second
GitHub identity, because membership role is per user per workspace. Three
attempts to authenticate a second account failed at the OAuth callback with the
deliberately non-disclosing `auth-result=unavailable`; the transactions were
created but never consumed and the rate limiter stayed well below its ceiling.
The same callback succeeded for the first identity on the same deployment, so
the failure sits outside the Phase 6 code under test.

To close Phase 6 at `P6-G5`:

1. Authenticate a second GitHub identity against the Preview alias.
2. Add it to the qualification workspace as a Viewer.
3. Confirm the Viewer reads a document an Editor created (**G2**) and that a
   Viewer create, update, and tombstone are each denied with zero rows (**G3**).
4. Promote `CF-EV-P6-QA-004` from PARTIAL to PASS and set `CF-P6-008` to PASS.
5. Complete the Preview cleanup left partial in section 6.

Everything else is in place; this is a single sitting of work once a second
identity exists.

## 6. Remote state and cleanup

Cleanup is partial and recorded as such. The test document was tombstoned
through the product API rather than by editing the database, and one session was
logged out through the API. A device revoke returned `400` on a malformed body
after the session had closed and was not retried, and direct D1 writes were
refused by the permission classifier.

Remaining in the isolated Preview: one owner browser session (expiring at 12h
idle / 7d absolute), one active device, one workspace holding a single tombstoned
document, and four append-only revisions retained by design. Zero active
documents. Production holds no collaboration data and no D1 binding.

## 7. Identity provenance

The qualification session used the project owner's personal GitHub account, not
a designated synthetic identity as `operational-runbook.md` prescribes. The owner
was advised of this before proceeding and chose to continue. No evidence record
in Phase 6 describes that identity as synthetic. A future Phase 6 re-qualification
with synthetic identities is the honest way to satisfy the runbook.

## 8. Carried into Phase 7

[`phase-7-handoff.md`](phase-7-handoff.md) is the draft entry contract and
becomes controlling only when Phase 6 closes at `P6-G5`. Collaboration
activation, Production identity, Production D1, and Production document routes
remain `NO-GO`.
