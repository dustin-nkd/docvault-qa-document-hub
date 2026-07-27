# Collaboration Foundation Phase 8 handoff

Status: **ISSUED by `CF-P7-014` — controlling for Phase 8 on the grant of
`P7-G5`. `P7-G5` is NOT granted and Phase 8 is NOT open.**

This document is written now, and is deliberately not postdated. It states what
Phase 7 hands over, what it fails to hand over, and the conditions under which it
becomes controlling. Reading it as an open door would be a misreading: **five**
entry preconditions are unmet and each is named below with the role that owns it.
See [`phase-7-exit-report.md`](phase-7-exit-report.md) §10 for why the phase did
not close.

## Objective

Verify everything Phases 1 through 7 built, on the surfaces where the claims are
actually true, and produce a release-candidate freeze. Phase 8 adds **no** route,
table, migration, persisted field, error code, or cryptographic, persistence, or
authorization primitive. It is the verification layer, and nothing else.

The one thing it does add is measurement, and measurement is the easiest thing in
this programme to fake. Phase 7 shipped eleven passing gates over a feature that
could not reach the network, two drift tests whose mutation never applied, a
deployment claim measured on a build that did not contain the modules being
claimed about, and a declared budget that no script had ever read. Every one of
those was a *passing* result. Phase 8 exists because the difference between a
suite that verifies and a suite that reports success is not visible from the exit
code.

## What Phase 7 hands over

- **Frozen UI contract and surface inventory** (`CF-P7-001`): twelve surfaces,
  each owned by exactly one story, a five-state sync machine and a four-state
  base-state set both closed, WCAG 2.2 AA, and a 320 px floor. A surface, a
  state, or a mapping may not be added or removed as an implementation detail.
  **Incomplete — see "What Phase 7 does not hand over", item 2.**
- **Lazy collaboration shell and the availability banner** (`CF-P7-002`): zero
  collaboration modules referenced eagerly, zero precached, and zero evaluated on
  Personal startup — measured on the deployment, not inferred. The GitHub Pages
  banner states that collaboration is Cloudflare-only.
- **Account menu, workspace switcher, and persistent workspace identity**
  (`CF-P7-003`): the active workspace is identifiable without opening a menu and
  survives reload; the resolver refuses to fall back silently.
- **Create workspace, device and key initialization** (`CF-P7-004`,
  `CF-P7-005`): both surfaces are composed and read live. Neither journey can
  complete in this build, for declared reasons — no unlock-secret surface exists
  in the frozen twelve, and no client-side workspace-DEK sealer exists in the
  browser at all. Controls are held disabled with their reason in text rather
  than failing on press.
- **Membership and roles** (`CF-P7-006`): 60 role-disabled controls, every one
  visible, programmatically disabled, and carrying a reason assistive technology
  announces. Zero hidden, zero unexplained.
- **Invitations** (`CF-P7-007`, `CF-P7-008`): creation, copy, revoke, and the
  review half of acceptance. The raw token never reaches a URL and the address
  bar is cleared by replacement.
- **Sync state** (`CF-P7-009`): exactly five states — `Saved`, `Saving`,
  `Offline`, `Conflict`, `Access removed` — with no ad-hoc sixth. Two are
  reachable in this build; the other three derive from outbox entries for an open
  document, and no document surface exists in the frozen inventory.
- **Conflict resolution** (`CF-P7-010`): the four `CF-P6-007` resolutions as real
  UI. Dismissal decides nothing, discard needs arming and confirming, no
  automatic merge is ever performed.
- **Audit activity** (`CF-P7-011`) and **cross-cutting responsive and
  keyboard/focus qualification** (`CF-P7-012`): zero overflow, clipped text, or
  sub-24 px targets across 18 measurements; zero missing focus rings; lowest
  measured focus-ring contrast 5.48:1 against a 3:1 floor.
- **The API client layer** (`CF-P7-015`): the one module permitted to call
  `fetch`, and a gate that walks the entry's import graph to check that claim
  rather than take it. `js/collaboration/services.js` joins surface-shaped method
  names to frozen routes; path segments are validated as UUID v4 before
  interpolation, and a server refusal is raised rather than returned.
- **Composition and deployment measurement** (`CF-P7-013`, **PARTIAL**): the
  composed shell driven against a recording transport, plus read-only
  measurements on Preview `681ad3ca-f0f7-4f66-8649-c7dab3de798d`. Four evidence
  records, all PARTIAL.
- **Seventeen `cf:phase7:*` gates** wired into `check:cloudflare` and pinned in
  `scripts/cloudflare-ci-policy.mjs`, and **28 evidence records** under
  `docs/collaboration-foundation/evidence/phase-7/`. The sixteenth was
  `cf:phase7:exit:check`, shipped by `CF-P7-014` on 2026-07-27, which closes
  `R-P7-D` and is the gate that now enforces the story arithmetic below; the
  seventeenth is `cf:phase7:dispatch:check`, shipped the same day by `CF-P7-017`.
- **The corrected arithmetic.** Phase 7 has **seventeen** stories, `CF-P7-001`
  through `CF-P7-017`, of which **sixteen** are PASS: `CF-P7-013` is the sole
  non-PASS story. `CF-P7-017` closed the same day it was opened, once `D-P7-02`
  decided the owner question it was blocked on. Earlier drafts of the exit
  report and of `phase-8-sprint.md` read "13 of 14"; the denominator missed
  `CF-P7-015`, which took the next free number after the plan was frozen, and the
  numerator went stale twice more in the same day as `CF-P7-016` landed,
  `CF-P7-017` was opened, and then closed. All of it is now computed by
  `cf:phase7:exit:check` from the story inventory rather than written by hand.

## What Phase 7 does not hand over

Five gaps. Each is an entry condition, not a Phase 8 story, and none can be
closed from inside Phase 8.

1. **A journey qualified on a deployment.** Zero. `/api/v1/session` and
   `/api/v1/workspaces` answer `503 COLLABORATION_UNAVAILABLE` on the measured
   Preview build, so no session, workspace, member, invitation, or audit event
   exists to qualify against. Everything marked "held" in the exit report's
   gate-UX table is held for the surfaces **as composed**, locally, with the
   transport stubbed. Phase 8's ten scenarios each need the deployment to answer.
2. **A complete error-to-state map.** `phase-7-ui-contract.md` §4 claims every
   frozen code maps to exactly one presentation and then maps twelve, two of them
   spelled in a way no catalog uses. `api-contract.md` §8 holds **29** codes, so
   seventeen have no presentation at all — three of which (`INVITATION_UNAVAILABLE`,
   `METHOD_NOT_ALLOWED`, `LAST_OWNER_REQUIRED`) are load-bearing in Phase 8's own
   scenarios. The fix is `CF-P7-016`, a **Phase 7** story, with the amendment to
   `cf:phase7:contract:check` in the same commit as the contract change so no
   window exists in which the two disagree. Phase 8 must not fix this from inside
   `CF-P8-001`: editing a frozen contract and a still-open phase's gate from a
   later phase is exactly the move this programme forbids everywhere else.
3. **A lazy chunk inside its budget.** Declared at 60 KiB gzip, measured at
   **78.4 KiB** on the deployment — over by 31%, and over at 64.3 KiB even when
   only the seventeen Phase 7 modules are counted. Measured for the first time by
   `CF-P7-013`, because the key is read by no script. Neither met nor
   renegotiated. `CF-P8-016` inherits it as "≤ 60 KiB gzip **and** unchanged from
   the `P7-G5` measurement", which cannot be evaluated until a `P7-G5`
   measurement exists.
4. **An automated Phase 7 exit gate.** `cf:phase7:exit:check` was required to
   ship with `CF-P7-014` and does not exist, so the exit report's story-to-gate-
   to-evidence reconciliation is asserted by a document rather than enforced by a
   script. Phases 2 through 6 each ship one; Phase 5's rejects 55 mutation cases.
5. **A completing authoritative gate.** `npm run check` exits **127** at its
   third Cloudflare gate, `cf:types:check`, because the on-disk
   `worker-configuration.d.ts` is CRLF while `wrangler types` emits LF; the
   content and the configuration hash are identical, and wrangler aborts inside
   libuv rather than exiting cleanly. It is the third of the seventy-two gates in
   `check:cloudflare`. Every individual gate — 15 `cf:phase7:*`, 47 across Phases
   1 to 6, and the whole of `check:base` at 1,086 passing and 0 failing tests —
   passes when run on its own. Phase 8 measures a great deal and reports it
   through this chain, so a chain that stops at gate three is a Phase 8 problem
   before it is anything else. Note the direction of the failure: a genuinely
   stale types file produces the identical message, so this cannot be waved
   through by habit.

## Phase 8 scope

The plan is [`phase-8-sprint.md`](phase-8-sprint.md), which exists and is
detailed. This handoff does not restate it. Its shape:

1. **Fifteen test layers** — unit, D1 integration, API contract, session/CSRF/
   OAuth abuse, authorization fuzzing, rate limit and exhaustion, credential
   eligibility, XSS and canary, supply chain and headers, two-context browser
   journeys, accessibility, delivery budgets, operational rehearsal, performance
   and load, and the deployed fallback origin.
2. **Twenty-one stories, twenty-two gates.** `CF-P8-001` owns two — `contract`
   and `sprint` — because the plan is an artifact that can drift like any other
   and the freeze story is the one that owns it. That closes the hole Phase 7
   left with `cf:phase7:sprint:check`, which has no stated owner.
3. **Ten sprint gate scenarios**, each closed twice: once locally against real
   local Pages Functions and a real disposable D1, and once on the deployment
   named in its row. A local pass alone does not close a scenario whose claim is
   about a deployment.
4. **Two remote authorizations, not one.** `P8-G4` authorizes `CF-P8-018` to
   reach **Preview** and nothing else. `P8-G4B` authorizes `CF-P8-019` to reach
   the **live public GitHub Pages origin**, read-only, over HTTP — no write, no
   session, nothing on Cloudflare. Folding the second into the first would let
   one approval carry the other.
5. **A release-candidate freeze** (`CF-P8-020`) and the Phase 9 handoff
   (`CF-P8-021`).

## Entry constraints (non-negotiable)

Inherited unchanged from the Phase 7 handoff, and extended:

- Never send plaintext document semantics, device private keys, unlock secrets,
  KEKs, or workspace DEKs to the server.
- No automatic Personal Vault upload, no mirroring, and no personal-provider
  fallback when a collaboration call fails.
- No automatic merge and no silent draft discard.
- No production D1 binding, production identity, production document or key
  route, production secret, deployed test or authentication bypass, or
  collaboration activation in production. GitHub Pages stays a static
  Personal/Guest fallback and must say so.
- Migrations `0001` through `0012` are immutable at schema 12. Phase 8 adds none;
  a finding that appears to require one returns to a gate for a separately
  reviewed forward-only additive migration.
- **No new route, table, migration, persisted field, or error code.** No
  thirtieth error code is invented; the catalog is twenty-nine, enumerated from
  the contract rather than asserted as a number.
- **A finding is recorded by Phase 8 and fixed by the phase that owns the code**,
  under that phase's contract. Phase 8 never patches a service from inside a
  test, and never edits a closed phase's module, gate, or frozen contract from
  inside one of its own stories.
- **No gate, budget, rate tier, or taxonomy is weakened so a suite passes**, and
  no load profile, fuzz corpus, canary set, or browser matrix is reduced without
  a declared narrowing.
- No fixture, fuzz corpus, canary set, load driver, or accessibility scanner
  reachable from `_site` or `functions/`. No real customer data as a fixture.
- The Preview identities are **real GitHub accounts belonging to the project
  owner**. No Phase 8 evidence record may describe them as synthetic, and the
  WebKit engine proxy may not be described as Safari.
- The Phase 6 and Phase 7 Preview residue is **not** silently reset, and shared
  Preview is not restored without separate destructive approval.

## Prerequisite — NOT satisfied

Phase 7 has **not** closed. `P7-G5` is not granted. Five conditions must hold
before `P8-G0` is approved, and none can be satisfied from inside a Phase 8
story.

| # | Condition | Owner | State |
|---|---|---|---|
| 1 | `P7-G5` granted, which needs `CF-P7-013` at PASS: `COLLABORATION_ENABLED` set for the **Preview environment** of the Pages project **and** `codex-cf-p3-preview` rebuilt, then the journeys qualified against the new deployment id | Product Owner / Operations | **unmet** |
| 2 | The Phase 7 error-to-state map corrected **by Phase 7**, as `CF-P7-016`, with the gate amendment in the same commit | Technical Lead | **unmet** |
| 3 | **Three** designated GitHub identities on the Preview allowlist, and the deployment serving them **built after** the allowlist changed | Operations | **unmet** |
| 4 | The 60 KiB lazy budget met or renegotiated on the record, and given a gate that reads it | Technical Lead | **unmet** |
| 5 | `npm run check` completing with a real green exit code. It currently exits **127** at `cf:types:check`, on a CRLF-versus-LF mismatch in a generated types file whose content and configuration hash are unchanged. Every individual gate passes; the chain does not complete | Operations | **unmet** |

Condition 1 is an owner action and only an owner action. Pages binds environment
variables at build time, so setting the variable is not enough on its own, and
`wrangler pages secret put` is refused to an agent by the permission classifier.

Condition 3 is the precondition most likely to cost the sprint weeks, and it
already has. Phase 6 spent four failed attempts and a wrong diagnosis on exactly
this: a second account could not authenticate, the callback returned the
deliberately non-disclosing `auth-result=unavailable`, and the cause was neither
rate limiting nor state validation but `guardedProvider` in
`functions/_lib/identity/runtime-handler.ts`, which rejects any resolved identity
whose numeric subject is absent from `PREVIEW_ALLOWED_GITHUB_SUBJECTS`. That is a
deliberate Preview control working as designed. **Three** subjects are needed and
not two, because the mandatory scenarios require an Owner, a second writer, and a
Viewer to hold their roles at the same time in the same workspace; membership
role is per user per workspace and the server derives the actor from the session,
so two cookie jars for one subject is one user, not two. This is tracked as risk
`R23`, opened by `CF-P8-001`.

## Two conditions carry forward as facts rather than blockers

**Preview cleanup is deliberately partial.** Revisions and audit events are
append-only by trigger, the Preview surface exposes no workspace delete route,
and three browser sessions could not be revoked without their tokens. Phase 8
inherits that residue and must not silently reset it.

**Two modules are correctly absent from the deployed artifact and look exactly
like the defect.** `js/collaboration/document-envelope.js` and
`js/collaboration/storage-provider.js` both answer `200` with
`content-type: text/html; charset=utf-8` and a 43,473-byte body beginning
`<!DOCTYPE html>` — the SPA fallback, byte-for-byte the length of `GET /`. That
is correct today: the build ships the entry's transitive closure rather than the
folder, nothing under `js/` imports either module, and
`tests/cloudflare-phase-7-api-client-policy.test.mjs:574` asserts the exclusion
deliberately. It stops being correct the moment any surface imports one of them,
and the only place that failure shows is the content-type. `CF-P8-016` is the
natural owner of a check that closes it.

## When this becomes controlling

On the grant of `P7-G5`, recorded in
[`decision-log.md`](decision-log.md), and not before. Until then
[`phase-7-exit-report.md`](phase-7-exit-report.md) is the live document and Phase
7 is the open phase.

Once `P7-G5` is granted, this handoff is controlling.
