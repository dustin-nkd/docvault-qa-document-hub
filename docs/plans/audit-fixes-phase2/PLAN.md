# Implementation Plan - Phase 2: Data Integrity, Workspace Race & Storage Fixes

## Invariants & Constraints
- Maintainability budgets:
  - `js/render-core.js <= 1760` (currently 1750)
  - `js/collab-store.js <= 400` (currently 399)
  - `js/actions-documents.js <= 753` (currently 731)
  - `js/actions-sharing.js <= 420` (currently 382)
- Service worker version bump to `v89`.
- All tests in `npm run check` and `tests/collab-store.test.mjs` must pass 100%.
- Review via Refract MCP profile `gemini-grok`.

## Work Breakdown
1. **CollabStore persist race condition fix** (`js/collab-store.js`):
   - Snapshot `targetDocs` and `targetIds` at start of `persist()`.
   - Guard against workspace switch before deletion logic.
2. **Trash Hard Delete permission guard** (`js/render-core.js`, `js/ui.js`):
   - Only allow Team Owner to hard delete in `COLLAB_MODE`.
   - Hide "Empty Trash" and "Delete Forever" from non-owners in collab mode.
3. **Cryptographic Share ID generator** (`js/actions-sharing.js`):
   - 128-bit random entropy for shared link IDs.
4. **Category transition orphan cleanup** (`js/actions-documents.js`):
   - Strip obsolete category payloads on category change.
5. **Collab invitation email normalization** (`js/collab-members.js`):
   - Lowercase and trim invite emails.
6. **SW Cache Bump** (`sw.js` and test files):
   - Bump to `v89`.
7. **Verification**:
   - Add unit tests for workspace race guard, trash gating, and share ID entropy.
   - Run `npm run check` and Refract review.
