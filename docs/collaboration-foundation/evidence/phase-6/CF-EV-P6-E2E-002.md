# CF-EV-P6-E2E-002 Conflict and copy browser evidence

Status: PASS

Story: `CF-P6-007`

`tests/browser-conflict-resolution.mjs` runs the production conflict and copy module against Chromium, Firefox, and WebKit. All three pass with zero console and page errors.

Every one of the four contracted resolutions is proven reachable from a freshly opened conflict in each engine, and the set of paths that drop the draft is asserted to be exactly one: `discard-with-confirmation`. Discard without the explicit confirmation flag is refused with `CONFIRMATION_REQUIRED`, so a stray click cannot destroy work.

Copy behaviour is verified in-browser: a stored Credential is not selectable and is refused with `CREDENTIAL_NOT_COPYABLE` before any destination encryption step, while an eligible document produces an intent that does not mutate its source, is not linked to it, and lands at revision 1.

Status descriptors are checked in every engine for a non-empty text label and a non-empty shape token, so no state is communicated by colour alone.

The test is registered in `npm run test:e2e` and runs in CI on every push.
