# CF-EV-P6-VEC-001 Document envelope and fingerprint vectors

Status: PASS

Story: `CF-P6-003`

The immutable vector sets frozen by `CF-P6-001` are published as `tests/fixtures/cloudflare/phase-6-document-vectors.json` and cover `CF-VEC-P6-ENV-001` (envelope and canonical AAD) and `CF-VEC-P6-FPR-001` (canonical request fingerprint). The material is synthetic and deterministic: the DEK and nonce are generated from fixed arithmetic patterns, the identifiers are synthetic UUIDs, and the payload is a fixed ASCII string. No real key, plaintext, or draft context appears in the fixture.

Agreement is 100% against an independently implemented oracle. The production implementation uses WebCrypto; the oracle in `tests/document-envelope.test.mjs` uses `node:crypto` `createCipheriv`, `createDecipheriv`, and `createHash`, and an independent JCS implementation. Both reproduce the frozen envelope bytes, the sixty-eight-byte length, and the SHA-256 digest exactly, and each can open what the other sealed. Because the two paths share no code, agreement means the contract is right rather than that one implementation agrees with itself.

Negative coverage mutates every field that the AAD binds. Rebinding the envelope to another workspace, another document, another revision intent, or another key version fails as an authentication failure rather than decrypting; so does a wrong DEK, a flipped nonce byte, and a flipped byte at the start, middle, and end of the ciphertext. All of them return the same `ENVELOPE_AUTHENTICATION_FAILED` code, so a caller cannot distinguish a wrong key from a tampered byte from a rebound AAD.

Fingerprint mutation coverage alters each of the ten inputs independently and asserts a distinct digest every time, including the case where the ciphertext digest changes while the byte count stays equal. Swapping two adjacent inputs also changes the digest, which demonstrates that the frozen input order is load-bearing and not merely documentation.
