# CF-EV-P3-SEC-007 — Abuse and privacy security evidence

Status: PASS

Story: `CF-P3-007`

Rate keys are window-scoped HMAC-SHA256 digests derived from the dedicated rate key. Raw IP, user identifier, binding key, and digest are excluded from logs. Binding failure, D1 failure, malformed inputs, and capacity exhaustion fail closed with the non-enumerating `RATE_LIMITED` code and bounded `Retry-After` value.
