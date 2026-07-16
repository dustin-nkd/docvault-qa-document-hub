# CF-EV-P3-SEC-001 — Identity/session threat and disclosure review

Status: PASS

Story: `CF-P3-001`

Date: 2026-07-16

Owner: Security Reviewer

Reviewer: Senior QA, Technical Lead, Privacy Reviewer

## Claim

The frozen profile maps T01–T03 and R01/R02/R15/R16/R17/R20/R21/R22 to explicit preventive, detective, recovery, and executable-evidence controls. It introduces no production identity authority and no secret, token, raw IP, or customer data exposure.

## Security review

- OAuth uses 256-bit state, PKCE S256, exact preview callback, numeric GitHub subject, domain-separated HMAC, versioned AES-256-GCM transaction context, one-use compare-and-set, and atomic session creation.
- GitHub access tokens remain request-memory only and are discarded after `GET /user`.
- Safe return paths reject external/network paths, fragments, backslashes, controls, malformed encoding, and OAuth/capability query names.
- Sessions use 256-bit opaque cookies, HMAC digest-only D1 storage, `__Host-` cookie rules, idle/absolute expiry, revocation, rotation, and recent authentication.
- CSRF uses exact Origin and an independently keyed session-bound synchronizer token verified with Web Crypto.
- Preview requires a dedicated branch, origin, OAuth app, D1, secrets, and cookie; production and GitHub Pages remain identity-absent.
- Rate control stores no raw IP: a window-scoped HMAC supports the exact future D1 window, while the Cloudflare binding shields bursts.
- Error and log allow-lists prohibit provider details, bodies, query values, cookies, state/verifier, token/digest, CSRF, IP/digest, SQL, stack, and display identity fields.
- Provider timeout/retry rules never retry token exchange and never downgrade authentication during outage.

## Negative boundaries

The machine contract rejects premature authorization, any remote write, runtime/schema change, enabled identity/collaboration/business route, production D1/secret, unknown route, widened key inventory, weaker cookie/session/CSRF values, unsupported rate period assumptions, missing traceability, or evidence drift.

## Residual work

This is contract evidence, not fabricated runtime evidence. Crypto vectors, OAuth races, callback batches, session rotation/revocation, hostile Origin/CSRF, rate-window concurrency, provider outage, browser behavior, and preview isolation remain blocking stories `CF-P3-002` through `CF-P3-009`.

## Result

Security and Privacy recommend Gate P3-G1 approval for local `CF-P3-002` only. Preview provisioning remains blocked until P3-G4 and collaboration activation remains NO-GO.
