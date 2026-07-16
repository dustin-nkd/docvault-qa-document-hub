# CF-EV-P2-SEC-007 — Preview isolation and disabled runtime

Status: PASS

Story: `CF-P2-007` | Gate: `P2-G3` APPROVED on 2026-07-16

The reviewed Wrangler config declares `COLLAB_DB` only under `env.preview`; top-level and production D1 bindings are prohibited by policy and negative tests. Collaboration remains the exact string `false` in local, preview, and production. The deployed preview versioned session route returns `503 COLLABORATION_UNAVAILABLE`, `no-store, private`, and a server request ID before business dispatch. The preview database still contains no entity data or privacy canary match. No authentication material or protected value is recorded in evidence.
