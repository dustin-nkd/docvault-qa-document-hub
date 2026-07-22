# CF-P5-006 — Monotonic Rotation and No-Escrow Recovery

Status: PASS

Gate `P5-G2C` authorized the story and conditional Gate `P5-G2C-M` explicitly authorized local forward-only additive migration 12. No remote D1 apply, route, binding, secret, Preview deployment, production identity, or collaboration activation occurred.

Migration 12 adds `workspace_key_rotations` and immutable `workspace_key_rotation_targets`. A partial unique index permits one preparing rotation. Database triggers enforce Owner/current-envelope start authority, exact active-device snapshot bindings, staged-envelope scope, append-only rotation history, and complete live snapshot validation before the workspace current key can advance.

The service starts exactly `current+1`, lists the immutable snapshot, stages bound envelopes idempotently, resumes interrupted work, commits atomically, and aborts without changing the current version. If authority changes, commit raises inside the D1 transaction and rolls back every version/workspace write. An aborted attempt may restart at the same `n+1`; only revoked staged envelopes from that aborted version are cleared, preventing gaps or downgrade.

Alternate recovery is normal provisioning by another active key-ready Owner/Admin device. If none remains, the typed state is `terminal_cryptographic_loss`. There is no server reset, escrow, exported recovery artifact, operator override, plaintext key field, or recovery endpoint. D1 restore recovers ciphertext and metadata only and never proves DEK/private-key recovery.

Nine Workers/D1 cases cover twenty concurrent proposals, immutable snapshot, replay, interruption/resume, complete atomic commit, historical envelopes, stale-version denial, changed-snapshot rollback, abort/restart, alternate Admin provisioning, terminal loss, privacy canaries, and local-only boundaries. No HTTP route imports the rotation service.

Gate recommendation: approve `P5-G3` for `CF-P5-007` local integration preparation only. Any remote Preview D1 apply or deployment still requires explicit `P5-G4`.
