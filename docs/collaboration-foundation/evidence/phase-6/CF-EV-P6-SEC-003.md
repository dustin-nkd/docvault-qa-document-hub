# CF-EV-P6-SEC-003 Document envelope security review

Status: PASS

Story: `CF-P6-003`

Document content is encrypted in the browser before it crosses the browser boundary. The server receives only the envelope bytes, a thirty-two-byte SHA-256 digest, and a byte count, and holds no key material capable of opening them. Nothing in this story sends, logs, or persists a plaintext, a DEK, or draft context.

The canonical AAD binds workspace, document, revision intent, key version, and envelope version. That binding is what prevents a captured envelope from being replayed into another workspace, another document, another revision, or another key version: each rebinding is proven by test to fail as an authentication failure rather than to decrypt. Every authentication failure — wrong DEK, tampered ciphertext, flipped nonce, rebound AAD — returns one identical code, so a caller learns only that opening failed and cannot use error shape as an oracle.

The canonical fingerprint takes only the ciphertext digest and byte count, never the plaintext or the full ciphertext body; a test asserts that the preimage contains neither the vector plaintext nor the vector envelope while it does contain the digest. The idempotency ledger therefore stores no content-bearing material.

A plaintext canary sealed through the module does not appear in the resulting envelope bytes or in the AAD. Bounds are validated before any crypto work, so an oversize or malformed payload cannot consume key-import or cipher resources — a cheap denial-of-service surface closed by construction rather than by rate limiting.

Nonce uniqueness is verified over one hundred consecutive seals. The injectable nonce seam exists only for vector reproducibility and is documented as prohibited outside tests; production callers omit it and receive `crypto.getRandomValues` output.

Residual scope note: this story implements the envelope and fingerprint primitives only. No route, no persistence, and no idempotency ledger write exists yet, so the end-to-end guarantees for stored revisions must be re-proven when `CF-P6-004` implements the atomic mutation path. This record does not extend to code that does not yet exist.
