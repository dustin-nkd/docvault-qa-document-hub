# Design: Team Comments Section for Bug Reports and Tasks

## 1. Context & Motivation
In DocVault QA Document Hub (Team Edition / `COLLAB_MODE`), team members collaborate on Bug Reports and Tasks. Currently, feedback and triage discussions happen outside the tool or require editing the document itself, which creates concurrency conflicts and clutters document revision history.

This design introduces a native, real-time **Comments Section** for documents of category `bug` and `task` in Team Edition. It supports threaded replies, `@mention` team autocomplete, in-app bell notifications, and granular permission enforcement across roles (`viewer`, `editor`, `owner`).

---

## 2. Goals & Non-Goals

### Goals
1. **Target Categories:** Render comments only on `bug` and `task` documents when `isCollabMode()` is active. Personal/offline mode remains unaffected.
2. **Storage & Realtime Sync:** Dedicated Firestore subcollection `/documents/{docId}/comments/{commentId}` with live `onSnapshot` subscriptions.
3. **Threaded Replies:** Support hierarchical comments with `parentId` (root comments and direct replies).
4. **Member @Mentions:** Autocomplete dropdown when typing `@`, rendering highlighted mention badges in comment bodies, and dispatching in-app bell notifications to mentioned members.
5. **Role-Based Permissions:**
   - Any team member (`viewer`, `editor`, `owner`) can read, post comments, and reply.
   - Comment author can edit their comment text (`updatedAt` tracked).
   - Comment author and Team Owner can delete comments.
6. **Notification Integration:** Creating a mention creates an unread notification in `/notifications/{notifId}` with `kind: 'comment_mention'`. Clicking the notification opens the document viewer.
7. **Architectural Consistency:** Encapsulated in `js/collab-comments.js` (≤ 400 lines budget), lazily loaded in `js/collab-bootstrap.js`, cached in `sw.js`.

### Non-Goals
- Real-time typing indicators / presence ("User is typing...").
- Rich-text WYSIWYG editor (keeps startup fast; plain text + mention highlighting + basic inline markdown like bold/code is supported).
- Comment reactions / emojis.
- Comments on other categories (`credential`, `runbook`, `testcases`, etc.).

---

## 3. Data Architecture & Firestore Schema

### 3.1 Comment Document Schema: `/documents/{docId}/comments/{commentId}`
```typescript
interface CollabComment {
  id: string;              // commentId (e.g. 'cmt_' + timestamp + '_' + random)
  docId: string;           // Parent document ID
  parentId: string | null; // null for top-level comments, commentId for replies
  authorUid: string;       // Firebase Auth UID
  authorName: string;      // Display name or email fallback
  authorEmail: string;     // Email address
  content: string;         // Plain text / markdown content
  mentions: string[];      // Array of mentioned member UIDs
  createdAt: number;       // Timestamp (epoch ms)
  updatedAt: number | null;// Timestamp (epoch ms) if edited, else null
}
```

### 3.2 Notification Payload Extension: `/notifications/{notifId}`
```typescript
interface CommentMentionNotification {
  recipientUid: string;    // Mentioned member's UID
  actorUid: string;        // Comment author's UID
  actorName: string;       // Comment author display name
  actorEmail: string;      // Comment author email
  docId: string;           // Target bug or task docId
  docTitle: string;        // Target doc title
  kind: 'comment_mention'; // Distinct notification kind
  signalKey: '';           // Empty string for mention notifications
  createdAt: number;       // Epoch ms
  readAt: number | null;   // null initially, timestamp when clicked
}
```

---

## 4. Security Rules (`firestore.rules`)

### 4.1 Subcollection `/documents/{id}/comments/{commentId}`
```firestore
match /documents/{id}/comments/{commentId} {
  // Any team member can read comments
  allow read: if isMember();

  // Any team member (viewer, editor, owner) can create comments
  allow create: if isMember() &&
    request.resource.data.authorUid == request.auth.uid &&
    request.resource.data.docId == id &&
    request.resource.data.createdAt is int &&
    request.resource.data.content is string &&
    request.resource.data.content.size() > 0 &&
    request.resource.data.content.size() <= 4000;

  // Author can edit their own comment text & updatedAt
  allow update: if isMember() &&
    resource.data.authorUid == request.auth.uid &&
    request.resource.data.authorUid == resource.data.authorUid &&
    request.resource.data.docId == resource.data.docId &&
    request.resource.data.parentId == resource.data.parentId &&
    request.resource.data.createdAt == resource.data.createdAt &&
    request.resource.data.updatedAt is int &&
    request.resource.data.content is string &&
    request.resource.data.content.size() > 0 &&
    request.resource.data.content.size() <= 4000;

  // Author or Team Owner can delete
  allow delete: if (isMember() && resource.data.authorUid == request.auth.uid) || isTeamOwner();
}
```

### 4.2 Updating `/notifications/{notifId}` Rule
Allow `isMember()` to create notifications when `kind == 'comment_mention'`:
```firestore
allow create: if (
  (isEditorOrOwner() && (
    (request.resource.data.kind == 'bug' && ...) ||
    (request.resource.data.kind == 'focus' && ...)
  )) ||
  (isMember() && request.resource.data.kind == 'comment_mention' &&
   request.resource.data.signalKey == '' &&
   exists(/databases/$(database)/documents/documents/$(request.resource.data.docId)))
) &&
request.resource.data.actorUid == request.auth.uid &&
request.resource.data.recipientUid != request.auth.uid &&
exists(/databases/$(database)/documents/members/$(request.resource.data.recipientUid)) &&
request.resource.data.readAt == null &&
request.resource.data.createdAt is int;
```

---

## 5. UI/UX Component Design

### 5.1 Placement & Layout
- Placed directly inside `renderViewer()` in `js/render-viewer.js` right below `renderViewerCategory(doc)` and above `viewer-bottom-actions`.
- Container ID: `#collab-comments-section`.
- Header: **Comments & Discussion (N)** with comment count badge.
- List:
  - Top-level comments arranged chronologically.
  - Nested reply container indented underneath parent comment.
- Each comment item displays:
  - Author Avatar / Initials badge with distinct color based on UID.
  - Author Name & Role badge (`Owner`, `Editor`, `Viewer`).
  - Relative timestamp ("just now", "10m ago", or `fmtDate`).
  - Comment content with rendered `@Name` highlight chips.
  - Edited indicator `(edited)` if `updatedAt` is present.
  - Action buttons: "Reply", "Edit" (if author), "Delete" (if author or owner).
- Input Box:
  - Auto-resizing textarea with placeholder "Leave a comment or type @ to mention...".
  - Floating `@mention` popup menu showing filtered team members.
  - Action buttons: "Comment" / "Reply" and "Cancel" (when replying or editing).

---

## 6. Testing Strategy

1. **Firestore Security Rules Unit Tests (`tests/firestore-rules.test.mjs`):**
   - Verify `viewer` can create comments and mention notifications.
   - Verify stranger/unauthed cannot read or create comments.
   - Verify author can update content, cannot alter authorUid or createdAt.
   - Verify non-author non-owner cannot delete comments.
   - Verify owner can delete any comment.
2. **Component & Contract Tests (`tests/collab-comments.test.mjs`):**
   - Verify module adheres to line budget (≤ 400 lines).
   - Test comment tree builder (grouping replies under `parentId`).
   - Test mention parser and extractor (extracting `@[Name](uid)` or `@Name`).
   - Test HTML escaping and XSS safety in comment rendering.
   - Test notification dispatch for mentioned members.
3. **Integration & Regression:**
   - Run `npm test` across all existing suites (190 tests) to ensure zero regressions.
