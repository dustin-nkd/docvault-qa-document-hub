# Phase 2: Collab Comments Core Module, Mention Parser & Notifications

## Task
Implement the client-side data service `js/collab-comments.js`, integrate it into `js/collab-bootstrap.js` and `sw.js`, and add thorough unit tests in `tests/collab-comments.test.mjs` wired into `tests/run.mjs`.

## Context & Files to Modify/Create

1. `js/collab-comments.js` (CREATE):
   - Implements `(function(root) { ... })(typeof window !== 'undefined' ? window : globalThis);`
   - Exports `root.CollabComments`:
     - `init(db, authUser, member)`: stores current db, user, and member references.
     - `subscribe(docId, onUpdate, onError)`: attaches `onSnapshot` listener to `db.collection('documents').doc(docId).collection('comments')`, orders comments by `createdAt` ascending, runs `buildCommentTree`, and calls `onUpdate(tree, flatList)`. Returns unsubscribe function.
     - `addComment(docId, { content, parentId, mentions })`:
       - Validates non-empty string content up to 4000 characters.
       - Generates comment ID (`cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`).
       - Obtains current author details (`authorUid`, `authorName`, `authorEmail`).
       - Writes document to `/documents/{docId}/comments/{commentId}` with fields:
         `{ id, docId, parentId: parentId || null, authorUid, authorName, authorEmail, content, mentions: Array.isArray(mentions) ? mentions : [], createdAt: Date.now(), updatedAt: null }`.
       - For each valid `recipientUid` in `mentions` (where `recipientUid !== authorUid`), dispatches `notifyCommentMention(doc, comment, recipientUid)`.
       - Returns created comment object.
     - `updateComment(docId, commentId, { content, mentions })`:
       - Updates comment doc with `content`, `mentions`, and `updatedAt: Date.now()`.
     - `deleteComment(docId, commentId)`:
       - Deletes comment doc from `/documents/{docId}/comments/{commentId}`.
     - `buildCommentTree(flatComments)`:
       - Organizes comments where `parentId == null` into top-level items, each having a `replies: []` array containing child comments whose `parentId === parent.id`, sorted by `createdAt` ascending.
     - `extractMentions(text, members)`:
       - Scans text for `@Name` or `@[Name](uid)` patterns against available `members` list.
       - Returns deduplicated array of mentioned `member.uid`s (excluding current user).
     - `formatCommentContent(text, membersMap)`:
       - Performs HTML escaping to prevent XSS.
       - Replaces matched mention tokens with `<span class="collab-mention-chip">@DisplayName</span>`.
     - `notifyCommentMention(doc, comment, recipientUid)`:
       - Writes notification to `db.collection('notifications').doc(notifId)` with:
         `{ id: notifId, recipientUid, actorUid: comment.authorUid, actorName: comment.authorName, actorEmail: comment.authorEmail, docId: doc.id, docTitle: doc.title || 'Untitled', kind: 'comment_mention', signalKey: '', createdAt: Date.now(), readAt: null }`.
   - **Line budget constraint:** `js/collab-comments.js` MUST NOT exceed 400 lines of code.

2. `js/collab-bootstrap.js` (MODIFY):
   - Add `loadCollabComments()` following the existing pattern of `loadCollabActivity()` and `loadCollabAssign()`.
   - Invoke `loadCollabComments()` in `start()`.

3. `sw.js` (MODIFY):
   - Add `'./js/collab-comments.js'` to the cache file list (alongside `'./js/collab-activity.js'` and `'./js/collab-assign.js'`).

4. `tests/collab-comments.test.mjs` (CREATE):
   - Unit tests covering:
     1. Line budget check (`js/collab-comments.js` lines <= 400).
     2. `CollabComments` export and methods existence.
     3. `buildCommentTree` correctly separates root comments and groups replies under their parent.
     4. `extractMentions` correctly identifies member UIDs by matching display name.
     5. `formatCommentContent` escapes malicious HTML `<script>` tags and formats mention chips.
     6. `sw.js` contains `'./js/collab-comments.js'`.
     7. `collab-bootstrap.js` calls `loadCollabComments()`.
     8. `notifyCommentMention` constructs valid notification payload with `kind: 'comment_mention'`.

5. `tests/run.mjs` (MODIFY):
   - Add `import './collab-comments.test.mjs';` so the tests execute during `node tests/run.mjs`.

## Constraints & Invariants
- All existing tests in `node tests/run.mjs` must continue to pass.
- `js/collab-comments.js` must be under 400 lines.
- Safe HTML escaping: Never render unescaped user content.

## Verification Command
Run:
`node tests/run.mjs`
All tests must pass.
