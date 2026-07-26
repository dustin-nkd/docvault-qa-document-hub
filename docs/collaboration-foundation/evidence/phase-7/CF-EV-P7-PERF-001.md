# CF-EV-P7-PERF-001 Personal startup cost of the collaboration shell

Status: PASS

Story: `CF-P7-002`

## Budget

The Phase 7 plan budgets **zero collaboration modules evaluated on Personal
startup**. The Personal Vault is the product that already works; a user who never
opens collaboration must not pay for it.

## Measured

Loaded from a local server at `?guest=1` and inspected in the live document:

| Measure | Result |
|---|---|
| `<script>` elements whose `src` contains `collaboration` | **0** |
| Service worker precache entries containing `collaboration` | **0** |
| Console errors | none |

`js/collaboration/shell.js` and `js/collaboration/base-states.js` were reached
only after an explicit dynamic `import()`, which is the first and only moment
collaboration code enters the session.

## Enforced, not just measured

A measurement passes once; the budget has to survive later stories. Three
independent checks hold it:

1. `cf:phase7:shell:check` asserts against the real `index.html` and `sw.js` that
   no collaboration module is an eager script tag or a precache entry.
2. `tests/collaboration-shell.test.mjs` repeats both assertions in the unit
   suite, so the failure surfaces in `npm test` and not only in the gate.
3. `tests/cloudflare-phase-7-shell-policy.test.mjs` adds an eager script tag and
   a precache entry to a copy of the inputs and asserts the policy **rejects
   both** — so the gate is known to bite rather than merely to pass.

## The one eager addition, and why it is not a violation

`js/deployment.js` is loaded eagerly and precached with the app shell. It is not
a collaboration module: it has no imports, holds no collaboration state, and its
only job is deciding whether this deployment can run collaboration at all. The
GitHub Pages banner depends on that answer and must render for a user who will
never load collaboration, so the predicate cannot live behind the lazy boundary.
The policy pins this explicitly — moving the module into `js/collaboration/` is
a gate failure, and a drift test proves it.

## Not measured here

Chunk size against the 60 KiB lazy budget and the 75 KiB collaboration startup
ceiling are not meaningful yet: only three small modules exist and no bundling
step applies to them. Those are measured at `CF-P7-013`, when the full surface
set is present. This evidence claims the zero-module startup budget only.

## Boundary

No route, no schema, no remote environment. `P7-G2` authorizes `CF-P7-003` only.
