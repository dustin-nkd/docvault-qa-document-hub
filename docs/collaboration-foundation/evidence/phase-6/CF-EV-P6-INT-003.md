# CF-EV-P6-INT-003 Offline outbox replay integration evidence

Status: PASS

Story: `CF-P6-006`

Five Workers/D1 tests drive the real outbox module against a real migrated schema-12 database through the real `CF-P6-004` mutation service. Only the outbox store is substituted for memory; the state machine, the retry policy, and the mutation path are production code.

**Sprint gate G6 (an offline mutation is resent correctly when online).** A mutation is queued, the first claim fails at the network so nothing reaches D1 — verified by asserting zero documents, revisions, and audit events — and after a simulated reconnect the retry carries the identical client mutation id and applies once. The final state is exactly one document, one revision, one audit event, and an empty queue. This closes the last of the six sprint gate scenarios.

The harder half of G6 is the lost response. A mutation is submitted and genuinely applied at D1, but the client sees a network failure and retries. The retry is recognised as a replay, returns the original revision rather than creating a second one, and the database still holds exactly one document, one revision, and one audit event. This is the case a naive outbox gets wrong and it is proven against real storage rather than a mock.

An entry whose authority changed is quarantined and never reaches D1: membership is removed while the entry sits queued, the outbox is quarantined with reason `membership-lost`, a subsequent claim yields nothing, and the database remains empty.

A genuine server denial is terminal rather than a retry loop. An update against a base revision on a document that does not exist is refused by the mutation service, the outbox records the returned code, the entry becomes terminal, and no further claim occurs.

Per-document ordering is verified across a real create-then-update sequence: the dependent update cannot be claimed until the create has applied, and the resulting revisions are 1 then 2 with two audit events.

A defect was found and fixed by this suite. `RESOURCE_NOT_FOUND` and status 404 were initially absent from the non-retryable set, so a mutation against a deleted or invisible document would have retried until its attempt ceiling. On a mutation target a 404 never resolves by trying again, so both were added to the non-retryable set alongside the ADR-006 list.
