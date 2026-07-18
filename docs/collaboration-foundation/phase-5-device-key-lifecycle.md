# CF-P5-003 — Protected browser device-key lifecycle

Status: PASS

Entry: P5-G2 APPROVED

Exit recommendation: P5-G2A APPROVE CF-P5-004 ONLY

## Delivered behavior

The isolated browser module creates an extractable P-256 ECDH pair only for enrollment, exports PKCS#8 once, protects it with the frozen PBKDF2-HMAC-SHA-256 600,000/AES-256-GCM envelope, and persists exactly that four-field envelope in an environment-scoped IndexedDB store keyed by immutable user and device IDs. It imports the active private key as non-extractable with usage exactly `deriveBits` and proves the public/private relationship with bidirectional ephemeral ECDH.

Unlock strictly validates the envelope and caller-supplied canonical public key before KDF work. Wrong secrets, corrupt records, changed bindings, missing records, and substituted keys all fail as `LOCAL_UNLOCK_FAILED`. Unsupported secure-context, Web Crypto, or IndexedDB behavior fails closed with export-free user guidance. No password verifier, hint, private JWK, PKCS#8, KEK, or `CryptoKey` is persisted.

Application key references are cleared by explicit lock, context change, local revocation, disposal, page hide, page unload, page freeze, and visibility loss. Operation epochs prevent an interrupted asynchronous unlock from restoring a key after a later lock. JavaScript physical zeroization is not claimed; copied secret, derived-bit, shared-secret, and PKCS#8 buffers are overwritten best-effort.

## Qualification and boundaries

The release E2E gate uses real Web Crypto and real IndexedDB in Chromium, Firefox, and WebKit. It covers enrollment, raw persistence inspection, non-extractability, uniform failure, tamper, reload, context switch, page lifecycle, revocation, unsupported capability, DOM canaries, and the 2,500 ms hard KDF-operation ceiling.

No request handler imports the browser lifecycle. It is not referenced by `index.html`, is not in the Personal/Guest production artifact, and does not create a route, migration, binding, secret, D1 write, Preview activation, Production identity, or collaboration UI.
