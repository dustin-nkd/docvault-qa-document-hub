# CF-EV-P3-STA-001 — Identity/session contract and platform freeze

Status: PASS

Story: `CF-P3-001`

Date: 2026-07-16

Owner: Technical Lead

Reviewer: Senior QA, Product Owner, Operations

## Claim

The Phase 3 identity/session design is reconciled across the approved ADR, API, schema, runbook, threat/risk, quality, and Phase 2 exit contracts. Current Cloudflare Pages, Wrangler, and GitHub OAuth capabilities were checked and converted into explicit implementation decisions without changing runtime or remote state.

## Verification

- `users`, `oauth_transactions`, and `sessions` schema-9 columns support numeric provider identity, encrypted transaction context, digest-only sessions, expiry, and revocation without a semantic schema change.
- The exact four-route Phase 3 surface is frozen; all business routes remain prohibited.
- Preview callback uses the stable Pages alias for branch `codex-cf-p3-preview`.
- Current Cloudflare project inspection confirms Git source `dustin-nkd/docvault-qa-document-hub`, production branch `main`, zero production D1 bindings, one preview `COLLAB_DB`, and preview branch rules `include=*`, `exclude=gh-pages`.
- Because preview secrets apply across preview deployments, the contract blocks secret provisioning until P3-G4 narrows preview branches to the designated identity branch.
- Wrangler `4.111.0` schema supports GA rate bindings but only 10/60-second simple periods; the exact 600-second budget is assigned to a later reviewed forward-only D1 operational migration.
- No configuration, migration, application, provider credential, secret, identity row, or remote resource changed.

## Sources

- [`phase-3-identity-session-contract.md`](../../phase-3-identity-session-contract.md)
- `config/cloudflare/phase-3-contract-freeze.json`
- `wrangler.jsonc` and locked `node_modules/wrangler/config-schema.json`
- Cloudflare Pages project API read on 2026-07-16, sanitized to names/counts and branch controls
- Official Cloudflare Pages/Workers and GitHub OAuth documentation linked from the contract

## Result

All CF-P3-001 platform and contract decisions are closed. Gate P3-G1 may review authorization for `CF-P3-002`; no remote or runtime authority is implied.
