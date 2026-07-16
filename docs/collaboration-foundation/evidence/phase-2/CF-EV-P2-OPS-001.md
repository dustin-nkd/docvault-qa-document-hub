# CF-EV-P2-OPS-001 — Isolated preview D1 provisioning

Status: PASS

Story: `CF-P2-007` | Gate: `P2-G3` APPROVED on 2026-07-16

The authenticated Cloudflare API created exactly one database named `docvault-collab-preview` after a zero-match preflight. The reviewed identifier is allow-listed by `config/cloudflare/phase-2-preview-d1.json` and the exact `wrangler.jsonc` preview binding. A dashboard-only binding was correctly rejected after Git deployment proved it non-persistent; `env.preview.d1_databases` is now the reviewed source of truth. Production has no binding. Wrangler CLI authentication was unavailable and failed closed; no temporary account or unreviewed credential path was used.
