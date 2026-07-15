# CF-EV-P1-API-001 — Disabled unavailable contract

Status: PASS

Date: 2026-07-15

Story: `CF-P1-004`

Result: A valid `GET /api/v1/session` returns `503 COLLABORATION_UNAVAILABLE` in the v1 JSON envelope with matching server-generated body/header request IDs, `no-store, private`, `nosniff`, and approved restrictive security headers. Tampering the feature value does not enable dispatch.

Traceability: `CF-OPS-004/005`, `CF-SES-004`, `T16/T23`.
