# Phase 4 central RBAC policy

Status: PASS

Story: `CF-P4-003`

Gate: `P4-G2` APPROVED

The central `rbac-v1` policy implements 18 stable actions for Owner, Admin, Editor, and Viewer. Unknown actions and malformed policy state deny by default. Active membership is required for normal workspace actions. `pending_key` is restricted to its own readiness status and own-device setup; removed, non-member, guest, and unauthenticated principals receive no workspace authority.

Owner controls Admin grants/removal and strongly confirmed ownership transfer. Admin can manage only Editor and Viewer targets. Direct Owner assignment/removal is prohibited, and a mutation identified as removing the final Owner returns `LAST_OWNER_REQUIRED`. Ownership transfer and revoking another member's device require recent authentication. Export and workspace deletion remain explicitly unavailable.

Device-bound protected actions require an active acting device; encrypted document and envelope actions additionally require current key readiness. Other-workspace, missing, deleted, and malformed resource scopes map uniformly to `RESOURCE_NOT_FOUND` after authentication, preventing IDOR enumeration.

`authorizeWorkspaceAction` opens a `first-primary` D1 session and derives the current user status, exact workspace membership, role, membership state, acting-device state, and current envelope readiness in one bounded prepared query. It accepts no client role, membership, device ownership, key readiness, or cached authority. A role or device change applies on the next call.

No route imports this policy yet. No migration, binding, remote D1 write, Preview business route, production identity activation, or collaboration activation was added.

Next decision: `P4-G3` may authorize `CF-P4-004` only.
