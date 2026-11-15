# Design Document - Phase 2: Data Integrity, Workspace Race & Storage Fixes

## 1. Problem Statement
The DocVault audit identified five operational and data integrity hazards:
1. **Workspace-Switch Deletion Race**: When `persist()` is in-flight across network latency, if the user switches workspace, `documents` is replaced. The post-save deletion check compares `documents` against the previous workspace's sync cache, risking unintended deletion of documents.
2. **Trash Hard Delete Privilege Desynchronization**: `firestore.rules` enforces `allow delete: if isTeamOwner()`. However, the Trash UI displays "Empty Trash" and "Delete Forever" to all editors. When an editor clicks delete, the item is optimistically removed from local state, Firestore rejects with `permission-denied`, and the document resurfaces upon reload or sync.
3. **Weak Public Share ID Entropy**: Share snapshot IDs are generated using `Math.random().toString(36).substr(2, 6)` (~2.1B permutations combined with timestamp), making public shared links vulnerable to enumeration.
4. **Category Transition Orphan Residue**: When a document changes category (e.g., from `bug` to `task`), legacy category-specific payloads (`bugData`, `taskData`, `apiData`) remain attached, causing data bloat and schema confusion.
5. **Invite Email Casing**: Invitations with mixed-case emails may fail authentication matching against provider emails (Google Auth defaults to lowercase).

## 2. Proposed Architecture & Changes

### 2.1 Workspace Race Guard in `persist()`
- In `js/collab-store.js`:
  - Snapshot active workspace ID and target documents array upfront:
    ```javascript
    const activeWs = (typeof root.getActiveWorkspaceId === 'function' ? root.getActiveWorkspaceId() : '') || 'default';
    const targetDocs = getDocuments().slice();
    const targetIds = new Set(targetDocs.map(d => d.id));
    ```
  - Before running tombstone/deletion sweeps:
    ```javascript
    const currentWs = (typeof root.getActiveWorkspaceId === 'function' ? root.getActiveWorkspaceId() : '') || 'default';
    if (currentWs !== activeWs) return;
    ```
  - Ensure deletion decisions compare `lastSyncedDocIds` strictly against `targetIds` rather than a potentially mutated global array.

### 2.2 Trash Hard Delete Permission Gating
- In `js/render-core.js` and `js/ui.js`:
  - Check team owner status when in `COLLAB_MODE`:
    ```javascript
    const canHardDelete = !isCollabMode() || (typeof CollabAuth !== 'undefined' && CollabAuth.isOwner());
    ```
  - In `renderDocList()` trash view: hide or conditionally render "Empty Trash" only when `canHardDelete` is true.
  - In `showDocMenu()`: hide "Delete Forever" when in trash view if `canHardDelete` is false.
  - In `showDeleteModal()` and `showEmptyTrashModal()`: guard against unauthorized calls by returning early with an informative toast warning.

### 2.3 Cryptographic Entropy for Share IDs
- In `js/actions-sharing.js`:
  - Replace `Math.random()` share ID generator with `crypto.getRandomValues()` generating 16 bytes (128 bits) of entropy formatted in hex/base64url (`sh_` + 32 alphanumeric chars).

### 2.4 Category Orphan Field Sanitation
- In `js/actions-documents.js` during document persistence:
  - When saving a document, clean category-specific fields inconsistent with the active category.

### 2.5 Email Normalization in Invitations
- In `js/collab-members.js`:
  - Trim and `.toLowerCase()` all email arguments when creating, sending, and accepting invitations.

### 2.6 Service Worker Bump
- Bump `SW_VERSION = 'v89'` in `sw.js` and relevant tests.
