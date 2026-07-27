# CF-EV-P7-EXIT-001 Phase 7 exit reconciliation

Status: PASS

Story: `CF-P7-014` — exit gate `P7-G5` (**not granted**)

Assembled on: 2026-07-27
Assembled against: `c08ccf1`, plus this story's own changes
Gate: `cf:phase7:exit:check` → `scripts/check-cloudflare-phase-7-exit.mjs`

This record is PASS about `CF-P7-014`, which is a story, and says nothing about Phase 7,
which does not close. Those are different claims and the distinction is the point of the
document.

## 1. What this story delivered

| Deliverable | Path |
|---|---|
| Exit report, completed | `docs/collaboration-foundation/phase-7-exit-report.md` |
| Phase 8 handoff | `docs/collaboration-foundation/phase-8-handoff.md` |
| Exit gate manifest | `config/cloudflare/phase-7-exit-gate.json` |
| Exit policy module | `scripts/cloudflare-phase-7-exit-policy.mjs` |
| Exit gate script | `scripts/check-cloudflare-phase-7-exit.mjs` |
| Drift suite | `tests/cloudflare-phase-7-exit-policy.test.mjs` |
| Re-qualification record | `CF-EV-P7-OPS-005` |
| This record | `CF-EV-P7-EXIT-001` |

`cf:phase7:exit:check` is wired into `check:cloudflare` in `package.json` and into the
pinned chain string in `scripts/cloudflare-ci-policy.mjs`, so it cannot be dropped from
the release gate without failing a different one. It closes **R-P7-D**, which recorded
that `CF-P7-014` had shipped without the gate its own plan required.

## 2. The arithmetic, and why it is now a computation

Phase 7 has **seventeen** stories, `CF-P7-001` through `CF-P7-017`, of which
**fifteen** are PASS.

Four documents once read **"13 of 14"**. That was wrong in both terms:

- **Denominator.** It counted the highest number in the *sequence* column. `CF-P7-015`
  was added after the plan was frozen and took the next free identifier, so the highest
  id ran ahead of the last sequenced story and anyone reading the table by eye stopped
  at fourteen.
- **Numerator.** It then went stale a second time when `CF-P7-016` landed (PASS) and
  `CF-P7-017` was opened (OPEN).

Both errors flattered. "13 of 14" reads as one story outstanding; the truth was two, and
is now three.

The count is no longer spelled anywhere that matters. `STORY_IDS` in
`scripts/cloudflare-phase-7-exit-policy.mjs` is the single inventory;
`cf:phase7:exit:check` computes `passing.length` and `STORY_IDS.length` and **requires
the exit report's status line to contain the computed string**. The same gate requires
`story_count` in both `phase-7-exit-gate.json` and `phase-7-sprint-plan.json` to equal
the inventory length, and requires every story's status to be identical in both files.
`check-cloudflare-phase-7-sprint.mjs` now counts instead of printing a literal — the old
literal said "Fifteen stories" while the plan held seventeen, which is the same failure
in miniature and is why it was changed.

One sentence was deliberately **not** corrected: `phase-7-sprint.md` and the
`CF-P7-015` entry in the sprint plan both say the story is numbered after "the original
fourteen". That is historically true, and rewriting it would erase the fact the sentence
exists to preserve.

## 3. What the gate actually checks

Reconciliation gates are easy to write so that they pass by construction. These do not:

1. **The count is computed, not read.** The document must carry the number the manifest
   computes from its own story list.
2. **A PASS story must name a gate that exists** in `package.json` and start with
   `cf:phase7:`, and every evidence identifier it names must exist on disk, read
   `Status: PASS`, and mention the story. Nine of the twenty-five committed Phase 7
   evidence records are not PASS or belong to non-PASS stories; the gate distinguishes.
3. **Cross-file agreement.** Story statuses in the exit manifest and in the sprint plan
   must match; `journeys_qualified` in the exit manifest and in
   `phase-7-preview-integration.json` must match.
4. **`CF-P7-013` is pinned in both directions.** It may not be PASS while no journey is
   qualified, and it may not be PARTIAL once one is.
5. **The budget is re-measured on every run** (§4).
6. **`P7-G5` is a consequence.** The gate computes grantability from every story being
   PASS, no open defect, and every condition row being met, and requires
   `exit_gate_granted` to equal that. Setting it to `true` by hand fails.
7. **Sign-off provenance cannot be upgraded.** `independent_reviewers_exist`,
   `independent_security_or_privacy_review_performed`, `line_by_line_reading` and
   `grants_p7_g5` are all pinned `false`, and the report must still contain the words
   that disclose it.
8. **The boundary.** The four `NO-GO` keys, and the report must still contain
   *production never activates collaboration*.

`tests/cloudflare-phase-7-exit-policy.test.mjs` breaks each of these one at a time and
asserts the policy rejects it. It opens with a no-op control — the unmutated repository
must be **accepted** — because a drift suite whose input is already broken passes every
case while checking nothing, which this programme has been bitten by before. Source
mutations assert the replacement changed the text before asserting the rejection, for
the same reason: a `\n` pattern silently fails to match on a CRLF working copy.

## 4. The lazy-chunk budget: measured here, and open

`config/cloudflare/phase-7-sprint-plan.json` declares
`lazy_phase_7_chunk_max_kib_gzip: 60`. Until this story **no script read that key** and
no gate computed the byte size of any collaboration module.

`measureLazyChunk()` walks the static import closure of `js/collaboration/entry.js`,
gzips each module at level 9 with CRLF normalised to LF, and sums:

| Reading | Modules | gzip | Against 60 KiB |
|---|---:|---:|---|
| Entry closure, local | 20 | **79.32 KiB** | over by 19.32 |
| Phase 7 modules only, local | 17 | **65.27 KiB** | over by 5.27 |
| Entry closure, on the deployment (`CF-EV-P7-OPS-004`) | 20 | **78.4 KiB** | over by 18.4 (+31%) |
| Phase 7 modules only, on the deployment | 17 | **64.3 KiB** | over by 4.3 |

The local figures are slightly larger than the deployment's because `gzip -9` differs
from Cloudflare's dynamic compression and because `CF-P7-016` added mappings to
`api-client.js` after that measurement was taken. Every reading breaches.

**The disposition is (b): recorded as an open, owner-visible breach.** The number was
**not** amended and the modules were not shrunk. Four options with their owners are in
`config/cloudflare/phase-7-exit-gate.json` under `lazy_chunk_budget.options`, repeated
in §6.2 of the exit report and in the risk register as **R-P7-B**; the gate prints them
under `OWNER DECISION REQUIRED` on every run.

The gate is bidirectional, which is the part worth keeping: the recorded measurement must
stay within 2 KiB of what is recomputed, so the record cannot go stale or be fabricated;
and `status` must be `OPEN` **exactly while** the measurement exceeds the budget, so a
future commit that brings the size under and leaves the breach recorded also fails. What
the gate does **not** do is fail the chain on the breach itself. That would have made
`npm run check` red on a defect that is recorded rather than denied, and it would have
forced the choice this story is not authorised to make.

## 5. The authoritative gate run

```
npm run check > /tmp/close.txt 2>&1; echo $?
0
```

The exit code was captured with `; echo $?` after a redirect and never through a pipe.
The whole chain ran to completion: **1152 tests, 1152 pass, 0 fail, 0 skipped, 0 todo**
(1086 before this story; the 66 added are this gate's drift suite), and **16 of 16**
`cf:phase7:*` gates exit 0. No gate was run individually to stand in for the chain.

**`cf:types:check` passes.** `R-P7-H` recorded it aborting with exit `127` on a
CRLF-versus-LF mismatch in `worker-configuration.d.ts`; it now reports
*"Types at worker-configuration.d.ts are up to date"* and exits `0`. The risk is closed
as an environment condition that no longer holds, not as a defect that was fixed here.

## 6. What this record does not claim

- **It does not claim Phase 7 closed.** `P7-G5` is **NOT GRANTED**. `CF-P7-013` is
  PARTIAL, `CF-P7-017` is OPEN, and the lazy-chunk budget is an open defect against a
  zero-tolerance list that includes `open_defect`.
- **It does not claim a journey ran.** None did. See `CF-EV-P7-OPS-005`.
- **It does not claim independent review.** One person holds all seven roles and gave one
  blanket in-session instruction. No independent security review occurred and no
  independent privacy review occurred.
- **It does not claim the gate proves the product.** `cf:phase7:exit:check` proves the
  record is internally consistent and re-measures one budget. A reconciliation gate cannot
  supply a journey nobody ran, and this one is written so that it cannot appear to.
