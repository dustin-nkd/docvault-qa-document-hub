# CF-EV-P2-INT-002 Tenant and constraint integrity

Status: PASS

Story: `CF-P2-003`

Gate: `P2-G2` `APPROVED` on 2026-07-16 for `CF-P2-004`

The local-only Workers D1 suite applies all nine immutable/forward migrations, enables foreign keys, seeds two isolated workspaces, and proves cross-workspace document/revision, key, envelope, invitation replacement, actor, and retention relations fail closed. Foreign-tenant and absent document lookups are indistinguishable no-row results.

The positive/negative matrix covers identity, session, workspace, invitation, device, key version, key envelope, document revision, idempotency, audit, and retention-hold constraints. Version gaps, fingerprint substitution, invalid algorithms, lengths, lifecycle states, timestamps, duplicates, and missing references are rejected.

No remote D1 resource was created, bound, queried, or migrated. Collaboration remains disabled.
