# Collaboration Foundation Phase 7 — exit report

Status: **COMPLETE — 17 of 17 stories PASS; `P7-G5` NOT granted; Phase 7 does not close**

Story: `CF-P7-014`
Assembled against: `c08ccf1` (the commit that landed `CF-P7-016`), amended after
`CF-P7-017` landed (`D-P7-02`), plus this story's own changes
Assembled on: 2026-07-27
Gate: `cf:phase7:exit:check`

This report is complete in the sense that every claim it can support is made and
every claim it cannot is named. It is **not** a closing report. Phase 7 stays
open because `CF-P7-013` is not PASS and the lazy-chunk budget is breached; no
signature in section 9 changes either. `CF-P7-017` — the third reason the
previous revision of this report gave — landed on 2026-07-27 and is now PASS;
§2A and §6.0 record what changed and what did not. The Phase 5 precedent is
followed throughout: a report that fills its own gaps is worth less than one
that names them.

`CF-P7-014` is itself **PASS** as of this revision, which is a claim about a
story and not about a phase. It shipped `cf:phase7:exit:check` — the gate its own
plan required and the previous draft had to record as missing — so the
reconciliation below is now enforced by a script rather than asserted by a
document. §3 says exactly what that gate does and does not prove.

## 1. Decision

- Phase 7 collaboration interface, as **composed and gated in the repository**: **GO**
- Phase 7 collaboration interface, as **qualified on a deployment**: **PARTIAL** —
  U1 and U2 are Live-qualified; U3 through U6 remain locally qualified only
- `P7-G5`: **NOT GRANTED**
- Phase 8 opening: **NOT AUTHORIZED**
- Collaboration activation in production: **NO-GO** (unchanged)
- Production identity, production D1, production document routes: **NO-GO** (unchanged)

Phase 7 delivered twelve collaboration surfaces, a single-door API client, a
composed shell, a corrected error-to-presentation map, and — as of this
revision — a corrected dispatch boundary that no longer answers `503`
regardless of configuration. Seventeen automated gates hold them. What Phase 7
did **not** deliver is the one thing `CF-P7-013` exists to produce: a journey
exercised end-to-end against a deployment with collaboration switched on. Three
months of surface work sit behind an API that answered `503` to every request
from Phase 1 until `CF-P7-017` landed in the working tree on 2026-07-27 — and
still does on every deployment that exists today, because none has been
rebuilt from a commit carrying the fix.

## 2. A correction to the arithmetic, recorded rather than made quietly

An earlier draft of this document carried the status line
**"13 of 14 stories PASS"**. It was wrong in *both* terms, and both errors ran in
the direction that flatters.

**The denominator.** Phase 7 has **seventeen** stories, `CF-P7-001` through
`CF-P7-017`. The plan was frozen with fourteen. `CF-P7-015` was added afterwards
and took the next free number, which is why the highest identifier ran ahead of
the last story in *sequence*: anyone reading the story table by eye and stopping
at the largest number in the sequence column arrives at fourteen. That is exactly
how it slipped through.

**The numerator.** Once the denominator was corrected to fifteen, the count went
stale a second time within the same day: `CF-P7-016` landed at `c08ccf1` (PASS)
and `CF-P7-017` was opened (OPEN, not started). Thirteen became fourteen and
fifteen became seventeen.

The honest reading at that revision was **15 of 17 stories PASS**, with
`CF-P7-013` PARTIAL and `CF-P7-017` OPEN. "13 of 14" read as one story
outstanding. It was two then and it was two at that revision — but not the same
two: `CF-P7-014` closed and `CF-P7-017` opened. It is one now: §2A records
`CF-P7-017` closing the same day, moving the count to **16 of 17**.

Corrected in this pass:

| Location | Was | Now |
|---|---|---|
| this report, status line | "13 of 14", then "13 of 15" | "15 of 17 stories PASS" |
| this report, §3 story table and gate accounting | fifteen rows, fifteen gates | seventeen rows, sixteen gates |
| `phase-8-sprint.md` §entry | "fifteen stories … thirteen of them are PASS" | seventeen stories, fifteen PASS, with both errors explained |
| `phase-8-handoff.md` §what Phase 7 hands over | "Fifteen `cf:phase7:*` gates … 24 evidence records" | sixteen gates, 27 evidence records, and the corrected count |
| `phase-7-sprint.md` §story table | fifteen rows | seventeen rows, with the two out-of-sequence stories and why they sit outside the chain |
| `phase-7-sprint-plan.json` | `story_count: 15` | `story_count: 17`, and `STORY_IDS` in the sprint policy extended to match |
| `check-cloudflare-phase-7-sprint.mjs` | printed the literal "Fifteen stories" | counts, because that literal was itself wrong by the time it printed |

**It is no longer a sentence anywhere that matters.** `cf:phase7:exit:check`
computes both terms from the story inventory in
`scripts/cloudflare-phase-7-exit-policy.mjs` and **fails unless this report's
status line contains the computed string**. It also requires `story_count` in
`phase-7-exit-gate.json` and `phase-7-sprint-plan.json` to equal the inventory
length, and requires every story's status to be identical in both files. The
drift suite includes the exact historical failure as a case — a fourteen-story
manifest with the status line "13 of 14" is rejected by name.

**Deliberately not changed.** `phase-7-sprint.md` and the `CF-P7-015` entry in
the sprint plan both say the story is "numbered after the original fourteen".
That is historically accurate — the plan really did hold fourteen stories before
`CF-P7-015` was added — and rewriting it would erase the fact the sentence exists
to preserve.

Two further numbers in this report were checked against their evidence during
this pass rather than carried forward on trust: 60 explained role-disabled
controls (`CF-EV-P7-A11Y-002`) and a lowest focus-ring contrast of 5.48:1
(`CF-EV-P7-A11Y-004`, corroborated in `CF-EV-P7-UI-011`). Both hold.

## 2A. A second correction: `CF-P7-017` lands, and the count moves to 16 of 17

The revision of this report assembled at `c08ccf1` read **15 of 17**, with
`CF-P7-013` PARTIAL and `CF-P7-017` OPEN. On 2026-07-27, in the same session,
`CF-P7-017` was decided and landed: `D-P7-02` in
[`decision-log.md`](decision-log.md) records the Product Owner choosing
**Option A** — `functions/_lib/identity/environment.ts` was the bug, not the
Pages Preview variable — over the two options the previous revision recorded
as blocking (§6.0 as it then read; superseded below).

The fix is two files and no new dispatch logic:

- `environment.ts` line 67's condition corrected from
  `COLLABORATION_ENABLED !== 'false'` to `COLLABORATION_ENABLED !== 'true'`.
  This alone is the functional fix: `functions/api/v1/[[path]].ts` already
  composed `handleIdentityRuntime`, `handlePreviewKeyFoundationApi`, and
  `handlePreviewCollaborationApi` ahead of the `api-shell.mjs` fallback, and
  all three gate on the function this line governs. Nothing needed to learn to
  dispatch; the doors already existed.
- `api-shell.mjs`'s dead `hasReviewedDisabledState` double-branch — which
  computed a boolean from the flag and returned the identical `503` regardless
  of its value — was removed, with **no observable behaviour change**:
  `tests/api-shell.test.mjs`'s NO-OP CONTROL, which calls `handleApiRequest`
  directly and requires `503` even with the flag `'true'`, was re-run
  unmutated and still passes, because that function is deliberately never the
  dispatch door.

Five Workers-runtime test fixtures that modelled the old, inverted polarity as
"enabled" were updated to the corrected one, and an explicit on/off contrast
was added at both the unit level (`identity-primitives.workers.test.ts`,
against `resolveIdentityRuntime` directly) and the integration level
(`identity-runtime.workers.test.ts`, against `handleIdentityRuntime`): the
same configuration returns `null` with the flag `'false'` or `undefined`, and a
real dispatched `200` with it `'true'`. Full detail, including the exact
before/after test counts, is in `CF-EV-P7-OPS-006`.

**What this does not do.** No deployment was pushed, built, or rebuilt. The fix
lives in the working tree and was verified against the local Workers-runtime
harness only; Cloudflare Pages binds code at build time, so the deployment
measured in §6.1 predates this fix and cannot show it without a new build.
`CF-P7-013`'s second, independent blocker — no OAuth session is available to an
agent — is untouched by this fix and remains open regardless of it.

The honest reading is now **17 of 17 stories PASS**. `CF-P7-013` was the sole
remaining non-`PASS` story and was qualified on 2026-07-28 — see §6.0. §3, §6, §7, §10, and §11 below are amended
accordingly; nothing about the arithmetic-correction narrative in §2 above is
rewritten, because it is a historical record of a different, earlier mistake.

## 2B. `CF-P7-013` qualified — 2026-07-28

The story that had been open since the phase began is closed, and it closed the
way it always had to: a person signed in and used the software. No agent could
do it — obtaining an OAuth session means entering credentials at github.com —
and the record has said so since 2026-07-26.

Driven by the Product Owner on Preview deployment
`b2520460-8d70-4f83-972b-bc31f56f5a3a` (`1ef0b06`): **sign in with GitHub**,
**register this device**, **create a workspace**, **revoke this device**, and
**switch workspace**, all completed.

The corroboration is read-only SQL against the Preview D1 database, which is
evidence an agent can gather but not manufacture: `workspaces` holds 7 rows
created through this UI, each at `current_key_version` 1 with its creator as
sole member; `devices` holds 9 rows, 1 active and 8 revoked; `audit_events`
holds `workspace.created` ×10; and `workspace_key_envelopes` holds 10 unrevoked
rows. The envelopes are the load-bearing part — each was sealed in the browser
by the hand-written port in `js/collaboration/workspace-key-envelope.js` and
accepted by the server's own parser, so the port and `functions/_lib/e2ee` agree
on live data rather than only in a round-trip test.

Two journeys are **not** qualified and are not claimed: inviting someone and
having them accept, which needs a second real GitHub account, and resolving a
conflict, which needs two devices editing one document. The
`invitation.created` and `invitation.accepted` rows that exist in that database
are from the `CF-P6-008` and `G2-G3` runs of earlier phases.

**What driving it actually found.** Seven defects, every one invisible to the
whole suite beforehand, every one reachable only with a real session:
`resolveSession` read an enveloped body for a route that answers unenveloped, so
`authenticated` was *always* false; `beginSignIn` had the same defect and crashed
on `null`; every body-less mutation omitted `Content-Type` and was refused 415;
the acting-device header was never sent; `create-workspace` reads
`device.status` while `device-initialization` reads `device.state` and the entry
set only one; the create-workspace submit control could never enable, because
the only thing that told its model the typed name was the submit its disabled
state prevented; and the member list refused every row because it read a
`keyReadiness` field the route does not send.

Five of those seven are one mistake wearing different clothes: a fixture written
to match what the client assumed rather than what the server sends. A suite made
of such fixtures agrees with itself forever. That is the finding worth carrying
into Phase 8, more than any of the individual fixes.

## 2C. U2 survives a Live reload — 2026-07-29

The 2026-07-28 workspace-switch journey proved that the chrome and panel moved
together inside one browser session. It did not prove that the selection
survived a fresh load. That distinction was recorded rather than rounded up.

On Preview v2 deployment `e6048773-d133-4dbb-9ccc-7cd498e6ecff`
(`e09f732`), after the GitHub OAuth callback was updated to the canonical v2
origin, the Product Owner signed in, selected a workspace, performed a full
`Ctrl+R` reload, and confirmed the same workspace remained in the context
indicator and panel. U2 is now Live-qualified. The workspace name was not
retained because equality before and after reload is the criterion and no user
data beyond that verdict is required.

This closes U2 only. U3 through U6 remain open at `P7-G5`.

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
| CF-P7-016 | Correct the frozen error-to-presentation map | `cf:phase7:contract:check` | passes | `UI-012` | **PASS** |
| **CF-P7-013** | **Integrate and qualify on Preview** | `cf:phase7:preview:check` | **passes** | `OPS-001`…`OPS-005` — all five **PASS** | **PASS** |
| CF-P7-014 | Exit and Phase 8 handoff | `cf:phase7:exit:check` | passes | `EXIT-001` | **PASS** |
| CF-P7-017 | Dispatch the API shell on the flag | `cf:phase7:dispatch:check` | passes | `OPS-006` | **PASS** |

All evidence identifiers are `CF-EV-P7-…` under
`docs/collaboration-foundation/evidence/phase-7/`; **28** records are committed
there and all 28 are reconciled above. A story is PASS when its gate script
exists and passes, never on assertion — and, as of this story, when every
evidence record it names exists on disk, reads `Status: PASS`, and mentions the
story. `cf:phase7:exit:check` checks all three.

**Gate accounting.** Seventeen `cf:phase7:*` gates run inside `check:cloudflare`:
`sprint`, `contract`, `shell`, `account`, `create`, `device`, `members`,
`invitations`, `accept`, `sync`, `conflict`, `audit`, `qualify`, `api`,
`dispatch`, `preview`, `exit`. Sixteen of the seventeen are story gates of the
seventeen PASS stories — `contract` is shared, since `CF-P7-016` re-opened and
re-closed the frozen contract `CF-P7-001` had frozen, `dispatch` belongs to
`CF-P7-017`, and `exit` belongs to `CF-P7-014`. `cf:phase7:preview:check`
passes with its story after the Product Owner drove the signed-in journeys and
the later U2 reload requalification. `cf:phase7:sprint:check` gates the plan and
has no stated story owner, a hole the same shape as the one `CF-P7-015` was
created to close, and one Phase 8 closes by naming an owner rather than by
adding a story that does nothing else.

**What `cf:phase7:exit:check` proves, and what it cannot.** It proves the record
is internally consistent — the count, the story statuses across two manifests, the
journey claim across two manifests, the gate-and-evidence backing behind every
PASS, the sign-off provenance, the four `NO-GO` boundary keys — and it
re-measures the lazy chunk from the working tree on every run. It **cannot**
prove a journey nobody ran, and it is written so that it cannot appear to: it
refuses `CF-P7-013 = PASS` while `journeys_qualified` is `false`, and it computes
`P7-G5` from its conditions rather than reading a field. A reconciliation gate is
the weakest kind of gate in this programme and is labelled as such.

**Manifest corrections made by this story**, each because the manifest named
something that does not exist or no longer holds:

1. `CF-P7-013` remained `PARTIAL` in the original exit and later moved to
   `PASS` when the Product Owner drove the signed-in journeys (§2B). U2's
   survives-reload half was kept unclaimed until its separate Live
   requalification (§2C).
2. `CF-P7-013`'s evidence list named `CF-EV-P7-QA-001` and `CF-EV-P7-PERF-002`.
   Neither was ever written. It names the five `OPS` records that were, with the
   planned-but-unwritten pair retained in `evidence_planned_but_never_written` so
   the substitution stays visible.
3. `CF-P7-014` was `PARTIAL` and is now `PASS`: its gate, its manifest, its drift
   suite and `CF-EV-P7-EXIT-001` all exist. What it could not do — grant `P7-G5`
   — it does not do.
4. `CF-P7-016` and `CF-P7-017` were added to the plan. Both sit outside the
   linear gate chain and both say why; the sprint policy now requires that
   `out_of_sequence_reason` rather than silently accepting a broken chain.
5. `CF-P7-017` was `OPEN` and is now `PASS`: `D-P7-02` decided the owner
   question it was blocked on, its gate `cf:phase7:dispatch:check` and drift
   suite exist, and `CF-EV-P7-OPS-006` is written. §2A and §6.0 record what
   changed.

## 4. Gate UX criteria

| | Criterion | Evidence | Standing |
|---|---|---|---|
| U1 | Personal and workspace data never mixed | zero personal storage keys asserted by every surface gate; zero collaboration modules on Personal startup, measured on the deployment (`OPS-004`) | **held** |
| U2 | The user always knows which workspace they are in | `UI-002`, `OPS-002`; the Product Owner selected a workspace on Preview v2, reloaded with `Ctrl+R`, and confirmed the same context and panel | **held on Live Preview** |
| U3 | Role-disabled controls carry an explanation | `UI-005`, `A11Y-002`; 60 disabled controls, zero without an announced reason | held **for the composed surfaces**; not exercised through a live role |
| U4 | A local draft is never lost to a conflict | `UI-009`; dismissal decides nothing, discard needs arming and confirming | held **for the composed surfaces**; not exercised through a live conflict |
| U5 | Keyboard and focus meet the bar | `A11Y-004`; zero rings missing, lowest contrast 5.48:1 against a 3:1 floor | held locally; **not measured on the deployment** — the only surface that rendered there has zero focusable controls |
| U6 | Mobile and tablet layouts do not break | `UI-011`; zero overflow, clipped text, or sub-24 px targets across 18 measurements | held locally; **not measured on the deployment** — the measuring viewport reported `clientWidth: 0`, which is an instrumentation artifact and not a measurement |

U1 and U2 have evidence from the deployment. U3 and U4 hold for the surfaces as
composed and still depend on live role and conflict journeys to be exercised as
written. U5 and U6 hold locally and were explicitly **not** confirmed
against the deployment, for the reasons recorded in `CF-EV-P7-OPS-004` under
"Not evidenced". None of the six is withdrawn; U3 through U6 are not claimed as
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

## 6. OPEN — `CF-P7-013` and a budget that fails

`CF-P7-013` is **not PASS**. Two distinct things are open under it, plus the
budget in §6.2. A third — the dispatch bug this section used to carry as open —
closed within this same session and is recorded below as history, not as a
current blocker.

### 6.0 CLOSED — the dispatch bug, and the blocker that turned out to be bigger

The previous draft named one blocker: `COLLABORATION_ENABLED` was not carried by
the measured Preview build, and setting it plus rebuilding was an owner action.
**That action was taken.** The owner set `COLLABORATION_ENABLED` to `'true'`
for the Pages **Preview** environment, and `D-P7-01` is executed in
`wrangler.jsonc` (`local=false, preview=true, production=false`, asserted by
`cf:config:check` on every run).

Re-measured 2026-07-27, read-only, **before the fix below existed**:

| Request | Status |
|---|---|
| `GET …codex-cf-p3-preview.docvault-qa-document-hub.pages.dev/api/v1/session` | **503 `COLLABORATION_UNAVAILABLE`** |
| `GET …docvault-qa-document-hub.pages.dev/api/v1/session` | **503 `COLLABORATION_UNAVAILABLE`** |
| `GET …docvault-qa-document-hub.pages.dev/api/v1/workspaces` | **503 `COLLABORATION_UNAVAILABLE`** |

Nothing changed at that measurement, and the reason was in the code rather than
the configuration. `functions/_lib/api-shell.mjs` lines 285–293 computed
`hasReviewedDisabledState` and then returned the **identical** `503
COLLABORATION_UNAVAILABLE` on **both** branches. The value computed routed
nothing. But `api-shell.mjs` was never the actual door: `functions/api/v1/
[[path]].ts` already composed `handleIdentityRuntime`,
`handlePreviewKeyFoundationApi`, and `handlePreviewCollaborationApi` ahead of
it, and all three gate on `resolveIdentityRuntime(...).enabled`.
`functions/_lib/identity/environment.ts` line 67 enabled the identity runtime
**only when `COLLABORATION_ENABLED === 'false'`** — the opposite of what the
flag's name means and the opposite of the value `D-P7-01` set on Preview — so
all three doors reported disabled on Preview regardless, and every request fell
through to the always-`503` fallback.

**Resolved as `CF-P7-017`, `D-P7-02` in [`decision-log.md`](decision-log.md),
2026-07-27.** The two files agreeing with each other and disagreeing with the
deployment could have meant either was the mistake; the Product Owner broke the
tie as **Option A** — `environment.ts` is the bug — because `D-P7-01` is dated
one day earlier and its own text says the flag was set to `'true'` for Preview
*so that collaboration would be enabled there*. Reversing that the next day
would mean `D-P7-01` accomplished the opposite of what it was approved and
executed to do. `environment.ts:67`'s condition is corrected to
`COLLABORATION_ENABLED !== 'true'`; `api-shell.mjs`'s dead double-branch is
removed, with no observable behaviour change (`tests/api-shell.test.mjs`'s
NO-OP CONTROL, which requires `503` from that function alone even with the flag
`'true'`, was re-run unmutated and still passes). Full detail in
`CF-EV-P7-OPS-006`.

**What this closes and what it does not.** It closes the reason no `/api/v1/*`
route could ever answer anything but `503` regardless of configuration — that
reason is gone from the source as of this revision. It does **not** put a
working route on the wire: no deployment has been rebuilt from a commit
carrying the fix, and Cloudflare Pages binds code at build time, so the
deployment measured in §6.1 still shows the pre-fix behaviour and will continue
to until someone rebuilds it. §6.1 restates why that, and a second, independent
reason, keep `CF-P7-013` PARTIAL regardless.

**The boundary is intact and was measured, not assumed.** Production answers
`503` on `/api/v1/session` and `/api/v1/workspaces`. No regression — nothing was
deployed, then or in landing this fix.

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

**Two independent reasons, each sufficient on its own — one of them changed
today.** The first was §6.0: the API answered `503` to everything, on every
deployment, because of a dispatch bug. `CF-P7-017` closed that bug in the
working tree on 2026-07-27, but no deployment has been rebuilt to carry it, so
every deployment that exists today still answers exactly as measured above.
The second reason is independent of the dispatch bug, survives it being fixed,
and needs saying plainly, because it is the one that determines *who* can close
this story regardless of what else changes:

> **The journeys `CF-P7-013` must qualify are signed-in journeys, and no OAuth
> session is available to the agent.** Every one of them begins at an
> authenticated session. Obtaining one means entering GitHub credentials at
> `github.com`, which the permission boundary prohibits outright, and no session
> cookie was issued to or held by this story. **Qualifying `CF-P7-013` is an
> owner-driven exercise and always was.**

This is why `CF-P7-013` is recorded **PARTIAL** and not PASS, and why marking it
PASS "now that Preview is enabled" was measured against and refused: Preview is
not enabled in any sense visible on the wire, and even if it were, nobody signed
in. Recorded in `CF-EV-P7-OPS-005`.

**What is not claimed about the Pages project variable.** Wrangler exposes no read
path for Pages environment variables, so the owner's report that Preview carries
`'true'` is taken as given rather than verified from outside. It makes no
difference to the result: the shell does not route on it (§6.0). **Deployment
behaviour was measured; the project variable was not.**

**What closes it, in order, and what is already done.** `CF-P7-017` resolved
and landed **(done, this revision)** — a route can now answer something other
than `503`, once it is on a deployment. What remains: `codex-cf-p3-preview`
rebuilt from a commit carrying the fix — a new deployment id, not a
re-measurement of the one in the table above, since Pages binds code at build
time — and then the journeys driven by someone who can sign in. Both remaining
steps need an owner; no agent can push a commit that triggers a Pages build or
enter GitHub credentials. On record at `config/cloudflare/
phase-7-preview-integration.json` under `blocked_on` and at
`phase-7-sprint-plan.json` under `CF-P7-013.requalification`.

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

**Reconfirmed locally, and now by a gate.** `cf:phase7:exit:check` walks the
static import closure of `js/collaboration/entry.js`, gzips each module at level 9
with CRLF normalised to LF, and sums:

| Reading | Modules | gzip |
|---|---:|---:|
| Entry closure, recomputed locally on every gate run | 20 | **79.32 KiB** |
| Phase 7 modules only, recomputed locally | 17 | **65.27 KiB** |

Slightly above the deployment figures because `gzip -9` differs from Cloudflare's
dynamic compression and because `CF-P7-016` added mappings to `api-client.js`
after the deployment measurement was taken. Every reading breaches.

Four things about it matter more than the number:

- **Until this story, no gate measured it.** The key was read by nothing; no
  script under `scripts/` computed a byte size of any collaboration module.
  `CF-EV-P7-PERF-001` deferred the measurement to `CF-P7-013` in as many words,
  and `CF-P7-013` was the first time anyone looked. The budget was never wrong —
  it was never checked. **A budget no script reads is not a budget.**
- **The cause is structural.** There is no bundling or minification step. Twenty
  unminified source files are served with their comments intact. The figures are
  Cloudflare's dynamic compression of that, not a property of a build artifact,
  and the breach is stated about the configuration that currently ships.
- **It is neither met nor renegotiated.** It is recorded as OPEN. Renegotiating a
  budget to match what shipped is a decision, not an edit, and no such decision
  exists. `cf:phase7:exit:check` rejects any manifest or plan that changes the
  declared 60, and rejects a record that says `OPEN` once the measurement comes
  under — the check runs in both directions, so it cannot rot into a permanent
  excuse.
- **What the gate enforces is the record, not the size.** It fails if the recorded
  figure drifts more than 2 KiB from the recomputed one, if the breach disappears
  from this report or from the risk register, or if the options table is emptied.
  It deliberately does **not** fail the release chain on the breach itself: that
  would turn a recorded defect into a red build and force a decision this story
  has no authority to make. Enforcing the record is weaker than enforcing the
  size, and is labelled as such.

**Disposition: recorded as an open, owner-visible breach — option (b).** The
number was not amended and the modules were not shrunk. The options, none chosen:

| Option | Requires | Consequence |
|---|---|---|
| Renegotiate the budget on the record | Product Owner | A decision-log entry raising 60 to a number the current shape meets, with the reason. Cheapest, and it concedes the 60 was never derived from a measurement. |
| Add a build step and meet the declared 60 | Technical Lead | Minification and/or bundling of `js/collaboration/*` — the only route that shrinks the shipped bytes rather than enlarging the target. It changes how the whole app is built and would invalidate Phase 1's byte-for-byte artifact assertions. Needs its own story and gate. |
| Split the lazy chunk | Technical Lead + UX Lead | Load the eight panel surfaces on demand rather than through one entry closure. Keeps both the budget and the no-build property, at the cost of more dynamic imports and a second latency step the UX criteria never asked for. |
| Leave it open | no decision | The status quo. It stays visible here, in the risk register as **R-P7-B**, and in `phase-7-exit-gate.json`, and it keeps `open_defect` unsatisfied. |

Carried in the risk register as **R-P7-B** with the measurement and these
options, so it outlives this document. Phase 7's zero-tolerance list includes
`open_defect`. This is one. It is the proximate reason, alongside §6.0 and §6.1,
that `P7-G5` is not granted.

## 7. Residual risks

**R-P7-A — No journey has ever run against a deployment with collaboration on.**
Everything in §4 that is marked "held for the composed surfaces" rests on local
qualification with a stubbed or recording transport. The defects in §5 were found
by moving up a level of integration rather than by inspecting a module in place;
there is one level left, and it has not been reached. Owner: Product Owner.
Closed by `CF-P7-013` reaching PASS.

**R-P7-B — The lazy budget was renegotiated to 100 KiB. CLOSED.** §6.2. It was
breached by 31% against a declared 60, and `D-P7-03` raised the figure to 100 on
2026-07-28 with the measurement in front of the owner: the closure measures 91.93
KiB, so the budget now reads `MET`. The renegotiation is not a claim that the
payload shrank — it did not, and no build step was added. It records that the
programme carries 91.93 KiB knowingly, at a number an owner set, rather than
carrying a breach of a number nobody ever measured. 100 was chosen *against* the
measurement rather than from it: at 91.93 the budget would be unfalsifiable, since
the next byte breaches it.

The gate did not get weaker. It still re-measures on every run, still fails on
drift in either direction, and now also refuses a figure that moved without a
decision-log entry naming it — so the number can be renegotiated again, but not
quietly. The gap that allowed the original breach — a declared budget no script
read for the whole of a phase — outlives the number, and Phase 8 carries the
enforcing budget row for the rest of the programme's declared limits. Owner:
Technical Lead. **Renegotiated on the record, not met by shrinking.**

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
risk was the next commit: the first Phase 7 or Phase 8 surface to import either
module gets a working local build and a broken deployment, and the content-type
is the only place it shows. Owner: Technical Lead. **CLOSED 2026-07-28.**

`validateDeploymentArtifact` now asserts the artifact's own import closure is
complete — every relative specifier in every shipped `.js` resolves to a file the
artifact contains — and it runs inside both `build-pages.mjs` and
`check-deployment-boundary.mjs`, so it checks the artifact however it was
assembled rather than trusting the script that assembled it.

Writing that gate found that the recorded mechanism was not the whole story.
`build-pages.mjs` walks the module graph to a fixpoint, so it *does* pick up a
newly imported module — but its specifier pattern matched `from '…'` and
`import('…')` and **not** a bare `import './x.js';`. A module reached only by a
side-effect import was therefore left out of the artifact while the build
reported success: the deployment-only failure this risk describes, reachable
without anyone touching the excluded files. Confirmed by adding such an import to
`entry.js` — before the fix the module was absent from `_site`, after it is
present. Both patterns are now one expression, so the set the gate requires to be
present is the set the build decides to include; if they ever diverge, the
artifact is being checked against a graph nobody built it from.

Verified three ways on the real artifact: a clean build passes; an artifact whose
entry imports a module that is not there is rejected with the offending edge
named; and the previously-missed side-effect form is now both followed by the
build and caught by the gate.

**R-P7-D — `CF-P7-014` shipped without its own gate. CLOSED.**
`cf:phase7:exit:check` now exists: `scripts/cloudflare-phase-7-exit-policy.mjs`,
`scripts/check-cloudflare-phase-7-exit.mjs`,
`config/cloudflare/phase-7-exit-gate.json` and
`tests/cloudflare-phase-7-exit-policy.test.mjs`, wired into `check:cloudflare` and
into the pinned chain in `scripts/cloudflare-ci-policy.mjs`. The reconciliation in
§3 is enforced rather than asserted. The drift suite opens with a **no-op
control** — the unmutated repository must be accepted — because sixteen suites in
this programme were once green and vacuous for want of exactly that. Owner:
Senior QA. **Residual:** a reconciliation gate is the weakest kind, and §3 says so
in the gate's own terms.

**R-P7-E — The Phase 7 error-to-state map is incomplete. CLOSED by `CF-P7-016`
at `c08ccf1`,** which renamed the two non-existent spellings, mapped the seventeen
uncovered codes, and rewrote `cf:phase7:contract:check` to parse the catalog out
of `api-contract.md` and check coverage in **both** directions — the hole was that
the gate only checked codes that were *in* the map and never asked whether the
catalog held one the map lacked. A second hardcoded copy in the create-workspace
policy was removed the same way. Evidence `CF-EV-P7-UI-012`. The original
description follows, unedited, because it is the entry precondition Phase 8 was
told to wait for and the record of what was wrong is worth more than a struck-out
line. **The story is counted in the seventeen** — a sentence the previous draft
had to write the other way round.

`phase-7-ui-contract.md` §4 opened "Every code in
the frozen server taxonomy maps to exactly one presentation" and then maps
twelve, two of which (`UNAUTHENTICATED`, `RECENT_AUTHENTICATION_REQUIRED`) are
spellings in no catalog. The frozen catalog in `api-contract.md` §8 holds **29**
codes, so after the two renames the map covers twelve of twenty-nine and
seventeen server codes have no presentation at all. Three of the seventeen are
load-bearing in Phase 8's own scenarios. `phase-8-sprint.md` names the fix as a
**Phase 7** story, `CF-P7-016`, precisely so a later phase does not edit a frozen
contract and a closed phase's gate. Owner: Technical Lead. **This is an entry
precondition for Phase 8, not a Phase 8 story.**

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

1. **That draft reconciled the committed state at `d4d9ea6`** and made no claim
   about the uncommitted work. **`CF-P7-016` has since landed at `c08ccf1`**, so
   §2, §3 and R-P7-E are amended in this revision exactly as that sentence
   required. The prediction is left standing because it came true, and because a
   report that quietly deletes its own contingency is worth less than one that
   shows it being discharged.
2. **The gate results in the previous §8.1 were measured against a tree that kept
   changing underneath them.** They were true of the tree at the moment each gate
   ran and were not a claim about any commit. The run recorded in §8.1 of *this*
   revision is not in that position: `git status` was clean at `c08ccf1` when this
   story began, and the only changes in the tree are this story's own.
3. **Nobody should have committed that tree as one change.** Nobody did. The two
   agents' work landed as separate commits and this revision reconciles both.

**RESOLVED.** Owner: Product Owner.

**R-P7-H — The authoritative gate could not complete in the previous working
copy. CLOSED.** `npm run check` exited **127** at `cf:types:check`, on a pure
CRLF-versus-LF mismatch in a generated types file whose content and configuration
hash were unchanged. It now reports *"Types at `worker-configuration.d.ts` are up
to date"* and exits **0**, and the full chain completes (§8.1). This is recorded
as an environment condition that no longer holds rather than as a defect fixed
here: nothing in this story regenerated that file. The observation that made it
worse than cosmetic still stands and is worth carrying forward — a genuinely
drifted `worker-configuration.d.ts` produces the same message as a line-ending
mismatch, so the failure mode is *silent staleness in the other direction*, and a
libuv abort is easy to mistake for infrastructure noise. Owner: Operations.

**R-P7-I — The API shell never dispatched, and nothing noticed for seven
phases. CLOSED in the working tree; not yet observed on a deployment.**
`functions/_lib/api-shell.mjs` returned the identical `503
COLLABORATION_UNAVAILABLE` on **both** branches of its own feature check, and
independently, `functions/_lib/identity/environment.ts` gated the three real
dispatch doors on a flag read with the opposite polarity to its name, so every
`/api/v1/*` request answered `503` since Phase 1 regardless of configuration.
Phases 3 through 6 built identity, workspaces, RBAC, device and workspace keys,
and eight document routes behind it; all of them were qualified at the
persistence layer or through the Workers test harness, never through the shell
that fronts them in production. This is the same shape as finding #4 and #5 in
§5 — **a correct part-wise check is not a whole-system check** — at the largest
scale the programme has produced it. Closed as `CF-P7-017`, `D-P7-02`,
2026-07-27 (§6.0, `CF-EV-P7-OPS-006`): the polarity is corrected and the dead
branch is gone, verified against the local Workers-runtime harness. **Residual:**
no deployment has been rebuilt to carry the fix, so it has not been observed on
the wire, and `CF-P7-013`'s independent no-agent-session blocker is untouched.
Owner: Technical Lead.

The programme risk register carries 22 rows, `R01` through `R22`, with no open
unowned risk. Phase 7 opened none of them and closed none of them. The **nine**
above (`R-P7-A` through `R-P7-I`) are Phase 7 exit conditions: four are now
closed (`R-P7-D`, `R-P7-E`, `R-P7-H`, `R-P7-I`), one is resolved (`R-P7-G`), and
`R-P7-B` is additionally carried in the risk register itself under §4A so that
the open budget breach is visible to the owner outside this report. `R23` —
designated Preview identities are build-time configuration — is opened by
`CF-P8-001`.

## 8. Local verification

- `node scripts/check-cloudflare-phase-7-sprint.mjs` → passes on the amended
  plan: **17 of 17 stories PASS**, twelve owned surfaces, an unbroken gate chain
  over the sequenced stories, remote work behind `P7-G4`. The line it prints is
  now counted rather than spelled — the literal it used to print said "Fifteen
  stories" and was wrong by the time this story ran.
- `node scripts/check-cloudflare-phase-7-exit.mjs` → the new gate, passing, and
  printing the open budget defect and the five open items on every run.
- `npm run check` — the authoritative gate, run at the close of this story with
  its exit code captured directly and never through a pipe
  (`npm run check > file 2>&1; echo $?`). Result in §8.1.

### 8.1 The gate run that closes this story

Run on 2026-07-27 against `c08ccf1` plus this story's own changes and nothing
else. Unlike the previous draft's run (**R-P7-G**), the tree was not moving: it
was clean at `c08ccf1` when this story began, and every modified file below is
this story's.

```
npm run check > /tmp/close.txt 2>&1; echo $?
0
```

**The real exit code is 0.** It was captured with `; echo $?` after a redirect
and never through a pipe. The whole chain ran to completion; no gate was skipped
and none was run individually to substitute for it.

| Stage | Result |
|---|---|
| `check:base` → `scripts/quality-check.mjs` | passed — 23 JavaScript files, 30 local HTML references, 36 offline shell assets, 375 static UI strings |
| `check:base` → `check:functions` (`tsc --project tsconfig.functions.json`) | passed, no output |
| `check:base` → `npm test` (`node --test tests/run.mjs`) | **1152 tests, 1152 pass, 0 fail, 0 skipped, 0 todo.** 1086 before this story; the 66 added are the `cf:phase7:exit:check` drift suite |
| `check:cloudflare` → `cf:toolchain:check` | passed |
| `check:cloudflare` → `cf:config:check` | passed — `local=false, preview=true, production=false`; one approved Preview D1 binding, zero production bindings |
| `check:cloudflare` → `cf:types:check` | **passed** — *"Types at `worker-configuration.d.ts` are up to date"* |
| `check:cloudflare` → `cf:burst:*`, `test:collab:unit`, `cf:test`, `cf:rollback:rehearse`, `cf:pages:dry-run` | all passed; `cf:test` = 20 tests, 20 pass |
| `check:cloudflare` → `cf:phase1:*` … `cf:phase6:*` | all passed |
| `check:cloudflare` → `cf:phase7:*` — `sprint`, `contract`, `shell`, `account`, `create`, `device`, `members`, `invitations`, `accept`, `sync`, `conflict`, `audit`, `qualify`, `api`, `preview`, `exit` | **16 of 16 exit 0**, including the new exit gate |

**`R-P7-H` is closed, and how it closed matters.** The previous draft recorded
`cf:types:check` aborting with exit **127** — `wrangler types --check` reporting
the types out of date and then crashing inside libuv with
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`. It was diagnosed there
as a CRLF-versus-LF mismatch in a generated file whose content and configuration
hash were unchanged, and deliberately not fixed, on the grounds that quietly
regenerating a tracked file would make a report's gate run look green without any
Phase 7 claim becoming more true. It now passes. **Nothing in this story touched
`worker-configuration.d.ts` or `wrangler.jsonc`**, so this is recorded as an
environment condition that stopped holding, not as a fix. The observation that
made it worth recording still stands: a genuinely stale types file produces the
same message as a line-ending mismatch, so a passing `cf:types:check` is weaker
evidence than it looks.

**What a green chain does and does not establish.** It establishes that every
gate this programme has written agrees with the repository. It establishes
nothing about the deployment, because no gate in the chain makes a network
request — `cf:phase7:preview:check` reconciles a manifest of measurements taken
by hand, and `cf:pages:dry-run` does not deploy. The one Phase 7 claim that a
green chain cannot support is the one Phase 7 is missing (§6.1), and the chain
being green is not offered as consolation for it.

### 8.2 The gate run that closes `CF-P7-017`, in the same session

Run on 2026-07-27 against this story's own changes on top of `c08ccf1`, in the
same working tree §8.1 describes, with `CF-P7-017` decided (`D-P7-02`) and
landed in between.

```
npm run check > /tmp/close-cf-p7-017.txt 2>&1; echo $?
0
```

**The real exit code is 0.** Captured the same way as §8.1: a redirect, then
`; echo $?`, never a pipe.

| Stage | Result |
|---|---|
| `check:base` → `npm test` (`node --test tests/run.mjs`) | **1162 tests, 1162 pass, 0 fail, 0 skipped, 0 todo.** 1152 before this story; the 10 added are `cloudflare-phase-7-dispatch-policy.test.mjs`'s drift suite |
| `check:cloudflare` → Workers-runtime suite (`node_modules/vitest` across all 35 `*.workers.test.ts` files) | **249 tests, 249 pass** across all 35 files, including the two files this story amended |
| `check:cloudflare` → `node --test tests/api-shell.test.mjs` (run standalone to confirm no drift) | **13 tests, 13 pass** — unchanged from before this story |
| `check:cloudflare` → `cf:phase7:*` — the same sixteen gates as §8.1, plus `cf:phase7:dispatch:check` | **17 of 17 exit 0** |

**What moved and what did not, compared to §8.1.** The story-gate count moved
from sixteen to seventeen; the story-PASS count moved from fifteen to sixteen
(§2A); the Node test count moved from 1152 to 1162. `P7-G5` did not move: it was
`NOT GRANTED` at `c08ccf1` and is `NOT GRANTED` now, for `CF-P7-013` and the
lazy-chunk budget, neither of which this story touched.

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
- It was **not** read as authorization for `CF-P7-017`, which needed a separate,
  specific decision about the collaboration flag's polarity and about activating
  the Phase 3–6 stack on a publicly reachable preview alias (§6.0). That separate
  decision was subsequently obtained and is recorded as `D-P7-02` in
  `decision-log.md`, dated 2026-07-27 — distinct from, and later than, the
  blanket instruction above. A blanket instruction to finish the exit paperwork
  was not, and is not read as having been, consent to switch a system on.

Every one of these constraints is pinned in
`config/cloudflare/phase-7-exit-gate.json` under `sign_off`, where
`independent_reviewers_exist`, `independent_security_or_privacy_review_performed`,
`line_by_line_reading` and `grants_p7_g5` are all `false` and
`cf:phase7:exit:check` rejects any of them being flipped to `true`. The record
cannot be quietly upgraded into a claim of seven independent reviews later, which
is the only durable protection a single-maintainer sign-off has.

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
| Every story PASS | **yes** — all 17 stories PASS |
| Zero open defect | **yes** — the lazy chunk budget was renegotiated to 100 KiB by `D-P7-03` and measures 91.93 KiB, so it is `MET` (§6.2); no other defect is open |
| Every gate exists and passes | yes — `cf:phase7:exit:check` shipped with this story; seventeen `cf:phase7:*` gates run inside `check:cloudflare` |
| Sprint gate criteria U1–U6 qualified | **partial** — U1 and U2 qualified on the deployment; U3–U6 held locally only (§4) |
| Zero unowned or expired Critical/High risk | yes — 22 register rows, all owned; nine Phase 7 exit risks, all owned |
| `npm run check` green with a real exit code | yes — exit **0** (§8.1), captured after a redirect and never through a pipe |

Five of the six conditions are met. The remaining condition is categorical:
U3 through U6 still need Live evidence. **`P7-G5` is therefore NOT GRANTED**,
and no combination of paperwork can change that. Phase 7 remains open, and
[`phase-8-handoff.md`](phase-8-handoff.md) — issued by this story — becomes
controlling on the grant and not before.

The gate refuses to record it otherwise. `cf:phase7:exit:check` computes
grantability from every story being PASS, no open defect, and every row of this
table being met, and rejects the manifest if `exit_gate_granted` disagrees with
what it computed. Setting the flag by hand fails the release chain.

Granting it needs, in order:

1. ~~An owner decision on the collaboration flag's polarity~~ **(done —
   `D-P7-02`, §6.0)**: the Product Owner decided `environment.ts` was the bug.
2. ~~`CF-P7-017` implemented and gated~~ **(done)**: the shell's real dispatch
   doors now activate when the flag is on and still refuse when it is off,
   proved both ways by `identity-runtime.workers.test.ts` and
   `identity-primitives.workers.test.ts`, and gated by `cf:phase7:dispatch:check`.
3. ~~**Preview rebuilt from the corrected dispatch**~~ **(done)** — Preview v2
   deployment `e6048773` carries source `e09f732`.
4. **U3 through U6 qualified by people and devices able to drive their Live
   journeys.** U2 was closed by the Product Owner on 2026-07-29; the remaining
   role, invitation, conflict, keyboard, and responsive journeys are still open.
5. ~~**The 60 KiB budget met or renegotiated on the record**~~ **(done —
   `D-P7-03`)**: the budget is 100 KiB and the measured closure is 91.93 KiB.

Four items from earlier drafts' lists are now done and are struck from it:
`CF-P7-016` closed the error-map gap (R-P7-E), `cf:phase7:exit:check` exists so
this reconciliation is enforced rather than asserted (R-P7-D), setting
`COLLABORATION_ENABLED` for the Preview environment is done (which is how items
1 and 2 above were found to be necessary but not sufficient), and `CF-P7-017`
itself is now done. The Preview rebuild and U2 owner-driven session are also
done. What remains is Live qualification of U3 through U6.

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
assertions across four closed phases, plus the four `NO-GO` keys this story's own
gate now checks. Measured on 2026-07-27 rather than assumed: production answers
`503 COLLABORATION_UNAVAILABLE` on `/api/v1/session` and `/api/v1/workspaces`.

`CF-P7-017` was the one story that could move this boundary, and the
requirement written into it was explicit: **dispatch when the flag is on, keep
answering `503` when it is off.** It closed against exactly that requirement,
not a looser one: `tests/api-shell.test.mjs`'s NO-OP CONTROL, which requires
`503` from the fallback shell alone even with the flag `'true'`, was re-run
unmutated and still passes, so the fix did not weaken the off-path to make the
on-path work. It moved the boundary in the working tree only — no deployment
was rebuilt, so production's own boundary (still `503`, still measured above)
is unchanged, and Preview's boundary moves only once someone rebuilds it.

Every measurement behind this report was read-only. No write request was issued,
no database was touched, no secret was read or set, no credential was entered,
and no authenticated session was obtained or attempted. Nothing was deployed by
this story: no push to `codex-cf-p3-preview`, no merge, no new Pages deployment.
`CF-P7-017`'s fix was committed to the local working tree and verified against
the local Workers-runtime harness; it was not pushed or deployed either.
