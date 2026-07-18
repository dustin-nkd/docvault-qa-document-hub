# CF-EV-P5-UT-001 — Canonical crypto primitive tests

Status: PASS

Story: `CF-P5-002`

Ten Workers tests cover exact JCS bytes/digest, base64url/UUID/integer rejection, P-256 JWK/on-curve validation, fingerprinting, PBKDF2/AES-GCM private-envelope protect/unlock, non-extractable usage, deterministic and production-CSPRNG ECDH/HKDF workspace wrap/unwrap, and fail-closed binding/tag/downgrade cases.
