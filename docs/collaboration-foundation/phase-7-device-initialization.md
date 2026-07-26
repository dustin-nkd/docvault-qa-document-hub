# Collaboration Foundation Phase 7 — Device and key initialization

Status: **PASS — `CF-P7-005`, entry `P7-G2B`, exit `P7-G2C`**

Surface 4 of twelve. `P7-G2C` authorizes `CF-P7-006` only.

## 1. Why this story was the largest gap

The device register, the workspace key envelope, and the provisioning services
all existed and were proven before this story. Nothing reached them. Closing
gate scenarios G2 and G3 in Phase 6 meant driving these calls by hand, and
without this surface a second member could not join a workspace unaided.

## 2. A seam neither frozen contract closed

Building the journey surfaced a real defect in the seam between two contracts
that were each correct alone.

- `POST /api/v1/devices` carries `{publicJwk, fingerprint, suite}` in its body,
  so **the key pair must exist before registration**.
- The route derives the device id itself (`requestId(dependencies)` in
  `functions/_lib/collaboration/key-runtime-handler.ts`) and **ignores any id the
  client proposes**.
- `DeviceKeyLifecycle.enroll` binds the stored key to a device id in **both** the
  IndexedDB record key and the authenticated AAD, so **it needs the id first**.

Each side is reasonable; together they do not meet. Re-enrolling under the
assigned id is not a way out: it generates a *different* pair, so the fingerprint
already registered would point at a key this browser no longer holds, and every
workspace envelope later provisioned to the device would be undecryptable — a
failure that would surface much later, as an unopenable workspace, far from its
cause.

### What was done, and what was rejected

Three resolutions were considered.

| Option | Rejected because |
|---|---|
| Add `POST /devices/bootstrap-intents`, mirroring the workspace flow | Architecturally the cleanest, but it is a **new route**, which Phase 7 may not add. It belongs to a story of its own. |
| Keep a client device id permanently and map it to the server's | Leaves two ids for one device at the E2EE key-binding layer, where a lasting ambiguity is most expensive. |
| **Extend the key lifecycle with a re-bind** | **Chosen.** No route, no schema, no server change, and the logic lands in the crypto module rather than in a view. |

The Phase 7 governing principle points here directly: *where a surface needs
behaviour a service did not expose, extend that service under its own review,
never inline the logic in a view.*

## 3. The re-bind

`DeviceKeyLifecycle.rebindDeviceId(nextDeviceId, unlockSecret)` re-protects the
**same** private key under a new AAD and moves the record.

- No key material is generated. The fingerprint is unchanged, which is the whole
  point — the registered public key still matches what this browser holds.
- No new cryptographic primitive. The decrypt half of
  `importProtectedPrivateKey` was split out as `decryptPrivateKeyBytes` so the
  re-bind re-uses it rather than carrying a second copy of the same decryption.
- **Write, then delete.** An interruption leaves the original record intact. The
  opposite order can destroy the only copy of a key that cannot be regenerated.
- Qualified in Chromium, Firefox, and WebKit with real Web Crypto and real
  IndexedDB, not stubs.

## 4. The journey

1. **enrol** under a locally generated id;
2. **register** — the server assigns the id and echoes the fingerprint it stored;
3. **compare** that fingerprint against the enrolled one;
4. **re-bind** onto the assigned id.

Step 3 is load-bearing. If the server stored a fingerprint other than the one
this browser holds, setup stops here rather than binding a key that could never
open anything.

The gate enforces all four positions structurally, and rejects a journey that
performs any cryptography itself.

## 5. Readiness is rendered, not invented

`WorkspaceKeyReadiness` is frozen by CF-P5-005 with exactly five values:
`key_ready`, `pending_key`, `stale_key`, `not_entitled`, `revoked`.

An earlier draft of this story rendered seven, having read `active`, `removed`,
and `rotating` out of neighbouring SQL literals rather than out of the type. The
gate caught it, which is what the gate is for. The rendered set is now pinned to
the server's declared union — parsed from the type, not substring-matched, since
`'rotating'` does occur elsewhere in that file and would satisfy a looser check.

`pending_key` and `stale_key` both mean "waiting" and are deliberately kept
apart: telling someone who already had access that they are waiting to be granted
it is a different and more confusing message than telling them their copy went
out of date. Waiting is **not** an error and is never rendered as one.

## 6. The fingerprint exists to be read aloud

`show-fingerprint` is how two people confirm, out of band, that the right device
is about to receive a key. The value is grouped into four-character blocks and
never altered — an unbroken 43-character run is read wrongly, and being read
wrongly is the one failure this control cannot afford. It is rendered
monospaced and allowed to wrap between groups.

## 7. Revocation order

The server is revoked first, then the local key is deleted. The reverse would
leave the server treating the device as active while the key that makes it usable
is gone: an entry nobody can use and nobody can see is dead. A refused revocation
therefore leaves the device fully working rather than half dead.

## 8. Verification

- `cf:phase7:device:check` — the story gate, wired into `check:cloudflare`.
- `tests/collaboration-device-initialization.test.mjs` — 35 unit tests.
- `tests/cloudflare-phase-7-device-policy.test.mjs` — 31 drift cases.
- `tests/browser-device-key-lifecycle.mjs` — the re-bind proven in three browsers.
- Browser qualification at 320 px in both themes.

## 9. Boundaries held

No route, no schema, no migration, no remote environment. No new cryptographic
primitive. No personal storage key, no `innerHTML`, no `fetch` and no identifier
minting inside the journey. Phase 5's own gates were re-run and still pass.
