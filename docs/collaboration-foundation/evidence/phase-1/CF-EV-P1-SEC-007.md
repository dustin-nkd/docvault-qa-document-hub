# CF-EV-P1-SEC-007 — Remote access and privacy denial

Status: PASS

Date: 2026-07-15

Story: `CF-P1-007`

Result: The test plugin sets `remoteBindings=false`, `d1Persist=false`, and uses a local-only `COLLAB_DB` without any database ID. Global outbound fetch is intercepted locally and returns `599 OUTBOUND_NETWORK_BLOCKED`; the test proves a Cloudflare API-shaped URL cannot leave workerd. Production Wrangler remains free of D1 configuration. A session privacy canary caused no D1 or console record.

Verification: Workers network/privacy cases and all three static harness security policies passed. Production deployment `225a0e5c-b9a8-445f-a137-68d16be918e8` retained `COLLABORATION_ENABLED=false`, the reviewed environment-only variables, and no D1 binding. Canonical API smoke returned sanitized JSON `503`, `no-store`, and a Web Crypto request ID; GitHub fallback exposed no API.

Traceability: `CF-OPS-002/003`, `R17/R18`.
