# CF-EV-P7-OPS-005 Re-qualification attempt against the deployment

Status: PASS — amended 2026-07-28. Recorded `PARTIAL — the verdict is unchanged and the reason is now larger` when written; the condition that held it short has since been cleared. See the amendment at the end.

Story: `CF-P7-013` — re-qualified by `CF-P7-014`, gate `P7-G4A` (not reached)

Measured on: 2026-07-27
Measured against: the working tree at `c08ccf1` and the deployments as they answer today
Method: read-only HTTP GET. No write request, no authenticated request, no credential
entered, no secret read or set.

## Why this record exists

`CF-P7-013` was left PARTIAL by `CF-EV-P7-OPS-001` through `CF-EV-P7-OPS-004` with a
single named blocker: `COLLABORATION_ENABLED` was not carried by the measured Preview
build, and setting it plus rebuilding was an owner action. That action has since been
taken — the owner set `COLLABORATION_ENABLED` to `'true'` for the Pages **Preview**
environment, and `D-P7-01` is executed in `wrangler.jsonc`. This record asks whether
that closed the story.

It did not. The verdict is unchanged, and the reason is no longer the one that was
recorded.

## What was measured

| Request | Status | Body |
|---|---|---|
| `GET https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev/api/v1/session` | **503** | `{"error":{"code":"COLLABORATION_UNAVAILABLE",…}}` |
| `GET https://docvault-qa-document-hub.pages.dev/api/v1/session` | **503** | `COLLABORATION_UNAVAILABLE` |
| `GET https://docvault-qa-document-hub.pages.dev/api/v1/workspaces` | **503** | `COLLABORATION_UNAVAILABLE` |

Production still refuses collaboration. That is the expected result and it is the one
result in this table that is good news.

## The second blocker, which is in the code and not in the configuration

`functions/_lib/api-shell.mjs`, lines 285–293:

```js
const hasReviewedDisabledState = env.COLLABORATION_ENABLED === 'false'
    && env.APP_ENV === env.ORIGIN_POLICY_MODE
    && ['local', 'preview', 'production'].includes(env.APP_ENV)
    && env.CANONICAL_PRODUCTION_ORIGIN === 'https://docvault-qa-document-hub.pages.dev';
if (!hasReviewedDisabledState) {
    return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);
}
return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);
```

Both branches return the identical `503`. The value that is computed routes nothing.
**No value of `COLLABORATION_ENABLED` can make any `/api/v1/*` route answer anything
else**, which is why setting the variable and rebuilding produced no change on the wire.
This is the Phase 1 "disabled API shell", written when there was nothing to dispatch to;
`functions/_lib/collaboration/key-runtime-handler.ts` now carries the identity, device,
workspace, key-envelope and eight Phase 6 document routes it could dispatch to.

Fixing it is `CF-P7-017`, which is **OPEN and not started**. An implementation pass on
2026-07-27 halted before writing anything, because a second inconsistency sits upstream
of the shell and only the owner can resolve it. `functions/_lib/identity/environment.ts`
line 67 reads:

```ts
if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'false') return { enabled: false, mode: 'disabled' };
```

The identity runtime is enabled **only when the flag says `'false'`** — the opposite of
what the flag's name means and the opposite of the `'true'` the owner set on Preview.
`api-shell.mjs:286` uses the same `=== 'false'` convention, so the two files agree with
each other and disagree with the deployed value. Either the flag string means the
opposite of its name throughout and the Preview environment variable is wrong, or the
code is wrong in at least two files. That is a semantic decision, not a guess, and it is
recorded under `CF-P7-017` in `config/cloudflare/phase-7-sprint-plan.json`.

## The third reason, which survives both of the above

Even with the API answering, **no signed-in journey could be driven by the agent that
performed this measurement.** The journeys `CF-P7-013` must qualify — sign in, create
workspace, register a device, list members, create and accept an invitation, reach a
sync state, resolve a conflict, read audit activity — all begin at an authenticated
session. Obtaining one means entering GitHub credentials at `github.com`, which is
prohibited, and no session cookie was issued to or held by this story. Qualifying
`CF-P7-013` is an owner-driven exercise and always was.

This is stated separately because it is the reason that does **not** go away when
`CF-P7-017` lands. Whoever closes `CF-P7-013` has to be someone who can sign in.

## Verdict

`CF-P7-013` remains **PARTIAL**. It is not marked PASS, and the temptation to mark it
PASS because "the API is now enabled" was measured against and refused: the API is not
enabled in any sense visible on the wire.

## Not claimed

- **Nothing about the on-path.** No `2xx` from any collaboration route has been observed
  by this programme on any deployment, ever. Nothing here asserts what dispatch would do.
- **No deployment identity.** No new Preview deployment was produced by this story —
  nothing was pushed to `codex-cf-p3-preview` before this measurement — so the branch
  alias reading above is of whatever build that alias currently serves, and is recorded
  as a branch-alias reading rather than as a deployment id.
- **No claim that the Preview environment variable is or is not set.** Wrangler exposes
  no read path for Pages environment variables, and the owner's report that it is `'true'`
  is taken as given. It makes no difference to the result, for the reason in the second
  section: the shell does not route on it.

## Amendment — 2026-07-28

**This record was written while `CF-P7-013` had no qualified journey, and it
said so.** What it measured was a re-measurement that found the same 503 and traced it to the dispatch bug rather than to configuration. Nothing in it is withdrawn: those
measurements were correct on the day, and the 503 it records really was what the
deployment answered.

What changed is not this record but the thing it was waiting on. `CF-P7-017`
corrected the dispatch polarity (`D-P7-02`), a Preview build carrying that fix
was deployed, and on 2026-07-28 the Product Owner drove the journeys on
deployment `b2520460-8d70-4f83-972b-bc31f56f5a3a` in their own browser, signed in
to their own GitHub account: sign-in, device registration, workspace creation,
device revocation and workspace switching all completed. `CF-EV-P7-OPS-002`
carries that qualification and the read-only D1 corroboration behind it.

This record's status therefore reads PASS as part of a PASS story, with the
PARTIAL it originally carried preserved in the line above rather than
overwritten. Two journeys remain unqualified and are named in
`CF-EV-P7-OPS-002`: inviting someone and having them accept, and resolving a
conflict.
