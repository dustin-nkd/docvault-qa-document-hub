# CF-EV-P4-UT-001 Central RBAC matrix

Status: PASS

Story: `CF-P4-003`

Gate: `P4-G2`

Local Workers Vitest evaluates every one of the 18 actions for every active Owner, Admin, Editor, and Viewer role, then repeats all actions for every role in `pending_key`. Removed, non-member, guest, and unauthenticated principals are negative controls. Target-ceiling, recent-authentication, last-Owner, device, key-readiness, lifecycle, and resource-scope cases are independently asserted.
