# CF-EV-P1-INT-005 — API side-effect and failure harness

Status: PASS

Date: 2026-07-15

Story: `CF-P1-007`

Result: Reusable helpers produce origin/session variants, deterministic request IDs, named failures, D1 before/after snapshots, and log captures. Disabled, hostile-origin, and injected-failure calls changed no D1 row. Hostile origins stopped before the failure checkpoint; injected failures returned sanitized `500 INTERNAL_ERROR`.

Verification: all three API integration cases passed in workerd.

Traceability: `CF-OPS-002/003`, `R06/R17`.
