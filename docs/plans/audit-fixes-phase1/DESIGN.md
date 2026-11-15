# Design: Phase 1 Critical Bug & Security Hotfixes

## Problem Statement
The app-wide audit revealed 4 immediate issues:
1. `rotatedAt` is stored as string `YYYY-MM-DD` in DOM/client, but `js/collab-store.js` serializer drops non-numeric types (`typeof doc.rotatedAt === 'number' ? doc.rotatedAt : null`), losing credential rotation dates on save.
2. `toast(msg)` in `js/ui.js` assigns `innerHTML = ...${msg}` without HTML escaping, opening DOM XSS vulnerabilities when displaying user-controlled inputs (tags, file names, workspace labels).
3. `allocateBugNumber` in `js/collab-store.js` assigns `allocated = ...` without `let`/`const`, creating an implicit global variable.
4. Document IDs interpolated into `data-onclick="viewDoc('${id}')"` in `render-core.js` and `ui.js` lack format restrictions in `firestore.rules`. Malicious document IDs with quotes could escape string literals.

## Invariants
1. `toFirestoreDoc` preserves both string `YYYY-MM-DD` and timestamp numbers for `rotatedAt` (or null if empty/omitted). `fromFirestoreDoc` preserves it as is.
2. `toast(msg, type)` escapes `msg` before setting HTML, or sets textContent on the message span.
3. `allocateBugNumber` declares `let allocated = 1;` within the transaction scope.
4. `firestore.rules` enforces regex for document ID on creation: `id.matches('^[a-zA-Z0-9_-]{1,64}$')`.
5. Maintainability line budgets in `scripts/quality-check.mjs` must not be violated:
   - `js/collab-store.js <= 400`
   - `js/render-core.js <= 1760`
   - `js/ui.js` remains well-structured.
6. Service Worker cache: If shipped client files change, bump `SW_VERSION` from `v87` to `v88`.
