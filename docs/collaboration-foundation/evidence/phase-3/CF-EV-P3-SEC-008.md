# CF-EV-P3-SEC-008 — Preview identity security boundary

Status: PASS

Story: `CF-P3-008`

Only designated synthetic identities are allowed in Preview. Exact-Origin enforcement rejects an invalid Origin with `403`; business and collaboration routes remain absent. The private 6/60 Rate Limit binding is a non-authoritative, per-location, permissive, eventually-consistent early shield, while atomic D1 enforcement remains authoritative at 20 attempts per 600 seconds. Binding or storage failure remains fail-closed with a generic `429`.

No secret value, OAuth state, PKCE verifier, session token, IP address, rate digest, provider identity, resource identifier, or deployment identifier is recorded in this evidence.
