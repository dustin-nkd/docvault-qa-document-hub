# CF-EV-P1-STA-006 — Production artifact isolation

Status: PASS

Date: 2026-07-16

Story: `CF-P1-008`

Result: The final `_site` allowlist contains 50 runtime entries including `.nojekyll`, totals 1,887,978 bytes, and emits a SHA-256 manifest outside the artifact. Server source, Wrangler state, test/fixture adapters, local D1/migrations, configuration, evidence, TypeScript, SQL/database files, symbolic links, and protected secret/test markers fail the build.

Verification: positive artifact construction and negative path/content/route mutation tests passed; `build:pages` and `check:deployment-boundary` passed.

Traceability: `CF-ISO-005`, `CF-OPS-002/003`, `R15/R17/R18/R19`.
