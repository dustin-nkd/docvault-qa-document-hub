# CF-EV-P1-STA-005 — Production import graph and compiled artifact exclusion

Status: PASS

Date: 2026-07-15

Story: `CF-P1-006`

Result: The source graph from `functions/api/v1/[[path]].ts` contains exactly the route, API shell, and platform dependency module. Policy tests reject test/spec/fixture/mock paths, imports outside `functions/`, missing modules, runtime test selectors, explicit `any`, unsafe double casts, TypeScript suppressions, direct secret comparisons, module-level mutable state, and non-platform handler wiring.

Both Wrangler Functions build and Pages dry-run compiled successfully. Metafile/bundle inspection found no test input, deterministic helper, fixture token, injected-failure text, mock OAuth marker, fixed token, test/fault flag, remote binding, or secret. Static `_site` retained 49 allow-listed runtime files and excluded all server/test/config source.

Traceability: `CF-OPS-005`, `R16/R19`, `T16/T19/T20`.
