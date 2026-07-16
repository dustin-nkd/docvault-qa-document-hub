# CF-EV-P3-SEC-005 — Session fixation, revocation, and privacy evidence

Status: PASS

Story: `CF-P3-005`

Date: 2026-07-16

Revoked, idle-expired, deactivated-user, malformed-cookie, and cross-environment sessions grant no authority. Previous-pepper matches rotate forward with checked predecessor revocation; security and fixation rotations use the same rollback-enforced batch. Logout revokes D1 before cookie expiry, and persistence failure returns no misleading logout success.

No raw session token, cookie, digest, provider subject, login, or injected canary is logged or placed in evidence. Routes, migrations, bindings, secrets, OAuth applications, preview identity, production identity, collaboration, and remote writes remain unchanged.
