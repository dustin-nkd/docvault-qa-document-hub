# CF-EV-P2-PERF-002 Representative scale and runtime budgets

Status: PASS

Story: `CF-P2-006` | Gate: `P2-G2B` APPROVED

The local-only D1 workload contains 10,000 encrypted-document metadata rows and 50 revisions for the hot document. All 13 prepared query contracts name their approved indexes, use no full scan or temporary B-tree, and complete the local query-plan suite within the 2,000 ms release budget. Retention work is bounded to 100 rows per record type per run.

No regression, exception, retry-only pass, or remote D1 measurement is accepted. Any future threshold breach requires an owner and deadline before Gate P2-G3 review.
