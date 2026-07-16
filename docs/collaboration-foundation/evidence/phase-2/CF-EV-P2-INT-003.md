# CF-EV-P2-INT-003 Atomic D1 batch rollback evidence

Status: PASS

Story: `CF-P2-004`

Gate authorization: `P2-G2` `APPROVED`

The disposable local D1 integration suite executes the required `guard -> domain -> audit -> result` topology against the production migration set. A successful batch produces one idempotency row, one domain row, one audit row, and one explicitly mapped deterministic result.

Fault injection independently fails the guard, domain, audit, and result positions. After every failure, direct table snapshots prove that mutation/idempotency, document-domain, and audit side effects are all zero. No remote D1 resource was created, bound, queried, or migrated.
