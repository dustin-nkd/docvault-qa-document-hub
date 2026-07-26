# Collaboration Foundation Phase 7 — Member list and role-disabled controls

Status: **PASS — `CF-P7-006`, entry `P7-G2C`, exit `P7-G2D`**

Surface 5 of twelve. `P7-G2D` authorizes `CF-P7-007` only.

## 1. This is where gate UX U3 is decided

U3: a control the current role may not use **stays visible**, is
**programmatically disabled** rather than merely styled, and **states its reason**
in text assistive technology announces.

Hiding is the easier implementation and the wrong one. A hidden control makes the
product feel broken rather than governed, and it withholds the one fact that
would resolve the user's confusion: the action exists, and their role is why they
cannot take it.

The implementation therefore does three things together for every denial, and the
gate checks all three: `button.disabled = true`, `aria-disabled="true"`, and an
`aria-describedby` pointing at a rendered text node carrying the reason. A
tooltip alone would satisfy none of them.

## 2. The matrix is read, not invented

Every decision comes from the frozen table in
[`domain-and-rbac.md`](domain-and-rbac.md). Four rules are the ones a careless
refactor loses, so the gate checks each against **both** the frozen document and
the live decision function:

- **An owner cannot be removed by anyone**, including another owner. The reason
  says so and points at ownership transfer.
- **Removing an admin is reserved to the owner.**
- **An admin may revoke devices of editors and viewers only** — not an owner's,
  not another admin's.
- **Provisioning requires the acting device to already hold the key.** This is
  not a role rule: you cannot hand over a key you do not have.

Nothing is enforced here. The server's SQL guards remain the authority; this
layer exists so a control is never enabled into a refusal.

## 3. A defect the browser found

The reason node ids were `reason-<action>-<userId>`, unique within one list but
not across two. Rendering the same members twice on one page — which the preview
does, to show the list as an owner and as a viewer — produced duplicate ids, and
`aria-describedby` resolved to the **first** match. A screen reader would have
announced one list's reason for the other list's control: confidently wrong,
which is worse than silent.

Found by reading the live DOM rather than by a test, because every unit test
rendered a single list. `renderMemberList` now requires an `instanceId` that
scopes the ids; it is required rather than defaulted, because a default would
collide just as silently. Two tests now cover it, and the gate pins the scoped id
form.

## 4. Readiness is reused

Member key readiness renders through `presentReadiness` from CF-P7-005, not a
second table. The gate rejects a redefinition of `KEY_READINESS` in this module
and requires the import.

## 5. Verification

- `cf:phase7:members:check`, wired into `check:cloudflare`.
- `tests/collaboration-member-list.test.mjs` — 32 unit tests, including a sweep
  asserting that every denial the whole matrix can produce states a reason.
- `tests/cloudflare-phase-7-member-policy.test.mjs` — 23 drift cases.
- Browser: 96 controls across four role perspectives, 60 disabled, **zero**
  disabled without an announced reason, zero duplicate ids.

## 6. Boundaries held

No route, no schema, no remote environment, no personal storage key, no
`innerHTML`, no `fetch`, and no client-constructed cursor — the opaque
HMAC-bound cursor from CF-P6-005 is carried, never built.
