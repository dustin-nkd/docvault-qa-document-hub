# CF-EV-P2-INT-006 Migration and retention integrity matrix

Status: PASS

Story: `CF-P2-006` | Gate: `P2-G2B` APPROVED

Disposable local-only Workers D1 applies all nine migrations to empty and populated state, repeats exact application, rejects malformed input, rolls back an interrupted migration, preserves a restored synthetic snapshot, and proves adjacent runtime compatibility. Migration `0009` is forward-only; migrations `0001` through `0008` remain immutable.

Bounded server-time purge covers OAuth transactions, sessions, invitations, mutation results, transition guards, and audit events. Before/at/after cutoffs, retries, a two-row limit, active and expired holds, direct-delete denial, interrupted-batch rollback, replacement/reference safety, and permanent document-revision retention pass. No remote D1 resource, binding, migration, or data is used.
