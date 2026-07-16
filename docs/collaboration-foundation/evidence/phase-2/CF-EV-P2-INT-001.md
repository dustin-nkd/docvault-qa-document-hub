# CF-EV-P2-INT-001 — Disposable real local D1 migration evidence

Status: PASS

Date: 2026-07-16

Story: `CF-P2-002`

Owner: Senior QA

Reviewer: Technical Lead

## Environment

- Wrangler `4.111.0`, Vitest `4.1.10`, Workers pool `0.18.5`.
- Miniflare/workerd disposable `COLLAB_DB`; `d1Persist: false`; `remoteBindings: false`.
- Outbound Cloudflare access denied by the Phase 1 harness.
- Production migration SQL loaded through official `readD1Migrations()` and applied through `applyD1Migrations()` into a story-specific ledger.

## Result

Command: `npm run cf:test`.

Result: five Workers test files and 15 tests pass. The migration suite proves six ordered applies, exact repeated no-op, version/digest compatibility metadata, 15 `STRICT` tables, empty foreign-key check, strict type rejection, missing-parent denial, partial uniqueness, one current key version, and revision/audit append-only behavior.

All IDs, names, public-key JSON, digests, envelopes, and document records used by the test are deterministic synthetic fixtures in a disposable local database. No test row survives the run.

No remote D1 resource was created, queried, migrated, restored, deleted, or bound. No API route, production database, preview database, user/workspace data, browser storage, or deployment configuration changed.
