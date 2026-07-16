# CF-EV-P3-UT-004 — Identity request-policy unit evidence

Status: PASS

Story: `CF-P3-006`

The Workers-runtime policy suite contains 12 deterministic tests covering the exact four method/path pairs, strict path/query and method classification, mutation media types, callback protocol exception, optional and required sessions, CSRF issuance, validation order, and stable no-store/no-CORS response headers.

The synchronizer token is derived with the independently configured CSRF keyring over the raw current session token and verified through Web Crypto. Missing, malformed, old-key, and cross-session values all return the same `CSRF_REJECTED` policy error without exposing token material.

No production handler imports the policy. Schema version 9, bindings, secrets, and deployed feature flags remain unchanged.
