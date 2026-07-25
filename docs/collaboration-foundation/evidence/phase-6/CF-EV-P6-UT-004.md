# CF-EV-P6-UT-004 Document read service unit evidence

Status: PASS

Story: `CF-P6-005`

`functions/_lib/documents/document-reads.ts` implements the four document read operations — list documents, read one document, list revision history, and read one historical revision — together with an opaque pagination cursor and the response header set for read routes.

Authorization for reads is deliberately role-agnostic. `requireReader` demands an active membership of any role, an active device owned by the same user, an active user, and an active non-deleted workspace. Role is not constrained, which is what allows a Viewer to read while the mutation guards in `CF-P6-004` continue to exclude Viewers from writing.

Every query is workspace-scoped in SQL rather than filtered after the fact, so a document identifier belonging to another workspace matches no row instead of being fetched and then rejected.

The cursor codec signs an HMAC over a payload binding the route, workspace identifier, document identifier, position, and issue/expiry timestamps. Verification requires all four bindings to match the request being served, so a cursor is unusable on a different route, a different workspace, a different document, or after its fifteen-minute lifetime. A page size is bounded to one hundred and defaults to twenty-five; zero, negative, and oversize values fail as validation errors.

Tombstone semantics are explicit: a tombstoned document reports its state and revision but serves no payload, and the tombstone revision itself serves none either. Earlier revisions of a tombstoned document remain readable, because the revision chain is retained for audit and recovery.

`documentReadHeaders` returns `Cache-Control: no-store, private`, `Pragma: no-cache`, `Expires: 0`, `Service-Worker-Allowed: none`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and a restrictive Content-Security-Policy. A cached ciphertext page would outlive the authorization that produced it, so nothing here is storable.
