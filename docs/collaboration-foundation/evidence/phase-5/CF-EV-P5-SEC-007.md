# CF-EV-P5-SEC-007 Preview key security

Status: PASS

Remote probes confirmed the isolated Preview boundary: an unauthenticated key read returned `401`, and a hostile-Origin mutation returned `403 CSRF_REJECTED`. Responses retained `Cache-Control: no-store, private` and the reviewed security headers. The equivalent Production route stayed fail-closed at `503 COLLABORATION_UNAVAILABLE`; the GitHub Pages fallback exposed no API route.

The successful browser journey used exact Origin, session-bound CSRF, idempotency keys, a registered device binding, canonical P-256 public material, and canonical encrypted envelopes. Both DEK unwrap checks occurred only in transient browser memory. Evidence scans retain no session cookie, CSRF token, provider identity, private device material, plaintext DEK, or envelope body.

The dependency audit initially identified four High advisories in the development-only `Wrangler -> Miniflare -> sharp` chain. An exact `sharp` 0.35.3 override removed the vulnerable libvips packages without changing the pinned Cloudflare toolchain; the complete Workers and browser suites passed afterward, and the final `npm audit` result is zero vulnerabilities.
