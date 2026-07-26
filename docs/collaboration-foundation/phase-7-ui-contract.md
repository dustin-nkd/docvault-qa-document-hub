# Collaboration Foundation Phase 7 — UI contract

Status: **FROZEN — `CF-P7-001`, exit gate `P7-G1`**

This contract fixes what Phase 7 builds before any of it is built. It is frozen
in the same sense the Phase 6 document contract was: a surface, a state, or a
mapping may not be added or removed as an implementation detail. Changing it
takes a new story, a recorded reason, and a passing `cf:phase7:contract:check`.

## 1. What Phase 7 may not do

Phase 7 adds **no** cryptographic, persistence, or authorization primitive. Every
read and write goes through an existing Phase 3–6 service. The UI layer may not
reimplement identity, envelope, revision, idempotency, cursor, membership, or
outbox logic. If a surface needs behaviour a service did not expose, the service
is extended under its own review — the logic never lands in a view.

## 2. Surface inventory

Twelve surfaces, each owned by exactly one story, each declaring which base
states it must render and which roles may see it.

| Surface | Story | Scope | Roles |
|---|---|---|---|
| Account menu | CF-P7-003 | account | all |
| Workspace switcher | CF-P7-003 | account | all |
| Create workspace | CF-P7-004 | account | all |
| Device and key initialization | CF-P7-005 | account | all |
| Member list and role badge | CF-P7-006 | workspace | all |
| Invitation creation, copy, revoke | CF-P7-007 | workspace | owner, admin |
| Invitation acceptance | CF-P7-008 | account | all |
| Sync state | CF-P7-009 | workspace | all |
| Conflict resolution dialog | CF-P7-010 | workspace | owner, admin, editor |
| Audit activity | CF-P7-011 | workspace | owner, admin |
| Empty, loading, unauthorized, error | CF-P7-002 | shared | all |
| GitHub Pages banner | CF-P7-002 | deployment | all |

A surface restricted to `owner, admin` is **not hidden** from an editor or
viewer. Section 5 governs how it is presented instead.

## 3. Sync state machine

Exactly five user-visible states. There is no sixth, and none of them is a
synonym for a generic error.

| State | Entered when |
|---|---|
| **Saved** | the outbox holds no entry for the open document, or its last entry reached `applied` |
| **Saving** | an outbox entry for the open document is `queued` or `inflight` |
| **Offline** | the transport is unavailable, or the browser reports offline while at least one entry is queued |
| **Conflict** | a mutation returned `DOCUMENT_REVISION_CONFLICT` |
| **Access removed** | a workspace-scoped call was denied **and** a membership re-check shows the user is no longer an active member |

Three rules:

- **`Access removed` is terminal** for the open document. Recovery is re-entry
  through the workspace switcher, never an in-place retry. This matters because
  the API denial is deliberately non-disclosing — `RESOURCE_NOT_FOUND` is
  returned whether or not the resource exists — so the state may only be claimed
  after the membership re-check confirms it. Guessing it from the status code
  alone would leak the resource's existence.
- **`Conflict` is never left automatically.** Only an explicit resolution from
  the frozen set moves out of it.
- **No state is signalled by colour alone.** Each carries a text label and a
  distinct shape or icon.

## 4. Error to state mapping

Every code in the frozen server taxonomy maps to exactly one presentation, and
every one of them explains itself in text.

| Code | Presented as |
|---|---|
| `UNAUTHENTICATED` | unauthorized |
| `RECENT_AUTHENTICATION_REQUIRED` | unauthorized |
| `OPERATION_NOT_PERMITTED` | role-disabled explanation |
| `DOCUMENT_REVISION_CONFLICT` | Conflict |
| `RESOURCE_NOT_FOUND` | empty, or Access removed after a membership re-check |
| `KEY_VERSION_MISMATCH` | error |
| `IDEMPOTENCY_KEY_REUSED` | error |
| `IDEMPOTENCY_WINDOW_EXPIRED` | error |
| `RATE_LIMITED` | error |
| `COLLABORATION_UNAVAILABLE` | error |
| `VALIDATION_FAILED` | error |
| `CSRF_REJECTED` | error |

## 5. Role-disabled controls

A control the current role may not use **stays visible**, is **programmatically
disabled** rather than merely styled, and **states its reason** in text that
assistive technology announces.

Hiding is the easier implementation and the wrong one. A hidden control makes the
product feel broken rather than governed, and it denies the user the one piece of
information that would resolve their confusion: that this action exists and their
role is why they cannot take it. A control must also never appear enabled and
fail only on submit.

## 6. Accessibility baseline

| Rule | Value |
|---|---|
| Standard | WCAG 2.2 AA |
| Focus indicator | always visible, ≥ 3:1 non-text contrast |
| Focus trap | prohibited |
| Dialogs | focus moved on open, restored on close |
| Sync state announcements | polite live region |
| Minimum target size | 24 px |
| State by colour alone | prohibited |

## 7. Responsive baseline

Minimum supported width is **320 px**, with breakpoints at 320, 768, and 1024.
No horizontal page scroll, no overlapping or clipped controls, no unreachable
actions. Long workspace and account names truncate with the full value still
available to assistive technology — they never overflow their container.

## 8. Inherited vocabularies

Phase 7 renders these and may not extend them. They were frozen by CF-P6-001 and
CF-P6-007.

- **Conflict resolutions** — `review-latest`, `reapply-to-latest`,
  `save-as-separate-copy`, `discard-with-confirmation`
- **Conflict states** — `unresolved`, `reviewing`, `resolved`, `discarded`
- **Outbox states** — `queued`, `inflight`, `applied`, `terminal`, `expired`,
  `quarantined`
- **Roles** — `owner`, `admin`, `editor`, `viewer`

Note the shape mismatch Phase 7 must absorb rather than paper over: the outbox
has six internal states and the user-visible sync model has five, and they are
not the same axis. `expired` and `quarantined` are not sync states — they are
recovery situations surfaced by CF-P7-006's outbox work under ADR-006, and they
must not be flattened into `error`.

## 9. Data separation

| Rule | Value |
|---|---|
| Personal record on a workspace surface | prohibited |
| Workspace record on a personal surface | prohibited |
| Collaboration modules on personal startup | 0 |
| Personal writes from any collaboration path | 0 |
| Active workspace visible on every workspace surface | required |
| Active workspace survives reload | required |
