# Collaboration Foundation Phase 9 sprint — Controlled production rollout

Status: **PLANNED — awaiting `P9-G0`**

Entry: `P8-G5`. Phase 9 does not open on a declaration that Phase 8 finished; it
opens when Phase 8's exit gate script exists and passes inside
`check:cloudflare`. Phase 9 additionally requires that the Preview qualification
carried open at the Phase 7 exit was actually completed rather than closed on
paper. `CF-P7-013` was **NOT PASS** and `P7-G5` was **not granted** when
[`phase-7-exit-report.md`](phase-7-exit-report.md) was drafted; every rung below
stands on a Preview journey that really ran, so `CF-P9-001` reconciles that state
first and stops the sprint if it did not.

Two inherited facts are restated so they are not reset by accident. Preview
qualification in Phases 6 and 7 used **two real GitHub accounts belonging to the
project owner**, not the synthetic identities
[`operational-runbook.md`](operational-runbook.md) prescribes, and Phase 9 must
not describe that evidence as synthetic. Preview cleanup is deliberately partial
— revisions and audit rows are append-only by trigger, there is no workspace
delete route, and residue remains. Phase 9 inherits that residue.

## Governing principle

Phase 9 adds **no** new product capability. No route, no role, no sync state, no
conflict resolution, no error code, no server-visible document field. It is the
ladder from a qualified Preview build to a production service, and almost every
rung of that ladder is a control rather than a feature.

There are exactly **two** exceptions, and they are named here rather than
discovered later, because a governing principle with unstated exceptions is how
the first draft of this plan ended up assigning nobody the work the ladder
depends on.

1. **The runtime is unpinned from Preview** (`CF-P9-002`). The shipped
   collaboration and identity runtimes are compiled against a single Preview
   origin, a single cookie name, and a `preview-only` mode literal. Production
   cannot serve a collaboration route under any flag value until that changes.
   The change adds no behaviour: the same guards are resolved from environment
   configuration instead of a compiled-in constant, and Preview's behaviour is
   required to be unchanged bit for bit.
2. **The accepted limitations become visible to users** (`CF-P9-006`).
   [`risk-register.md`](risk-register.md) §5 requires it before production, and
   it cannot be satisfied without one new surface. That makes it the thirteenth
   surface in a UI contract frozen at twelve, so it takes a recorded decision and
   an amended contract check, exactly as the contract itself demands.

The third thing Phase 9 adds is the ability to turn collaboration on and off for
a named set of workspaces without a deployment — because a rollout whose only
lever is a rebuild is not reversible on any timescale that matters. That is a
control, not a feature.

Production has never held a byte of collaboration data. From `P9-G4` onward it
does. That single change moves several accepted limitations from documents into
real users' lives, and the plan treats it that way.

## Four facts about the shipped code that this plan is built on

The first draft of this sprint assumed the deployed artifact was production
capable and only switched off. It is not. Four properties of the code as it
stands today govern the whole ladder. Two are defects and two are deliberate
Preview controls; all four are load-bearing, and none of them can be flagged
away.

**1. The runtime is compiled against the Preview origin.**
`functions/_lib/identity/environment.ts` line 38 fixes
`const PREVIEW_ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev'`.
Lines 70–71 enable identity only when `mode === 'preview-only'`,
`APP_ENV === 'preview'`, and `options.requestOrigin === PREVIEW_ORIGIN`. Line 79
fixes the session cookie at `'__Host-docvault-preview-session'`.
`handlePreviewCollaborationApi` and `handlePreviewKeyFoundationApi` both return
`null` unless the mode is `preview-only` and `url.origin === PREVIEW_ORIGIN` —
the guards are at `functions/_lib/collaboration/runtime-handler.ts` line 605 and
`functions/_lib/collaboration/key-runtime-handler.ts` line 681, and the second
additionally requires `env.KEY_FOUNDATION_MODE === 'preview-only'`.
A production deployment of today's code answers every collaboration route from
the disabled shell, whatever the variables say. Rungs 4 through 8 describe a
deployment that cannot exist until `CF-P9-002` ships.

**2. The collaboration flag reads inverted.** The only functional read of the
variable in `functions/` is `environment.ts` line 67:

```ts
if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'false') {
    return { enabled: false, mode: 'disabled' };
}
```

The runtime enables identity only when the variable is the literal string
`'false'`. Preview has carried `'true'` since `D-P7-01`, so identity, sessions,
and every collaboration route have been disabled on Preview since the decision
that was meant to enable them. That is the most economical explanation for
`CF-P7-013` never reaching PASS, and it must be confirmed or ruled out before any
of this plan's Preview work is believed. Setting production to `'true'` would
disable production the same way. `CF-P9-002` fixes the read forward; the plan
does not work around it.

**3. The production burst limiter does not exist.**
`functions/_lib/identity/runtime-handler.ts` line 248 is unconditional on the
OAuth callback path: `if (!subjects || !env.AUTH_BURST_SERVICE) throw new
Error('IDENTITY_CONFIGURATION_INVALID')`. `AUTH_BURST_SERVICE` is bound only
under `env.preview` in `wrangler.jsonc`, to the service
`docvault-identity-burst-preview` defined by `wrangler.identity-burst.jsonc`.
Without a production Worker and a production service binding, the first
production sign-in fails closed. The Worker is an owner-provisioned production
resource, it is listed as one, and it sits behind `P9-G4B`.

**4. The designated-identity allowlist is mandatory, not optional.** On the same
line, `subjects` comes from `allowedSubjects(env.PREVIEW_ALLOWED_GITHUB_SUBJECTS)`
(lines 147–153), which returns `null` when the variable is absent, malformed,
longer than 512 bytes, longer than ten entries, or contains a duplicate. A
production origin with no designated-identity allowlist rejects every sign-in.
The first draft of this plan stated that the allowlist "is not copied to
production" because two overlapping allowlists would mean neither is
authoritative. That reasoning was wrong on the facts: the code makes the
allowlist a precondition, not an alternative. Production carries a designated
allowlist for the whole of Phase 9, and removing it — which is what open sign-up
means — is deferred with its reason at the end of this document.

`CF-P9-002` owns 1, 2, and 4; `CF-P9-014` owns 3. Nothing later in the ladder is
authorized to discover these again.

## The rollout ladder

The owner's sequence is ten rungs. Each rung is owned by at least one story, and
no rung is owned by half a story. Where a rung takes more than one story, the
reason is given below the table — every split, not only the ones that were
obvious.

| # | Rung | Story |
|---|---|---|
| 1 | Deploy Preview with the preview database | CF-P9-011 |
| 2 | Internal alpha limited to the owner account | CF-P9-012 |
| 3 | Migration rehearsal and backup | CF-P9-009, CF-P9-013 |
| 4 | Deploy production code with the feature flag still off | CF-P9-014, CF-P9-015 |
| 5 | Smoke-test the production API | CF-P9-016 |
| 6 | Enable the flag for one trial workspace | CF-P9-017, CF-P9-018 |
| 7 | Watch auth errors, 403s, 409s, D1 errors, and latency | CF-P9-004, CF-P9-005, CF-P9-018 |
| 8 | Enable for all users | CF-P9-019 |
| 9 | Keep Personal Vault and GitHub Sync for at least one stability cycle | CF-P9-007, CF-P9-020 |
| 10 | Consider realtime and Durable Objects only after a stability gate | CF-P9-021 |

**Rung 3** is split because a rehearsal and a real backup are different acts: one
proves the procedure on a disposable database, the other takes a restore point on
the database that will hold real rows.

**Rung 4** is split because provisioning a production identity runtime and
deploying code that uses it are two external authorizations, and collapsing them
would let one approval carry the other.

**Rung 6** is split because [`operational-runbook.md`](operational-runbook.md)
§4.3 step 6 puts a synthetic canary against a dedicated non-customer workspace
*before* the cohort is enabled, and §5 fixes what that canary covers.
`CF-P9-017` runs it against a workspace created for the purpose and deleted from
service afterwards; `CF-P9-018` enables the trial workspace, which on this
project holds the owner's real documents. Merging them would make the first
functional exercise of production collaboration land on real data, which is
exactly what the runbook orders it not to do.

**Rung 7** is split three ways because instrumenting, automating, and observing
are three different acts with three different failure modes. `CF-P9-004` builds
the counters and the inline self-halt and proves them locally. `CF-P9-005` builds
the scheduled watcher, which is a separate deployable Worker and cannot live in
Pages Functions at all. `CF-P9-018` holds the window and is the only one of the
three that can fail for a reason that is not a code defect. A single story owning
all three could pass on two of them.

**Rung 9** is split because making a commitment machine-checkable and holding it
for thirty days are different work. `CF-P9-007` writes the characterization
baselines and the gate; `CF-P9-020` runs that gate on every commit in the cycle
and records the days. If one story owned both, the commitment would be asserted
at the start of the cycle and never re-measured inside it.

Seven stories carry no rung: `CF-P9-001`, `CF-P9-002`, `CF-P9-003`, `CF-P9-006`,
`CF-P9-008`, `CF-P9-010`, and `CF-P9-022`. They are the contract freeze, the
runtime that makes production reachable at all, the switch the ladder is climbed
with, the disclosure `risk-register.md` §5 requires, the proof that the flag is
off, the procedure for abandoning the phase after real data exists, and the exit.
They are not ladder rungs; they are what makes the rungs possible and reversible.

## Stories

| Story | Title | Entry | Authorization | Exit |
|---|---|---|---|---|
| CF-P9-001 | Freeze the rollout contract, watch list, thresholds, rollback matrix, and release record | P9-G0 | — | P9-G1 |
| CF-P9-002 | Environment-parameterized runtime and the corrected collaboration flag | P9-G1 | — | P9-G1A |
| CF-P9-003 | Workspace activation cohort, kill switch, observation counters, and migration `0013` | P9-G1A | — | P9-G1B |
| CF-P9-004 | Watch-list instrumentation, halt thresholds, and the inline self-halt | P9-G1B | — | P9-G1C |
| CF-P9-005 | The scheduled watcher Worker, built and proven locally | P9-G1C | — | P9-G1D |
| CF-P9-006 | Accepted-limitation disclosure surface | P9-G1D | — | P9-G1E |
| CF-P9-007 | Personal Vault and GitHub Sync compatibility commitment and baselines | P9-G1E | — | P9-G1F |
| CF-P9-008 | Proof that production collaboration is off | P9-G1F | — | P9-G2 |
| CF-P9-009 | Migration rehearsal and restore rehearsal at schema 13 | P9-G2 | — | P9-G2A |
| CF-P9-010 | Abandonment and data-disposition procedure | P9-G2A | — | P9-G2B |
| CF-P9-011 | Preview deployment at schema 13 and re-qualification of the changed runtime | P9-G2B | **P9-G3** | P9-G3A |
| CF-P9-012 | Internal alpha on Preview and the Preview halt drill | P9-G3A | **P9-G3**, continuing | P9-G3B |
| CF-P9-013 | Provision the production database, migrate it, and back it up | P9-G3B | **P9-G4** | P9-G4A |
| CF-P9-014 | Provision the production identity runtime, the burst Worker, and the secrets | P9-G4A | **P9-G4B** | P9-G4C |
| CF-P9-015 | Deploy production code with collaboration off | P9-G4C | **P9-G4D** | P9-G4E |
| CF-P9-016 | Smoke the production API on the disabled surface | P9-G4E | **P9-G4F** | P9-G4G |
| CF-P9-017 | The production canary workspace, the watcher deployment, and the production halt drill | P9-G4G | **P9-G4H** | P9-G4J |
| CF-P9-018 | Enable one trial workspace, hold the watch window, and qualify the latency budgets on production | P9-G4J | **P9-G4K** | P9-G4L |
| CF-P9-019 | General availability, the fallback release gate, and the completed release record | P9-G4L | **P9-G4M** | P9-G4N |
| CF-P9-020 | The stability cycle, the compatibility hold, and the recurring operational checks | P9-G4N | **P9-G4P** | P9-G4Q |
| CF-P9-021 | The realtime stability gate | P9-G4Q | — | P9-G4R |
| CF-P9-022 | Assemble the Phase 9 exit and the Foundation closure record | P9-G4R | — | P9-G5 |

The chain is unbroken: the exit gate of story *n* is literally the entry gate of
story *n+1*, and no chain gate appears twice. The **Authorization** column is new
to this sprint table. Earlier phases had exactly one remote gate and could write
it into the entry column; Phase 9 has nine, so the two kinds of gate are given
two columns rather than being blurred into one. The form is the one Phase 6 used
per story — `Entry: P6-G3A; remote authorization: explicit P6-G4; Exit: P6-G4A` —
rendered as a table. No authorization gate is ever used as a chain gate, and no
chain gate ever authorizes anything remote.

`CF-P9-012` rides `P9-G3` rather than holding a gate of its own, and the table
says so rather than leaving the column empty. It performs no remote act that
`CF-P9-011` did not already perform: the same deployment, the same database, the
same identities. A separate authorization there would be theatre, and an empty
column would have implied a rung of live remote usage with no gate at all.

There is no `P9-G4I` and no `P9-G4O`. Both letters are skipped because `I` and
`1`, and `O` and `0`, are indistinguishable in the banner lines these gates
print, and a gate name that can be misread in an audit trail is worth less than a
tidy sequence.

Each story ships an automated policy check wired into `check:cloudflare`, in the
pattern Phases 3 through 8 established: a runner
`scripts/check-cloudflare-phase-9-<slug>.mjs` that imports the shipped module and
drives it, a pure policy module `scripts/cloudflare-phase-9-<slug>-policy.mjs`, a
manifest `config/cloudflare/phase-9-<slug>.json`, and a drift test
`tests/cloudflare-phase-9-<slug>-policy.test.mjs`. A story is not PASS on
assertion; **it is PASS when its gate script exists and passes.** The twenty-two
scripts are
`cf:phase9:{contract,runtime,cohort,watch,watcher,disclosure,compat,flag-off,rehearsal,abandon,preview,alpha,prod-d1,prod-identity,prod-deploy,prod-smoke,canary,trial,ga,stability,realtime,exit}:check`,
plus `cf:phase9:sprint:check` for this plan. All are appended to
`check:cloudflare` and pinned in order by `scripts/cloudflare-ci-policy.mjs`.

### Notes on the harder stories

**CF-P9-001 — The contract freeze, and two inherited miscounts it must resolve.**
Beyond freezing the watch list, the thresholds, the rollback matrix, the release
record, and the evidence IDs, this story owns two numbers that earlier documents
got wrong.

The first is the error catalog. `phase-7-sprint.md`, `phase-8-sprint.md`, and the
first draft of this plan all call it a thirty-code catalog. The table in
[`api-contract.md`](api-contract.md) §8 contains **29** rows: four at `400`,
three at `401`, four at `403`, and one each at `404`, `405`, `406`, `413`, `415`,
`422`, `429`, `500`, and `503`, plus nine at `409`. The contract itself is
correct; only the prose describing it is wrong. A gate written to assert "thirty"
would either fail or be written to an untrue number, so no Phase 9 gate asserts a
count. `cf:phase9:contract:check` asserts the **enumerated set** of codes,
derived from the contract document, and fails when a Phase 9 response carries a
code outside it.

The second is the inventory of assertions pinning `COLLABORATION_ENABLED` to
`'false'` for production. `D-P7-01` listed six sites and that list was accurate
when it was written. It is not accurate now: Phases 2 and 5 added more, and the
pin is also enforced structurally by `scripts/cloudflare-wrangler-policy.mjs`,
which asserts the production `vars` object with `exactKeys` and a `JSON.stringify`
equality against a literal — so adding *any* production variable fails
`cf:config:check`, the first gate in `check:cloudflare`. `CF-P9-001` therefore
derives the inventory mechanically over `scripts/`, publishes it in the manifest,
and its gate **re-derives it at run time** and fails when the manifest and the
tree disagree. A transcribed list is exactly the artifact that goes stale between
a plan and the commit that implements it.

**CF-P9-002 — Unpinning the runtime, without changing what it does.** This is the
only story in Phase 9 that edits shipped request-handling code, and its
governing constraint is that Preview behaviour must not move. The preview origin,
the preview cookie name, the preview identity mode, the preview key-foundation
mode, and the preview designated-identity allowlist stop being literals and
become an **environment profile** resolved from `APP_ENV`, with the preview
profile holding exactly the values the constants hold today. `PREVIEW_ORIGIN`
becomes `profile.origin`; `'__Host-docvault-preview-session'` becomes
`profile.cookieName`; `mode === 'preview-only'` becomes
`profile.collaborationRuntime === 'enabled'`.

The inverted flag read is fixed forward in the same story:
`COLLABORATION_ENABLED` enables when it is the literal `'true'` and disables on
every other value including absence, malformed input, and `'false'`. The gate
drives `resolveIdentityRuntime` with `'true'`, `'false'`, `undefined`, `'TRUE'`,
`' true'`, and an over-long string, and asserts the resulting configuration for
each. It does not read the source.

The easier option is a production-specific branch beside the preview one. It is
rejected: two branches means two code paths, and the one that is exercised least
is the one that will be wrong. One resolver with three profiles is exercised by
every local test on the local profile and by every Preview journey on the preview
profile, so the production profile inherits coverage rather than needing its own.

Nothing about this story is reachable from production until `CF-P9-015` deploys
and `P9-G4D` is granted. It ships production-*capable* code into a repository
where production still carries `COLLABORATION_ENABLED='false'`,
`IDENTITY_RUNTIME_MODE='disabled'`, and `KEY_FOUNDATION_MODE='disabled'`.

**CF-P9-003 — The activation cohort and the kill switch.** The easier
implementation is to flip `COLLABORATION_ENABLED` to `'true'` for production and
call the rollout finished. It is rejected for two reasons. It is all-or-nothing,
so there is no such thing as one trial workspace. And Pages binds environment
variables **at build time**, so switching it back requires a rebuild and a
redeploy — a rollback measured in a build, not in seconds. Phase 9 therefore
splits the switch in two: `COLLABORATION_ENABLED` and the two runtime-mode
variables decide whether the collaboration code path is *reachable* at all, and a
deny-closed D1 control decides *who* reaches it.

Migration `0013` is additive and forward-only, adds no column, index, or trigger
to any existing table, and creates three tables:

- `rollout_scope` — a single-row control with `mode IN ('none','cohort','all')`
  seeded to `'none'`.
- `rollout_activation` — one row per enabled workspace, with an actor, a server
  timestamp, and a `reason_code` bounded by a `CHECK` against a fixed vocabulary.
  It is **not** a free-text field. `ADR-005` fixes an exact allow-list of
  server-visible metadata and `R12` prohibits undeclared semantic metadata; a
  free-text reason column would be precisely that. The vocabulary follows the
  `retention_holds` and `workspace_key_rotations` precedent, which already carry
  bounded reason codes.
- `rollout_observations` — bounded per-window counters: window start, route
  family, outcome class, request count, and five latency-bucket counts. This is
  the home for every number the watch list and the stability cycle claim. Without
  it those numbers have no storage, no retention, and no way to be counted twice
  by two observers and compared.

All three tables are server-visible metadata and none of them is in the approved
allow-list, so this story does not simply add them: it carries `D-P9-03`,
amending `ADR-005` and [`data-classification.md`](data-classification.md) with
their classification, their bounded fields, and their retention, in the same
commit as the migration.

Applying `0013` creates three empty tables. It changes behaviour only where the
cohort resolver runs, and the resolver denies by default. That is asserted rather
than argued: the gate applies `0013` to a disposable schema-13 database, drives
the resolver with no `rollout_scope` row at all, with a row at `'none'`, with a
row at `'cohort'` and no matching activation, and with a row at `'cohort'` and a
matching activation, and asserts `503 COLLABORATION_UNAVAILABLE` for the first
three and a pass for the fourth.

**CF-P9-003 — what migration `0013` collides with, and what it does not.** This
is a closed-phase collision of the same class `D-P7-01` handled for the flag, and
it gets the same treatment: `D-P9-02`, applied in the same commit, never as a
follow-up.

`scripts/cloudflare-phase-2-migration-policy.mjs` fails on the commit that adds
`0013` at five specific places: `entries.length === 12` (line 83); the
per-sequence authorization branch that currently treats sequence 12 as the
terminal case (lines 84–111); the `expectedTables` chain (lines 119–124); the
`rollback_class` allowance (line 128); and the assertion at line 172 that the set
of tables discovered in the migration SQL equals the set in `frozenColumns` — a
new `CREATE TABLE` that is not added to `frozenColumns` with its exact column
list fails there. `migrations/manifest.json` gains one entry carrying `sha256`,
`normalized_bytes`, the filename short digest, and `previous_sha256` chained to
`0012`.

What does **not** change is the Phase 2 schema-freeze digest.
`migration_set_digest` is derived from `identifier_profile`, `tables`,
`migration_sequence`, and `prohibited_patterns` in
`config/cloudflare/phase-2-schema-freeze.json`, and migration `0001` embeds it as
a literal. That migration is immutable, so the freeze cannot be extended.
It does not need to be: migrations `0008` through `0012` already added seven
tables outside the Phase 2 freeze without touching the digest, and `0013` follows
that precedent. `cf:phase2:schema:check` is unaffected. The recorded schema-12
observations in the Phase 5 and Phase 6 exit records are historical statements
about a past database and are **not** edited; Phase 9 records its own.

**CF-P9-004 and CF-P9-005 — The automatic halt, and where it lives.** DocVault is
a single-maintainer project. There is no on-call rotation, no second pager, and
no defensible response-time commitment, so a watch list that ends in "someone is
notified" is not a control. The halt must fire without a human. Two paths do
that.

An **inline self-halt** (`CF-P9-004`) sets `rollout_scope.mode = 'none'` inside
the request that detects a failure which must never happen even once: an
authorization decision succeeding where the frozen matrix denies it, a second
business mutation from one client mutation ID, a revision-chain discontinuity, a
privacy-canary field reaching a log, or a plaintext canary.

A **scheduled watcher** (`CF-P9-005`) sets the same row when a threshold is
breached. It cannot live in Pages Functions: `wrangler.jsonc` declares a Pages
project through `pages_build_output_dir`, and Pages Functions have no scheduled
handler. The watcher is therefore a **separate deployable Cloudflare Worker**,
`docvault-rollout-watcher-production`, defined by `wrangler.rollout-watcher.jsonc`
in the pattern `wrangler.identity-burst.jsonc` already establishes: its own
config, its own build, its own type check, its own gate. It carries a `crons`
trigger at five minutes, a production `COLLAB_DB` binding, and write access to
`rollout_scope` and nothing else. `CF-P9-005` builds it and proves it against a
local disposable D1 with an injected clock; it is not deployed until `CF-P9-017`
under `P9-G4H`. It is listed in the owner actions and in the topology table as a
production resource, because that is what it is.

A false positive on either path disables collaboration for everyone and leaves
Personal Vault untouched; that is the correct failure direction and it is stated
here so nobody later treats it as a bug.

A signal that cannot be measured automatically is **not** a halt condition. It is
converted into a constraint on exposure instead: if a rate can only be read by
hand from the provider dashboard, the cohort stays where it is until it can be
read by machine. This rule exists so the watch list cannot quietly become a list
of things nobody is watching.

**CF-P9-006 — The disclosure surface, and why it needs a decision.**
[`risk-register.md`](risk-register.md) §5 requires six accepted limitations to be
visible in product UX and documentation, and §3 enumerates them: the server
cannot inspect encrypted semantics reliably (`R08`); all-provisioners-lost is
terminal (`R09`); old keys and prior copies cannot be revoked (`R10`); a
compromised unlocked endpoint defeats E2EE (`R11`); minimal metadata remains
visible (`R12`); and provider outage may make collaboration sign-in and
onboarding unavailable without affecting Personal Vault or guest mode (`R20`).
All six, not four.

[`phase-7-ui-contract.md`](phase-7-ui-contract.md) is FROZEN at twelve surfaces
and states that a surface may not be added as an implementation detail — it takes
a new story, a recorded reason, and a passing `cf:phase7:contract:check`. This is
that story. `D-P9-04` records the reason, the contract moves to thirteen
surfaces, and `cf:phase7:contract:check` is amended in the same commit. The
surface renders the six limitations in text, is reachable from the account menu
without a workspace, and meets the frozen accessibility and responsive baselines.
Its gate boots it and asserts all six texts are present and announced; it does
not grep for them.

**CF-P9-008 — Proving the flag is off.** Reading `wrangler.jsonc` proves what the
repository intends, not what the deployment does. Phase 7 learned that the hard
way: the collaboration modules were absent from the deployed artifact while every
gate that read source was green, because `build-pages.mjs` collected only what
`index.html` referenced and the lazy design means it references none of them. Any
Phase 9 claim about production is therefore measured **on** the production
deployment, against a recorded deployment ID, and the gate fails when the
transcript's deployment ID does not match the manifest's.

**CF-P9-010 — Abandonment.** "We would just delete it" is not a procedure, and by
the trial rung there is real data that only the user's own devices can decrypt.
The obligations are written before the data exists, because a procedure drafted
during an abandonment is drafted under pressure by the person who least wants to
write it.

**CF-P9-011 — Why Preview is qualified a second time.** Phase 8's `CF-P8-015`
already qualified the ten scenarios and the two latency budgets on Preview, and
`P8-G5` is this phase's entry condition. A second qualification would add nothing
if the runtime were unchanged. It is not unchanged. `CF-P9-002` replaces the
origin, cookie, and mode literals every request passes through, and `CF-P9-003`
inserts a cohort resolver in front of every collaboration route. Both changes sit
on the code path that every Phase 8 scenario ran through, so this is a regression
proof of a changed runtime, not a second opinion about an unchanged one. It
extends `cf:phase7:preview:check` and `config/cloudflare/phase-7-preview-integration.json`
and the Phase 8 preview manifest rather than writing a third preview harness.

It also does the thing the first draft of this plan got backwards. `CF-P9-003`
installs a control seeded to `'none'`, which denies everyone — including the
Preview qualification that the next rung depends on. So `CF-P9-011` writes the
Preview `rollout_scope` row at `'cohort'` and the Preview `rollout_activation`
rows for the qualification workspaces, **through the same authenticated path the
production trial will use**. That is not a workaround; it is the first exercise
of the activation mechanism, and it happens where a mistake is cheap.

**CF-P9-013 — The production database.** Production D1 is currently `NO-GO` and
has no binding. This story creates it, applies migrations `0001` through `0013`,
and takes the first Time Travel bookmark — and it does all of that **before** any
code binds it, which is why it is a separate rung from the deployment. It also
settles an uncomfortable point: a D1 export contains ciphertext the operator
cannot read *and* the complete membership graph, roles, timestamps, and sizes
that `ADR-005` deliberately leaves server-visible. An operator backup is
therefore a privacy asset even though it is unreadable, and is handled as one.

**CF-P9-017 — The canary workspace, which is not the trial workspace.**
[`operational-runbook.md`](operational-runbook.md) §5 fixes what the production
canary is: synthetic accounts, a dedicated workspace, non-sensitive encrypted
fixtures, unique canary markers, and coverage of sign-in and session validation,
workspace read, invitation lifecycle, device and envelope lookup, one encrypted
document create/update/conflict/replay path, audit retrieval, and cleanup. This
story runs that, in that order, against a workspace created for the canary and
holding nothing else.

One part of the runbook contract cannot be honoured and is recorded as a
deviation rather than quietly substituted. The identities are the project owner's
real GitHub accounts, because creating and maintaining synthetic GitHub accounts
is an account-policy decision outside this sprint's authority — the same fact
Phases 6, 7, and 8 recorded. The workspace is dedicated and non-customer, the
fixtures are non-sensitive, and the markers are unique; the accounts are not
synthetic. `D-P9-05` records that deviation from an approved runbook, because
[`implementation-plan.md`](implementation-plan.md) §13 requires a discovered
contract conflict to stop the dependent work and produce a decision-log
amendment. Stating a deviation plainly in a sprint plan is not the same as
recording it, and the first draft of this plan did the former while claiming the
latter.

This story also deploys the watcher Worker and drills both halt paths on
production against the canary workspace, before any real data exists.

**CF-P9-018 — One trial workspace.** The trial cohort is exactly one workspace,
and on this project that workspace belongs to the owner. That is stated plainly
rather than dressed up as a customer canary. It also creates a measurement
problem: one person's usage will not move a rate-based threshold, so a green
watch window would mean nothing. Two things follow. The window has volume floors
as well as a duration and does not close early. And the watch list runs in its
low-volume regime, where halts are absolute counts rather than rates — see **The
watch list** below, where the first draft's arithmetic failure is corrected in
full.

This is also the only story that qualifies the two production latency budgets. It
runs a bounded, authorized load pass against the trial workspace inside the
frozen rate tiers — 120 requests per user per minute, 300 per IP per minute, 60
document mutations per user per minute — until it holds at least 200 read samples
and 200 write samples, and only then claims a p95. A `429` during that pass is a
result to record, not a knob to turn. Holding those two budgets on production is
an entry condition for `P9-G4M`, because Phase 8 measured them on Preview and a
budget measured somewhere else is not the budget that was written down.

**CF-P9-021 — The stability gate.** A gate that cannot fail is decoration. This
one has to be able to say no, so its thresholds are numeric, its window resets to
zero on any breach rather than averaging the breach away, and it requires
evidence that the system was actually used during the window. It emits its gate
with one of three verdicts, and all three emit — see **The stability gate** for
why an unmeasured cycle must still close the chain. Its PASS authorizes **writing
a Phase 10 plan** and nothing else. `DL-006` defers Durable Objects and R2 for
Foundation and says they are revisited "only through a new approved phase"; Phase
9 does not amend that, it satisfies its precondition.

## Separately authorized gates

Nine gates in this sprint are not granted by a passing script. They are owner
decisions, recorded in [`decision-log.md`](decision-log.md) before the work
starts, in the pattern of `P6-G4`, `P7-G4`, and `D-P7-01`.

| Gate | Authorizes | Explicitly does not authorize |
|---|---|---|
| `P9-G3` | Deploying to Preview at schema 13, writing Preview `rollout_scope` and `rollout_activation` rows, qualifying journeys, and the Preview halt drill | Any production resource, binding, secret, or deployment |
| `P9-G4` | Creating the production D1 database, applying migrations `0001`–`0013`, and taking the first Time Travel bookmark | Binding it to Pages, deploying code, or enabling anything |
| `P9-G4B` | Creating the production GitHub OAuth application, provisioning production secrets, and deploying the production identity burst-limiter Worker | Deploying Pages code that uses them, or enabling collaboration |
| `P9-G4D` | Deploying production code with the production D1 binding present, `COLLABORATION_ENABLED='false'`, `IDENTITY_RUNTIME_MODE='disabled'`, and `KEY_FOUNDATION_MODE='disabled'` | Enabling collaboration for any workspace |
| `P9-G4F` | Probing the deployed production API read-only over HTTP, **and one read-only `SELECT COUNT(*)` per business table against the production database** | Any write, any activation, any cohort row, any row-level read |
| `P9-G4H` | `D-P9-01`: production reachability on, `rollout_scope.mode='cohort'`, exactly one `rollout_activation` row for the **canary** workspace, deploying the watcher Worker, and deliberate fault injection against the canary workspace for the halt drill | The trial workspace, real user data, or general availability |
| `P9-G4K` | Exactly one additional `rollout_activation` row for the **trial** workspace, and a bounded load pass inside the frozen rate tiers | More than one additional workspace, or general availability |
| `P9-G4M` | `rollout_scope.mode='all'` — general availability | Realtime, Durable Objects, export, hard purge, open sign-up, or any deferred surface |
| `P9-G4P` | A `wrangler d1 export` of the production database and the creation of a disposable database for the in-cycle restore rehearsal | Any write to production, or retention of the export beyond its stated deletion date |

`P9-G4H` carries the production halt drill explicitly. The first draft of this
plan promised to trip both halt paths on production and then authorized only the
activation row, leaving deliberate fault injection and a `rollout_scope` write
outside every gate. `P9-G4P` exists for the same reason: the in-cycle restore
rehearsal requires reading production data out of production, the plan itself
classifies that export as sensitive, and no earlier gate covers it.

No story before `CF-P9-011` may touch a deployed environment — including the
GitHub Pages origin. `CF-P9-007` proves the fallback's behaviour against a
locally served copy of the built `_site`, exactly as Phase 8's `CF-P8-012` did,
and the deployed-origin measurement is folded into `CF-P9-019`, where it is a
release gate. No story before `CF-P9-013` may touch production.

**No agent grants any of these gates.** An agent may prepare the change, write
the request, and run the checks; the authorization is a human decision recorded
outside the working tree, and each gate script fails when its manifest claims an
authorization whose decision-log entry does not exist.

## Decisions this sprint must record before it can proceed

[`implementation-plan.md`](implementation-plan.md) §13 requires a discovered
contract conflict to stop the dependent work and create a decision-log
amendment. Phase 9 discovers seven. Each is applied in the same commit as the
change it authorizes, so no window exists in which a contract and its gates
disagree — the pattern `D-P7-01` set.

| ID | Conflict | Amends | Blocks |
|---|---|---|---|
| `D-P9-01` | Production reachability: `COLLABORATION_ENABLED='true'`, `IDENTITY_RUNTIME_MODE='preview-only'` renamed and set for production, `KEY_FOUNDATION_MODE` set for production, and the production `vars` object gaining `GITHUB_OAUTH_CLIENT_ID` | The derived inventory of pins across `scripts/`, and `cloudflare-wrangler-policy.mjs`'s exact-object assertion | `CF-P9-017` |
| `D-P9-02` | Migration `0013` against the Phase 2 migration manifest | `cloudflare-phase-2-migration-policy.mjs`, `migrations/manifest.json`, `schema-contract.md` | `CF-P9-003` |
| `D-P9-03` | Three new server-visible tables outside the approved metadata allow-list | `ADR-005`, `data-classification.md` | `CF-P9-003` |
| `D-P9-04` | A thirteenth UI surface in a contract frozen at twelve | `phase-7-ui-contract.md`, `cf:phase7:contract:check` | `CF-P9-006` |
| `D-P9-05` | The production canary uses the owner's real GitHub accounts, not synthetic accounts | `operational-runbook.md` §5, as a recorded deviation | `CF-P9-017` |
| `D-P9-06` | The watch list evaluates counts below a stated volume and rates above it | `operational-runbook.md` §5 thresholds, which remain the ceiling and are never relaxed | `CF-P9-004` |
| `D-P9-07` | The stability-cycle volume floors are set to what a single-operator cohort can produce, and the verdict is bounded accordingly | `phase-8-sprint.md`'s load deferral | `CF-P9-021` |

`D-P9-01` needs a decision rather than an edit for exactly the reason `D-P7-01`
did. `D-P7-01` relaxed the pin for `preview` only and left production pinned;
`D-P9-01` relaxes production. After it, the boundary that replaces the old one is
not weaker, it is different: production reachability is on, and `rollout_scope`
is the thing that must be machine-enforced. `cf:phase9:cohort:check` takes over
the job those assertions were doing, and asserts that the default seeded mode is
`'none'` and that no code path can widen the cohort without an authenticated
actor and a bounded recorded reason code.

## Environment topology

| Environment | Maximum Phase 9 state | Collaboration behaviour |
|---|---|---|
| Local test | Disposable schema-13 D1, deterministic crypto/clock/ID seams | Full deterministic services, fault injection, no external network |
| Browser test | Disposable origin and storage, synthetic users/devices, locally served `_site` | Real Web Crypto and IndexedDB; supported-browser qualification; fallback measured here first |
| Preview before `P9-G3` | Existing preview D1 at schema 12 | Unchanged from Phase 8 |
| Preview after `P9-G3` | Preview D1 at schema 13; `rollout_scope='cohort'` with qualification activation rows; designated-identity allowlist still enforced | Real sessions; owner-held identities; no test bypass; residue inherited, not reset |
| Production before `P9-G4` | No D1 binding, no identity secret, all three runtime variables disabled | Disabled `503 COLLABORATION_UNAVAILABLE` shell |
| Production after `P9-G4` | Production D1 exists and is migrated, but is bound to nothing | Still `503`; no deployed code references the database |
| Production after `P9-G4B` | Production OAuth application, six secrets, and the burst-limiter Worker exist | Still `503`; nothing binds them |
| Production after `P9-G4D` | D1 bound, identity secrets present, all three runtime variables still disabled | Still `503`; binding present and provably unused |
| Production after `P9-G4H` | Runtime variables enabled, `mode='cohort'`, one canary activation row, watcher Worker deployed | Enabled for the canary workspace only; every other workspace `503` |
| Production after `P9-G4K` | Two activation rows: canary and trial | Enabled for those two only |
| Production after `P9-G4M` | `mode='all'` | General availability to designated identities |
| GitHub Pages | Static Personal/Guest fallback | No collaboration session, API, or imitation UI; the banner still says so |

Production carries its **own** designated-identity allowlist from `P9-G4B`
onward. The first draft of this plan left it out on the grounds that two
overlapping allowlists would mean neither is authoritative. The code settles the
argument: `runtime-handler.ts` line 248 throws
`IDENTITY_CONFIGURATION_INVALID` when the allowlist is absent, so a production
origin without one rejects every sign-in. The two controls are not overlapping;
they answer different questions. The allowlist decides **who may hold a session**
and the cohort decides **which workspaces are served**. General availability in
Phase 9 means every workspace of every designated identity. Removing the identity
allowlist is open sign-up, and it is deferred with its reason.

## Proving the flag is off

`CF-P9-008` establishes the proof and `CF-P9-016` executes it against the real
deployment. "Off" is claimed only when all five hold at the same commit and the
same deployment ID.

1. **Repository.** `wrangler.jsonc` pins `COLLABORATION_ENABLED: "false"`,
   `IDENTITY_RUNTIME_MODE: "disabled"`, and `KEY_FOUNDATION_MODE: "disabled"` in
   the top-level `vars` and in `env.production.vars`, and the derived inventory of
   assertions still enforces them. This is necessary and is not sufficient.
2. **Artifact.** `check-deployment-boundary.mjs` and
   `scripts/cloudflare-deployment-boundary-policy.mjs` inspect the built `_site`
   artifact, not the source tree, and confirm the production build carries no
   enabling value and no collaboration bootstrap on the personal startup path.
3. **Deployment.** Every collaboration route on the production origin answers
   `503 COLLABORATION_UNAVAILABLE` with the frozen error body, `no-store`, and no
   `Set-Cookie`, measured over HTTP against a recorded deployment ID by
   `scripts/smoke-production-boundaries.mjs`.
4. **Database.** After the smoke completes, the production database holds zero
   rows in every business table. This is one `SELECT COUNT(*)` per table and
   nothing else; it reads no row and no column value. `P9-G4F` authorizes exactly
   that and no more, because a gate boundary that is ambiguous about whether a
   database may be touched is a gate boundary that will be crossed.
5. **Crossover.** A valid preview session cookie presented to the production
   origin is rejected, and a production request never reaches the preview
   database. This closes `R17` on the only day it is cheap to close.

Evidence is valid only for that exact commit and deployment. A redeploy
invalidates it, including the configuration redeploy at `P9-G4H`, which is why
`CF-P9-017` re-runs the disabled-surface probe against every workspace outside
the cohort.

## The release record

[`operational-runbook.md`](operational-runbook.md) §3 requires eight items in
every release record. The first draft of this plan referred to "the release
record" three times as a place to put things and never defined it or assigned it
to a story. It is defined here, its schema is frozen by `CF-P9-001` in
`config/cloudflare/phase-9-release-record.json`, each production story appends
its own items, and `CF-P9-019` cannot pass until all eight are complete for the
general-availability deployment. It is a different artifact from the Phase 9 exit
record, which `CF-P9-022` assembles.

| # | Item | Appended by |
|---|---|---|
| 1 | Git commit and immutable Cloudflare deployment ID | CF-P9-015, then every later deployment |
| 2 | Approved change scope, risk level, feature-flag states, and migration identifiers | CF-P9-001, updated at each gate |
| 3 | Dependency-lock integrity and clean-install result | CF-P9-015 |
| 4 | Static, unit, integration, browser, security, accessibility, and performance results | CF-P9-011 for Preview, CF-P9-018 for production latency |
| 5 | Preview migration rehearsal and schema-integrity output | CF-P9-009, CF-P9-011 |
| 6 | Production pre-change D1 Time Travel bookmark and timestamp | CF-P9-013 |
| 7 | Canary results, request/error/latency comparison, and approvers | CF-P9-017, CF-P9-018 |
| 8 | Rollback owner, decision deadline, and final outcome | CF-P9-001 names the owner and deadline; CF-P9-019 records the outcome |

`cf:phase9:ga:check` fails when any of the eight is absent, when item 1's
deployment ID does not match the deployment the smoke measured, or when item 8
carries a decision deadline that has already passed.

## The watch list

The first draft of this plan set every threshold as a rate over rolling
five-minute windows with minimum denominators of 10 to 50 requests, while
authorizing a trial that produces roughly 200 authenticated requests over seven
days — about 0.1 requests per five-minute window. No window could ever reach any
denominator, so no rate signal could ever fire. That is not a conservative watch
list; it is a watch list that cannot observe anything. It is replaced by two
regimes with an explicit switch.

**Regime A — counts.** In force whenever the trailing hour holds fewer than 500
authenticated collaboration requests. This covers the canary, the alpha, and the
whole trial window. There are no rates and no denominators. Halts are absolute
counts, accumulated since the current rung opened, evaluated inline on every
request and by the watcher every five minutes.

**Regime B — rates.** In force whenever the trailing hour holds at least 500
authenticated collaboration requests. This is reachable only after general
availability. Rates are evaluated over rolling five-minute windows recomputed
every minute and ignored below the stated minimum denominator.

The regime in force is recorded in every `rollout_observations` window row.
`cf:phase9:watch:check` asserts that no rate threshold was ever evaluated below
its denominator and that no window was left unclassified. A window that recorded
no regime is a defect in the instrument, not a quiet pass.

**Regime B will probably never be in force during Phase 9, and that is stated
rather than glossed.** The stability cycle's own floor is 1,000 authenticated
requests over 30 days — about 33 a day, two orders of magnitude below the
500-per-hour switch. Regime B exists so the rate thresholds are already defined,
already agreed against the runbook, and already implemented when volume arrives;
it is not what protects this rollout. The count-based halts are. Any Phase 9
record that reports a green Regime B window has either found real traffic or has
an instrument defect, and the gate treats the second as more likely until the
request count is shown.

**The instrument.** Latency and outcome are measured **inside the Function**,
from the first line of the collaboration handler to the moment the `Response` is
returned, and written to `rollout_observations` as bucketed counts in the same
D1 batch that already runs for the request. The OAuth provider fetch is timed
separately and bucketed under `provider`; that is what "excluding provider
latency" means, and it is the only exclusion. Buckets are ≤ 150 ms, ≤ 300 ms,
≤ 500 ms, ≤ 1000 ms, and > 1000 ms. A p95 is claimed only over a trailing window
holding at least 200 samples; below that the record states the sample count, the
median bucket, and the maximum bucket, and claims no percentile. A p95 over
twenty samples is the second-largest sample, and reporting it as a percentile
would be the same category of overstatement this programme rejects elsewhere.

### Regime A — halts by count

| Signal | Measured as | Halt |
|---|---|---|
| Authorization defect | Any request succeeding where the frozen role matrix denies it, or any cross-workspace disclosure | **1 occurrence, immediately** |
| Duplicate mutation | Two business results from one `client_mutation_id`, or a revision-chain discontinuity | **1 occurrence, immediately** |
| Privacy canary | A forbidden field in any operational log, or a plaintext canary anywhere | **1 occurrence, immediately** |
| D1 integrity | Daily probe of ownership, revision continuity, envelope binding, and audit continuity | **1 failure, immediately** |
| Collaboration 5xx | `INTERNAL_ERROR` or an unclassified 5xx on any collaboration route | 3 in one hour, or 5 since the rung opened |
| Auth errors | `AUTHENTICATION_REQUIRED` + `SESSION_EXPIRED` + `REAUTHENTICATION_REQUIRED` + `CSRF_REJECTED` | 5 in one hour, or 10 since the rung opened |
| Authorization denials to a cohort member | `OPERATION_NOT_PERMITTED` + `DEVICE_NOT_AUTHORIZED` + `KEY_PROVISIONING_REQUIRED` | 5 in one hour |
| Idempotency misuse | `IDEMPOTENCY_KEY_REUSED` | 3 since the rung opened |
| Rate limiting | `RATE_LIMITED` outside the authorized load pass | 3 since the rung opened |
| Wrong-cohort `503` | `COLLABORATION_UNAVAILABLE` to a workspace inside the cohort, more than one cache TTL after its activation row was written | 3 since the rung opened — **freezes expansion, does not demote** |
| Revision conflicts | `DOCUMENT_REVISION_CONFLICT` | Not a halt. Recorded with counts; a conflict is the product working |
| Read and write latency | Bucketed counts | Not a halt. Recorded with counts, median bucket, and maximum bucket |

### Regime B — halts by rate

| Signal | Minimum denominator | Warn | Halt |
|---|---|---|---|
| Collaboration error rate, all 4xx-excluding-`404` and 5xx | 200 requests | ≥ 0.5% | **> 1.0% in one window** |
| Auth errors | 200 authenticated requests | ≥ 0.5% | ≥ 1.0% in two consecutive windows |
| Authorization denials | 200 workspace-scoped requests | ≥ 1.0% | ≥ 2.0% in two consecutive windows |
| Collaboration 5xx | 200 requests | ≥ 0.05% | ≥ 0.1% in two consecutive windows |
| Revision conflicts | 100 mutations | ≥ 3.0% | ≥ 10.0% in two consecutive windows |
| Idempotency misuse | 100 mutations | ≥ 0.5% | ≥ 2.0% in two consecutive windows |
| Rate limiting | 200 requests | ≥ 0.5% | ≥ 2.0% in two consecutive windows |
| Read latency p95 | 200 samples in the trailing hour | > 300 ms | > 450 ms in three consecutive windows |
| Write latency p95 | 200 samples in the trailing hour | > 500 ms | > 750 ms in three consecutive windows |
| Wrong-cohort `503` | 200 requests | any | ≥ 0.5% — **freezes expansion, does not demote** |

The Regime B collaboration error rate halts at **> 1.0% in one window** because
[`operational-runbook.md`](operational-runbook.md) §5 blocks or rolls back a
release on exactly that condition. An approved release gate is a ceiling. A
sprint plan may be stricter than it and may never be looser, and the first draft
of this plan was looser — warning at 1.0% and halting at 2.0% in two windows.
`D-P9-06` records the two-regime structure; it does not record a relaxation,
because there is none.

**The wrong-cohort `503` acts on expansion, not on the cohort.** Demoting the
cohort in response to an authorized workspace being wrongly denied would deny
*more* workspaces — the halt would make its own symptom worse. So that row
freezes expansion and pages, and every other row demotes. The row is also
excluded by construction for one full cache TTL after an activation row is
written, because up to 30 seconds of stale denial is the documented behaviour of
the cache, not a fault. The exclusion window is recorded in the observation row
so it cannot be widened silently.

**Who is paged.** The project owner, in the Operations role, is the only person
who can be paged, and there is no committed response time. That is why every row
above either halts by machine or is explicitly not a halt condition. The
notification exists so the owner learns what happened; it is not what stops the
rollout.

**What stops.** A halt stops *new* collaboration submissions for the affected
cohort. It does not sign anyone out, does not delete a queued outbox entry, does
not discard a local draft, and does not touch Personal Vault or GitHub Sync. D1
revisions and audit rows are append-only and survive every halt. Rollback never
silently discards an accepted mutation; anything accepted before the halt stays
accepted, and reconciliation, where required, is the idempotent replay path
already contracted in `ADR-006`.

**The halt is drilled before it is needed.** Both paths are tripped deliberately
on Preview under `P9-G3` in `CF-P9-012`, and once on production under `P9-G4H` in
`CF-P9-017` against the canary workspace, before the trial workspace exists. Each
drill records the cron invocation identifier or request identifier that wrote the
row, the row it wrote, and the measured time to effect. A kill switch that has
never been pulled is a claim, not a control.

## Rollback per rung

Every rung states what is undone, how, and how long it takes.

**How a time to effect is measured.** The **start event** is the moment the
operator issues the reversing command, taken from the operator's machine clock
and written into the release record. The **stop event** is the first observation
from the watcher's synthetic probe — a Cloudflare-side clock, independent of the
operator — showing the reversed state. The interval between them is the time to
effect. It is recorded by the release record, once at the rehearsal and once at
every real use. Nothing in this table is an estimate.

**Where a rehearsal would be destructive, it is rehearsed on a disposable
equivalent.** Two rungs cannot be rehearsed on the resource they install:
deleting the production database and revoking the production OAuth application
would destroy what the rung just provisioned. `CF-P9-013` rehearses deletion on a
disposable D1 created for the rehearsal, and `CF-P9-014` rehearses revocation on
a throwaway OAuth application. That is stated as an exception, because the first
draft of this plan promised that "each is rehearsed at the rung that installs it"
for two rungs where the promise could never be kept or falsified.

| Rung | What is undone | How | Time to effect | What is preserved |
|---|---|---|---|---|
| CF-P9-011 Preview deploy | The Preview deployment | Redeploy the previously recorded Preview deployment ID | ≤ 15 min | Preview D1 rows; append-only revisions and audit |
| CF-P9-012 Owner alpha | Alpha usage | Revoke the owner's preview session and device; leave the workspace | ≤ 5 min | All rows; the residue is inventoried, not deleted |
| CF-P9-013 Production database | The database's existence | It is bound to nothing and reachable by no code. Delete it only while it holds zero business rows; once it holds rows, `CF-P9-010` applies. Rehearsed on a disposable D1 | ≤ 10 min | Migrations `0001`–`0013` are immutable and are never edited or deleted |
| CF-P9-014 Production identity | The OAuth application, secrets, and burst Worker | Revoke the OAuth application; delete the Pages secrets; delete the Worker. Rehearsed on a throwaway application | ≤ 20 min | Nothing depends on them until `CF-P9-015` deploys |
| CF-P9-015 Production code deploy | The deployment | Cloudflare Pages rollback to the recorded previous deployment ID, through the existing `cf:rollback:rehearse` path | ≤ 10 min | Nothing to reconcile: the flag was off and that was proven, so no collaboration write exists |
| CF-P9-016 Production smoke | Nothing | The probe is read-only by construction | — | — |
| CF-P9-017 Canary activation | The canary workspace's access, and the watcher | Delete its `rollout_activation` row, or set `mode='none'`; the Worker is deleted separately | ≤ 60 s for access, ≤ 10 min for the Worker | The canary rows, which are deleted on their own schedule under §5 cleanup |
| CF-P9-018 Trial activation | The trial workspace's access | Delete its `rollout_activation` row, or set `rollout_scope.mode='none'` | ≤ 60 s, no deploy | Every revision, audit row, and local draft. If the code is at fault, add a Pages rollback (≤ 10 min) or a configuration redeploy pinning the runtime variables off (≤ 15 min) |
| CF-P9-019 General availability | Everyone's access beyond the cohort | Set `rollout_scope.mode='cohort'` | ≤ 60 s, no deploy | As above; users keep their data and their drafts |
| CF-P9-020 Stability cycle | The cycle's claim | The cycle resets to day zero; nothing is deployed or deleted | Immediate | — |
| CF-P9-021 Realtime gate | A verdict | Withdraw the verdict; no code exists to roll back | Immediate | — |

Two rules cut across the table. **A migration is never rolled back by editing it.**
Migrations `0001` through `0013` are immutable; a migration defect is disabled at
the write path and fixed forward under its own review, exactly as
[`operational-runbook.md`](operational-runbook.md) §6 requires. And **rollback
never promises erasure**: a member who already decrypted a document keeps that
copy, and `R10` remains an accepted limitation no lever in this table can undo.

Recovery objectives for the whole ladder are the ones already approved: **RPO ≤ 5
minutes, RTO ≤ 60 minutes** from a declared database incident to a verified
contained service or a documented degraded mode. Both are measured, and the
method for each is stated under **Data protection**.

## Data protection

Real user data appears at `P9-G4K` and never disappears again. These obligations
are executable, not aspirational, and each is checked by a named gate.

**Before any migration touches a database that could hold rows.** Record the
production D1 Time Travel bookmark and timestamp, and put both in the release
record as item 6. Verify the account plan's actual Time Travel window first —
Cloudflare documents 30 days on paid plans and 7 on free — because a restore
point outside the retention window is not a restore point. Time Travel is
provider-side and bounded, so it is a recovery mechanism, not a backup the
project owns.

**The operator backup.** `wrangler d1 export` produces ciphertext the operator
cannot read together with the complete membership graph, roles, device
fingerprints, timestamps, and sizes. Under
[`data-classification.md`](data-classification.md) that file is sensitive. It is
encrypted at rest, never enters the repository, CI artifacts, screenshots, or
issue trackers, carries a named owner and a stated deletion date, and its
existence is recorded in the release record. `cf:phase9:prod-d1:check` fails if
the manifest declares a backup with no retention date. Producing one after real
data exists requires `P9-G4P`.

**Restore rehearsal, and how RPO and RTO are measured.** Restore is rehearsed on
a **disposable** database created for the purpose, never in place on production,
and the rehearsal verifies schema, membership, envelopes, revision chains,
mutation uniqueness, and audit continuity before it is called a pass.

- **RTO** is the interval from the declared start of the rehearsal to the moment
  the verification above completes. It is measured with the operator's clock and
  written into the rehearsal record.
- **RPO** is the interval between the server timestamp of the last mutation the
  restore reproduces and the restore point itself. It is measured, not assumed,
  by writing a known sequence of timestamped mutations into the disposable
  database before the restore point and reading back which of them survive. This
  bounds the loss the provider's Time Travel granularity actually imposes, which
  is the only honest way to evidence a provider-side mechanism.

`CF-P9-009` rehearses before production exists; `CF-P9-020` rehearses again
inside the stability cycle under `P9-G4P`, because a restore procedure that
worked once six weeks ago against an empty database has not been shown to work.

**Restoring never restores a key.** A restored database does not restore a user's
unavailable decryption key and does not prove erasure from any member device.
Neither claim may appear in any Phase 9 record.

**If the phase is abandoned after real data exists.** `CF-P9-010` freezes this
procedure before the first real row, and its gate asserts every step has a named
owner and a stated duration.

1. Set `rollout_scope.mode='none'` for writes, but keep **reads** available for a
   stated wind-down window of at least 30 days.
2. Tell every affected member, truthfully and in advance, what is ending, when,
   and what they must do. The notice states plainly that the operator cannot
   decrypt their documents and cannot produce a readable copy for them.
3. The only path to a usable copy is the client, because it is the only thing
   holding the keys. Foundation has no export route — `409
   LIFECYCLE_POLICY_UNAVAILABLE` is deliberate — so the wind-down relies on the
   existing per-document read and the manual Copy path, and this plan does not
   pretend otherwise.
4. After the window, delete the production database, revoke the OAuth
   application, delete every production secret, delete the burst-limiter and
   watcher Workers, and unbind the database in a reviewed deployment. Record row
   counts and stable identifiers, never content.
5. Personal Vault documents are unaffected. A workspace document never had a
   personal counterpart unless the user deliberately made one.
6. Old copies already on member devices cannot be erased, and the notice must not
   imply they can.
7. Audit and revision rows are append-only. Partial deletion is not offered;
   deletion is of the whole database or of nothing.

## The compatibility commitment

Personal Vault and GitHub Sync remain fully functional, default, and independent
of collaboration for **at least one full stability cycle after general
availability**, and their removal is outside Foundation entirely. `CF-P9-007`
makes the commitment machine-checkable; `CF-P9-020` holds it for the cycle.

**What would violate it.** Removing, deprecating, or flag-gating any Personal
Vault capability — create, read, update, tombstone, export, unlock, or sync.
Making Personal Vault require a collaboration session, a network call, or the
Cloudflare origin. Making GitHub Sync depend on a workspace, a device key, or the
collaboration API client. Evaluating any collaboration module on Personal or
Guest startup. Routing a personal write through `CollaborationProvider`, or a
workspace write through `PersonalVaultProvider`. Breaking Personal Vault on the
GitHub Pages fallback. Relaxing the ten-case Personal Vault characterization
baseline. Interposing an upsell that blocks a personal journey.

**How it is machine-checked.** `tests/personal-vault-characterization.test.mjs`
stays at ten cases with unchanged assertions, and `cf:phase9:compat:check`
asserts both the case count and a hash of the file, so a relaxation is a gate
failure rather than a quiet edit. `tests/storage-provider-isolation.test.mjs`
holds zero personal writes across the collaboration matrix including every
injected failure path. `check-deployment-boundary.mjs` measures **zero**
collaboration modules on the personal startup graph of the built artifact, not
the source. A browser check boots the built `_site` **served locally** and
confirms Personal Vault works there with zero `/api/v1/*` requests over at least
sixty seconds spanning one reload and one visibility change, with the banner
present — the deployed GitHub Pages origin is measured later, in `CF-P9-019`,
where it is a release gate. And the gate itself imports both providers and drives
a collaboration call to its refusal, asserting no personal write occurs — it runs
the guard rather than grepping for it.

One gap is declared rather than discovered later: **GitHub Sync has no
characterization baseline.** The commitment names it, and nothing currently pins
it. `CF-P9-007` must create that baseline before it can claim the commitment is
checked, and its gate fails while the baseline is absent.

**The fallback is a release gate, not a footnote.**
[`implementation-plan.md`](implementation-plan.md) §12 makes "both Cloudflare
Pages collaboration mode and GitHub Pages personal fallback smoke tests pass" a
production release gate. `CF-P9-019` carries it as one: the fallback smoke runs
against the real deployed GitHub Pages origin at the general-availability commit,
and `P9-G4M` is not granted without it. The first draft of this plan carried it
only as a line inside the compatibility machinery, which is not a gate.

## Recurring operational checks and the post-rollout review

[`implementation-plan.md`](implementation-plan.md) §12 WP5 requires a completed
release record, a post-rollout review, and recurring operational checks.
[`operational-runbook.md`](operational-runbook.md) §11 enumerates them.
`CF-P9-020` owns installing them, not merely observing a 30-day window, and its
gate asserts each routine has a schedule, an owner, a machine-readable output,
and at least one recorded run inside the cycle.

| Cadence | Checks | Where it runs |
|---|---|---|
| Daily | Canary health and the collaboration error and latency budget; OAuth callback and session anomaly rate; D1 errors, capacity, and failed maintenance jobs; privacy canary and security alerts | The watcher Worker's daily pass, output to `rollout_observations` and the operations log |
| Per release | Config, binding, and secret inventory diff; dependency and migration diff; preview isolation and canary proof; production bookmark, deployment, smoke, and rollback evidence | The release record, asserted by `cf:phase9:ga:check` |
| Monthly | Secret and OAuth application ownership and rotation review; restore-window and Time Travel rehearsal in a non-production database; expired-record purge and retention-hold audit; browser, compatibility-date, dependency, and workload-budget review | A dated checklist in the operations inventory, with the first run inside the cycle |

The **post-rollout review** is a single dated record produced by `CF-P9-020`
naming what was rolled out, what the watch list observed, every halt and warn
that fired, every threshold that was never reachable at the observed volume, and
every deviation recorded under `D-P9-05` and `D-P9-07`. `cf:phase9:stability:check`
fails without it.

## Risk-register reconciliation

[`risk-register.md`](risk-register.md) §4.6 requires the register to be reviewed
at every phase gate, at every migration, and before every rollout expansion.
Phase 9 is almost nothing but rollout expansions, and the first draft reviewed
the register nowhere.

`CF-P9-001` opens the review and every authorization gate carries it as an entry
condition: `P9-G4`, `P9-G4H`, `P9-G4K`, and `P9-G4M` each require a dated
register review naming the risks whose exposure the expansion changes.
`cf:phase9:contract:check` and each production gate assert the review exists and
is newer than the previous expansion.

Three register changes are owned outright.

- **`R24` is opened by `CF-P9-001`** — real user data on a production service
  operated by one person with no on-call rotation. Contract owner: Product Owner.
  Evidence owner: Senior QA. Trigger: the first `rollout_activation` row for a
  workspace holding a document the owner did not create for a canary. The
  compensating control is the automatic halt, and the compensation is stated
  rather than assumed.
- **`R25` is opened by `CF-P9-005`** — the watcher is a single point of failure
  for every rate-based and count-based halt. Its indicator is a missing five-minute
  observation row. `CF-P9-017`'s drill is its evidence, and the inline self-halt
  is the control that does not depend on it.
- **`R23` is carried forward, not silently inherited.** Phase 8 opened it for
  designated Preview identities being build-time configuration. `CF-P9-011`
  depends on exactly that: the Preview allowlist must contain the qualification
  subjects **and the deployment serving them must have been built after the
  allowlist changed**. `CF-P9-014` extends `R23` to production, where the same
  property now holds for the production allowlist.

`CF-P9-022` reconciles the register at the exit and may not report a clean
register it has not earned. Specifically, `risk-register.md` §5 carries **three**
unchecked acceptance items, not one: the `Controlled pending evidence` linkage,
the `R10`–`R12` UX disclosure, and the no-skip and no-unowned-risk item.
`CF-P9-006` closes the second. The first and third are closed only if the
evidence exists, and the exit gate fails on a claim that they are closed without
it.

## The stability gate

`CF-P9-021` decides whether realtime and Durable Objects may even be planned. A
**stability cycle** is **30 consecutive days of general availability**, beginning
at the deployment recorded by `CF-P9-019`. Every row below must hold for the
whole cycle. Any breach resets the cycle to day zero; a cycle is not "mostly
green", and a breach is not averaged away.

| Metric | Threshold across the cycle |
|---|---|
| P0 defects | 0 |
| P1 defects | 0 |
| Watch-list halts fired | 0 |
| Rollbacks executed | 0 |
| Authenticated read p95, on days holding ≥ 200 read samples | ≤ 300 ms on every such day, and ≤ 450 ms on every day with ≥ 20 samples |
| Authenticated write p95, on days holding ≥ 200 write samples | ≤ 500 ms on every such day, and ≤ 750 ms on every day with ≥ 20 samples |
| Collaboration 5xx | 0 unexplained on any day; any 5xx is classified as a defect or recorded with a cause |
| `DOCUMENT_REVISION_CONFLICT` | ≤ 3% of mutations on days holding ≥ 100 mutations |
| Duplicate business mutations from one client mutation ID | 0 |
| Cross-workspace disclosures | 0 |
| D1 integrity probe | passes 30 of 30 days |
| Personal Vault characterization | 10 of 10 cases on every commit in the cycle |
| GitHub Sync characterization | baseline passes on every commit in the cycle |
| Unplanned collaboration unavailability | ≤ 30 minutes cumulative, measured as consecutive failed watcher probes × the five-minute probe interval |
| Restore rehearsal inside the cycle | ≥ 1, with RTO and RPO measured by the stated methods |
| Authenticated collaboration requests | ≥ 1,000 |
| Document mutations | ≥ 200 |
| Distinct active workspaces | ≥ 2 |
| Distinct identities performing a mutation | ≥ 2 |
| Distinct devices performing a mutation | ≥ 3 |

The last five rows are the falsifiability rows. Every metric above them is
trivially green on a system nobody uses, and Phase 7 already recorded the general
form of that mistake: a cross-cutting qualification that finds nothing is more
likely to be measuring nothing.

**The floors are set to what this cohort can actually produce.** The first draft
required three distinct workspaces and five distinct devices while the same
document fixed the trial cohort at one workspace and every identity in the
programme at two real GitHub accounts belonging to one person. No story recruits
a third party, so those floors were unreachable by construction and the phase
could never have closed. `D-P9-07` records the correction: two identities, two
workspaces, and three registered devices are reachable by the owner, and the
floors are set there.

The consequence is stated rather than hidden. **A single-operator cycle cannot
evidence multi-tenant concurrency.** A PASS from this gate is bounded by that,
and the gate's own record says so in those words. It authorizes writing a Phase
10 plan whose first work package is obtaining a multi-party cohort — not
building realtime.

**Three verdicts, and all three close the chain.** `CF-P9-021` is the sole
producer of `P9-G4R` and `CF-P9-022` is its sole consumer, so a verdict that
emits nothing would strand the phase with no alternative path, no re-run rule,
and no timeout. The gate therefore always emits `P9-G4R`, carrying exactly one
of:

- **PASS** — every row held and every floor was met. Authorizes writing a Phase
  10 plan.
- **FAIL** — a row was breached and the cycle reset to day zero more than twice,
  or a P0/P1 defect was found. Authorizes nothing. Phase 9 still closes.
- **UNMEASURED** — the cycle ran but a volume floor was not met. It is not a pass
  and it is not a fail; the gate says so in those words, names the floor that was
  missed and the value observed, and authorizes nothing. Phase 9 still closes.

An UNMEASURED verdict may be re-run once by extending the cycle by a further 30
days, at the owner's decision, recorded. It is not re-run automatically and it
does not block `CF-P9-022`. A phase that cannot close because a measurement was
inconclusive is a worse outcome than a phase that closes with an honest
inconclusive record.

## Rollout acceptance — the seven criteria

These decide whether Phase 9 closes. Each names the gate that observes it,
because a criterion with no observation procedure is a sentence, not a criterion.

**A1 — Production is off until it is deliberately turned on, and "off" is
measured.** Observed by `cf:phase9:flag-off:check` and `cf:phase9:prod-smoke:check`
against a recorded deployment ID. The claim rests on the deployed artifact, the
live origin, and a `SELECT COUNT(*)` per business table returning zero — never on
the repository alone.

**A2 — Every rung that installs a reversible change states its reversal, and the
reversal has been executed before it was needed.** Observed by the rollback
matrix's recorded times to effect in the release record. Two rungs install
nothing reversible — `CF-P9-016`, whose probe is read-only by construction, and
`CF-P9-021`, which produces a verdict and no code. They are named here rather
than counted, because a criterion that no observation could fail is not a
criterion. A third, `CF-P9-020`, installs only a claim; its reversal is the cycle
reset, which the gate executes itself on any breach and which is therefore
observable. Two further rungs are rehearsed on disposable equivalents and say so.

**A3 — The watch list halts without a human.** Observed by
`cf:phase9:watch:check` and `cf:phase9:watcher:check`. The inline path is driven
to each of its five refusals by the gate. The scheduled path is a named,
versioned, deployed Worker with a cron trigger, a D1 binding, and a drill in
`CF-P9-012` and `CF-P9-017` that records the invocation identifier and the row it
wrote. A missing five-minute observation row is itself a monitored signal, so the
watcher failing to exist is observable rather than assumed away.

**A4 — No accepted mutation is lost at any rung, and the check for that is
executable.** After every halt, rollback, and restore, a reconciliation reads
every `client_mutation_id` in `mutation_results` and every `document_revisions`
row for the affected interval and asserts a bijection: zero accepted mutations
without a revision, zero revisions without an accepted mutation record, and zero
gaps in a revision chain. Local encrypted drafts and queued outbox entries are
counted in the browser before and after the event and the counts must match.
Thresholds are all zero. The reconciliation runs read-only against production
under `P9-G4F` for the smoke and under `P9-G4P` for the in-cycle rehearsal, and
against the disposable database for every drill. "No user loses data" is not
observable; this is.

**A5 — Personal Vault and GitHub Sync are unaffected, and stay that way for a
full cycle.** Observed by `cf:phase9:compat:check` and `cf:phase9:stability:check`.
Zero collaboration modules on personal startup measured on the artifact, zero
personal writes from any collaboration path, two characterization baselines that
a change cannot relax without failing a gate, and a fallback smoke on the real
deployed origin as a release gate.

**A6 — The six accepted limitations are visible to real users before general
availability.** `R08` semantic inspection, `R09` terminal loss of all
provisioners, `R10` prior copies and old keys, `R11` a compromised unlocked
endpoint, `R12` server-visible metadata, and `R20` provider outage appear in the
product interface, not only in this repository. Owned by `CF-P9-006` under
`D-P9-04`, observed by `cf:phase9:disclosure:check`, which boots the surface and
asserts all six. It closes the second of the **three** unchecked
`risk-register.md` §5 acceptance items and claims nothing about the other two. It
is an entry condition for `P9-G4M`, not a follow-up.

**A7 — Every production-touching action was separately authorized and is
traceable.** Nine authorization gates, nine decision-log entries, seven recorded
decision amendments, and no agent granted any of them. Each production gate
script fails when its manifest names an authorization the decision log does not
contain.

## Quality budgets

| Budget | Limit | Measured on | Instrument | Behind a gate |
|---|---|---|---|---|
| Production authenticated read | p95 ≤ 300 ms over ≥ 200 samples | production | in-Function timing to `rollout_observations` | `P9-G4K` |
| Production authenticated write | p95 ≤ 500 ms over ≥ 200 samples | production | in-Function timing to `rollout_observations` | `P9-G4K` |
| Collaboration 5xx | Regime A: 0 unexplained per day. Regime B: ≤ 0.1% per 5-minute window over ≥ 200 requests | production | `rollout_observations` | `P9-G4H` |
| Collaboration error rate, Regime B | ≤ 1.0% per 5-minute window | production | `rollout_observations` | `P9-G4M` |
| Auth error rate, Regime B | ≤ 1.0% per 5-minute window over ≥ 200 requests | production | `rollout_observations` | `P9-G4M` |
| Authorization denial rate, Regime B | ≤ 2.0% per 5-minute window over ≥ 200 requests | production | `rollout_observations` | `P9-G4M` |
| Revision conflict rate | ≤ 3.0% of mutations on days with ≥ 100 mutations | production | `rollout_observations` | `P9-G4K` |
| Duplicate business mutation from one mutation ID | 0 | local D1, Preview, production | reconciliation query in A4 | no |
| Cross-workspace disclosure | 0 | local D1, Preview, production | authorization fuzz replay from `CF-P8-006` | no |
| Collaboration modules on Personal/Guest startup | 0 | built artifact and deployment | `check-deployment-boundary.mjs` | no |
| Collaboration startup ceiling | 75 KiB gzip | built artifact | `cf:phase9:compat:check` | no |
| Lazy Phase 9 chunk — the disclosure surface only | ≤ 60 KiB gzip | built artifact | `cf:phase9:disclosure:check` | no |
| Extra D1 statements per request for cohort resolution and observation | ≤ 1 read and ≤ 1 write | local D1 | counting stub driven by `cf:phase9:cohort:check` | no |
| Cohort cache TTL | ≤ 30 s | local D1 | resolver driven with an injected clock across the TTL boundary; the second read must re-query | no |
| Kill switch, cohort row to effect | ≤ 60 s | Preview, then production | start event to watcher-probe stop event, in the release record | `P9-G3`, `P9-G4H` |
| Pages rollback to the previous deployment | ≤ 10 min | production | start event to watcher-probe stop event, via `cf:rollback:rehearse` | `P9-G4D` |
| Configuration redeploy of the same commit | ≤ 15 min | production | start event to watcher-probe stop event | `P9-G4H` |
| RTO | ≤ 60 min | disposable D1 | rehearsal start to completed verification | `P9-G4P` for the in-cycle run |
| RPO | ≤ 5 min | disposable D1 | last reproduced mutation timestamp against the restore point | `P9-G4P` for the in-cycle run |
| Unplanned collaboration unavailability | ≤ 30 min cumulative per cycle | production | consecutive failed watcher probes × 5-minute interval | `P9-G4M` |
| Alpha cohort | exactly 1 account | Preview | `cf:phase9:alpha:check` | `P9-G3` |
| Canary cohort | exactly 1 dedicated non-customer workspace | production | `rollout_activation` row count | `P9-G4H` |
| Trial cohort | exactly 1 additional workspace | production | `rollout_activation` row count | `P9-G4K` |
| Trial watch window | ≥ 7 consecutive days, ≥ 200 authenticated requests, ≥ 50 mutations, ≥ 2 devices | production | `rollout_observations` counters, retained for the phase | `P9-G4K` |
| Stability cycle | 30 consecutive days, reset to zero on any breach | production | `rollout_observations` plus the daily integrity probe | `P9-G4M` |
| Migrations added by Phase 9 | exactly 1 — `0013`, additive, forward-only, three tables, no column on an existing table | repository | `cf:phase2:migrations:check` as amended by `D-P9-02` | no |
| Personal Vault characterization | 10 of 10 cases, assertions unchanged | repository | file hash plus case count | no |
| New error codes | 0 — the catalog stays at the 29 enumerated in `api-contract.md` §8 | repository | enumerated-set assertion, never a count | no |
| New sync states, conflict resolutions, outbox states, or roles | 0 | repository | `cf:phase7:contract:check` | no |
| New UI surfaces | exactly 1 — the disclosure surface, under `D-P9-04` | repository | `cf:phase7:contract:check` at thirteen surfaces | no |

Every budget names where it is measured and what measures it. The first draft's
table carried a limit and nothing else, which is the Phase 7 lesson this document
quotes elsewhere applied to itself.

Zero tolerance for P0/P1 skips, quarantines, disabled cases, conditional
omissions, accepted flakes, open defects, plaintext canaries, silent caps, silent
narrowings, vacuous assertions, empty scans, unmeasured deployment claims, a halt
condition with no automatic trigger, a threshold evaluated below its stated
denominator, a rollback with no measured time to effect, an authorization claimed
without a decision-log entry, a contract conflict resolved without a decision-log
amendment, and a stability cycle claimed without its volume floors.

## Declared coverage narrowings

Each is declared in the story manifest with its reason, printed by the harness at
run time, and asserted by the gate. None may be widened or narrowed silently.

- **Identities are the owner's real GitHub accounts, not synthetic.** Carried
  forward from Phases 6, 7, and 8, and recorded as a runbook deviation in
  `D-P9-05` rather than restated as a fact and left there.
- **The production canary honours three of the four §5 identity requirements.**
  Dedicated workspace, non-sensitive fixtures, and unique markers are honoured;
  synthetic accounts are not. `D-P9-05`.
- **The stability cycle is single-operator.** Volume floors are set to a
  single-operator cohort and the verdict is bounded. `D-P9-07`.
- **Latency percentiles are claimed only above 200 samples.** Below that the
  record states counts, median bucket, and maximum bucket and claims no
  percentile.
- **Regime A replaces rates with counts.** Below 500 authenticated requests per
  trailing hour, no rate is evaluated at all. `D-P9-06`.
- **Screen-reader evidence for the disclosure surface is automated plus
  keyboard.** One maintainer with one screen reader is a narrowed sample; the
  deferral below states why it is not upgraded here.

## Reused rather than rewritten

Phase 9 writes no second copy of any script, policy module, manifest, or suite
that already exists. Where an artifact covers a concern, the story extends it in
place and its gate asserts the manifest moved.

**Pinned baselines — must keep passing, must not be modified:**
`personal-vault-characterization.test.mjs` (10 cases),
`storage-provider-isolation.test.mjs`, `api-shell.test.mjs`,
`cloudflare-deployment-boundary.test.mjs`, `cloudflare-production-policy.test.mjs`,
`cloudflare-phase-2-recovery-policy.test.mjs`, `security-headers.test.mjs`,
`runtime-dependencies.test.mjs`, and every Phase 8 suite at its `P8-G5` state.

**Extended in place, not duplicated:**

| Story | Extends |
|---|---|
| CF-P9-002 | `functions/_lib/identity/environment.ts`, `identity/runtime-handler.ts`, `collaboration/runtime-handler.ts`, `collaboration/key-runtime-handler.ts`, and their existing Workers tests |
| CF-P9-003 | `migrations/manifest.json`, `scripts/cloudflare-phase-2-migration-policy.mjs`, `schema-contract.md` |
| CF-P9-005 | `wrangler.identity-burst.jsonc` and the `cf:burst:*` command pattern in `scripts/cloudflare-command.mjs`, as the template for a second Worker |
| CF-P9-007 | `tests/personal-vault-characterization.test.mjs`, `tests/storage-provider-isolation.test.mjs`, `tests/browser-smoke.mjs`, `scripts/check-deployment-boundary.mjs`, `scripts/cloudflare-deployment-boundary-policy.mjs` |
| CF-P9-008, CF-P9-016 | `scripts/smoke-production-boundaries.mjs`, `scripts/cloudflare-production-policy.mjs`, `tests/cloudflare-production-policy.test.mjs`, `tests/cloudflare-deployment-boundary.test.mjs`, `tests/api-shell.test.mjs` — the same files `CF-P8-008` extended |
| CF-P9-009, CF-P9-020 | `scripts/cloudflare-phase-2-recovery-policy.mjs`, `scripts/check-cloudflare-phase-2-recovery.mjs`, `config/cloudflare/phase-2-recovery-rehearsal.json`, `tests/cloudflare-phase-2-recovery-policy.test.mjs`, and the existing `cf:phase2:recovery:check` — `DL-032` already rehearsed Time Travel recovery on a disposable synthetic D1 and shipped the gate; Phase 9 raises it to schema 13, a populated fixture at the approved workload baseline, and measured RTO and RPO |
| CF-P9-011 | `config/cloudflare/phase-7-preview-integration.json`, `cf:phase7:preview:check`, and the Phase 8 preview qualification manifest |
| CF-P9-015 | `scripts/rehearse-cloudflare-rollback.mjs`, `scripts/cloudflare-rollback-policy.mjs`, `config/cloudflare/rollback-rehearsal.json`, and the existing `cf:rollback:rehearse`, which `DL-022` shipped and which already runs inside `check:cloudflare` |
| CF-P9-018 | The Phase 8 load driver and seeded workload fixture, run inside the frozen rate tiers |

**Genuinely new code** is limited to: the environment profile resolver, the
cohort resolver and its cache, the observation writer, the inline self-halt, the
watcher Worker and its wrangler configuration, the disclosure surface, the GitHub
Sync characterization baseline, the reconciliation query behind A4, and the
twenty-two gate scripts with their policy modules, manifests, and drift tests.
Nothing else.

## Boundaries

Unchanged and non-negotiable: no server-visible plaintext document content,
device private key, unlock secret, KEK, or workspace DEK; no automatic merge; no
server-side conflict resolution; no client-timestamp last-write-wins; no
automatic Personal Vault upload or mirroring; no personal-provider fallback when
a collaboration call fails; no silent draft discard; no deployed test or
authentication bypass; no real customer data in Preview; no edit to an applied
migration; no export route, hard purge, batch document API, server-side semantic
search, realtime co-editing, or recovery artifact. The frozen role matrix, the
29-code error taxonomy, the five sync states, the four conflict resolutions, the
six outbox states, and the four role names are rendered by Phase 9 and extended
by none of it.

Phase 9 adds exactly one UI surface and exactly one migration, both under
recorded decisions, both named in the budgets table, and both counted by a gate.
Anything beyond those two counts is out of scope by construction.

GitHub Pages remains a static Personal and Guest fallback and must still **say
so**. General availability does not change that: a user who lands on the fallback
origin after collaboration ships must still be told, in the banner, that
collaboration lives on the Cloudflare deployment.

Contract migrations — anything narrowing or destructive — are not in this phase.
They belong to a later release, after the old application version, the queued
mutation lifetime, and the rollback window no longer depend on the old shape, and
they require their own approval and their own restore rehearsal.

## Owner actions this sprint cannot perform

These are stated as requests, not performed. An agent has no credential that
should be able to do any of them, and a gate that claimed one had been done would
be lying about the only part of the phase that matters.

1. Create the production D1 database and record its name and identifier in the
   restricted operations inventory.
2. Create the production GitHub OAuth application and its callback.
3. Run `wrangler pages secret put` for `GITHUB_OAUTH_CLIENT_SECRET`,
   `SESSION_TOKEN_PEPPER`, `OAUTH_TRANSACTION_KEY`, `CSRF_TOKEN_KEY`,
   `RATE_LIMIT_KEY`, and `CURSOR_SIGNING_KEY` on the production environment.
4. **Deploy the production identity burst-limiter Worker** and bind it to Pages
   production as `AUTH_BURST_SERVICE`. Without it the OAuth callback throws
   `IDENTITY_CONFIGURATION_INVALID` and every production sign-in fails closed.
5. **Set the production designated-identity allowlist** variable. Without it
   `allowedSubjects` returns `null` and the same failure occurs.
6. **Deploy the rollout watcher Worker** with its cron trigger and its production
   `COLLAB_DB` binding.
7. Approve and record `D-P9-01` through `D-P9-07` in the decision log before any
   commit changes the production runtime variables, the migration manifest, the
   metadata allow-list, the UI contract, or the runbook canary contract.
8. Trigger each production deployment and record its immutable deployment ID.
9. Verify the account's actual D1 Time Travel retention window before the first
   production migration.
10. Grant each of the nine authorization gates, in order, with a dated entry.

Items 4, 5, and 6 are three production resources the first draft of this plan did
not list. Two of them are unconditional preconditions of production sign-in and
one is the only thing that makes a rate-based halt fire. A rollout plan that
omits a resource its own acceptance criteria depend on has not planned the
rollout.

Where an action cannot be performed, the corresponding gate does not soften. It
enforces the one thing that matters: **a PASS may not be claimed for a rung whose
evidence requires a deployment that does not exist.**

## Evidence

Phase 9 uses `CF-EV-P9-{STA|UT|INT|E2E|SEC|PERF|OPS|QA|API|UI}-00n` under
`docs/collaboration-foundation/evidence/phase-9/`. Every record carries a
`Story:` line and names the command, commit SHA, environment, deployment ID,
timestamp, and result. Evidence is valid only for the exact commit and deployment
under review.

The controlling minimum-evidence rows from
[`quality-strategy.md`](quality-strategy.md) §7.2 are **D1 migration** — local
migration report, populated-fixture result, compatibility result, backup and
restore evidence — and **Production release** — full CI, preview sign-off,
migration version, deployment ID, production smoke, and rollback readiness. Phase
9 satisfies both or does not close.

Three gate-writing rules carry over from Phase 7 and are conditions on every
Phase 9 gate, not advice. A gate **imports the module and drives its guards to
their refusals**; a gate that pattern-matches source is treated as vacuous and
fails review. This applies to the cohort cache TTL and to the environment
profile, where the tempting implementation is to read a source literal — both are
instead driven with an injected clock and an injected environment, and their
refusals are observed. Drift tests use a `mutated(source, pattern, replacement)`
helper that asserts the replacement actually landed, with patterns written using
`\s*` rather than `\n`, because Git renormalises line endings on checkout and a
`\n` pattern silently fails to match on a CRLF working copy, leaving a test that
passes while checking nothing. And narrowed coverage is declared in the manifest
with a reason, printed by the harness at run time, and asserted by the gate —
never silent.

## Authorization and sign-off

Not recorded. DocVault is single-maintainer, so the sprint's cross-functional
review roles — Product Owner, Senior QA, Security Reviewer, Operations, Privacy
Reviewer, UX Lead, Technical Lead — are one person. The Phase 5 precedent is to
record **one owner authorization covering all seven roles, stating explicitly
that no independent security or privacy review occurred**, rather than
fabricating seven signatures. That authorization has not been given and is not
assumed here.

This matters more in Phase 9 than in any earlier phase, because this is the phase
that puts other people's data on a production service. The exit gate
`cf:phase9:exit:check` must fail if the record is ever upgraded to claim
independent reviewers, or an independent security or privacy review that did not
occur — the same assertion Phases 5 through 8 carry. Should this project later
gain independent reviewers, a Phase 9 re-review is the honest way to obtain
genuinely independent sign-off before general availability, and `CF-P9-019`
records that as an open recommendation rather than a closed one.

## Deferred beyond Phase 9 — recorded, not forgotten

Phase 8 deferred seven items to Phase 9. One of them — production activation, the
production smoke suite, and the production canary workspace — is **owned** above
by `CF-P9-016` and `CF-P9-017`. The other six are re-deferred here, each with its
reason. The first draft of this plan carried two forward and dropped five without
a word, which is the failure this section exists to prevent.

- **Synthetic-identity re-qualification.** `operational-runbook.md` prescribes
  designated synthetic identities and Phases 6 through 9 all use the project
  owner's real GitHub accounts. Creating and maintaining synthetic GitHub
  accounts is an account-policy decision outside this sprint's authority. Phase 9
  does not re-qualify on synthetic identities; it records the deviation as
  `D-P9-05` instead of leaving it as an unrecorded fact, which is the part Phase 8
  could not do because no production canary existed yet.
- **Manual screen-reader evidence beyond the automated and keyboard baseline.**
  Still deferred, including for the new disclosure surface. One maintainer with
  one screen reader is a narrowed sample that would have to be declared as such,
  and a declared sample of one is worth less than an honest deferral. Declared
  above as a coverage narrowing so it is visible rather than absent.
- **Key rotation and terminal-loss journeys as browser E2E.** Still deferred.
  Both are proven at the service layer by `CF-P5-006` and
  `workspace-key-rotation.workers.test.ts`. Neither is among the owner's ten
  scenarios, and bolting either onto a Phase 9 story would leave it half-owned —
  and Phase 9 adds no product surface that would change their coverage.
- **Load beyond the ten-active-user profile.** Still deferred, and Phase 9 makes
  it less relevant rather than more: the observed production cohort is one to two
  identities, three orders of magnitude below the ten-user profile. A larger
  profile changes the budget contract and needs Product Owner approval, not a
  test-file edit. The stability gate records the gap explicitly under `D-P9-07`.
- **Ownership transfer journeys.** Still deferred with export and deletion.
  Transfer requires recent authentication and a second Owner-capable identity in
  the same workspace at the same time, which the single-operator cohort can stage
  but not exercise meaningfully. Verifying it here would verify the staging.
- **Export and hard purge.** Deny-closed with `409 LIFECYCLE_POLICY_UNAVAILABLE`
  until export and deletion contracts are approved. The abandonment procedure in
  `CF-P9-010` is written around their absence rather than assuming they arrive.
- **A workspace delete route.** Still absent, which is why the Preview residue
  from Phases 6 and 7 is inherited and inventoried rather than cleaned, and why
  the production canary workspace is retired from service rather than deleted.

Six further items are deferred by Phase 9 itself.

- **Realtime co-editing and Durable Objects.** Deferred by `DL-006` and not
  reopened here. `CF-P9-021` produces a verdict and, on PASS, a Phase 10 mandate.
  Nothing else.
- **R2 and attachments.** Same decision, same reason: outside Foundation scope,
  revisited only through a new approved phase.
- **Open sign-up — removing the designated-identity allowlist.** The runtime
  requires an allowlist on the OAuth callback and rejects every sign-in without
  one, so removing it is a code change with a security consequence, not a
  configuration change. General availability in Phase 9 means every workspace of
  every designated identity. Open sign-up needs its own phase, its own abuse
  analysis, and its own rate-tier review.
- **Contract migrations.** A later release, with their own approval and their own
  restore rehearsal. They never accompany the first deployment that stops writing
  an old field.
- **A 24/7 on-call rotation.** It does not exist and cannot be conjured by
  writing it down. The automatic halt is the compensating control, `R24` and
  `R25` record the residual risk, and the compensation is stated rather than
  assumed.
- **Independent review.** One person holds seven roles. Recorded here, again,
  because production rollout is where that fact costs the most.

## `P9-G0` recommendation

**APPROVE `CF-P9-001` ONLY.** Approval of `P9-G0` authorizes the contract freeze
and nothing else. It does not authorize the runtime unpinning, migration `0013`,
the disclosure surface, a Preview deployment, a production database, a production
secret, a production Worker, a production deployment, an activation row, or
general availability. Each of those requires its own gate, the seven contract
conflicts require their recorded decisions, and the nine production-touching
gates require the owner's recorded decision, in order.
