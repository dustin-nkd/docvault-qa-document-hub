# Collaboration Foundation Phase 7 — exit report

Status: **COMPLETE — 13 of 15 stories PASS; `P7-G5` NOT granted; Phase 7 does not close**

Story: `CF-P7-014`
Assembled against: `d4d9ea6` (the commit that executed `D-P7-01`)
Assembled on: 2026-07-27

This report is complete in the sense that every claim it can support is made and
every claim it cannot is named. It is **not** a closing report. Phase 7 stays
open because `CF-P7-013` is not PASS, and no signature in section 9 changes
that. The Phase 5 precedent is followed throughout: a report that fills its own
gaps is worth less than one that names them.

## 1. Decision

- Phase 7 collaboration interface, as **composed and gated in the repository**: **GO**
- Phase 7 collaboration interface, as **qualified on a deployment**: **NO-GO** — no journey ran
- `P7-G5`: **NOT GRANTED**
- Phase 8 opening: **NOT AUTHORIZED**
- Collaboration activation in production: **NO-GO** (unchanged)
- Production identity, production D1, production document routes: **NO-GO** (unchanged)

Phase 7 delivered twelve collaboration surfaces, a single-door API client, and a
composed shell, all behind a lazy boundary that keeps Personal startup free of
collaboration code. Thirteen automated gates hold them. What Phase 7 did **not**
deliver is the one thing `CF-P7-013` exists to produce: a journey exercised
end-to-end against a deployment with collaboration switched on.

## 2. A correction to the arithmetic, recorded rather than made quietly

The previous draft of this document carried the status line
**"13 of 14 stories PASS"**. That is wrong, and it is wrong in the direction that
flatters: it counted a phase of fourteen stories with one outstanding, when the
phase has **fifteen** stories with **two** outstanding.

Phase 7 has fifteen stories, `CF-P7-001` through `CF-P7-015`. The count reached
fifteen when `CF-P7-015` was added after the plan was frozen and took the next
free number, which is why the highest identifier is `015` while the last story in
sequence is `CF-P7-014`. Anyone reading the story table by eye and stopping at
the largest number in the *sequence* column arrives at fourteen. That is exactly
how this slipped through, and it is why the corrected count is now a machine-
readable field (`story_count: 15`) in
`config/cloudflare/phase-7-sprint-plan.json` rather than a sentence.

Corrected in this pass:

| Location | Was | Now |
|---|---|---|
| this report, status line | "13 of 14 stories PASS" | "13 of 15 stories PASS" |
| this report, §3 closing note | "All thirteen gates run inside `check:cloudflare`" | the precise gate accounting in §3 |
| `phase-8-sprint.md` §entry | "reads '13 of 14' … `CF-P7-014` owns correcting its own status line" | records that the correction was made, and by whom |
| `phase-7-sprint-plan.json` | no story count | `story_count: 15` with the reason the miscount was available |

**Deliberately not changed.** `phase-7-sprint.md` and the `CF-P7-015` entry in
the sprint plan both say the story is "numbered after the original fourteen".
That is historically accurate — the plan really did hold fourteen stories before
`CF-P7-015` was added — and rewriting it to fifteen would erase the fact the
sentence exists to preserve.

Two further numbers in this report were checked against their evidence during
this pass rather than carried forward on trust: 60 explained role-disabled
controls (`CF-EV-P7-A11Y-002`) and a lowest focus-ring contrast of 5.48:1
(`CF-EV-P7-A11Y-004`, corroborated in `CF-EV-P7-UI-011`). Both hold.

## 3. Story reconciliation — every story, its gate, its evidence

| Story | Title | Gate | Gate state | Evidence | Status |
|---|---|---|---|---|---|
| CF-P7-001 | Freeze the UI contract, surface inventory, a11y baseline | `cf:phase7:contract:check` | passes | `STA-001`, `A11Y-001` | **PASS** |
| CF-P7-002 | Lazy shell, GitHub Pages banner, four base states | `cf:phase7:shell:check` | passes | `UI-001`, `PERF-001` | **PASS** |
| CF-P7-003 | Account menu and workspace switcher | `cf:phase7:account:check` | passes | `UI-002` | **PASS** |
| CF-P7-004 | Create workspace journey | `cf:phase7:create:check` | passes | `UI-003` | **PASS** |
| CF-P7-005 | Device and key initialization | `cf:phase7:device:check` | passes | `UI-004`, `SEC-001` | **PASS** |
| CF-P7-006 | Member list, role badge, explained role-disabled controls | `cf:phase7:members:check` | passes | `UI-005`, `A11Y-002` | **PASS** |
| CF-P7-007 | Invitation creation, copy, revoke | `cf:phase7:invitations:check` | passes | `UI-006`, `SEC-002` | **PASS** |
| CF-P7-008 | Invitation acceptance | `cf:phase7:accept:check` | passes | `UI-007` | **PASS** |
| CF-P7-009 | Sync state model | `cf:phase7:sync:check` | passes | `UI-008` | **PASS** |
| CF-P7-010 | Conflict resolution dialog | `cf:phase7:conflict:check` | passes | `UI-009`, `A11Y-003` | **PASS** |
| CF-P7-011 | Audit activity | `cf:phase7:audit:check` | passes | `UI-010` | **PASS** |
| CF-P7-012 | Responsive and keyboard/focus qualification | `cf:phase7:qualify:check` | passes | `A11Y-004`, `UI-011` | **PASS** |
| CF-P7-015 | Collaboration API client layer | `cf:phase7:api:check` | passes | `API-001` | **PASS** |
| **CF-P7-013** | **Integrate and qualify on Preview** | `cf:phase7:preview:check` | **passes** | `OPS-001`, `OPS-002`, `OPS-003`, `OPS-004` — all four **PARTIAL** | **PARTIAL** |
| **CF-P7-014** | **Exit and Phase 8 handoff** | `cf:phase7:exit:check` | **does not exist** | `CF-EV-P7-EXIT-001` — **not written** | **PARTIAL** |

All evidence identifiers are `CF-EV-P7-…` under
`docs/collaboration-foundation/evidence/phase-7/`; 24 records are committed there
and all 24 are reconciled above. A story is PASS when its gate script exists and
passes, never on assertion.

**Gate accounting, stated precisely because the previous version of this line was
imprecise.** Fifteen `cf:phase7:*` gates run inside `check:cloudflare`:
`sprint`, `contract`, `shell`, `account`, `create`, `device`, `members`,
`invitations`, `accept`, `sync`, `conflict`, `audit`, `qualify`, `api`,
`preview`. Thirteen of those are the story gates of the thirteen PASS stories.
`cf:phase7:preview:check` is the fourteenth and it **passes while its story does
not** — the gate asserts a fail-closed deployment truthfully, and the story needs
a qualified journey. A green gate is not a closed story. `cf:phase7:sprint:check`
is the fifteenth; it gates this plan and has no stated story owner, a hole the
same shape as the one `CF-P7-015` was created to close, and one Phase 8 closes by
naming an owner rather than by adding a story that does nothing else.

**Three manifest corrections made by this story**, each because the manifest
named something that does not exist:

1. `CF-P7-013` was `PLANNED` and is now `PARTIAL`, with the reason and the
   measured budget breach recorded inline.
2. `CF-P7-013`'s evidence list named `CF-EV-P7-QA-001` and `CF-EV-P7-PERF-002`.
   Neither was ever written. It now names the four `OPS` records that were, with
   the planned-but-unwritten pair retained in
   `evidence_planned_but_never_written` so the substitution is visible.
3. `CF-P7-014` was `PLANNED` and is now `PARTIAL`, listing what it delivered and
   what it did not.

## 4. Gate UX criteria

| | Criterion | Evidence | Standing |
|---|---|---|---|
| U1 | Personal and workspace data never mixed | zero personal storage keys asserted by every surface gate; zero collaboration modules on Personal startup, measured on the deployment (`OPS-004`) | **held** |
| U2 | The user always knows which workspace they are in | `UI-002`; the resolver refuses to fall back silently | held **for the composed surfaces**; not exercised through a live workspace |
| U3 | Role-disabled controls carry an explanation | `UI-005`, `A11Y-002`; 60 disabled controls, zero without an announced reason | held **for the composed surfaces**; not exercised through a live role |
| U4 | A local draft is never lost to a conflict | `UI-009`; dismissal decides nothing, discard needs arming and confirming | held **for the composed surfaces**; not exercised through a live conflict |
| U5 | Keyboard and focus meet the bar | `A11Y-004`; zero rings missing, lowest contrast 5.48:1 against a 3:1 floor | held locally; **not measured on the deployment** — the only surface that rendered there has zero focusable controls |
| U6 | Mobile and tablet layouts do not break | `UI-011`; zero overflow, clipped text, or sub-24 px targets across 18 measurements | held locally; **not measured on the deployment** — the measuring viewport reported `clientWidth: 0`, which is an instrumentation artifact and not a measurement |

U1 is the only criterion with a measurement taken on the deployment. U2, U3 and
U4 hold for the surfaces as composed and depend on a live workspace to be
exercised as written. U5 and U6 hold locally and were explicitly **not** confirmed
against the deployment, for the reasons recorded in `CF-EV-P7-OPS-004` under
"Not evidenced". None of the six is withdrawn; none of the six is claimed as
deployment-qualified.

## 5. What the phase found

Six real defects, each found by the process rather than by inspection:

1. **Focus ring below AA in the light theme** (2.54:1 against a 3:1 floor),
   inherited from `CF-P7-002` and `CF-P7-003` and latent since they shipped.
   Fixed with theme-aware tokens; a correction was appended to the earlier
   evidence.
2. **A readiness vocabulary read from the wrong place** — seven values taken from
   neighbouring SQL literals where the frozen type declares five. Caught by this
   phase's own gate, which now parses the server's union type.
3. **`aria-describedby` resolving to the wrong reason** when two member lists
   render on one page: confidently wrong, which is worse than silent.
4. **Every collaboration list overflowing at 320 px** — a grid track defaults to
   `min-width: auto`. Each story had passed its own responsive check because each
   was measured with short names.
5. **Collaboration modules absent from the deployed artifact** — the build walked
   references from `index.html`, and the lazy design means `index.html`
   references none of them. Found only on the real deployment.
6. **Two drift tests that tested nothing**, their mutation regexes silently
   failing to apply against CRLF-normalised sources.

A seventh was found during the final Preview measurement and is not fixed. It has
its own section (§6) because it is the only one still open.

Two further findings were defects in the measuring instruments, not the product,
and are recorded as declared exclusions rather than quietly patched away. One
diagnosis was wrong and has been retracted in `CF-EV-P7-OPS-002`.

Four of the six — 1, 3, 4 and 5 — are the same shape, and it is the single most
useful thing Phase 7 produced: **a correct part-wise check is not a whole-system
check.**
Eleven gates each asserted, correctly, that their surface performs no transport,
and the consequence — that nothing performed any transport at all — was invisible
to every one of them. That is what `CF-P7-015` exists to close, and it is the
reason Phase 8 is a verification phase rather than a feature phase.

## 6. OPEN — `CF-P7-013`, and a budget that fails

`CF-P7-013` is **not PASS**. Two distinct things are open under it.

### 6.1 No journey is qualified

Measured on Preview deployment `681ad3ca-f0f7-4f66-8649-c7dab3de798d`
(Environment Preview, branch `codex-cf-p3-preview`, built from `d4d9ea6`;
identity read from `wrangler pages deployment list`, not inferred from the URL),
2026-07-26 17:46–17:53 UTC.

What **is** proven on that deployment:

| Claim | Measurement |
|---|---|
| Nothing under `js/collaboration/` is referenced eagerly | 22 `<script>` tags in the served `index.html`, **0** under `js/collaboration/`; the single mention of `entry.js` is inside an HTML comment |
| Nothing collaboration-related is precached | served `sw.js` `APP_SHELL` = 37 entries, **0** collaboration; the string `collaboration` appears **0** times in `sw.js`; confirmed against a cleared cache and service worker, which then held exactly 37 entries |
| The artifact serves the entry's real closure | pressing the opener fetched exactly **20** modules, all `200 application/javascript` |
| The deployment fails closed | `/api/v1/session` and `/api/v1/workspaces` both `503 COLLABORATION_UNAVAILABLE`; the branch alias answers identically |
| The shell says so, and offers nothing that cannot work | exactly **1** API request before it stopped; rendered state `error`, title "Collaboration is not enabled here"; **0** interactive controls; `role="status" aria-live="assertive"` and a non-colour shape token; no console errors |
| The availability banner behaves | present, ships `hidden`, `hidden === true` live, still hidden after the 503 rendered; the opener ships hidden and is revealed by `js/deployment.js` |
| Response headers | CSP, HSTS, and `Cache-Control` recorded verbatim on `/` and on `/api/v1/session`, the API response being the tighter of the two |

What is **not** proven: every journey. Sign-in, create workspace, device and key
initialization, member list, invitation creation and acceptance, sync state,
conflict resolution, and audit activity. There is no session, workspace, member,
invitation, or audit event on a deployment answering `503`, so there is nothing
to qualify against. Nothing was invented to fill the gap.

**Why the deployment is off, and what is not claimed about it.** `d4d9ea6`
executed `D-P7-01` across the repository and every gate. Cloudflare Pages binds
environment variables at **build time**, so a build produced before
`COLLABORATION_ENABLED` was set on the Pages project cannot carry it, whatever
the repository says. Whether the variable is unset, set to something other than
`'true'`, or was set after this build began cannot be distinguished from outside
— all three produce an identical `503` — and wrangler exposes no read path for
Pages environment variables. **Deployment behaviour was measured; the project
variable was not.** "The variable is not set" is an inference and is not recorded
here as a fact.

**What closes it.** `COLLABORATION_ENABLED` set for the **Preview environment**
of the Pages project, then `codex-cf-p3-preview` **rebuilt** — a new deployment
id, not a re-measurement of `681ad3ca` — and the journeys qualified against the
result. This is an owner action: `wrangler pages secret put` is refused to an
agent by the permission classifier. It is on record at
`config/cloudflare/phase-7-preview-integration.json` under `blocked_on`.

### 6.2 The lazy-chunk budget fails, measured for the first time

`config/cloudflare/phase-7-sprint-plan.json` declares
`lazy_phase_7_chunk_max_kib_gzip: 60`. Measured on the deployment as Cloudflare
serves it, across the 20 modules the entry actually pulls:

| Encoding | Wire bytes | KiB | Against 60 KiB |
|---|---:|---:|---|
| `gzip` | 80,249 | **78.4** | **over by 18.4 KiB (+31%)** |
| `br` | 82,623 | 80.7 | over |
| `identity` | 256,164 | 250.2 | n/a |

The budget is stated in gzip, so the gzip row governs. It fails under the
narrowest reading too: excluding the three inherited Phase 5/6 service modules
the lazy path also pulls (`device-key-lifecycle.js` 5,212 B, `outbox.js`
5,457 B, `conflict-resolution.js` 3,708 B), the seventeen Phase 7 modules alone
are 65,872 B = **64.3 KiB**. There is no definition of "the Phase 7 chunk" under
which this passes.

Three things about it matter more than the number:

- **No gate measures it.** The key is read by nothing; no script under
  `scripts/` computes a byte size of any collaboration module.
  `CF-EV-P7-PERF-001` deferred the measurement to `CF-P7-013` in as many words,
  and this is it. The budget was never wrong — it was never checked.
- **The cause is structural.** There is no bundling or minification step. Twenty
  unminified source files are served with their comments intact. The figures are
  Cloudflare's dynamic compression of that, not a property of a build artifact,
  and the breach is stated about the configuration that currently ships.
- **It is neither met nor renegotiated.** It is recorded as OPEN. Renegotiating a
  budget to match what shipped is a decision, not an edit, and no such decision
  exists.

Phase 7's zero-tolerance list includes `open_defect`. This is one. It is the
proximate reason, alongside §6.1, that `P7-G5` is not granted.

## 7. Residual risks

**R-P7-A — No journey has ever run against a deployment with collaboration on.**
Everything in §4 that is marked "held for the composed surfaces" rests on local
qualification with a stubbed or recording transport. The defects in §5 were found
by moving up a level of integration rather than by inspecting a module in place;
there is one level left, and it has not been reached. Owner: Product Owner.
Closed by `CF-P7-013` reaching PASS.

**R-P7-B — The lazy budget is breached by 31% and nothing enforces it.** §6.2.
Whatever is decided, the gap that allowed it — a declared budget no script reads
— outlives the number. Phase 8 carries the enforcing budget row. Owner:
Technical Lead.

**R-P7-C — "Correctly excluded" and "missing" are the same 200 on the wire.**
`document-envelope.js` and `storage-provider.js` both return `200` with
`content-type: text/html; charset=utf-8` and a 43,473-byte body beginning
`<!DOCTYPE html>` — byte-for-byte the length of `GET /`. That is the exact
signature of the `037fb093` artifact defect. It is **not** a recurrence here, on
three measured grounds: pressing the opener fetched exactly the 20 modules that
exclude both; nothing under `js/` imports either (their only importers are Node
tests and gate scripts); and the exclusion is asserted deliberately, at
`tests/cloudflare-phase-7-api-client-policy.test.mjs:574`, under a test named
*the import closure follows the entry rather than the directory*. The residual
risk is the next commit: the first Phase 7 or Phase 8 surface to import either
module gets a working local build and a broken deployment, and the content-type
is the only place it shows. Nothing gates that transition. Owner: Technical Lead.

**R-P7-D — `CF-P7-014` shipped without its own gate.** The plan requires
`cf:phase7:exit:check` to ship with this story, in the pattern Phases 2 through 6
each followed. It does not exist, so the reconciliation in §3 is asserted by this
document rather than enforced by a script, and it can drift the moment anything
below it changes. Phase 5's exit gate rejects 55 mutation cases; Phase 7 has
none. Owner: Senior QA.

**R-P7-E — The Phase 7 error-to-state map is incomplete, and Phase 8 cannot
start until Phase 7 fixes it.** `phase-7-ui-contract.md` §4 opens "Every code in
the frozen server taxonomy maps to exactly one presentation" and then maps
twelve, two of which (`UNAUTHENTICATED`, `RECENT_AUTHENTICATION_REQUIRED`) are
spellings in no catalog. The frozen catalog in `api-contract.md` §8 holds **29**
codes, so after the two renames the map covers twelve of twenty-nine and
seventeen server codes have no presentation at all. Three of the seventeen are
load-bearing in Phase 8's own scenarios. `phase-8-sprint.md` names the fix as a
**Phase 7** story, `CF-P7-016`, precisely so a later phase does not edit a frozen
contract and a closed phase's gate. That story is not in this plan and is not
counted in the fifteen. Owner: Technical Lead. **This is an entry precondition
for Phase 8, not a Phase 8 story.**

**R-P7-F — Preview residue carried forward from Phase 6 and added to by Phase 7.**
Revisions and audit events are append-only by trigger, the Preview surface
exposes no workspace delete route, and three browser sessions could not be
revoked without their tokens. Phase 8 inherits it and must not silently reset it.
Owner: Operations.

**R-P7-G — Another agent was writing to this working tree while this report was
assembled, and the report is a snapshot of a moving tree.** `git status` was
clean at `d4d9ea6` when the Preview measurement began. By the time that
measurement finished it showed 2 modified files that measurement had not touched;
by the time this report was finished it showed **19 modified files and one
untracked file that this story did not write**, spanning
`config/cloudflare/phase-7-{api-client,create-workspace,ui-contract}.json`, three
Phase 7 documents, `js/collaboration/{api-client,create-workspace}.js`, five gate
and policy scripts, and six test files. Reading the diff shows work in progress on
`CF-P7-016` — the R-P7-E fix — including a rewrite of `cf:phase7:contract:check`
to read the 29-code catalog out of `api-contract.md` instead of comparing the
contract against a twelve-item copy of itself kept in the gate.

Three consequences, stated rather than smoothed over:

1. **This report reconciles the committed state at `d4d9ea6`** and makes no claim
   about the uncommitted work. If `CF-P7-016` lands, Phase 7 has **sixteen**
   stories, and §2, §3 and R-P7-E must be amended.
2. **The gate results in §8.1 were measured against a tree that kept changing
   underneath them.** They are true of the tree at the moment each gate ran and
   are not a claim about any commit.
3. **Nobody should commit this tree as one change.** It contains two agents'
   work, and only one of them is described by this report.

Owner: Product Owner.

**R-P7-H — The authoritative gate cannot complete in this working copy.**
`npm run check` exits **127** at `cf:types:check`, on a pure CRLF-versus-LF
mismatch in a generated types file whose content and configuration hash are
unchanged (§8.1). Every individual gate passes, so no Phase 7 claim depends on
it — but `cf:types:check` is the **third of the seventy-two** gates in
`check:cloudflare`, and a chain that aborts there cannot be the thing that
certifies the other seventy-one. "Green with a real exit code" is a stated
`P7-G5` condition. Two further points make it worse than cosmetic: the failure mode is
*silent staleness in the other direction*, since a genuinely drifted
`worker-configuration.d.ts` would produce the same message, and the crash is a
libuv abort rather than a clean non-zero exit, which is exactly the class of
result that is easy to mistake for infrastructure noise. Owner: Operations.

The programme risk register carries 22 rows, `R01` through `R22`, with no open
unowned risk. Phase 7 opened none of them and closed none of them; the **eight**
above (`R-P7-A` through `R-P7-H`) are Phase 7 exit conditions, tracked here, and
`R23` — designated Preview identities are build-time configuration — is opened by
`CF-P8-001`.

## 8. Local verification

- `node scripts/check-cloudflare-phase-7-sprint.mjs` → passes on the amended
  plan: fifteen stories, twelve owned surfaces, an unbroken gate chain, remote
  work behind `P7-G4`.
- `npm run check` — the authoritative gate, run at the close of this story with
  its exit code captured directly and never through a pipe
  (`npm run check > file 2>&1; echo $?`). Result in §8.1.

### 8.1 The gate run that closes this story

Run on 2026-07-27 against the working tree described in **R-P7-G** — that is,
`d4d9ea6` plus this story's documentation and manifest edits **plus another
agent's in-flight `CF-P7-016` changes**, which this story neither made nor
controls.

```
npm run check > /tmp/c.txt 2>&1; echo $?
127
```

**The real exit code is 127. It is not green, and it is not recorded as green.**
The exit code was captured with `; echo $?` after a redirect and never through a
pipe. The chain was run twice, at the start and at the close of assembly, and
returned 127 at the same gate both times.

| Stage | Result |
|---|---|
| `check:base` → `scripts/quality-check.mjs` | passed — 23 JavaScript files, 30 local HTML references, 36 offline shell assets, 375 static UI strings |
| `check:base` → `check:functions` (`tsc --project tsconfig.functions.json`) | passed, no output |
| `check:base` → `npm test` (`node --test tests/run.mjs`) | **0 fail, 0 skipped, 0 todo.** 1081 tests in the first run and **1086** in the final one — the count moved because another agent added tests to this tree mid-assembly (R-P7-G), which is itself worth recording |
| `check:cloudflare` → `cf:toolchain:check` | passed |
| `check:cloudflare` → `cf:config:check` | passed — `local=false, preview=true, production=false`; one approved Preview D1 binding, zero production bindings |
| `check:cloudflare` → **`cf:types:check`** | **FAILED, exit 127. The chain stopped here and no later gate ran in this invocation.** |

**What failed, measured rather than assumed.** `cf:types:check` runs
`wrangler types worker-configuration.d.ts --check`, which reported *"Types at
`worker-configuration.d.ts` are out of date"* and then crashed inside wrangler
with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file
src\win\async.c, line 76`. The 127 is that abort, not an ordinary gate rejection.
It reproduces: running `cf:types:check` alone returns 127 again.

**The types are not stale.** Regenerating them to a scratch path outside the
repository produced a file that is **identical to the committed one once carriage
returns are removed**, carrying the **same** configuration hash
`3f3f2b1a99e6a4b9c2e2272f6fc208fb`. Both files are 14,737 lines; the on-disk file
is 566,988 bytes and the regenerated one 552,402, and the entire difference is CR
bytes plus the output path wrangler echoes into its own header comment. Git is
configured `core.autocrlf=true`, so the LF blob becomes CRLF on checkout, while
`wrangler types` emits LF and `--check` compares bytes. **This gate fails on line
endings, not on content.** It is an environment condition of this working copy,
not a drift in the Cloudflare configuration.

**It is not caused by this story.** `CF-P7-014` wrote three markdown documents
and `config/cloudflare/phase-7-sprint-plan.json`. None of them is an input to
`wrangler types`, which reads `wrangler.jsonc` — unmodified at `d4d9ea6`. The
regenerated hash being unchanged is the direct evidence for that.

**It is not fixed here, deliberately.** The fix is to rewrite a tracked generated
file with LF endings. That file belongs to no Phase 7 story, the working tree
holds another agent's uncommitted work, and quietly regenerating it would make
this report's gate run look green without any Phase 7 claim becoming more true.
Recorded as an open environment defect instead.

**Every other gate in the chain was then run individually, and every one
passes:**

| Gate group | Result |
|---|---|
| `cf:burst:config:check`, `cf:burst:types:check`, `cf:burst:build` | 3 of 3 exit 0 |
| `test:collab:unit`, `cf:test`, `cf:rollback:rehearse`, `cf:pages:dry-run` | 4 of 4 exit 0; `cf:test` = 2 files, 7 tests, 7 pass |
| `cf:phase1:*` through `cf:phase6:*` | 47 of 47 exit 0 |
| `cf:phase7:*` — `sprint`, `contract`, `shell`, `account`, `create`, `device`, `members`, `invitations`, `accept`, `sync`, `conflict`, `audit`, `qualify`, `api`, `preview` | **15 of 15 exit 0**, including the amended sprint plan; re-run at the close of assembly against the changed tree and still 15 of 15 |

So: **every Phase 7 gate passes, and the authoritative chain does not.** Both
sentences are true and neither is a substitute for the other. The chain was not
re-run to green — the gates above were run one at a time — and no claim in this
report rests on a green `npm run check`.

## 9. Owner authorization

`CF-P7-014` acceptance requires Product Owner, Senior QA, Security Reviewer,
Operations, Privacy Reviewer, UX Lead, and Technical Lead sign-off, plus zero
P0/P1 exception or open defect and zero unowned or expired Critical/High risk.

**DocVault is a single-maintainer project.** The seven review roles named in the
sprint are held by one person, the project owner. Following the Phase 5 exit
precedent, this is recorded as **one owner authorization covering all seven
roles**, not as seven independent reviews, because seven independent reviewers do
not exist on this project and representing it otherwise would misstate the
evidence.

### What the owner actually said

In session on 2026-07-26, verbatim and untranslated:

> "tôi cấp quyền cho bạn thực hiện luôn việc 2 3"

— *I authorize you to carry out items 2 and 3*, where item 3 was signing the exit
report. Separately, on `D-P7-01`:

> "duyệt"

— *approved*.

Nothing beyond those two statements is transcribed, and nothing is inferred from
them beyond what they say.

### How that authorization must be read

- It was given as a **blanket in-session instruction**, covering all seven review
  roles at once. It was **not** given after the owner read this report line by
  line — this report did not exist in its present form when the words were
  spoken.
- **No independent security review occurred.** **No independent privacy review
  occurred.** The Security Reviewer and Privacy Reviewer rows below are the same
  person as the Product Owner row, acting.
- It authorizes **signing this report**. It is not a grant of `P7-G5`, and it is
  not read as one. The owner did not say `P7-G5`, and a signature cannot supply a
  journey that was never run. See §10.

| Role | Sign-off | Basis | Date |
|---|---|---|---|
| Product Owner | ☑ Nguyen Khanh Duy (project owner) | blanket in-session authorization | 2026-07-26 |
| Senior QA | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization | 2026-07-26 |
| Security Reviewer | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization; **no independent security review** | 2026-07-26 |
| Operations | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization | 2026-07-26 |
| Privacy Reviewer | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization; **no independent privacy review** | 2026-07-26 |
| UX Lead | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization | 2026-07-26 |
| Technical Lead | ☑ Nguyen Khanh Duy (project owner, acting) | blanket in-session authorization | 2026-07-26 |

Should this project later gain independent reviewers, a Phase 7 re-review is the
honest way to obtain genuinely independent sign-off. This authorization does not
claim one was performed.

## 10. `P7-G5` — not granted, and why a signature does not grant it

The seven roles are signed. The objective conditions are not met:

| Condition | State |
|---|---|
| Every story PASS | **no** — `CF-P7-013` PARTIAL, `CF-P7-014` PARTIAL |
| Zero open defect | **no** — the lazy chunk budget is breached by 31% (§6.2) |
| Every gate exists and passes | **no** — `cf:phase7:exit:check` does not exist |
| Sprint gate criteria U1–U6 qualified | **partial** — U1 measured on the deployment; U2–U6 held locally only (§4) |
| Zero unowned or expired Critical/High risk | yes — 22 register rows, all owned |
| `npm run check` green with a real exit code | **no** — exit **127**, `cf:types:check` failing on line endings (§8.1). Every Phase 7 gate passes individually; the chain does not complete. |

`P7-G5` is therefore **NOT GRANTED**. Phase 7 remains open, and
[`phase-8-handoff.md`](phase-8-handoff.md) — issued by this story — becomes
controlling on the grant and not before.

Granting it needs, in order: `COLLABORATION_ENABLED` set for the Preview
environment and `codex-cf-p3-preview` rebuilt; the journeys qualified against the
new deployment id; the 60 KiB budget met or renegotiated **on the record** and,
either way, given a gate that reads it; `CF-P7-016` closing the error-map gap
(R-P7-E); and `cf:phase7:exit:check` built so this reconciliation is enforced
rather than asserted.

## 11. Boundaries held

No production D1, no production identity, no production document route, no
collaboration activation in production, no server-visible plaintext, no automatic
merge, no automatic Personal Vault upload, no personal-provider fallback, no
silent draft discard. No new persistence and no migration; schema stays at 12 and
migrations `0001` through `0012` are untouched. Personal Vault is at a zero-line
diff. Zero collaboration modules evaluate on Personal startup, measured on the
deployment and not inferred from the source.

`D-P7-01` relaxed exactly one thing — `COLLABORATION_ENABLED` may be `'true'` for
the `preview` environment — and the boundary that matters, **production never
activates collaboration**, is unchanged and still machine-enforced by six
assertions across four closed phases.

Every measurement behind this report was read-only against a Preview deployment.
No write request was issued, no database was touched, no secret was read or set,
no credential was entered, and no authenticated session was obtained or
attempted.
