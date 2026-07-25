# CF-EV-P6-QA-003 Conflict and copy quality reconciliation

Status: PASS

Story: `CF-P6-007`

Eighteen Node tests cover the resolution state machine and copy eligibility, six Workers/D1 tests prove the resulting revisions against a real database, and one browser suite runs the module in three engines. Zero skips, zero quarantined cases, and the authoritative `npm run check` gate passes.

The revision outcomes required by the sprint are proven against real storage rather than asserted. A genuine `409` from the mutation service opens a conflict whose reported current revision matches the database. `reapply-to-latest` rebases onto the current revision and advances the document by exactly one. `save-as-separate-copy` creates a new document at revision 1 while the conflicted document stays where it was. A confirmed discard submits nothing and leaves the revision untouched.

Copy outcomes are likewise proven: the destination lands at revision 1, the personal source has no workspace row at all, and repeating a completed copy replays to the original result with the workspace still holding exactly one document.

CI surfaced a second instance of a known flake class during this story. `CF-P5-007`'s Preview read budget failed at 303 ms against its 300 ms ceiling on the CI runner — the same starvation pattern that was fixed for `CF-P4-007` during the Phase 5 exit, where a latency measurement competes for CPU with the PBKDF2-600k device-key suites and the p95 index selects the second-worst of twenty samples. The fix was extended rather than reinvented: the isolated second pass in `cf:test` now covers both latency-bearing files. Both budgets and both tests are unchanged; only the contention was removed. The suite still runs the same 239 Workers tests across the two passes, so no coverage was traded for stability. It is recorded as fixed, not accepted as a flake.

No P0/P1 skip, quarantine, accepted flake, or open defect is introduced. No route, migration, or remote write was created, and Personal Vault storage remains at a zero-line diff.
