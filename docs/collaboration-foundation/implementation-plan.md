# Collaboration Foundation implementation plan

Status: Approved at Gate G4; Phase 1 runtime-shell implementation authorized

Date: 2026-07-15

Owners: Product Owner, Technical Lead, Security Reviewer, Operations, Senior QA, UX Lead

## 1. Authorization boundary

Gate G4 may authorize controlled implementation of the approved Collaboration Foundation contracts. It does not authorize production feature activation, customer migration, credential sharing, scope expansion, or bypass of a phase exit gate.

Implementation must preserve these conditions:

- Personal Vault, guest mode, GitHub Sync, public sharing, GitHub Pages fallback, Vault V2, and the existing offline shell remain independently operable.
- No personal document is uploaded automatically. Official copy/create workflows exclude stored Credential documents.
- No phase invents a new identity, RBAC, crypto, retention, recovery, or conflict rule. A required contract change returns to Product, Security, Architecture, and QA review before code continues.
- Collaboration remains disabled in production until Phase 9 release approval.
- Every pull request is deployable with the feature disabled and compatible with the adjacent D1 schema versions.

## 2. Planned Cloudflare and identity resources

These are logical names for future controlled provisioning; no resource is created by this plan.

| Resource | Preview | Production | Rule |
|---|---|---|---|
| Pages project | Existing `docvault-qa-document-hub` preview deployments | Existing `docvault-qa-document-hub` production branch `main` | GitHub integration remains the deployment source |
| D1 database | `docvault-collab-preview` | `docvault-collab-production` | Different database IDs; configuration test fails if equal |
| D1 binding | `COLLAB_DB` | `COLLAB_DB` | Same code-level name, environment-specific resource |
| GitHub OAuth app | `DocVault Collaboration Preview` | `DocVault Collaboration Production` | Exact, distinct callbacks and secrets |
| Application environment | `APP_ENV=preview` | `APP_ENV=production` | Server-owned and validated at startup |
| Canonical origin | Environment-specific Pages preview policy | `https://docvault-qa-document-hub.pages.dev` | No wildcard/reflected credentialed CORS |
| Session cookie | Preview-specific host-only name | Production-specific host-only name | Never shared across environments |
| Feature switch | Synthetic accounts/workspaces only | Disabled, then explicit canary cohort | Server and client fail closed independently |

Future `wrangler.jsonc` changes contain binding declarations but no secret value. Wrangler, the Workers test pool, and migration tooling are pinned in `devDependencies` and the lockfile.

## 3. Dependency sequence

```text
Phase 1 contracts/harness
  -> Phase 2 D1 schema and operations
  -> Phase 3 identity/session security
  -> Phase 4 workspace/RBAC/invitations/audit
  -> Phase 5 device and workspace cryptography
  -> Phase 6 encrypted documents/revisions/outbox
  -> Phase 7 product UX and provider integration
  -> Phase 8 cross-cutting security/performance/browser hardening
  -> Phase 9 production canary and controlled rollout
```

Phases may overlap only where the dependency contract is already implemented behind an interface and both phase owners agree on the same fixture/vector version. A downstream phase cannot declare Ready while an upstream P0/P1 exit criterion is failing.

## 4. Phase 1 — Runtime shell and executable contracts

Outcome: establish a disabled, testable Pages Functions boundary without adding a user-visible collaboration path.

Work packages:

1. Pin Wrangler, `@cloudflare/vitest-pool-workers`, and required test tooling; generate typed bindings.
2. Add `wrangler.jsonc` with preview/production environment declarations and no secret values.
3. Add the Pages Functions `/api/v1` router, request ID, JSON envelope, cache/security headers, stable error mapping, exact-origin gate, body/media-type/size validation, and feature-disabled response.
4. Add dependency-injected clock, UUID, token/random, OAuth adapter, and failure seam for tests; exclude test adapters from production artifacts.
5. Add disposable local D1 and Pages integration harness, API matrix helpers, and privacy-canary assertions.
6. Update the build allow-list so server source/configuration never enters `_site`; ensure GitHub Pages exposes no collaboration API or operational control.

Exit gate P1:

- clean `npm ci`, existing 55+ regression tests, generated artifact, and browser suite pass;
- local Functions/D1 test proves JSON/no-store behavior and Service Worker `/api/*` bypass;
- production build inspection proves no test bypass, secret, server source, or accidental eager collaboration bundle;
- preview and production binding/OAuth/origin identifiers are structurally isolated;
- Security and Senior QA approve the request-gate and deterministic-seam evidence.

## 5. Phase 2 — D1 schema, migrations, and recovery controls

Outcome: implement the approved relational model and safe deployment mechanics while collaboration remains disabled.

Work packages:

1. Create immutable zero-padded expand migrations for users, OAuth transactions, sessions, workspaces, memberships, invitations, devices, key versions/envelopes, documents/revisions, mutation results, audit events, and retention holds.
2. Implement constraints, composite workspace scoping, indexes, last-Owner protection inputs, retention columns, and migration-version checks.
3. Implement the guarded atomic-batch helper and idempotency race/re-read helper; never treat a zero-row write as success.
4. Add empty, populated, repeated, previous-version, malformed, fault-injected, and restore migration fixtures.
5. Provision only the approved preview D1 after local evidence passes; rehearse migration list/apply/integrity commands.
6. Record Time Travel and restore rehearsal evidence in a non-production database.

Exit gate P2:

- schema/API/crypto identifiers and bounds match exactly;
- every atomic recipe rolls back after failure injection at every statement;
- cross-workspace foreign-key/query attempts and last-Owner races fail closed;
- migration compatibility, integrity, retention, and restore rehearsal pass;
- Operations, Security, Technical Lead, and Senior QA approve the evidence.

## 6. Phase 3 — GitHub identity, sessions, CSRF, and abuse controls

Outcome: establish an attributable, revocable user session without coupling OAuth identity to Personal Vault unlock.

Work packages:

1. Implement one-use OAuth state, PKCE, exact redirect, short transaction expiry, code exchange, immutable numeric subject normalization, and provider-token disposal.
2. Implement keyed session-token digests, host-only cookies, 12-hour idle/seven-day absolute expiry, rotation, logout, revocation, and 15-minute high-risk reauthentication.
3. Implement session-bound synchronizer CSRF tokens plus exact Origin validation on every mutation.
4. Implement rate tiers, non-enumerating failures, allowed-field observability, and provider timeout/backoff behavior.
5. Configure the dedicated preview OAuth application only after callback and secret-handling review.

Exit gate P3:

- OAuth callback substitution/replay/state/PKCE/origin matrix passes;
- raw codes, provider tokens, cookies, CSRF values, session tokens/digests, and stack/SQL detail are absent from D1/logs/URLs/storage/artifacts;
- logout, expiry, rotation, security event, and account change revoke correctly;
- guest/public-share/Personal Vault never initiate OAuth automatically;
- provider outage degrades collaboration only, with no auth downgrade.

## 7. Phase 4 — Workspaces, RBAC, invitations, and audit

Outcome: implement server-authoritative team membership and attributable control-plane actions without document decryption.

Work packages:

1. Implement atomic workspace/Owner/initial-key-version/audit creation.
2. Implement centralized deny-by-default policy actions for Owner, Admin, Editor, Viewer, pending-key, removed, revoked, and unauthenticated states.
3. Implement identity-bound, hashed, 72-hour, single-use, revocable invitation creation/bootstrap/acceptance with manual out-of-band link delivery.
4. Implement membership changes, role ceilings, recent-auth ownership transfer, last-Owner invariant, device registration metadata, and `pending_key` state.
5. Implement allow-listed immutable audit events and scoped retrieval/pagination.

Exit gate P4:

- every role/action/resource/state combination passes direct API tests, including cross-workspace IDs and forged actor/role/time;
- invitation wrong-subject, expiry, revoke, replay, concurrent acceptance, enumeration, and raw-token scans pass;
- workspace creation and every security mutation produce exactly one authoritative audit result atomically;
- export, hard deletion, server recovery, and unapproved lifecycle routes remain unavailable.

## 8. Phase 5 — Device keys, workspace envelopes, rotation, and loss states

Outcome: deliver workspace keys to authorized devices without server plaintext or recovery escrow.

Work packages:

1. Implement RFC 8785 JCS, strict base64url, UUID/integer validation, canonical P-256 public JWK validation/fingerprint, and the fixed error map.
2. Implement encrypted local PKCS#8 device-key envelope with PBKDF2-HMAC-SHA-256 600,000 and AES-256-GCM; import the unlocked private key non-extractable.
3. Implement ephemeral P-256 ECDH/HKDF-SHA-256/AES-256-GCM workspace-DEK wrapping with exact AAD and target fingerprint.
4. Implement key-ready provisioning by an authorized Owner/Admin device, pending state, current-version checks, revocation, rotation, interruption/retry, and historical limitations.
5. Publish fixed positive/negative vectors and run an independent reference implementation plus supported-browser matrix.

Exit gate P5:

- every canonicalization, field mutation, substitution, replay, downgrade, malformed point, nonce/tag/size, and cross-scope vector fails closed as specified;
- D1/API/log/cache/build/storage privacy canaries find no prohibited key/plaintext material;
- slowest supported browser meets the PBKDF2 and crypto budget;
- alternate provisioner, removed/revoked device, rotation interruption, and terminal all-provisioners-lost journeys are accurate and accessible;
- Security Reviewer and Senior QA approve the crypto evidence; no P0/P1 crypto failure remains.

## 9. Phase 6 — Encrypted documents, revisions, conflicts, and outbox

Outcome: implement encrypted team document writes without silent overwrite or duplicate business mutations.

Work packages:

1. Implement exact document ciphertext envelope/AAD, fresh nonce, key/revision binding, and 1 MiB request/decoded-field limits.
2. Implement authoritative revision compare-and-swap, tombstones, keyset pagination, stable `409` conflict, and versioned encrypted history.
3. Implement scoped/fingerprinted 30-day mutation idempotency, lost-response replay, and unique audit/revision side effects.
4. Implement the encrypted IndexedDB outbox with environment/user/device/workspace/base-revision/key-version binding, FIFO dependencies, 100-entry/25 MiB cap, and seven-day quarantine.
5. Implement conflict recovery that preserves the local draft and supports review latest, reapply, save as copy, or confirmed discard.

Exit gate P6:

- concurrent stale writes yield exactly one accepted revision and one recoverable conflict;
- sequential/concurrent replay and response loss yield exactly one business mutation;
- logout/account/workspace switch, removal, device revoke, rotation, reload, quota, corruption, and reconnect cannot replay stale authority or persist plaintext;
- official create/copy/import/category flows reject stored Credential documents before encryption; tests state the malicious-ciphertext residual honestly;
- scale/query/pagination and decrypt/render budgets pass representative preview data.

## 10. Phase 7 — Provider integration and accessible product UX

Outcome: expose the approved thin slice without mixing personal and collaboration state.

Work packages:

1. Add isolated `PersonalVaultProvider` and `WorkspaceProvider` interfaces and explicit active context; clear decrypted/search/cache state on switch.
2. Lazy-load collaboration identity, administration, crypto, editor, and outbox modules only after explicit capability/user action.
3. Build sign-in, workspace list/create, invitation, membership/role, device readiness, copy confirmation, shared viewer/editor, conflict, offline, rotation, removal, and terminal-loss states.
4. Keep GitHub Pages personal/guest-only with one safe canonical link and no sensitive URL propagation.
5. Implement WCAG 2.2 AA semantics, keyboard/focus management, status/error announcements, non-color state, zoom/reduced-motion, and screen-reader journeys.

Exit gate P7:

- Personal Vault, GitHub Sync, guest, public share, credentials, history, exports, search, dashboard, and offline shell regressions pass unchanged;
- no automatic upload, hidden provider link, PAT/master-password reuse, or personal-source mutation occurs;
- collaboration startup impact on personal/guest path is at most 75 KiB gzip and editor/crypto/admin remain lazy;
- supported browser, mobile, keyboard, zoom, reduced-motion, and screen-reader journeys pass;
- Product, UX, Security, and Senior QA approve the thin-slice experience.

## 11. Phase 8 — System hardening and release candidate

Outcome: close cross-cutting security, performance, resilience, supply-chain, and operational risks in an isolated production-like preview.

Work packages:

1. Run the complete threat/abuse matrix, IDOR/RBAC, CSRF/origin, XSS/CSP, privacy-canary, rate/resource, supply-chain, and artifact tests.
2. Run 25-member/10,000-document/50-revision/10-active-user workloads and the approved API/client budgets.
3. Rehearse expand/contract migration, feature disable, compatible rollback, Time Travel restore, retention purge, OAuth outage, D1 fault, and key/security incidents.
4. Produce SBOM/dependency/provenance evidence and resolve exploitable Critical/High findings.
5. Freeze API/schema/crypto vector versions for the release candidate.

Exit gate P8:

- zero P0/P1 test skips, quarantines, disabled cases, or accepted flakiness;
- no open P0/P1 defect, unowned Critical/High risk, known exploitable Critical dependency, secret leak, privacy-canary hit, or contract drift;
- API read p95 `<= 300 ms`, write p95 `<= 500 ms`, correctness 100%, and client budgets pass with recorded profiles;
- restore meets approved RPO/RTO in rehearsal;
- Product, Technical Lead, Security, Operations, UX, and Senior QA sign the release candidate.

## 12. Phase 9 — Production canary and controlled rollout

Outcome: activate collaboration only for an approved synthetic canary, then a deliberately limited cohort after evidence review.

Work packages:

1. Record deployment ID, commit, migration list, pre-change Time Travel bookmark, feature state, approvers, and rollback owner.
2. Deploy compatible code disabled; apply approved expand migration in the runbook order.
3. Run the non-destructive synthetic workspace canary and privacy/latency/error observation window.
4. Enable only the approved cohort, expand gradually while gates remain green, and retain immediate non-destructive disablement.
5. Complete release record, post-rollout review, and recurring operational checks.

Production release gate:

- all applicable risk/evidence records are closed or the explicitly accepted residual limitations remain accurately disclosed;
- canary has no authorization, crypto, isolation, idempotency, audit, privacy, migration, or operational failure;
- both Cloudflare Pages collaboration mode and GitHub Pages personal fallback smoke tests pass;
- Product Owner gives a separate explicit production-release approval.

## 13. Pull-request and ownership rules

- One pull request has one primary contract outcome and references stable requirement, threat/risk, phase, and evidence IDs.
- Schema expand, compatible runtime, data backfill, and schema contract are separate reviewable changes unless the runbook explicitly proves safe combination.
- Security-sensitive code requires Technical Lead, Security Reviewer, and Senior QA review; product/UX behavior also requires Product/UX review.
- Every PR includes negative tests and side-effect inspection, not only a happy path.
- No test-only bypass, temporary plaintext path, wildcard authorization/origin, unbounded input, or disabled security check may merge to `main`.
- A discovered contract conflict stops the dependent work and creates a decision-log amendment; implementation does not silently choose.

## 14. Gate G4 acceptance

- [x] Product Owner approves the phase outcomes, scope boundary, resource naming, and separate production-release gate.
- [x] Technical Lead approves dependency order, PR slicing, interfaces, migration sequence, and ownership.
- [x] Security Reviewer approves placement of authentication, crypto, privacy, abuse, and residual-risk gates.
- [x] Operations approves preview-first provisioning and the Phase 8/9 rehearsal and rollout sequence.
- [x] UX Lead approves the Phase 7 accessibility and truthful limitation journeys.
- [x] Senior QA confirms every phase has objective entry/exit evidence and no P0/P1 skip path.
- [x] Gate G4 authorizes Phase 1 only; later phases remain gated and production remains disabled.

Gate G4 decision: **PASSED on 2026-07-15. GO to Phase 1 runtime-shell implementation; production remains disabled.**
