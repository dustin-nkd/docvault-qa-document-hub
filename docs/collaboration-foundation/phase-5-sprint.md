# Phase 5 sprint - E2EE key foundation

Status: **READY FOR APPROVAL AT `P5-G0`**

Sprint ID: `CF-P5-S01`

Planned dates: 2026-07-20 through 2026-08-14 (20 working days, Asia/Ho_Chi_Minh)

Owners: Product Owner, Technical Lead, Senior Developer, Senior QA

Required reviewers: Security Reviewer, Operations, Privacy Reviewer; UX Lead for unlock, provisioning, revocation, rotation, and terminal-loss journeys

## 1. Sprint decision and authorization boundary

Phase 4 is PASS. `P5-G0`, `P5-G1`, and `P5-G2` were approved on 2026-07-18. `CF-P5-001` through `CF-P5-003` are PASS; `P5-G2A` is pending and may authorize `CF-P5-004` only. No migration, runtime route, remote D1 write, Preview deployment, Production binding, Production identity, or collaboration activation is authorized. Every later story requires its preceding gate, and remote Preview integration requires the separate `P5-G4` authorization.

This sprint resolves a planning conflict explicitly. The approved implementation roadmap defines Phase 5 as device/workspace-key foundation and Phase 6 as encrypted documents, revisions, conflicts, and sync. The earlier Phase 5 handoff accidentally pulled those Phase 6 domains forward. The user's explicit “E2EE key foundation” scope and the implementation roadmap are now controlling: Phase 5 is key-only. Document ciphertext, document CRUD/revisions, conflicts, tombstones, offline outbox, and sync remain Phase 6. Full collaboration document UX and Personal-to-workspace copy remain Phase 7.

The following are prohibited throughout Phase 5:

- Production D1, identity, device/key routes, secrets, data, or feature activation;
- collaboration or key behavior on GitHub Pages;
- a deployed test/authentication bypass or real customer data;
- server-visible plaintext device private keys, PKCS#8, unlock secrets, KEKs, workspace DEKs, or decrypted document semantics;
- server escrow, unlock reset, exported key-recovery artifact, algorithm negotiation, crypto downgrade, or plaintext fallback;
- document/revision/sync routes or persistence behavior;
- editing an applied migration, silently adding a migration, or restoring shared Preview without a separate destructive-operation approval.

## 2. Sprint goal and exit state

Deliver a reviewed, independently verified, device-bound workspace-key foundation on isolated Preview without giving Cloudflare, D1, operators, logs, builds, or fallback origins plaintext keys.

At Phase 5 exit:

- canonical RFC 8785 JCS, base64url, UUID/integer, public JWK, fingerprint, algorithm, and resource-bound validators are immutable;
- P-256 device private keys persist only as PBKDF2-600k/AES-256-GCM encrypted PKCS#8 envelopes and unlock as non-extractable `deriveBits` keys;
- D1 stores only canonical public device keys/fingerprints and versioned per-device workspace-key envelopes;
- workspace DEKs are generated and wrapped client-side through ephemeral P-256 ECDH, HKDF-SHA-256, and AES-256-GCM;
- only active key-ready Owner/Admin devices can provision another eligible active device, with canonical target fingerprint revalidation;
- invitation acceptance remains `pending_key` until a current, valid, bound envelope exists;
- rotation is Owner-initiated, monotonic, interruption-safe, excludes removed/revoked devices, and cannot downgrade;
- another active key-ready Owner/Admin is the only recovery path; all-provisioners-lost is truthful terminal cryptographic loss;
- fixed positive/negative vectors agree with an independent oracle and pass the supported-browser matrix;
- Preview device/key journeys meet privacy, security, accessibility, performance, rollback, and recovery gates;
- Production and collaboration activation remain `NO-GO`; Phase 6 receives contracts and evidence, never plaintext keys.

## 3. Controlling contracts

Implementation must conform to:

- `ADR-004` device and workspace keys;
- `ADR-005` metadata encryption boundary;
- `ADR-009` invitation and `pending_key` behavior;
- `ADR-010` revocation, rotation, and recovery;
- `ADR-011` browser/API security and `ADR-012` migrations/rollback;
- `crypto-contract.md`, `schema-contract.md`, `api-contract.md`, and `quality-strategy.md`;
- threats T06-T10, T12-T13, T16, T18-T19, T21 and risks R03, R05-R07, R09-R11, R13, R15-R19, R21-R22;
- Phase 4 exit: schema 10, ten applied migrations, zero collaboration business rows, Production D1 absent, collaboration disabled.

No existing generic persistence recipe is implementation authority for Phase 5. The Phase 2 envelope recipe does not prove the wrapper owns an unrevoked current-version envelope, and the generic rotation recipe does not freeze an eligible-device snapshot. Dedicated typed repositories and atomic recipes are required after their contracts pass review.

## 4. Frozen sprint-level decisions

### 4.1 Cryptographic registry

- Canonical JSON: RFC 8785 JCS; binary: strict unpadded canonical RFC 4648 base64url.
- Device key: `P256-ECDH-v1`; canonical public JWK fingerprint is SHA-256 over JCS.
- Local private-key protection: PBKDF2-HMAC-SHA-256 exactly 600,000 iterations, fresh 16-32-byte salt, AES-256-GCM, fresh 12-byte nonce, 16-byte tag.
- Workspace envelope: fresh ephemeral P-256 ECDH, fresh 32-byte HKDF-SHA-256 salt, domain-separated info, AES-256-GCM, exact workspace/user/device/fingerprint/wrapper/version AAD.
- Workspace DEK: exactly 32 random bytes generated in an authorized browser; never generated, unwrapped, escrowed, reset, or recovered by the server.
- Producers never reuse a nonce, salt, or ephemeral key and never weaken PBKDF2 to satisfy a performance gate.

### 4.2 Local key lifecycle

The device pair is extractable only long enough to export PKCS#8 during creation. IndexedDB may retain only the approved encrypted private-key envelope. Unlock validates all bounds before KDF work, authenticates and imports PKCS#8 non-extractable with usage exactly `deriveBits`, and clears application references on lock, logout, account/workspace switch, revocation, and observable page termination. JavaScript physical zeroization is not claimed. Unsupported crypto/storage, private-mode limitations, quota errors, or corrupt envelopes fail closed and never mark a device key-ready.

### 4.3 Three decisions that block implementation at `P5-G1`

1. First provisioner: Phase 4 workspace bootstrap sets `current_key_version=1` but intentionally creates no key-version/envelope row. `CF-P5-001` must freeze an atomic creator-device/key-version/envelope transition without generic Owner/Admin provisioning or a server-generated DEK.
2. Wrapper authority: envelope submission must prove the wrapper device itself owns a live, unrevoked envelope for the current workspace version; role alone is insufficient.
3. Rotation persistence: the API contract requires a rotation ID and immutable eligible-device snapshot, while schema 10 has neither. `CF-P5-001` must prove schema 10 sufficient or propose a separately reviewed forward-only migration behind a conditional authorization. No migration is implied by sprint approval.

### 4.4 Environment topology

| Environment | Maximum Phase 5 state | Key behavior |
|---|---|---|
| Local test | Disposable schema-10-or-approved-forward D1, deterministic crypto seams only at module boundaries, synthetic vectors | Full deterministic services and fault/race tests; no external network |
| Browser test | Disposable origin/storage and synthetic users/devices | Real Web Crypto and IndexedDB; supported-browser qualification |
| Preview before `P5-G4` | Existing isolated D1 and identity/control-plane runtime | Key routes disabled; aggregate read-only preflight only |
| Preview after `P5-G4` | Reviewed device/key routes, synthetic users/devices only | Real sessions; no test bypass; cleanup/reconciliation required |
| Production | No D1 binding, key secret, identity, or business/key routes | Disabled `503` shell |
| GitHub Pages | Static Personal/Guest fallback | No collaboration session, key, API, or imitation UI |

## 5. Story backlog and gates

### `CF-P5-001` - Freeze key-foundation contract, vector plan, and schema decisions

Size: M | Entry: `P5-G0` | Exit: `P5-G1`

Owners: Product Owner, Technical Lead, Senior QA. Reviewers: Security, Operations, Privacy, UX.

Tasks:

1. Reconcile ADR, crypto, API, schema, quality, threat, risk, implementation roadmap, and Phase 4 handoff.
2. Freeze exact byte formats, validation order, error taxonomy, operation/state matrix, IndexedDB schema, browser profiles, reference hardware, lifecycle clearing, and privacy surfaces.
3. Publish immutable synthetic vector IDs and an independently implemented reference-oracle strategy.
4. Freeze exact route methods/paths only for later stories; current authorized route count stays zero.
5. Close first-provisioner, wrapper-current-envelope, and rotation-snapshot decisions.
6. Record either “schema 10 sufficient” or a conditional forward-only migration proposal; apply neither.

Acceptance: every decision and residual risk has an owner/reviewer; no migration, source implementation, route, binding, secret, remote write, or activation occurs. Evidence: `CF-EV-P5-STA-001`, `CF-EV-P5-SEC-001`.

### `CF-P5-002` - Implement canonical crypto primitives and independent immutable vectors

Size: L | Entry: `P5-G1` | Exit: `P5-G2`

Implement strict JCS/base64url/UUID/integer schemas, canonical P-256 public JWK import and fingerprint, approved HKDF/AES-GCM helpers, constant-time digest comparison, CSPRNG-only generation, and immutable positive/negative vector fixtures. The production implementation and independent oracle must agree byte-for-byte for 100% of vectors. Mutation cases change every field, byte length, suite, AAD binding, point, salt, nonce, tag, and ciphertext. No device persistence, route, D1 write, or Preview change.

Acceptance: zero downgrade/plaintext fallback; zero reuse across 100 trials; malformed/off-curve/private/unknown JWK fields fail before domain mutation; no canary reaches logs/build. Evidence: `CF-EV-P5-UT-001`, `CF-EV-P5-VEC-001`, `CF-EV-P5-SEC-002`.

### `CF-P5-003` - Implement protected browser device-key lifecycle

Size: XL | Entry: `P5-G2` | Exit: `P5-G2A`

Implement P-256 generation, one-time PKCS#8 export, PBKDF2-600k/AES-GCM protection, encrypted-only IndexedDB persistence, non-extractable unlock, explicit lock, context-bound storage, auto-lock/reference clearing, corruption/quota/private-mode handling, and unsupported-browser guidance.

Acceptance: persistent surfaces contain only the approved encrypted envelope; wrong secret and every altered binding fail uniformly; no private field/PKCS#8/unlock/KEK appears in API, D1, DOM attributes, cache, telemetry, log, crash, build, or CI evidence; browser performance and lifecycle gates pass. Evidence: `CF-EV-P5-UT-002`, `CF-EV-P5-E2E-001`, `CF-EV-P5-SEC-003`, `CF-EV-P5-PERF-001`.

### `CF-P5-004` - Implement device registration, inventory, and revocation services

Size: L | Entry: `P5-G2A` | Exit: `P5-G2B`

Build typed repositories/services for self-device registration, bounded inventory, and revocation. Recompute canonical fingerprint server-side; a changed key requires a new device ID. Live session, Origin/CSRF, actor, device ownership, idempotency, and audit are authoritative. The server never accepts the encrypted private-key envelope. No HTTP route or remote write is enabled in this story.

Acceptance: concurrent duplicate registration converges safely; actor/device/public-key substitution fails with zero partial state; revocation blocks subsequent device-bound operations and future envelope eligibility; exactly one authoritative audit/result accompanies each successful mutation. Evidence: `CF-EV-P5-UT-003`, `CF-EV-P5-INT-001`, `CF-EV-P5-SEC-004`, `CF-EV-P5-QA-001`.

### `CF-P5-005` - Implement workspace key bootstrap, envelopes, and readiness

Size: XL | Entry: `P5-G2B` | Exit: `P5-G2C`

Implement client-side 32-byte workspace DEK generation, atomic first-provisioner bootstrap, per-target ephemeral ECDH/HKDF/AES-GCM wrapping, canonical target-key lookup, current wrapper-envelope proof, compare-and-set target fingerprint, current-version binding, unique envelope persistence, and `pending_key` to active readiness transition.

Acceptance: only active key-ready Owner/Admin devices provision; Editors, Viewers, pending, removed, revoked, cross-workspace, stale-version, changed-fingerprint, wrong-wrapper, replay, downgrade, and duplicate cases create no envelope/readiness side effect. Thirty-two concurrent identical submissions yield one envelope, one readiness transition, one audit result. Evidence: `CF-EV-P5-UT-004`, `CF-EV-P5-INT-002`, `CF-EV-P5-SEC-005`, `CF-EV-P5-QA-002`.

### `CF-P5-006` - Implement monotonic rotation and no-escrow recovery

Size: XL | Entry: `P5-G2C` | Exit: `P5-G3`

Implement Owner-only rotation start, immutable eligibility snapshot, current+1 key version, complete eligible envelope set, interruption/resume/idempotency, atomic commit, removal/revocation future-key exclusion, historical envelope policy, alternate Owner/Admin provisioning, and truthful all-provisioners-lost state. D1 recovery restores ciphertext/metadata only and never claims key recovery.

Acceptance: twenty concurrent proposals create one current version `n+1`, no gaps/downgrade/partial readiness; old-version new operations fail; alternate provisioner succeeds; terminal loss exposes no server reset/escrow/artifact; interrupted rotation is resumable without weakening the active version. Evidence: `CF-EV-P5-UT-005`, `CF-EV-P5-INT-003`, `CF-EV-P5-E2E-002`, `CF-EV-P5-SEC-006`, `CF-EV-P5-OPS-001`.

### `CF-P5-007` - Integrate and qualify isolated Preview key foundation

Size: XL | Entry: `P5-G3`; remote authorization: explicit `P5-G4` | Exit: `P5-G4A`

Integrate only the reviewed device/key routes on isolated Preview. Use real Preview sessions, exact Origin/CSRF, live RBAC, scoped repositories, privacy-safe audit, no-store responses, Service Worker bypass, bounded bodies/pages/rates, and synthetic users/devices. Run multi-context enrollment, unlock, pending-key, provisioning, revocation, rotation, alternate-provisioner, corrupt-envelope, and terminal-loss journeys. Run supported-browser, performance, privacy canary, dependency/CSP/artifact, fallback, rollback, and recovery matrices, then reconcile synthetic state.

Acceptance: no test bypass; Preview routes and browser journeys pass; Production stays `503` with no D1; GitHub Pages stays static/API-less; no shared Preview restore; no business/key plaintext leaks. Evidence: `CF-EV-P5-E2E-003`, `CF-EV-P5-PERF-002`, `CF-EV-P5-SEC-007`, `CF-EV-P5-OPS-002`, `CF-EV-P5-QA-003`.

### `CF-P5-008` - Assemble Phase 5 exit and Phase 6 handoff

Size: M | Entry: `P5-G4A` | Exit: `P5-G5`

Reconcile every manifest/evidence record, schema/migration digest, remote aggregate, deployment ID, security/privacy exception list, performance/browser profile, dependency/artifact result, compatible rollback, disposable recovery, risk review, and sign-off. Phase 6 receives stable key interfaces/vectors and deferred document/revision/sync scope without receiving any plaintext key material.

Acceptance: zero P0/P1 exception or open defect, zero unowned/expired Critical/High risk, all recovery claims accurate, and Product, QA, Security, Operations, Privacy, UX, and Technical Lead sign off. Production activation remains a separate later gate. Evidence: `CF-EV-P5-QA-004`, `CF-EV-P5-SEC-008`, `CF-EV-P5-OPS-003`, `CF-EV-P5-STA-002`.

## 6. Gate sequence

```text
P5-G0 sprint approval
  -> CF-P5-001 contract/vector/schema freeze -> P5-G1
  -> CF-P5-002 canonical crypto + oracle -> P5-G2
  -> CF-P5-003 protected browser device key -> P5-G2A
  -> CF-P5-004 device services -> P5-G2B
  -> CF-P5-005 workspace envelopes/readiness -> P5-G2C
  -> CF-P5-006 rotation/recovery -> P5-G3
  -> explicit P5-G4 remote authorization
  -> CF-P5-007 Preview integration/qualification -> P5-G4A
  -> CF-P5-008 exit/Phase 6 handoff -> P5-G5
```

The frozen sequence-11 additive rotation migration requires separately approved conditional Gate `P5-G2C-M` before `CF-P5-006` may create it locally. It never inherits authority from sprint approval; remote Preview apply still requires `P5-G4`.

## 7. Quality and performance budgets

- Correctness: 100% immutable positive and negative vector agreement with an independent oracle; zero downgrade or plaintext fallback.
- Uniqueness: 100 key/envelope trials produce zero duplicate nonce, salt, or ephemeral key.
- Concurrency: 32 identical envelope submissions produce exactly one envelope/readiness/audit result; 20 rotation proposals produce exactly one `n+1` version.
- Provisional Gate P5-G0 ceiling for PBKDF2 600k on the slowest recorded supported profile: p95 <=1,500 ms and max <=2,500 ms. Device protect/unlock p95 <=2,000 ms. `CF-P5-001` must record the profiles and freeze the final budget; iterations are never reduced to pass.
- Workspace wrap and unwrap p95 <=250 ms each; provisioning 25 devices p95 <=3,000 ms.
- Preview authenticated API reads p95 <=300 ms and writes p95 <=500 ms under the approved ten-active-user profile.
- Personal/Guest startup requests zero eager Phase 5 crypto modules and loads zero eager Phase 5 crypto bytes. Lazy Phase 5 crypto chunk <=50 KiB gzip; total collaboration startup ceiling remains <=75 KiB gzip.
- Bounds before crypto/D1: AAD <=4,096 bytes, JWK <=512 bytes, local private envelope <=4,096 bytes, workspace envelope <=8,192 bytes, request <=1 MiB.
- Supported browsers: latest two stable Chrome, Edge, and Firefox plus Safari 17.4+. Unsupported/private-mode/storage failure is an explicit fail-closed result, not a skip.
- Zero P0/P1 skip, quarantine, disabled case, conditional omission, accepted flake, open defect, forbidden-material canary, unauthorized unwrap/provision, revoked-device future envelope, or exploitable Critical/High dependency.

## 8. Recovery and operational matrix

Required rehearsals cover alternate provisioner, unavailable original, wrong/forgotten unlock secret, corrupt envelope, lost/revoked device, removed member, interrupted/retried rotation, old-version client, D1 fault at every atomic statement, adjacent-runtime/schema rollback, disposable D1 restore, and all-provisioners-lost.

Time Travel for shared Preview is read-only and retains only a bookmark fingerprint. A shared restore requires separate destructive approval. D1 RPO/RTO evidence applies only to ciphertext and metadata and never proves DEK/private-key recovery. Rollback preserves monotonic key versions and envelope history.

## 9. Hard blockers and exit recommendation

The sprint stops on any plaintext/private material outside transient authorized browser memory, crypto downgrade, malformed-input acceptance, nonce reuse, cross-binding unwrap, unauthorized provisioner, stale/revoked future-key access, partial atomic state, inaccurate recovery claim, first-party XSS capable of using unlocked keys, P0/P1 test exception, Production binding/activation, or fallback collaboration behavior.

`P5-G0` recommendation: **APPROVE `CF-P5-001` ONLY**. The recommendation does not pre-approve its unresolved schema decision or any subsequent story.
