# CF-EV-P3-UT-003 — Session policy and boundary evidence

Status: PASS

Story: `CF-P3-005`

Date: 2026-07-16

Workers-runtime tests lock the 12-hour idle, seven-day absolute, 15-minute recent-authentication, and five-minute last-seen coalescing boundaries. Activity never refreshes `authenticated_at`, rotation never extends the original absolute lifetime, and lookup uses at most two digest candidates, two reads, and one coalesced write.

Raw session values are accepted only at the cookie/service boundary. D1 lookup, touch, revoke, and rotation use 32-byte HMAC-SHA-256 digests.
