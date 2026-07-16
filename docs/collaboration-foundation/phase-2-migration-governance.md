# CF-P2-001 migration governance

Status: PASS; awaiting Gate P2-G1 approval

Date: 2026-07-16

Owners: Technical Lead and Operations

Reviewers: Security Reviewer and Senior QA

## 1. Canonical artifact layout

Executable Phase 2 migrations will live only under `migrations/collaboration/`. `CF-P2-001` deliberately does not create that directory or any SQL file.

The future committed layout is:

```text
migrations/collaboration/
  0001_<sha12>_identity.sql
  0002_<sha12>_workspaces.sql
  0003_<sha12>_devices_keys.sql
  0004_<sha12>_documents.sql
  0005_<sha12>_audit_retention.sql
  0006_<sha12>_invariants_indexes.sql
migrations/manifest.json
```

`<sha12>` is the first 12 lowercase hexadecimal characters of SHA-256 over the finalized SQL bytes normalized to UTF-8 without BOM and LF line endings. `manifest.json` stores the full SHA-256 and is the review source of truth. The filename hash is a human-visible drift signal, not a replacement for full verification.

## 2. Initial expand sequence

| Sequence | Purpose | Owned tables/change class |
|---:|---|---|
| 0001 | Identity and logical schema | `schema_metadata`, `users`, `oauth_transactions`, `sessions` |
| 0002 | Workspace authority | `workspaces`, `memberships`, `invitations` |
| 0003 | Devices and key distribution | `devices`, `workspace_key_versions`, `workspace_key_envelopes` |
| 0004 | Encrypted documents and idempotency | `documents`, `document_revisions`, `mutation_results` |
| 0005 | Audit and retention | `audit_events`, `retention_holds` |
| 0006 | Cross-table invariant/index support | Additive indexes, partial uniqueness, and approved immutable-history guards only |

All six are expansion migrations. Destructive contraction, table/column removal, incompatible rename/retype, plaintext backfill, or production data import is outside the initial sequence.

## 3. Manifest record

Each migration manifest entry must contain:

- sequence, exact filename, slug, full SHA-256, normalized byte count, and previous-entry hash;
- owner, reviewers, creation date, contract version, requirement/threat/risk IDs, and evidence IDs;
- change class and owned tables;
- minimum/maximum compatible logical runtime schema;
- empty/populated/prior-version/repeat/malformed/interrupted validation sets;
- foreign-key, uniqueness, invariant, privacy-canary, query-plan, and row-count validation identifiers;
- expected runtime/lock class, bounded backfill/checkpoint policy, and observability fields;
- rollback class (`forward-fix`, `compatible-code-rollback`, or `isolated-restore-required`);
- statement/privacy classification confirming no secret, real identifier, or protected plaintext.

Wrangler's `d1_migrations` is the platform apply ledger. The repository manifest supplies immutable content identity and review metadata. `schema_metadata` supplies runtime compatibility. None replaces the others.

## 4. Apply and correction policy

- Migrations run through an explicit operator/CI migration step, never a browser request, Pages Function startup/request, Git-connected Pages build, service worker, or static build command.
- Commands identify the immutable database name and explicit environment; remote execution additionally requires the story's approved gate.
- A new environment must have an empty or exactly recognized history. Missing sequence, duplicate sequence, unknown applied name, checksum mismatch, wrong binding, dirty/incomplete state, or unsupported logical schema fails closed.
- Reapplying an exact already-applied sequence is a no-op. An applied file is never edited, renamed, reordered, squashed, or deleted.
- A defect in an applied migration is corrected by the next immutable migration. Same-release destructive down migrations are prohibited.
- Foreign-key enforcement is never disabled. A table-rebuild migration may use `PRAGMA defer_foreign_keys = true` only within the reviewed migration and must finish with `PRAGMA foreign_key_check` plus invariant validation.
- Direct remote `d1 execute` schema mutation is prohibited outside an approved incident procedure and cannot be used to bypass the migration ledger.

## 5. Compatibility and deployment order

Every change follows: design → local empty/populated/repeat/fault evidence → previous-runtime compatibility → preview expansion after P2-G3 → integrity checks → compatible disabled runtime → canary only in a later authorized phase → later contract release.

`minimum_runtime_schema` and `maximum_runtime_schema` express the supported logical window. A runtime that cannot prove compatibility returns the disabled/unavailable response and performs no persistence operation. Code rollback is allowed only to a version proven compatible with the current schema.

Production remains without D1 throughout Phase 2. Preview creation/application is prohibited before Gate P2-G3. Pages Git builds may verify hashes and compile code, but may not create, apply, restore, delete, or bind a D1 database.

## 6. Validation and evidence policy

Before an entry can advance, the automated gate must prove:

1. exact contiguous sequence and immutable hashes;
2. exact table/column ownership from the schema freeze;
3. no prohibited SQL/repository patterns or sensitive canaries;
4. schema, foreign-key, uniqueness, invariant, retention, and query-plan validation;
5. empty, populated, repeated, prior-version, malformed, interrupted, and restored behavior;
6. old-runtime/new-schema and disabled-new-runtime/old-schema compatibility;
7. complete batch rollback and zero unexplained side effects;
8. environment isolation and absence from `_site`/GitHub Pages;
9. sanitized evidence with named owner/reviewer and zero skipped P0/P1 cases.

Evidence logs may include migration IDs, checksums, counts, durations, query-plan classifications, and opaque synthetic identifiers. They must not include SQL parameter values, raw request/response bodies, tokens, secrets, ciphertext/envelope bodies, or protected plaintext.

## 7. Unknown history and recovery

Unknown or drifted history is not auto-repaired. The runner stops, collaboration remains disabled, and Operations captures sanitized ledger/schema fingerprints for incident review. The response is either a reviewed forward correction or an isolated restore/cutover under ADR-012; operators do not mark migrations applied manually.

Time Travel restore is an incident/rehearsal action, not migration rollback. It requires its named gate, traffic containment, recovery-point gap assessment, isolated integrity/privacy checks where available, and explicit cleanup evidence.
## 8. Prohibited pattern registry

The machine freeze rejects these stable policy names:

- `runtime-sql-interpolation`
- `select-star`
- `workspace-query-without-workspace-predicate`
- `unchecked-zero-row-security-write`
- `plaintext-protected-content`
- `raw-token-or-secret-storage`
- `migration-from-request-or-build`
- `edit-or-renumber-applied-migration`
- `same-release-destructive-contract`
- `normal-request-cascade-of-history-or-last-owner`

Later policy code may add detection without renaming or weakening these obligations.
