# CF-EV-P7-A11Y-002 Accessibility of explained role-disabled controls

Status: PASS

Story: `CF-P7-006` — gate UX `U3`

## What U3 requires, and how each half is met

| Requirement | Implementation | Verified |
|---|---|---|
| Stays visible | denied controls are rendered, never skipped | 0 hidden of 60 denied |
| Programmatically disabled | `button.disabled = true` **and** `aria-disabled="true"` | 60 of 60 |
| Not merely styled | the gate rejects a build that only adds a class | drift case |
| States its reason | `aria-describedby` → a rendered text node | 60 of 60 resolve |
| Announced, not tooltip-only | reason is a DOM text node; `title` duplicates it | 60 of 60 |
| Never fails only on submit | the decision is taken before render | manifest + gate |

## A real defect found and fixed

Reason ids were `reason-<action>-<userId>` — unique inside one list, not across
two. The preview page renders the same members four times, once per role
perspective, and `getElementById` resolves the **first** match. A screen reader
would therefore have announced the wrong list's reason for a control: the owner
row's provisioning control read "Only an owner or admin can provision the
workspace key" when the correct reason was "Your own device is still waiting for
the workspace key".

Confidently wrong is worse than silent. Every unit test rendered a single list,
so nothing caught it until the live DOM was read.

`renderMemberList` now takes a required `instanceId` which scopes every id. It is
required rather than defaulted because a default collides just as silently. After
the fix: 60 reason nodes, **0** duplicate ids, and the owner-with-pending-device
control reads its own correct reason.

Covered by two new unit tests — one asserting two lists share no id, one
asserting a render without an instance id is refused — and by a gate assertion
pinning the scoped id form.

## A second defect, in the gate itself

The first version of that gate assertion was written `/${instanceId}-reason-/`.
In a regular expression `$` is an end-of-string anchor, so the pattern could
never match and the check was decorative. It is now `/\$\{instanceId\}-reason-/`
and was confirmed to fail against a module missing the scoping before being
accepted against one that has it.

## Contrast and target size

| Element | Dark | Light | Bar |
|---|---|---|---|
| Denial reason text | 5.33:1 | 7.88:1 | ≥ 4.5:1 |

Zero controls under 24 px at 320 px width. Focus rings use the theme-aware
`--collab-focus` token introduced by CF-P7-004.

## Not evidenced

No screenshot: the Browser pane was not compositing frames, so capture timed out.
All figures are DOM and computed-style measurements from the live page. Screen
reader announcement was verified structurally — `aria-describedby` resolving to a
non-empty text node — not by listening with a screen reader. That listening test
belongs to CF-P7-012, which qualifies every surface.
