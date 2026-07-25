# CF-EV-P6-UT-003 Document mutation service unit evidence

Status: PASS

Story: `CF-P6-004`

`functions/_lib/documents/document-service.ts` implements create, update, and tombstone as one atomic D1 boundary each, on top of the reviewed Phase 2 guarded-batch and idempotency primitives. Two new static recipes were added to `functions/_lib/persistence/mutation-recipes.ts`: `document.create` and `document.tombstone`. The existing `document.update` recipe was reused unchanged.

Every recipe carries its whole authorization and precondition test inside the SELECT that supplies the ledger's NOT NULL `result_json`. When that SELECT matches no row the insert violates the constraint and D1 rolls the entire batch back, so authorization failure and stale-revision failure share one code path that cannot leave a partial write. The service never issues a bare write outside a guarded batch.

Input bounds are validated before any database or crypto work: identifiers must be UUIDv4, key version and envelope version must be in range, the ciphertext byte count must sit inside the schema-12 constraint, the digest must be exactly thirty-two bytes, the envelope length must equal the declared byte count, and the create precondition (base revision exactly zero) is enforced against the operation. Nine malformed shapes are proven to fail with `VALIDATION_FAILED` and to leave every table untouched.

The stable error taxonomy frozen by `CF-P6-001` is implemented in full: `VALIDATION_FAILED`, `RESOURCE_NOT_FOUND`, `DOCUMENT_REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `IDEMPOTENCY_WINDOW_EXPIRED`, and `KEY_VERSION_MISMATCH`. A conflict discloses only the submitted base revision and the current revision.

Two audit event types, `document.created` and `document.tombstoned`, were added to the audit registry alongside the existing `document.updated`. The `audit_events.event_type` column constrains format rather than enumerating values, so no migration was required and none was created.
