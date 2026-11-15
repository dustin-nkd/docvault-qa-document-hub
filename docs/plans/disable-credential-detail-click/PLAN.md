# Disable Credential Detail Click Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `disable-credential-detail-click`
**Base:** `refs/plans/disable-credential-detail-click/base` (`a010732131b6e5e55e1e6bb563b57418ae3cfce5`)
**Commit:** `feat(credentials): remove click-to-view navigation from credential cards`

## Outcome & Scope
Remove the redundant full-page detail view navigation (`viewDoc`) when clicking on credential cards or titles in the main document grid during normal view mode, while preserving batch selection behavior when batch mode is active and keeping all existing card action buttons fully functional.

Out of scope:
- Behavior of non-credential cards (`task`, `bug`, `testcase`, etc.).
- Credential editor modal (`editDoc`) and credential data structure.
- Linked credential click behavior in Environment view.

## Baseline Evidence
- `node tests/run.mjs`: 189 pass, 0 fail, 0 skipped at plan base `a010732131b6e5e55e1e6bb563b57418ae3cfce5`

### Phase 1: Disable Card Click and Link Navigation for Credential Cards

**Phase Request:**
Update credential card rendering in `js/render-core.js` so that in normal mode (`!state.batchMode`), clicking the credential card or its title does not navigate to the viewer view (`viewDoc`). Specifically:
1. Do not attach `data-onclick="viewDoc(...)"` to the credential `<li>` element in normal mode.
2. Render the credential title as plain text or static element without `data-doc-link` or link href.
3. Apply `doc-card-static` styling in `style.css` so the card has `cursor: default` and does not indicate clickable navigation, while buttons inside the card remain clickable with `cursor: pointer`.
4. Ensure batch mode (`state.batchMode`) still attaches `toggleSelectDoc` to the card and allows selection.
5. Add unit/contract tests in `tests/interaction-contract.test.mjs` verifying this contract.

**Goal:** Credential cards in the document grid no longer trigger `viewDoc` on click, but retain batch mode selection and inner button actions.
**Depends on:** none
**Invariants & Boundaries:**
- Non-credential cards must continue to use `data-onclick="${cardAction(d.id)}"` and `data-doc-link`.
- Inner buttons on credential cards (`copyUsername`, `copyPassword`, `fav-btn`, `showDocMenu`) must remain functional and stop propagation.
- All 189 existing tests must pass with 0 regressions.

**Files:**
- Modify: `js/render-core.js`
- Modify: `style.css`
- Modify: `tests/interaction-contract.test.mjs`

**Tasks:**
1. Add contract tests in `tests/interaction-contract.test.mjs` asserting credential card behavior in both normal mode (no `viewDoc`, no `data-doc-link`, has static class) and batch mode (has `toggleSelectDoc`).
2. Update `renderDocList` in `js/render-core.js` to render static non-navigable markup for credential cards when not in batch mode.
3. Update `style.css` with `.doc-card.doc-card-static` rules to set `cursor: default` and suppress hover lift.
4. Run test suite to verify tests pass and no other categories are affected.

**Acceptance Criteria:**
- In normal mode, clicking on a credential card background does nothing.
- In normal mode, credential title is not an active link and clicking it does not call `viewDoc`.
- In batch mode, clicking on a credential card toggles selection (`toggleSelectDoc`).
- Copy username, copy password, favorite, and more menu buttons on the credential card still function properly.
- All test suites pass via `node tests/run.mjs`.

**Reviewer Checklist:**
- Inspect `js/render-core.js`: Verify `data-onclick` and title link logic are only changed for `d.category === 'credential'`.
- Verify batch mode (`state.batchMode` / `bm`) still allows selecting credential cards.
- Verify inner buttons (`event.stopPropagation()`) are untouched and functional.
- Check that no other document types have their click-to-view broken.

**Verification Checks:**
- `node tests/run.mjs`
