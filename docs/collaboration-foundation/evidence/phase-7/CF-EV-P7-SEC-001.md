# CF-EV-P7-SEC-001 Security review of the device key re-bind

Status: PASS

Story: `CF-P7-005` — extension of `js/collaboration/device-key-lifecycle.js`

## What is being reviewed

Phase 7 adds no cryptographic primitive. This story nonetheless touches the
closed Phase 5 key module, so the change is reviewed on its own terms rather than
folded into the UI evidence.

Two edits:

1. `decryptPrivateKeyBytes` — the decrypt half of `importProtectedPrivateKey`,
   split out unchanged so it has one caller more than before.
2. `rebindDeviceId(nextDeviceId, unlockSecret)` — re-protects the same private
   key under an AAD whose `deviceId` is the server-assigned one, writes the new
   record, deletes the old, and re-imports the key non-extractable.

## Why the module had to change at all

`POST /api/v1/devices` requires the public key in its body, so the pair exists
before the server assigns a device id; enrolment binds the stored key to a device
id in both the record key and the authenticated AAD. Neither frozen contract
bridges that. Re-enrolling under the assigned id would produce a different pair,
orphaning the registered fingerprint and rendering every workspace envelope later
provisioned to the device undecryptable.

Alternatives rejected: a new `bootstrap-intents` route for devices (Phase 7 may
not add routes) and a permanent local-to-server id mapping (two identities for
one device at the key-binding layer).

## Security properties, checked one by one

| Property | Result |
|---|---|
| New cryptographic primitive introduced | none — reuses `protectPrivateKey` and the existing decrypt |
| Key material generated during re-bind | none; the fingerprint is unchanged and asserted so |
| Algorithm, curve, KDF, iteration count | untouched — `P-256` ECDH, PBKDF2-HMAC-SHA-256 600,000, AES-256-GCM |
| Private key extractability after re-bind | `false`, usages exactly `deriveBits` |
| Plaintext key bytes | held in one `Uint8Array`, zeroed in `finally` on every path |
| Unlock secret | copied and zeroed by the existing helpers on both the decrypt and the re-protect |
| AAD binding | still binds version, kdf, iterations, suite, curve, userId, deviceId, fingerprint; only `deviceId` changes |
| Ordering | write-then-delete, so an interruption leaves the original record readable |
| Old record after a successful re-bind | removed; unlocking under the abandoned id fails with the uniform `LOCAL_UNLOCK_FAILED` |
| Failure disclosure | unchanged uniform failure; the re-bind adds no new error class |
| Network, logging, storage side effects | none — the module still contains no `fetch`, no `console`, no `localStorage` |

## How they were verified

**Real crypto, real IndexedDB, three browsers.** The re-bind case added to
`tests/browser-device-key-lifecycle.mjs` asserts, in Chromium, Firefox, and
WebKit:

- the re-bind reports `rebound: true` and returns the original fingerprint;
- the stored AAD's `deviceId` is the new one;
- the re-protected AAD's fingerprint equals the fingerprint the re-imported key
  unlocks with;
- the record under the abandoned device id is gone;
- unlocking under that abandoned id fails with `LOCAL_UNLOCK_FAILED`.

```
chromium: protect 274.2ms; unlock 270.1ms
firefox:  protect 816.0ms; unlock 3.0ms
webkit:   protect 607.0ms; unlock 601.0ms
CF-P5-003 browser device-key lifecycle passed (3 browsers)
```

All within the frozen 2,500 ms KDF ceiling.

**Phase 5's own gates re-run and still pass**: `cf:phase5:device-key:check`,
`cf:phase5:device-services:check`, `cf:phase5:exit:check`, and
`cf:phase6:outbox:check`. The Phase 5 gate pins required tokens and prohibited
patterns rather than an export list, so the addition does not alter what that
gate asserts — and the tokens it requires are all still present.

**The CF-P7-005 gate** additionally rejects: a re-bind that calls `generateKey`,
a re-bind that deletes before writing, a journey that performs any cryptography
itself, and a manifest claiming a new cryptographic primitive. Each is proven by
a drift case.

## Residual risk

The unlock secret must be available twice in one journey — once to enrol and once
to re-bind — so it is held by the caller across two awaits. It is not persisted,
and both consumers copy and zero it. A `bootstrap-intents` route for devices
would remove the need for the re-bind entirely and is recorded as the cleaner
long-term shape; it is out of scope for Phase 7 because it adds a route.

## Sign-off

Reviewed by the maintainer as part of CF-P7-005. DocVault is single-maintainer,
so this is one owner review and **not** an independent security review; that
framing follows the precedent set at the Phase 5 exit. No secret was read and no
remote environment was touched.
