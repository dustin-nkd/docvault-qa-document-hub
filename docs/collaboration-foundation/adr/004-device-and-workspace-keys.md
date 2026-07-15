# ADR-004: Device and Workspace Keys

## Status

Proposed for Gate G2 approval. Cryptographic implementation remains blocked until vectors and browser support evidence pass.

## Date

2026-07-15

## Owners

Security Reviewer (cryptographic decision), Technical Lead (implementation), Product Owner (recovery policy), Senior QA (verification).

## Context

Each authorized device must decrypt workspace content without giving Pages Functions, D1, operators, or the OAuth provider a plaintext workspace key or device private key. Membership acceptance may occur while no authorized device is available to provision a key, so membership and cryptographic readiness must be separate states.

## Decision

Foundation uses standards-based browser Web Crypto only. Each device generates a P-256 ECDH key pair as extractable only during initial creation so the browser can export its private PKCS#8 bytes. Those bytes are immediately encrypted under a key-encryption key (KEK) derived from a user-specific collaboration unlock secret. IndexedDB stores only the versioned encrypted private-key envelope. On unlock, the client decrypts the PKCS#8 transiently and imports it as a non-extractable `CryptoKey` whose only usage is `deriveBits`. Its public key is exported as canonical JWK. Each workspace has a random 256-bit AES-GCM data-encryption key (DEK) and monotonically increasing `keyVersion`.

A key-ready authorized device wraps a workspace DEK for a target device using ephemeral P-256 ECDH, HKDF-SHA-256, and AES-256-GCM. The authenticated envelope binds workspace, target user, target device, target public-key fingerprint, wrapper device, algorithm suite, and key version. The server stores ciphertext and binding metadata but never plaintext DEKs or private keys.

## Detailed contract

### Device registration

- The user creates or enters a collaboration-specific local unlock secret during device initialization. It is user-specific, client-only, never derived from OAuth/session material, never silently reused from Personal Vault, and never stored, synchronized, logged, or sent to the server.
- Generate the P-256 ECDH pair using `crypto.subtle.generateKey` with `extractable=true` only for initial export. Export the private key once as PKCS#8 and retain the raw byte buffer only for the encryption operation below.
- Derive a 256-bit KEK using versioned `PBKDF2-HMAC-SHA-256-v1`, a fresh cryptographically random salt of at least 16 bytes per private-key envelope, and 600,000 iterations. The iteration count is an authenticated envelope field and is validated against approved lower/upper bounds before derivation; v1 never accepts fewer than 600,000.
- Encrypt the PKCS#8 bytes using AES-256-GCM with a fresh unpredictable 96-bit nonce. Canonical authenticated header/AAD binds envelope version, KDF/suite, iterations, salt, curve `P-256`, authenticated application user ID, device ID, and public-key fingerprint. Any header, ciphertext, or tag mismatch fails closed.
- Persist only the encrypted private-key envelope in IndexedDB: version, KDF/suite, iterations, salt, nonce, authenticated binding header, and ciphertext/tag. Do not persist the unlock secret, KEK, plaintext PKCS#8, or an independently usable password verifier/hint.
- After encryption, release/overwrite transient PKCS#8, unlock-secret encoding, and KEK references on a best-effort basis. JavaScript garbage collection prevents a guarantee of immediate physical zeroization; this is an accepted browser-runtime limitation.
- On each unlock, derive the KEK, authenticate/decrypt the envelope, and import PKCS#8 with `extractable=false` and usages exactly `['deriveBits']`. A wrong secret or tampered envelope returns one generic local unlock failure and exposes no partial key or binding detail.
- Immediately after successful import, release/overwrite unlock-secret encoding, KEK, and plaintext PKCS#8 references on a best-effort basis. Hold only the non-extractable imported private `CryptoKey` and required unwrapped DEKs for the unlocked context. Clear all application references and decrypted key state on explicit lock, logout, account change, workspace/provider context switch, membership/device revocation, and page lifecycle termination where observable.
- The public JWK must be EC/P-256 with `key_ops=[]`, `ext=true`, and no private `d`. Reject unknown/multiple keys, malformed points, unexpected fields, or algorithms.
- Canonicalize the approved public JWK fields and compute `fingerprint = base64url(SHA-256(canonicalJwk))`.
- D1 binds an opaque `deviceId`, authenticated user ID, public JWK, fingerprint, creation time, status, and revocation time. A key change creates a new device/key identity; it never silently replaces an existing fingerprint.
- Device initialization requires a valid session and CSRF proof. A user may register only its own device. Registration does not itself make the device key-ready for any workspace.

### Workspace DEK and document encryption

- The creating client generates 32 random bytes and imports them as an AES-256-GCM DEK; the initial `keyVersion` is 1.
- Every document encryption uses a fresh unpredictable 96-bit nonce. The authenticated document envelope includes format version, workspace ID, document ID, revision intent, key version, and content-schema version as AAD.
- No nonce may be reused with the same DEK. Encryption/decryption errors fail closed; no plaintext, older algorithm, or unauthenticated compatibility fallback exists.

### Device envelope construction

1. The wrapper retrieves the canonical target device record through an authorized workspace endpoint and records the target fingerprint.
2. The wrapper creates an ephemeral P-256 ECDH key pair and derives the shared secret with the target public key.
3. HKDF-SHA-256 derives a 256-bit wrapping key using a fresh 32-byte salt, an empty input salt is forbidden, and an ASCII/domain-separated `info` containing the envelope version and all binding identifiers.
4. AES-256-GCM encrypts the 32-byte workspace DEK with a fresh 96-bit nonce and canonical AAD containing `workspaceId`, target `userId`, target `deviceId`, target `fingerprint`, wrapper `deviceId`, `keyVersion`, and suite `P256-HKDF-SHA256-A256GCM-v1`.
5. The envelope carries only version, suite, ephemeral public JWK, HKDF salt, nonce, DEK ciphertext/tag, binding metadata, and timestamps. Strict encoded-size and field bounds apply.
6. Submission uses compare-and-set against the still-current target fingerprint and active device/membership state. D1 enforces uniqueness for workspace/target-device/key-version and records the authorized wrapper.

### Authorization and state

- Membership states include `pending_key`, `active`, `removed`; device key readiness is tracked per workspace and key version.
- A newly accepted member is `pending_key`. It cannot read protected revisions, create/update documents, or provision another device until its device has a valid envelope and transitions atomically to key-ready/active.
- Only an active, non-revoked, key-ready Owner/Admin device holding the relevant DEK may wrap that same workspace/key version. Pending, removed, revoked, Editor, and Viewer principals cannot wrap for another device.
- Envelope fetch is authorized to the exact active target user/device and workspace. Cross-device, cross-user, cross-workspace, algorithm, fingerprint, and version substitution fail before returning ciphertext.
- The client verifies every binding and the canonical fingerprint before unwrap. Unwrap or AAD failure produces no key-readiness transition.

## Alternatives

- One shared password or server-generated/stored DEK: rejected because it weakens individual revocation and E2EE.
- RSA-OAEP device keys: viable but rejected for larger keys/envelopes and a less uniform derive-and-wrap construction.
- Extractable private JWK in localStorage: rejected due to script exposure and weak storage semantics.
- Persistently stored non-extractable `CryptoKey` in IndexedDB: rejected because any same-origin session able to load it could use it without a user-specific local unlock secret.
- Use the OAuth session, provider token, or Personal Vault secret automatically as the KEK source: rejected because collaboration device unlock must be explicit, user-specific, client-only, and isolated from identity and personal providers.
- Server-authorized envelope without wrapper/target binding: rejected because key substitution/replay would remain possible.
- WebAuthn as the sole encryption key: deferred because credential PRF/support/recovery behavior needs separate browser validation.

## Consequences and residual risks

The server can authorize ciphertext access without decrypting it, but key provisioning and local unlock become explicit workflows. Private PKCS#8 bytes necessarily exist transiently in browser memory during creation and each unlock; JavaScript cannot guarantee physical zeroization. The imported in-use key is non-extractable, but XSS, a malicious extension, or a compromised device can invoke it and read unwrapped DEKs/plaintext while unlocked. A weak user unlock secret remains susceptible to offline guessing of a stolen envelope despite the 600,000-iteration baseline. A forgotten unlock secret makes that device key unusable. Foundation has no server escrow and no recovery artifact; recovery is only normal provisioning from another active key-ready Owner/Admin device under ADR-010, otherwise loss is terminal. A removed user may retain previously received DEKs, ciphertext, or plaintext.

## Security and privacy

Device private keys, PKCS#8 bytes, unlock secrets, KEKs, and plaintext DEKs are Critical and browser-only. Encrypted private-key and workspace-key envelopes are Restricted; device public keys/fingerprints and binding identifiers are Internal security data. Never log unlock inputs, key material, derived secrets, document ciphertext bodies, envelopes, nonces with ciphertext, or unwrap errors containing input values. CSP and safe rendering are mandatory because XSS during unlock or an unlocked session can capture transient PKCS#8/unlock material or use the imported key despite at-rest encryption.

## Operations

Maintain versioned KDF, private-key-envelope, device-envelope, and algorithm allow-lists; deterministic test vectors; browser capability checks; iteration bounds; and schema migration rules. Metrics are limited to coarse success/failure reason codes and counts and never include unlock or envelope input. An unsupported browser fails closed with recovery guidance. KDF/algorithm changes require a new version and migration; v1 identifiers and its 600,000-iteration minimum are immutable. No operational process can escrow or reset the local unlock secret/private key.

## Test implications

- Fixed positive vectors prove canonical JWK fingerprints, ECDH/HKDF output, AAD, envelope unwrap, and document round trips.
- Fixed private-key-envelope vectors prove PBKDF2-HMAC-SHA-256 at 600,000 iterations, salt/header canonicalization, AES-256-GCM encryption, correct unlock, and non-extractable `deriveBits` import.
- Negative local-unlock vectors cover wrong/empty secret, altered user/device/fingerprint/curve/version/KDF/iterations/salt/nonce/ciphertext/tag, below-minimum or excessive iteration counts, malformed PKCS#8, IndexedDB corruption, and cross-account/context envelope substitution.
- Negative vectors mutate every bound field, key point, salt, nonce, tag, ciphertext, size, suite, key version, wrapper, and target.
- Concurrent registration/envelope submission verifies compare-and-set fingerprint behavior and uniqueness.
- Role/state matrices prove pending, removed, revoked, wrong-workspace, wrong-user, and wrong-device denial and absence of D1/readiness side effects.
- Browser tests prove IndexedDB contains only the encrypted private-key envelope; the unlocked imported key is non-extractable with only `deriveBits`; application key references are cleared on lock, logout, account/context switch, and revocation; and unsupported storage/crypto fails closed across the approved matrix.
- Sensitive canaries prove unlock secrets, KEKs, PKCS#8 bytes, plaintext private keys/DEKs, and independently usable verifiers are absent from D1, API traffic, logs, telemetry, persistent storage, caches, and build artifacts.

## Requirement and threat links

CF-DEV-001 through CF-DEV-004; CF-KEY-001 through CF-KEY-006; CF-DOC-001; CF-INV-005; threat-model T06-T10 and T13; abuse cases AB-09, AB-10, AB-21 through AB-25.

## Gate G2 acceptance

- [x] Security Reviewer approves the suite, canonicalization, AAD, bounds, authorization, and state machine.
- [x] Security Reviewer approves the local unlock, PBKDF2 600,000 baseline/bounds, encrypted PKCS#8 envelope, transient-memory, and key-clearing contracts.
- [ ] Product Owner approves unlock-secret setup/forgetting, pending-key, unsupported-browser, and terminal all-keys-lost UX.
- [x] Security and Senior QA accept the positive/negative vector plan; executable vectors remain a Phase 1 release gate.
- [x] The supported-browser gate must prove P-256 PKCS#8 generation/export/encryption and non-extractable `deriveBits` import or explicitly exclude the browser.
- [x] Lifecycle key-reference clearing tests are defined as release-blocking evidence.
- [x] No plaintext DEK/private key path exists in API, D1, persistent storage, logs, recovery, or build design; transient browser-memory exposure is documented and testable as far as the platform permits.
- [x] Foundation exposes no server escrow, unlock reset, or recovery-artifact import/export path.
