# CF-EV-P1-OPS-003 — Disabled main-branch deployment

Status: PASS

Date: 2026-07-16

Story: `CF-P1-008`

Result: GitHub Actions run `29436208626` passed the complete check, artifact-boundary, browser, and deployment sequence for commit `06395b4316f5f709d5706e925f151f36c98faa91`. Cloudflare deployment `ffe6ce47-05ad-4e3d-8f73-28bfae7bab4f` passed build and deploy with `COLLABORATION_ENABLED=false`. The canonical API returned sanitized JSON `503 COLLABORATION_UNAVAILABLE` with `Cache-Control: no-store`; both origins retained guest access.

Fail-closed observation: deployment `b64fbe72-c56f-4271-b768-8360a3cc0ff6` rejected the preceding commit at its test gate and never entered deploy, leaving the previous successful production deployment active. The managed-clone compatibility regression was fixed and locked by an explicit missing-path test before the successful deployment.

Traceability: `CF-OPS-001–004`, `CF-FB-001/002`, `R15/R17/R18/R22`.
