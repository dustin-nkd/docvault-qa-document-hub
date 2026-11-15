# Phase 1: Backend Security Rules & Notifications Extension

## Task
Update Firestore security rules in `firestore.rules` and add rule verification tests in `tests/firestore-rules.test.mjs` to establish permissions for the comments subcollection `/documents/{id}/comments/{commentId}` and allow team members to create mention notifications in `/notifications/{notifId}`.

## Context & Files to Modify
1. `firestore.rules`:
   - Under `match /documents/{id}`, add a nested match for `comments/{commentId}` (similar to the existing `history/{snapId}` block):
     ```firestore
     match /comments/{commentId} {
       allow read: if isMember();

       allow create: if isMember() &&
         request.resource.data.authorUid == request.auth.uid &&
         request.resource.data.docId == id &&
         request.resource.data.createdAt is int &&
         request.resource.data.content is string &&
         request.resource.data.content.size() > 0 &&
         request.resource.data.content.size() <= 4000;

       allow update: if isMember() &&
         resource.data.authorUid == request.auth.uid &&
         request.resource.data.authorUid == resource.data.authorUid &&
         request.resource.data.docId == resource.data.docId &&
         request.resource.data.createdAt == resource.data.createdAt &&
         (!('parentId' in resource.data) || request.resource.data.parentId == resource.data.parentId) &&
         request.resource.data.updatedAt is int &&
         request.resource.data.content is string &&
         request.resource.data.content.size() > 0 &&
         request.resource.data.content.size() <= 4000;

       allow delete: if (isMember() && resource.data.authorUid == request.auth.uid) || isTeamOwner();
     }
     ```
   - In `match /notifications/{notifId}`, update the `allow create` condition so that any `isMember()` can create notifications when `kind == 'comment_mention'`:
     ```firestore
     allow create: if (
       (isEditorOrOwner() && (
         (request.resource.data.kind == 'bug' && ...) ||
         (request.resource.data.kind == 'focus' && ...)
       )) ||
       (isMember() &&
        request.resource.data.kind == 'comment_mention' &&
        request.resource.data.signalKey == '' &&
        exists(/databases/$(database)/documents/documents/$(request.resource.data.docId)))
     ) &&
     request.resource.data.actorUid == request.auth.uid &&
     request.resource.data.recipientUid != request.auth.uid &&
     exists(/databases/$(database)/documents/members/$(request.resource.data.recipientUid)) &&
     request.resource.data.readAt == null &&
     request.resource.data.createdAt is int;
     ```

2. `tests/firestore-rules.test.mjs`:
   - Add a new branch test suite (e.g., `Branch 15 (comments)`) verifying:
     - All roles (viewer, editor, owner) can read comments and create comments with valid schema.
     - Stranger and unauthenticated requests fail read and create.
     - Author can update comment text and updatedAt; attempts to change authorUid, docId, or createdAt fail. Non-authors cannot update.
     - Author can delete their comment; Team Owner can delete any comment; non-author editor/viewer cannot delete someone else's comment.
   - Add a test verifying that `viewer` can create `kind: 'comment_mention'` notifications for other members on existing documents.

## Constraints & Invariants
- Preserves all 190 existing tests in `node tests/run.mjs`.
- Existing document, member, workspace, and notification rules remain intact.

## Verification Command
Run:
`node tests/run.mjs`
All tests must pass.
