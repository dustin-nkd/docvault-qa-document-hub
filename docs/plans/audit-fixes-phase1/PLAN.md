# Plan: Phase 1 Critical Bug & Security Hotfixes

## Tasks
1. **Fix `rotatedAt` handling in `js/collab-store.js`:**
   - In `toFirestoreDoc`: accept `doc.rotatedAt` if it's a non-empty string or a number; otherwise `null`.
   - Update tests in `tests/collab-store.test.mjs`.
2. **Sanitize `toast()` in `js/ui.js`:**
   - Use `escHtml(msg)` or text node insertion so user-controlled messages cannot execute arbitrary HTML/JS.
   - Add unit test verifying HTML escaping in toast.
3. **Declare `allocated` in `js/collab-store.js`:**
   - `let allocated;` in `allocateBugNumber`.
   - Keep line count `<= 400`.
4. **Constrain Document IDs in `firestore.rules`:**
   - In `match /documents/{id}`: require `id.matches('^[a-zA-Z0-9_-]{1,64}$')` on `allow create`.
   - Add unit test in `tests/firestore-rules.test.mjs` verifying malformed IDs are rejected.
5. **App Shell & Line Budget Maintenance:**
   - Bump `SW_VERSION` from `v87` to `v88` in `sw.js` and all shell contract tests.
   - Ensure all line budgets hold (`collab-store.js <= 400`, `render-core.js <= 1760`).
   - Run `npm run check` (100% passing).
6. **Refract Review & Final Handover:**
   - Submit review workflow job via Refract MCP.
   - Wait for review verdict.
   - Commit, push, and mark card done.
