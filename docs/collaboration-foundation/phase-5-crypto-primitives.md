# CF-P5-002 — Canonical crypto primitives and independent vectors

Status: PASS

Entry: P5-G1 APPROVED

Exit recommendation: P5-G2 APPROVE CF-P5-003 ONLY

## Result

Four isolated Workers-compatible modules implement the frozen v1 profile: RFC 8785 JSON canonicalization with I-JSON Unicode checks, canonical unpadded base64url and bounded identifiers, exact on-curve P-256 public JWK validation/fingerprint, PBKDF2 600,000 plus AES-256-GCM private-key protection, and ephemeral P-256 ECDH/HKDF/AES-256-GCM workspace-DEK wrapping.

The unlocked device private key is imported non-extractable with usage `deriveBits` only. Production randomness uses `crypto.getRandomValues`; workspace ephemeral private keys are non-extractable. Exact AAD, algorithm identifiers, sizes, fingerprints, UUIDv4 values, integer ranges, and authentication tags fail closed. There is no negotiation, downgrade, plaintext fallback, escrow, or logging path.

## Independent vectors

The immutable `CF-CRYPTO-V1` fixture contains all 30 IDs frozen by CF-P5-001 across six families. Workers Web Crypto executes the positive and negative primitives. A separate Node `crypto` oracle independently reproduces JCS/SHA-256, PBKDF2/AES-GCM, P-256 ECDH/HKDF, and workspace AES-GCM expected bytes. All material is visibly synthetic and excluded from deployment artifacts.

## Boundary

No request handler imports these modules. No API route, migration, Wrangler binding, secret, remote D1 write, Preview deployment, Production identity, or collaboration activation was added. CF-P5-003 remains blocked until P5-G2 approval.
