# Collaboration Foundation Cryptographic Contract

## Document control

| Field | Value |
| --- | --- |
| Document ID | CF-CRYPTO-001 |
| Status | Proposed for Gate G3 approval; no runtime implementation authorized |
| Date | 2026-07-15 |
| Decision owner | Security Reviewer |
| Implementation owner | Technical Lead |
| Evidence owner | Senior QA |
| Inputs | ADR-004, ADR-005, ADR-010, ADR-011, threat model, data classification |

## 1. Purpose and invariants

This contract fixes the byte-level formats, validation rules, algorithms, limits, lifecycle, and evidence required for Collaboration Foundation cryptography. Producers must emit exactly these v1 formats. Consumers must reject unknown, missing, duplicate, malformed, non-canonical, oversized, downgraded, or inconsistent values. There is no plaintext, legacy, best-effort, algorithm-negotiation, or unauthenticated fallback.

The server never receives a local unlock secret, KEK, plaintext device private key, plaintext workspace DEK, decrypted document payload, or recovery artifact. Foundation provides no key escrow or recovery artifact. Endpoint encryption does not protect an unlocked compromised browser and cannot erase keys, ciphertext, or plaintext previously copied by an authorized user.

## 2. Normative encoding profile

### 2.1 JSON and strings

- JSON is UTF-8 without BOM and is canonicalized using RFC 8785 JSON Canonicalization Scheme (JCS) before hashing or use as AAD.
- Producers emit objects only with fields defined by the applicable schema. Consumers reject duplicate keys, unknown keys, non-JCS numbers, invalid UTF-8, unpaired surrogates, and Unicode control characters in identifiers.
- Protocol identifiers and enum values are printable ASCII and case-sensitive. User plaintext inside the encrypted payload may contain general valid Unicode.
- Timestamps are server-owned RFC 3339 UTC strings with exactly millisecond precision: `YYYY-MM-DDTHH:mm:ss.sssZ`. Timestamps never participate in authorization and appear in AAD only where explicitly listed.

### 2.2 Binary values

- Binary fields use unpadded RFC 4648 base64url with alphabet `A-Z a-z 0-9 - _`. Standard base64 characters, whitespace, padding `=`, and non-minimal encodings are rejected.
- Decoding must produce the exact byte length required by the field. Re-encoding decoded input must byte-for-byte equal the supplied string.
- SHA-256 fingerprints are 32 bytes and encode to 43 base64url characters. AES-GCM nonces are 12 bytes and encode to 16 characters. A 16-byte salt encodes to 22 characters; a 32-byte salt encodes to 43.

### 2.3 Identifiers and integers

- `userId`, `deviceId`, `workspaceId`, `documentId`, `envelopeId`, `invitationId`, `requestId`, and `clientMutationId` are opaque random UUIDv4 values in lowercase canonical text: 36 ASCII characters including hyphens. Nil, non-v4, uppercase, braced, or non-canonical UUIDs are rejected.
- Provider subject is a GitHub numeric ID represented as an ASCII unsigned decimal string without sign or leading zero, maximum 20 digits. It is not a cryptographic identifier or authorization grant by itself.
- `keyVersion`, document `revision`, `baseRevision`, schema version, and iteration count are JSON safe integers. `keyVersion` is `1..2147483647`; revisions are `0..9007199254740991`; negative, fractional, exponential, NaN, and overflow forms are rejected.

## 3. Approved algorithm registry

| Identifier | Construction | v1 bounds / use |
| --- | --- | --- |
| `PBKDF2-HMAC-SHA256-v1` | PBKDF2 with HMAC-SHA-256 | Exactly 600,000 iterations for v1 production; parser permits only 600,000, salt 16-32 bytes, output 32 bytes |
| `A256GCM-v1` | AES-256-GCM | 32-byte key, 12-byte fresh nonce, 16-byte authentication tag |
| `P256-ECDH-v1` | NIST P-256 ECDH | Validated on-curve public point; private key imported non-extractable with `deriveBits` only |
| `HKDF-SHA256-v1` | HKDF with SHA-256 | 32-byte fresh salt, domain-separated `info`, 32-byte output |
| `P256-HKDF-SHA256-A256GCM-v1` | Ephemeral P-256 ECDH, HKDF-SHA-256, AES-256-GCM | Workspace-DEK envelope only |
| `SHA256-JCS-v1` | SHA-256 over RFC 8785 canonical JSON UTF-8 bytes | Public-key fingerprint and fixture digests |

No algorithm aliases are accepted. SHA-1, MD5, P-384/P-521 negotiation, AES-CBC/CTR, RSA, scrypt/Argon2 substitutions, compressed EC points, AES-GCM tags shorter than 16 bytes, and v1 PBKDF2 counts other than 600,000 are prohibited. A future change requires a new identifier, ADR, migration, and vectors; it must not change v1 interpretation.

## 4. Global size and resource bounds

| Item | Minimum | Maximum |
| --- | ---: | ---: |
| API request body | 2 bytes | 1,048,576 bytes |
| Canonical AAD | 2 bytes | 4,096 bytes |
| Encrypted device-private-key PKCS#8 plaintext | 1 byte | 512 bytes |
| Device private-key envelope JSON | 1 byte | 4,096 bytes |
| Canonical public JWK JSON | 1 byte | 512 bytes |
| Workspace-key plaintext DEK | 32 bytes | 32 bytes |
| Workspace-key envelope JSON | 1 byte | 8,192 bytes |
| Decrypted document JSON | 2 bytes | 786,432 bytes |
| Document ciphertext including tag | 18 bytes | 1,048,000 bytes |
| String identifier / algorithm identifier | 1 byte | 64 ASCII bytes |

Bounds are checked before PBKDF2, JWK import, ECDH, decryption, JSON expansion, or D1 mutation. No batch cryptographic endpoint exists in Foundation. Oversize and resource-limit failures are privacy-safe and non-retryable until input changes.

## 5. Canonical public key and fingerprint

The device public key is an EC public JWK with exactly these fields and values:

```json
{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"<32-byte-base64url>","y":"<32-byte-base64url>"}
```

`x` and `y` each decode to exactly 32 bytes. The point must be valid, on P-256, non-infinite, and accepted by Web Crypto import. Fields `d`, `alg`, `use`, `kid`, and all unknown fields are rejected. The fingerprint is:

```text
base64url(SHA-256(UTF8(JCS(publicJwk))))
```

The backend stores the canonical JWK and fingerprint and recomputes the fingerprint on registration. A key replacement creates a new device identity; a fingerprint never changes in place.

## 6. Encrypted device-private-key envelope

### 6.1 Creation and unlock

The client generates the P-256 pair as extractable only long enough to export private PKCS#8. It derives a KEK from a collaboration-specific user unlock secret using `PBKDF2-HMAC-SHA256-v1`, a fresh random 16-32 byte salt, 600,000 iterations, and a 32-byte output. It encrypts PKCS#8 using `A256GCM-v1` and a fresh 12-byte nonce.

Persist exactly:

```json
{
  "aad":{"curve":"P-256","deviceId":"<uuid>","fingerprint":"<b64u-sha256>","kdf":"PBKDF2-HMAC-SHA256-v1","kdfIterations":600000,"suite":"A256GCM-v1","userId":"<uuid>","version":1},
  "ciphertext":"<base64url PKCS8 ciphertext plus 16-byte tag>",
  "nonce":"<12-byte-base64url>",
  "salt":"<16-to-32-byte-base64url>"
}
```

Exact AAD field order before JCS canonicalization is: `version`, `kdf`, `kdfIterations`, `suite`, `curve`, `userId`, `deviceId`, `fingerprint`. The authenticated bytes are the JCS encoding of an object constructed in that order; JCS supplies the final deterministic byte order. Salt and nonce are cryptographically bound by the derivation/encryption operation and the entire outer object is schema-validated; neither may be reused for a replacement envelope.

On unlock, validate all fields and bounds before PBKDF2, derive KEK, authenticate/decrypt, and import PKCS#8 with `extractable=false` and usage exactly `deriveBits`. Recompute the public key/fingerprint relationship during creation and any supported integrity check; mismatch fails closed. Release/overwrite unlock encoding, KEK, and PKCS#8 buffers best-effort immediately after import. Persist no raw or non-extractable `CryptoKey`, unlock secret, KEK, PKCS#8, or independent password verifier/hint.

## 7. Workspace-key envelope

The plaintext is exactly one 32-byte workspace DEK. The wrapper uses a new ephemeral P-256 key pair for every target device/key version, ECDH with the canonical target public key, HKDF-SHA-256 with a fresh 32-byte salt, and AES-256-GCM with a fresh 12-byte nonce.

HKDF `info` is `UTF8(JCS({"purpose":"docvault-workspace-dek-wrap","suite":"P256-HKDF-SHA256-A256GCM-v1","version":1,"workspaceId":"<uuid>","targetUserId":"<uuid>","targetDeviceId":"<uuid>","targetFingerprint":"<b64u>","wrapperDeviceId":"<uuid>","keyVersion":<int>}))`.

Persist exactly:

```json
{
  "aad":{"keyVersion":1,"suite":"P256-HKDF-SHA256-A256GCM-v1","targetDeviceId":"<uuid>","targetFingerprint":"<b64u>","targetUserId":"<uuid>","version":1,"workspaceId":"<uuid>","wrapperDeviceId":"<uuid>"},
  "ciphertext":"<base64url 32-byte DEK plus 16-byte tag>",
  "ephemeralPublicJwk":{"crv":"P-256","ext":true,"key_ops":[],"kty":"EC","x":"<b64u>","y":"<b64u>"},
  "hkdfSalt":"<32-byte-base64url>",
  "nonce":"<12-byte-base64url>"
}
```

Exact AAD logical order is: `version`, `suite`, `workspaceId`, `targetUserId`, `targetDeviceId`, `targetFingerprint`, `wrapperDeviceId`, `keyVersion`; encode the constructed object with JCS. Before unwrap, the client and API validate the same active workspace/user/device/fingerprint/wrapper/version binding. D1 enforces one envelope per workspace, target device, and key version. Cross-binding, downgrade, replay, unauthorized wrapper, revoked/pending state, or authentication failure produces no readiness transition.

## 8. Document ciphertext envelope

The decrypted payload is one JCS-valid JSON object containing all protected fields defined by ADR-005. The client uses the workspace `A256GCM-v1` DEK for the declared `keyVersion` and a fresh 12-byte nonce for every encryption, including retry, copy, re-encryption, and revision.

```json
{
  "aad":{"contentSchemaVersion":1,"documentId":"<uuid>","envelopeVersion":1,"keyVersion":1,"revisionIntent":{"baseRevision":0,"clientMutationId":"<uuid>"},"suite":"A256GCM-v1","workspaceId":"<uuid>"},
  "ciphertext":"<base64url plaintext ciphertext plus 16-byte tag>",
  "nonce":"<12-byte-base64url>"
}
```

Exact AAD logical order is: `envelopeVersion`, `suite`, `workspaceId`, `documentId`, `keyVersion`, `contentSchemaVersion`, `revisionIntent`; nested `revisionIntent` order is `baseRevision`, `clientMutationId`; encode both through JCS. The server validates routing fields equal authenticated AAD fields before storing ciphertext. The server-authoritative resulting revision is not predicted in AAD; the immutable base revision and mutation ID bind intent, while D1 compare-and-set and idempotency create the result.

Ciphertext is never decrypted by the API. Authentication failure, unknown schema/key version, wrong workspace/document, stale base revision, or mismatched mutation ID never falls back to plaintext or another key.

## 9. Randomness, uniqueness, and key lifecycle

- All keys, UUIDv4 identifiers, salts, nonces, OAuth/session/invitation values, and ephemeral keys use the browser or platform CSPRNG only. `Math.random`, timestamps, counters, deterministic nonces, and user input are prohibited sources.
- Generate a new 256-bit workspace DEK at workspace creation and each rotation. `keyVersion` starts at 1 and increments exactly by one in an atomic server transition.
- AES-GCM nonce uniqueness under one key is mandatory. Producers generate random 96-bit nonces and never retry by reusing a prior nonce; a retained ciphertext may be replayed only under the idempotency contract, not re-encrypted with its nonce.
- A key-ready Owner initiates rotation; active key-ready Owner/Admin devices may provision envelopes. Removed, revoked, pending-key, Editor, and Viewer principals cannot provision another device.
- New writes require the current key version. Old-version offline work is quarantined for user-reviewed re-encryption. Rotation supplies no envelope to removed/revoked devices.
- Current authorized users may retain old-version envelopes for historical revisions until approved purge. Removed users may retain previously obtained old keys/ciphertext/plaintext; cryptography cannot revoke those copies.
- Foundation recovery is provisioning by another active key-ready Owner/Admin device only. If all such provisioners and their usable keys are lost, onboarding/recovery is terminal; there is no server escrow, unlock reset, or recovery artifact.

## 10. Validation and fail-closed errors

Validation order is: transport/body bound, strict JSON parse, exact schema/unknown-field rejection, canonical encoding/base64url/identifier/integer bounds, enum/algorithm version, decoded byte lengths, state/authorization, public-key validation, KDF resource bounds, cryptographic authentication, binding equality, then atomic persistence/state transition.

| Stable client error | HTTP / local | Meaning and required behavior |
| --- | --- | --- |
| `CRYPTO_FORMAT_INVALID` | 400 / local | Malformed/non-canonical/unknown/oversized input; no crypto fallback or mutation |
| `CRYPTO_SUITE_UNSUPPORTED` | 400 / local | Unknown version/suite; do not negotiate or downgrade |
| `CRYPTO_BINDING_MISMATCH` | 400 or privacy-safe 404 / local | AAD, route, identity, device, fingerprint, or key-version mismatch |
| `CRYPTO_AUTH_FAILED` | 422 / local | AEAD/unwrap/private-envelope authentication failed; generic message only |
| `LOCAL_UNLOCK_FAILED` | local | Wrong unlock secret, corrupt envelope, or binding failure; do not distinguish |
| `KEY_NOT_READY` | 409 | Valid membership/device lacks current envelope; no protected read/write |
| `KEY_VERSION_STALE` | 409 | Old-version mutation; quarantine draft for reviewed re-encryption |
| `KEY_ACCESS_DENIED` | 403 or privacy-safe 404 | Current state/role cannot fetch, wrap, rotate, or mutate |
| `CRYPTO_UNSUPPORTED_BROWSER` | local | Required Web Crypto/storage behavior absent; fail closed |

Server logs record only request ID, route, coarse error code, environment, latency, and approved opaque identifiers. Client messages never expose PKCS#8/JWK values, ciphertext, envelope content, salts/nonces, stack traces, provider/account existence, or cross-workspace identifiers. Repeated local unlock failures use bounded UI backoff; the encrypted envelope remains susceptible to offline guessing if stolen, so users must choose a strong secret.

## 11. Test-vector manifest

The repository must contain a reviewed, immutable v1 vector manifest before implementation readiness. Each vector has a stable ID, purpose, contract version, producer/runtime version, input JSON, decoded binary values in hex where safe, expected JCS UTF-8 and SHA-256 digest, expected output/error, and source classification (`synthetic-only`). No production secret or user content is permitted.

Required vector families:

1. JCS/base64url/UUID/integer canonical positive and rejection cases.
2. Public JWK canonicalization, valid P-256 point, fingerprint, private-field/unknown-field/off-curve rejection.
3. PBKDF2 600,000 derivation and encrypted PKCS#8 create/unlock; wrong secret, altered AAD/salt/nonce/tag/ciphertext, iteration bounds, malformed PKCS#8, and cross-user/device substitution.
4. ECDH/HKDF/AES-GCM workspace wrap/unwrap; every AAD field, ephemeral key, salt, nonce, tag, suite, size, replay, wrapper, and target mutation.
5. Document encrypt/decrypt; every AAD/nested field, nonce/tag/ciphertext, content/schema/size, stale revision, and mutation-ID variant.
6. Lifecycle vectors for pending-key, revocation, current/old version, rotation interruption, offline quarantine, and all-provisioners-lost.
7. Sensitive canaries proving forbidden plaintext/key fields are absent from API, D1, IndexedDB except approved encrypted envelope, logs, telemetry, caches, `_site`, and CI artifacts.

Vectors must run in unit tests and every supported real browser. At least two independent implementations or one implementation plus an independently reviewed reference harness must agree on canonical bytes and results.

## 12. Browser support gate

A browser/version is supported only if automated evidence proves: secure-context Web Crypto; P-256 generation/export/import/ECDH; PBKDF2-SHA-256 at 600,000 within the approved performance budget; HKDF-SHA-256; AES-GCM with 12-byte nonce/16-byte tag; reliable CSPRNG; IndexedDB encrypted-envelope persistence; non-extractable `deriveBits` import; lifecycle reference clearing; and stable vectors after reload. Unsupported, private-mode-limited, quota-failed, or corrupted-storage cases fail closed with export-free recovery guidance and do not mark a device key-ready.

## 13. Prohibited storage and logging

The following must not appear in API/D1, logs, telemetry, analytics, Cache Storage, Service Worker responses, URLs, DOM attributes, build output, crash reports, or persistent browser storage: unlock secret or encoding, KEK, raw/private PKCS#8, private JWK/`d`, raw device private key, plaintext workspace DEK, ECDH shared secret, HKDF output/wrapping key, decrypted document fields, OAuth/provider tokens, raw session/invitation tokens, Personal Vault password/key, PAT, or recovery secret/artifact. IndexedDB may contain only the approved encrypted private-key envelope, encrypted workspace envelopes/cache, and encrypted outbox under their contracts.

Transient Critical values exist in browser memory during unlock and use. Clear application references immediately when no longer needed and on lock, logout, account/provider/workspace context switch, removal/revocation, and observable page termination. JavaScript cannot guarantee physical zeroization; XSS or a compromised unlocked endpoint remains a documented P1 risk.

## 14. Requirement and ADR traceability

| Contract area | Requirements | Decisions / threats |
| --- | --- | --- |
| Device key and local envelope | CF-DEV-001-004, CF-KEY-001-002 | ADR-004; T07-T10, T13; AB-09/10/22 |
| Provisioning and workspace envelope | CF-INV-005, CF-KEY-002-003/005-006 | ADR-003, ADR-004, ADR-009; T06-T09; AB-21-25 |
| Document encryption/metadata | CF-DOC-001/004-006, CF-ISO-001-004 | ADR-005; T10, T13, T17, T22; AB-10/11/15/18 |
| Rotation/revocation/recovery | CF-DEV-003-004, CF-RBAC-003, CF-KEY-004-006, CF-SYNC-005 | ADR-010; T08-T09, T12; AB-14/23-25 |
| Browser/API/log boundary | CF-AUD-002, CF-OPS-001/002/005, CF-NFR-004 | ADR-011; T13-T16, T19-T20; AB-15/16/18 |

## 15. Gate G3 acceptance

- [ ] Security Reviewer approves every v1 identifier, encoding, byte length, bound, exact AAD field set, algorithm, KDF count, and fail-closed mapping.
- [ ] Technical Lead confirms draft API/D1/client schemas can implement the contract without an alternate or plaintext path.
- [ ] Independent review confirms public-key fingerprint, PKCS#8 envelope, workspace envelope, and document envelope vectors.
- [ ] Senior QA runs all positive/negative vectors and lifecycle cases in unit/reference harnesses and every proposed supported browser.
- [ ] Performance evidence approves PBKDF2 600,000 and payload bounds on the slowest supported browser/device class.
- [ ] Canary evidence proves prohibited values are absent from server, storage, logs, cache, telemetry, build, and CI surfaces.
- [ ] Product Owner accepts terminal all-provisioners-lost behavior and inability to revoke old keys or prior copies.
- [ ] No P0/P1 crypto threat is open, skipped, waived, downgraded, or covered only by UI behavior.

**Current Gate G3 assessment: `NO-GO` for implementation until every checkbox has linked evidence and approval.**
