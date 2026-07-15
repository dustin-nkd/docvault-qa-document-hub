# CF-EV-P1-SEC-002 — Disabled and isolated Wrangler configuration

Status: PASS

Date: 2026-07-15

Story: `CF-P1-003`

Owner: Security Reviewer

Reviewer: Senior QA

## Claims

- Local, preview, and production repeat the complete non-secret variable set.
- Preview and production environment/policy identities cannot be equal.
- Production and preview accept only the exact disabled string.
- Missing, Boolean, enabled, case-changed, numeric, and malformed collaboration values fail.
- Unknown environments, incomplete vars, remote binding keys, account/database identifiers, secret-shaped fields, UUIDs, 32-hex identifiers, and placeholders fail.
- Generated types contain no future D1, OAuth, session, signing, or other protected binding.
- Wrangler config, generated types, Cloudflare control files, scripts, tests, and documentation remain outside `_site`.

Focused policy suite: six positive/negative cases passed locally. No business route, authentication, session, D1, collaboration data, or UI exists, so configuration tampering cannot expose an enabled collaboration path in this story.

Retained deployment checks confirmed `nodejs_compat` plus exactly the four reviewed variable names in both preview and production. All reviewed remote binding inventories remained empty. Collaboration remained the exact string `false`; no Pages Function or collaboration route was deployed. Both production origins returned HTTP 200.

Privacy and side effects: all committed values are public operational labels or a canonical public origin. No secret, token, cookie, account/resource identifier, protected document data, or raw provider response is retained.

Traceability: `CF-OPS-002/003`, `CF-FB-002`, `R17/R18`, `T19/T20`, and `CF-EV-P1-STA-004/OPS-002`.
