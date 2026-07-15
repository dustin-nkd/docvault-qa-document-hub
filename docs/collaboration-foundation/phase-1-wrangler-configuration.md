# Phase 1 reviewed Pages Wrangler configuration

Status: `CF-P1-003` implemented, deployed, and verified

Date: 2026-07-15

Owners: Technical Lead and Operations

Reviewers: Security Reviewer and Senior QA

## Purpose

This control moves the approved Cloudflare Pages runtime configuration from dashboard-managed fields to reviewed source control without adding a Pages Function, secret, remote resource, or collaboration route. It preserves the `CF-P1-001` project/output baseline, uses the `CF-P1-002` toolchain, and keeps Collaboration fail-closed in local, preview, and production environments.

The source of truth is [`wrangler.jsonc`](../../wrangler.jsonc). The generated binding and runtime contract is [`worker-configuration.d.ts`](../../worker-configuration.d.ts). The approved dashboard-to-Wrangler inventory is [`pages-wrangler-diff.json`](../../config/cloudflare/pages-wrangler-diff.json).

## Reviewed configuration

| Field | Value and rationale |
|---|---|
| Schema | Local pinned Wrangler schema in `node_modules` |
| Project | `docvault-qa-document-hub`, unchanged from the captured dashboard |
| Pages output | `./_site`, resolving to the captured `_site` directory |
| Compatibility date | `2026-07-15`, pinned by `CF-P1-002` |
| Compatibility flags | Only `nodejs_compat` |
| Environments | Top-level local plus Pages-supported `env.preview` and `env.production` only |
| Remote bindings | None |
| Secrets/resource identifiers | None |

### Complete non-secret variable sets

| Variable | Local | Preview | Production |
|---|---|---|---|
| `APP_ENV` | `local` | `preview` | `production` |
| `ORIGIN_POLICY_MODE` | `local` | `preview` | `production` |
| `CANONICAL_PRODUCTION_ORIGIN` | Canonical Pages origin | Canonical Pages origin | Canonical Pages origin |
| `COLLABORATION_ENABLED` | Exact string `false` | Exact string `false` | Exact string `false` |

`vars` is non-inheritable in Pages configuration. Each environment therefore repeats the complete four-variable set. `APP_ENV` and `ORIGIN_POLICY_MODE` must differ between preview and production. The canonical production origin is intentionally identical because it names one stable production destination, not a preview allow-list. Collaboration is intentionally identical and disabled everywhere.

The future runtime must compare `COLLABORATION_ENABLED` to the exact string `false` while Phase 1 is active. Missing, Boolean, case-changed, numeric, enabled, or otherwise malformed values fail policy validation. Even if configuration is tampered with, no business route exists in this story.

## Dashboard-to-Wrangler diff

Unchanged:

- project name, Git source, production branch `main`, build command, repository root, and `_site` output;
- compatibility date in preview and production;
- empty D1, KV, R2, Durable Object, service, queue, Analytics Engine, and Hyperdrive binding inventories.

Approved additions:

- `nodejs_compat` in preview and production;
- the four reviewed non-secret variable names in preview and production;
- the equivalent complete local variable set for `wrangler pages dev`.

There is no placeholder identifier. Adding an empty binding declaration is also prohibited because it could erase or replace a future live binding when Wrangler becomes the source of truth.

## Generated types

`npm run cf:types:generate` invokes the locked local Wrangler and writes both binding and runtime types. `npm run cf:types:check` regenerates in check mode and fails on any mismatch. The generated `Env` contract contains:

- literal unions for local, preview, and production environment/policy values;
- the exact canonical production origin;
- only the disabled collaboration literal;
- no `COLLAB_DB`, OAuth/session/key name, D1, KV, R2, or Durable Object binding.

The generated file uses a relative command marker, eliminating machine-specific paths. Two consecutive generations produced the same SHA-256 digest `75b0f748e5485122183d2ee8b2a9f723fce2af6c47060beab5d0b2f7a913dd68` on the local evidence environment.

## Validation and deployment gate

The release-blocking sequence is:

1. `npm run cf:toolchain:check`
2. `npm run check:cloudflare-config`
3. `npm run cf:config:check`
4. `npm run cf:types:check`
5. `npm run check`
6. `npm run build:pages`
7. `npm run test:e2e`

The quality gate verifies exact config keys and values, full non-inheritable variable sets, environment isolation, disabled production, schema/baseline/diff consistency, generated-type content, absence of remote bindings/placeholders, and exclusion of config/types from `_site`.

Pages Git integration built and deployed commit `199f5a4f21a685751e0bb2bbd32e407f9d67ef83`, but its native build did not consume the Wrangler file as a configuration deployment. The documented `wrangler pages deploy` opt-in was attempted after the full local gate and stopped before mutation because the non-interactive CLI had no API token. Operations then applied only the approved non-secret compatibility flag and variable values through the authenticated Pages API. A sanitized read confirmed the approved names and empty binding inventories in both environments. No secret or remote resource was created.

Future CLI configuration deployments must use the reviewed file and a least-privilege deployment credential. Until that credential is provisioned in a later operations story, the repository policy and the sanitized live read jointly enforce the approved state. Any deletion or unexpected field triggers rollback under [`phase-1-pages-configuration.md`](phase-1-pages-configuration.md).

## Rollback

Keep Collaboration disabled. Promote the preceding verified Pages deployment if static behavior or configuration is wrong. Revert the introducing commit, remove `wrangler.jsonc`, create a new deployment, and compare the restored live allow-list snapshot to the pre-Wrangler baseline. Cloudflare documents that the last deployed values remain while dashboard editing becomes available again after a deployment without the Wrangler file.

Do not delete the project, create a resource, add a placeholder identifier, or provision a secret during rollback.

## Evidence and traceability

- `CF-EV-P1-STA-004`: schema, config policy, generated types, reproducibility, artifact, and negative tests.
- `CF-EV-P1-OPS-002`: approved dashboard diff, first deployment, post-deployment snapshot, and rollback readiness.
- `CF-EV-P1-SEC-002`: exact-disabled, environment-isolation, binding/secret/identifier absence, and fail-closed evidence.
- Requirements: `CF-OPS-002`, `CF-OPS-003`, `CF-FB-002`.
- Risks: `R17`, `R18`; threats: `T19`, `T20`.

Official references: [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/) and [Wrangler-generated types](https://developers.cloudflare.com/workers/languages/typescript/#generate-types).
