# CF-EV-P6-E2E-001 Offline outbox browser evidence

Status: PASS

Story: `CF-P6-006`

`tests/browser-outbox.mjs` runs the production outbox module against real IndexedDB in Chromium, Firefox, and WebKit, served over a local origin by the same harness pattern the Phase 5 device-key browser test uses. All three engines pass, and both console errors and page errors are asserted empty.

A real IndexedDB round trip is verified rather than assumed. An entry is enqueued with a `Uint8Array` payload and draft, claimed, and read back; the payload is asserted to still be a `Uint8Array` with byte-for-byte identical contents. Structured-clone behaviour for typed arrays differs enough between engines that this is worth proving rather than trusting.

Durability across a page reload is the property the outbox exists for, so it is tested directly: after `page.reload()`, a freshly constructed outbox over the same database finds the queued entry intact with its bytes unchanged. Work queued while offline therefore survives the user closing and reopening the tab.

Namespace isolation is verified inside a real browser over one shared database. A second outbox constructed with a different namespace — a different user in the same workspace and device — sees zero entries and claims nothing, so a context switch cannot execute another context's queued work.

Quarantine is exercised in the browser rather than only in Node. After `quarantine('device-revoked')`, the stored entry reports state `quarantined` with that exact reason, still carries its encrypted draft as bytes, and is no longer claimable. Nothing is deleted.

The test is registered in `npm run test:e2e`, so it runs in CI on every push alongside the browser smoke and device-key suites.
