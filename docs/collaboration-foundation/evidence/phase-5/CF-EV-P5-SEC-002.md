# CF-EV-P5-SEC-002 — Primitive security review

Status: PASS

Story: `CF-P5-002`

Strict schemas reject private/unknown/off-curve public keys, noncanonical encodings, malformed bounds, suite changes, KDF downgrade, binding substitution, and authentication tamper. Product code uses only Workers Web Crypto and CSPRNG, persists nothing, logs nothing, and has no handler import or production fallback. Synthetic private material remains test-only and deployment-boundary excluded.
