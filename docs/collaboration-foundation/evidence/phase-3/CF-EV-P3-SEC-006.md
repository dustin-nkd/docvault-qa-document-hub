# CF-EV-P3-SEC-006 — Origin, CSRF, CORS, and isolation security evidence

Status: PASS

Story: `CF-P3-006`

Hostile-request tests reject missing, `null`, suffix-lookalike, subdomain, unexpected-port, HTTP-scheme, and production/preview crossover origins before session lookup. Tests also reject missing, malformed, previous-key, and cross-session CSRF proofs after confirming the live-session boundary, preserving the frozen exact-Origin → live-session → CSRF order without updating session activity for a rejected proof.

Normal identity responses are `Cache-Control: no-store, private`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, CSP-restricted, and `nosniff`. No CORS allow-origin or credentials header is emitted; `OPTIONS` is method-denied. The existing Service Worker continues to bypass `/api/*` before cache lookup or navigation fallback.

The policy contains no request-scoped global state, secret logging, provider network call, Cloudflare REST call, pass-through-on-exception, or production bypass. Business routes remain at the disabled boundary with zero new D1 authority.
