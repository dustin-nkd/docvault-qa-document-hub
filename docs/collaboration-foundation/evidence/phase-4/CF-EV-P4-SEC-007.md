# CF-EV-P4-SEC-007 — Preview API security controls

Status: PASS

Story: `CF-P4-007`
Gate: `P4-G6`

Exact Origin, session-bound CSRF, server-side sessions, active-device checks, live D1 RBAC, mutation idempotency, bounded strict JSON, duplicate-query rejection, privacy-safe errors, no-store responses, and signed expiring cursors are enforced. Production and GitHub Pages remain disabled, and no client-supplied role or tenant authority is trusted.
