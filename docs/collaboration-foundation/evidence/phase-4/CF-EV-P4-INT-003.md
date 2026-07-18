# CF-EV-P4-INT-003 Invitation D1 lifecycle integration

Status: PASS

Story: `CF-P4-004`

Gate: `P4-G3`

Disposable Workers D1 proves create/replay, duplicate replacement, pending-list, bounded bootstrap, revoke, concurrent single-use acceptance, and removed-member rejoin. Each successful security mutation commits its ledger/transition guard, invitation or membership transition, and exactly one allow-listed audit event together. Acceptance produces `pending_key` and zero key envelopes.

