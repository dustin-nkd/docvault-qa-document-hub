# CF-EV-P6-UT-002 Document envelope unit evidence

Status: PASS

Story: `CF-P6-003`

`js/collaboration/document-envelope.js` seals document content in the browser under the current workspace DEK with AES-256-GCM. The binary layout is fixed-width — one version byte, a twelve-byte nonce, then ciphertext with the sixteen-byte tag appended — so parsing needs no length fields and a truncated envelope is detected structurally. `functions/_lib/documents/request-fingerprint.ts` implements the server-side canonical fingerprint over the ten inputs frozen by `CF-P6-001` §3.1.

Eighteen Node tests and eight Workers tests cover the pair. A sealed envelope round-trips to the original plaintext, one hundred consecutive seals produce one hundred distinct nonces, and the emitted `ciphertextBytes` and thirty-two-byte `ciphertextDigest` stay inside the schema-12 constraints for `documents` and `document_revisions`.

Bounds are enforced before any crypto work, as the acceptance criteria require: an oversize plaintext, a wrong-length DEK, a non-`Uint8Array` payload, a wrong-length injected nonce, a truncated envelope, and an unsupported envelope version each fail with a distinct code and cost no cipher pass. Invalid workspace, document, revision-intent, and key-version bindings are rejected during AAD construction, again before the cipher is touched.

The fingerprint enforces the create precondition exactly: `create` with a non-zero base revision and a non-create with a zero base revision are both rejected, matching the schema-12 CHECK. Malformed identifiers, an unknown operation, a zero key version, a non-1 envelope version, an out-of-range ciphertext byte count, and a wrong-length digest each fail closed with their own code.

The nonce parameter of `sealDocumentEnvelope` exists solely so the frozen vectors are reproducible. Production callers omit it and receive a fresh random nonce; the module documents that this seam must never be used outside tests, because a reused nonce under one DEK breaks AES-GCM.
