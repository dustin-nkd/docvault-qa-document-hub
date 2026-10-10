// DocVault Firestore Team Sharing Module (Phase 11)
(function(root) {
    let _customDb = null;
    let _customUser = null;

    function setCustomDb(db) { _customDb = db; }
    function setCustomUser(user) { _customUser = user; }

    function getDb() {
        if (_customDb) return _customDb;
        if (!root.firebase || !root.firebase.firestore) return null;
        const db = root.firebase.firestore();
        const host = root.location?.hostname || '';
        const emulatorHost = root.FIRESTORE_EMULATOR_HOST || (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) ||
            (host === 'localhost' || host === '127.0.0.1' ? '127.0.0.1:8080' : null);
        if (emulatorHost && !db._emulatorConnected) {
            try { const [h, p] = emulatorHost.split(':'); db.useEmulator(h, parseInt(p || '8080', 10)); db._emulatorConnected = true; } catch (_) {}
        }
        return db;
    }

    function getCurrentUser() {
        if (_customUser) return _customUser;
        if (root.CollabAuth?.getCurrentUser) { const u = root.CollabAuth.getCurrentUser(); if (u) return u; }
        return root.firebase?.auth ? root.firebase.auth().currentUser || null : null;
    }

    async function _encryptSharePayloadLocal(doc, keyBytes) {
        if (typeof root._encryptSharePayload === 'function') {
            return root._encryptSharePayload(doc, keyBytes);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
        const payload = typeof root._buildSharePayload === 'function' ? root._buildSharePayload(doc) : doc;
        const plain = new TextEncoder().encode(JSON.stringify(payload));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rawKey, plain);
        const packed = new Uint8Array(12 + cipher.byteLength);
        packed.set(iv);
        packed.set(new Uint8Array(cipher), 12);
        return root.uint8ToBase64 ? root.uint8ToBase64(packed) : btoa(String.fromCharCode(...packed));
    }

    async function shareDoc(id) {
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return;
        }
        const doc = (root.documents || []).find(d => d.id === id);
        if (!doc) return;
        if (doc.category === 'credential') {
            if (typeof root.toast === 'function') root.toast('Sharing is disabled for credential documents for security.', 'info');
            return;
        }

        let content = doc.content || '';
        if (root.CollabImages?.inlineCollabImagesForShare) {
            content = await root.CollabImages.inlineCollabImagesForShare(content);
        }
        if (typeof content === 'string' && /docvault-img:/.test(content)) {
            if (typeof root.toast === 'function') root.toast('Cannot create share link: unresolved images in document.', 'error');
            return;
        }

        if (typeof root.showModal === 'function') {
            root.showModal(`
                <div class="text-center py-6">
                    <i class="fa-solid fa-spinner fa-spin text-2xl mb-4" style="color:var(--acc)"></i>
                    <p class="text-sm" style="color:var(--tx-m)">Generating secure link…</p>
                </div>
            `);
        }

        try {
            const keyBytes = crypto.getRandomValues(new Uint8Array(32));
            const keyBase64 = root.uint8ToBase64 ? root.uint8ToBase64(keyBytes) : btoa(String.fromCharCode(...keyBytes));
            const encContent = await _encryptSharePayloadLocal({ ...doc, content }, keyBytes);

            const shareId = 'sh_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 6);
            const db = getDb();
            if (!db) throw new Error('Firestore is not available');
            const user = getCurrentUser();
            const now = Date.now();
            const shareRecord = {
                docId: doc.id,
                ciphertext: encContent,
                createdBy: user?.uid || '',
                createdAt: now,
                updatedAt: now
            };
            await db.collection('shares').doc(shareId).set(shareRecord);

            if (typeof root._recordShare === 'function') {
                root._recordShare({
                    shareId,
                    docId: doc.id,
                    title: doc.title,
                    category: doc.category,
                    createdAt: now,
                    keyBase64,
                    docUpdatedAt: doc.updatedAt
                });
            }

            const origin = root.location?.origin || '';
            const pathname = root.location?.pathname || '';
            const shareUrl = `${origin}${pathname}?shareId=${shareId}#key=${encodeURIComponent(keyBase64)}`;

            if (typeof root.showModal === 'function') {
                const esc = typeof root.escHtml === 'function' ? root.escHtml : s => String(s);
                root.showModal(`
                    <div class="text-center">
                        <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.1);">
                            <i class="fa-solid fa-check text-emerald-400 text-xl"></i>
                        </div>
                        <h3 class="font-heading font-semibold text-lg mb-2">Link Ready!</h3>
                        <p class="text-sm mb-4" style="color:var(--tx-m);">Anyone with this link can view the document. The content is end-to-end encrypted.</p>
                        <div class="flex items-center gap-2 p-3 rounded-lg border mb-5 text-left" style="background:var(--bg);border-color:var(--brd);">
                            <input type="text" readonly id="share-url-input" value="${esc(shareUrl)}" class="flex-1 bg-transparent text-xs outline-none font-mono" style="color:var(--tx);">
                            <button class="shrink-0 btn-s px-3 py-1.5 text-xs" data-onclick="copyShareUrl(this)">
                                <i class="fa-regular fa-copy mr-1"></i>Copy
                            </button>
                        </div>
                        <button class="btn-s px-4" data-onclick="closeModal()">Close</button>
                    </div>
                `);
            }
        } catch (e) {
            console.error('[CollabShares.shareDoc]', e);
            if (typeof root.toast === 'function') root.toast('Failed to create share link: ' + e.message, 'error');
            if (typeof root.closeModal === 'function') root.closeModal();
        }
    }

    async function pushShareSnapshot(entry, doc) {
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') return;
        let content = doc.content || '';
        if (root.CollabImages?.inlineCollabImagesForShare) {
            content = await root.CollabImages.inlineCollabImagesForShare(content);
        }
        if (typeof content === 'string' && /docvault-img:/.test(content)) return;
        const keyBytes = Uint8Array.from(atob(entry.keyBase64), c => c.charCodeAt(0));
        const encContent = await _encryptSharePayloadLocal({ ...doc, content }, keyBytes);
        const db = getDb();
        if (!db) return;
        await db.collection('shares').doc(entry.shareId).update({
            ciphertext: encContent,
            updatedAt: Date.now()
        });
        entry.docUpdatedAt = doc.updatedAt;
    }

    async function syncActiveShares() {
        if (typeof root.GUEST_MODE !== 'undefined' && root.GUEST_MODE) return;
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') return;
        const shares = typeof root._getShares === 'function' ? root._getShares() : [];
        if (!shares.length) return;
        const docs = root.documents || [];
        const stale = shares.filter(entry => entry.keyBase64 && entry.docUpdatedAt !== undefined
            ? docs.some(d => d.id === entry.docId && d.status !== 'deleted' && d.updatedAt !== entry.docUpdatedAt)
            : false);
        if (!stale.length) return;
        let changed = false;
        for (const entry of stale) {
            const doc = docs.find(d => d.id === entry.docId && d.status !== 'deleted');
            if (!doc || doc.category === 'credential') continue;
            try {
                await pushShareSnapshot(entry, doc);
                changed = true;
            } catch (e) {
                console.warn('[CollabShares.syncActiveShares] failed for', entry.shareId, e);
            }
        }
        if (changed && typeof root._saveShares === 'function') root._saveShares(shares);
    }

    async function revokeShare(shareId) {
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return;
        }
        const db = getDb();
        if (db) {
            try {
                await db.collection('shares').doc(shareId).delete();
            } catch (e) {
                if (typeof root.toast === 'function') root.toast('Removed from list, but team server delete failed: ' + e.message, 'error');
                if (typeof root._removeShare === 'function') root._removeShare(shareId);
                if (typeof root.showShareManager === 'function') root.showShareManager();
                return;
            }
        }
        if (typeof root._removeShare === 'function') root._removeShare(shareId);
        if (typeof root.toast === 'function') root.toast('Share link revoked.', 'success');
        if (typeof root.showShareManager === 'function') root.showShareManager();
    }

    async function revokeSharesForDocs(docIds) {
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return { revoked: 0, failed: 0 };
        }
        const ids = new Set(docIds || []);
        if (!ids.size) return { revoked: 0, failed: 0 };
        const shares = typeof root._getShares === 'function' ? root._getShares() : [];
        const doomed = shares.filter(s => ids.has(s.docId));
        if (!doomed.length) return { revoked: 0, failed: 0 };
        const db = getDb();
        const revoked = new Set();
        let failed = 0;
        for (const entry of doomed) {
            try {
                if (db) await db.collection('shares').doc(entry.shareId).delete();
                revoked.add(entry.shareId);
            } catch (e) {
                failed++;
                console.warn('[CollabShares.revokeSharesForDocs] could not revoke', entry.shareId, e);
            }
        }
        if (revoked.size && typeof root._saveShares === 'function') {
            root._saveShares(shares.filter(s => !revoked.has(s.shareId)));
        }
        return { revoked: revoked.size, failed };
    }

    async function revokeSharesInWorkspace(workspaceId) {
        if (root.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            if (typeof root.toast === 'function') root.toast('You have view access', 'error');
            return { revoked: 0, failed: 0 };
        }
        const key = workspaceId === 'default' ? 'docvault_shares' : 'ws_' + workspaceId + '__docvault_shares';
        let entries;
        try { entries = JSON.parse(root.localStorage?.getItem(key) || '[]'); } catch (e) { entries = []; }
        if (!Array.isArray(entries) || !entries.length) return { revoked: 0, failed: 0 };
        const db = getDb();
        const remaining = [];
        let revoked = 0;
        for (const entry of entries) {
            try {
                if (db) await db.collection('shares').doc(entry.shareId).delete();
                revoked++;
            } catch (e) {
                remaining.push(entry);
                console.warn('[CollabShares.revokeSharesInWorkspace] could not revoke', entry.shareId, e);
            }
        }
        if (remaining.length && root.localStorage) root.localStorage.setItem(key, JSON.stringify(remaining));
        else if (root.localStorage) root.localStorage.removeItem(key);
        return { revoked, failed: remaining.length };
    }

    async function loadSharedDoc(shareId, keyBase64) {
        try {
            if (!_customDb) {
                if (root.ensureFirebase) await root.ensureFirebase();
                if (!root.firebase) throw new Error('Firebase SDK is not available');
                if (!root.firebase.apps || !root.firebase.apps.length) {
                    const config = root.CollabConfig?.getFirebaseConfig
                        ? root.CollabConfig.getFirebaseConfig()
                        : root.FIREBASE_CONFIG;
                    if (config) root.firebase.initializeApp(config);
                }
            }
            const db = getDb();
            if (!db) throw new Error('Database is not available');
            const snap = await db.collection('shares').doc(shareId).get();
            if (!snap || !snap.exists) {
                throw new Error('Document not found or link has expired.');
            }
            const shareData = snap.data();
            const encContent = shareData?.ciphertext;
            if (!encContent) {
                throw new Error('Document not found or link has expired.');
            }

            const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
            const packed = Uint8Array.from(atob(encContent), c => c.charCodeAt(0));
            const iv = packed.slice(0, 12);
            const cipher = packed.slice(12);

            const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
            const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, rawKey, cipher);
            const doc = JSON.parse(new TextDecoder().decode(plain));
            const embeddedLinkedDocs = doc._linkedDocs || [];
            delete doc._linkedDocs;

            const mainDoc = {
                ...doc,
                id: shareId,
                status: doc.status || 'published',
                favorite: false,
                updatedAt: shareData.updatedAt || doc.createdAt || Date.now(),
                tags: doc.tags || []
            };
            root.documents = [mainDoc, ...embeddedLinkedDocs];
            if (root.state) {
                root.state.view = 'viewer';
                root.state.sharedView = true;
                root.state.editingDoc = root.documents[0];
            }
            const sb = typeof document !== 'undefined' ? document.getElementById('sidebar') : null;
            if (sb) sb.style.display = 'none';
            const sbBtn = typeof document !== 'undefined' ? document.querySelector('button[data-onclick="toggleSidebar()"]') : null;
            if (sbBtn) sbBtn.style.display = 'none';
            if (typeof root.render === 'function') root.render();
        } catch (e) {
            console.error('[CollabShares.loadSharedDoc]', e);
            if (typeof document !== 'undefined') {
                const esc = typeof root.escHtml === 'function' ? root.escHtml : s => String(s);
                document.body.innerHTML = `<div class="flex items-center justify-center h-screen" style="background:var(--bg)"><div class="p-10 text-center max-w-sm"><div class="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style="background:rgba(244,63,94,0.1);"><i class="fa-solid fa-link-slash text-rose-400 text-2xl"></i></div><h1 class="font-heading text-xl font-bold mb-3" style="color:var(--tx)">Link Invalid or Expired</h1><p class="text-sm mb-6" style="color:var(--tx-m)">${esc(e.message)}</p><button class="btn-p" data-onclick="openAppHome()">Go to DocVault</button></div></div>`;
            }
        }
    }

    root.CollabShares = {
        setCustomDb,
        setCustomUser,
        shareDoc,
        pushShareSnapshot,
        syncActiveShares,
        revokeShare,
        revokeSharesForDocs,
        revokeSharesInWorkspace,
        loadSharedDoc
    };
})(typeof window !== 'undefined' ? window : globalThis);
