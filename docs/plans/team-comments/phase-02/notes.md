# Phase 2 Decision Notes

## Task 1: Create js/collab-comments.js
### Decisions made
- Implemented `CollabComments` with `init`, `subscribe`, `addComment`, `updateComment`, `deleteComment`, `buildCommentTree`, `extractMentions`, `formatCommentContent`, and `notifyCommentMention`.
- Maintained strict line budget: 352 lines (<= 400 lines limit).
- Built safe HTML escaping in `formatCommentContent` to neutralize `<script>` and malicious HTML before replacing mention chips.
- Designed `buildCommentTree` to group child comments under `parent.replies` sorted by `createdAt` ascending, with fallback handling for orphaned comments.
- Implemented mention parsing supporting plain `@DisplayName` and markdown `@[Name](uid)` tokens while excluding self-mentions and deduplicating UIDs.
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
  - Verification: `node -c js/collab-comments.js` -> Clean syntax; line count 352 lines.
- Root cause (bugfix only): none

## Task 2: Update js/collab-bootstrap.js and sw.js
### Decisions made
- Added `loadCollabComments()` in `js/collab-bootstrap.js` following `loadCollabActivity()` and `loadCollabAssign()` patterns.
- Included `loadCollabComments()` in `start()`, `handleUserAuth()`, `signOut()` teardown, and exported on `root.CollabBootstrap`.
- Added `'./js/collab-comments.js'` to `APP_SHELL` in `sw.js` alongside `'./js/collab-activity.js'` and `'./js/collab-assign.js'`.
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
  - Verification: `node scripts/quality-check.mjs` -> Passed (38 JS files, 30 HTML assets, 52 shell assets).
- Root cause (bugfix only): none

## Task 3: Create tests/collab-comments.test.mjs and wire into tests/run.mjs
### Decisions made
- Created test suite with 9 unit tests covering line budget, module contracts, comment tree building, mention extraction, XSS sanitization, mention formatting, service worker caching, bootstrap integration, notification dispatch, and comment CRUD.
- Registered `import './collab-comments.test.mjs';` into `tests/run.mjs`.
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
  - Command: `node tests/run.mjs` -> 199 pass, 0 fail (all 190 baseline + 9 new tests pass).
- Root cause (bugfix only): none
