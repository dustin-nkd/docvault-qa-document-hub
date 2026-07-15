# ADR-012: D1 Migrations, Deployment Compatibility, and Rollback

## Status

Proposed for Gate G2 approval.

## Date

2026-07-15

## Owners

Technical Lead, Operations, Senior QA

## Context

Cloudflare Pages will deploy collaboration-capable static assets and same-origin Functions while D1 becomes the collaboration system of record. Preview and production must be isolated. A code deployment can be rolled back quickly, but an incompatible or destructive schema change cannot be made safe by reverting code alone. Automatic Git-connected deployments make ordering, compatibility, feature flags, backups, and rehearsed recovery explicit release requirements.

Foundation must support interrupted migrations, repeated commands, old/new code overlap, preview validation, feature disablement, and data restoration without affecting Personal Vault or GitHub Pages fallback.

## Decision

1. D1 schema changes are ordered, immutable, version-controlled migration files with unique sequence numbers and recorded checksums. An applied migration is never edited or renumbered; correction uses a new migration.
2. Every change follows expand/contract. Expansion is backward-compatible with the currently deployed runtime. New behavior remains feature-flagged until schema and compatibility checks pass. Destructive contraction occurs only in a later release after the rollback window and old runtime are retired.
3. Preview and production use separate D1 databases, bindings, secrets, OAuth applications, origins, migration ledgers, backups, and synthetic users. Preview data is never promoted into production.
4. Migrations run through a dedicated, auditable deployment step, never from a browser request, Pages Function startup/request path, or uncontrolled build side effect.
5. Production rollout requires a pre-change recovery point, migration preflight, schema compatibility verification, post-migration integrity checks, feature-flagged canary, and a documented rollback decision.
6. Runtime code supports the approved schema compatibility window (at minimum the current and immediately preceding deploy contract). Code rollback must remain safe throughout that window.
7. Schema rollback is forward-fix by default. Restore from the pre-change recovery point is used only when data integrity cannot be safely reconciled and the incident owner accepts the recovery-point objective and replay plan.

## Detailed contract

### Migration artifact and ledger

Each migration has a zero-padded sequence, descriptive name, forward statements, compatibility notes, validation queries, expected lock/runtime characteristics, data-backfill plan, rollback classification, and owner. The production ledger records sequence, checksum, applied server time, environment, deployment/release identifier, and result.

The runner fails closed on a missing sequence, checksum mismatch, unknown applied migration, wrong environment binding, dirty/incomplete state, or failed precondition. Re-running an already applied matching migration is a no-op. Application/database credentials follow least privilege; normal runtime bindings cannot administer migrations unless the approved platform model requires it and equivalent controls are documented.

### Expand/contract sequence

1. **Design:** classify the change as additive, backfill, constraint/index, rename/retype, or destructive; define old/new code behavior and measurable invariants.
2. **Preview expansion:** apply to an empty preview database and a representative populated preview fixture; repeat to verify idempotent runner behavior.
3. **Compatibility rehearsal:** run previous runtime against expanded schema and new runtime with the feature disabled; test interrupted migration and supported schema versions.
4. **Recovery point:** create and verify the production recovery point/export supported by the D1 operating plan; record timestamp, integrity metadata, access, and expiry.
5. **Production expansion:** verify binding/environment, current ledger, backup, capacity, and feature flag; apply the immutable expansion through the controlled step.
6. **Integrity check:** validate schema version, constraints, row counts/invariants, tenant scoping, owner/member relationships, revision continuity, audit ordering, and sensitive-data rules.
7. **Code rollout:** deploy dual-compatible runtime with new behavior disabled, then run non-destructive smoke tests.
8. **Canary enablement:** enable for approved synthetic/canary scope, observe error, latency, integrity, and security metrics, then expand gradually.
9. **Contract release:** only after the documented rollback window, successful backup/restore drill, removal of old code dependency, and explicit approval, apply a later contract migration. Contract and expansion are never combined in one production step.

Cloudflare Git integration may build/deploy a compatible artifact automatically, but it does not authorize schema mutation or feature enablement. Branch protection and the feature flag keep runtime paths that require an unapplied expansion unreachable. A release is not complete until the migration and deployment evidence refer to the same approved release identifier.

### Backfills and constraints

- Backfills are restartable, bounded, observable, and separate from request latency. Progress uses stable opaque cursors/checkpoints.
- New required fields use nullable/default-compatible expansion first, backfill and validate second, and enforce constraints only in a later contract migration.
- Renames use dual-read/dual-write or an approved compatibility adapter until all supported runtime versions use the new field.
- Index creation and large updates are tested at representative scale and scheduled within an approved change window.
- Tenant, ownership, revision, idempotency, and audit invariants have preflight and postflight queries that expose counts, not protected bodies.

### Failure and rollback decision

- Before feature enablement, a migration or smoke failure keeps the feature off. Prefer a forward corrective migration while the existing runtime remains compatible.
- After feature enablement, disable Collaboration first without deleting D1 data; Personal Vault and GitHub Pages fallback remain independent.
- Roll back code only to a version proven compatible with the current schema. Never run an old runtime merely because its artifact exists.
- Use point-in-time recovery/export restore when corruption or irreversible transformation cannot be reconciled safely. Restore occurs into an isolated database first, passes integrity/security checks, then follows the approved cutover procedure.
- Define and communicate the recovery-point gap. Mutations after the chosen recovery point are reconciled from trusted audit/idempotency evidence when possible; they are never silently invented or discarded.
- A destructive contract migration has no same-release automatic down migration. Its approval includes a tested restore plan and explicit data-loss assessment.

### Backup and restore drill

Before the first production collaboration release and before every destructive contract class, Operations must demonstrate a timed drill using representative encrypted records. The drill restores to an isolated binding and verifies:

- workspaces have exactly one or more valid Owners under policy;
- membership, invitation, device, envelope, and key-version references are valid;
- current-document pointers and append-only revisions/tombstones are continuous;
- idempotency uniqueness and audit ordering/correlation remain intact;
- ciphertext and envelope bytes are unchanged and no protected plaintext appears;
- preview/production identifiers, secrets, origins, and sessions are not crossed;
- the restored environment can run the approved compatibility and smoke suites.

The runbook records recovery-point objective, recovery-time objective measurement, responsible operator, evidence links, cutover/abort criteria, and cleanup of the isolated restore.

## Alternatives

- **Run migrations from application startup or first request:** rejected because concurrent or partial execution can block requests and makes ordering unauditable.
- **Edit migration files after application:** rejected because environments can no longer prove the same schema history.
- **Deploy code and destructive schema together:** rejected because neither old nor rolled-back code is guaranteed to work.
- **Use preview D1 as a staging copy promoted to production:** rejected because it violates environment and identity isolation.
- **Automatic down migrations for every change:** rejected because data transforms are often not reversible and can create false safety.
- **Code rollback without schema compatibility:** rejected because it can deepen corruption.
- **Backup without restore rehearsal:** rejected because an unverified recovery artifact is not release evidence.

## Consequences and residual risks

- Delivery takes at least two releases for destructive changes and requires compatibility code temporarily.
- Feature flags and migration ledgers become critical operational controls and require monitoring and access review.
- Backup/restore and representative-scale rehearsal add release time but reduce irreversible production risk.
- Forward-fix may keep an incident open longer than code rollback, while restore may lose or require reconciliation of post-recovery-point mutations.
- D1/platform behavior and limits can change; each implementation phase must verify current official capabilities without weakening this contract.
- Personal Vault remains outside D1 and is not changed or restored through collaboration database procedures.

## Security and privacy

- Production and preview bindings, credentials, origins, session namespaces, backups, and operators are isolated and verified before every migration.
- Migration, validation, backup, and restore logs exclude document ciphertext bodies, key envelopes, tokens, secrets, SQL parameter values, and protected plaintext.
- Recovery artifacts are restricted, encrypted under platform/operational controls, access-audited, retention-limited, and destroyed after their approved window.
- Validation queries are parameterized and workspace invariants are checked without exporting protected bodies.
- Test bypasses, synthetic identities, and preview secrets are rejected in production.
- Collaboration feature disablement is non-destructive and cannot block Personal Vault or guest fallback.

## Operations

- Maintain separate preview and production migration ledgers and dashboards for schema version, migration result/duration, flag state, integrity checks, and restore-drill age.
- Alert on checksum drift, unknown schema version, incomplete migration, wrong binding/environment, integrity mismatch, restore-drill expiry, or runtime/schema incompatibility.
- Require named release owner, migration operator, incident owner, and go/no-go authority for production changes.
- Retain migration evidence and sanitized integrity results with the release record.
- Test emergency feature disablement independently from deployment rollback.
- Review recovery artifacts and isolated restore resources for expiry and confirmed cleanup.

## Test implications

- Run every migration against empty, representative populated, previous-version, already-migrated, and deliberately malformed databases.
- Inject failure before, during, and after each migration/backfill checkpoint; rerun and verify no duplicate or partial domain state.
- Execute old-runtime/new-schema and new-runtime/old-schema tests according to the declared compatibility matrix; required new paths must stay disabled on old schema.
- Verify preview/prod isolation with cross-environment session, binding, origin, secret, and synthetic-user negative tests.
- Verify invariants for Owners, membership scope, invitations, devices/envelopes, revision continuity, tombstones, idempotency uniqueness, and audit ordering after migration and restore.
- Rehearse feature disablement, compatible code rollback, forward-fix, isolated restore, cutover abort, and post-recovery-point reconciliation.
- Measure migration/backfill duration and request latency at representative scale; confirm bounded jobs do not exhaust D1/Functions resources.
- Scan source, build output, migration logs, backups, and evidence for secret/protected-content canaries.
- Treat skipped P0/P1 compatibility, integrity, or restore evidence as Gate `NO-GO`.

## Requirement and threat links

- Requirements: `CF-OPS-002`, `CF-OPS-003`, `CF-OPS-004`, `CF-WS-001`, `CF-WS-004`, `CF-DOC-003`, `CF-DOC-006`, `CF-AUD-001`.
- Journeys: J2 workspace creation, J4 document mutation, J7 access change, and J9 static fallback continuity.
- Threats: `T15`, `T19`, `T20`, `T23`.
- Abuse cases: `AB-16`, `AB-18`, `AB-19`.
- Closes `GAP-11` for migration ordering, recovery, and rollback mechanics; final workspace deletion/revision-retention values remain separately gated.

## Gate G2 acceptance

- [x] Technical Lead approves immutable migration format, compatibility window, expand/contract sequence, and schema/runtime matrix.
- [x] Operations approves environment isolation, recovery-point creation, monitoring, rollback decision tree, and timed restore drill as implementable controls.
- [x] Security Reviewer approves binding/secret isolation, recovery-artifact controls, logging exclusions, and production denial of test bypasses.
- [x] Senior QA confirms empty/populated/repeated/faulted migration, compatibility, integrity, performance, isolation, rollback, and restore cases are measurable and release-blocking where P1 applies.
- [ ] Product Owner accepts feature-flagged rollout, possible recovery-point gap, and the extra release required before destructive contraction.
- [x] No runtime implementation begins until Gate G2 approves this ADR and the deployment/schema runbook reflects it.
