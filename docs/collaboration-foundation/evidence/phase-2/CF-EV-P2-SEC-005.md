# CF-EV-P2-SEC-005 Pre-membership guard and runtime isolation evidence

Status: PASS

Story: `CF-P2-005` | Gate: `P2-G2A` APPROVED

Forward-only migration 0008 adds the dedicated immutable transition guard required for workspace creation and invitation acceptance. Database triggers bind active user/device authority and exact invitation subject, digest, state, workspace, and expiry. Raw credentials and protected document content are absent.

Source policy prohibits SQL interpolation, `SELECT *`, unsafe casts, unconstrained sessions, API persistence imports, remote bindings, and activation. Production remains `503 COLLABORATION_UNAVAILABLE`; all evidence is local-only.
