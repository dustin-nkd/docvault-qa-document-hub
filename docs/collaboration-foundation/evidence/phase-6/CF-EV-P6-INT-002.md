# CF-EV-P6-INT-002 Document read integration evidence

Status: PASS

Story: `CF-P6-005`

Ten Workers/D1 tests exercise the read surface against a real migrated schema-12 database, using documents produced by the `CF-P6-004` mutation service rather than hand-inserted rows, so the read and write paths are proven to agree on the same data.

**Sprint gate G2 (a document created by an Editor is read by a Viewer).** An Editor creates a document and updates it to revision 2. A Viewer in the same workspace then reads the current document with its payload, finds it in the document list, retrieves the full revision history in ascending order with the create revision reporting base revision zero, and reads the historical revision 1 payload. This closes the second of the six sprint gate scenarios.

Denials are proven identical across four different causes: a non-member, a member whose membership was removed mid-test, a revoked device belonging to an otherwise authorized user, and a foreign workspace identifier all return `RESOURCE_NOT_FOUND`. A separate test compares reading a document that exists but belongs to another workspace against reading one that never existed at all, and asserts the two outcomes are the same value — so response shape cannot be used to probe for a document's existence in a workspace the caller cannot see.

Tombstone behaviour is verified end to end: after a delete, the document reports state `tombstoned` with a null payload, the revision list shows create followed by delete with the tombstone flag set, the tombstone revision serves no payload, and the pre-delete revision remains readable.

Pagination is verified for both routes. Documents page in identifier order and revisions page in ascending revision order, with no overlap between consecutive pages. Cursor rejection is proven for a tampered signature, a tampered body, a malformed string, a cursor signed with a different key, a validly signed cursor bound to another workspace, a cursor issued for the revisions route replayed on the documents route, a cursor bound to a different document, and an expired cursor. The emitted cursor is also asserted to contain no document identifier verbatim.

The header contract is asserted directly rather than described: no-store, no-cache, immediate expiry, Service Worker bypass, nosniff, and no-referrer.
