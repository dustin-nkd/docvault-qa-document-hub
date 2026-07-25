# CF-EV-P6-SEC-004 Document mutation security review

Status: PASS

Story: `CF-P6-004`

Authorization precedes replay. `resolveAuthorizedReplay` re-checks current membership, device state, and user status before returning any stored idempotency result, so a previously successful mutation grants nothing after revocation. This is proven directly: a mutation succeeds, the actor's membership is then removed, and the identical replay is denied with zero new rows instead of returning the stored success.

Viewer appears in no mutation path. The role test lives inside the guard SELECT as an owner/admin/editor restriction, so a Viewer write is an authorization failure that rolls back rather than a validation error handled in application code. Removed members, revoked devices, deactivated users, cross-workspace identifiers, and non-current key versions are filtered by the same SELECT and produce the same zero-row outcome.

Error responses are non-disclosing. A caller who is not authorized receives the shared `RESOURCE_NOT_FOUND` mapping whether the document exists, belongs to another workspace, or was tombstoned, so response shape cannot be used to probe for resource existence. Only a caller already proven authorized for the workspace can receive `DOCUMENT_REVISION_CONFLICT`, and that response carries just two integers. `KEY_VERSION_MISMATCH` is likewise reserved for an authorized member so the client can re-encrypt under the current key.

No server component holds plaintext. The service persists only the ciphertext envelope, a thirty-two-byte digest, and a byte count. The idempotency ledger stores a thirty-two-byte fingerprint and a five-key result document containing document identifier, revision, operation, server timestamp, and client mutation identifier — verified by asserting the exact key set. Audit metadata is the empty object, verified by reading the stored row.

Server-derived values cannot be overridden: actor, role, authoritative time, and revision are computed by the service and the request type carries no field that could supply them. The revision is derived from the base revision and never read from the client.

Residual scope: no HTTP route exists yet, so Origin, CSRF, session binding, and rate limiting are not exercised by this story. They belong to `CF-P6-005` and `CF-P6-008`, and this record does not extend to them.
