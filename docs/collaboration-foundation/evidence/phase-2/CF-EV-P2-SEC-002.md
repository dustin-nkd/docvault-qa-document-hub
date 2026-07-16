# CF-EV-P2-SEC-002 — Migration drift, privacy, and history-denial evidence

Status: PASS

Date: 2026-07-16

Story: `CF-P2-002`

Owner: Security Reviewer

Reviewer: Senior QA

## Negative evidence

Automated cases reject edited SQL, missing/reordered/duplicate migration entries, changed table ownership, destructive SQL, remote D1 binding, enabled production collaboration, unknown/reordered/duplicate/gapped/incomplete applied history, and changed applied filenames.

Local D1 cases reject wrong SQLite types, missing FK parents, duplicate pending invitation targets, a second current workspace key version, document revision updates, and audit deletion.

## Privacy and environment inspection

- SQL contains no fixtures, real provider/resource identifiers, credentials, tokens, OAuth codes, private keys, plaintext DEKs, document title/body fields, or free-form audit content.
- Manifest/evidence contains hashes, aggregate counts, contract IDs, and synthetic-only classifications; no SQL parameter values or record bodies are retained.
- `wrangler.jsonc` still has no `d1_databases`, `database_id`, `preview_database_id`, `migrations_dir`, or remote binding.
- The build artifact policy continues to reject `migrations/`, server code, tests, and evidence from `_site`.

No remote D1 resource was created, queried, migrated, restored, deleted, or bound. Collaboration remains disabled in local, preview, and production configuration.

Traceability: `T03`, `T05`–`T12`, `T15`–`T17`, `T19`–`T20`, `T23`; `R03`, `R05`–`R07`, `R13`, `R16`–`R19`, `R21`, `R22`.
