# CF-EV-P1-STA-004 — Pages config schema and generated types

Status: PASS

Date: 2026-07-15

Story: `CF-P1-003`

Owner: Technical Lead

Reviewer: Senior QA

## Claims and result

- Locked Wrangler `4.111.0` parsed and generated types from `wrangler.jsonc` successfully.
- Project, `./_site`, date, `nodejs_compat`, exact environments, and complete variable sets passed static policy.
- `npm run cf:types:check` reported the generated file current.
- Two generations were byte-identical at SHA-256 `75b0f748e5485122183d2ee8b2a9f723fce2af6c47060beab5d0b2f7a913dd68`.
- Generated `Env` contains only the four reviewed non-secret variables and no remote binding.
- `@types/node` `22.20.1` is exact and matches the Node 22 CI/runtime typing requirement emitted by Wrangler for `nodejs_compat`.
- Clean `npm ci` installed 161 locked packages, preserved lockfile SHA-256 `4b1648f2abec36023d3becc58237cabc62e76071de46bac9fcaef60d6c78cdb6`, and reported zero vulnerabilities.

Commands: `npm run cf:config:check`, `npm run cf:types:generate`, `npm run cf:types:check`, focused policy tests, full quality gate, production build, and browser regression.

Retained result: implementation commit `199f5a4f21a685751e0bb2bbd32e407f9d67ef83` passed GitHub Actions run `29428921300`, including clean install, pinned toolchain, config/type checks, 69 regression tests, production artifact checks, browser regression, and GitHub Pages deployment.

Side effects: local files and npm lockfile only. Type generation did not authenticate, call a Cloudflare mutation API, deploy, create a route, or create/bind a resource.

Traceability: `CF-OPS-002/003`, `CF-FB-002`, `R17/R18`, `T19/T20`.
