# CF-EV-P3-INT-003 — Session D1 race and rollback evidence

Status: PASS

Story: `CF-P3-005`

Date: 2026-07-16

Twelve disposable D1 tests cover lookup, coalesced touch, previous-pepper migration, manual rotation, logout, recent authentication, and retention. Concurrent rotation produces exactly one valid successor. A real unique-digest conflict rolls predecessor revocation back, and an injected pre-batch fault creates no successor or revocation.

Touch races perform at most one bounded reread and accept only the still-live row. Terminal purge reuses the Phase 2 governed retention boundary and respects its per-type row cap.
