# CF-EV-P6-SEC-001 Document contract security and privacy review

Status: PASS

Story: `CF-P6-001`

The frozen contract preserves the Phase 5 cryptographic boundary and adds no server-visible plaintext surface. Document content is encrypted client-side under the current workspace key version before it crosses the browser boundary; the server stores only the ciphertext envelope, a 32-byte digest, byte accounting, and allow-listed routing metadata. The canonical request fingerprint takes a ciphertext digest and byte count, never plaintext, draft context, or a full ciphertext body, and the idempotency ledger stores the digest only.

Authorization precedes replay in the frozen processing order, so a previously successful mutation grants nothing after revocation. Viewer appears in no mutation row: a Viewer write is an authorization denial that creates no document, revision, idempotency, or business audit row. Non-existent, other-workspace, removed, unauthorized, and hidden deleted resources share one `404 RESOURCE_NOT_FOUND` mapping, and conflict responses disclose only the submitted base revision and the current revision.

The offline outbox is encrypted at rest in IndexedDB under a namespace bound to environment, provider subject, workspace, device, and document, so personal, guest, preview, and production never share queued state. Queued authority is never trusted: entries are re-authorized on submission, and logout, account or workspace change, role removal, device revocation, membership loss, or key rotation quarantines affected entries instead of executing them. `401`, `403`, `409`, key-version mismatch, and validation failures never enter an automatic retry loop.

Two residual risks are restated rather than resolved. Credential rejection during Copy to workspace is client-side only, because the API cannot semantically inspect encrypted category; this was accepted at Gate G3 and no story may claim server enforcement. A formerly authorized member retains any plaintext already downloaded; server revocation prevents future operations only. Both carry named owners and reviewers in the freeze document.

No secret, credential, token, key, or plaintext canary appears in the freeze document, its manifest, or this record.
