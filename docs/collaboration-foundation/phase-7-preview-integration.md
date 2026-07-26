# Collaboration Foundation Phase 7 — Integrate and qualify on Preview

Status: **PARTIAL — `CF-P7-013`, entry `P7-G4`, exit `P7-G4A`**

`P7-G4A` authorizes `CF-P7-014` only, and is **not reached**. See §7.

## 1. What this story is for

Eleven stories built twelve surfaces and each one passed its own gate. None of
them could see the shape of the whole, and the whole is what a user gets. This
story is the only one that goes through the build, through the deployment, and
through the interface as a person would.

It has found three defects that no part-wise check could:

| Found | Where it hid |
|---|---|
| The artifact did not contain the collaboration modules | `build-pages.mjs` collected what `index.html` referenced, and the lazy design deliberately means it references none of it. Fixed in `e053b85`. |
| No API client layer existed at all | Eleven gates each asserted their surface performs no transport. All eleven were right. Nobody owned the other side. Fixed by `CF-P7-015`. |
| The chrome overflowed the page at 320 px | `.collab-switcher` is a flex item and defaults to `min-width: auto`, so the context name could never shrink and its ellipsis never applied. CF-P7-012 qualified the switcher standing alone, where there is no flex parent to refuse. |

Each one is the same shape: a correct part-wise check is not a whole-system
check.

## 2. Composition

Three commits, in order.

**`fe0fa2e` — the panel.** `surface-panel.js` mounts all eight remaining
surfaces, each with its own base states. Its governing rule: *a surface that is
absent is indistinguishable from one that is broken; a surface that says it is
loading is neither.* An undelivered list therefore renders `loading` and never an
empty one, because an empty member list is a claim about the workspace that the
panel is not entitled to make before the read returns.

**This commit — the reads.** The panel took a `data` object that nothing ever
populated, so every surface mounted and every one of them mounted in `loading`,
permanently. Three things close that:

- `services.js`, the adapter. The surfaces call `api.listMembers`,
  `api.readCurrentKeyEnvelope`, and twelve more names like them; the CF-P7-015
  client speaks `request`, `list`, and `mutate`. Both halves are right and
  neither can reach the other. This is the join, and it is nothing else: a name
  on one side, a frozen route on the other.
- `entry.js` asks each surface's own authorized read and paints the answers.
- `js/deployment.js` hands the entry a store, an environment, and the address
  bar. Without the first two a returning user's workspace is never restored;
  without the third an invitation link is a fragment nothing reads.

### The two decisions the adapter makes

Everything else it delegates. These two it cannot.

**Path segments are validated before interpolation.** The client refuses a path
that leaves the origin, but `/api/v1/workspaces/../../admin` is same-origin and
starts with the versioned prefix, and would survive it. Every identifier the
server issues is a UUID v4, so anything else is refused before a URL exists.

**A server refusal is raised, not returned.** The client answers
`{ok: false, failure}` because it has no opinion about what a caller should do.
The journeys were written to `catch` and read `error.code`. Translating between
the two conventions once is cheaper than asking fourteen call sites to remember
which one they are talking to.

## 3. Reads, and what they are allowed to be

Each surface's read is independent. They run together, because they do not
depend on each other and a serial chain would make the panel as slow as their
sum; they settle independently, because a denial on one is a fact about that
surface and about nothing else. The member list being refused says nothing about
whether the activity log can be read.

**Nothing is asked that the current role may not ask.** An editor's invitation
list would come back denied, and rendering that denial would replace the
surface's own role-disabled explanation — which is correct, and says why — with a
generic failure that does not.

**A read that came back refused is not `loading`.** The panel's rule is right
while a read is in flight and wrong the moment it has failed: a surface left on
`loading` after a denial is the permanent-loading defect wearing the honest
state's clothes. So absence of a key still means "not back yet", and an entry in
`data.failures` means "back, and it was a no".

## 4. `Access removed`, which may not be guessed

The API answers the same non-disclosing code whether or not a resource exists,
precisely so a stranger cannot probe for workspaces. Claiming "your access was
removed" from that code would undo it — the message itself would confirm the
resource is there.

So the state is claimed only after the workspace list, which the caller is always
entitled to read, comes back without this workspace in it. A re-check that itself
fails claims nothing: unknown is not removed. All three paths are driven by the
gate, including the one where the denial is real and the membership is intact.

## 5. What was measured, and where

Locally, in Chromium, Firefox, and WebKit, against the real module graph, the
real stylesheet, and the shipped entry — with the transport stubbed and nothing
else. At 320, 768, and 1024 px in both themes:

| Measurement | Result |
|---|---|
| Panel surfaces mounted | 8 |
| Routes called through the client | 6 |
| Surfaces left on `loading` after every read returned | 0 |
| Horizontal page scroll | none |
| Disabled controls with no announced reason | 0 |
| Console errors | none |
| A workspace chosen through the switcher, then remembered | yes |

The switcher case matters more than it looks. A first-time visitor has nothing
remembered, and until this story nothing listened to the switcher's options — so
every workspace-scoped surface stayed empty no matter what was clicked, which
looks exactly like an account with no workspaces.

## 6. Declared limits

Five journeys cannot complete in this build. Each is declared in
`config/cloudflare/phase-7-preview-integration.json` with what is missing and
why, printed by the gate at run time, and — where a control would otherwise look
ready — held disabled with its reason in text rather than failing on press.

| Journey | Missing |
|---|---|
| Register this device | An unlock secret. The passphrase surface that would collect one is not among the twelve CF-P7-001 froze. |
| Create a workspace | A client-side workspace-DEK sealer. Writing one is a new cryptographic primitive, which the governing principle forbids. |
| Accept an invitation | An active device, for the reason above. The review half is composed and reads live. |
| Resolve a conflict | An open workspace document. No document surface exists in the frozen inventory. |
| Sign in | A CSRF-exempt path through the client. The OAuth start route is public and CSRF-exempt; the client requires CSRF on every mutation, and that refusal is one of the things its own gate proves. |

Two of the five sync states are reachable here — `Saved` and `Access removed`.
`Saving`, `Offline`, and `Conflict` all derive from outbox entries for an open
document, and there is nothing in the frozen inventory that creates one.

None of these is a defect in a surface. Every one of them is a seam between what
Phase 7 was allowed to build and what a complete journey needs, and each belongs
to a story of its own rather than to a quiet extension of this one.

## 7. Why this is not PASS

The measured Preview deployment `4c5d7c8a` answers **`503
COLLABORATION_UNAVAILABLE`** on both `/api/v1/session` and `/api/v1/workspaces`.
`COLLABORATION_ENABLED` is not set for that environment.

The surface behaves correctly under it — a deployment with collaboration off says
so plainly rather than offering a sign-in that cannot succeed — and that is worth
recording. But no authenticated journey exists to qualify, and a story whose exit
criterion is "qualify the journeys on Preview" cannot close by qualifying none.

Unblocking it is an owner action and only an owner action:

1. Set `COLLABORATION_ENABLED` for the Preview environment of the Pages project.
2. Redeploy `codex-cf-p3-preview`. Pages binds environment variables at build
   time, so setting the variable is not enough on its own.
3. Report the new deployment id.

`wrangler pages secret put` is refused to an agent by the permission classifier,
which is why this is stated as a request rather than performed.

The gate enforces exactly one thing about this: **a PASS may not be claimed
without a journey qualified against a deployment where collaboration is enabled.**
Everything else in this story can be true, and is, while the feature is switched
off.

## 8. Verification

- `cf:phase7:preview:check` — the story gate, wired into `check:cloudflare` and
  pinned in `scripts/cloudflare-ci-policy.mjs`. It **drives** the shipped entry
  against a recording transport rather than reading it: a gate that grepped for
  `renderSurfacePanel` would have passed on the exact state this story found.
- `tests/collaboration-services.test.mjs` — 19 adapter cases.
- `tests/collaboration-integration.test.mjs` — 21 cases over the whole path.
- `tests/cloudflare-phase-7-preview-policy.test.mjs` — 35 drift cases.
- `tests/browser-collaboration-integration.mjs` — the composed shell in three
  browsers, at three widths, in both themes.

## 9. Boundaries held

No route, no schema, no migration, no new primitive, no production environment.
Zero collaboration modules on Personal startup, before and after composition.
Zero personal storage keys touched on any collaboration path. Transport still
lives in exactly one module, and the CF-P7-015 gate now walks the entry's import
graph to check that claim rather than take it.
