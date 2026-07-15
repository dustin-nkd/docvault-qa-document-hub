# CF-EV-P1-API-007 — Exact-origin environment matrix

Status: PASS

Date: 2026-07-15

Story: `CF-P1-005`

Result: Unit tests, local workerd, and canonical production smoke prove that a mutation reaches the disabled `503 COLLABORATION_UNAVAILABLE` response only when request and `Origin` exactly match the approved environment origin. Missing, `null`, foreign, scheme-changed, non-default-port, suffix-confusion, path-confusion, preview/production crossover, and invalid environment-host combinations return `403 CSRF_REJECTED` before malformed JSON is read. Equivalent URL casing/default-port normalization remains accepted. No response reflects an origin or emits CORS permission.

Production: implementation commit `51e9e32`; Cloudflare deployment `5e605899-a046-4e1a-924e-7134a0651a6a`. The complete hostile-origin matrix was repeated after deployment success and passed.

Traceability: `CF-SES-003`, `CF-OPS-001`, `R01/R13/R17`, `T01/T14/T21`.
