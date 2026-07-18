# CF-EV-P4-QA-006 - Phase 4 quality matrix

Status: PASS

Story: `CF-P4-008`
Gate: `P4-G7`

The complete qualification passed 179 Node tests, 156 Workers/D1 tests, Functions typecheck, build and deployment artifact inspection, browser regression, rollback rehearsal, the Cloudflare policy chain, and `npm audit` with zero vulnerabilities. There are no skipped or quarantined P0/P1 cases, accepted flakes, disabled cases, open P0/P1 defects, or security exception lists.

The Preview API suite includes a real authenticated read baseline against disposable local D1: twenty member-list requests must remain below a 250 ms p95 budget. The read uses the production handler, session, CSRF/key derivation, RBAC, repository, cursor, and D1 paths; no timing seam or authentication bypass exists.
