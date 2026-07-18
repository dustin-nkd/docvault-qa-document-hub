# Phase 4 workspace, invitation, and RBAC contract

Status: PASS

Story: `CF-P4-001`

The API derives actor, role, membership state, workspace scope, and server time from the live session and D1. Every unspecified action denies. Owner may manage all approved control-plane actions; Admin may invite/manage only Editor and Viewer; Editor and Viewer cannot administer membership. `pending_key`, removed, revoked-device, unauthenticated, and guest principals deny protected actions.

Workspace bootstrap is one atomic batch: workspace, creator Owner membership, initial key-version placeholder, and exactly one audit event. The final Owner may not be removed or downgraded. Invitations use a 256-bit CSPRNG token stored only as a hash, are subject-bound, expire after 72 hours, are single-use/revocable, and accept into `pending_key`; delivery is manual out-of-band.

No route, migration, remote mutation, production identity, collaboration activation, document route, device key, envelope, export, hard delete, or UI is authorized by this contract.
