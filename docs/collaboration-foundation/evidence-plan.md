# Collaboration Foundation evidence plan

Status: Approved at Gate G4; controlling implementation and release evidence policy

Date: 2026-07-15

Owner: Senior QA

## 1. Purpose

This plan defines how implementation and release claims become reproducible evidence. Phase 0 approval establishes testable contracts; it does not fabricate passing runtime evidence. Every implementation phase must close its own gate before dependent work or production exposure proceeds.

## 2. Evidence identifiers

Each retained result uses `CF-EV-<phase>-<family>-<sequence>`, for example `CF-EV-P3-SEC-0042`.

Families:

| Code | Evidence family |
|---|---|
| `STA` | Static analysis, type/configuration, artifact, dependency, or secret scan |
| `UT` | Unit/reference/vector test |
| `INT` | Pages Functions and real local D1 integration |
| `API` | HTTP contract, RBAC, failure, and side-effect matrix |
| `E2E` | Multi-user/device browser journey |
| `SEC` | Threat, abuse, privacy, isolation, or supply-chain security evidence |
| `PERF` | Load, latency, client, crypto, or bundle performance |
| `A11Y` | Automated and manual accessibility/browser evidence |
| `MIG` | Migration, compatibility, restore, retention, and rollback evidence |
| `OPS` | Preview/canary/deployment/incident evidence |

## 3. Required evidence manifest

Every evidence item records:

- evidence ID, UTC timestamp, phase/gate, stable requirement IDs, threats/risks/abuse cases, and contract version;
- repository commit, clean/dirty status, lockfile digest, build/deployment ID, migration set, environment, browser/runtime/tool versions, and reference hardware profile where relevant;
- exact command or automated job, input fixture/vector version, synthetic actor/workspace identifiers, and feature-flag state;
- expected result, actual result, duration, counts, p50/p95/max where relevant, and every skipped/retried/flaky case;
- allow-listed side effects across HTTP, D1, audit, logs, storage, cache, network, and build artifact;
- privacy redaction statement, artifact checksum/location, evidence owner, reviewer, defects, risk disposition, and gate decision.

Evidence never stores document plaintext/ciphertext bodies, tokens, secrets, cookies, private keys, DEKs, invitation capabilities, OAuth codes, raw request/response bodies, SQL parameters, or sensitive URLs.

## 4. Test execution layers

| Layer | Minimum environment | Required purpose |
|---|---|---|
| Static/unit | Clean local/CI install | Parser/policy/state/canonicalization, safe serialization, build boundary, dependency/config checks |
| Integration | Workers Vitest pool with disposable real local D1 | Functions request pipeline, constraints, batches, migrations, failure injection, side effects |
| API | Local plus isolated preview | Full method/media/origin/CSRF/session/role/device/workspace/state/idempotency/limit/rate matrix |
| Browser | Built production artifact plus preview backend | Multi-context users/devices, crypto/storage, conflicts/offline, accessibility, fallback and existing regressions |
| Security | Local, preview, artifact, configuration | Threat/abuse cases, IDOR, XSS/CSP, canary scans, environment isolation, dependency/provenance |
| Performance | Representative isolated preview plus recorded client profile | Approved workload, API/client/crypto/bundle budgets and saturation behavior |
| Operations | Preview rehearsal and non-destructive production canary | Migration, restore, rollback, disablement, provider/D1 incidents, deployment traceability |

## 5. Phase evidence matrix

| Phase | Required evidence before exit | Accountable reviewers |
|---|---|---|
| P1 runtime shell | Existing regression/E2E; API no-store/error/origin shell; local real-D1 harness; test-seam exclusion; `_site` and GitHub Pages isolation | Technical Lead, Security, Senior QA |
| P2 D1/operations | Empty/populated/repeated migrations; constraints/indexes; every-statement rollback; races; adjacent schema; restore and retention rehearsal | Technical Lead, Operations, Security, Senior QA |
| P3 identity/session | OAuth/PKCE/state/callback matrix; session lifecycle; CSRF/origin; non-enumeration; provider outage; secret/log/storage scans | Security, Technical Lead, Senior QA |
| P4 workspace/RBAC | Full role/action/resource/state matrix; IDOR; invitation races; last Owner; audit atomicity; deny-closed lifecycle | Product, Security, Senior QA |
| P5 crypto/keys | Independent fixed vectors; every mutation/downgrade/substitution case; browser/crypto performance; storage/privacy; revocation/rotation/loss | Security, Product, Senior QA |
| P6 documents/sync | CAS conflicts; replay/response loss; outbox lifecycle/quota/quarantine; credential official-flow prevention; scale/pagination/decrypt-render | Technical Lead, Security, Product, Senior QA |
| P7 UX/integration | Existing product regression; explicit provider/copy isolation; module/bundle boundary; multi-user journey; WCAG/browser/mobile | Product, UX, Security, Senior QA |
| P8 hardening | Full threat/risk matrix; supply chain/SBOM/provenance; performance/resilience; migration/restore/incident drills; zero P0/P1 skips | All gate reviewers |
| P9 rollout | Commit/deployment/migration/bookmark; synthetic canary; privacy/latency/error window; fallback smoke; rollback readiness | Product, Operations, Security, Senior QA |

## 6. Stable coverage obligations

- All 60 `CF-*` requirements retain at least one planned evidence family and owner in `traceability-matrix.md`.
- Threats T01–T23, abuse cases AB-01–AB-25, and risks R01–R22 retain a control and trigger. Any new item receives a stable identifier before merge.
- A test name, API route, migration, pull request, defect, and evidence manifest references the stable IDs it proves or affects.
- Requirement coverage is counted only when the asserted side effects and negative cases pass in the required environment.
- UI absence is never evidence of authorization; ciphertext existence is never evidence of successful authorized decryption; a `2xx` alone is never evidence of atomic correctness.

## 7. Mandatory regression baseline

Every phase merge keeps these existing checks green:

- `npm ci` from the committed lockfile;
- `npm run check` including all existing core, Vault V2, storage/sync, security, service-worker, performance, maintainability, and interaction tests;
- `npm run build:pages` and artifact allow-list/English-only validation;
- `npm run test:e2e` against the generated production artifact;
- Cloudflare Pages deployment and GitHub Pages fallback smoke tests where the change can affect deployment/runtime behavior.

Collaboration suites are additive. They do not replace or dilute the personal-vault regression baseline.

## 8. P0/P1 evidence policy

- A P0/P1 test may not be skipped, quarantined, disabled, conditionally omitted, or passed by accepting flakiness.
- A retry is not a pass until the first failure has a recorded root cause and disposition.
- An unavailable required environment is a blocked gate, not a passing result.
- Mock-only evidence cannot close D1, browser crypto, preview isolation, migration/restore, or production canary obligations.
- A P0/P1 defect blocks the affected phase and all dependent phases. Only the defined residual limitations may be accepted, and acceptance cannot replace a required control.

## 9. Defect and risk linkage

Every failed evidence item creates or links a defect with severity, requirement/threat/risk IDs, environment, reproduction, side effects, data-exposure assessment, owner, target phase, and retest evidence. A risk moves from `Controlled pending evidence` to `Open` when its trigger occurs or required evidence fails.

Closure requires:

1. a reviewed fix or explicit contract amendment;
2. passing focused negative/regression evidence;
3. passing affected phase and baseline suites;
4. updated risk/traceability status;
5. no unexplained data, security, or audit side effect.

## 10. Performance evidence

The retained report includes dataset generator seed/profile, account/workspace/member/document/revision counts, concurrency, payload distribution, geographic test point, warm/cold state, D1 work, API p50/p95/max/error, client hardware/browser, decrypt/render/crypto timings, bundle gzip composition, and threshold comparison.

Approved thresholds:

- API read p95 `<= 300 ms` and write p95 `<= 500 ms` in preview, excluding GitHub OAuth provider time;
- conflict/idempotency/authorization correctness 100%;
- initial collaboration impact on Personal/Guest startup `<= 75 KiB` gzip with editor/crypto/admin lazy;
- decrypt and render 100 representative documents p95 `<= 500 ms` on the recorded reference profile;
- 25 members/workspace, 10,000 documents/workspace, 50 revisions/document, and 10 active users.

## 11. Security and privacy evidence

Security evidence includes direct negative requests, cross-tenant IDs, forged actors/roles/times, every crypto/AAD mutation, hostile strings, CSP/XSS checks, environment crossover, cache/Service Worker behavior, provider failures, dependency/provenance scans, and sensitive canaries.

The canary corpus uses unique non-secret marker strings representing prohibited field classes. Detection in API metadata, D1, audit, logs, telemetry, URL/history, DOM attributes, Cache Storage, `_site`, CI artifacts, or persistent unencrypted browser storage is a P1 failure and incident trigger.

The credential test reports two distinct claims:

1. official create/copy/import/category workflows reject a stored Credential document before encryption;
2. the API cannot semantically inspect an authorized malicious client's opaque ciphertext, which remains the accepted E2EE residual limitation.

## 12. Accessibility and browser evidence

The matrix covers the latest two stable Chrome, Edge, and Firefox versions plus Safari 17.4 or later. Capability detection fails closed for missing/limited crypto or storage behavior. Automated scanning is supplemented by keyboard, focus, 200%/400% zoom, reduced motion, high-contrast/non-color state, screen-reader, error announcement, conflict recovery, offline, key readiness, removal, rotation, and terminal-loss journeys.

WCAG 2.2 AA is the acceptance target. A browser is not supported based only on API presence; fixed crypto/storage/session evidence must pass.

## 13. Gate decision record

Each phase review records one result:

- `PASS`: all required controls and evidence pass; dependent phase may start.
- `CONDITIONAL NO-GO`: non-critical work may continue only within the explicitly isolated package; dependent capability remains disabled.
- `NO-GO`: a P0/P1 failure, missing mandatory environment/evidence, unapproved contract change, or unowned Critical/High risk blocks progress.

The final production decision is separate from Gate G4 and requires Phase 8 and Phase 9 evidence plus explicit Product Owner approval.

## 14. Gate G4 acceptance

- [x] Senior QA approves identifiers, manifest, environments, evidence matrix, and zero-skip P0/P1 policy.
- [x] Technical Lead confirms every phase deliverable can emit the required side-effect and traceability evidence.
- [x] Security Reviewer approves secret/privacy handling, canary corpus, threat/abuse coverage, and residual-limit wording.
- [x] Operations approves retained deployment/migration/restore/canary evidence and access controls.
- [x] Product/UX approve performance, browser, accessibility, and truthful user-journey evidence.
- [x] Gate G4 authorizes evidence-producing implementation only; it does not pre-approve any later phase or production release.

Gate G4 decision: **PASSED on 2026-07-15; evidence-producing Phase 1 implementation is authorized and production release remains NO-GO.**
