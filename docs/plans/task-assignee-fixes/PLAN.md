# Task Assignee Enhancements & Bug Fixes Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `task-assignee-fixes`
**Base:** `refs/plans/task-assignee-fixes/base` (`497b7c03b3d7a4646d21bdd5804a2307d1ec2ab0`)
**Commit:** `fix(task): add content editor, enable notification rules, and add kanban assignee filter`

## Outcome & Scope
Fix the 3 reported defects for the Task Assignee feature:
1. Re-add markdown content area (`#editor-container` and `#ed-content-hidden`) to the task editor.
2. Update `firestore.rules` under `/notifications/{notifId}` to allow `kind == 'task'` notifications and add tests in `tests/firestore-rules.test.mjs`.
3. Add `kb-assignee-filter` dropdown to the task kanban board toolbar in `js/render-core.js` and add unit tests in `tests/task-view.test.mjs`.
4. Bump `SW_VERSION` from `v86` to `v87` across `sw.js` and all test assertions.
5. Perform an independent review via Refract.

Out of scope:
- Changes to other categories (`bug`, `testcases`, `credential`, etc.).
- Multi-assignee support.

## Baseline Evidence
- `node tests/run.mjs`: 209 pass, 0 fail, 0 skipped at plan base `497b7c03b3d7a4646d21bdd5804a2307d1ec2ab0`.
- Quality check passed: all line budgets hold.

---

### Phase 1: Task Content Editor, Firestore Rules & Kanban Filter

**Phase Request:**
Implement fixes and enhancements for task assignees across:
1. `js/render-editor-categories.js`: Include `#editor-container` and `#ed-content-hidden` for `category === 'task'`, keeping file length ≤ 921 lines.
2. `firestore.rules`: Extend `/notifications/{notifId}` create rule to permit `request.resource.data.kind == 'task'` when document category is `'task'` and recipient matches `assigneeUid` or `taskData.assigneeUid`. Add comprehensive unit tests in `tests/firestore-rules.test.mjs`.
3. `js/render-core.js`: Add `applyTaskAssigneeFilter(val)`, apply filtering to `colDocs` / `docs` in `renderKanbanBoard`, render `kb-assignee-filter` in the filters toolbar, and preserve line budget (≤ 1760 lines).
4. `tests/task-view.test.mjs`: Add tests verifying assignee filtering and editor content area contracts.
5. `sw.js`: Bump `SW_VERSION` to `v87` and update test assertions in `tests/collab-images.test.mjs`, `tests/collab-import.test.mjs`, `tests/collab-shares.test.mjs`, `tests/collab-store.test.mjs`, and `tests/interaction-contract.test.mjs`.

**Goal:** Fix all 3 reported defects with 100% test pass rate and clean code quality review.
**Depends on:** none
**Invariants & Boundaries:**
- Maintainability budgets: `render-editor-categories.js <= 921`, `render-core.js <= 1760`.
- Existing bug triage, focus workflow, and comment mention rules must remain untouched.
- Service worker app shell cache bump to `v87`.

**Files:**
- Modify: `js/render-editor-categories.js`
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules.test.mjs`
- Modify: `js/render-core.js`
- Modify: `tests/task-view.test.mjs`
- Modify: `sw.js`
- Modify: `tests/collab-images.test.mjs`
- Modify: `tests/collab-import.test.mjs`
- Modify: `tests/collab-shares.test.mjs`
- Modify: `tests/collab-store.test.mjs`
- Modify: `tests/interaction-contract.test.mjs`

**Acceptance Criteria:**
- Task creation/edit form has both assignee/kanban selects and the markdown content editor.
- Firestore rules allow task assignment notification creation and reject invalid task assignments.
- Task kanban board toolbar includes `kb-assignee-filter` allowing filtering by assignee or unassigned.
- `npm run check` and `node tests/firestore-rules.test.mjs` pass 100%.
- Independent Refract review succeeds.
