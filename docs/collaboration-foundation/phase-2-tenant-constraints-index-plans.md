# CF-P2-003 tenant constraints and index plans

Status: PASS; Gate P2-G2 REVIEW_REQUIRED

Date: 2026-07-16

Story: `CF-P2-003`

Owners: Senior Developer and Senior QA

Reviewers: Security Reviewer and Technical Lead

## Delivered boundary

The six Gate P2-G1 migrations remain byte-for-byte immutable. A new forward-only migration, `0007_a19e57b5f793_tenant_scope_indexes.sql`, adds stable keyset indexes and database-level cross-workspace guard triggers. It advances the local logical schema from 6 to 7 without adding columns, backfills, fixtures, remote identifiers, or protected plaintext.

This work is local-only. No remote D1 database or binding exists, collaboration remains disabled, and production D1 is still prohibited through Phase 2.

## Constraint and tenant matrix

| Domain | Positive invariant | Negative proof |
|---|---|---|
| Identity | GitHub subject and UUID identity remain bounded and unique | Invalid provider, subject, UUID, lifecycle, and duplicate identity fail |
| Session | Digest, user FK, lifecycle and expiry ordering are valid | Duplicate token, invalid expiry/type, or revoke mismatch fails |
| Workspace/membership | Workspace parents and membership composite scope exist | Missing parent, foreign actor, invalid state/role/timestamps fail |
| Invitation | 72-hour expiry, pending uniqueness, inviter membership, same-workspace replacement | Foreign replacement, bad expiry, duplicate token/target fail |
| Device | Device/user composite identity, supported suite and fingerprint length | Unsupported suite, bad fingerprint or lifecycle fails |
| Key version/envelope | Version sequence, one current version, membership scope, device/fingerprint match | Gap, downgrade, foreign member/device or substituted fingerprint fails |
| Document/revision | Workspace/key/document composite FKs and contiguous revision fields | Foreign workspace/document/key, invalid base or actor scope fails |
| Idempotency | Actor/device/workspace composite scope and unique mutation key | Foreign actor, duplicate mutation or malformed result fails |
| Audit | Append-only event, actor workspace scope and allow-listed shapes | Foreign actor, invalid event/outcome/JSON or mutation/deletion fails |
| Retention hold | Creator membership, lifecycle and bounded reason | Foreign creator or invalid expiry/release lifecycle fails |

Foreign-workspace and missing resource lookups use the same `workspace_id = ? AND id = ?` query and both return no row. Opaque IDs never authorize access and database errors are not part of the future API response contract.

## Query contract

[`collaboration-query-contract.ts`](../../functions/_lib/collaboration-query-contract.ts) freezes 13 read contracts before repository helpers are allowed to merge. Every contract has explicit columns, prepared placeholders, a bound maximum result, an intended index, and a tenant predicate where applicable. Mutable collections use keyset pagination with a unique stable tie-breaker; `OFFSET`, `SELECT *`, and runtime SQL interpolation are prohibited.

Forward migration 0007 adds the missing tie-breaker indexes for membership, invitation, device, key-version, key-envelope, revision, mutation-retention, and hold traversal. Existing document and audit indexes already provide stable keysets.

## Query-plan evidence

Workers Vitest applies all seven migrations to a disposable local D1 database, creates two isolated tenants, and loads 10,000 documents plus 50 revisions for a hot document. `EXPLAIN QUERY PLAN` is executed for all 13 approved queries. Each plan must name its intended index and must not contain a full `SCAN` or `USE TEMP B-TREE` step.

The source policy independently rejects missing workspace predicates, unbounded reads, offset pagination, missing stable keysets, protected-field terms, missing indexes/triggers, remote bindings, activation, or premature Gate P2-G2 approval.

Current platform behavior was checked against Cloudflare's [D1 index guidance](https://developers.cloudflare.com/d1/best-practices/use-indexes/), [prepared statement API](https://developers.cloudflare.com/d1/worker-api/prepared-statements/), and [local development guidance](https://developers.cloudflare.com/d1/best-practices/local-development/).

## Gate disposition

`CF-P2-003`: **PASS**.

Gate `P2-G2`: **REVIEW_REQUIRED**. Persistence helpers in CF-P2-004 remain blocked until explicit Security, Technical Lead, and Senior QA review/approval.
