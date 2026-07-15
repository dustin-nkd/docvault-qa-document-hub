# Phase 1 Cloudflare toolchain control

Status: `CF-P1-002` complete; local, CI, and deployment evidence passed

Date: 2026-07-15

Owner: Technical Lead

Reviewers: Operations, Security Reviewer, and Senior QA

## Purpose

This control makes every Phase 1 Cloudflare build, type, test, and local-development command resolve from the committed npm lockfile. It prevents an operator or CI job from downloading a floating Wrangler, TypeScript, or Vitest CLI and establishes the compatibility-date review lifecycle before a Wrangler configuration or Pages Function exists.

The machine-readable policy is [`config/cloudflare/toolchain.json`](../../config/cloudflare/toolchain.json).

## Locked baseline

| Component | Exact version or policy |
|---|---|
| Node.js in CI | Major 22 |
| Wrangler | `4.111.0` |
| TypeScript | `7.0.2` |
| Vitest | `4.1.10` |
| Workers Vitest pool | `0.18.5` |
| Node.js type definitions | `22.20.1` |
| Compatibility date | `2026-07-15` |
| Review owner | Technical Lead and Operations |
| Next quarterly review | `2026-10-15` |

All five packages use exact `devDependencies` and exact lockfile root entries. Wrangler also resolves to the same version required by the Workers Vitest pool. Node type definitions match the CI major. The selected packages support Node 22 and the current local Node 24 environment.

## Approved commands

| Command | Purpose | Current Phase 1 behavior |
|---|---|---|
| `npm run cf:toolchain:check` | Verify manifest, lockfile, installed packages, local Wrangler version, commands, CI, actions, date, and review owner | Active and release-blocking |
| `npm run cf:config:check` | Validate project, output, compatibility, environment isolation, and disabled Collaboration in `wrangler.jsonc` | Active release gate |
| `npm run cf:types:generate` | Generate `worker-configuration.d.ts` from the reviewed config | Active deterministic generator |
| `npm run cf:types:check` | Verify generated binding/runtime types without rewriting them | Active release gate |
| `npm run cf:pages:dev` | Build `_site` and run Pages locally with repository-local persistence | Fails closed until config and Functions exist |
| `npm run cf:test` | Run the Workers Vitest pool | Fails closed until `CF-P1-007` supplies the test config |
| `npm run cf:functions:build` | Compile Pages Functions locally into `.wrangler/functions-build` | Fails closed until Functions exist |
| `npm run cf:pages:dry-run` | Build `_site` and compile/inspect Functions without a deployment command | Fails closed until config and Functions exist |

The command dispatcher launches package entrypoints with the current Node executable. It does not depend on a global executable, PowerShell, Bash, shell interpolation, or secret arguments. Generated `.wrangler` state is ignored by Git.

No approved command contains `npx`, `latest`, `npm install`, a remote database command, a deployment command, a secret command, or an account/resource identifier. CI remains `npm ci` only.

## CI and supply-chain controls

- `actions/checkout` and `actions/setup-node` use reviewed v6 commit SHAs and execute on the current action runtime instead of the deprecated Node 20 action runtime.
- `peaceiris/actions-gh-pages` uses a reviewed v4 commit SHA.
- The workflow runs `npm run cf:toolchain:check` immediately after `npm ci`.
- `npm run check` independently validates the same policy, so removing the explicit workflow step does not silently remove enforcement.
- Cloudflare commands resolve only the locked local packages. `CF-P1-003` introduced the reviewed configuration after the `CF-P1-001` baseline and this pinned toolchain were verified.

## Compatibility-date lifecycle

The implementation date `2026-07-15` is pinned before runtime code is created. Technical Lead and Operations review it on or before `2026-10-15`, then quarterly. A review is an explicit pull-request change that includes current Cloudflare changelog/config-schema review, generated-type diff, local Functions build, Workers integration suite, security/regression baseline, preview evidence, and rollback readiness. The date never advances automatically.

An expired review date blocks a production promotion but does not authorize an emergency date change. Runtime behavior remains on the last verified date until the controlled review passes.

## Upgrade procedure

1. Confirm Node engine and peer-dependency compatibility from the registry and current Cloudflare documentation.
2. Change all affected exact versions in one reviewed update using `npm install --save-dev --save-exact`.
3. Inspect the lockfile and resolved local versions; reject duplicated incompatible Wrangler/Vitest versions.
4. Run the toolchain policy, generated-type check, local Functions build, Workers tests, full product regression, audit, and artifact scan.
5. Validate an isolated preview before production. Do not combine a toolchain upgrade with a D1 migration, compatibility-date advance, or feature enablement.
6. Retain versions, lockfile digest, evidence, rollback target, and reviewer decisions.

## Rollback

Revert the toolchain/config commit and run a clean `npm ci` from the preceding lockfile. Verify the local Wrangler version, rebuild the exact preceding artifact, and run all affected suites. Do not install a global or floating CLI to recover. If a deployment already occurred, keep Collaboration disabled and use the Pages rollback procedure from [`phase-1-pages-configuration.md`](phase-1-pages-configuration.md).

## Evidence and traceability

- `CF-EV-P1-STA-001`: exact manifest, lockfile, installed version, engine, peer, audit, and clean-install evidence.
- `CF-EV-P1-STA-002`: cross-platform local dispatcher and command-policy negative evidence.
- `CF-EV-P1-STA-003`: pinned action, `npm ci`, compatibility-date, quarterly-owner, CI, and deployment evidence.
- Requirements: `CF-OPS-002`, `CF-OPS-003`, `CF-NFR-002`.
- Risk: `R19`; threat: `T20`.

Official references: [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/) and [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
