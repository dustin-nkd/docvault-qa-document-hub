# CF-EV-P6-QA-003 Conflict and copy quality reconciliation

Status: PASS

Story: `CF-P6-007`

Eighteen Node tests cover the resolution state machine and copy eligibility, six Workers/D1 tests prove the resulting revisions against a real database, and one browser suite runs the module in three engines. Zero skips, zero quarantined cases, and the authoritative `npm run check` gate passes.

The revision outcomes required by the sprint are proven against real storage rather than asserted. A genuine `409` from the mutation service opens a conflict whose reported current revision matches the database. `reapply-to-latest` rebases onto the current revision and advances the document by exactly one. `save-as-separate-copy` creates a new document at revision 1 while the conflicted document stays where it was. A confirmed discard submits nothing and leaves the revision untouched.

Copy outcomes are likewise proven: the destination lands at revision 1, the personal source has no workspace row at all, and repeating a completed copy replays to the original result with the workspace still holding exactly one document.

No P0/P1 skip, quarantine, accepted flake, or open defect is introduced. No route, migration, or remote write was created, and Personal Vault storage remains at a zero-line diff.
