# CF-EV-P2-PERF-001 Query-plan and keyset evidence

Status: PASS

Story: `CF-P2-003`

Gate: `P2-G2` `REVIEW_REQUIRED`

The disposable local D1 workload contains 10,000 documents and 50 revisions for a hot document. All 13 approved repository read contracts are checked with `EXPLAIN QUERY PLAN`; each must use its intended primary/unique/named index and no plan may contain a full table scan or temporary sort.

All mutable collections use bounded keyset pagination with stable unique tie-breakers. Source policy rejects `OFFSET`, `SELECT *`, unbounded reads, missing workspace predicates, runtime SQL interpolation, or missing index declarations.

No remote D1 resource was used; this is local-only performance evidence.
