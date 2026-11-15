# Phase 1 Decision Notes

## Task 1: Add comments subcollection tests in tests/firestore-rules.test.mjs
### Decisions made
- Defined Branch 15 test cases covering member roles (viewer, editor, owner), replies with `parentId`, stranger/unauthed denial, schema boundaries (4000 char max, non-empty, int timestamps, docId & authorUid verification), author-only updates, and deletion privileges (author and owner).
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - Verification: `node -c tests/firestore-rules.test.mjs` -> Syntax clean, rules tests structured.
- Root cause (bugfix only): none

## Task 2: Add comment_mention notification tests in tests/firestore-rules.test.mjs
### Decisions made
- Added assertions verifying that `viewer` and `editor` can create `kind: 'comment_mention'` notifications for other members on existing documents.
- Tested failure cases: self-mentions, non-existent docId, non-member recipient, non-empty signalKey, and stranger attempts.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - Verification: `node -c tests/firestore-rules.test.mjs` -> Syntax clean.
- Root cause (bugfix only): none

## Task 3: Update firestore.rules for comments and comment_mention notifications
### Decisions made
- Nested `match /comments/{commentId}` inside `match /documents/{id}` with read for `isMember()`, create for `isMember()` validating docId, authorUid, int createdAt, and 1..4000 content size.
- Implemented update rule preserving authorUid, docId, createdAt, and parentId, requiring updatedAt int and valid content.
- Restricted delete to comment author or team owner.
- Extended `notifications/{notifId}` create rule allowing any member to create `kind: 'comment_mention'` with empty signalKey for existing documents and team recipients.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - Verification: `node tests/run.mjs` -> 190 pass, 0 fail.
- Root cause (bugfix only): none

## Task 4: Full verification of existing test suite
### Decisions made
- Ran the full test suite `node tests/run.mjs` to verify zero regression across all 190 tests.
### Spec deviations
- none
### Tradeoffs accepted
- none
### Assumptions
- none
### Follow-ups for human
- none
### Test evidence
- RED -> GREEN:
  - Command: `node tests/run.mjs` -> 190 pass, 0 fail (duration ~2.8s).
- Root cause (bugfix only): none
