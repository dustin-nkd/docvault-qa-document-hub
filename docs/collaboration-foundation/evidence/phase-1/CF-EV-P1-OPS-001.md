# CF-EV-P1-OPS-001 — Pages configuration baseline and rollback control

Status: PASS locally; deployment evidence pending the candidate commit

Captured: 2026-07-15T14:57:00.244Z

Phase: P1 runtime shell, story `CF-P1-001`

Owner: Operations

Reviewer: Senior QA

## Traceability

- Requirements: `CF-OPS-002`, `CF-OPS-003`, `CF-OPS-004`
- Risks: `R17`, `R18`, `R19`
- Threats: `T19`, `T20`
- Contract baseline: Gate G4 documents at repository base `9520b29eb1d83167ccaaecea5124dd9770b54e82`

## Environment and inputs

- Cloudflare Pages production project, Git-connected to `main`
- Sanitized API capture schema version 1
- Node.js local quality environment on Windows
- Lockfile SHA-256: `51a8d91cc30e2f85418826165b823a562967dc572236bbe69c6dbcce571e9e89`
- Feature state: Collaboration unavailable; no runtime shell or remote D1 exists

## Execution

1. Retrieved current Pages project configuration through the authenticated Cloudflare API.
2. Applied the allow-list transform before returning data to the workspace.
3. Stored [`pages-project-baseline.json`](../../../../config/cloudflare/pages-project-baseline.json).
4. Executed `npm run check:cloudflare-config` and the full repository quality gate.
5. Reviewed the ownership transition and rollback steps in [`phase-1-pages-configuration.md`](../../phase-1-pages-configuration.md).

## Expected and actual result

| Assertion | Expected | Actual |
|---|---|---|
| Project and Git source | Approved Pages project and repository | PASS |
| Production branch | `main` | PASS |
| Output directory | `_site` | PASS |
| Binding/variable inventory | Empty in preview and production | PASS |
| Compatibility state | Captured for both environments | PASS |
| Unexpected addition/deletion | Deployment-blocking | PASS by negative test |
| Rollback | Known-good Pages deployment plus config-source recovery | Documented |

Side effects: read-only Cloudflare API request and repository candidate files only. No dashboard setting, deployment, binding, database, secret, runtime route, or product data was changed.

Privacy: no raw API response was stored. The retained artifact contains approved configuration metadata and empty name inventories only. It contains no values, tokens, cookies, resource identifiers, protected content, or sensitive URLs.
