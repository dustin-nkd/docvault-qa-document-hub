# CF-EV-P6-QA-002 Document mutation quality reconciliation

Status: PASS

Story: `CF-P6-004`

The Workers/D1 suite grew from 202 to 218 tests across 30 files with zero failures, zero skips, and no quarantined or conditionally omitted case. Both TypeScript projects typecheck clean. The authoritative `npm run check` gate passes.

Three of the six sprint gate scenarios are now proven at the persistence layer: **G3** (a Viewer cannot write), **G4** (two writers on one base revision yield one advance and one conflict), and **G5** (a retry storm creates no duplicate revision). Each is asserted against real D1 row counts, not response codes.

Two pre-existing constraints shaped the test design rather than being worked around. The tenant-scope triggers abort any insert whose actor lacks a membership row, so seeding orders memberships before key versions, documents, revisions, ledger rows, and audit events. The audit, revision, and ledger tables are append-only by trigger, so each test provisions a fresh workspace and scopes its counters to it instead of deleting history the product forbids deleting — the test suite obeys the same immutability rule the product enforces.

One existing Phase 2 assertion required a deliberate adjustment. `CF-P2-005` asserted exact equality on the full recipe key set, which coupled Phase 2's guarantee to the total number of recipes in the module. It now asserts that all seven Phase 2 contracts are still published, while the static-SQL safety loop — no template interpolation, no wildcard select, non-empty domain — continues to run over every contract including the two added by this story. The change preserves Phase 2's guarantee and widens the safety coverage from seven contracts to nine; it does not relax any security property.

One test expectation written during this story was wrong and the implementation was right: a non-current key version was expected to map to `RESOURCE_NOT_FOUND`, but the service correctly returned the contract-specified `KEY_VERSION_MISMATCH`. The test was corrected to the frozen taxonomy rather than the implementation being changed to match a mistaken expectation.

No P0/P1 skip, quarantine, accepted flake, or open defect is introduced. No migration, route, remote write, or activation was created, and Personal Vault storage remains at a zero-line diff.
