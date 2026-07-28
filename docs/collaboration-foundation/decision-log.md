# Collaboration Foundation Decision Log

Status: Phase 0 closed at Gate G4; retained as the controlling implementation decision history

Owner: Product Owner

Reviewers: Architecture, Security, Senior QA

## Purpose

This log records approved decisions, working assumptions, and blocking decisions. A working assumption is not implementation authorization. Decisions with architecture or security consequences must be expanded into the corresponding ADR before dependent Phase 1 work becomes Ready.

## Status definitions

- **Approved:** accepted by the accountable decision owner and safe to use as a specification baseline.
- **Working assumption:** direction accepted for discovery but not yet approved through its ADR.
- **Open:** options or consequences remain unresolved.
- **Blocked:** dependent work cannot proceed.
- **Superseded:** replaced by a later recorded decision.

## Decisions

| ID | Date | Decision | Status | Owner | Consequence / next artifact |
|---|---|---|---|---|---|
| DL-001 | 2026-07-15 | Gate G0 product boundary is approved. Foundation targets small internal QA/product teams and excludes realtime editing, comments, attachments, shared credentials, public workspaces, organization hierarchy, and automatic personal-data migration. | Approved | Product Owner | Day 2 may proceed. Phase 1 remains blocked by the complete Phase 0 exit gate. |
| DL-002 | 2026-07-15 | Personal Vault, guest mode, public sharing, and workspace collaboration are separate product and storage contexts. | Approved | Product Owner | Storage-provider isolation must be covered by architecture, domain rules, and regression tests. |
| DL-003 | 2026-07-15 | A personal document enters a workspace only through an explicit, one-time copy. Credentials are ineligible. | Approved | Product Owner | API and UI must both enforce eligibility; no background or login migration. |
| DL-004 | 2026-07-15 | Cloudflare Pages is the canonical collaboration origin; GitHub Pages is personal/guest fallback only. | Approved | Product Owner + Architect | Fallback must fail closed and link to the canonical origin without retry loops. |
| DL-005 | 2026-07-15 | Same-origin Pages Functions plus D1 are the preferred Foundation server boundary. | Working assumption | Architect | Finalize in ADR-001 after environment, migration, and consistency consequences are reviewed. |
| DL-006 | 2026-07-15 | Durable Objects and R2 are deferred because realtime coordination and attachments are outside Foundation. | Approved for Foundation scope | Product Owner + Architect | Revisit only through a new approved phase. |
| DL-007 | 2026-07-15 | Shared updates use server-authoritative revisions and idempotency; client timestamp last-write-wins is prohibited for collaboration. | Approved | Product Owner + Architect + QA | Finalize compare-and-set and conflict semantics in ADR-006. |
| DL-008 | 2026-07-15 | Server-side authorization is required for every workspace resource; UI visibility is not an authorization control. | Approved | Security | Day 2 must produce a complete role/action matrix and cross-workspace abuse cases. |
| DL-009 | 2026-07-15 | Invitation acceptance and cryptographic readiness are separate states. A server that never receives the plaintext workspace key cannot create a new member's key envelope. | Working assumption | Security + Architect | Day 2 domain and threat models must define `pending_key`, authorized envelope provisioning, substitution protection, timeout, and recovery. |
| DL-010 | 2026-07-15 | Gate G1 role policy is approved: Owner retains ownership and highest-risk lifecycle controls; Admin manages Editor/Viewer membership and devices; Editor mutates eligible shared documents; Viewer is read-only; removed, revoked, unauthenticated, Guest, and pending-key principals are deny-closed. | Approved | Product Owner | Day 3 ADRs must preserve these ceilings and finalize key-envelope provisioning. |
| DL-011 | 2026-07-15 | The twelve-ADR Day 3 package is approved as the architecture baseline while preserving Gates G0/G1. | Approved at Gate G2 | Product Owner + Architecture + Security + QA | Day 4 contracts may proceed; Phase 1 remains blocked by the Phase 0 exit gate. |
| DL-012 | 2026-07-15 | Adopt the Day 4 API, D1 schema, cryptographic, operations, risk, and quality contracts as the implementation baseline. The official client excludes Credentials, while the E2EE API cannot semantically inspect malicious authorized ciphertext. | Approved at Gate G3 | Product Owner + Architecture + Security + QA + Operations | Day 5 consolidation may proceed; Phase 1 remains blocked by the Phase 0 exit gate. |
| DL-013 | 2026-07-15 | Use the Day 5 sequenced backlog and evidence plan as the controlled path from specification to implementation. | Approved at Gate G4 / Phase 0 Exit | Product Owner + Architecture + Security + QA + Operations + UX | Phase 0 is closed and controlled Phase 1 runtime-shell work is authorized; later phases and production rollout remain separately gated by executable evidence. |
| DL-014 | 2026-07-15 | Execute Phase 1 as sprint `CF-P1-S01`: migrate Pages configuration to reviewed Wrangler source control, add only a disabled API shell, generated types, deterministic seams, and a disposable local D1 harness. | Approved by Product Owner | Product Owner + Architecture + Security + QA + Operations + UX | `CF-P1-001` authorized; remote D1, OAuth, collaboration business logic/UI, Phase 2, and production activation remain prohibited. |
| DL-015 | 2026-07-15 | Adopt the sanitized Cloudflare Pages baseline, exact drift assertion, reviewed ownership transition, and non-destructive rollback procedure before the first Wrangler-controlled deployment. | Implemented and verified | Operations + Technical Lead + Security + Senior QA | `CF-P1-001` passed without changing a Cloudflare setting; `wrangler.jsonc` remains blocked until `CF-P1-002` pins the toolchain. |
| DL-016 | 2026-07-15 | Pin the Phase 1 Cloudflare toolchain, compatibility date, portable command dispatcher, CI Node major, and GitHub Actions commits before introducing Wrangler configuration. | Implemented and verified | Technical Lead + Operations + Security + Senior QA | `CF-P1-002` passed without adding runtime or a remote resource; quarterly review is owned by Technical Lead and Operations. |
| DL-017 | 2026-07-15 | Adopt reviewed Pages Wrangler source control with complete local/preview/production non-secret variables, exact-disabled Collaboration, generated runtime/binding types, and no remote bindings. | Implemented and verified | Product Owner + Technical Lead + Operations + Security + Senior QA | Git deployment, explicit Pages API synchronization, and sanitized verification added only `nodejs_compat` and four reviewed variable names; no remote binding or secret was created. |
| DL-018 | 2026-07-15 | Add one typed, disabled Pages Function shell under `/api/v1/*` with bounded validation, stable JSON failures, Web Crypto request IDs, restrictive headers, and no business/storage dispatch. | Implemented and verified | Product Owner + Technical Lead + Security + Senior QA | Production API evidence passed with no remote binding or business side effect; origin/cache isolation and deterministic adapters remain separate stories. |
| DL-019 | 2026-07-15 | Enforce environment-specific exact origins for the disabled API, bypass `/api/*` before all Service Worker cache/fallback logic, keep GitHub Pages personal/guest-only, and exclude generated `gh-pages` artifacts from Cloudflare preview builds. | Implemented and verified | Technical Lead + Security + Operations + Senior QA | `CF-P1-005` passed local and production matrices. Collaboration remains disabled; deterministic adapters remain assigned to `CF-P1-006`. |
| DL-020 | 2026-07-15 | Use explicit request-handler dependencies for time, UUIDs, random bytes/tokens, OAuth, and failure checkpoints; production injects one frozen platform implementation while deterministic adapters remain test-only and build-excluded. | Implemented and verified | Technical Lead + Security + Senior QA | `CF-P1-006` passed deterministic, sanitized-failure, import-graph, compiled-artifact, and production-selector probes. The real local D1 harness remains assigned to `CF-P1-007`. |
| DL-021 | 2026-07-15 | Use Vitest 4 `cloudflareTest()` with the reviewed Wrangler source, a Miniflare-only disposable `COLLAB_DB`, official D1 migration helpers, disabled persistence/remote bindings, and a local outbound blocker. | Implemented and locally verified | Technical Lead + Security + Operations + Senior QA | `CF-P1-007` passed real D1 behavior, deterministic fixture, migration rollback, repeat/parallel isolation, API side-effect, privacy-canary, and remote-access denial gates. Production Wrangler still has no D1 binding or resource ID. |
| DL-022 | 2026-07-16 | Make the shared `npm run check` a release-blocking Cloudflare gate, enforce a hashed runtime-only `_site` allowlist, compile/inspect Pages Functions with exact `/api/v1/*` routing, and rehearse rollback by reading a pinned compatible commit/deployment without mutating production. | Implemented and production verified | Technical Lead + Security + Operations + Senior QA | `CF-P1-008` artifact, CI-order, negative leak, Functions, startup-budget, managed-clone, read-only rollback, dual-origin deployment, and production smoke gates passed. Collaboration remains disabled and no remote D1 binding exists. |
| DL-023 | 2026-07-16 | Close Gate P1 with a machine-checked 9-story/36-evidence manifest and authorize controlled Phase 2 foundation implementation while explicitly prohibiting collaboration activation. | Approved at Gate P1 | Product Owner + Technical Lead + Security + Operations + UX + Senior QA | `CF-P1-009` passes with zero P0/P1 exceptions or open defects, named risk ownership, disabled production, no remote binding/data, and a mandatory review by 2026-10-15. Phase 2 implementation is GO; activation remains NO-GO. |
| DL-024 | 2026-07-16 | Plan Phase 2 as sprint `CF-P2-S01`: immutable D1 schema/migrations, typed persistence, atomic/idempotency evidence, preview-only provisioning after local Gate P2-G3, and disposable recovery rehearsal. | Approved at Gate P2-G0 | Product Owner + Technical Lead + Security + Operations + Privacy + UX + Senior QA | Approval starts `CF-P2-001` only. Production D1, real data, OAuth/business routes, and collaboration activation remain prohibited; each external resource action requires its named gate. |
| DL-025 | 2026-07-16 | Freeze one control plus 14 entity tables, exact canonical columns/owners, six immutable expansion migrations, ten prohibited patterns, and Critical/High invariant-to-evidence mappings. | Implemented; approved at Gate P2-G1 | Technical Lead + Senior QA + Security + Operations + Product Owner | `CF-P2-001` policy/evidence passed without SQL or remote state; Product subsequently approved `CF-P2-002`. Remote D1, binding, data, and activation remain prohibited. |
| DL-026 | 2026-07-16 | Approve P2-G1 and implement six hashed additive D1 migrations, stable schema digest, full manifest/hash chain, strict typed row contracts, append-only revision/audit guards, and disposable local D1 validation. | Implemented and locally verified | Product Owner + Technical Lead + Security + Operations + Senior QA | `CF-P2-002` evidence passes with no remote D1/binding/data/activation. Exact reapply is a no-op; drift/unknown history fails closed. Preview remains blocked until P2-G3. |
| DL-027 | 2026-07-16 | Add forward-only migration 0007, deny-by-default tenant guard triggers, stable keyset indexes, 13 approved prepared read contracts, and representative-scale query-plan verification. | Implemented; approved at Gate P2-G2 | Product Owner + Technical Lead + Security + Senior QA | `CF-P2-003` local evidence passes and Product approved `CF-P2-004`; remote D1 and collaboration remain prohibited. |
| DL-028 | 2026-07-16 | Implement typed bounded reads, exact checked writes, guarded `idempotency -> domain -> audit -> result` D1 batches, stable error translation, and server-owned authorization sessions/bookmarks. | Implemented and locally verified | Product Owner + Technical Lead + Security + Senior QA | `CF-P2-004` rollback, integrity, isolation, and API-unreachability evidence passes. Mutation recipes remain assigned to `CF-P2-005`; no remote D1 or activation is authorized. |
| DL-029 | 2026-07-16 | Approve Gate P2-G2A and add immutable forward-only transition guards for pre-membership workspace creation and invitation acceptance, then implement seven static security mutation recipes with authoritative idempotent replay. | Implemented and locally verified | Product Owner + Technical Lead + Security + Senior QA | `CF-P2-005` race, mismatch, expiry, revocation, atomicity, and API-isolation evidence passes. Migrations `0001` through `0007` remain immutable; no remote D1 or activation is authorized. `CF-P2-006` requires separate authorization. |
| DL-030 | 2026-07-16 | Approve Gate P2-G2B and add a forward-only, bounded, hold-aware operational purge control while preserving append-only behavior for ordinary callers; complete local migration, compatibility, retention, privacy, and representative-scale matrices. | Implemented and locally verified | Product Owner + Technical Lead + Security + Operations + Privacy + Senior QA | `CF-P2-006` passes with schema 9, 30/365-day server-time cutoffs, active-hold denial, adjacent-runtime compatibility, 10,000/50 scale, and zero P0/P1 exception. No remote D1 or activation is authorized. Gate P2-G3 review is next. |
| DL-031 | 2026-07-16 | Approve Gate P2-G3 and provision exactly one isolated preview D1 with a preview-only Pages binding, immutable migrations `0001` through `0009`, and disabled-runtime verification. | Implemented and remotely verified | Product Owner + Technical Lead + Security + Operations + Senior QA | `CF-P2-007` uses authenticated Cloudflare API execution because local Wrangler authentication failed closed. Production has no D1 binding, collaboration remains disabled, and no entity data exists. Gate P2-G4 review is next. |
| DL-032 | 2026-07-16 | Approve Gate P2-G4 and rehearse Time Travel recovery only on one disposable synthetic D1, followed by compatible disabled-runtime rollback proof and mandatory cleanup. | Implemented and remotely verified | Product Owner + Technical Lead + Security + Operations + Senior QA | Shared preview was bookmark-read-only and production was untouched. Restore invariants passed, no schema downgrade was used, the recovery D1 was deleted, and Gate P2-G5 review is next. |
| DL-033 | 2026-07-16 | Approve Gate P2-G5 and assemble the Phase 2 exit evidence, risk review, remote reconciliation, and Phase 3 handoff. | Implemented; Phase 2 PASS | Product Owner + Technical Lead + Security + Operations + Privacy + UX + Senior QA | Phase 3 identity/session implementation is GO. Collaboration activation remains NO-GO; production has no D1 binding or collaboration data. |

## Blocking decisions for Day 3

| ID | Decision | Accountable owner | Required evidence | Status |
|---|---|---|---|---|
| BD-001 | GitHub OAuth identity, account relinking, username change, and invitation targeting | Product + Security | Auth ADR and negative scenarios | Proposed in ADR-002/009 |
| BD-002 | Session lifetime, renewal, revocation, fixation defense, and CSRF contract | Security | Session ADR and QA contract | Proposed in ADR-002/011 |
| BD-003 | Device key algorithm, private-key protection, and browser support | Security + Architect | Crypto ADR, compatibility analysis, test vectors | Proposed in ADR-004 |
| BD-004 | Workspace envelope schema, AAD bindings, key versioning, and authorized provisioning actors | Security | Key-management ADR and threat traceability | Proposed in ADR-004 |
| BD-005 | Recovery kit and all-devices-lost behavior | Product + Security | User-impact decision and recovery ADR | Proposed in ADR-010 |
| BD-006 | Member/device revocation and key-rotation triggers | Product + Security | Lifecycle rules, residual-risk statement, tests | Proposed in ADR-010 |
| BD-007 | Exact encrypted versus server-visible metadata | Product + Security | Data-minimization decision and search impact | Proposed in ADR-005/008 |
| BD-008 | Invitation, membership, and key-readiness state transitions | Product + Security + QA | Domain model and invalid-transition tests | Proposed in ADR-003/009 |
| BD-009 | D1 consistency/transaction boundary for revision compare-and-set and invitation acceptance | Architect + QA | Storage ADR and integration-test plan | Proposed in ADR-001/006/009 |
| BD-010 | Offline outbox storage, ordering, quarantine, expiry, and account-switch behavior | Product + Architect + QA | Sync ADR and recovery UX | Proposed in ADR-006/007 |

## Change control

- Approved product-scope decisions require Product Owner approval to change.
- Approved security invariants require Security approval to weaken or replace.
- Any changed decision must update affected requirements, threats, tests, and ADRs in the same review.
- A superseded decision remains in this log with a pointer to its replacement.
- No implementation may resolve an open blocking decision implicitly.

## D-P7-01 — Collaboration may be enabled on Preview only

**Status:** APPROVED by the Product Owner, 2026-07-26. Authorizes `CF-P7-013`.

**Decision.** `COLLABORATION_ENABLED` may be `'true'` for the **`preview`
environment only**. The top-level `vars` default and the `production`
environment stay pinned to `'false'`.

**Why this needed a decision rather than an edit.** The value was closed on both
sides. Cloudflare's dashboard refuses to edit it — the project's plaintext
variables come from `wrangler.jsonc`, and only encrypted secrets are editable
there — and six gates across four closed phases assert the literal `'false'`:

| Gate | Assertion |
|---|---|
| `check-cloudflare-phase-3-exit.mjs` | line 14 |
| `check-cloudflare-phase-4-contract.mjs` | line 16 |
| `cloudflare-phase-1-exit-policy.mjs` | line 93 |
| `cloudflare-phase-2-exit-policy.mjs` | line 83 |
| `cloudflare-phase-2-migration-policy.mjs` | line 78 |
| `cloudflare-phase-2-persistence-policy.mjs` | line 24 |

That is fail-closed behaviour working as designed, not a defect. Phase 7 cannot
qualify a single journey on Preview while it holds, because every collaboration
route answers `COLLABORATION_UNAVAILABLE`.

**What changes, and what does not.** The six assertions are amended to pin
`'false'` for the default `vars` and for `production`, and to permit `'true'`
for `preview`. The boundary that actually matters — **production never
activates collaboration** — is unchanged and still machine-enforced. What is
being relaxed is the assumption that *no* environment may activate it, which was
true when Phases 1 through 4 closed and stopped being true when Phase 7 was
authorized to qualify on Preview under `P7-G4`.

**Residual risk.** The Preview deployment becomes a live collaboration
environment with real identities and real D1 rows. That was already true of
Phase 6's qualification; this decision makes the configuration match what the
sprint plan asked for rather than leaving it to a manual, unrecorded flip.

**How to apply it.** Amend the six assertions in the same commit as the
`wrangler.jsonc` change, so no window exists in which the configuration and the
gates disagree. Any story doing so must re-run `npm run check` and capture the
real exit code.

## D-P7-02 — `environment.ts`, not the Preview variable, was the bug

**Status:** APPROVED by the Product Owner, 2026-07-27. Authorizes `CF-P7-017`.

**Decision.** `functions/_lib/identity/environment.ts` line 67 is the defect.
Its condition is corrected from `COLLABORATION_ENABLED !== 'false'` (enable only
when the flag reads `'false'`) to `COLLABORATION_ENABLED !== 'true'` (enable
only when the flag reads `'true'`). `D-P7-01`'s value for Preview — `'true'` —
is left exactly as it stands.

**Why this needed a decision rather than an edit.** Two files agreed with each
other and disagreed with the deployment: `environment.ts:67` and
`api-shell.mjs:286` both read the flag with the same, opposite-of-its-name
polarity. Read on its own, that consistency could as easily mean the *code*
encodes the intended meaning and `D-P7-01`'s `'true'` is the mistake, as it
could mean the code is wrong. Only the owner could break the tie, because it
turns on what the flag was always meant to say, not on anything a gate or a
test can observe from inside the repository.

**The tie-break.** `D-P7-01` is dated 2026-07-26, one day before this decision,
and its own text says `COLLABORATION_ENABLED` is set to `'true'` for Preview
*so that collaboration would be enabled there*. A reading of `environment.ts`
under which `'true'` disables is a reading under which `D-P7-01` accomplished
the opposite of what it said and was approved to do. Option A treats that as
decisive: the code is corrected to match the intent the Product Owner already
approved and executed, rather than reopening and reversing a decision made and
acted on the day before.

**What changes, and what does not.** `environment.ts:67`'s condition is
corrected. `api-shell.mjs`'s own disabled-boundary check — which never gated
dispatch, only a terminal fallback reached after three other handlers already
declined the request — had its dead double-branch removed in the same change,
with no observable behaviour change (`tests/api-shell.test.mjs`'s NO-OP CONTROL
was re-run unmutated and still passes). Production and the default `vars`
remain pinned to `'false'` by the same six gates `D-P7-01` amended; this
decision does not touch them and changes nothing for either.

**Residual risk.** Identical to `D-P7-01`'s: Preview becomes a live
collaboration environment with real identities and real D1 rows, the instant a
deployment is built from a commit carrying this fix. No such deployment was
built or pushed as part of this decision — the fix landed in the working tree
and was verified against the local Workers-runtime test harness only.
Qualifying a journey against a rebuilt Preview deployment remains `CF-P7-013`'s
open work, and requires a signed-in session no agent can obtain.

**How to apply it.** `functions/_lib/identity/environment.ts` and
`functions/_lib/api-shell.mjs` were amended in the same change as the five
Workers-runtime test fixtures that modelled the old polarity, so no window
exists in which the code and its own tests disagree about what "enabled"
means. `npm run check` and the full Workers-runtime suite were re-run and
captured directly, per the same rule `D-P7-01` recorded.

## D-P7-03 — the lazy-chunk budget is renegotiated to 100 KiB, not met

**Status:** APPROVED by the Product Owner, 2026-07-28. Closes the open defect
`R-P7-B` recorded against `CF-P7-014`.

**Decision.** `lazy_phase_7_chunk_max_kib_gzip` is raised from **60** to **100**.
The declared figure now sits above what the shipped shape measures, so the
budget reads `MET` rather than `OPEN`. This is a renegotiation of the number, on
the record; it is **not** an amendment that quietly moves a target to wherever
the code happens to be, and it is not a claim that the code got smaller.

**Why the 60 could not simply be met.** It was written into
`config/cloudflare/phase-7-sprint-plan.json` at plan time and read by no script
until `cf:phase7:exit:check` existed, which is to say it was never derived from
a measurement of anything. When something finally measured it, the closure was
78.4 KiB on the deployment. Meeting 60 from there is not a matter of trimming:
this project has no bundling or minification step anywhere, so twenty-two
unminified source files are served exactly as authored, comments included.
Reaching 60 means adding a build step for the whole application, which is a
larger change than the budget was ever meant to force and one that would have to
be re-qualified against every surface.

**Why 100 rather than the measurement.** The closure measures 91.93 KiB, and
the nineteen Phase 7 modules alone are 77.88 KiB. Setting the budget at the
measurement would make it unfalsifiable — the next byte breaches it, so it would
be renegotiated again rather than enforced. 100 leaves roughly 8 KiB of headroom:
enough that ordinary work does not trip it, tight enough that another growth of
the size this phase saw (78.4 → 91.93 KiB, most of it the two mutation journeys
wired in on 2026-07-27) reaches it and forces this conversation again. That is
what a budget is for.

**What this does not license.** The gate keeps measuring on every run and keeps
failing on drift in either direction: recording `MET` while measuring above 100
is rejected, and so is recording `OPEN` once the measurement is under it. The
`amended: false` flag stays false, because amending and renegotiating are
different acts and the gate must keep refusing the first. A future change to
this number needs its own decision entry here; the gate reads the figure and
requires the decision that moved it.

**Still not claimed.** Nothing here says the payload is small, or that a build
step would not be worth adding later. It says the programme is carrying 91.93
KiB knowingly, at a number an owner set with the measurement in front of them,
rather than carrying a breach of a number nobody ever measured.

## D-P7-04 — rotate the canonical Preview alias after a stale Functions mapping

**Status:** APPROVED by the Product Owner, 2026-07-29. The implementation is
locally verified; the remote cutover remains pending review and deployment.

**Decision.** The canonical Preview origin and OAuth callback move from
`https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev` to
`https://codex-cf-p3-preview-v2.docvault-qa-document-hub.pages.dev`. The old
origin remains rejected by the runtime. Both collaboration handlers consume
`IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin`, so the identity boundary,
collaboration boundary, and OAuth transaction agree on one exact origin.

**Why.** Cloudflare's control plane assigned the old branch alias to the latest
successful `uses_functions` deployment, but its data plane continued returning
the retired `405 Allow: POST` route for `GET /api/v1/workspaces`; the matching
hashed deployment returned the current fail-closed `503
COLLABORATION_UNAVAILABLE` response. Retrying the deployment and triggering a
new Git deployment on that branch did not repair the alias. A deployment from a
fresh `codex-cf-p3-preview-v2` branch made its branch alias and hashed URL return
the same current response, providing a working Preview route without changing
Production.

**Boundaries.** This decision does not modify Production, D1 bindings, secrets,
Access policies, custom domains, or environment-mode flags. Historical Phase
3–7 evidence remains an account of what was qualified at the time and is not
rewritten. The Cloudflare Preview branch allowlist may retain both branch names
until the new origin is qualified; that deployment setting does not widen the
runtime's exact-origin check. The GitHub OAuth application's callback must be
updated to the new origin before live sign-in can qualify the OAuth journey.

**Verification.** Runtime tests accept the new origin and explicitly reject the
old one. The deterministic encrypted OAuth transaction vector was regenerated
because the callback origin is authenticated additional data. Focused identity,
collaboration, and callback tests and the full `npm run check` gate must pass on
the final working tree. Remote qualification follows only after review,
commit, deployment, and the owner-controlled GitHub OAuth callback update.

**Post-deployment correction, 2026-07-29.** The stale-runtime diagnosis above
was falsified after the v2 deployment made the runtime reachable on its exact
canonical origin. Worker version metadata showed version
`d67e484f-5c58-483f-ba3c-97e6ae6b7054`, built from commit `c2c84ef`, active at
100 percent on `pages-worker--16371130-preview` with the expected Preview
bindings. The `405` came from application dispatch, not an old Worker version:
the earlier key-foundation handler claimed the shared `/api/v1/workspaces` path
for its `POST` route and returned before the later collaboration handler could
serve `GET`. The alias rotation remains in place to avoid another unnecessary
origin and OAuth callback change, but it is not evidence of a Cloudflare
platform fault. `D-P7-05` records the corrective implementation.

## D-P7-05 — an early specialized handler may claim only methods it owns

**Status:** APPROVED by the Product Owner, 2026-07-29. Authorizes the
exact-method ownership correction and its deployment to Preview.

**Decision.** `handlePreviewKeyFoundationApi` yields `null` unless both the path
and method match one of its routes. It no longer emits a path-only `405`.
`handlePreviewCollaborationApi`, which follows it, can therefore own
`GET /api/v1/workspaces`; the terminal API shell remains responsible for a
contract-wide `405` and complete `Allow` header when no specialized handler
owns the requested method. Identity remains first and the established handler
order is otherwise unchanged.

**Why.** The key-foundation and collaboration handlers intentionally share
`/api/v1/workspaces`: keyed creation owns `POST`, while reload-safe workspace
listing owns `GET`. Their isolated tests both passed, but the production
entrypoint invokes key foundation first. Its former route resolver treated a
path match as ownership even when the method did not match, so `GET` terminated
with `405 Allow: POST` and never reached the implemented list operation.

**Boundaries.** Exact key-foundation methods retain all existing authentication,
origin, CSRF, media-type, D1, and cryptographic checks. Unsupported key-route
methods still receive `405` from the terminal shell; they merely stop being
answered prematurely by a non-terminal handler. Production remains disabled,
and this decision changes no bindings, secrets, databases, Access policies, or
OAuth configuration.

**Verification.** A Workers-runtime regression test calls the real
`functions/api/v1/[[path]].ts` entrypoint, not either handler in isolation. It
first reproduced the live `405`, then required unauthenticated
`GET /api/v1/workspaces` to reach the collaboration boundary and return `401
UNAUTHENTICATED`. It also keeps the terminal `405` and `Allow: GET, POST`
contract for an unsupported document-route method. Focused key, collaboration,
document, and composition suites pass; the full gate remains required before
review.
