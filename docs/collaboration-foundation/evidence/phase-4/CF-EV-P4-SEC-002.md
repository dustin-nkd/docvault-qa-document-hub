# CF-EV-P4-SEC-002 Workspace bootstrap security controls

Status: PASS

Story: `CF-P4-002`

Gate: `P4-G1`

The transition guard requires a verified active user and active owned device. Idempotency binds actor, device, workspace, operation, client mutation, and a constant-time compared 32-byte request fingerprint. Server-owned SQL fixes Owner role, active state, key placeholder, and audit family. Malformed identifiers, names, envelopes, fingerprints, and timestamps fail before D1 side effects. Local-only tests prove same-request replay and a single winner for distinct concurrent workspace-create attempts.
