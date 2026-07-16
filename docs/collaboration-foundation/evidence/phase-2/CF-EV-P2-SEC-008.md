# CF-EV-P2-SEC-008 — Restore invariant and environment isolation review

Status: PASS

Story: `CF-P2-008` | Gate: `P2-G4` APPROVED on 2026-07-16

The restored disposable fixture preserved workspace ownership, active owner membership, device-bound key version and envelope references, document revision continuity, idempotency uniqueness, audit sequence ordering, and exact encrypted payload bytes and digests. The post-baseline revision and audit mutation were absent after restore, and the final foreign-key check was empty.

Only bookmark fingerprints are retained in repository evidence. Restore attempts against shared preview and production were zero, production has no D1 binding, real user data was prohibited, and collaboration remains disabled. Any invariant mismatch is a hard abort that keeps the feature off; the undo bookmark applies only to the disposable recovery database.
