# CF-EV-P3-API-002 — Session lifecycle interface evidence

Status: PASS

Story: `CF-P3-005`

Date: 2026-07-16

The isolated session interface returns either a validated server-side identity projection or one uniform unauthenticated result. It exposes recent-authentication state without refreshing it on ordinary activity, issues a successor cookie only after an atomic rotation, and returns a logout expiry cookie only after successful revocation or a confirmed invalid session.

No HTTP route invokes this interface yet. The existing four-route scope, production disabled response, and GitHub Pages fallback are unchanged.
