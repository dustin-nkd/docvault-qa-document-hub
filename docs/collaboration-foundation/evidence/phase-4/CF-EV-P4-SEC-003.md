# CF-EV-P4-SEC-003 RBAC isolation and privilege ceilings

Status: PASS

Story: `CF-P4-003`

Gate: `P4-G2`

The policy denies unknown actions, Admin-to-Admin or Admin-to-Owner influence, direct Owner changes, final-Owner removal, stale/revoked device use, protected access before key readiness, and all ambiguous tenant/resource scopes. Export and deletion stay unavailable. The repository uses one parameterized, explicit-column, exact-workspace query through a `first-primary` session and does not trust client actor, role, state, device ownership, key readiness, or time.
