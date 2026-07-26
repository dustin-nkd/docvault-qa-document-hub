# CF-EV-P7-UI-012 The frozen error-to-presentation map corrected

Status: PASS

Story: `CF-P7-016` — surface `base-states`, gate `P7-G1` (amended)

## What was wrong

`docs/collaboration-foundation/phase-7-ui-contract.md` §4 opened with the claim

> Every code in the frozen server taxonomy maps to exactly one presentation

and then mapped **twelve** codes. The frozen catalog in
`docs/collaboration-foundation/api-contract.md` §8 holds **twenty-nine**. The
sentence was false when it was frozen.

Two of the twelve were spellings that appear in no catalog, server or client:

| Frozen spelling | Real catalog spelling | Status |
|---|---|---|
| `UNAUTHENTICATED` | `AUTHENTICATION_REQUIRED` (401) | renamed |
| `RECENT_AUTHENTICATION_REQUIRED` | `REAUTHENTICATION_REQUIRED` (401) | renamed |

Both targets were verified against §8 before renaming, as the story required.
**No discrepancy** — the catalog spells them exactly as predicted, so both
renames were applied as given.

After the renames the map still covered twelve of twenty-nine, leaving
**seventeen** server codes with no presentation at all.

## Why the gate did not catch it

`scripts/cloudflare-phase-7-contract-policy.mjs` held its own twelve-item
`REQUIRED_CODES` constant and checked the contract against it. The gate compared
the contract to a copy of the contract, so a map covering twelve of twenty-nine
agreed with itself and passed. This is measured, not asserted — see *Gate
regression proof* below.

## What changed

| Change | Count |
|---|---|
| Codes renamed to their real catalog spelling | 2 |
| Codes given a presentation for the first time | 17 |
| Codes mapped after the story | 29 (= the whole catalog) |
| Presentations in the closed set | 5 (unchanged — no sixth was needed) |

### The seventeen additions

| Code | Presentation |
|---|---|
| `SESSION_EXPIRED` | unauthorized |
| `LAST_OWNER_REQUIRED` | role-disabled explanation |
| `INVALID_JSON`, `INVALID_CURSOR`, `INVALID_PRECONDITION` | error |
| `DEVICE_NOT_AUTHORIZED`, `KEY_PROVISIONING_REQUIRED` | error |
| `METHOD_NOT_ALLOWED`, `NOT_ACCEPTABLE` | error |
| `STATE_TRANSITION_INVALID`, `FINGERPRINT_CHANGED` | error |
| `INVITATION_UNAVAILABLE`, `LIFECYCLE_POLICY_UNAVAILABLE` | error |
| `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `UNSUPPORTED_ENVELOPE` | error |
| `INTERNAL_ERROR` | error |

Three of these were judgement calls rather than arithmetic, and are recorded
here because a later reader will otherwise re-litigate them:

- **`SESSION_EXPIRED` → unauthorized but `DEVICE_NOT_AUTHORIZED` → error.** Both
  refuse the caller, so one presentation for both looks natural. It is wrong for
  the device case: `js/collaboration/entry.js` renders the unauthorized state
  under the title *"Sign in to see this"*. That is true of an expired session and
  false of a revoked device — the session is fine, and sending that user to sign
  in loops them through something that cannot clear the refusal.
- **`INVITATION_UNAVAILABLE` → error, not empty-or-access-removed.** The closest
  call. It is the invitation half of the same non-enumeration policy that makes
  `RESOURCE_NOT_FOUND` deliberately ambiguous. Decided against because §3 permits
  *Access removed* only after a membership re-check, and an invitation failure is
  not a membership question; and because the receiving surface,
  `invitation-accept`, declares `base_states` of `loading`/`unauthorized`/`error`
  in the frozen contract — it has no empty state to render.
- **`LAST_OWNER_REQUIRED` → role-disabled explanation.** The presentation's name
  says *role*, but what is chosen is its **shape**: a control that stays visible,
  is programmatically disabled, and states its reason. A workspace must keep an
  Owner, the member list already knows who the Owners are, and §5 forbids a
  control that looks enabled and fails only on submit. This is the row most
  likely to be argued with.

`LIFECYCLE_POLICY_UNAVAILABLE` deliberately did **not** take that shape despite
also being a deny-closed capability: it is not aimed at this user, and its
nearest neighbour `COLLABORATION_UNAVAILABLE` was already frozen as error. That
is the boundary drawn to stop role-disabled explanation absorbing every
anticipatable denial.

## The client-side alias join, which was inverted

`js/collaboration/api-client.js` resolved the two invented spellings *forward*.
Left as it was, every real 401/403 from Preview would have resolved to nothing,
fallen through `presentErrorCode` into the unrecognised error bucket, and
silently regressed the unauthorized presentation **with no gate failing**.
`SERVER_CODE_ALIASES` now maps `UNAUTHENTICATED` → `AUTHENTICATION_REQUIRED` and
`RECENT_AUTHENTICATION_REQUIRED` → `REAUTHENTICATION_REQUIRED`. Nothing under
`functions/` was touched — the wire format is unchanged.

## The gate assertion that prevents recurrence

`REQUIRED_CODES` is gone. `parseErrorCatalog()` reads the §8 table out of
`api-contract.md` — only the table, not the non-enumeration prose that follows it
and also mentions codes — and coverage is checked in **both** directions:

```
Server code ${code} is in the catalog with no presentation decided for it
Code ${code} is mapped but is not in the server catalog; check its spelling
```

So a server code added to the API contract now fails this gate until someone
decides how it is shown to a user, and a mapped code that matches no catalog row
fails on spelling. A closed-set assertion was added alongside, so a sixth
presentation cannot arrive as an implementation detail.

A second hardcoded copy of the taxonomy in
`scripts/cloudflare-phase-7-create-workspace-policy.mjs` — the same antipattern
one layer down — was removed and derived from `contract.error_mapping`.

## Gate regression proof

The drift cases in `tests/cloudflare-phase-7-shell-policy.test.mjs` were run a
second time against a deliberately sabotaged copy of the gate that restores the
pre-`CF-P7-016` tautology, to establish that each fails **for its own reason**
and only under the amended gate:

| Drift case | Amended gate | Pre-`CF-P7-016` gate |
|---|---|---|
| Verbatim twelve-row map as it was frozen | rejects: `INVALID_JSON … no presentation` | **accepts** |
| New server code added to the §8 catalog | rejects: `WORKSPACE_ARCHIVED … no presentation` | **accepts** |
| Sixth presentation in the closed vocabulary | rejects: `drifted from its closed set` | **accepts** |
| Map covering only part of the catalog | rejects on coverage | objects only to a stale count |
| `UNAUTHENTICATED` mapped | rejects on spelling | objects only to a stale count |
| `RECENT_AUTHENTICATION_REQUIRED` mapped | rejects on spelling | objects only to a stale count |

The first row is the headline: **the contract as it was frozen passes the gate
that shipped with it and fails the amended gate.** That is the defect reproduced
end to end rather than described.

**No-op control:** the real, unmutated repository inputs pass the amended
contract policy — `validatePhase7Contract` returns `true`. Reported separately
because without it every row above would be satisfied by a validator that threw
unconditionally. Both halves are green at once, so the gate discriminates.

## Artefacts

| Artefact | Role |
|---|---|
| `docs/collaboration-foundation/phase-7-ui-contract.md` | the amended frozen contract |
| `config/cloudflare/phase-7-ui-contract.json` | the frozen claim, 29 rows |
| `scripts/cloudflare-phase-7-contract-policy.mjs` | catalog parser and two-way check |
| `js/collaboration/api-client.js` | the corrected alias join |
| `tests/cloudflare-phase-7-shell-policy.test.mjs` | 31 drift cases (was 26) |

The contract change and the gate amendment ship in **one commit**, following the
`D-P7-01` precedent, leaving no window in which the two disagree.

## Gate

```
Cloudflare Phase 7 UI contract gate passed
  CF-P7-001: FROZEN; P7-G1 authorizes CF-P7-002 only
  Twelve surfaces owned, five-state sync machine closed and reachable
  Server error catalog read from the API contract and mapped in both directions
  CF-P7-016: 29 codes, 5 closed presentations; inherited vocabularies match the code
  WCAG 2.2 AA, 320 px floor, and personal/workspace separation pinned
```

`cf:phase7:contract:check` already existed and is already reached by
`check:cloudflare`. **Nothing was added to the check chain for this story** —
stated explicitly so the absence is not read as an omission.

## Not evidenced

- **The seventeen presentations were not observed rendering.** This story decides
  a mapping and pins it; it does not drive seventeen codes through a browser. The
  presentation *shapes* were qualified against real surfaces by `CF-P7-012`, and
  the codes reachable on the create-workspace journey were exercised by
  `CF-P7-005`. Fifteen of the seventeen have no route that produces them today.
- **The corrected alias join was not exercised against Preview.** It is pinned by
  two unit tests only. No 401 or 403 was driven from a live deployment through
  `presentErrorCode` to a rendered unauthorized state. That belongs to a
  Preview-authorized story under `P7-G4`.
- **The create-workspace reachable subset was not re-derived.** It stays at ten
  codes with the two spellings corrected; behaviour is preserved exactly.
  `SESSION_EXPIRED` and several 4xx codes are arguably reachable on those routes
  and would currently be reported as *a response this journey cannot happen to
  produce*. That was equally true before this story and was deliberately not
  widened here.
- **The judgement calls above are arguments, not measurements.** Nothing verifies
  that a user recovers faster from `DEVICE_NOT_AUTHORIZED` presented as error
  than as unauthorized. No usability testing was performed.
- **`npm run cf:types:check` fails in this working tree** with *"Types at
  worker-configuration.d.ts are out of date"*. That file is untouched by this
  story and no input to `wrangler types` was modified; it matches the recorded
  environment issue with line endings in worktrees. It is a pre-existing failure,
  not evidence of this change.
