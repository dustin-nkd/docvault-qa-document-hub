# Collaboration Foundation Phase 8 sprint — Verification

Status: **PLANNED — awaiting `P8-G0`**

Entry: Phase 7 has **not** closed. `CF-P7-013` is not PASS, `CF-P7-017` is not
started, and `P7-G5` is not granted. Phase 7 has **seventeen** stories,
`CF-P7-001` through `CF-P7-017`; **fifteen** of them are PASS. Sixteen
`cf:phase7:*` gates run inside `check:cloudflare` — `sprint`, `contract`,
`shell`, `account`, `create`, `device`, `members`, `invitations`, `accept`,
`sync`, `conflict`, `audit`, `qualify`, `api`, `preview`, `exit`.

The status line of [`phase-7-exit-report.md`](phase-7-exit-report.md) once read
**"13 of 14"** while the table directly beneath it listed more rows than that.
**`CF-P7-014` corrected it on 2026-07-27**, first to "13 of 15" and then, once
`CF-P7-016` had landed and `CF-P7-017` had been opened, to the present
**"15 of 17"**; the correction is recorded in §2 of that report rather than made
silently. Two things were wrong, not one. The *denominator* was wrong because
`CF-P7-015` took the next free number after the plan was frozen, so the highest
identifier ran ahead of the last story in *sequence* and anyone reading the table
by eye stopped early. The *numerator* then went stale when the two later stories
arrived. Neither is a sentence any more: `config/cloudflare/phase-7-sprint-plan.json`
carries `story_count: 17`, and `cf:phase7:exit:check` computes both terms from the
story inventory and **fails if the exit report's status line does not carry the
computed string**. `check-cloudflare-phase-7-sprint.mjs` counts rather than
printing a literal, for the same reason: its literal said "Fifteen stories" while
the plan held seventeen.

That arithmetic is not a pedantic point. `cf:phase7:preview:check` **passes**
while `CF-P7-013` is **not PASS**, because the gate correctly asserts a
fail-closed deployment and the story needs a qualified journey. A green gate is
not a closed story. Phase 8 is the phase most likely to confuse the two, so the
distinction is stated at the top.

Phase 8 opens on the grant of `P7-G5` and not before. The controlling document is
[`phase-8-handoff.md`](phase-8-handoff.md), which `CF-P7-014` has now issued
ahead of that grant: it exists, it names the four unmet entry conditions, and it
states in its own status line that it becomes controlling only when `P7-G5` is
granted. This plan was written against the Phase 7 exit report and the frozen
contracts rather than against the handoff, and nothing below has been rewritten
to depend on it.

## Governing principle

Phase 8 adds **no** route, no table, no migration, no persisted field, and no
cryptographic, persistence, or authorization primitive. It is the verification
layer over everything Phases 1 through 7 built. Where a suite finds a defect, the
fix lands in the phase that owns the code, under that phase's contract, and
Phase 8 records the finding — it never patches a service from inside a test. The
path from a finding to a fix to a re-verification is itself owned; see
**What happens to a finding**.

The one thing Phase 8 does add is measurement, and measurement is the easiest
thing in this programme to fake. Phase 7 shipped eleven passing gates over a
feature that could not reach the network, two drift tests whose mutation never
applied, and a deployment claim measured on a build that did not contain the
modules being claimed about. Each of those was a *passing* result. This sprint
exists because the difference between a suite that verifies and a suite that
reports success is not visible from the exit code.

## Entry preconditions

Three conditions must hold before `P8-G0` is approved. None is negotiable and
none can be satisfied from inside a Phase 8 story.

**1. `P7-G5` is granted.** That requires `CF-P7-013` to reach PASS, which
requires `COLLABORATION_ENABLED = 'true'` on the Preview environment per
`D-P7-01` and a redeploy, because Pages binds environment variables at build
time. Until then every collaboration route on Preview answers
`503 COLLABORATION_UNAVAILABLE` and no journey can be qualified anywhere except
locally.

**2. The Phase 7 error-to-state map is corrected, by Phase 7.**
[`phase-7-ui-contract.md`](phase-7-ui-contract.md) §4 opens with "Every code in
the frozen server taxonomy maps to exactly one presentation" and then maps
twelve. Two of the twelve — `UNAUTHENTICATED` and
`RECENT_AUTHENTICATION_REQUIRED` — are spellings that exist in no catalog. The
frozen catalog in [`api-contract.md`](api-contract.md) §8 has **29** codes. So
the real defect is not two misspellings: after the two renames to
`AUTHENTICATION_REQUIRED` and `REAUTHENTICATION_REQUIRED`, the map covers twelve
of twenty-nine and **seventeen server codes have no presentation at all**:
`INVALID_JSON`, `INVALID_CURSOR`, `INVALID_PRECONDITION`, `SESSION_EXPIRED`,
`DEVICE_NOT_AUTHORIZED`, `KEY_PROVISIONING_REQUIRED`, `METHOD_NOT_ALLOWED`,
`NOT_ACCEPTABLE`, `STATE_TRANSITION_INVALID`, `FINGERPRINT_CHANGED`,
`INVITATION_UNAVAILABLE`, `LAST_OWNER_REQUIRED`, `LIFECYCLE_POLICY_UNAVAILABLE`,
`PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_ENVELOPE`, and
`INTERNAL_ERROR`. Three of those are load-bearing in Phase 8's own scenarios:
`G2` requires `INVITATION_UNAVAILABLE`, and `CF-P8-006` requires
`METHOD_NOT_ALLOWED` and `LAST_OWNER_REQUIRED`.

The easier option is to fix this from inside `CF-P8-001`, as a side effect of the
Phase 8 contract freeze. That is rejected. `phase-7-ui-contract.md` is frozen
under `CF-P7-001` — "a surface, a state, or a mapping may not be added or removed
as an implementation detail. Changing it takes a new story" — and Phase 7 is
still open. Editing a frozen contract and a closed-phase gate from a later phase
is exactly the move this programme forbids everywhere else. The correction is a
**Phase 7 story**, `CF-P7-016`, under `D-P7-01`'s precedent: seventeen new
mappings and two renames, with the amendment to `cf:phase7:contract:check` in the
same commit as the contract change, so no window exists in which the two
disagree. `CF-P8-004` then asserts the corrected map against the twenty-nine-code
catalog and finds a complete map rather than a rename.

**3. Three designated GitHub identities are on the Preview allowlist.** This is
the precondition most likely to cost the sprint weeks, and it already has.

Phase 6 spent four failed attempts and a wrong diagnosis on exactly this. A
second account could not authenticate; the callback returned the deliberately
non-disclosing `auth-result=unavailable`; the cause was neither rate limiting nor
state validation but `guardedProvider` in
`functions/_lib/identity/runtime-handler.ts`, which rejects any resolved identity
whose numeric subject is absent from `PREVIEW_ALLOWED_GITHUB_SUBJECTS`. That is a
deliberate Preview control working as designed. Adding the subject and
redeploying resolved it immediately.

Phase 8 needs **three** subjects, not two, because the mandatory scenarios
require an Owner, a second writer, and a Viewer to hold their roles at the same
time in the same workspace. Membership role is per user per workspace and the
server derives the actor from the session, so two cookie jars for one subject is
one user, not two. Two identities would work only by demoting the second account
from Editor to Viewer between scenarios, which makes every scenario's
precondition depend on the previous scenario's mutation and makes a failure
mid-run unattributable. That is the easier configuration and it is rejected.

This is recorded as risk **R23 — designated Preview identities are build-time
configuration**, opened by `CF-P8-001` with Operations as contract owner and
Senior QA as evidence owner, and tracked alongside `R17` and `R20`. Its trigger
is any authentication attempt from an undesignated subject; its indicator is
`auth-result=unavailable` at the callback. `CF-P8-001` must confirm all three
subjects are designated **and that the deployment serving them was built after
the allowlist changed**, because the allowlist is not a runtime value.

The identities are real GitHub accounts belonging to the project owner, exactly
as in Phases 6 and 7. No Phase 8 evidence record may describe them as synthetic.

## The fifteen test layers

Each layer is owned by exactly one story except where the table says otherwise.
One story owns one thing; nothing ships half-owned.

| # | Layer | Story |
|---|---|---|
| 1 | **Unit** — crypto vectors, validation, the derived RBAC expectation table, conflict calculator | CF-P8-002 |
| 2 | **D1 integration** — migrations, transactions, constraints | CF-P8-003 |
| 3 | **API contract** — routes, taxonomy, cursors, idempotency, cache policy | CF-P8-004 |
| 4 | **Session, CSRF, OAuth abuse** | CF-P8-005 |
| 5 | **Authorization fuzzing over workspace and document IDs** | CF-P8-006 |
| 6 | **Rate limit and resource exhaustion** | CF-P8-007 |
| 7 | **Credential-category eligibility** | CF-P8-008 |
| 8 | **XSS, encrypted-field rendering, and the canary scan** | CF-P8-009 |
| 9 | **CSP, security headers, dependency, SBOM, provenance** | CF-P8-010 |
| 10 | **Two-context browser journeys** | CF-P8-011, CF-P8-012, CF-P8-013, CF-P8-014 |
| 11 | **Accessibility** | CF-P8-015 |
| 12 | **Delivery budgets on the built artifact** | CF-P8-016 |
| 13 | **Operational and resilience rehearsal** | CF-P8-017 |
| 14 | **Performance and load on Preview** | CF-P8-018 |
| 15 | **The deployed fallback origin** | CF-P8-019 |

Three groupings are deliberate.

Layer 9 is one story because every one of its claims is a property of what
actually ships — the built `_site` artifact, the committed lockfile, and the
generated bill of materials — and none of them needs a database or a browser.
Splitting them would produce stories that read the same two files.

Layer 10 spans four stories because the journeys need different machinery, not
because the layer is large. `CF-P8-011` owns the two-identity harness and the
five ordered collaboration journeys. `CF-P8-012` owns the journeys where
authority changes underneath a live client. `CF-P8-013` owns the journeys where
the transport disappears underneath a live client. `CF-P8-014` owns the journeys
that must prove a *backend is never reached at all*. Merging them would put four
of the ten acceptance scenarios inside one story, and a story that owns four
scenarios can pass with three.

Layers 14 and 15 are split from everything else by where they can honestly be
measured, and from each other by which authorization they need. Preview is one
environment behind `P8-G4`. The GitHub Pages origin is a **live public
production surface** behind its own `P8-G4B`, and folding it into the Preview
story would let one authorization carry the other.

## Stories

| Story | Title | Entry | Authorization | Exit |
|---|---|---|---|---|
| CF-P8-001 | Freeze the verification contract, the ten scenarios, the derived RBAC expectations, and the measurement method | P8-G0 | — | P8-G1 |
| CF-P8-002 | Unit layer: crypto vectors, request validation, the 230 RBAC expectations, the conflict calculator | P8-G1 | — | P8-G2 |
| CF-P8-003 | D1 integration layer: migrations, transactions, and constraints | P8-G2 | — | P8-G2A |
| CF-P8-004 | API contract layer: routes, the 29-code taxonomy, cursors, idempotency, cache policy | P8-G2A | — | P8-G2B |
| CF-P8-005 | Session, CSRF, and OAuth abuse layer | P8-G2B | — | P8-G2C |
| CF-P8-006 | Authorization fuzzing over workspace and document identifiers | P8-G2C | — | P8-G2D |
| CF-P8-007 | Rate-limit and resource-exhaustion layer | P8-G2D | — | P8-G2E |
| CF-P8-008 | Credential-category eligibility across every collaboration entry path | P8-G2E | — | P8-G2F |
| CF-P8-009 | XSS, encrypted-field rendering, and the four-class canary scan | P8-G2F | — | P8-G3 |
| CF-P8-010 | CSP, security-header, dependency, SBOM, and provenance regression | P8-G3 | — | P8-G3A |
| CF-P8-011 | Two-context E2E harness and the five collaboration journeys | P8-G3A | — | P8-G3B |
| CF-P8-012 | Revocation journeys: removed member with a live session, revoked device | P8-G3B | — | P8-G3C |
| CF-P8-013 | Offline edit, reload, and reconnect journey | P8-G3C | — | P8-G3D |
| CF-P8-014 | Isolation journeys: Personal Vault unchanged, Guest silent, fallback silent | P8-G3D | — | P8-G3E |
| CF-P8-015 | Accessibility over live journeys, scanned and walked | P8-G3E | — | P8-G3F |
| CF-P8-016 | Delivery budgets measured on the built artifact | P8-G3F | — | P8-G3G |
| CF-P8-017 | Operational and resilience rehearsals on disposable resources | P8-G3G | — | P8-G3H |
| CF-P8-018 | Qualify the ten scenarios and the latency budgets on Preview | P8-G3H | **P8-G4** | P8-G4A |
| CF-P8-019 | Qualify the fallback claim on the live GitHub Pages origin | P8-G4A | **P8-G4B** | P8-G4C |
| CF-P8-020 | Freeze the release-candidate API, schema, and crypto vector versions | P8-G4C | — | P8-G4D |
| CF-P8-021 | Assemble Phase 8 exit and Phase 9 handoff | P8-G4D | — | P8-G5 |

The chain is unbroken: the exit gate of each story is literally the entry gate of
the next, from `P8-G0` to `P8-G5`, and no chain gate appears twice.

The **Authorization** column is separate from the entry column on purpose.
Phase 8 has two remote authorizations, not one, so blurring them into the entry
column would hide which approval covers which environment. `P8-G4` and `P8-G4B`
are not milestones in the chain; they are **separate authorizations**, exactly as
`P6-G4` and `P7-G4` were, and holding `P8-G3H` or `P8-G4A` alone authorizes
nothing remote.

- **`P8-G4`** authorizes `CF-P8-018` to reach the **Preview** deployment. It
  authorizes no other environment.
- **`P8-G4B`** authorizes `CF-P8-019` to reach the **GitHub Pages origin**, which
  is a live public surface, read-only, over HTTP. It authorizes no write, no
  session, and nothing on Cloudflare.

No story before `CF-P8-018` may touch a deployed environment. `CF-P8-014` proves
the fallback's behaviour against a locally served copy of the built `_site` and
makes no network claim about the deployed origin; that claim belongs to
`CF-P8-019` and is measured there. No gate in this sprint is granted by a passing
script, and **no agent grants either authorization**: an agent may prepare the
change, write the request, and run the checks, but the approval is a human
decision recorded in [`decision-log.md`](decision-log.md), and each remote gate
script fails when its manifest claims an authorization whose decision-log entry
does not exist.

Approval of `P8-G0` authorizes **`CF-P8-001` only**. It does not authorize the
suites, the fuzz corpus, the load driver, the rehearsals, Preview access, the
fallback origin, or any later story.

Each story ships an automated policy check wired into `check:cloudflare`, in the
pattern Phases 3 through 7 established: a runner
`scripts/check-cloudflare-phase-8-<slug>.mjs` that imports the shipped module and
drives it, a pure policy module `scripts/cloudflare-phase-8-<slug>-policy.mjs`, a
manifest `config/cloudflare/phase-8-<slug>.json`, and a drift test
`tests/cloudflare-phase-8-<slug>-policy.test.mjs`. Twenty-two npm names —
`cf:phase8:{sprint,contract,unit,d1,api,session,fuzz,limits,credential,canary,supply,e2e,revocation,offline,isolation,a11y,budgets,resilience,preview,fallback,release,exit}:check`
— are appended to `check:cloudflare` and pinned in order by
`scripts/cloudflare-ci-policy.mjs`. A story is not PASS on assertion; it is PASS
when its gate script exists and passes.

Twenty-one stories and twenty-two gates is not an off-by-one. `CF-P8-001` owns
two: `contract`, which asserts the reconciled inherited contracts, and `sprint`,
which asserts **this plan** — the story inventory, the unbroken chain, the gate
names, the budget table's completeness, and the machine-checkable gate-writing
rules. The plan is an artifact that can drift like any other, and the freeze
story is the one that owns it. Phase 7 shipped `cf:phase7:sprint:check` with no
stated owner; that hole is the same shape as the one `CF-P7-015` was created to
close, and it is closed here by naming the owner rather than by adding a story
that does nothing else.

One manifest belongs to exactly one story. Where a later story needs an earlier
story's number — `CF-P8-016` needs the `P7-G5` byte baseline that `CF-P8-001`
records — the later manifest references the earlier one **by path and content
hash**, and its gate fails if the referenced value changed. Two stories never
write one file.

Evidence uses `CF-EV-P8-{STA|UT|VEC|INT|E2E|SEC|PERF|OPS|QA|UI|A11Y|API}-00n`,
one record per claim, each carrying a `Story:` line, the command, the commit SHA,
the environment, the deployment ID where one applies, the timestamp, and the
result.

### Notes on the harder stories

**CF-P8-001 — The freeze, and three inherited contradictions it must record.**
Beyond fixing the layer inventory, the ten scenarios, the evidence IDs, the
workload fixture, the measurement method, and the narrowing-declaration format,
this story owns three inconsistencies the earlier phases left standing. It
records them and opens `D-P8-01`; it does not fix any of them by editing another
phase's frozen contract.

*The catalog has twenty-nine codes, not thirty.* `api-contract.md` §8 lists
`INVALID_JSON`, `VALIDATION_FAILED`, `INVALID_CURSOR`, `INVALID_PRECONDITION`,
`AUTHENTICATION_REQUIRED`, `SESSION_EXPIRED`, `REAUTHENTICATION_REQUIRED`,
`CSRF_REJECTED`, `DEVICE_NOT_AUTHORIZED`, `KEY_PROVISIONING_REQUIRED`,
`OPERATION_NOT_PERMITTED`, `RESOURCE_NOT_FOUND`, `METHOD_NOT_ALLOWED`,
`NOT_ACCEPTABLE`, `DOCUMENT_REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`,
`IDEMPOTENCY_WINDOW_EXPIRED`, `STATE_TRANSITION_INVALID`, `KEY_VERSION_MISMATCH`,
`FINGERPRINT_CHANGED`, `INVITATION_UNAVAILABLE`, `LAST_OWNER_REQUIRED`,
`LIFECYCLE_POLICY_UNAVAILABLE`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`,
`UNSUPPORTED_ENVELOPE`, `RATE_LIMITED`, `INTERNAL_ERROR`, and
`COLLABORATION_UNAVAILABLE`. That is twenty-nine. Every later document that says
thirty — including [`phase-9-sprint.md`](phase-9-sprint.md)'s budget row "New
error codes | 0 — the catalog stays at 30" — inherits a miscount. A gate pinned
to thirty either fails on day one or invites someone to invent the thirtieth.
`cf:phase8:contract:check` pins the count at **29** by enumerating the codes from
the contract itself rather than by asserting a number, so the count can only
change when the catalog does. No thirtieth error code is invented by Phase 8.

*The ciphertext bound is two different numbers for two different surfaces.*
`api-contract.md` §6 bounds the ciphertext **field** at 768 KiB decoded —
786,432 B — inside a 1 MiB body. `phase-6-document-contract-freeze.md` bounds the
`ciphertext_envelope` **column** at 18 B – 1,048,576 B. Both are correct; they
are not the same bound. A single budget row reading "18 B – 1,048,576 B |
contract" would accept a 900 KiB ciphertext that the API contract requires be
rejected. The budget table below carries both rows with their own measurement
surfaces, and `CF-P8-004` asserts the API bound while `CF-P8-003` asserts the
column bound.

*The provisioning footnote has two conditions, not one.* `domain-and-rbac.md`
footnote 2 reads: "The acting device must itself be active and key-ready; **the
target must be an active member's active device.**" A test that asserts the
acting device's state and forgets the target's state passes while checking half
the rule. Both conditions are in the derived expectation table below, each with
its citation.

This story also records the immutable numeric baseline for the initial dashboard
JS. "Must not grow" is unfalsifiable without a number to grow from, so the gzip
size at the `P7-G5` commit is written into `config/cloudflare/phase-8-contract.json`
once, and `config/cloudflare/phase-8-budgets.json` references it by path and
hash. Changing that number later is a story, not an edit.

**CF-P8-002 — "Complete" means enumerated, and enumerated from one authority.**
The RBAC matrix in `domain-and-rbac.md` §5 has 23 action rows across six
principal columns: **138 cells**, each `A` or `D`. The unit layer asserts all 138,
generated from the frozen matrix rather than hand-written, so a matrix change
breaks the test rather than drifting past it.

The matrix does not cover every principal Phase 8 must exercise. `pending_key`,
a revoked device, an expired session, and an authenticated non-member are handled
in prose and in `api-contract.md` §2.3, not in columns. Extending the axis is
correct; extending it in two stories independently is not, because then two
documents are the authority for one policy. `CF-P8-001` therefore freezes a
single derived table, imported by both `CF-P8-002` and `CF-P8-006`: the 138
matrix cells, plus 23 actions × 4 derived principals = **92 derived
expectations**, each carrying its source citation and its expected response code.
230 expectations, one source.

| Derived principal | Expectation | Source |
|---|---|---|
| Authenticated non-member | `404 RESOURCE_NOT_FOUND` on every workspace-scoped action | `domain-and-rbac.md` §3 invariant 13; `api-contract.md` §8 non-enumeration mapping |
| `pending_key` member | Allowed only for non-content membership, device, invitation-acceptance, and provisioning-recovery actions; `403 KEY_PROVISIONING_REQUIRED` elsewhere | `domain-and-rbac.md` §5 legend; `api-contract.md` §2.3 |
| Revoked device | `403 DEVICE_NOT_AUTHORIZED` on every device-bound action | `domain-and-rbac.md` §4.4; `api-contract.md` §8 |
| Expired session | `401 SESSION_EXPIRED` on every authenticated action | `api-contract.md` §2.1, §8 |

Two matrix rows need explicit attention because they are the ones a generated
test is most likely to get politely wrong. `Remove Owner / last Owner` is `D` in
**every** column including Owner. `Provision envelope for another device` is `A`
for Owner and Admin **only when the acting device is itself active and key-ready
and the target is an active member's active device** — two state conditions, not
a role condition. A test that asserts role alone will pass while checking the
wrong thing, and a test that asserts only the acting device's state will pass
while checking half the rule.

The conflict calculator is the pure decision function behind the four frozen
resolutions — `review-latest`, `reapply-to-latest`, `save-as-separate-copy`,
`discard-with-confirmation`. It is unit-tested to prove that no input produces an
automatic merge, no input produces a fifth resolution, and no path discards a
draft without an explicit confirmed choice.

`tests/conflict-resolution.test.mjs` holds both the conflict calculator and the
copy-eligibility rules. `CF-P8-002` owns the calculator cases in that file;
`CF-P8-008` owns the eligibility cases. Both manifests name their own case set,
and each gate asserts its own count moved. One file, two owners, no ambiguity
about which.

**CF-P8-006 — What a pass looks like when the API is built not to answer.** This
story fuzzes two identifier positions — `{workspaceId}` and `{documentId}` — over
the full principal axis frozen by `CF-P8-001`: Owner, Admin, Editor, Viewer,
authenticated non-member, removed member, `pending_key`, revoked device, expired
session, and unauthenticated. The corpus covers valid identifiers belonging to
another workspace, valid identifiers belonging to the caller's own workspace,
well-formed v4 UUIDs that exist nowhere, malformed and non-UUID segments,
tombstoned documents, hidden tombstones, cross-pairings of a real document ID
under the wrong workspace ID, and cursors minted for a different route,
workspace, filter set, or environment.

The assertion is **not** "returns the correct 404". The API is deliberately
non-disclosing: `404 RESOURCE_NOT_FOUND` is the answer whether or not the
resource exists, and asserting the status code would pass on a server that leaked
everything else. The assertion is **no practical enumeration distinction between
the exists and does-not-exist arms of every pair**. `api-contract.md` §8 does not
promise byte-for-byte or timing equality, so the property is enumerated as a
fixed list rather than asserted as identity. This list is **the** definition of
"materially equivalent" in this sprint; every other story that needs the property
points here rather than restating it loosely:

1. identical status, identical error code, identical header set including any
   `Allow` header, and a response body whose every field is drawn from a fixed
   shape — no field, message, code, or allow-listed detail varying with
   existence, and only the request ID differing between arms;
2. identical side effects — zero rows in every business table on both arms, and
   identical audit behaviour, inspected in D1 rather than inferred from the
   response;
3. `405 METHOD_NOT_ALLOWED` only after route-template resolution, so a method
   probe cannot separate an existing workspace from an absent one;
4. every invalid, expired, revoked, used, or wrong-identity invitation collapsing
   to `409 INVITATION_UNAVAILABLE`;
5. every response code drawn from the twenty-nine-code catalog and no other;
6. the five actionable own-resource detail fields — `currentRevision`,
   `keyReadiness`, `expectedKeyVersion`, the `LAST_OWNER_REQUIRED` rule detail,
   and the `FINGERPRINT_CHANGED` refresh detail — **absent from every response in
   every unauthorized arm of the corpus**, asserted by field name over the
   parsed body, with the case count executed and the count scanned both reported.

Point 6 is stated as a count over a named corpus rather than as a universal
negative, because a universal negative over an unbounded response space cannot be
observed. The gate reports "N unauthorized cases scanned, N clean" and fails on a
zero.

Timing is measured and reported as a coarse control only. The band is a number,
declared in the manifest **before** the run and asserted by the gate: the p95
difference between arms must be **≤ 25 ms and ≤ 10% of the slower arm's p95**,
over **≥ 200 paired samples per arm**. The record states plainly that this is a
smoke test for a gross oracle and not a constant-time proof, because D1 latency
variance dominates below roughly 10 ms at this sample size and that floor is
declared alongside the band. A threshold chosen after seeing the data is not a
budget, so the manifest value is written at `P8-G1` and any later change to it is
a finding.

One structural requirement makes the whole story non-vacuous. A fuzzer that
mistypes every URL passes trivially. The corpus must therefore contain
**known-positive controls**: at least one identifier that does exist, requested
by a caller who is authorized, returning `200`. The gate asserts the controls
succeeded. If the harness cannot tell the difference when it is allowed to, it
was not telling the difference the rest of the time either.

**CF-P8-007 — Rate limiting is a behaviour under test, not noise during a load
run.** `quality-strategy.md` §4.6 requires rate-limit and resource-exhaustion
coverage, `R21` is a High risk whose indicator is "repeated oversize/KDF abuse,
outbox quota exhaustion", and until this story existed the only mention of `429`
in this plan was a line telling the load driver not to worry about it. That is
backwards: a `429` during a load run is an unwanted result, and a `429` under
this story is the expected one.

The frozen tiers in `api-contract.md` §7 are asserted exactly — 120 requests per
user per minute, 300 per source IP per minute, 60 document mutations per user per
minute, 20 OAuth attempts per IP per 10 minutes, 10 invitation attempts per token
discriminator and 30 per IP per 10 minutes, 30 workspace/device/key
administration calls per user per 10 minutes. For each tier the story proves four
things: the limit is enforced at the stated boundary and not one request early or
late; the rejection is `429 RATE_LIMITED` with a bounded integer `Retry-After`;
**zero domain mutation results from a rejected request**, inspected in D1; and
the limiter is not an enumeration oracle — a rate response for a workspace that
exists is indistinguishable from one for a workspace that does not, under the
same six-point enumeration above.

Resource exhaustion is the other half. Oversize bodies are rejected with `413`
**before** buffering, before crypto, and before D1, proven by asserting zero D1
statements executed rather than by timing. The PBKDF2 bound is fixed and a
request cannot select a higher iteration count. Pagination cannot exceed 100
regardless of the requested `limit`. The client outbox quota — 100 entries,
25 MiB — reaches its warning at 80% and its hard limit without losing the
editable draft. Adaptive stricter limits are permitted by the contract and are
asserted to be stricter, never more permissive.

**CF-P8-008 — The Credential exclusion, which Phase 7 deferred to here.**
`phase-7-sprint.md` deferred "Copy to workspace and the Credential exclusion" to
Phase 8. The surface stays deferred — Phase 8 adds no surface — but the
**exclusion** does not, because it is a verification obligation with three
independent sources: `quality-strategy.md` §4.6 requires "Credential-category
controls in the official client, including absent copy/share controls and
rejection before encryption"; `domain-and-rbac.md` §3 invariant 4 says credential
documents are ineligible "through create, copy, import, batch, and
category-change paths"; and `R08` is a Critical residual risk whose trigger is a
"Credential canary created through supported create/copy/import/category path".

The implementation exists and is unexposed: `assessCopyEligibility`,
`COPY_INELIGIBLE_CATEGORIES`, and the `CREDENTIAL_NOT_COPYABLE` refusal in
`js/collaboration/conflict-resolution.js`. This story drives it to its refusal
rather than reading it, across all five named paths, and states honestly what
each path is:

| Path | What is asserted |
|---|---|
| Copy | `assessCopyEligibility` refuses a stored Credential and the copy-intent builder refuses **before** any destination encryption call is reached, proven by a crypto seam that records zero invocations |
| Category change | A document already in a workspace cannot transition into the Credential category, and a personal Credential cannot transition out and then be copied in the same session |
| Create | No collaboration create path accepts a Credential category, and the client's category vocabulary on a workspace surface does not contain it |
| Import | No import path into a workspace exists in Foundation. The assertion is the **absence** of the path, not a refusal from it |
| Batch | No batch document API exists in Foundation (`api-contract.md` §3). The assertion is the absence of the route, measured against the frozen route catalog |

Two of the five are absence proofs, and saying so is the point: an absence proof
that pretends to be a refusal proof is the kind of overstatement this programme
rejects. The story also asserts the honest limitation in the same record, because
`R08` requires it — the server sees only ciphertext and cannot detect an
authorized member pasting a secret into an eligible encrypted document, and no
Phase 8 evidence may claim server-side semantic inspection.

**CF-P8-009 — Four kinds of canary, because "no plaintext in the DOM" is not one
claim.** Read literally, "no plaintext canary reaches the DOM" would fail the
product: an authorized reader's decrypted document is supposed to reach the DOM.
The story therefore separates four canary classes and asserts a different thing
about each.

*Secret canaries* — device private key bytes, the unlock secret, the KEK, the
workspace DEK, a raw invitation token, and the session token value. Required
count everywhere: **zero**. Scanned in the serialized DOM including every shadow
root and every input `value`, every D1 text and blob column, every outbound
request URL, header, and body, every Workers log line, every `localStorage` and
IndexedDB value except the declared encrypted-at-rest fields, and the built
`_site` artifact.

*Content canaries* — a per-run 32-byte CSPRNG token embedded in the encrypted
document title, body, tags, category, and status. Required in the DOM of an
authorized reader, because that is the product working. Required count in D1,
in logs, in cache entries, and in any request field outside the ciphertext:
**zero**. This is what makes the end-to-end encryption claim falsifiable. If the
content canary is greppable in a D1 column, the phase fails.

*Hostile canaries* — the content canary wrapped in markup, event-handler,
`javascript:` and data-URL payloads, and stored through the ordinary create and
update paths. Required to round-trip and render as inert text: zero elements
matching the injected tag name, zero `on*` attributes present in the rendered
subtree, zero `javascript:` hrefs, zero CSP violation reports, a sentinel global
left `undefined`, and rendered text identical to the input.

*Credential canaries* — a document carrying the Credential category marker,
offered to every collaboration entry path enumerated by `CF-P8-008`. Required
count of Credential-category documents reaching any workspace table, request, or
envelope: **zero**. This is the canary class `R08`'s trigger is written in terms
of, and its absence from the taxonomy was the reason a Critical residual risk had
no executable check.

Every scan reports what it searched — column count, row count, log line count,
request count, byte count — and the gate fails on a zero. A canary scan that
scanned nothing is the same failure mode as a drift test whose mutation never
applied, and Phase 7 shipped two of those.

**CF-P8-010 — What ships, what it is made of, and where it came from.** Three
claims, one artifact set, one story. The CSP and security-header regression is
asserted against the built `_site` and its `_headers`, not against source. The
dependency audit and the bill of materials are asserted against the committed
lockfile and the installed tree.

The audit budget is stated as an adjudication procedure rather than as a
judgement, because "zero exploitable Critical or High" is a human verdict with no
stated method and `npm audit` reports severity, not exploitability. The gate
passes when **either** `npm audit --audit-level=high` exits 0, **or** every
Critical and High advisory carries a waiver record in
`config/cloudflare/phase-8-supply.json` naming the advisory ID, the advisory
source, the package and version range, a reachability statement saying which
code path would have to execute, the accepting owner, and an expiry date. The
gate fails on an unwaived Critical or High, on a waiver without a reachability
statement, and on an expired waiver. A declaration of "not exploitable" with no
record is not a waiver.

The bill of materials is CycloneDX, generated from the committed lockfile, with
one component per production and development dependency, each carrying a resolved
version and an integrity hash. The gate fails on any component without both.
Provenance is asserted as far as this project's supply chain actually supports:
the lockfile is unchanged by `npm ci`, every GitHub Actions dependency is pinned
to a commit SHA rather than a tag, and the registry integrity hash of every
installed package matches the lockfile. Where npm provenance attestations exist
for a package they are recorded; where they do not, the absence is recorded as an
absence rather than passed over. `R19` names "lockfile/SBOM/scans" and
"provenance/review" as its required mitigation, and this story is where that
evidence is produced.

This story does **not** touch `scripts/smoke-production-boundaries.mjs`. That
script issues live `fetch` calls to `https://docvault-qa-document-hub.pages.dev`
and `https://dustin-nkd.github.io`; running it here would reach two deployed
origins at `P8-G3`, five stories before any remote authorization exists. It is
left unmodified and is re-run under `CF-P8-019`, behind `P8-G4B`, which is the
only place in this sprint where reaching those origins is authorized.

**CF-P8-011 — Two contexts, and why the harness is a story rather than a
fixture.** Playwright browser contexts are cheap; two authenticated collaboration
identities are not. The harness owns the identity plumbing, the deterministic
workspace seeding, the per-run canary generation, the network recording, the
matrix declaration, and the cleanup and reconciliation record. It builds on
`tests/browser-collaboration-integration.mjs`, which already drives the composed
shell end to end over a stubbed transport, and replaces the stub with a real
local Pages Functions origin and a real disposable D1. The mock OAuth adapter it
uses is test-only and build-excluded under `DL-020`; no bypass is deployed and
none is reachable from a production build.

Scenarios **G1** through **G5** are closed here. They are ordered so that each
one's precondition is the previous one's proven outcome, which is what makes a
mid-run failure attributable.

**CF-P8-012 — The old session must stay valid.** The natural way to test "remove
an editor, then retry the API" is to clear the cookie and confirm a `401`. That
proves nothing: it tests logout. The requirement is that a **still-valid session
cookie belonging to a removed member** buys nothing. The harness keeps the
editor's context alive and untouched across the removal and replays the same
calls with the same cookie and the same CSRF token. The expected result is the
shared non-disclosing denial satisfying **all six points of the `CF-P8-006`
enumeration**, and — in the still-open client — the `Access removed` sync state,
reached only after a *completed* membership re-check, never guessed from the
status code, because guessing it would leak the resource's existence. Queued
outbox entries quarantine with an accurate reason rather than executing on stale
authority.

Device revocation is here rather than in `CF-P8-011` because it is the same
shape: authority changing underneath a live client. It additionally asserts the
matrix footnote — an Admin may revoke Editor and Viewer devices but not an
Owner's or another Admin's — and that a revoked device cannot issue its own
revocation.

**CF-P8-014 — The isolation claims are network claims, and Guest is not Personal.**
The easy version of "GitHub Pages produces no API polling loop" inspects the
source and confirms the collaboration entry is not imported. Phase 7 proved how
that fails: the build walked references from `index.html`, the lazy design means
`index.html` references none of the collaboration modules, and the modules were
simply absent from the artifact while every source-level check passed. So the
fallback claim is measured from a recorded network log on the real built artifact
served from a static origin with no API host reachable, over a window of at least
**300 seconds** spanning one reload and one visibility change.

`quality-strategy.md` §4.5 requires two isolation journeys, not one, and they are
different contexts. The Personal Vault is an unlocked local vault with a master
password and real storage. Guest mode (`?guest=1`) clones isolated fixtures,
calls neither `DocStorage` nor `LocalAuth` nor GitHub Sync, and leaves no vault
trace. A claim about one is not a claim about the other, and Phase 7's `U1`
covered only the personal path. This story therefore runs **three** journeys:

- **Personal Vault non-regression.** `storage.js` stays at a zero-line diff, the
  ten-test characterization baseline passes unchanged, and a personal
  read/write/sync/export/tombstone cycle runs in a browser context that has
  *also* run the collaboration journeys — because the interesting failure is
  crossover after a workspace session, not crossover on a clean profile.
- **Guest network and storage isolation.** A `?guest=1` startup, recorded for at
  least 300 seconds including one reload: zero requests to any `/api/v1/*` path,
  zero collaboration modules evaluated, zero writes to any `DocStorage` or
  `LocalAuth` key, zero IndexedDB outbox databases created, and zero cookies set
  on the collaboration namespace. Guest is measured on the served artifact here
  and re-measured on Preview under `CF-P8-018`, because a guest visitor to the
  Cloudflare origin lands on a deployment where collaboration is enabled and that
  is the only place the claim is interesting.
- **Fallback silence, locally.** The built `_site` served statically, with the
  banner present and readable at 320 px stating that collaboration is available
  only on the Cloudflare deployment.

**CF-P8-015 — Accessibility needs a ruleset, not an adjective.** "WCAG 2.2 AA"
names no tool and no set of success criteria, and Phase 7 shipped a 2.54:1 focus
ring past three separate stories under exactly that wording. The repository has
no scanner: `tests/browser-collaboration-qualification.mjs` hand-rolls its own
contrast ratio and 24 px target checks, which is why a ring below the floor
survived until a later story computed it a different way.

`quality-strategy.md` §4.8 requires "automated scanning with manual keyboard and
screen-reader checks", and the automated half currently has no tool. This story
adds one: **`axe-core`, pinned to an exact version as a dev dependency**, added
by `CF-P8-001` at the contract freeze rather than here, so that `CF-P8-010`
audits a tree that already contains it and the lockfile assertion is made once
against the final tree. Adding a dependency during a verification phase is itself
a supply-chain event; sequencing it before the audit is how that is handled
rather than hidden. The alternative — extending the hand-rolled checks — is
rejected: it is the approach that already failed, and a hand-rolled ruleset is a
ruleset nobody else has reviewed.

The declared configuration is part of the frozen contract: rule tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, run against every
collaboration surface in every base state, at 320, 768, and 1024 px, in both
colour schemes. Zero violations at any impact level. Disabling a rule requires a
declared narrowing with a reason; the gate asserts the enabled rule set matches
the manifest.

The scanner does not replace the existing numeric checks and does not cover
everything. The focus-ring contrast and 24 px target computations in
`browser-collaboration-qualification.mjs` stay, because they are the checks that
caught the Phase 7 defect. And the success criteria no scanner evaluates —
logical focus order, focus not trapped, focus moved and restored around dialogs,
the meaningfulness of an announced reason, live-region politeness, and state
never signalled by colour alone — are covered by the scripted keyboard walk,
enumerated by criterion number in the manifest so that "automated plus keyboard"
is a list rather than a claim.

**CF-P8-017 — The rehearsals, which nothing else in this phase covers.**
[`implementation-plan.md`](implementation-plan.md) §11 work package 3 is
explicit: "Rehearse expand/contract migration, feature disable, compatible
rollback, Time Travel restore, retention purge, OAuth outage, D1 fault, and
key/security incidents." Its exit gate requires that "restore meets approved
RPO/RTO in rehearsal". `phase-6-sprint.md` §8 required the same matrix. None of
it is verification of a request path, which is why it is its own story rather
than a clause inside one.

Every rehearsal runs on **disposable** resources — a disposable D1 created for
the purpose, a locally served artifact, injected faults — and none of them
touches Preview or production. That is not a weakening: a restore rehearsed in
place on a shared database is a destructive operation requiring separate
approval, and `phase-6-sprint.md` §8 already pins shared Preview Time Travel to
read-only bookmark fingerprints. Phase 9 re-rehearses against the production-bound
path at `CF-P9-006`; this story proves the procedures work before there is
anything to lose.

| Rehearsal | What is proven | Recorded |
|---|---|---|
| Expand/contract migration | Migrations `0001`–`0012` apply in order to an empty disposable D1 and to a populated one; exact reapply is a no-op; schema digest matches | Applied list, digest, row counts before and after |
| Adjacent-version compatibility | The current runtime serves the previous approved schema and the previous runtime serves the current schema, for the routes the compatibility window covers | Matrix result per route |
| Feature disable | `COLLABORATION_ENABLED='false'` returns `503 COLLABORATION_UNAVAILABLE`, preserves every D1 row, preserves local encrypted drafts, and does not affect Personal Vault, Guest, or the fallback | Row counts, draft survival, personal cycle result |
| Compatible rollback | Reading a pinned earlier compatible commit and serving it against the current schema leaves append-only revisions and monotonic key versions intact | Commit, schema version, invariant check |
| Time Travel restore | A disposable D1 is restored from a bookmark; schema, membership, envelopes, revision chains, mutation uniqueness, and audit continuity all verify before it is called a pass | **RPO and RTO measured, not assumed** |
| Retention purge | The bounded purge deletes idempotency rows in batches, honours active holds, and **cannot** delete a document revision through the same job | Deleted counts by table, hold denial |
| OAuth provider outage | Provider timeout and 5xx produce a sanitized status, no auth downgrade, no fake identity, existing sessions continue within policy, and Personal Vault and Guest stay available | Response codes, session survival |
| D1 fault | An injected failure at every atomic write boundary leaves every business table unchanged | Boundary count, rows changed |
| Key and security incident | Device revocation, member removal with pending outbox entries, and rotation-with-conflict each reach their documented state; the terminal-loss path shows the documented unrecoverable state rather than inventing a recovery | State reached per drill |

The recovery objectives are the approved ones: **RPO ≤ 5 minutes, RTO ≤ 60
minutes** from a declared database incident to a verified contained service or a
documented degraded mode. RTO is measured during the rehearsal. A rehearsal that
records an objective it did not measure is a fail.

**CF-P8-018 — Preview, and how a latency budget is measured.** This story re-runs
the ten scenarios over Preview HTTPS with the three designated identities,
measures the two latency budgets that are stated on Preview, re-measures the
guest startup claim on a deployment where collaboration is actually enabled, and
reconciles the remote state afterwards. It inherits the Phase 6 and Phase 7
Preview residue as a fact — one owner session, one active device, one workspace
holding a single tombstoned document, four append-only revisions — and must not
silently reset it. Revisions and audit are append-only by trigger and there is no
workspace delete route, so cleanup is partial by construction and is recorded as
partial.

A number with no method is not a measurement, so the method is fixed here and
asserted by the gate: **≥ 200 samples per budget**, the first 20 discarded as
warm-up, **OAuth-provider time excluded** as `quality-strategy.md` §4.7 and
`phase-6-sprint.md` §7 both require, and every record carrying **p50, p95, max,
error rate, sample count, D1 rows read and written, the Cloudflare deployment ID,
the D1 migration version, and the runner profile**. A record missing any of those
fields fails the gate whether or not its p95 is inside the budget.

The load profile is the approved baseline — 25 members, 10,000 documents, 50
revisions per document, 10 concurrently active users — and it is a **fixture**,
not a budget. The budget over it is stated separately and numerically below,
because "10 active users" has no pass or fail in it. It runs inside the frozen
rate tiers with the driver's aggregate rate capped at **250 requests per minute**
from one source IP, which is inside the 300-per-IP tier and implies 25 requests
per user per minute against a 120-per-user tier. The IP tier is the binding
constraint because ten simulated users share one source address, and that is
declared rather than discovered. A `429` at that rate is a **finding**, recorded
with its tier and its timestamp; quietly reducing the profile to make a budget
pass is a silent cap and is prohibited.

Some steps here cannot be performed by an agent — setting a Pages secret,
changing a Pages environment variable, redeploying. Those are written as a
numbered owner request and stated as a request rather than performed. The gate
enforces the one thing that matters: a PASS may not be claimed without a journey
qualified against a deployment where collaboration is enabled.

**CF-P8-019 — The fallback origin is production, and it needs its own
authorization.** `G10`'s claim is about the real GitHub Pages origin. That origin
is live, public, and not Preview; it is not covered by `P8-G4`, by the Preview
entry preconditions, or by anything else in this sprint. Rather than stretching
the Preview authorization over a second production surface, this story carries
its own: **`P8-G4B`**, recorded in the decision log before the work starts.

Its scope is deliberately small and read-only: `GET` the fallback origin, record
the network log for at least 300 seconds spanning one reload and one visibility
change, confirm zero requests to any `/api/v1/*` path, zero console errors, zero
page errors, and the banner present and readable at 320 px. It re-runs
`scripts/smoke-production-boundaries.mjs` unmodified, which is the first point in
this sprint where that script's live `fetch` calls are authorized. It writes
nothing, authenticates nothing, and sets no cookie.

The window bounds what can be claimed, and the claim is written to match. "No
polling loop of any period" is not observable in a bounded window — a five-minute
poll would pass a sixty-second observation trivially. The assertion is therefore
**zero `/api/v1/*` requests within the recorded window**, and the manifest states
the consequence plainly: a loop whose period exceeds the window is not detected
by this measurement. Stating the detection limit is what makes the result mean
something.

**CF-P8-020 — The release-candidate freeze.** `implementation-plan.md` §11 work
package 5 requires the API, schema, and crypto vector versions to be frozen for
the release candidate. Nothing else in this sprint does that: `CF-P8-001` freezes
the **verification** contract, which is a different artifact. This story pins,
in one manifest with content hashes: API version `v1` and the twenty-nine-code
catalog; schema version 12 and the hash chain of migrations `0001` through
`0012`; the envelope and key-envelope suite identifiers
(`A256GCM-v1`, `P256-HKDF-SHA256-A256GCM-v1`) with their immutable test vectors;
the frozen vocabularies — five sync states, four conflict resolutions, six outbox
states, four roles; and the rate tiers. `cf:phase8:release:check` fails if any
pinned value drifts, and Phase 9 inherits this manifest as the thing it is
allowed to change only through its own gates.

**CF-P8-021 — The exit.** Reconciles every evidence record, every finding and its
disposition, every declared narrowing, the risk register including `R23` and
`R24`, the remote reconciliation for both authorized environments, and the
sign-off. DocVault is a single-maintainer project, so the sprint's seven review
roles are one person; the Phase 5 precedent is one owner authorization covering
all seven roles, stating explicitly that no independent security or privacy
review occurred. `cf:phase8:exit:check` fails if the record is later upgraded to
claim independent reviewers or an independent security or privacy review that did
not occur.

## How a Phase 8 gate is written

These rules are not suggestions. Each one was bought with a defect. Rules 1
through 5 are asserted by `cf:phase8:sprint:check` against every Phase 8 gate
manifest; rule 6 is asserted by each story's own gate. None of them is enforced
by review alone, because in a project where "the sprint's seven review roles are
one person" a rule enforced at review is a rule enforced by assertion, which is
the thing this document exists to reject.

1. **Exercise, do not pattern-match — and prove it.** A gate imports the shipped
   module and drives its guards to their refusals. Phase 7's preview gate drove
   the entry against a recording transport precisely because a gate that grepped
   for `renderSurfacePanel` would have passed on the exact broken state that
   story found. Saying "a gate whose strongest assertion is a source regex is
   presumed vacuous" is not enforceable, so the presumption is replaced by a
   measurement: **every Phase 8 gate ships a mutation probe.** The manifest
   declares the module the gate claims to exercise and one mutation to it; the
   probe applies the mutation to a scratch copy and runs the gate against it; the
   gate **must fail**. A gate that still passes against its own mutation is
   vacuous by measurement rather than by opinion, and `cf:phase8:sprint:check`
   fails when a manifest declares no probe or the probe did not run.
2. **Drift tests must prove the mutation landed.** Use the
   `mutated(source, pattern, replacement)` helper, write patterns with `\s*`
   rather than `\n`, and assert `result !== source` with a message naming the
   pattern. Git renormalises line endings on checkout, so a `\n` pattern can
   silently fail to match on a CRLF working copy, leaving a test that passes
   while checking nothing. Phase 7 shipped two.
3. **A scan reports what it scanned, and zero is a failure.** Column counts, row
   counts, log lines, recorded requests, scanned bytes, fuzz cases executed,
   known-positive controls passed. An empty scan fails loudly rather than
   returning a clean result.
4. **A deployment claim is measured on the deployment, by a stated method.**
   Nothing before Phase 7 went through the production build, and the
   collaboration modules were absent from the deployed artifact as a result. Any
   Phase 8 claim about what ships is measured on what shipped, against a recorded
   deployment ID, with the sample count, warm-up policy, and excluded time stated
   in the manifest.
5. **Narrowed coverage is declared, never silent.** The reason goes in the
   manifest, the harness prints it at run time, and the gate asserts that the
   declared set matches the executed set. An undeclared narrowing fails the gate,
   and an unsupported environment is a **fail-closed recorded result, never a
   skip**.
6. **A cross-cutting suite proves it can fail.** The earlier form of this rule
   required `CF-P8-006`, `CF-P8-009`, `CF-P8-015`, and `CF-P8-018` each to record
   "at least one finding". That rule is withdrawn. "A finding" was undefined, so
   any observation satisfied it and nothing could fail it; worse, it made a
   genuinely clean result a gate failure and created a standing incentive to
   manufacture cosmetic findings. The intent behind it was right and is kept in
   an observable form: each cross-cutting story ships **at least one negative
   control** — a seeded defect its own suite must detect — and the gate asserts
   the control was detected and then removed. `CF-P8-006` seeds a response that
   varies with existence. `CF-P8-009` seeds a content canary in a D1 column.
   `CF-P8-015` seeds a focus ring below 3:1. `CF-P8-018` seeds a latency outlier
   past the budget. A suite that cannot see its own seeded defect is measuring
   nothing, and now that is a failing assertion rather than a paragraph of
   advice.

## What happens to a finding

Phase 8 exists to find defects and is forbidden to fix them in place. Without a
stated path from a finding to a fix, that combination is a contradiction: the
phase produces findings, cannot repair them, and cannot carry them open past its
own exit. The path is therefore owned here.

Every finding is recorded as `CF-FN-P8-00n` with its severity under
`quality-strategy.md` §7.3, the phase and module that own the code, a
**reproducer that lives permanently in the Phase 8 suite**, and exactly one
disposition. There is no fourth disposition.

1. **The owning phase is open.** The fix lands there, under that phase's
   contract, and Phase 8 re-runs the reproducer.
2. **The owning phase is closed.** Reopening it takes a numbered remediation
   story inside that phase — `CF-P4-0nn`, `CF-P6-0nn`, and so on — authorized by
   the owner and recorded in [`decision-log.md`](decision-log.md), shipping the
   fix and any amendment to that phase's frozen gate **in the same commit**,
   exactly as `D-P7-01` did and exactly as the `CF-P7-016` precondition above
   requires. Phase 8 then re-runs the reproducer and records the
   re-verification. Phase 8 never edits a closed phase's module directly, and a
   closed phase is never reopened by an edit.
3. **The finding is accepted.** P2 requires recorded Product Owner and Senior QA
   acceptance with a stated workaround; P3 is scheduled with a named owner and a
   date. **P0 and P1 cannot be accepted** — `quality-strategy.md` §7.3 and
   `risk-register.md` §3 both prohibit it.

`cf:phase8:exit:check` fails when a finding has no disposition, when a P0 or P1
finding is open, when a disposition names a remediation story that is not PASS,
when a P2 acceptance names no acceptor, or when a recorded finding has no
reproducer in the suite.

## Sprint gate scenarios — the ten acceptance criteria

These ten decide whether Phase 8 closes. Each is closed twice: once locally
against real local Pages Functions and a real disposable D1, and once on the
deployment named in the table. A local pass alone does not close a scenario whose
claim is about a deployment.

| # | Scenario | Closed by | Deployed re-run |
|---|---|---|---|
| G1 | Owner creates a workspace | CF-P8-011 | Preview, `P8-G4` |
| G2 | Owner invites an editor | CF-P8-011 | Preview, `P8-G4` |
| G3 | Editor accepts and creates a document | CF-P8-011 | Preview, `P8-G4` |
| G4 | Viewer reads but cannot edit | CF-P8-011 | Preview, `P8-G4` |
| G5 | Editors A and B produce a conflict | CF-P8-011 | Preview, `P8-G4` |
| G6 | Remove an editor, retry the API with the old session | CF-P8-012 | Preview, `P8-G4` |
| G7 | Offline edit, reload, reconnect | CF-P8-013 | Preview, `P8-G4` |
| G8 | Revoke a device | CF-P8-012 | Preview, `P8-G4` |
| G9 | The Personal Vault still works | CF-P8-014 | none — no collaboration backend is involved |
| G10 | GitHub Pages fallback: no console errors, no API traffic | CF-P8-014 locally | GitHub Pages origin, `P8-G4B`, by CF-P8-019 |

**G1 — Owner creates a workspace.** `201` alone is not proof. The atomic boundary
must show, in D1, exactly one `workspaces` row, one `memberships` row with role
`owner` in an active state, one `workspace_key_versions` row at version 1, one
initial key envelope bound to the creating device's fingerprint, and one audit
event — all present together or all absent together. The bootstrap-intent call
performs no D1 mutation. In the browser, the new workspace is the active
workspace, is identifiable without opening a menu at 320 px, and survives a
reload rather than silently defaulting elsewhere.

**G2 — Owner invites an editor.** The raw fragment token is returned exactly
once; the stored row holds a hash and never the token; a repeat of the create
call with the same mutation ID returns the original result and **does not**
re-return the token, which is the one deliberate exception in the idempotency
contract. The pending list shows the invitation to Owner and Admin only. An
Editor issuing the same call receives `403 OPERATION_NOT_PERMITTED` with zero
rows written. A revoked, expired, reused, or wrong-subject acceptance collapses
to `409 INVITATION_UNAVAILABLE` — the same code, from the same shape of
response, for all four.

**G3 — Editor accepts and creates a document.** Acceptance in the second browser
context creates a `pending_key` membership and **no** key envelope, and the
editor cannot read workspace documents in that state. After an Owner device that
is itself active and key-ready provisions the envelope to the editor's active
device, the editor's create returns `201` at revision 1, with exactly one
`document_revisions` row at `base_revision = 0`. The Owner's context then
decrypts the exact plaintext the editor sealed, byte for byte. The content canary
appears in neither the request metadata nor any D1 column.

**G4 — Viewer reads but cannot edit.** The viewer lists documents, reads the
current document, and enumerates its revision history. Create, update, and
tombstone are each denied as an **authorization denial, not a validation
error**, with zero document, revision, idempotency, and business audit rows: the
revision count is identical before and after, and the denial rolls back inside
the SQL guard. In the browser, the write controls remain **visible, programmatically
disabled, and carrying a reason assistive technology announces** — never hidden,
and never enabled-then-failing-on-submit. The same calls issued directly from the
viewer's own authenticated session are denied identically, which is the proof
that the UI was never the boundary (`DL-008`).

**G5 — Editors A and B produce a conflict.** Both contexts read revision *n*;
both submit against base *n*. Exactly one advances to *n+1*. The other receives
`409 DOCUMENT_REVISION_CONFLICT` carrying its submitted base and the current
revision, and writes nothing. `document_revisions` gains exactly one row. The
loser's local encrypted draft still exists after the dialog is dismissed, after
navigating away, and after a full reload; it is discarded only by an explicit
armed-and-confirmed choice. No automatic merge occurs on any path, and the state
is signalled by a text label and a distinct shape, never by colour alone.

**G6 — Remove an editor, retry the API with the old session.** The editor's
session cookie remains syntactically valid and is reused unchanged. Every
workspace-scoped call returns the shared non-disclosing denial satisfying **all
six points of the `CF-P8-006` enumeration**, and zero rows are written. The
still-open editor client resolves to `Access removed` only after a **completed**
membership re-check, offers re-entry through the workspace switcher, and offers
no in-place retry. Any queued outbox entry quarantines with an accurate reason
and never executes on stale authority.

**G7 — Offline edit, reload, reconnect.** With the transport suspended, the edit
persists as an encrypted IndexedDB outbox entry that survives a full page reload.
On reconnect the entry is **re-authorized at submission, not merely retried**,
reuses the original mutation ID, and produces exactly one revision. A duplicated
submission storm produces one revision, one idempotency result, and one audit
event. Throughout, no `/api/*` request is served from the Service Worker cache
and none receives the offline HTML shell. The sync state moves Saving → Offline →
Saving → Saved, and `expired` and `quarantined` outbox states are surfaced as
recovery situations rather than flattened into `error`.

**G8 — Revoke a device.** After `DELETE /api/v1/devices/{deviceId}`, the revoked
device's next workspace call is denied at the device gate, its pending outbox
entries quarantine rather than execute, and its unwrapped key material and
plaintext view state are cleared before another context renders. A revoked device
cannot issue its own revocation. An Admin revoking an Owner's or another Admin's
device is denied. Zero business rows result from any denied path.

**G9 — The Personal Vault still works.** `storage.js` is at a zero-line diff, the
ten-test characterization baseline passes unchanged, and a full personal
read/write/sync/export/tombstone cycle produces byte-identical results — run in a
browser context that has already completed the collaboration journeys. Across the
entire Phase 8 matrix, including every injected failure path: zero personal
writes originating from a collaboration path, zero personal records on a
workspace surface, and zero workspace records on a personal surface.

Guest mode is **not** covered by this scenario. Guest is a third context with its
own isolation contract — it touches neither `DocStorage` nor `LocalAuth` nor
GitHub Sync — and a Personal Vault result says nothing about it. `CF-P8-014`
runs the guest journey separately with its own network and storage log, and
`CF-P8-018` re-runs it on the deployment. The claim "zero collaboration modules
evaluated on personal **or guest** startup" is closed by those two measurements,
not by this one.

**G10 — GitHub Pages fallback is silent.** Measured from a recorded network log,
not from source. Over a window of at least **300 seconds** including one reload
and one visibility change: **zero requests to any `/api/v1/*` path**, zero
console errors, and zero page errors. The banner is present and states that team
collaboration is available only on the Cloudflare deployment. A user on the
fallback is never left guessing why collaboration is absent.

The assertion is stated as zero requests in a bounded window because that is what
is observed. A request loop whose period exceeds 300 seconds is not detected by
this measurement, and the manifest says so. `CF-P8-014` closes the local half on
the served artifact; `CF-P8-019` closes the deployed half on the live origin
under `P8-G4B`.

## Declared coverage narrowings

Each of these is declared in the story manifest with its reason, printed by the
harness at run time, and asserted by the gate. None may be widened or narrowed
silently, and an unsupported environment is recorded as a fail-closed result
rather than skipped.

### The browser matrix

The frozen matrix is `quality-strategy.md` §4.5 and `TD-19`: the latest two
stable versions of **Chrome, Edge, and Firefox, plus Safari 17.4 or later**.
Declaring one narrowing and never mentioning the other three browsers would be
the silent narrowing this plan's own zero-tolerance list prohibits, so every
browser in the frozen matrix gets a row and a verdict.

| Browser | Two-context journeys | Accessibility, responsive, fallback | Reason |
|---|---|---|---|
| Chrome (Playwright `chromium` and the `chrome` channel) | **run** | **run** | The primary engine. No narrowing. |
| Edge (Playwright `msedge` channel) | not run | **run** | Same engine as Chrome; the two-identity journeys cost two authenticated contexts and would exercise identical engine code. The surface-level checks that could differ — channel-specific UA, autofill, and default settings — are run. |
| Firefox | not run | **run** | Headless Firefox does not advance Tab focus through the harness, a declared Phase 7 exclusion. The axe scan, the responsive matrix, and the fallback log run headless; the keyboard walk runs **headed**, and where a headed Firefox is unavailable the result is recorded as a fail-closed exclusion, never a skip. |
| Safari 17.4+ | **not run** | **not run** | Safari does not run on this project's Windows development and CI host, and Playwright's WebKit build is not Safari. Recorded as an unqualified browser, not as a pass. |
| WebKit (Playwright) | not run | **run, labelled a proxy** | The closest available engine to Safari's. Every record naming it must say "WebKit engine proxy, not Safari", because calling it Safari would be the overstatement this programme rejects. |

Safari being unqualified is a real gap in the release matrix and it is treated as
one: `CF-P8-001` opens risk **R24 — the release browser matrix is unqualified on
Safari 17.4+**, with Product Owner as contract owner and Senior QA as evidence
owner, and `CF-P8-021` carries it into the exit record open rather than closing
it. Qualifying Safari needs a macOS or iOS host or a device cloud, which is a
procurement decision outside this sprint's authority; it is deferred to Phase 9
with that reason.

`DOCVAULT_E2E_MATRIX` widens any of these at run time, and the gate asserts the
declared set matches the executed set in either direction.

### Other narrowings

- **Timing analysis in `CF-P8-006` is a coarse control.** Declared as a
  gross-oracle smoke test with a stated band and a stated detection floor, not a
  constant-time proof.
- **The fallback and guest network windows are bounded at 300 seconds.** A loop
  with a longer period is not detected, and the manifest states that limit.
- **The ten-user load profile runs from one source IP.** The 300-per-IP rate tier
  binds before the 120-per-user tier, so the profile is capped at 250 requests
  per minute in aggregate. Declared, not discovered.
- **Screen-reader evidence is automated plus keyboard.** One maintainer with one
  screen reader is a narrowed sample; see the deferral below.
- **Preview identities are real accounts, not synthetic.** Carried forward from
  Phases 6 and 7 as a fact.

## Quality budgets

Every budget states its limit, the surface it is measured on, and which
authorization it needs. No budget carries a partial authorization: a gate is
granted or it is not, and "partly" would mean a human decides at run time which
half of a budget needed approval, which is the manual unrecorded flip `D-P7-01`
was written to eliminate.

### Measured on the repository, the artifact, or a local environment — no remote authorization

| Budget | Limit | Measured on |
|---|---|---|
| Initial dashboard JS against the `P7-G5` baseline | **byte-identical; 0 B growth** | built artifact |
| Collaboration startup ceiling | ≤ 75 KiB gzip | built artifact |
| Lazy Phase 7 chunk | ≤ 60 KiB gzip **and unchanged from the `P7-G5` measurement** | built artifact |
| Collaboration modules on Personal startup | 0 | built artifact |
| Collaboration modules on Guest startup | 0 | built artifact |
| Document list page | default 50, maximum 100, `nextCursor` null at end | contract and local D1 |
| Member list page | default 50, maximum 100 | contract and local D1 |
| Cursor traversal over the seeded fixture | full set, no repeat, no skip, authorization re-evaluated per page | local D1 |
| Request body | ≤ 1 MiB, rejected before crypto and before D1 | contract |
| Ciphertext **field** at the API | ≤ 786,432 B decoded (768 KiB), rejected before crypto and before D1 | contract |
| `ciphertext_envelope` **column** in D1 | 18 B – 1,048,576 B | local D1 |
| `result_json` | ≤ 4,096 B | local D1 |
| Control-plane latency | p95 ≤ 250 ms over ≥ 200 samples, in its own `cf:test` pass | local D1 |
| Concurrency | 20 concurrent writers → exactly 1 revision advance | local D1 |
| Replay | 32 identical replays → 1 revision, 1 idempotency result, 1 audit event | local D1 |
| Fuzz timing band | \|Δp95\| ≤ 25 ms **and** ≤ 10% of the slower arm's p95, ≥ 200 paired samples per arm | local D1 |
| Rate tiers | enforced exactly at the frozen boundaries; 0 domain mutations from any `429` | local Functions |
| Oversize rejection | `413` with 0 D1 statements executed | local Functions |
| Client encrypt / decrypt of the reference document | p95 ≤ 150 ms each, ≥ 200 samples | reference browser profile |
| Decrypt and render 100 reference documents | p95 ≤ 500 ms, ≥ 50 runs | reference browser profile |
| Outbox flush of 25 queued entries | p95 ≤ 5,000 ms, ≥ 30 runs | reference browser profile |
| Accessibility | 0 `axe-core` violations at any impact under the declared tag set; focus ring ≥ 3:1; targets ≥ 24 px | reference browser profile, declared matrix |
| Responsive | 320 / 768 / 1024 px, no horizontal page scroll | reference browser profile |
| Dependency audit | `npm audit --audit-level=high` exits 0, **or** every Critical/High advisory carries an unexpired waiver with advisory ID, source, reachability statement, owner, and expiry | repository |
| Bill of materials | one CycloneDX component per production and development dependency; 0 components without a resolved version and integrity hash | repository |
| Lockfile | unchanged by `npm ci`; every GitHub Actions dependency pinned to a commit SHA | repository |
| Local fallback network log | 0 `/api/v1/*` requests, 0 console errors, 0 page errors over ≥ 300 s | locally served `_site` |
| Guest startup, local | 0 `/api/v1/*` requests, 0 collaboration modules, 0 personal storage writes over ≥ 300 s | locally served `_site` |
| Restore rehearsal | **RPO ≤ 5 min, RTO ≤ 60 min**, measured during the rehearsal | disposable D1 |
| D1 fault injection | injected failure at every atomic write boundary → 0 rows changed | disposable D1 |

### Measured on Preview — behind `P8-G4`

| Budget | Limit | Measured on |
|---|---|---|
| **Authenticated API read** | **p95 ≤ 300 ms**, ≥ 200 samples, provider time excluded | Preview |
| **Authenticated API write under the 10-active-user profile** | **p95 ≤ 500 ms**, ≥ 200 samples, provider time excluded | Preview |
| **Sustained workload** | **≥ 600 s at ≤ 250 requests/minute aggregate, ≥ 2,500 authenticated requests, ≥ 500 document mutations, `RATE_LIMITED` share ≤ 0.5%** | Preview |
| Collaboration modules on Guest startup, on the deployment | 0 | Preview deployment |

### Measured on the live GitHub Pages origin — behind `P8-G4B`

| Budget | Limit | Measured on |
|---|---|---|
| Fallback network log | 0 `/api/v1/*` requests, 0 console errors, 0 page errors over ≥ 300 s | GitHub Pages origin |
| Fallback banner | present and readable at 320 px | GitHub Pages origin |

### Fixtures, which are not budgets

| Fixture | Shape | Where |
|---|---|---|
| Workload baseline | 25 members, 10,000 documents, 50 revisions/document, 10 concurrently active users | seeded local D1, then Preview |
| Reference document | The frozen representative document defined in `config/cloudflare/phase-8-contract.json` by field sizes and ciphertext length | client budgets |

A fixture describes what was measured. It has no pass or fail in it, and listing
one in a budget table as though it did is how a plan acquires a budget that
cannot be violated. The pass/fail statement over the workload fixture is the
**Sustained workload** row above.

### How a measured budget is recorded

Every latency and client budget records **p50, p95, max, error rate, sample
count, D1 rows read and written, the deployment ID where one applies, the D1
migration version, and the runner profile**. A record missing any of those fields
fails its gate whether or not the p95 is inside the budget, because
`quality-strategy.md` §4.7 requires those fields and a p95 with no sample count
is not reproducible — Phase 5's evidence recorded a ten-sample p95, and ten
samples of a 150 ms budget is a coin flip.

The **reference profile** is recorded once in
`config/cloudflare/phase-8-budgets.json`: CPU model and core count, installed
RAM, OS build, browser name and build, headless or headed, CPU throttling
disabled, mains power, and the count of concurrent processes permitted during a
run. "Local browser" is not a measurement method. A budget measured on a
different profile is a different budget, and the gate fails on a profile
mismatch rather than comparing across machines.

The **measured surface** of every byte budget is pinned by enumeration: the
budgets manifest lists the exact module-graph entry points and the exact file set
each byte figure covers, and the gate fails when the measured set differs from
the pinned set. This is what turns "a budget met by shrinking the measured
surface rather than the shipped bytes fails" from a warning into a check.

The 0 B growth row deserves its own sentence, because a reader is entitled to ask
what could ever violate it. Phase 8 ships no runtime code — its new code is
harnesses, drivers, fixtures, and gate scripts, none of which enter `_site` — so
the expected growth is exactly zero and the budget is stated as byte-identical
rather than as a tolerance. The check is not decorative: it is what catches a
fixture, a canary corpus, a load driver, or a scanner leaking into the shipped
artifact, which is precisely the failure the prohibitions below name. A ≤ 30 KB
allowance over a phase that ships nothing would be unfailable; 0 B is not.

Zero tolerance for P0/P1 skips, quarantines, disabled cases, conditional
omissions, accepted flakes, open P0/P1 findings, findings with no disposition,
plaintext canaries, credential canaries, silent caps, silent narrowings, vacuous
assertions, gates without a mutation probe, empty scans, unowned Critical or High
risks, colour-only state signalling, and horizontal page scroll. P2 findings
require recorded Product Owner and Senior QA acceptance; P3 findings require a
named owner and a date.

## Reused rather than rewritten

Phase 8 writes no second copy of any suite that already exists. Where an existing
suite covers a layer, the story extends that file and its gate asserts the case
count moved.

**Pinned baselines — must keep passing, must not be modified:**
`personal-vault-characterization.test.mjs` (10 cases),
`storage-provider-isolation.test.mjs`, `vault-encryption.test.mjs`,
`storage-migrations.test.mjs`, `search-index.test.mjs`,
`state-calculations.test.mjs`, `service-worker.test.mjs`,
`security-headers.test.mjs`, `markup-helpers.test.mjs`,
`interaction-contract.test.mjs`, `maintainability-characterization.test.mjs`,
`runtime-dependencies.test.mjs`, `api-shell.test.mjs`,
`dashboard-performance.test.mjs`, `runtime-performance.test.mjs`,
`sync-storage-performance.test.mjs`.

**Extended in place, not duplicated:**

| Story | Extends |
|---|---|
| CF-P8-002 | `document-envelope.test.mjs`, the conflict-calculator cases in `conflict-resolution.test.mjs`, `outbox.test.mjs`, the enumerated `collaboration-*.test.mjs` set, `tests/cloudflare/e2ee-primitives`, `identity-primitives`, `central-rbac-policy`, `document-fingerprint` |
| CF-P8-003 | `collaboration-migrations`, `migration-compatibility-matrix`, `persistence-primitives`, `security-mutation-recipes`, `document-mutations`, `document-reads`, `outbox-replay`, `retention-privacy-scale`, `d1-harness`, `parallel-a` / `parallel-b`, `workspace-bootstrap`, `invitation-lifecycle`, `membership-administration`, `device-services`, `workspace-key-services`, `collaboration-readiness`, `audit-scoped-reads`, `conflict-resolution.workers` |
| CF-P8-004 | `document-routes`, `preview-api-integration`, `api-side-effects`, `identity-request-policy`, `preview-key-foundation` |
| CF-P8-005 | `oauth-transaction-lifecycle`, `oauth-callback`, `session-lifecycle`, `identity-abuse-observability`, `identity-runtime` |
| CF-P8-007 | `identity-burst-worker` |
| CF-P8-008 | the copy-eligibility cases in `conflict-resolution.test.mjs`, `tests/browser-conflict-resolution.mjs` |
| CF-P8-010 | `security-headers.test.mjs`, `cloudflare-deployment-boundary.test.mjs`, `scripts/check-deployment-boundary.mjs` |
| CF-P8-011 | `tests/browser-collaboration-integration.mjs` |
| CF-P8-012 | `tests/browser-device-key-lifecycle.mjs` |
| CF-P8-013 | `tests/browser-outbox.mjs`, `tests/browser-conflict-resolution.mjs` |
| CF-P8-014 | `tests/browser-smoke.mjs` |
| CF-P8-015 | `tests/browser-collaboration-qualification.mjs` |
| CF-P8-017 | the Phase 2 recovery procedure and the `d1-harness` fixture |
| CF-P8-019 | `scripts/smoke-production-boundaries.mjs`, **unmodified**, run only under `P8-G4B` |

Three of those rows carry a note about ownership, because a shared file with two
owners is a half-owned file unless the split is written down.
`conflict-resolution.test.mjs` is split by case set between `CF-P8-002` and
`CF-P8-008`. `tests/browser-conflict-resolution.mjs` is split between `CF-P8-008`
(the copy refusal) and `CF-P8-013` (the offline conflict path). Each manifest
names its own cases and each gate asserts its own count moved.

The `collaboration-*.test.mjs` set is **enumerated in the manifest, never
counted**. A gate pinned to the literal number fifteen breaks the moment a file
is added, split, or renamed, and it would happily count an untracked working-copy
file as coverage. The manifest lists each file by path; the gate asserts every
listed file is tracked by Git, that every tracked `collaboration-*.test.mjs` is
listed, and that the case count of each moved. The set is also not homogeneous:
`collaboration-api-client.test.mjs` and `collaboration-services.test.mjs` are
transport and service layers rather than surface units, and the manifest labels
each file with its kind so that "the surface units" means the files that are
surface units.

**Genuinely new code** is limited to: the two-identity context plumbing, the
derived RBAC expectation table, the fuzz corpus generator, the rate and
exhaustion driver, the credential-eligibility harness, the four-class canary
generator and scanner, the guest isolation journey, the load driver, the seeded
workload fixture, the resilience rehearsal harness, the accessibility scanner
integration, the mutation-probe harness, and the twenty-two gate scripts with
their policy modules, manifests, and drift tests. One pinned dev dependency —
`axe-core` — is added by `CF-P8-001` and audited by `CF-P8-010`. Nothing else.

## Environment topology

| Environment | Maximum Phase 8 state | Verification behaviour | Authorization |
|---|---|---|---|
| Node unit | In-memory deterministic fixtures, fixed clock and identifiers | Every unit and policy suite; no network, no browser | none |
| Local Workers/D1 | Disposable schema-12 D1 through `@cloudflare/vitest-pool-workers`, mock OAuth exchange only | Migrations, transactions, constraints, contract, fuzz corpus, rate tiers, canary D1 scan | none |
| Disposable D1 for rehearsal | A database created for the rehearsal and deleted after it | Migration, restore, purge, rollback, and fault drills | none |
| Local browser | Locally served `_site` plus local Functions, two isolated contexts, build-excluded test OAuth identity | G1–G10 local proof, accessibility, client budgets, guest and fallback network logs | none |
| Preview before `P8-G4` | Existing isolated D1 and identity runtime | Read-only preflight only; no new session, workspace, document, or load | none |
| Preview after `P8-G4` | Reviewed routes, three designated real GitHub identities, no test bypass | The ten scenarios over HTTPS, the two latency budgets, the sustained workload, deployed guest startup, cleanup and reconciliation | **`P8-G4`** |
| GitHub Pages origin | None — read-only `GET` traffic | The deployed half of `G10`: network log, console and page errors, banner | **`P8-G4B`** |
| Production (Cloudflare) | No D1 binding, no identity, no business route | `503 COLLABORATION_UNAVAILABLE`; the existing boundary smoke runs under `P8-G4B` alongside the fallback check, unchanged | **`P8-G4B`** |

The production Cloudflare origin appears in this table with an authorization
because `scripts/smoke-production-boundaries.mjs` reaches it. It is read-only,
unchanged, and confined to `CF-P8-019`. No Phase 8 story writes to it, binds
anything to it, or changes its configuration.

## Boundaries

Unchanged and non-negotiable: no production D1, no production identity, no
production document or key routes, no collaboration activation in production, no
server-visible plaintext, no automatic merge, no automatic Personal Vault upload,
no personal-provider fallback when a collaboration call fails, and no silent
draft discard. Migrations `0001` through `0012` remain immutable at schema 12;
Phase 8 adds none, and a finding that appears to require one returns to a gate
for a separately reviewed forward-only additive migration under the disposition
rules above.

The following are prohibited throughout Phase 8:

- any new route, table, migration, persisted field, or error code;
- a deployed test or authentication bypass, a mock provider reachable from a
  production build, or real customer data as a fixture;
- a fixture, fuzz corpus, canary set, load driver, or accessibility scanner
  present in `_site` or reachable from `functions/`;
- weakening a gate, a budget, a rate tier, or the error taxonomy so a suite
  passes;
- reducing the load profile, fuzz corpus, canary set, or browser matrix without a
  declared narrowing;
- editing a closed phase's module, gate, or frozen contract from inside a Phase 8
  story;
- describing the Preview identities as synthetic, or the WebKit engine proxy as
  Safari;
- silently resetting the Phase 6 and Phase 7 Preview residue;
- restoring shared Preview without separate destructive approval.

GitHub Pages remains a static Personal and Guest fallback and must say so. `G10`
is the assertion that it does, measured on the network rather than on the source.

## Deferred to Phase 9 — recorded, not forgotten

- **Copy to workspace as a user-facing surface.** `phase-7-sprint.md` deferred
  "Copy to workspace and the Credential exclusion" to Phase 8. The exclusion is
  **not** deferred — `CF-P8-008` and the credential canary class in `CF-P8-009`
  verify it across all five contracted paths. The **surface** stays deferred,
  because Phase 8 adds no surface and building one here would make the
  verification phase the phase that shipped an unverified feature.
  `CF-P6-007` already implements the refusal in the service layer and `ADR-007`
  records the residual risk, so the boundary stays enforced while it is unexposed.
- **Rich text editing and a side-by-side conflict diff.** Also deferred from
  Phase 7. Both are product surfaces, and the four labelled resolutions satisfy
  `U4` without a diff view. A verification phase is the wrong place to add either,
  and neither is among the owner's ten scenarios.
- **Safari 17.4+ qualification.** The frozen browser matrix requires it and this
  sprint cannot run it: Safari does not run on the Windows development and CI
  host, and Playwright's WebKit is a different engine build. It needs a macOS or
  iOS host or a device cloud, which is a procurement decision outside this
  sprint's authority. Recorded as risk `R24` and carried open into the exit rather
  than quietly dropped from the matrix.
- **Production activation, the production smoke suite, and the production
  canary workspace.** Production has zero D1 bindings and answers `503`. A
  release suite cannot be written against an environment that has nothing to
  verify. Phase 8 verifies the deployments that exist; production activation
  keeps its own later gate.
- **Rehearsals against the production-bound path.** `CF-P8-017` rehearses every
  procedure on disposable resources, which is the only honest place to rehearse
  them before production exists. Rehearsing a restore against a database that
  will hold real rows is `CF-P9-006`, behind its own authorization.
- **Synthetic-identity re-qualification.** `operational-runbook.md` prescribes
  designated synthetic identities. Phases 6 and 7 used real accounts belonging to
  the project owner, and Phase 8 will too, because creating and maintaining
  synthetic GitHub accounts is an account-policy decision outside this sprint's
  authority. Recorded so no Phase 8 record misdescribes its own evidence.
- **Preview data reset and complete cleanup.** Revisions and audit are
  append-only by trigger and no workspace delete route exists, so the residue
  from Phases 6 and 7 persists and Phase 8 adds to it. A purge path is a
  persistence change requiring a reviewed forward-only migration and its own
  gate.
- **Manual screen-reader evidence beyond the automated scan and keyboard walk.**
  The quality strategy asks for it; one maintainer with one screen reader is a
  narrowed sample that would have to be declared as such, and a declared sample
  of one is worth less than an honest deferral.
- **Key rotation and terminal-loss journeys as browser E2E.** Both are proven at
  the service layer by `CF-P5-006` and `workspace-key-rotation.workers.test.ts`,
  and both are drilled at the service layer by `CF-P8-017`. Neither is among the
  owner's ten scenarios, and bolting either onto an existing story would leave it
  half-owned.
- **Load beyond the ten-active-user profile.** Ten concurrent users is the
  approved Gate G3 workload baseline. A larger profile changes the budget
  contract and needs Product Owner approval, not a test-file edit.
- **Ownership transfer, export, and workspace deletion journeys.** Export and
  deletion are deny-closed at `409 LIFECYCLE_POLICY_UNAVAILABLE` until their
  contracts are approved; verifying a journey that is contractually absent would
  verify the denial and nothing else, which `CF-P8-004` already does at the
  contract layer.

This is a deliberate deferral list, not a list of omissions.

## `P8-G0` recommendation

**APPROVE `CF-P8-001` ONLY.** Approval of `P8-G0` authorizes the verification
contract freeze and nothing else. It does not authorize any suite, the fuzz
corpus, the load driver, the rehearsals, Preview access, the GitHub Pages origin,
or any later story. `P8-G4` and `P8-G4B` are separate owner decisions, recorded
in the decision log before the work they authorize begins.
