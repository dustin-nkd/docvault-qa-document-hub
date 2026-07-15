# Phase 1 Cloudflare Pages configuration control

Status: `CF-P1-001` implementation complete; awaiting retained pipeline evidence

Date: 2026-07-15

Owners: Operations and Technical Lead

Reviewers: Senior QA and Security Reviewer

## Purpose

This control captures the pre-Wrangler Cloudflare Pages state without storing secret values or platform resource identifiers. It defines the configuration ownership transition, the first-deployment preflight, and the rollback path required before `wrangler.jsonc` may become the Pages configuration source of truth.

The machine-readable baseline is [`config/cloudflare/pages-project-baseline.json`](../../config/cloudflare/pages-project-baseline.json). It was produced by an allow-list transform of the Cloudflare Pages project API response. The transform returned only approved scalar settings and sorted binding or environment-variable names; it did not return values.

## Captured current state

| Setting | Captured value |
|---|---|
| Project | `docvault-qa-document-hub` |
| Canonical Pages host | `docvault-qa-document-hub.pages.dev` |
| Production branch | `main` |
| Build command | `npm run check && npm run build:css && npm run build:pages` |
| Build output | `_site` |
| Root directory | Repository root |
| Deployment source | GitHub repository `dustin-nkd/docvault-qa-document-hub` |
| Production deployments | Enabled |
| Preview deployments | All branches |
| Deployment path policy | Include all; exclude none |
| Preview compatibility date | `2026-07-15` |
| Production compatibility date | `2026-07-15` |
| Compatibility flags | None |
| Environment-variable names | None |
| D1, KV, R2, Durable Object, service, queue, Analytics Engine, Hyperdrive bindings | None |

The capture contains no account identifier, remote database or namespace identifier, OAuth material, session material, API token, secret value, or protected product data.

## Configuration ownership transition

| Field | Before first Wrangler deployment | After reviewed Wrangler deployment | Control |
|---|---|---|---|
| Project name | Cloudflare project identity | `wrangler.jsonc` | Must remain `docvault-qa-document-hub` |
| Production branch and Git source | Cloudflare Git integration | Cloudflare Git integration | Must remain `main` and the approved repository |
| Build command and root directory | Cloudflare dashboard | Cloudflare build configuration | Must retain the captured command and repository root |
| Pages output directory | Cloudflare dashboard | `pages_build_output_dir` | Must resolve exactly to `_site` |
| Compatibility date and flags | Cloudflare dashboard | `wrangler.jsonc` | Explicit review required in both preview and production |
| Non-secret variables and bindings | Cloudflare dashboard | `wrangler.jsonc` | Exact environment-specific name comparison; additions and deletions block deployment |
| Secret values | Cloudflare dashboard secret store | Cloudflare secret store | Never committed or exported by this control |
| Remote resource identifiers | Cloudflare dashboard/restricted inventory | Restricted deployment configuration in a later gated phase | Prohibited in Phase 1 repository artifacts |

Cloudflare documents that a Pages Wrangler file becomes the source of truth for supported fields. Dashboard fields become view-only. Deleting that file and creating a new deployment returns editing control to the dashboard while retaining the last deployed values. Therefore ownership changes only through a reviewed deployment, never merely because a file exists on a branch.

## Automated assertion

`npm run check:cloudflare-config` validates the committed baseline and is also invoked by `npm run check`. It fails when:

- project name, canonical host, production branch, Git owner/repository, build command, root, or `_site` output drifts;
- deployments, preview policy, or path policy changes;
- either environment changes compatibility settings or a variable/binding name is added or removed;
- the document schema gains an unapproved field;
- a resource identifier, token, private key, or secret-shaped field is present.

An operator can validate a fresh, separately sanitized capture before deployment:

```text
npm run check:cloudflare-config -- --candidate <sanitized-snapshot.json>
```

The candidate must use the exact allow-list schema in the baseline. A raw API response must never be passed to the checker or saved in the repository.

## First Wrangler deployment preflight

The Operations owner must complete every step before merging the first `wrangler.jsonc` containing `pages_build_output_dir`:

1. Re-capture the live project through the same allow-list transform and run the candidate check. Stop on any drift.
2. Generate the initial Wrangler file from the current Pages project using the locally pinned Wrangler version introduced by `CF-P1-002`; do not hand-copy values.
3. Review the generated file against the baseline. Reject secret values, remote resource identifiers, undeclared binding changes, a branch change, or an output other than `./_site`.
4. Run the full static, unit, production build, artifact, browser, security, and fallback baseline.
5. Confirm the immediately preceding successful Cloudflare deployment ID and Git commit in the restricted release record.
6. Deploy to an isolated preview first. Confirm Personal Vault/guest behavior, headers, Service Worker isolation, and the disabled collaboration shell.
7. Obtain Technical Lead, Senior QA, Security, and Operations approval before allowing the production Git deployment.

## Rollback procedure

Rollback is non-destructive and does not create or mutate collaboration data:

1. Keep Collaboration disabled and stop further production promotions.
2. If the new deployment is unhealthy, use Cloudflare Pages rollback to promote the immediately preceding verified production deployment. Record both deployment IDs and commits.
3. Re-run HTTP, security-header, asset, Personal Vault/guest, and GitHub Pages fallback smoke tests. A passing HTTP status alone is insufficient.
4. If Wrangler configuration caused the incident, revert the introducing commit, remove the Wrangler file, and create a new deployment. Per Cloudflare's Pages contract, the last deployed values continue to apply and the corresponding dashboard fields become editable again.
5. Compare the restored live allow-list snapshot to this baseline. Any unexplained setting or binding remains a release blocker.
6. Do not delete the Pages project, alter GitHub Pages, delete a database, rotate a secret, or invent a resource value as part of this rollback. Escalate any suspected credential or control-plane compromise through the security incident path.
7. Attach the rollback, smoke, snapshot, and incident results to the release evidence before retrying.

Abort criteria are any unexpected binding/variable deletion, source/output drift, inaccessible fallback, secret/resource identifier in an artifact, or inability to identify a known-good deployment. These conditions produce `NO-GO`, not a warning.

## Evidence and traceability

- `CF-EV-P1-OPS-001`: sanitized snapshot, ownership map, assertion command, preflight, and rollback procedure.
- `CF-EV-P1-SEC-001`: schema allow-list, prohibited-field scan, drift/deletion negative tests, and artifact privacy statement.
- Requirements: `CF-OPS-002`, `CF-OPS-003`, `CF-OPS-004`.
- Risks: `R17`, `R18`, `R19`.
- Threats: `T19`, `T20`.

Official reference: [Cloudflare Pages Functions Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
