# Phase 2 sprint — D1 schema and persistence

Status: Proposed for Product Owner approval at Gate P2-G0; no remote resource authorized

Sprint ID: `CF-P2-S01`

Planned dates: 2026-07-17 through 2026-08-06 (15 working days, Asia/Ho_Chi_Minh)

Owners: Technical Lead / Senior Developer, Senior QA, Product Owner

Required reviewers: Security Reviewer, Operations, Privacy Reviewer; UX Lead for user-facing boundary review

## 1. Sprint decision

Phase 1 Gate P1 is PASS and authorizes controlled Phase 2 implementation. Phase 2 may implement the approved D1 schema, persistence primitives, migration controls, and non-production recovery evidence while collaboration remains unavailable.

Approval of this sprint authorizes `CF-P2-001` only. It does not by itself authorize:

- creating any Cloudflare D1 database;
- adding a preview or production D1 binding;
- applying a remote migration;
- creating real users, sessions, workspaces, keys, documents, or audit data;
- exposing collaboration UI or enabling `COLLABORATION_ENABLED`;
- implementing OAuth, RBAC policy decisions, E2EE operations, or document APIs assigned to later phases.

Preview resource provisioning requires a separate Gate P2-G3 approval after all local schema, persistence, fault, isolation, and privacy evidence passes. Production D1 remains prohibited throughout Phase 2.

## 2. Sprint goal and exit state

Build an executable, versioned D1 persistence foundation that exactly implements the approved schema contract and proves safe migration, transaction, compatibility, retention, performance, and recovery behavior without making collaboration usable.

At Gate P2:

- immutable migrations define all approved Foundation tables, constraints, indexes, and schema metadata;
- typed persistence primitives use prepared statements, explicit columns, workspace scoping, and checked write results;
- atomic recipes and idempotency races fail closed with complete rollback;
- migration matrices pass on empty, populated, repeated, prior-version, malformed, interrupted, and restored databases;
- one approved preview D1 may exist with synthetic data only; production has no D1 binding or collaboration data;
- recovery is rehearsed on a disposable non-production database and leaves no retained test resource;
- Phase 3 identity/session implementation receives a reviewed schema and repository contract;
- collaboration activation remains `NO-GO`.

## 3. Controlling contracts

Implementation must conform to, and may not silently reinterpret:

- [`schema-contract.md`](schema-contract.md): tables, columns, constraints, indexes, retention, consistency, and atomic recipes;
- [`ADR-001`](adr/001-runtime-and-storage.md): Pages Functions/D1 boundary and environment isolation;
- [`ADR-006`](adr/006-revisions-conflicts-and-idempotency.md): compare-and-set, idempotency, and conflict semantics;
- [`ADR-008`](adr/008-audit-and-retention.md): immutable audit and retention controls;
- [`ADR-012`](adr/012-migrations-and-rollback.md): immutable expand/contract migration and recovery model;
- [`api-contract.md`](api-contract.md) and [`crypto-contract.md`](crypto-contract.md): identifier, state, envelope, digest, size, and error contracts;
- Phase 1 exit policy: exact-disabled collaboration, no implicit Personal Vault migration, protected CI/artifact/fallback boundaries.

Any required contract change pauses the affected story and returns to Product, Security, Architecture, Operations, and QA review.

Current platform assumptions were checked on 2026-07-16 against Cloudflare's official D1 documentation:

- Wrangler records sequential SQL migrations in `d1_migrations`; database names are preferred over mutable binding names for migration commands.
- `D1Database.batch()` executes statements sequentially as one transaction and rolls back the sequence on a statement failure.
- migrations that temporarily violate foreign keys use `PRAGMA defer_foreign_keys = true`, followed by `PRAGMA foreign_key_check`; foreign-key enforcement is never silently disabled.
- D1 Time Travel is automatic for production-backend databases, but restore overwrites the selected database in place and cancels in-flight work.
- local D1 runs through Wrangler/Miniflare/workerd and must start from an explicitly disposable state for deterministic tests.

No plan relies on a numeric platform limit without rechecking it at the story that uses the limit.

## 4. Environment and resource topology

| Environment | D1 state at sprint start | Maximum Phase 2 state | Data rule |
|---|---|---|---|
| Local test | Test-only `COLLAB_DB` from Phase 1 harness | Full schema in disposable per-test databases | Deterministic synthetic fixtures and privacy canaries only |
| Local development | No required persistent database | Optional developer-local state outside Git | Never committed; reset/migration command documented |
| Pages preview | No remote binding | One reviewed `docvault-collab-preview` binding after Gate P2-G3 | Synthetic users/workspaces only; cleanup and expiry required |
| Recovery rehearsal | None | One short-lived disposable remote D1 after Gate P2-G4 | Seeded encrypted/synthetic fixture only; delete after evidence |
| Production | No D1 binding | Still no D1 binding in Phase 2 | No collaboration data, migration, or persistence path |
| GitHub Pages | Static fallback | Unchanged | No API and no collaboration state |

The code-level binding name is `COLLAB_DB`. Preview and production must never share a database identifier. During Phase 2, the stronger rule applies: preview may have one reviewed binding after G3; production must have none.

Remote identifiers are non-secret operational identifiers but remain controlled. If a Pages Wrangler binding requires a database ID, the configuration policy changes from “no IDs” to “exact approved preview ID only”; arbitrary IDs, account IDs, tokens, and all production IDs remain prohibited. Secrets never enter Git, evidence, logs, or migration commands.

## 5. Migration architecture

### 5.1 Artifact format

- Directory: `migrations/collaboration/`.
- Files: zero-padded, immutable SQL such as `0001_<sha12>_identity.sql`.
- The hash segment is derived from normalized migration content and is checked in CI; changing an applied file changes the required filename and fails history validation.
- `migrations/manifest.json` records sequence, full SHA-256, description, owner, compatibility class, minimum/maximum runtime contract, validation query set, rollback class, and privacy classification.
- Wrangler's `d1_migrations` table remains the platform application ledger. The committed manifest and sanitized release evidence provide checksum/provenance control.
- `schema_metadata` stores the logical schema version and supported runtime compatibility range, not secrets or deployment credentials.

### 5.2 Initial expand sequence

The exact grouping is finalized in `CF-P2-001`; the planned additive sequence is:

1. `0001`: schema metadata, users, OAuth transactions, and sessions.
2. `0002`: workspaces, memberships, and invitations.
3. `0003`: devices, workspace key versions, and workspace key envelopes.
4. `0004`: documents, document revisions, and mutation results.
5. `0005`: audit events and retention holds.
6. `0006`: cross-table indexes, immutability guards, and invariant validation support that cannot safely be declared earlier.

No initial migration contains real seed data. Fixtures live under test-only paths and are blocked from production artifacts.

### 5.3 Deployment order

```text
contract + immutable migration review
  -> local empty/populated/repeated/faulted migration matrix
  -> previous-runtime / expanded-schema compatibility
  -> preview resource approval
  -> create isolated preview D1
  -> preview migration preflight + apply + integrity checks
  -> disabled Pages preview deploy + smoke
  -> disposable recovery rehearsal
  -> Gate P2 evidence review
```

Migrations never execute from a browser request, Function startup, Pages build, or automatic Git deployment. Remote apply commands use the immutable database name, an approved operator, an explicit environment, and a recorded before/after migration list.

## 6. Story backlog

### `CF-P2-001` — Freeze schema inventory and migration governance

Size: M | Owner: Technical Lead + Senior QA | Reviewers: Security, Operations, Product

Execution: **PASS on 2026-07-16; awaiting Gate P2-G1 approval.** Canonical artifacts: [`phase-2-schema-freeze.md`](phase-2-schema-freeze.md), [`phase-2-migration-governance.md`](phase-2-migration-governance.md), and `config/cloudflare/phase-2-schema-freeze.json`.

Tasks:

1. Reconcile every schema table/column/state/index with API, crypto, audit, retention, and ADR contracts.
2. Produce the canonical schema inventory and relationship map; reject undeclared semantic metadata.
3. Define migration filename/hash manifest, sequence, compatibility, validation, correction, and unknown-history policies.
4. Define prohibited SQL and repository patterns: string interpolation, `SELECT *`, unscoped workspace access, unchecked zero-row writes, plaintext/secret fields, destructive same-release changes.
5. Freeze the six-file initial expand sequence and story-specific evidence matrix.

Acceptance:

- every approved entity and API identifier maps to one canonical column/type and owner;
- every Critical/High Phase 2 invariant maps to a constraint, guarded recipe, test, and evidence ID;
- no open type/state/retention/crypto mismatch remains;
- no remote resource or binding is created;
- evidence: `CF-EV-P2-STA-001`, `CF-EV-P2-SEC-001`.

Gate P2-G1: Product, Security, Technical Lead, Operations, and Senior QA approve the frozen inventory before SQL implementation.

### `CF-P2-002` — Implement immutable Foundation schema migrations

Size: XL | Owner: Senior Developer | Reviewers: Technical Lead, Security, Senior QA

Execution: **PASS on 2026-07-16.** Six hashed additive migrations, manifest/hash gate, typed D1 row contracts, local real-D1 constraints, reapply, integrity, append-only, and privacy evidence passed. Remote D1 remains absent.

Tasks:

1. Implement `0001` through `0006` with strict SQLite types, checks, foreign keys, unique/partial indexes, and explicit deletion behavior.
2. Add migration manifest/hash validation and reject edits, gaps, duplicates, unknown applied names, or checksum drift.
3. Add schema metadata and compatibility-window assertions.
4. Add immutability protection for revisions/audit history where supported without blocking approved correction events.
5. Generate typed D1 row/result contracts from the reviewed schema boundary without unsafe double casts.

Acceptance:

- all 14 entity tables plus schema metadata exist with exact contract columns and constraints;
- foreign-key and uniqueness checks pass after each migration;
- repeated matching migration apply is a no-op; changed/applied migration is a hard failure;
- no fixture, secret, remote identifier, or protected plaintext is present;
- evidence: `CF-EV-P2-STA-002`, `CF-EV-P2-INT-001`, `CF-EV-P2-SEC-002`.

### `CF-P2-003` — Enforce tenant scoping, constraints, and index plans

Size: L | Owner: Senior Developer + Senior QA | Reviewers: Security, Technical Lead

Tasks:

1. Create positive/negative constraint matrices for identity, session expiry, workspace ownership inputs, invitations, devices, key versions/envelopes, documents/revisions, idempotency, audit, and holds.
2. Prove cross-workspace foreign-key and lookup attempts fail without leaking resource existence.
3. Lock keyset-pagination indexes and reject offset pagination for mutable collections.
4. Run `EXPLAIN QUERY PLAN` for every approved repository query and reject unapproved full scans at representative scale.
5. Add source policy for prepared statements, explicit columns, workspace predicates, and bounded results.

Acceptance:

- invalid states, lengths, algorithms, references, version gaps, duplicate tokens, and cross-workspace relations fail closed;
- approved query plans use the intended indexes with stable tie-breakers;
- protected content never appears in server-visible schema or indexes;
- evidence: `CF-EV-P2-INT-002`, `CF-EV-P2-PERF-001`, `CF-EV-P2-SEC-003`.

Gate P2-G2: local schema/constraint/query-plan evidence must pass before persistence helpers merge.

Execution result (2026-07-16): **PASS** for `CF-P2-003`; Gate `P2-G2` is **APPROVED** and authorizes `CF-P2-004` only. Evidence: `CF-EV-P2-INT-002`, `CF-EV-P2-PERF-001`, `CF-EV-P2-SEC-003`.

### `CF-P2-004` — Build typed persistence and atomic batch primitives

Size: L | Owner: Senior Developer | Reviewers: Technical Lead, Security, Senior QA

Tasks:

1. Add typed repository interfaces for prepared statements, explicit row mapping, checked `changes`, bounded reads, and stable error translation.
2. Implement guarded batch construction with a required non-null guard row, domain statements, exactly one audit statement, and deterministic result read.
3. Treat zero changed rows, missing result metadata, constraint mismatch, or partial result arrays as failure.
4. Add D1 session/bookmark abstraction for authorization-sensitive read-after-write behavior without accepting client-selected consistency modes.
5. Keep repositories unreachable from the disabled API dispatcher.

Acceptance:

- no string-built SQL, `SELECT *`, authority from client rows, or unchecked write result exists;
- failure at every batch position rolls back all domain, idempotency, and audit changes;
- production API remains `503 COLLABORATION_UNAVAILABLE` with zero D1 calls;
- evidence: `CF-EV-P2-UT-001`, `CF-EV-P2-INT-003`, `CF-EV-P2-SEC-004`.

Execution result (2026-07-16): **PASS**. Typed bounded reads, exact checked writes, guarded atomic batch topology, server-owned D1 session/bookmark handling, four-position rollback injection, and disabled-API isolation passed locally. No remote D1 resource or collaboration activation was authorized.

### `CF-P2-005` — Prove idempotency and security mutation recipes

Size: XL | Owner: Senior Developer + Senior QA | Reviewers: Security, Technical Lead

Tasks:

1. Implement repository-level recipes for workspace create, invitation replace/accept, role/member change, envelope provision, document mutation, and rotation commit.
2. Implement request-fingerprint/idempotency winner, loser re-read, mismatch, expiry, and live-authority recheck behavior.
3. Race last-Owner, invitation acceptance, document revision CAS, duplicate mutation ID, envelope uniqueness, and key-version commit.
4. Inject failure before/after every statement and assert complete side-effect snapshots.
5. Expose no new HTTP business route.

Acceptance:

- exactly one race winner and one deterministic result exist where the contract permits success;
- stale authority/revision/fingerprint and duplicate-mismatch cases fail closed;
- no partial membership, envelope, revision, mutation, key-version, or audit state survives failure;
- evidence: `CF-EV-P2-INT-004`, `CF-EV-P2-INT-005`, `CF-EV-P2-SEC-005`.

Execution result (2026-07-16): **PASS**. Gate `P2-G2A` approved a forward-only pre-membership transition-guard correction because workspace creation and invitation acceptance cannot rely on a membership-scoped ledger before that membership exists. Migration `0008` adds immutable, authority-checked transition guards without modifying migrations `0001` through `0007`. All seven static recipes, idempotency winner/loser re-read, fingerprint mismatch, expiry, live-authority revocation, and D1 race matrices pass locally. The disabled API remains isolated, collaboration remains off, and no remote D1 resource or binding was authorized.

### `CF-P2-006` — Complete migration, retention, privacy, and scale matrix

Size: L | Owner: Senior QA + Operations | Reviewers: Security, Technical Lead, Privacy

Tasks:

1. Run all migrations against empty, populated, repeated, immediately previous, malformed, interrupted, and restored local databases.
2. Test previous runtime with expanded schema and new runtime with the required path disabled on previous schema.
3. Rehearse deterministic purge boundaries for OAuth transactions, sessions, invitations, mutation results, audit, and holds.
4. Seed the approved 10,000-document/50-revision workload and measure migration/query-plan/runtime budgets.
5. Scan schema, rows, fixtures, exports, errors, and logs for plaintext/token/key/identity privacy canaries.

Acceptance:

- compatibility and recovery matrices contain zero P0/P1 skip, quarantine, retry masking, or accepted flakiness;
- purge is bounded, idempotent, server-time based, and hold-aware;
- no protected canary occurs outside its encrypted/test-only envelope;
- performance thresholds are recorded before remote provisioning and any regression has an owner/deadline;
- evidence: `CF-EV-P2-INT-006`, `CF-EV-P2-PERF-002`, `CF-EV-P2-SEC-006`.

Gate P2-G3: local evidence review and explicit Product/Operations authorization are required before any remote D1 creation.

### `CF-P2-007` — Provision and migrate isolated preview D1

Size: M | Owner: Operations | Reviewers: Security, Technical Lead, Senior QA

Tasks:

1. Recheck current D1 configuration/migration commands and account plan capabilities with the pinned Wrangler version.
2. Create only `docvault-collab-preview`; record its identifier in the exact allow-listed configuration path without exposing account/token data.
3. Add preview-only `COLLAB_DB`; assert production binding inventory remains empty and collaboration remains disabled everywhere.
4. Record migration list, apply `0001` through `0008`, run sanitized integrity/query-plan/canary checks, and repeat list/apply.
5. Deploy a disabled preview and prove zero business persistence from API/browser flows.

Acceptance:

- preview and production configuration cannot share/cross bindings; production contains no D1 resource;
- only synthetic fixture data exists and is attributable to the approved evidence run;
- remote migration apply is manual/auditable and never runs in build/request startup;
- failed preflight/apply keeps the feature off and blocks subsequent stories;
- evidence: `CF-EV-P2-OPS-001`, `CF-EV-P2-INT-007`, `CF-EV-P2-SEC-007`.

Gate P2-G4: Operations and Security approve remote preview state before recovery rehearsal.

### `CF-P2-008` — Rehearse recovery, compatible rollback, and disabled deployment

Size: L | Owner: Operations + Senior QA | Reviewers: Security, Technical Lead, Product

Tasks:

1. Confirm preview D1 uses the production storage backend and record a current Time Travel bookmark without restoring shared preview.
2. Create one disposable recovery database, migrate/seed it, record a bookmark, mutate it, perform an authorized in-place Time Travel restore, and verify invariants.
3. Rehearse sanitized export/import into the disposable environment where needed; record recovery gap, duration, abort, undo-bookmark, and cleanup evidence.
4. Prove current and immediately preceding disabled runtimes are compatible with the expanded schema; rehearse feature disablement and code rollback without schema downgrade.
5. Delete the disposable recovery database and prove no orphan binding/resource remains.

Acceptance:

- restore preserves ownership, membership, key/envelope references, document/revision continuity, idempotency uniqueness, audit ordering, and ciphertext bytes;
- no Time Travel restore targets shared preview or production;
- feature disablement precedes rollback; no down migration or destructive cleanup is used;
- Personal Vault, guest mode, GitHub Pages, and Cloudflare disabled API remain healthy;
- evidence: `CF-EV-P2-OPS-002`, `CF-EV-P2-OPS-003`, `CF-EV-P2-E2E-001`, `CF-EV-P2-SEC-008`.

Gate P2-G5: recovery and rollback evidence must pass before Phase 2 exit assembly.

### `CF-P2-009` — Assemble Gate P2 evidence and Phase 3 handoff

Size: S | Owner: Senior QA + Product Owner | Reviewers: Security, Operations, Privacy, Technical Lead, UX

Tasks:

1. Produce a machine-checked P2 story/evidence manifest, schema checksum inventory, config diff, dependency/deployment inventory, defect/risk review, and known limitations.
2. Run clean install, full existing regression, Workers/D1 matrices, artifact/browser/security/performance, preview isolation, rollback, and both-origin smoke.
3. Verify zero P0/P1 skip/quarantine/flakiness/canary/side effect and no unowned/expired Critical/High risk.
4. Publish the Phase 2 exit report with explicit Phase 3 implementation and collaboration activation decisions.

Acceptance:

- every P2 story/evidence/reviewer/requirement/risk is linked and PASS;
- preview contains only approved synthetic data; recovery database is deleted; production has no D1 binding/data;
- no open P0/P1 defect or incompatible schema/runtime pair exists;
- Phase 3 identity/session implementation may be `GO`; collaboration activation remains `NO-GO`;
- evidence: `CF-EV-P2-OPS-004` and Phase 2 exit report.

## 7. Dependency and approval flow

```text
P2-G0 sprint approval
  -> P2-001 contract/governance
  -> P2-G1 schema freeze
  -> P2-002 migrations
  -> P2-003 constraints/query plans
  -> P2-G2 local schema readiness
  -> P2-004 persistence primitives
  -> P2-005 atomic/idempotency recipes
  -> P2-006 compatibility/retention/scale
  -> P2-G3 explicit preview-resource approval
  -> P2-007 preview D1
  -> P2-G4 preview state approval
  -> P2-008 recovery/rollback
  -> P2-G5 recovery approval
  -> P2-009 exit evidence
  -> Gate P2
```

No story may skip its upstream gate. P2-002 and P2-003 may share review iterations, but P2-004 cannot become Ready until G2. Remote stories cannot begin early.

## 8. Fifteen-day execution plan

| Day | Primary outcome | Required review/evidence |
|---:|---|---|
| 1 | P2-001 inventory, migration governance, risk/test mapping | Gate P2-G1 |
| 2 | Migration policy, manifest/hash checker, schema metadata | STA/SEC evidence |
| 3 | Identity/session and workspace/membership/invitation migrations | Schema review |
| 4 | Device/key/envelope and document/revision/idempotency migrations | Crypto/API alignment |
| 5 | Audit/retention migrations, indexes, immutable-history guards | Gate P2-G2 approved for CF-P2-004 |
| 6 | Full constraint and cross-workspace negative matrix | Security review |
| 7 | Query plans, keyset pagination, typed repository boundary | Performance + code review |
| 8 | Guarded atomic batch and checked-write primitives | Fault evidence |
| 9 | Idempotency/replay and security mutation recipes | Race evidence |
| 10 | Every-statement failure injection and side-effect snapshots | P0/P1 matrix |
| 11 | Empty/populated/repeated/prior/malformed migration compatibility | Migration evidence |
| 12 | Retention, privacy canary, 10k×50 scale tests | Gate P2-G3 |
| 13 | Approved preview D1 provisioning/migration/isolation | Gate P2-G4 |
| 14 | Disposable Time Travel recovery and rollback rehearsal | Gate P2-G5 |
| 15 | Clean full gate, evidence manifest, exit report, Phase 3 recommendation | Gate P2 |

## 9. Release-blocking test matrix

| Family | Minimum proof | Failure impact |
|---|---|---|
| Migration history | sequence/hash/manifest/applied-name match; edit/gap/unknown negative cases | P1 NO-GO |
| Schema exactness | tables, columns, types, checks, FKs, unique/partial indexes, deletion behavior | P1 NO-GO |
| Tenant isolation | every resource lookup/mutation with foreign workspace/user/device IDs | P1 NO-GO |
| Atomicity | failure injected at every statement in every required recipe | P1 NO-GO |
| Idempotency/concurrency | simultaneous first request, replay, mismatch, stale authority/revision | P1 NO-GO |
| Compatibility | old code/new schema and new code/old schema with required paths disabled | P0/P1 NO-GO |
| Retention | deterministic expiry, bounded purge, legal/incident hold exclusion | P1 NO-GO |
| Privacy | schema/rows/log/error/export/fixture canaries and prohibited-field scan | P1 NO-GO |
| Performance | representative 10k documents × 50 revisions; query plans and migration duration | P2 unless integrity/availability impact becomes P1 |
| Environment | local/preview/production binding and synthetic-data isolation | P1 NO-GO |
| Recovery | bookmark, restore, integrity, undo evidence, cleanup, compatible runtime rollback | P0/P1 NO-GO |
| Regression | Phase 1 exit gate, Personal Vault, guest, fallback, artifact, E2E, smoke | Severity by impact; P0/P1 blocks |

Required P0/P1 evidence permits zero skip, quarantine, disabled test, accepted flakiness, or retry-only pass.

## 10. CI and deployment boundaries

- Local/unit/integration migration tests run in disposable D1 state on every release check.
- CI may validate migration artifacts and apply them only to disposable local D1; CI must not possess a production D1 migration path in Phase 2.
- Pages Git builds never run `wrangler d1 migrations apply`, `d1 execute --remote`, Time Travel restore, or resource create/delete.
- Preview remote operations are explicit scripts with fail-closed target validation, dry-run/list preflight where supported, and sanitized evidence.
- Production `COLLABORATION_ENABLED=false`, API `503`, route boundary `/api/v1/*`, Service Worker bypass, and GitHub Pages 404 remain release-blocking.
- `_site` excludes migrations, schema manifests, D1 state, config, fixtures, exports, logs, evidence, and server source.

## 11. Cross-functional ownership

| Concern | Accountable | Required approver |
|---|---|---|
| Product scope and activation boundary | Product Owner | Product Owner |
| Schema, repositories, compatibility | Technical Lead | Technical Lead |
| Tenant isolation, prohibited data, atomic security invariants | Security Reviewer | Security Reviewer |
| Migration apply, preview resource, Time Travel, cleanup | Operations | Operations + Security |
| Test matrix, defect severity, evidence, exit decision | Senior QA | Senior QA |
| Metadata minimization and canary treatment | Privacy Reviewer | Privacy Reviewer |
| No premature collaboration UI or misleading recovery claim | UX Lead | UX Lead at Gate P2 |

Senior Developer implements; no implementer self-approves a Critical/High control without the named reviewer.

## 12. Principal risks and controls

| Risk | Phase 2 control | Abort trigger |
|---|---|---|
| R03 cross-workspace access | composite scoping, prepared repository policy, negative matrix | any foreign-tenant success or existence leak |
| R05-R07 key/envelope schema weakness | exact algorithm/length/fingerprint checks; no private/plaintext key columns | invalid/downgraded envelope accepted or plaintext canary |
| R13 lost update/idempotency | guarded batch, unique mutation ledger, CAS/race tests | two winners, silent overwrite, missing/duplicate audit |
| R16 privacy/log leakage | allow-listed evidence, no parameter/body logging, canary scans | any token/key/plaintext/SQL parameter occurrence |
| R17 environment crossover | preview-only exact binding; production absence; synthetic markers | shared ID, production read/write, preview marker visible elsewhere |
| R18 migration/recovery corruption | immutable expand migrations, compatibility matrix, Time Travel rehearsal | checksum drift, integrity mismatch, unverified restore |
| R19 supply chain/config drift | pinned toolchain/actions, migration hashes, protected artifact | unexpected dependency/action/artifact/resource |
| R21 resource exhaustion | bounded queries/batches/purges, keyset indexes, scale test | unbounded scan/work or threshold breach with P1 blast radius |
| R22 Personal/collaboration crossover | no UI/API dispatch, no Personal import, zero D1 call from disabled flows | any Personal/guest data or request reaches D1 |

## 13. Definition of Ready

A story is Ready only when:

- upstream gate is PASS;
- exact controlling contract sections, owner, reviewers, risks, and evidence IDs are named;
- positive, negative, fault, race, privacy, and cleanup cases are identified where applicable;
- migration/runtime compatibility and rollback behavior are explicit;
- no required external resource/action lacks separate authorization.

## 14. Definition of Done

A story is Done only when:

- implementation and negative tests pass locally from a clean locked install;
- full Phase 1 regression and current P2 gates pass with zero P0/P1 exception;
- migration/schema/config artifacts pass secret/privacy/resource scans and `_site` exclusion;
- Senior QA records results and named reviewers approve their controls;
- commit is pushed only after QA pass; GitHub and Cloudflare builds succeed;
- production remains disabled and unchanged unless the story explicitly authorizes a reviewed preview-only change;
- evidence and decision log are updated in the same delivery chain.

## 15. Gate P2-G0 approval request

Approval wording:

> Approved sprint `CF-P2-S01` — begin `CF-P2-001` only. No remote D1 creation, binding, migration, production data, or collaboration activation is authorized. Remote preview provisioning requires Gate P2-G3 approval.

Official platform references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch), [D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/), and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
