# Team Comments Section Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `team-comments`
**Base:** `refs/plans/team-comments/base` (`79c44dc6f0de509b3612711b1a6320b65211050e`)
**Commit:** `feat(collab): add real-time threaded comments and mentions for bugs and tasks`

## Outcome & Scope
Add a native, real-time threaded comments and team @mention feature for Bug Reports and Tasks in DocVault Team Edition (`COLLAB_MODE`). Includes Firestore subcollection storage, live subscriptions, hierarchical reply threads, member @mention autocomplete, in-app bell notifications, role-based editing/deletion permissions, and comprehensive test coverage.

Out of scope:
- Personal / offline edition (comments section is completely omitted).
- Categories other than `bug` and `task` (`credential`, `runbook`, `testcases`, etc.).
- WYSIWYG rich-text editor or file attachments in comments.
- User presence / typing indicators.

## Baseline Evidence
- `node tests/run.mjs`: 190 pass, 0 fail, 0 skipped at plan base `79c44dc6f0de509b3612711b1a6320b65211050e`

---

### Phase 1: Backend Security Rules & Notifications Extension

**Phase Request:**
Update Firestore security rules in `firestore.rules` and rule verification tests in `tests/firestore-rules.test.mjs` to establish secure permissions for the comments subcollection `/documents/{id}/comments/{commentId}` and allow team members to create mention notifications in `/notifications/{notifId}`:
1. Allow `isMember()` to read comments under `/documents/{id}/comments/{commentId}`.
2. Allow `isMember()` (including `viewer`, `editor`, `owner`) to create comments with author validation (`authorUid == request.auth.uid`), docId matching, integer `createdAt`, and content length (1..4000 characters).
3. Allow author-only update (`resource.data.authorUid == request.auth.uid`), keeping `authorUid`, `docId`, `parentId`, and `createdAt` immutable, updating `content` and integer `updatedAt`.
4. Allow delete if author or `isTeamOwner()`.
5. Update `/notifications/{notifId}` rule to allow any `isMember()` to create notifications with `kind == 'comment_mention'` when target document exists and recipient is another team member.
6. Add comprehensive unit tests in `tests/firestore-rules.test.mjs` covering all success and failure branches.

**Goal:** Establish secure, validated Firestore security rules for comments and mention notifications with 100% test verification.
**Depends on:** none
**Invariants & Boundaries:**
- Existing document, member, workspace, and assignment notification rules must remain untouched.
- Strangers and unauthenticated requests must be denied for comments and notifications.
- Non-author non-owners cannot delete or tamper with comments.

**Files:**
- Modify: `firestore.rules`
- Modify: `tests/firestore-rules.test.mjs`

**Tasks:**
1. Add tests in `tests/firestore-rules.test.mjs` asserting comment subcollection permissions across viewer, editor, owner, stranger, and tampering attempts.
2. Add tests in `tests/firestore-rules.test.mjs` asserting `comment_mention` creation by any member for valid documents.
3. Update `firestore.rules` to define the comments subcollection and update notification creation rules.
4. Run `node tests/run.mjs` to ensure all 190+ tests pass.

**Acceptance Criteria:**
- Comments subcollection allows read/create by all team members.
- Comment content update is restricted to author; deletion is restricted to author or owner.
- Mention notifications can be created by commenting members.
- All rules tests pass.

**Reviewer Checklist:**
- Verify `comments` subcollection is properly nested inside `/documents/{id}`.
- Verify immutability of `authorUid`, `parentId`, and `createdAt` during comment update.
- Verify that strangers cannot read or write comments.

**Verification Checks:**
- `node tests/run.mjs`

---

### Phase 2: Collab Comments Core Module, Mention Parser & Notifications

**Phase Request:**
Implement `js/collab-comments.js` providing real-time Firestore operations, comment tree construction, mention parsing, and notification dispatch:
1. Export `window.CollabComments` with methods:
   - `init(db, authUser, member)`: Initialize module with active Firestore instance and member info.
   - `subscribe(docId, onUpdate)`: Attach real-time `onSnapshot` listener to `/documents/{docId}/comments`, sort chronologically, and yield structured comments. Return unsubscribe function.
   - `addComment(docId, { content, parentId, mentions })`: Validate content (non-empty, ≤ 4000 chars), generate comment ID, write to Firestore, and trigger notifications for mentioned members.
   - `updateComment(docId, commentId, { content, mentions })`: Update comment content and set `updatedAt: Date.now()`.
   - `deleteComment(docId, commentId)`: Delete comment from subcollection.
   - `buildCommentTree(flatComments)`: Transform flat list of comments into hierarchical tree (root comments with nested replies array).
   - `extractMentions(text, members)`: Parse `@Name` references from text against team members and return mentioned member UIDs.
   - `notifyCommentMention(doc, comment, recipientUid)`: Write notification to `db.collection('notifications')` with `kind: 'comment_mention'`.
2. Keep `js/collab-comments.js` under 400 lines (adhering to project code budget).
3. Lazily load `js/collab-comments.js` in `js/collab-bootstrap.js` in `start()`.
4. Add `'./js/collab-comments.js'` to `APP_SHELL_FILES` in `sw.js`.
5. Create `tests/collab-comments.test.mjs` verifying module exports, line budget, tree building, mention extraction, and notification formatting.

**Goal:** Provide an isolated, test-covered CollabComments data service adhering to project architecture standards.
**Depends on:** Phase 1
**Invariants & Boundaries:**
- Line count of `js/collab-comments.js` must be ≤ 400 lines.
- Does not run in personal/offline mode.
- Memory leak prevention: active listeners must be unsubscribed when requested.

**Files:**
- Create: `js/collab-comments.js`
- Modify: `js/collab-bootstrap.js`
- Modify: `sw.js`
- Create: `tests/collab-comments.test.mjs`

**Tasks:**
1. Write unit tests in `tests/collab-comments.test.mjs` for tree building, mention parsing, HTML safety, line budget, and CollabBootstrap loading.
2. Implement `js/collab-comments.js` with full CRUD, tree structuring, and notification dispatch.
3. Update `js/collab-bootstrap.js` to add `loadCollabComments()`.
4. Update `sw.js` to cache `js/collab-comments.js`.
5. Run `node tests/run.mjs` to verify all tests pass.

**Acceptance Criteria:**
- `js/collab-comments.js` adheres to ≤ 400 lines budget.
- Flat comments are properly nested into root and replies.
- Mentions are extracted and notifications dispatched to recipients.
- `sw.js` and `collab-bootstrap.js` correctly register the script.

**Reviewer Checklist:**
- Verify line budget (≤ 400 lines).
- Inspect listener management to ensure `unsubscribe` cleans up listeners.
- Verify safe HTML escaping for comment text and author attributes.

**Verification Checks:**
- `node tests/run.mjs`

---

### Phase 3: UI Rendering, Viewer Integration & Interaction Tests

**Phase Request:**
Integrate the comments UI into Bug Report and Task viewers, implement interactive comment inputs, mention autocomplete, and styling:
1. In `js/render-viewer.js`, render `<section id="collab-comments-section">` below category details when `isCollabMode()` and `(doc.category === 'bug' || doc.category === 'task')`.
2. Connect active document to `CollabComments.subscribe(doc.id, ...)` when viewing a doc, and clean up subscription when leaving the viewer.
3. Render comments UI:
   - Header with title "Comments & Discussion" and comment count badge.
   - Comment items with author initials avatar, name, role badge, timestamp, text with highlight chips for `@mentions`, and `(edited)` tag.
   - Nested reply threads indented under parent comments.
   - Action buttons: "Reply", "Edit" (author only), "Delete" (author or team owner).
   - Comment input textarea with placeholder, "Comment" button, and `@` mention dropdown showing team members.
   - Reply form inline under parent comment when "Reply" is clicked.
4. Add CSS in `style.css` matching DocVault's theme variables and typography.
5. Create `tests/collab-comments-ui.test.mjs` to verify viewer rendering contracts (shown for bug/task in collab mode, hidden in personal mode, hidden for non-bug/task categories).
6. Verify asset budget in `tests/runtime-performance.test.mjs`.

**Goal:** Deliver an intuitive, polished comments experience for Bug Report and Task viewers in Team Edition.
**Depends on:** Phase 2
**Invariants & Boundaries:**
- Never display comments section or execute collab listeners in personal mode or shared public view.
- Non-bug and non-task categories must never show comments section.
- Direct startup asset budget must pass in `tests/runtime-performance.test.mjs`.

**Files:**
- Modify: `js/render-viewer.js`
- Modify: `style.css`
- Modify: `tests/runtime-performance.test.mjs`
- Create: `tests/collab-comments-ui.test.mjs`

**Tasks:**
1. Write interaction and rendering tests in `tests/collab-comments-ui.test.mjs`.
2. Implement comments markup and subscription lifecycle in `js/render-viewer.js`.
3. Add styles in `style.css` for comment threads, mention tags, reply indentation, and autocomplete popups.
4. Check asset performance tests in `tests/runtime-performance.test.mjs` and adjust threshold if necessary.
5. Run full test suite with `node tests/run.mjs` to verify zero regressions.

**Acceptance Criteria:**
- Bug and Task documents in Team Edition display the Comments section.
- Users can post top-level comments and replies.
- Typing `@` displays team members dropdown and inserts mention token.
- Editing and deleting comments work according to permissions.
- Personal mode and other document types are completely unaffected.
- Full test suite passes.

**Reviewer Checklist:**
- Verify clean separation: Personal edition remains 100% untouched.
- Verify XSS prevention across all dynamic comment HTML rendering.
- Verify responsive layout on mobile and desktop viewports.

**Verification Checks:**
- `node tests/run.mjs`
