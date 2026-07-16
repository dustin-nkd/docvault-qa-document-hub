# CF-EV-P3-API-003 — Four-route API contract evidence

Status: PASS

Story: `CF-P3-006`

The isolated classifier recognizes only:

- `POST /api/v1/oauth/github/transactions`;
- `GET /api/v1/oauth/github/callback`;
- `GET /api/v1/session`;
- `POST /api/v1/session/logout`.

Trailing slashes, unknown and business paths, unexpected query strings, wrong methods, and preflight are denied before session or D1 work. Public sign-in requires exact Origin and JSON. Reauthentication and logout additionally require a live session and its current CSRF token. Session read is optional-auth and returns a token only for a live session. Callback remains GET and relies on the frozen single-use state/PKCE transaction.

The existing deployed shell remains disabled and persistence-unreachable, so this evidence does not claim identity activation.
