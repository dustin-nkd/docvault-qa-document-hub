# CF-EV-P2-SEC-006 Privacy, hold, and disabled-runtime matrix

Status: PASS

Story: `CF-P2-006` | Gate: `P2-G2B` APPROVED

Protected canaries are absent from schema, visible D1 rows, fixtures outside test-only scope, sanitized errors, console output, exports, and the production artifact. Audit deletion remains denied by default and is allowed only during a bounded running purge whose 365-day cutoff is valid. Active legal/security/operational holds deny deletion; expired holds do not shorten the baseline.

The disabled new runtime on the immediately previous schema returns `503 COLLABORATION_UNAVAILABLE` without persistence. The disabled API cannot import or invoke purge code. No remote D1 exists, collaboration remains disabled, and there are zero P0/P1 exceptions or open regressions.
