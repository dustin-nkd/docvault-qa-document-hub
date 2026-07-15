# CF-EV-P1-OPS-004 — Non-destructive rollback rehearsal

Status: PASS

Date: 2026-07-16

Story: `CF-P1-008`

Result: The read-only rehearsal selected prior compatible commit `10c4e657a19fb22ba5f2ba46a1cd36a5a10b8298` and Cloudflare deployment `2379fd92-420b-4805-b1de-78f3295a8722`. The prior commit retains lockfile v3/Wrangler 4.111.0, exact `/api/v1/*` routing, no D1/remote resource, and collaboration disabled in all environments. No checkout, database operation, deployment mutation, or rollback occurred.

Operations verification: Cloudflare API confirmed the pinned deployment remains a successful production deployment after the implementation deploy. Full-history QA verified all pinned source objects and fingerprints; managed-build clones use the same locked fingerprints only when any reviewed historical path object is unavailable. No production mutation occurred.

Traceability: `CF-OPS-003/004`, `R15/R18/R22`.
