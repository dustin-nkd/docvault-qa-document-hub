# CF-EV-P6-SEC-005 Document read security review

Status: PASS

Story: `CF-P6-005`

Reads disclose nothing across a workspace boundary. Every denial — non-member, removed member, revoked device, deactivated user, deleted workspace, foreign workspace identifier, unknown document, and unknown revision — returns one identical `RESOURCE_NOT_FOUND`. A test compares a document that exists in another workspace against one that never existed and asserts the two responses are the same, so an attacker cannot use response shape as an existence oracle.

Scoping is enforced in SQL. Each query filters on `workspace_id` in its WHERE clause rather than fetching by identifier and checking ownership afterwards, so a cross-tenant identifier matches no row and there is no window in which another workspace's ciphertext is loaded into memory.

Pagination cursors are unforgeable and non-transferable. The HMAC covers the route, workspace, document, position, and timestamps, and verification requires each binding to equal the request being served. Proven rejections include a tampered signature, a tampered body, a cursor signed with a different key, a validly signed cursor bound to another workspace, a cursor for the revisions route replayed on the documents route, a cursor bound to a different document, and an expired cursor. Page size is bounded to one hundred so a caller cannot request an unbounded scan.

Reads are role-agnostic by design and this is deliberate, not an oversight: a Viewer must be able to read. The mutation guards from `CF-P6-004` remain the only write path and continue to exclude Viewers, so widening reads does not widen writes.

Responses are not storable. `Cache-Control: no-store, private`, `Pragma: no-cache`, and `Expires: 0` are set on every read, and `Service-Worker-Allowed: none` keeps the offline shell from retaining a ciphertext page that would outlive the authorization that produced it. A restrictive Content-Security-Policy, `nosniff`, `DENY` framing, and `no-referrer` are applied alongside.

Tombstoned documents return metadata only. Their ciphertext is retained in the revision chain for audit and recovery but is not served through the current-document read, so a deleted document cannot be recovered by a caller simply re-reading it.

Residual scope: this story implements the read services, cursor, and header contract as a module. The routes are not yet registered in the deployed Preview runtime — that registration, together with the deliberate amendment of the Phase 5 route inventory it requires, belongs to `CF-P6-008`. Origin, CSRF, session binding, and rate limiting are therefore not exercised here, and this record does not claim them.
