# CF-EV-P4-SEC-001 — Control-plane deny-by-default boundary

Status: PASS

Story: `CF-P4-001`

Client actor, role, workspace, ownership, and time are untrusted. Pending, removed, revoked, guest, and unauthenticated states grant no protected authority. Raw invitation tokens, keys, plaintext, and personal-vault credentials are out of scope and prohibited from server storage or logs.
