# CF-EV-P3-UT-001 — Identity primitive Workers vectors

Status: PASS

Story: `CF-P3-002`

Date: 2026-07-16

## Claim

The isolated identity library executes in the Cloudflare Workers runtime and implements the frozen cryptographic, token, redirect, cookie, and environment contracts without route or persistence activation.

## Evidence

- `tests/cloudflare/identity-primitives.workers.test.ts` contains 10 executable tests under `@cloudflare/vitest-pool-workers`.
- Fixed synthetic vectors cover 256-bit OAuth state, a 64-random-byte PKCE verifier with S256 challenge, and an AES-256-GCM version-1 transaction envelope.
- Key rotation proves lookup/decryption through an explicit previous key while new signatures/envelopes use only the active key.
- Session digests and CSRF proofs use Web Crypto HMAC verification; raw values are not persistence outputs.
- The suite uses only synthetic byte sequences and contains no provider or production credential.

## Boundary

This is primitive-level evidence. It does not claim OAuth transaction persistence, provider exchange, session persistence, route availability, preview provisioning, or collaboration enablement.
