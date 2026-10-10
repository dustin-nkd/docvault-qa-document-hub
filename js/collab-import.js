/**
 * DocVault Team Collab Import (Sprint 17 / Phase 10)
 * Allows team owner to import local default workspace vault into Firestore once.
 * Preserves document id, sets version: 1, createdBy and updatedBy = owner uid.
 * Converts inline images to Firestore images/{imageId} and docvault-img tokens.
 * Skips oversized documents (> 900,000 bytes) and sets counters/bugs = maxBugNumber.
 */
(function(root) {
    'use strict';

    let _customDb = null;
    let _customUser = null;

    function isCollabMode() {
        return typeof root.COLLAB_MODE !== 'undefined' ? Boolean(root.COLLAB_MODE) : false;
    }

    function isGuestMode() {
        return typeof root.GUEST_MODE !== 'undefined' ? Boolean(root.GUEST_MODE) : false;
    }

    function getFirestoreDb() {
        if (_customDb) return _customDb;
        return root.firebase && typeof root.firebase.firestore === 'function' ? root.firebase.firestore() : null;
    }

    function getCurrentUser() {
        if (_customUser) return _customUser;
        return root.firebase && typeof root.firebase.auth === 'function' && root.firebase.auth().currentUser
            ? root.firebase.auth().currentUser
            : null;
    }

    function getCurrentMember() {
        return root.CollabBootstrap && typeof root.CollabBootstrap.getCurrentMember === 'function'
            ? root.CollabBootstrap.getCurrentMember()
            : null;
    }

    function isOwner() {
        const m = getCurrentMember();
        return m?.role === 'owner';
    }

    function hasUnimportedLocalVault() {
        if (typeof localStorage === 'undefined') return false;
        if (localStorage.getItem('docvault_collab_imported_at')) return false;
        const raw = localStorage.getItem('docvault_docs');
        return Boolean(raw && raw !== '[]' && raw !== '{}');
    }

    async function processDocImages(content, ownerUid, db) {
        if (typeof content !== 'string' || !content.includes('data:image/')) return content;
        const DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
        const urls = [...new Set(content.match(DATA_RE) || [])];
        if (!urls.length) return content;
        let updated = content;

        for (const dataUrl of urls) {
            try {
                const comma = dataUrl.indexOf(',');
                const meta = comma !== -1 ? dataUrl.slice(0, comma) : '';
                const rawB64 = comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
                const contentType = meta.includes('image/png') ? 'image/png' : 'image/jpeg';
                let padding = 0;
                if (rawB64.endsWith('==')) padding = 2;
                else if (rawB64.endsWith('=')) padding = 1;
                const byteSize = Math.floor(rawB64.length * 3 / 4) - padding;
                if (byteSize > 700000) continue;

                const imageId = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
                if (db) {
                    await db.collection('images').doc(imageId).set({
                        contentType,
                        data: rawB64,
                        byteSize,
                        createdBy: ownerUid,
                        createdAt: new Date().toISOString()
                    });
                }
                if (root.CollabImages?.getImageCache) {
                    root.CollabImages.getImageCache().set(imageId, dataUrl);
                }
                updated = updated.replaceAll(dataUrl, 'docvault-img:' + imageId);
            } catch (_) {}
        }
        return updated;
    }

    async function parseLocalDocs(password = null) {
        if (typeof localStorage === 'undefined') return [];
        const raw = localStorage.getItem('docvault_docs');
        if (!raw) return [];

        const isEncrypted = root.Vault?.isEncrypted ? root.Vault.isEncrypted(raw) : (raw.startsWith('ENC:v2:') || raw.startsWith('ENC:'));
        let parsed = null;
        const usedPwd = password || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('docvault_pwd') : null);

        if (isEncrypted) {
            if (!usedPwd) throw new Error('PASSWORD_REQUIRED');
            if (!root.Vault?.decrypt) throw new Error('Vault decryption not available');
            parsed = await root.Vault.decrypt(raw, usedPwd);
        } else {
            parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        }

        const docs = Array.isArray(parsed) ? parsed : (parsed?.docs || []);
        if (isEncrypted && usedPwd && root.Vault?.decrypt) {
            for (const doc of docs) {
                if (doc.category === 'credential' && doc.password && root.Vault.isEncrypted(doc.password)) {
                    try {
                        const plain = await root.Vault.decrypt(doc.password, usedPwd);
                        doc.password = typeof plain === 'string' ? plain : '';
                    } catch (_) {}
                }
            }
        }
        return docs;
    }

    async function importLocalVault(options = {}) {
        if (isGuestMode() || !isCollabMode()) {
            throw new Error('Import is only available in COLLAB_MODE');
        }
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can import local vaults.', 'error');
            return null;
        }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

        const user = getCurrentUser();
        const ownerUid = user ? user.uid : (getCurrentMember()?.uid || 'owner');

        const localDocs = options.documents || await parseLocalDocs(options.password);
        if (!localDocs || !localDocs.length) {
            if (typeof root.toast === 'function') root.toast('No local documents found to import.', 'info');
            return { imported: 0, skipped: 0, skippedIds: [] };
        }

        // Fetch existing Firestore IDs to avoid overwriting
        const existingIds = new Set();
        try {
            const snap = await db.collection('documents').get();
            if (snap && typeof snap.forEach === 'function') {
                snap.forEach(d => existingIds.add(d.id));
            }
        } catch (err) {
            console.error('[CollabImport] Failed to fetch existing documents:', err);
            throw err;
        }

        const docsToSave = [];
        const skippedOversizeIds = [];
        let maxBugNumber = 0;

        for (const doc of localDocs) {
            if (!doc || !doc.id) continue;
            if (existingIds.has(doc.id)) continue;

            if (doc.category === 'bug' && typeof doc.bugNumber === 'number') {
                maxBugNumber = Math.max(maxBugNumber, doc.bugNumber);
            }

            let content = doc.content;
            if (typeof content === 'string' && content.includes('data:image/')) {
                content = await processDocImages(content, ownerUid, db);
                doc.content = content;
            }

            const now = Date.now();
            const createdAt = typeof doc.createdAt === 'number' ? doc.createdAt : now;
            const updatedAt = typeof doc.updatedAt === 'number' ? doc.updatedAt : now;

            const payload = root.CollabStore?.toFirestoreDoc
                ? root.CollabStore.toFirestoreDoc(doc, { version: 1, createdBy: ownerUid, updatedBy: ownerUid, createdAt, updatedAt })
                : {
                    id: doc.id, title: doc.title || '', category: doc.category || 'general', subfolder: doc.subfolder || '', status: doc.status || 'active',
                    content: doc.content || '', tags: Array.isArray(doc.tags) ? [...doc.tags] : [], username: doc.username || '', password: doc.password || '',
                    rotatedAt: doc.rotatedAt || null, bugData: doc.bugData || null, tcData: doc.tcData || null, apiData: doc.apiData || null, apiTcData: doc.apiTcData || null,
                    runData: doc.runData || null, envData: doc.envData || null, releaseData: doc.releaseData || null, tcPlanData: doc.tcPlanData || null,
                    kanbanStatus: doc.kanbanStatus || '', bugStatus: doc.bugStatus || '', bugStatusEvents: Array.isArray(doc.bugStatusEvents) ? [...doc.bugStatusEvents] : [],
                    bugNumber: typeof doc.bugNumber === 'number' ? doc.bugNumber : null, favorite: Boolean(doc.favorite),
                    createdAt, updatedAt, version: 1, createdBy: ownerUid, updatedBy: ownerUid,
                    focusWorkflow: doc.focusWorkflow || null, focusWorkflowUpdatedAt: doc.focusWorkflowUpdatedAt || null
                };

            const sz = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(JSON.stringify(payload)).length : JSON.stringify(payload).length;
            if (sz > 900000) {
                skippedOversizeIds.push(doc.id);
                continue;
            }

            docsToSave.push({ id: doc.id, payload });
        }

        // Batch write with max 400 documents per batch
        if (docsToSave.length > 0) {
            const batchSize = 400;
            for (let i = 0; i < docsToSave.length; i += batchSize) {
                const chunk = docsToSave.slice(i, i + batchSize);
                if (typeof db.batch === 'function') {
                    const batch = db.batch();
                    for (const item of chunk) {
                        batch.set(db.collection('documents').doc(item.id), item.payload);
                    }
                    await batch.commit();
                } else {
                    for (const item of chunk) {
                        await db.collection('documents').doc(item.id).set(item.payload);
                    }
                }
            }
        }

        // Set bug counter if maxBugNumber >= 1 and counter does not exist yet
        if (maxBugNumber >= 1) {
            try {
                const counterRef = db.collection('counters').doc('bugs');
                const counterSnap = await counterRef.get();
                if (!counterSnap.exists) {
                    await counterRef.set({ next: maxBugNumber });
                }
            } catch (err) {
                console.warn('[CollabImport] Failed to update bug counter:', err);
            }
        }

        // Mark local as imported without touching documents
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('docvault_collab_imported_at', String(Date.now()));
        }

        if (root.CollabStore?.loadDocuments) {
            try {
                const fresh = await root.CollabStore.loadDocuments();
                if (typeof root.normalizeDocTags === 'function') root.normalizeDocTags(fresh);
                root.documents = fresh;
                if (typeof root.render === 'function') root.render();
            } catch (_) {}
        }

        const importedCount = docsToSave.length;
        if (typeof root.toast === 'function') {
            if (skippedOversizeIds.length > 0) {
                root.toast(`Imported ${importedCount} document${importedCount !== 1 ? 's' : ''}. Skipped ${skippedOversizeIds.length} oversize document${skippedOversizeIds.length !== 1 ? 's' : ''}: ${skippedOversizeIds.join(', ')}`, 'warning');
            } else {
                root.toast(`Imported ${importedCount} document${importedCount !== 1 ? 's' : ''} from local vault.`, 'success');
            }
        }

        return {
            imported: importedCount,
            skipped: skippedOversizeIds.length,
            skippedIds: skippedOversizeIds
        };
    }

    function promptPasswordModal() {
        if (typeof root.showModal !== 'function') return;
        root.showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(99,102,241,0.12);"><i class="fa-solid fa-key" style="color:#818cf8;"></i></div>
                <h3 class="font-heading font-semibold text-lg mb-2">Decrypt Local Vault</h3>
                <p class="text-sm mb-4" style="color:var(--tx-m);">Enter your master password to decrypt this browser's local vault for import.</p>
                <div class="mb-4 text-left">
                    <input type="password" id="collab-import-password" class="form-input w-full py-2 px-3 text-sm" placeholder="Master Password" autofocus>
                </div>
                <div class="flex gap-2 justify-center">
                    <button type="button" class="btn-s py-2 px-4 text-xs" data-onclick="closeModal()">Cancel</button>
                    <button type="button" class="btn-p py-2 px-4 text-xs" data-onclick="collabSubmitImportPassword()">Unlock & Import</button>
                </div>
            </div>`);
    }

    async function startImport() {
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can import local vaults.', 'error');
            return;
        }
        if (!hasUnimportedLocalVault()) {
            if (typeof root.toast === 'function') root.toast('No unimported local vault found in this browser.', 'info');
            return;
        }
        const raw = localStorage.getItem('docvault_docs');
        const isEncrypted = root.Vault?.isEncrypted ? root.Vault.isEncrypted(raw) : (raw?.startsWith('ENC:v2:') || raw?.startsWith('ENC:'));
        const sessionPwd = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('docvault_pwd') : null;

        if (isEncrypted && !sessionPwd) {
            promptPasswordModal();
            return;
        }

        try {
            await importLocalVault({ password: sessionPwd });
            if (typeof root.closeModal === 'function') root.closeModal();
            if (root.CollabMembers?.loadAndRenderTeam) root.CollabMembers.loadAndRenderTeam();
        } catch (err) {
            if (err.message === 'PASSWORD_REQUIRED') {
                promptPasswordModal();
            } else {
                if (typeof root.toast === 'function') root.toast('Import failed: ' + err.message, 'error');
            }
        }
    }

    root.collabSubmitImportPassword = async function() {
        const input = document.getElementById('collab-import-password');
        const pwd = input?.value || '';
        if (!pwd) {
            if (typeof root.toast === 'function') root.toast('Please enter your master password.', 'error');
            return;
        }
        try {
            await importLocalVault({ password: pwd });
            if (typeof root.closeModal === 'function') root.closeModal();
            if (root.CollabMembers?.loadAndRenderTeam) root.CollabMembers.loadAndRenderTeam();
        } catch (err) {
            if (typeof root.toast === 'function') root.toast('Decryption or import failed: ' + err.message, 'error');
        }
    };

    const CollabImport = {
        importLocalVault,
        startImport,
        parseLocalDocs,
        processDocImages,
        hasUnimportedLocalVault,
        setDb: (db) => { _customDb = db; },
        setUser: (user) => { _customUser = user; }
    };

    root.CollabImport = CollabImport;
})(typeof window !== 'undefined' ? window : globalThis);
