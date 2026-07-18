# Phase 4 atomic workspace bootstrap

Status: PASS

Story: `CF-P4-002`

Gate: `P4-G1` APPROVED

Workspace bootstrap is implemented as one D1 batch with five ordered positions: transition guard, workspace, active Owner membership, `workspace.created` audit event, and deterministic result. Any failed position rolls back every preceding write. Identical concurrent retries converge on the stored result; distinct requests racing for one workspace have exactly one winner.

The workspace stores `current_key_version = 1` only as the approved initial placeholder. CF-P4-002 creates no `workspace_key_versions` or `workspace_key_envelopes` record. Device/key creation and usable encryption readiness remain explicitly deferred to Phase 5.

The service validates lowercase UUIDv4 identifiers, a trimmed 1–80 code-point display name without control characters, an optional bounded encrypted description, a 32-byte request fingerprint, and monotonic safe server timestamps. Role, membership state, key placeholder, result shape, and audit event family are server-owned constants.

No HTTP route imports the bootstrap service. No migration, Wrangler binding, remote D1 write, preview business route, production identity activation, or collaboration activation was added. The implementation is local-only and remains unreachable until a separately approved route story.

Workers tests prove deterministic replay, one-winner races, rollback on audit conflict, input rejection before D1 effects, revoked-device denial, exactly one active Owner, exactly one audit event, and absence of Phase 5 key material.

Next decision: `P4-G2` may authorize `CF-P4-003` only.
