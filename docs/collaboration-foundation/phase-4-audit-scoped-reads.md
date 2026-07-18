# Phase 4 audit and scoped reads

Status: PASS

Story: `CF-P4-006`

Gate: `P4-G5` APPROVED

CF-P4-006 implements the internal, disabled-runtime audit read capability. Owner and Admin are the only roles allowed to read a workspace audit stream. Authorization is loaded from D1 before cursor validation on every page, so membership removal immediately stops traversal and cross-workspace requests remain non-enumerating.

The immutable event registry is closed and versioned. Stored metadata is validated against an exact per-event schema and only specifically approved before/after projections can leave the persistence layer. Unknown event types, versions, outcomes, targets, or metadata fail the entire page closed.

Pagination uses descending `(server_time, sequence)` keysets. Its opaque HMAC-SHA256 cursor is bound to the route, runtime environment, workspace, normalized event/time filters, and position, and expires after 15 minutes. Limits are 50 by default and 100 maximum; exact end-of-stream returns `null`.

The implementation adds no route, migration, Wrangler binding, remote write, or runtime activation. Existing audit writers now pass their event and metadata shape through the same registry, preventing read/write contract drift before a record reaches D1.

Evidence: `CF-EV-P4-UT-004`, `CF-EV-P4-INT-005`, `CF-EV-P4-SEC-006`, and `CF-EV-P4-QA-004`.

Next decision: `P4-G6` may authorize `CF-P4-007` only: assemble the Phase 4 exit evidence and Phase 5 handoff.
