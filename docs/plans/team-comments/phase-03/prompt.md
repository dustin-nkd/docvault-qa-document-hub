# Phase 3: UI Rendering, Viewer Integration & Interaction Tests

## Task
Integrate the comments UI into Bug Report and Task viewers in `js/render-viewer.js`, add styling in `style.css`, create interaction/rendering unit tests in `tests/collab-comments-ui.test.mjs`, wire it into `tests/run.mjs`, and verify asset budget in `tests/runtime-performance.test.mjs`.

## Context & Files to Modify/Create

1. `js/render-viewer.js` (MODIFY):
   - In `renderViewer()`, when `isCollabMode()` is true and `!state.sharedView` and `(doc.category === 'bug' || doc.category === 'task')`:
     Render `<section id="collab-comments-section" class="mt-8 pt-6 border-t border-[var(--brd)]" data-doc-id="${doc.id}">...</section>` placed right below `renderViewerCategory(doc)` and above `viewer-bottom-actions`.
   - Render components:
     - Section header: `Comments & Discussion` with count badge.
     - Top-level comment cards, each displaying author initials avatar (colored circle), author name, role chip, timestamp (`fmtDate`), `(edited)` tag if `c.updatedAt`, formatted content with mention chips (`CollabComments.formatCommentContent`), and actions (`Reply`, `Edit`, `Delete` according to permissions).
     - Nested reply threads indented under parent comment.
     - Root comment input: auto-resizing textarea with placeholder "Leave a comment or type @ to mention...", submit button.
     - Inline reply input: appears when clicking "Reply" on a comment, with submit and cancel buttons.
     - Member `@mention` autocomplete: typing `@` shows filtered list of team members (using `CollabAssign.getMembers()` or `CollabActivity.getMembersMap()`); selecting member inserts mention into textarea.
   - Subscription lifecycle:
     - Attach active `CollabComments.subscribe(doc.id, ...)` when rendering viewer.
     - Clean up previous unsubscribe function before attaching a new one or when navigating away.
   - Global action handlers: `window.collabSubmitComment`, `window.collabSubmitReply`, `window.collabEditComment`, `window.collabDeleteComment`, `window.collabToggleReplyForm`.

2. `style.css` (MODIFY):
   - Add styling rules for `#collab-comments-section`:
     - `.collab-comment-card`, `.collab-comment-avatar`, `.collab-comment-author`, `.collab-comment-meta`, `.collab-comment-body`, `.collab-comment-actions`.
     - `.collab-reply-thread`: indented hierarchy with subtle left border (`border-l-2 border-[var(--brd)] pl-4`).
     - `.collab-mention-chip`: pill badge styling (`background: rgba(59,130,246,0.12); color: #3b82f6; font-weight: 600; padding: 2px 6px; border-radius: 4px;`).
     - `.collab-mention-dropdown`: floating autocomplete popup positioned near cursor or textarea.
     - Support for `[data-ui-style="bauhaus"]` aesthetic.

3. `tests/collab-comments-ui.test.mjs` (CREATE):
   - Unit and contract tests asserting:
     1. In `COLLAB_MODE`, viewing `bug` doc renders `#collab-comments-section`.
     2. In `COLLAB_MODE`, viewing `task` doc renders `#collab-comments-section`.
     3. When `isCollabMode()` is false (personal mode), comments section is never rendered.
     4. For non-bug/task categories (`credential`, `runbook`, `testcases`), comments section is never rendered.
     5. When `state.sharedView = true`, comments section is omitted.
     6. Comments render author avatar, name, content, and reply thread.
     7. Edit/Delete buttons are displayed only when user is author (or team owner for delete).

4. `tests/runtime-performance.test.mjs` (VERIFY / MODIFY IF NEEDED):
   - Ensure direct startup asset budget holds. If new CSS pushes bytes slightly past 1,075,000, adjust threshold cleanly with documentation comment.

5. `tests/run.mjs` (MODIFY):
   - Add `import './collab-comments-ui.test.mjs';` so all tests execute under `node tests/run.mjs`.

## Constraints & Invariants
- Personal / offline edition must remain 100% clean and free of comments markup or errors.
- Never render comments section in shared view (`state.sharedView`).
- Strict XSS escaping: all user input (comment content, author names, member names) must be safely escaped before HTML insertion.
- All 199+ tests in `node tests/run.mjs` must pass.

## Verification Command
Run:
`node tests/run.mjs`
All tests must pass.
