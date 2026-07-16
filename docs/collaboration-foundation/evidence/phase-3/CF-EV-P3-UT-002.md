# CF-EV-P3-UT-002 — OAuth transaction unit evidence

Status: PASS

Story: `CF-P3-003`

Date: 2026-07-16

The Workers-runtime suite executes eight deterministic lifecycle tests against disposable local D1. It verifies ten-minute server-time expiry, digest-only state storage, encrypted PKCE context, previous-key lookup, exact callback binding, bounded cleanup, and stable non-enumerating failures.

Command: `npx vitest run tests/cloudflare/oauth-transaction-lifecycle.workers.test.ts --reporter=verbose`

Result: 1 file passed, 8 tests passed, 0 skipped, 0 unhandled errors.

No provider request, remote write, route activation, user write, or session write is part of this evidence.
