# Design: Task Assignee Enhancements & Bug Fixes

## 1. Context & Motivation
Following the introduction of the Task Assignee feature in DocVault Team Edition (`COLLAB_MODE`), user testing identified three specific functional defects:
1. **Missing Content Editor in Task Creation/Edit Form:** The task editor rendered assignee and kanban status select controls but inadvertently omitted the markdown content area (`#editor-container` and `#ed-content-hidden`), preventing users from typing task descriptions, checklists, and notes.
2. **Missing Notification Delivery on Task Assignment:** Assigning a task to another team member did not produce a visible in-app notification for the assignee. Investigation revealed that `firestore.rules` under `/notifications/{notifId}` only permitted `kind in ['bug', 'focus', 'comment_mention']`. Attempts to create `kind == 'task'` notifications were rejected with `PERMISSION_DENIED` by Firestore.
3. **Missing Assignee Filter on Kanban Board:** The task Kanban board only offered a status filter (`All Status`, `Published`, `Draft`, `Archived`), lacking an Assignee filter to view tasks assigned to a specific team member, unassigned tasks, or all tasks.

---

## 2. Goals & Non-Goals

### Goals
1. **Task Content/Notes Editor:** Ensure `renderEditorCategory()` in `js/render-editor-categories.js` renders both the top metadata grid (Assignee input + Kanban Status select) AND the standard `#editor-container` and `#ed-content-hidden` textarea, keeping file size strictly within maintainability budget (≤ 921 lines).
2. **Firestore Notification Rules for Tasks:** Extend `firestore.rules` under `/notifications/{notifId}` to allow `isEditorOrOwner()` to create notifications with `kind == 'task'`, requiring `signalKey == ''`, target document category `'task'`, and recipient matching `assigneeUid` (or `taskData.assigneeUid`). Add unit tests in `tests/firestore-rules.test.mjs`.
3. **Assignee Filter on Task Kanban Board:** Add `kb-assignee-filter` dropdown to the task kanban board filters toolbar in `js/render-core.js`. Filter cards dynamically by assignee (`All Assignees`, `Unassigned`, or individual members). Maintain line budget (≤ 1760 lines).
4. **App Shell Bump:** Bump `SW_VERSION` from `v86` to `v87` in `sw.js` and all asserting test files to ensure production clients purge stale cache and load updated modules.
5. **Quality Gate & Independent Review:** Run all 209+ tests and conduct an independent code-quality review via Refract.

### Non-Goals
- Altering existing bug triage, focus workflow, or comment mention notification rules.
- Introducing multi-assignee support per task (one assignee per task is the established design).

---

## 3. Detailed Component Designs

### 3.1 Task Editor Content Area (`js/render-editor-categories.js`)
In `renderEditorCategory(context)`, when `category === 'task'`:
```html
<div class="grid sm:grid-cols-2 gap-4 mb-4">
    <div>
        <label for="ed-task-assignee" class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugAssignee')}</label>
        <input id="ed-task-assignee" class="form-input" placeholder="${t('bugAssigneePl')}" value="${escHtml(doc?.assignee || doc?.taskData?.assignee || (typeof state !== 'undefined' ? state._newTaskAssignee : '') || '')}">
    </div>
    <div>
        <label for="ed-task-kanban-display" class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('status')}</label>
        ${renderSelect('ed-task-kanban', [{value: 'todo', label: t('todo')}, {value: 'in-progress', label: t('inProgress')}, {value: 'review', label: t('review')}, {value: 'done', label: t('done')}], doc?.kanbanStatus || 'todo', 'w-full')}
    </div>
</div>
<!-- Content area -->
<div id="editor-container" class="mt-4 text-left"></div>
<textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
```

### 3.2 Firestore Security Rules (`firestore.rules`)
Add rule condition for `kind == 'task'`:
```firestore
(request.resource.data.kind == 'task' &&
 request.resource.data.signalKey == '' &&
 exists(/databases/$(database)/documents/documents/$(request.resource.data.docId)) &&
 get(/databases/$(database)/documents/documents/$(request.resource.data.docId)).data.category == 'task' &&
 (get(/databases/$(database)/documents/documents/$(request.resource.data.docId)).data.assigneeUid == request.resource.data.recipientUid ||
  ('taskData' in get(/databases/$(database)/documents/documents/$(request.resource.data.docId)).data &&
   get(/databases/$(database)/documents/documents/$(request.resource.data.docId)).data.taskData.assigneeUid == request.resource.data.recipientUid)))
```
This guarantees only valid task assignments to actual team members for existing task documents can write notification records.

### 3.3 Task Kanban Board Assignee Filter (`js/render-core.js`)
1. State management: `state.taskAssigneeFilter` defaults to `'all'`.
2. Handler: `window.applyTaskAssigneeFilter = function(val) { state.taskAssigneeFilter = val; renderContent(); };`
3. Filtering logic in `renderKanbanBoard(docs, isMobileSearch)`:
   - When `state.taskAssigneeFilter === 'unassigned'`: keep `d` where `!d.assignee && !d.taskData?.assignee`.
   - When `state.taskAssigneeFilter && state.taskAssigneeFilter !== 'all'`: keep `d` where `(d.assignee === state.taskAssigneeFilter || d.assigneeUid === state.taskAssigneeFilter || d.taskData?.assignee === state.taskAssigneeFilter || d.taskData?.assigneeUid === state.taskAssigneeFilter)`.
4. Dropdown options:
   - Dynamic aggregation of assignees from `docs` plus team members from `CollabAssign.getMembers()`.
   - `renderSelect('kb-assignee-filter', options, state.taskAssigneeFilter || 'all', 'text-sm !w-auto min-w-[140px]', 'applyTaskAssigneeFilter(this.value)', 'Filter by assignee')`.
