# CF-P2-002 immutable Foundation migrations

Status: PASS

Date: 2026-07-16

Story: `CF-P2-002`

Owner: Senior Developer

Reviewers: Technical Lead, Security Reviewer, Senior QA

## 1. Delivered boundary

Six additive, immutable SQL migrations implement the Gate P2-G1 schema freeze under `migrations/collaboration/`. CF-P2-003 subsequently adds forward-only migration 0007 for tenant guards and stable keyset indexes without editing those initial files. Together they create/protect one logical schema-control table and 14 entity tables with strict SQLite typing, checks, foreign keys, unique/partial indexes, explicit non-cascading deletion behavior, and append-only revision/audit triggers.

The implementation remains local-only. `wrangler.jsonc` still contains no D1 binding, resource identifier, or migration directory. No remote database was created, bound, queried, migrated, restored, or deleted. Collaboration remains disabled in every environment.

Current Cloudflare behavior was verified against the official documentation for [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [local D1 development](https://developers.cloudflare.com/d1/best-practices/local-development/), [supported SQL and PRAGMAs](https://developers.cloudflare.com/d1/sql-api/sql-statements/), and [D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

## 2. Migration set

| Sequence | Immutable file | Creates / protects |
|---:|---|---|
| 0001 | `0001_66ef801f76c6_identity.sql` | `schema_metadata`, `users`, `oauth_transactions`, `sessions` |
| 0002 | `0002_15e721876f5c_workspaces.sql` | `workspaces`, `memberships`, `invitations` |
| 0003 | `0003_4e33e72ca138_devices_keys.sql` | `devices`, `workspace_key_versions`, `workspace_key_envelopes` |
| 0004 | `0004_1023ca4a6280_documents.sql` | `documents`, `document_revisions`, `mutation_results` |
| 0005 | `0005_bc3cdc6742da_audit_retention.sql` | `audit_events`, `retention_holds` |
| 0006 | `0006_ab9c79c46bad_invariants_indexes.sql` | Cross-table indexes and append-only triggers |
| 0007 | `0007_a19e57b5f793_tenant_scope_indexes.sql` | Forward-only tenant guards and stable keyset indexes (`CF-P2-003`) |

The 12-character filename component is the prefix of SHA-256 over UTF-8/LF-normalized SQL. [`migrations/manifest.json`](../../migrations/manifest.json) stores the full hash, normalized byte count, previous-entry hash, table ownership, reviewers, compatibility, validation, rollback, privacy, and traceability metadata.

`migration_set_digest` is a stable SHA-256 projection of the frozen identifier profile, tables/columns, migration ownership, and prohibited patterns. Operational Gate state is deliberately excluded so a later approval record cannot mutate schema identity.

## 3. Integrity controls

- All 15 tables are `STRICT`; Boolean-like/state data uses checked integer/text representations.
- IDs, provider subjects, digest sizes, algorithm suites, ciphertext/envelope bounds, expiry ordering, revision continuity, and terminal-state timestamps are checked.
- Domain history uses `ON DELETE RESTRICT`; normal application deletion cannot cascade revisions, audit, keys, or membership history.
- Pending invitation target uniqueness and one-current-key-version are partial unique indexes.
- `document_revisions` and `audit_events` reject update/delete; corrections are new audit rows.
- Every migration runs one `PRAGMA foreign_key_check` and advances `schema_metadata` through version 7.
- The final compatibility record is schema `7`, supported logical window `1..7`, with the frozen migration-set digest.

Last-Owner, authorization, role ceilings, key-version `current+1`, document CAS, and exact audit-with-domain-write behavior remain guarded repository recipes assigned to `CF-P2-003` through `CF-P2-005`; this story does not claim a table constraint can replace live authority checks.

## 4. Fail-closed migration policy

The release gate rejects:

- an edited file, hash or byte-count mismatch, missing/duplicate/reordered sequence, hash-chain drift, or unexpected file;
- unknown, reordered, duplicated, changed-name, gapped, or incomplete applied history;
- table ownership or exact frozen column drift;
- interactive transaction statements, destructive same-release SQL, protected field names, missing FK checks, missing review/traceability, or non-additive rollback classification;
- remote D1 configuration, resource identifiers, or collaboration activation.

An exact matching reapply is a no-op. A defect in an applied migration requires a new forward migration; applied SQL is not edited or renumbered.

## 5. Typed contracts

[`collaboration-schema.ts`](../../functions/_lib/collaboration-schema.ts) defines exact row interfaces for all 15 tables, enum/nullability boundaries, `D1Result` write typing, schema constants, and an explicit compatibility predicate. TypeScript strict mode rejects drift; the contract contains no `any` or `as unknown as` escape.

## 6. Local D1 evidence

Workers Vitest loads the production migration directory into a disposable, local-only `COLLAB_DB` with remote bindings disabled and outbound Cloudflare network access blocked. Tests prove:

- six ledger entries apply in order and exact reapply is a no-op;
- schema metadata reaches version 6 with the expected digest;
- every frozen table exists as `STRICT` and `PRAGMA foreign_key_check` is empty;
- invalid integer types, missing parents, duplicate pending targets, and a second current key version fail;
- revision update and audit deletion fail through append-only triggers;
- no local state persists after the suite.

## 7. Gate disposition

`CF-P2-002`: **PASS**.

Next story remains blocked pending normal squad review/authorization. No remote preview resource is authorized before Gate P2-G3, and production D1 remains prohibited throughout Phase 2.
