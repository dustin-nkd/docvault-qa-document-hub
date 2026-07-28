# Collaboration Foundation Risk Register

## Document control

| Field | Value |
| --- | --- |
| Document ID | CF-RISK-001 |
| Status | Residual-risk baseline approved at Gate G3; control evidence pending |
| Date | 2026-07-15 |
| Risk owner | Product Owner |
| Security authority | Security Reviewer |
| Evidence authority | Senior QA |
| Operational authority | Technical Lead / Operations |

## 1. Scoring and disposition

Likelihood and impact use 1-5. Score is likelihood x impact: Critical 20-25, High 12-19, Medium 6-11, Low 1-5. `P0` denotes broad/irreversible compromise, destructive unrecoverable migration, or production-wide catastrophic failure. `P1` denotes authorization, confidentiality, key, session, integrity, revocation, lost-update, recovery-contract, or critical isolation failure. `P2` is a major quality/availability failure without those impacts.

Residual severity is the target after every named control and evidence item passes; it is not evidence that the risk is already reduced. P0/P1 control failure is prohibited and cannot be accepted for Foundation production. An inherent Critical/High risk must have both a contract owner and an evidence owner; this register has no unowned Critical/High item.

Status values: `Open` means contract/evidence is incomplete; `Controlled pending evidence` means a decision exists but executable evidence is not yet linked; `Accepted limitation` means the limitation is intrinsic, disclosed, and approved but does not permit a control bypass; `Closed` requires linked passing evidence and sign-off.

## 2. Consolidated register

| ID | Risk / class | Inherent | Target residual | Approved control | Contract owner | Evidence owner | Acceptance / prohibition | Trigger / indicator | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R01 | OAuth subject/state/PKCE/callback substitution impersonates a user (P1 security). | 4x5=20 Critical | 2x4=8 Medium | Stable GitHub numeric subject; PKCE S256; 256-bit single-use state; exact environment redirect; server code exchange; generic errors. | Security Reviewer | Senior QA | Auth bypass prohibited. | Callback mismatch/replay, changed login/email mapping, unexpected redirect. | Controlled pending evidence |
| R02 | Stolen/fixed/logged/stale session or CSRF performs protected actions (P1 security). | 4x5=20 Critical | 2x4=8 Medium | Opaque 256-bit cookie; keyed digest in D1; Secure/HttpOnly/SameSite; 12h idle/7d absolute; rotation/revocation; 15m reauth; exact Origin plus synchronizer CSRF token. | Security Reviewer | Senior QA | Session/CSRF bypass or raw token retention prohibited. | Revoked/expired cookie accepted, hostile-origin side effect, token canary found. | Controlled pending evidence |
| R03 | IDOR, forged actor/role/workspace, or policy drift crosses tenant/role boundaries (P1 security). | 5x5=25 Critical | 2x5=10 Medium | Central deny-default ADR-003 matrix; session-derived actor; current membership/device state; workspace-scoped parameterized query; non-disclosing denial; side-effect assertions. | Technical Lead | Senior QA | Any unauthorized read/write/envelope/audit access prohibited. | Cross-workspace success, Viewer mutation, last-Owner violation, denial leaks existence. | Controlled pending evidence |
| R04 | Invitation theft/replay/wrong subject/race grants membership or enumerates targets (P1 security/privacy). | 4x5=20 Critical | 2x4=8 Medium | Immutable numeric-subject binding; hashed random token; 72h expiry; single-use atomic acceptance/revocation; rate limit; `pending_key`; no key on acceptance. | Security Reviewer | Senior QA | Unauthorized/duplicate membership prohibited. Delivery-channel metadata follows the approved manual out-of-band contract. | Concurrent double acceptance, wrong subject accepted, account-dependent errors. | Contract approved; evidence pending |
| R05 | Public-key or workspace-envelope substitution/replay gives a DEK to attacker device (P1 crypto). | 4x5=20 Critical | 1x5=5 Low | Canonical P-256 JWK/fingerprint; compare-and-set target; ECDH/HKDF/AES-GCM; exact AAD binding; Owner/Admin key-ready wrapper; unique target/version envelope. | Security Reviewer | Senior QA | Key substitution, downgrade, unauthorized wrapper, or readiness side effect prohibited. | Fingerprint changes between lookup/submit, altered binding unwraps, duplicate envelope. | Controlled pending evidence |
| R06 | Weak/tampered local private-key protection exposes device private key (P1 crypto). | 4x5=20 Critical | 2x5=10 Medium | User-specific unlock secret; PBKDF2-SHA-256 600k, fresh 16-32 byte salt; AES-256-GCM fresh nonce/authenticated header; encrypted PKCS#8 only at rest; non-extractable in-use import. | Security Reviewer | Senior QA | Plaintext private key/KEK/unlock secret in persistence/server/logs prohibited. Weak user secrets leave accepted offline-guessing residual. | Canary in storage/log, altered header accepted, below-bound KDF, cross-user envelope opens. | Controlled pending evidence |
| R07 | Nonce reuse, crypto downgrade, malformed bounds, or plaintext fallback compromises E2EE (P1 crypto). | 4x5=20 Critical | 1x5=5 Low | Fixed v1 registry; CSPRNG; fresh 96-bit AES-GCM nonce; strict JCS/base64url/size/algorithm validation; full tags; fail closed; immutable vectors. | Security Reviewer | Senior QA | Nonce reuse, downgrade, shortened tag, and fallback prohibited. | Duplicate nonce/key detected, unknown suite accepted, AEAD failure returns plaintext. | Controlled pending evidence |
| R08 | E2EE prevents server inspection from detecting a credential document hidden or mislabeled in ciphertext (P1 product/security). | 4x5=20 Critical | 3x5=15 High | Credentials excluded in UI/client schema; explicit copy flow; protected category inside authenticated payload; server enforces declared envelope/schema/size but cannot semantically inspect ciphertext; warning and regression corpus. | Product Owner | Senior QA | Product must not claim server-enforced semantic inspection. Deliberate malicious-member ciphertext is an accepted residual limitation; any official UI path creating credentials is prohibited. | Credential canary created through supported create/copy/import/category path; policy abuse report. | Residual limitation accepted at G3; evidence pending |
| R09 | All active key-ready Owner/Admin provisioning devices or their usable keys are lost (P1 recoverability). | 3x5=15 High | 2x5=10 Medium | Multiple provisioners encouraged; visible key-readiness inventory; alternate Owner/Admin provisioning; setup/removal warnings; backup restores ciphertext only; terminal-loss runbook. No escrow/artifact/reset. | Product Owner | Senior QA | Terminal irrecoverability is accepted with explicit UX/sign-off; claiming operator recovery is prohibited. | Last provisioner revoke/loss, corrupt local envelope, forgotten unlock secret, no valid key-ready Owner/Admin. | Residual limitation accepted at G3; evidence pending |
| R10 | Removed member/device retains old DEK, ciphertext, plaintext, screenshot, or export (P1 confidentiality limitation). | 5x5=25 Critical | 3x5=15 High | Immediate server denial; mandatory rotation on removal/compromise; exclude principal from new version; re-encrypt live records; accurate removal UX; incident notification decision. | Product Owner / Security Reviewer | Senior QA | Prior-copy/old-key erasure cannot be promised. Failure to block future service data/key delivery is prohibited. | Removed principal accesses new version/server data; evidence of retained old copy; incomplete rotation. | Residual limitation accepted at G3; evidence pending |
| R11 | XSS/malicious extension/compromised browser captures transient PKCS#8/unlock material or uses keys/plaintext while unlocked (P1 endpoint security). | 5x5=25 Critical | 3x5=15 High | Strict CSP/Trusted Types where supported; safe text rendering/sanitizer; no unsafe sinks/eval; dependency control; minimal plaintext lifetime; non-extractable imported key; reference clearing; session/device revocation response. | Technical Lead / Security Reviewer | Senior QA | Exploitable first-party XSS prohibited. Compromised extension/OS endpoint is an accepted boundary limitation with truthful documentation. | CSP violation, injection executes, secret canary reaches DOM/telemetry, extension/endpoint incident. | Controlled pending evidence |
| R12 | Server-visible IDs, membership graph, roles, sizes, timing, access patterns, and audit metadata reveal sensitive relationships (P1 privacy). | 4x4=16 High | 3x3=9 Medium | ADR-005 exact allow-list; encrypt titles/content/tags/category/status/workspace display; client search; scoped access; retention/access review; aggregate telemetry. | Product Owner / Privacy Reviewer | Senior QA | Undeclared semantic metadata prohibited. Listed minimal leakage is accepted under the approved allow-list and retention contract. | New D1/log field, server search request, identity graph exposure, retention breach. | Residual limitation accepted at G3; evidence pending |
| R13 | Stale revision/idempotency race silently overwrites or duplicates business mutation/audit (P1 integrity). | 5x5=25 Critical | 1x5=5 Low | Server revisions/timestamps; D1 atomic compare-and-set; `409`; scoped mutation UUID uniqueness; transactionally coupled revision/audit; retained conflict draft. | Technical Lead | Senior QA | Silent overwrite or duplicate business result prohibited. | Concurrent same-base writes both succeed, retry adds revision, missing/multiple audit event. | Controlled pending evidence |
| R14 | Offline mutation executes after account/role/device/key/context change (P1 authorization/integrity). | 4x5=20 Critical | 2x4=8 Medium | Encrypted outbox bound to user/device/workspace/base revision/key version/mutation ID; live reauthorization; expiry/quota; quarantine/review/re-encrypt. | Technical Lead | Senior QA | Stale-authority submission prohibited; silent draft deletion prohibited. | Reconnect after removal/rotation applies write, account-switch outbox crosses context. | Controlled pending evidence |
| R15 | Service Worker/cache or GitHub Pages fallback serves private/stale/API-imitation data (P1 isolation). | 4x5=20 Critical | 1x5=5 Low | `/api/*` and auth/invite bypass before cache logic; `no-store`; app-shell allow-list; fallback Personal/guest only; canonical link without sensitive state; bounded detection. | Technical Lead | Senior QA | Cached private/API response or fallback collaboration imitation prohibited. | Seeded API cache hit, navigation HTML as API response, fallback retry loop/data mutation. | Controlled pending evidence |
| R16 | Logs/audit/errors leak tokens, keys, ciphertext bodies, plaintext, identity data, SQL, or stacks (P1 confidentiality/privacy). | 4x5=20 Critical | 2x4=8 Medium | Allow-listed structured fields/events; server actor/time; no bodies/query capabilities; redaction by construction; request IDs; scoped audit access; canary scans. | Security Reviewer / Operations | Senior QA | Forbidden-value occurrence prohibited and incident-triggering. | Canary match, unexpected field, broad operator access, incomplete/forged audit. | Controlled pending evidence |
| R17 | Preview/production configuration crossover exposes data/sessions/secrets or test actions affect production (P1 isolation). | 4x5=20 Critical | 1x5=5 Low | Separate D1/OAuth/secrets/cookies/session keys/origins/logs/bindings; config assertions; no prod test bypass; visible environment. | Operations | Senior QA | Cross-environment acceptance/access prohibited. | Preview cookie works in prod, shared DB/secret ID, test fixture in production. | Controlled pending evidence |
| R18 | D1 migration, partial transaction, incompatible deploy, backup, or restore corrupts ownership/revisions/envelopes/audit or loses encrypted data (P0/P1 integrity/availability). | 4x5=20 Critical | 2x5=10 Medium | Expand/contract migrations; adjacent-version compatibility; constraints/transactions; pre-migration backup; restore rehearsal; integrity reconciliation; feature flag/rollback preserving new key versions. | Technical Lead / Operations | Senior QA | Destructive migration, ownerless workspace, key-version downgrade, or untested restore prohibited. | Migration error, schema mismatch, row-count/invariant drift, restore cannot reproduce envelope/revision graph. | Runbook approved at G3; evidence pending |
| R19 | CI/dependency/source/control-plane compromise injects code that steals unlocked secrets or exposes build credentials (P1 supply chain). | 4x5=20 Critical | 2x5=10 Medium | Protected branch/environment; least privilege; pinned actions/dependencies; lockfile/SBOM/scans; artifact allow-list; secret store; provenance/review; auditable rollback/rotation. | Operations / Technical Lead | Senior QA | Unreviewed production code, secret in artifact, or known critical exploitable dependency prohibited. | Dependency alert, provenance mismatch, unexpected artifact, secret scan, control-plane audit anomaly. | Controlled pending evidence |
| R20 | GitHub OAuth/provider outage or rate limit blocks sign-in/invitation resolution (P2 availability). | 4x4=16 High | 3x2=6 Medium | Existing sessions continue within policy; bounded timeout/backoff; sanitized status; no auth downgrade; invitation retry; Personal Vault/guest remain available; outage runbook. | Product Owner / Operations | Senior QA | Auth bypass/offline fake identity prohibited. Temporary collaboration unavailability accepted with clear UX. | Provider timeout/5xx/rate limit, callback failure spike, identity lookup unavailable. | Controlled pending evidence |
| R21 | Resource exhaustion through auth/invite/crypto/payload/pagination/outbox overload degrades Functions/D1/browser (P1/P2 availability). | 4x4=16 High | 2x3=6 Medium | Pre-crypto size bounds; fixed PBKDF2 bound; route/user/IP limits; max page 100; no batch; quotas/deadlines; jitter/backoff; aggregate alerts. | Technical Lead / Operations | Senior QA | Unbounded input/work prohibited. Bounded 429 degradation may be accepted. | Latency/error saturation, D1 work spike, repeated oversize/KDF abuse, outbox quota exhaustion. | Controlled pending evidence |
| R22 | Personal Vault, GitHub Sync, public share, guest, or credential data crosses into collaboration implicitly (P1 isolation/privacy). | 4x5=20 Critical | 1x5=5 Low | Separate providers/namespaces; explicit active context and copy confirmation; no automatic upload/link; credential rejection; Personal source unchanged; regression network/storage assertions. | Product Owner / Technical Lead | Senior QA | Implicit migration, PAT/master-password reuse, or public-share-as-membership prohibited. | Workspace traffic on login, credential copy succeeds, Personal data changes, guest touches D1. | Controlled pending evidence |

## 3. Acceptance boundaries

Only the Product Owner may accept product/availability limitations, and only the Security Reviewer may approve security/privacy treatment. Both approvals are required for R08-R12 where product claims and security boundaries overlap. Acceptance never permits a failed required control.

The following are non-waivable for Foundation production:

- authentication/session/CSRF bypass; cross-workspace or role authorization bypass;
- plaintext private key, DEK, protected content, raw token, unlock secret, KEK, PAT, or recovery secret in server/log/build/persistent unencrypted storage;
- key substitution/downgrade, unauthorized provisioning, or readiness without a valid bound envelope;
- silent lost update, duplicate business mutation, broken immediate server revocation, or future key delivery to removed/revoked principals;
- credential creation through an official collaboration flow, automatic Personal Vault migration, environment crossover, cached private API response, or destructive/unrecoverable migration outside the approved terminal-loss contract;
- unreviewed exploitable first-party XSS or critical supply-chain compromise.

Accepted limitations must be visible in UX/documentation: the server cannot inspect encrypted semantics reliably; all-provisioners-lost is terminal; old keys/prior copies cannot be revoked; a compromised unlocked endpoint defeats E2EE; minimal metadata remains visible; and provider outage may make collaboration sign-in/onboarding unavailable without affecting Personal Vault/guest mode.

## 4. Review and evidence workflow

1. Each control owner links the final ADR/schema/runbook/configuration implementing the approved control.
2. Senior QA links deterministic negative, race, browser, environment, migration/restore, supply-chain, and canary evidence.
3. A trigger moves the item to `Open`, starts incident/defect triage at its stated severity, and blocks release when P0/P1 impact is plausible.
4. Residual score changes require Security Reviewer, Product Owner where relevant, and Senior QA review; wording alone cannot reduce risk.
5. `Closed` requires passing evidence in all applicable local, preview, production-smoke, supported-browser, and fallback environments.
6. This register is reviewed at every phase gate, algorithm/schema/role change, provider/security incident, migration, supported-browser change, and before rollout expansion.

## 4A. Phase 7 exit risks

Phase 7 exit risks are numbered `R-P7-*` and are deliberately **not** folded into the
`R01`–`R22` programme table. That table is the residual-risk contract approved at Gate G3;
a phase may not renumber it, and `cf:phase5:exit:check` and `cf:phase7:exit:check` both
assert it is still exactly 22 rows. The full set `R-P7-A` through `R-P7-H` is in
[`phase-7-exit-report.md`](phase-7-exit-report.md) §7. One of them is carried here because
it is an **open defect against a zero-tolerance list**, and an open defect that lives only
in an exit report is one nobody sees again.

| ID | Risk | Inherent | Approved control | Owner | Acceptance / prohibition | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-P7-B | The Phase 7 lazy collaboration chunk exceeded its declared size budget by 31%, and until 2026-07-27 no gate read the budget key at all (P2 quality/availability). | 3x3=9 Medium | `cf:phase7:exit:check` re-measures the entry's static import closure on every run, requires the recorded figure to stay within 2 KiB of the recomputed one, requires the status to track the measurement in both directions, and since `D-P7-03` also refuses a declared figure that moved without a decision-log entry naming it. | Technical Lead | **Renegotiated on the record by `D-P7-03`, 2026-07-28: 60 to 100 KiB.** The closure measures 91.93 KiB, so the budget reads `MET`. Not met by shrinking -- the payload did not change and no build step was added; the programme carries 91.93 KiB knowingly, at a figure an owner set with the measurement in front of them. | Closed |

**The measurement.** `config/cloudflare/phase-7-sprint-plan.json` now declares
`lazy_phase_7_chunk_max_kib_gzip: 100`, raised from 60 by `D-P7-03`. The readings below
are what that decision was taken against.

| Reading | Modules | gzip | Against 60 KiB |
|---|---:|---:|---|
| Entry closure, on Preview deployment `681ad3ca` as Cloudflare serves it | 20 | **78.4 KiB** | over by 18.4 (+31%) |
| Phase 7 modules only, same deployment | 17 | **64.3 KiB** | over by 4.3 |
| Entry closure, recomputed locally by the gate (gzip -9, CRLF normalised) | 20 | **79.32 KiB** | over by 19.32 |
| Phase 7 modules only, recomputed locally | 17 | **65.27 KiB** | over by 5.27 |

There was no definition of "the Phase 7 chunk" under which 60 passed. First measured
2026-07-26 by `CF-EV-P7-OPS-004`; reconfirmed 2026-07-27 by `CF-EV-P7-EXIT-001`. The closure
has since grown to 91.93 KiB across 22 modules, the two mutation journeys wired on 2026-07-27
being most of it; against the renegotiated 100 every reading passes, with roughly 8 KiB of headroom.

**The cause is structural.** There is no bundling or minification step in this project.
Twenty unminified source files are served exactly as authored, comments included.

**The options weighed before the decision.** The first was chosen.

| Option | Requires | Consequence |
|---|---|---|
| **Renegotiate the budget on the record -- CHOSEN, `D-P7-03`** | Product Owner | A decision-log entry raising 60 to a number the current shape meets, with the reason. Cheapest, and it concedes the 60 was never derived from a measurement. 100 was set deliberately above the 91.93 KiB measurement rather than at it: a budget at the measurement is unfalsifiable. |
| Add a build step and meet the declared 60 | Technical Lead | Minification and/or bundling of `js/collaboration/*` — the only route that shrinks the shipped bytes rather than enlarging the target. It changes how the whole app is built and would invalidate Phase 1's byte-for-byte artifact assertions. Needs its own story and gate. |
| Split the lazy chunk | Technical Lead + UX Lead | Load the eight panel surfaces on demand rather than through one entry closure. Keeps both the budget and the no-build property, at the cost of more dynamic imports and a second latency step. |
| Leave it open | no decision | Rejected. The breach would stay visible here, in the exit report §6.2, and in `config/cloudflare/phase-7-exit-gate.json`, and would keep `open_defect` on the Phase 7 zero-tolerance list unsatisfied. |

**What generalises past the number.** A budget that no script reads is not a budget. Phase
8 carries the enforcing budget row for the rest of the programme's declared limits; this
one is enforced as a record, which is weaker than enforcing the size and is recorded as
such. Renegotiating the figure did not change that: what the gate guarantees is that the
number cannot move without a decision, not that the bytes are small.

## 5. Gate G3 acceptance

- [x] Every inherent Critical/High risk has a named contract owner and evidence owner.
- [x] E2EE semantic-inspection limits, terminal provisioning loss, prior-copy/old-key limits, unlocked-browser XSS, metadata leakage, provider outage, migration/restore, and supply chain are explicit.
- [x] Non-waivable P0/P1 outcomes are listed.
- [x] R04, R08, R09, R12, and R18 decisions/runbooks received required owner approval at Gate G3.
- [ ] Every `Controlled pending evidence` item links executable passing evidence.
- [ ] R10-R12 accepted limitations appear accurately in product UX/documentation.
- [ ] No P0/P1 test is skipped/quarantined and no Critical/High item is unowned or has an expired action.
- [x] Security Reviewer, Product Owner, Technical Lead/Operations, and Senior QA sign the residual-risk contract review; implementation evidence remains pending.

**Gate G3 residual-risk assessment and Gate G4 Phase 0 exit: `PASSED`. Controlled Phase 1 implementation is authorized; production release remains `NO-GO` until evidence closes the applicable risks.**
