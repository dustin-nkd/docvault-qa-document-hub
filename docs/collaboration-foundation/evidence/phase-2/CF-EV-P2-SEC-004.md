# CF-EV-P2-SEC-004 Persistence isolation and fail-closed evidence

Status: PASS

Story: `CF-P2-004`

Gate authorization: `P2-G2` `APPROVED`

Guarded batches require the idempotency guard first, at least one domain statement, exactly one audit statement, and a final one-row result. Every write result requires complete metadata and the exact positive changed-row count. Constraint and malformed-result failures translate to stable codes without returning SQL or provider details.

The production `/api/v1/*` dispatcher has no persistence import, D1 binding, or storage reference and remains `503 COLLABORATION_UNAVAILABLE`. Wrangler contains no remote D1 binding, collaboration is false in every environment, and all persistence verification is local-only.
