# CF-EV-P7-UI-001 Collaboration shell, availability banner, and base states

Status: PASS

Story: `CF-P7-002` — surfaces `base-states` and `github-pages-banner`

## What shipped

| Module | Role |
|---|---|
| `js/deployment.js` | app-shell predicate and banner control |
| `js/collaboration/base-states.js` | the four base states, model and renderer |
| `js/collaboration/shell.js` | lazy mount, unmount, state display |

Markup for the banner and the shell mount point ships in `index.html`, both
hidden. Styles are scoped under `.collab-*` in `style.css`.

## Why the deployment predicate is not a collaboration module

The banner exists to tell a user on GitHub Pages why collaboration is absent —
a user who by definition must never load collaboration code. Putting the
predicate in `js/collaboration/` would have forced a choice between breaking the
zero-module startup budget and leaving that user with no explanation. It
therefore lives in the app shell at `js/deployment.js`, dependency-free, and
`shell.js` consumes the same verdict rather than deciding again.

## Verified in a real browser

Loaded from a local server at `?guest=1`:

| Check | Result |
|---|---|
| Collaboration scripts loaded on startup | **0** |
| `js/deployment.js` present and precached | yes |
| Banner on a supported deployment | hidden |
| Shell mount point | hidden, empty |
| Console errors | none |

Simulating a GitHub Pages origin revealed the banner with
`data-reason="github-pages"`. The shell was then reached through a dynamic
`import()` — the first collaboration code of the session — and each base state
rendered:

| State | Shape | `aria-live` | `aria-busy` |
|---|---|---|---|
| empty | square | polite | — |
| loading | spinner | polite | true |
| unauthorized | lock | assertive | — |
| error | triangle | assertive | — |

Four distinct shapes, so no state depends on colour to be told apart.

## Responsive floor

At the contract's 320 px minimum: document scroll width 320, **no horizontal
page scroll**, and no child of either surface overflowing its container.

## Behaviour the tests pin

`tests/collaboration-shell.test.mjs` — 15 tests:

- an unrecognised origin **fails closed** rather than being assumed to be the
  Cloudflare deployment, which would offer a feature that then 404s;
- availability is a property of the **deployment, not the session** — a signed-out
  visitor on Cloudflare still mounts, so the shell can say "sign in" instead of
  the misleading "not available here";
- `unauthorized` and `error` refuse to be constructed without a reason, while
  `empty` and `loading` owe no explanation;
- an unknown state throws instead of falling back to a default;
- hostile text survives as literal text, and the renderer has no `innerHTML`
  path at all;
- unmount clears the container, so no workspace content can survive into a later
  Personal render;
- no collaboration module is an eager script tag or a precache entry.

## Boundary

No route, no schema, no network call, no remote environment. Personal Vault code
is untouched. `P7-G2` authorizes `CF-P7-003` only.
