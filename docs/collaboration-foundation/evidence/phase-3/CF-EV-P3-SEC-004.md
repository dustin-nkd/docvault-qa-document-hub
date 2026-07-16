# CF-EV-P3-SEC-004 — Provider token and callback authority security evidence

Status: PASS

Story: `CF-P3-004`

Date: 2026-07-16

The GitHub token exists only in the adapter call frame between exchange and identity lookup. It is never returned, stored, cached, audited, or logged. Client secret and code are sent only in the POST body; redirects are rejected. Provider-token, client-secret, code, state, verifier, and injected-fault canaries do not appear in errors, D1 rows, runtime configuration, or evidence output.

Malformed token responses, non-numeric identity, oversized bodies, provider failure, expiry during provider work, callback replay, duplicate session digest, wrong reauthentication subject, stale/revoked predecessor, and injected pre-batch failure create no new authority. All external callback failures collapse to `OAUTH_CALLBACK_FAILED`.

Production and preview identity remain disabled. Route calls, bindings, secrets, OAuth applications, and remote changes: zero.
