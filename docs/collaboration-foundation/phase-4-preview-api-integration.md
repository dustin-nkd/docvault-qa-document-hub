# Phase 4 Preview API integration

Status: PASS

Story: `CF-P4-007`
Authorization: `P4-G6`

CF-P4-007 exposes the already reviewed Phase 4 control-plane services only on the isolated Preview origin. It does not activate collaboration through the production flag: Preview eligibility still requires the approved `preview-only` identity runtime, exact Preview origin, D1, and all identity secrets. Cursor keys are domain-separated from the active CSRF key with HKDF, so no project-wide secret is added. Production Cloudflare Pages and the GitHub Pages fallback continue through the disabled API shell.

The integration includes eleven operations for workspace bootstrap, membership reads and administration, ownership transfer, invitation lifecycle, and privacy-safe audit reads. Document CRUD, key distribution, encrypted payloads, export, sync, and Phase 5 cryptographic routes remain outside the route table.

Mutations require an authenticated server-side session, exact Origin, session-bound CSRF token, active device identifier where the domain operation requires one, and a UUID idempotency key. JSON and query parsing are bounded and strict. Workspace identifiers are derived server-side with HMAC from the actor/device/idempotency scope so retries converge on the same atomic domain recipe without making identifiers predictable to the caller.

Member and invitation cursors are opaque, signed, expiring, route-bound, environment-bound, and workspace-bound. Audit pagination retains its stronger filter-bound cursor. All authority is reloaded from D1 in the domain service; cursor possession never grants access.

Dedicated Workers tests prove the disabled production boundary, request-policy rejection, method-aware routing, stable workspace replay, member pagination, invitation bootstrap and single-use acceptance, and invitation revocation against disposable local D1. The complete Workers and repository regression gates remain mandatory.

Next decision: `P4-G7` may authorize `CF-P4-008` only — assemble Phase 4 exit evidence and the Phase 5 handoff.
