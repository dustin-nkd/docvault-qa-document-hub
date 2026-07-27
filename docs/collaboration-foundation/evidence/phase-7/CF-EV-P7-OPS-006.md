# CF-EV-P7-OPS-006 The API shell dispatches when the flag is on

Status: **PASS**

Story: `CF-P7-017` — dispatch the API shell when the collaboration flag is on,
and keep refusing when it is off.

## What was actually wrong

Not a dispatch that needed to be built. `functions/api/v1/[[path]].ts` already
composed `handleIdentityRuntime`, `handlePreviewKeyFoundationApi`, and
`handlePreviewCollaborationApi` — in that order, each one covering identity and
session, device and key foundation, and membership routes respectively — ahead
of `handleApiRequest`, the `api-shell.mjs` fallback. Every one of the three
gates on `resolveIdentityRuntime(...).enabled`.

`functions/_lib/identity/environment.ts` line 67 read:

```ts
if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'false') {
    return { enabled: false, mode: 'disabled' };
}
```

— enabling only when the flag equalled `'false'`. Backwards from the flag's
name, and backwards from `D-P7-01`, which set `COLLABORATION_ENABLED` to
`'true'` for the Preview environment specifically to turn this on. With the
polarity inverted, all three doors reported `enabled: false` on Preview and
every request fell through to `api-shell.mjs`'s fallback, which — independent
of this bug — computed a boolean (`hasReviewedDisabledState`) and then
returned the identical `503 COLLABORATION_UNAVAILABLE` on both branches. Two
defects, not one: the polarity made the real doors refuse; the dead branch
made the fallback's own check meaningless even on its own terms.

## The decision this story needed first

Two files agreeing with each other and disagreeing with the deployment could
mean either the code encodes the intended meaning and `D-P7-01`'s `'true'` was
the mistake, or the code is wrong. Recorded as `D-P7-02` in
[`decision-log.md`](../../decision-log.md): the Product Owner chose **Option
A** — `environment.ts` is the bug, because `D-P7-01` is dated one day earlier
and its own text says the flag was set to `'true'` for Preview so that
collaboration would be enabled there. Reversing that the next day would mean
the code was correct and `D-P7-01` accomplished the opposite of what it
approved.

## The fix

Two files, one behavioural change:

- **`functions/_lib/identity/environment.ts`** line 67's condition corrected to
  `input.COLLABORATION_ENABLED !== 'true'`. This is the entire functional fix.
  The three dispatch doors already existed and were already composed
  correctly; nothing needed to learn to dispatch.
- **`functions/_lib/api-shell.mjs`** — removed the dead
  `hasReviewedDisabledState` double-branch and collapsed it to one documented
  terminal `503`. `api-shell.mjs` is never the dispatch door — it is reached
  only once the three doors above have already declined, either because
  collaboration is genuinely disabled, or because the matched route
  (`workspaces/:id/exports`, `workspaces/:id/deletion-requests`) has no
  backing capability at all, deferred to a later phase. Both reasons answer
  the same way, so there is one path, not a branch that computed a
  distinction and discarded it. **No observable behaviour changed**:
  `tests/api-shell.test.mjs`'s NO-OP CONTROL — which calls `handleApiRequest`
  directly, outside `[[path]].ts`, and requires `503` even with the flag
  `'true'` — was re-run unmutated and still passes.

## Verified

Source-level and against the local Workers-runtime harness. No live deployment
was pushed, built, or observed by this story.

**Five workers-test fixtures updated.** Each carried a base fixture with
`COLLABORATION_ENABLED: 'false'` standing in for "enabled" under the old,
buggy polarity:

- `tests/cloudflare/identity-runtime.workers.test.ts`
- `tests/cloudflare/identity-primitives.workers.test.ts`
- `tests/cloudflare/preview-key-foundation.workers.test.ts`
- `tests/cloudflare/preview-api-integration.workers.test.ts`
- `tests/cloudflare/document-routes.workers.test.ts`

Fixing the polarity without updating them would have broken all five suites.
They now read `'true'`, matching the corrected code and `D-P7-01`.

**An explicit on/off contrast, not just a fixture flip.**
`identity-runtime.workers.test.ts` gained a test that calls
`handleIdentityRuntime` with nothing but `COLLABORATION_ENABLED` changed:

| Flag | Result |
|---|---|
| `'false'` | `null` — the door declines, exactly as before the fix |
| `undefined` | `null` |
| `'true'` | a real dispatched `200` response, `{ authenticated: false }` |

`identity-primitives.workers.test.ts` gained the equivalent pair directly
against `resolveIdentityRuntime`: an otherwise-exact Preview configuration
with the flag `'false'`, `undefined`, or `'TRUE'` (case-sensitive) all resolve
to `{ enabled: false }`; the same configuration with `'true'` resolves to
`{ enabled: true, mode: 'preview-only' }`.

**Full local run:**

| Suite | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run --config vitest.config.mts` (all 35 Workers files) | 249 tests, 249 pass |
| `node --test tests/api-shell.test.mjs` | 13 tests, 13 pass — unchanged from before this story |
| `npm test` (Node suite) | 1152 tests, 1152 pass |

## What this story does not close

**`CF-P7-013` remains PARTIAL.** This fix has not been observed on a live
deployment. Cloudflare Pages binds code at build time; the existing measured
deployment was built before this fix existed and cannot show it, and no agent
pushed a commit or triggered a new Preview build during this story. Even
against a rebuilt deployment, the journeys `CF-P7-013` must qualify are
signed-in journeys, and no OAuth session is available to an agent — obtaining
one means entering credentials at `github.com`, which is prohibited outright.
That constraint predates this fix and survives it.

**`P7-G5` is not granted.** Every-story-PASS moves to sixteen of seventeen with
this story closing, but `CF-P7-013` alone still blocks it, and the lazy-chunk
budget breach (`R-P7-B`) is untouched by this story.

**Production is unaffected.** Production and the default `vars` remain pinned
to `COLLABORATION_ENABLED='false'` by the same six gates `D-P7-01` amended;
this story changes nothing those gates check, and the fix only changes
behaviour when the flag reads `'true'`, which is Preview alone.

## Boundary

No route was added. No new dispatch logic was written — the three doors this
fix activates already existed, built across Phases 3 through 6. No deployment
was pushed, built, or measured. No credential was entered, no OAuth session was
obtained, and no write request reached any database.
