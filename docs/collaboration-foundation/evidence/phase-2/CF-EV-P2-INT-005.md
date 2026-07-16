# CF-EV-P2-INT-005 Security mutation race and rollback evidence

Status: PASS

Story: `CF-P2-005` | Gate: `P2-G2A` APPROVED

All seven approved prepared-statement recipes are present. Local-only Workers tests race last-Owner policy, invitation acceptance, duplicate mutation IDs, envelope uniqueness, document revision CAS, and key-version commit. Exactly one winner is allowed where valid; stale competitors leave no partial guard, membership, envelope, revision, key-version, or audit side effect.

The CF-P2-004 every-position batch rollback suite remains mandatory in the same release gate. No remote D1 is used.
