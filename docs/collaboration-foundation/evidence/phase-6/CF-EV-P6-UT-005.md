# CF-EV-P6-UT-005 Offline outbox state machine evidence

Status: PASS

Story: `CF-P6-006`

`js/collaboration/outbox.js` implements the ADR-006 outbox as a state machine over an injectable store: queued, inflight, applied, terminal, expired, and quarantined. The store interface is four methods, which is what allows the identical state machine to run over an in-memory store in Node and over IndexedDB in the browser.

Eighteen Node tests cover the machine. An entry is accepted only as bytes: a string payload or draft is refused with a distinct code, so a caller cannot accidentally persist plaintext. Routing metadata is validated — document, mutation, operation, key version, base revision — and the persisted shape is asserted to carry no title, body, content, plaintext, or category field.

Retry semantics reuse the original client mutation id on every attempt, which is what lets the server recognise a retry as the same mutation rather than a new one. Backoff is exponential with full jitter and a five-minute ceiling, and an attempt ceiling converts a persistent failure into a terminal state instead of an endless loop.

The non-retryable set is proven exhaustively: 400, 401, 403, 404, and 409 statuses and the `KEY_VERSION_MISMATCH`, `VALIDATION_FAILED`, `DOCUMENT_REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, and `RESOURCE_NOT_FOUND` codes each produce a terminal entry that is never claimed again.

Per-document FIFO is enforced with declared predecessors: a dependent entry is not claimable until its predecessor has applied, while independent documents are claimed concurrently. A document with an inflight entry yields no further claims.

Quota behaviour matches the frozen limits. One hundred pending entries and twenty-five mebibytes are the ceilings, the warning flag raises at eighty percent, and a refusal at the ceiling leaves already-queued work untouched. Both the entry count and the byte total are enforced independently.

Nothing is silently deleted. Seven-day expiry moves an entry to a quarantined `expired` state that still carries its encrypted draft, every authority-change reason quarantines pending work with that exact reason recorded, and disposal is refused until a server result is durably recorded. Only an explicit discard removes an entry otherwise.

Namespace isolation is verified over a shared store: a second namespace sees zero entries, claims nothing, and reports zero pending.
