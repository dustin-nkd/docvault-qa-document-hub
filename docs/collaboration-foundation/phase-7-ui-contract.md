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

**Amended by `CF-P7-016`.** As frozen, this section opened by claiming that every
code in the server taxonomy mapped to exactly one presentation, and then listed
twelve. The catalog it claimed to cover — `api-contract.md` §8 — holds
twenty-nine, and two of the twelve rows named codes that appear in no catalog at
all: `UNAUTHENTICATED`, which the catalog spells `AUTHENTICATION_REQUIRED`, and
`RECENT_AUTHENTICATION_REQUIRED`, which it spells `REAUTHENTICATION_REQUIRED`.
The claim was therefore false in both directions at once — seventeen server codes
had no decided presentation, and two presentations were decided for codes the
catalog does not define.

It is corrected here, by a Phase 7 story, rather than from Phase 8, because
`CF-P7-001` freezes this document: a mapping may not be added or removed as an
implementation detail, and changing one takes a new story. Editing a frozen
contract from a later phase is exactly what this programme forbids everywhere
else. So the contract change and the gate amendment ship in one commit, on the
`D-P7-01` precedent, leaving no window in which the two disagree.

The gate no longer takes the catalog's size on trust either. It parses §8 out of
`api-contract.md` and fails if any catalog code is unmapped or any mapped code is
absent from the catalog. That bidirectional check is the assertion whose absence
let a map claim completeness while covering twelve of twenty-nine.

The presentation vocabulary is **unchanged and still closed**: `unauthorized`,
`error`, `empty-or-access-removed`, `Conflict`, and the role-disabled
explanation. Seventeen new codes did not earn a sixth. Every code maps to exactly
one presentation, and every one of them explains itself in text.

| HTTP | Code | Presented as |
| ---: | --- | --- |
| 400 | `INVALID_JSON` | error |
| 400 | `VALIDATION_FAILED` | error |
| 400 | `INVALID_CURSOR` | error |
| 400 | `INVALID_PRECONDITION` | error |
| 401 | `AUTHENTICATION_REQUIRED` | unauthorized |
| 401 | `SESSION_EXPIRED` | unauthorized |
| 401 | `REAUTHENTICATION_REQUIRED` | unauthorized |
| 403 | `CSRF_REJECTED` | error |
| 403 | `DEVICE_NOT_AUTHORIZED` | error |
| 403 | `KEY_PROVISIONING_REQUIRED` | error |
| 403 | `OPERATION_NOT_PERMITTED` | role-disabled explanation |
| 404 | `RESOURCE_NOT_FOUND` | empty, or Access removed after a membership re-check |
| 405 | `METHOD_NOT_ALLOWED` | error |
| 406 | `NOT_ACCEPTABLE` | error |
| 409 | `DOCUMENT_REVISION_CONFLICT` | Conflict |
| 409 | `IDEMPOTENCY_KEY_REUSED` | error |
| 409 | `IDEMPOTENCY_WINDOW_EXPIRED` | error |
| 409 | `STATE_TRANSITION_INVALID` | error |
| 409 | `KEY_VERSION_MISMATCH` | error |
| 409 | `FINGERPRINT_CHANGED` | error |
| 409 | `INVITATION_UNAVAILABLE` | error |
| 409 | `LAST_OWNER_REQUIRED` | role-disabled explanation |
| 409 | `LIFECYCLE_POLICY_UNAVAILABLE` | error |
| 413 | `PAYLOAD_TOO_LARGE` | error |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | error |
| 422 | `UNSUPPORTED_ENVELOPE` | error |
| 429 | `RATE_LIMITED` | error |
| 500 | `INTERNAL_ERROR` | error |
| 503 | `COLLABORATION_UNAVAILABLE` | error |

### Why the non-obvious rows are what they are

Most of the seventeen are `error` because `error` is what the vocabulary means:
the action did not happen, nothing changed, and the recovery is to read the
reason and try again. Five rows were arguments, and the argument is recorded.

- **`SESSION_EXPIRED` is `unauthorized`, `DEVICE_NOT_AUTHORIZED` is not.** Both
  are refusals of the caller, but `unauthorized` is the state the shell renders
  as "Sign in to see this". That is true of an expired session and false of a
  revoked device: the session is fine, and telling that user to sign in sends
  them round a loop that cannot clear the refusal. A revoked device is recovered
  through the device journey, so it presents as `error` with its own reason.
- **`KEY_PROVISIONING_REQUIRED` is `error`,** for the same reason and by the same
  neighbour: `KEY_VERSION_MISMATCH` was already frozen as `error`, and both are
  "this device's key material is not usable yet", recovered in the device and key
  surface rather than at an authentication wall.
- **`INVITATION_UNAVAILABLE` is `error`, not `empty-or-access-removed`,** even
  though it is the invitation half of the same non-enumeration policy that makes
  `RESOURCE_NOT_FOUND` deliberately ambiguous. Two reasons. It is not a
  membership question, so the re-check that §3 requires before `Access removed`
  may be claimed has nothing to re-check; and the surface that receives it,
  `invitation-accept`, does not declare `empty` among its base states, so
  `empty-or-access-removed` is not a state it can render.
- **`LAST_OWNER_REQUIRED` is a role-disabled explanation, not an `error`.** The
  name of the presentation says role, but its shape is what is being chosen: a
  control that stays visible, is programmatically disabled, and states its reason
  in text. A workspace must keep an Owner, the member list already knows who the
  Owners are, and §5 forbids a control that looks enabled and fails only on
  submit. Presenting this as a generic error would mean the product waits for the
  user to try before telling them the rule.
- **`LIFECYCLE_POLICY_UNAVAILABLE` is `error`,** taking its neighbour
  `COLLABORATION_UNAVAILABLE` rather than the role-disabled shape. It is not a
  denial aimed at this user — export and deletion are reserved and deny-closed
  for everyone — and the reason a user needs is that the capability is not
  available here, which is what `error` with a stated reason says.

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
