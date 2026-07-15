# CF-EV-P1-OPS-003 — Disabled main-branch deployment

Status: PENDING DEPLOYMENT

Date: 2026-07-16

Story: `CF-P1-008`

Required result: the main-branch GitHub Actions and Cloudflare Pages deployments pass the complete gate, production retains `COLLABORATION_ENABLED=false`, the canonical API returns sanitized JSON `503 COLLABORATION_UNAVAILABLE` with `no-store`, and neither origin regresses guest fallback.

Traceability: `CF-OPS-001–004`, `CF-FB-001/002`, `R15/R17/R18/R22`.
