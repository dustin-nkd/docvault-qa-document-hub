# CF-EV-P1-STA-003 — CI, action pin, and compatibility lifecycle evidence

Status: PASS locally; retained deployment evidence pending

Date: 2026-07-15

Story: `CF-P1-002`

Owner: Operations

Reviewer: Senior QA and Security Reviewer

## Claims

- CI installs dependencies only with `npm ci` and explicitly runs the toolchain policy.
- Checkout, Node setup, and GitHub Pages deployment actions are pinned to reviewed 40-character commit SHAs.
- Official checkout and setup actions use v6, removing the Node 20 action-runtime deprecation observed in the preceding pipeline.
- CI remains on Node major 22.
- Compatibility date `2026-07-15`, review owner, and next review `2026-10-15` are machine-enforced.
- No configuration file, Pages Function, remote D1, OAuth material, collaboration route, or feature activation is introduced by this story.

The retained CI record must include clean install, toolchain version output, all policy/regression results, build artifact, browser regression, GitHub Pages deployment, Cloudflare Pages deployment, and both production-origin smoke checks.

Traceability: `CF-OPS-002/003`, `CF-NFR-002`, `R19`, `T20`, and `CF-EV-P1-STA-001/002`.
