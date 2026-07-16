# CF-EV-P3-SEC-002 — Identity primitive negative-security evidence

Status: PASS

Story: `CF-P3-002`

Date: 2026-07-16

## Claim

Malformed, substituted, ambiguous, cross-environment, or incomplete inputs fail closed with stable generic errors and no secret/token echo.

## Evidence

- Strict keyring parsing rejects unknown fields, unsupported versions, missing active keys, invalid IDs, wrong key sizes, and more than one previous key.
- Envelope tests reject ciphertext/tag tamper, AAD transaction substitution, unknown key IDs, and malformed verifier content.
- Redirect tests reject external/scheme-relative targets, fragments, controls, backslashes, nested encodings, malformed percent encoding, and authentication query keys.
- Cookie tests reject duplicate, malformed, control-bearing, and oversized headers; serializers emit `Secure`, `HttpOnly`, `SameSite=Lax`, root `Path`, and no `Domain`.
- Environment tests prove production, wrong-origin preview, missing D1, partial secret, and request-unapproved local modes cannot enable identity.
- Canary assertions prove thrown errors do not contain raw malformed secrets or tokens.

## Boundary

No Pages configuration, migration, secret, OAuth application, D1 row, remote resource, identity route, or production capability was changed.
