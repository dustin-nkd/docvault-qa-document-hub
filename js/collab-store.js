// DocVault team collaboration store module
// Handles document loading (getDocs), change detection, versioned persistence, conflict detection, and live onSnapshot sync.
(function(root) {
    const _knownDocs = new Map();
    let _lastConflict = null, _customDb = null, _customUser = null;
    let _unsubscribeSnapshot = null, _persistencePromise = null;

    function isGuestMode() {
        if (typeof root.GUEST_MODE !== 'undefined' && root.GUEST_MODE) return true;
        try { return /(?:^|[?&])guest=1(?:&|$)/.test(root.location?.search || ''); } catch (_) { return false; }
    }

    function isCollabMode() {
        return !isGuestMode() && Boolean(root.COLLAB_MODE);
    }

    function getFirestoreDb() {
        if (_customDb) return _customDb;
        if (!root.firebase?.firestore) return null;
        const db = root.firebase.firestore(), host = root.location?.hostname || '';
        const emulatorHost = root.FIRESTORE_EMULATOR_HOST ||
            (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) ||
            (host === 'localhost' || host === '127.0.0.1' ? '127.0.0.1:8080' : null);
        if (emulatorHost && !db._emulatorConnected) {
            try { const [h, p] = emulatorHost.split(':'); db.useEmulator(h, parseInt(p || '8080', 10)); db._emulatorConnected = true; } catch (_) {}
        }
        return db;
    }

    function getCurrentUser() {
        if (_customUser) return _customUser;
        if (root.CollabAuth?.getCurrentUser) {
            const u = root.CollabAuth.getCurrentUser();
            if (u) return u;
        }
        return root.firebase?.auth ? root.firebase.auth().currentUser || null : null;
    }

    function toFirestoreDoc(doc, meta = {}) {
        return {
            id: doc.id || '', title: doc.title || '', category: doc.category || 'general', subfolder: doc.subfolder || '', status: doc.status || 'active',
            content: typeof doc.content === 'string' ? doc.content : '', tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
            username: doc.username || '', password: doc.password || '', rotatedAt: typeof doc.rotatedAt === 'number' ? doc.rotatedAt : null,
            bugData: doc.bugData ?? null, tcData: doc.tcData ?? null, apiData: doc.apiData ?? null, apiTcData: doc.apiTcData ?? null,
            runData: doc.runData ?? null, envData: doc.envData ?? null, releaseData: doc.releaseData ?? null, tcPlanData: doc.tcPlanData ?? null,
            kanbanStatus: doc.kanbanStatus || '', bugStatus: doc.bugStatus || '', bugStatusEvents: Array.isArray(doc.bugStatusEvents) ? [...doc.bugStatusEvents] : [],
            bugNumber: typeof doc.bugNumber === 'number' ? doc.bugNumber : null, favorite: Boolean(doc.favorite),
            createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : (typeof doc.createdAt === 'number' ? doc.createdAt : Date.now()),
            updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : (typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now()),
            version: typeof meta.version === 'number' ? meta.version : (typeof doc.version === 'number' ? doc.version : 1),
            createdBy: meta.createdBy || doc.createdBy || '', updatedBy: meta.updatedBy || doc.updatedBy || '',
            focusWorkflow: doc.focusWorkflow ?? null, focusWorkflowUpdatedAt: typeof doc.focusWorkflowUpdatedAt === 'number' ? doc.focusWorkflowUpdatedAt : null
        };
    }

    function fromFirestoreDoc(data, docId) {
        if (!data) return null;
        return {
            id: data.id || docId, title: data.title || '', category: data.category || 'general', subfolder: data.subfolder || '', status: data.status || 'active',
            content: data.content || '', tags: Array.isArray(data.tags) ? data.tags : [],
            username: data.username || '', password: data.password || '', rotatedAt: data.rotatedAt || null,
            bugData: data.bugData || null, tcData: data.tcData || null, apiData: data.apiData || null, apiTcData: data.apiTcData || null,
            runData: data.runData || null, envData: data.envData || null, releaseData: data.releaseData || null, tcPlanData: data.tcPlanData || null,
            kanbanStatus: data.kanbanStatus || '', bugStatus: data.bugStatus || '', bugStatusEvents: Array.isArray(data.bugStatusEvents) ? data.bugStatusEvents : [],
            bugNumber: typeof data.bugNumber === 'number' ? data.bugNumber : null, favorite: Boolean(data.favorite),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
            version: typeof data.version === 'number' ? data.version : 1,
            createdBy: data.createdBy || '', updatedBy: data.updatedBy || '',
            focusWorkflow: data.focusWorkflow || null, focusWorkflowUpdatedAt: typeof data.focusWorkflowUpdatedAt === 'number' ? data.focusWorkflowUpdatedAt : null
        };
    }

    function notifyConflict(msg = 'Someone else saved this document. Reload to see their version.') {
        _lastConflict = { message: msg, timestamp: Date.now() };
        if (typeof root.toast === 'function') root.toast(msg, 'error');
        else if (typeof console !== 'undefined' && console.warn) console.warn('[CollabStore]', msg);
    }

    async function enableOfflinePersistence(db) {
        if (!db || typeof db.enablePersistence !== 'function') return;
        if (_persistencePromise) return _persistencePromise;
        try {
            _persistencePromise = db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                if (err?.code !== 'failed-precondition' && err?.code !== 'unimplemented') {
                    console.warn('[CollabStore] enablePersistence warning:', err);
                }
            });
            return _persistencePromise;
        } catch (_) {}
    }

    function getDocuments() {
        if (typeof documents !== 'undefined' && Array.isArray(documents)) return documents;
        if (Array.isArray(root.documents)) return root.documents;
        return [];
    }

    function getState() {
        if (typeof state !== 'undefined' && state) return state;
        if (root.state) return root.state;
        return null;
    }

    function isEditorDirty() {
        const s = getState();
        if (!s || s.view !== 'editor') return false;
        if (typeof s.isDirty === 'boolean') return s.isDirty;
        if (typeof s._isDirty === 'boolean') return s._isDirty;
        const captureFn = (typeof _captureEditorFormState === 'function' ? _captureEditorFormState : null) ||
                          (typeof root._captureEditorFormState === 'function' ? root._captureEditorFormState : null);
        if (captureFn && s._editorSnapshot !== undefined) {
            try { return captureFn() !== s._editorSnapshot; } catch (_) {}
        }
        return false;
    }

    function showEditorConflictBanner(docId) {
        if (typeof document === 'undefined') return;
        let banner = document.getElementById('collab-editor-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'collab-editor-banner';
            banner.className = 'collab-editor-banner rounded-lg px-4 py-3 mb-4 flex items-center justify-between gap-3 text-sm';
            banner.style.cssText = 'background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);color:#f59e0b;';
            banner.setAttribute('role', 'alert');
            (document.querySelector('#content .fade-up') || document.getElementById('content'))?.prepend(banner);
        }
        banner.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-triangle-exclamation"></i><span>Updated by someone else</span></div><button class="btn-s text-xs h-7 px-3" data-onclick="reloadCollabDoc('${docId}')">Reload</button>`;
        if (typeof root.enhanceInteractionSemantics === 'function') root.enhanceInteractionSemantics(banner, false);
    }

    root.reloadCollabDoc = function(docId) {
        document.getElementById('collab-editor-banner')?.remove();
        if (typeof root.editDoc === 'function') return root.editDoc(docId);
        const doc = getDocuments().find(d => d.id === docId), s = getState();
        if (doc && s) {
            s.editingDoc = { ...doc };
            s.editorTags = Array.isArray(doc.tags) ? [...doc.tags] : [];
            s.editorMode = 'edit';
            s.isDirty = false;
            delete s._isDirty;
            if (typeof root.render === 'function') root.render();
            const captureFn = (typeof _captureEditorFormState === 'function' ? _captureEditorFormState : null) ||
                              (typeof root._captureEditorFormState === 'function' ? root._captureEditorFormState : null);
            if (captureFn) try { s._editorSnapshot = captureFn(); } catch (_) {}
        }
    };

    function applyRemoteDoc(remoteDoc, changeType = 'modified') {
        if (!remoteDoc || !remoteDoc.id) return;
        const docs = getDocuments(), s = getState(), docId = remoteDoc.id;

        if (changeType === 'removed') {
            const idx = docs.findIndex(d => d.id === docId);
            if (idx !== -1) docs.splice(idx, 1);
            _knownDocs.delete(docId);

            if (s?.view === 'editor' && s.editingDoc?.id === docId) {
                if (isEditorDirty()) showEditorConflictBanner(docId);
                else if (typeof root.render === 'function') root.render();
            } else if (s?.view === 'viewer' && s.editingDoc?.id === docId) {
                if (typeof root.render === 'function') root.render();
            } else if (s?.view !== 'editor') {
                if (typeof root.render === 'function') root.render();
            }
            return;
        }

        const idx = docs.findIndex(d => d.id === docId);
        if (idx !== -1) docs[idx] = remoteDoc;
        else docs.unshift(remoteDoc);
        if (typeof root.normalizeDocTags === 'function') root.normalizeDocTags(docs);
        _knownDocs.set(docId, { ...remoteDoc });

        if (s?.view === 'editor' && s.editingDoc?.id === docId) {
            if (isEditorDirty()) {
                showEditorConflictBanner(docId);
            } else {
                s.editingDoc = { ...remoteDoc };
                s.editorTags = Array.isArray(remoteDoc.tags) ? [...remoteDoc.tags] : [];
                if (typeof root.render === 'function') root.render();
                const captureFn = (typeof _captureEditorFormState === 'function' ? _captureEditorFormState : null) ||
                                  (typeof root._captureEditorFormState === 'function' ? root._captureEditorFormState : null);
                if (captureFn && s._editorSnapshot !== undefined) {
                    try { s._editorSnapshot = captureFn(); } catch (_) {}
                }
            }
        } else if (s?.view === 'viewer' && s.editingDoc?.id === docId) {
            s.editingDoc = { ...remoteDoc };
            if (typeof root.render === 'function') root.render();
        } else if (s?.view !== 'editor') {
            if (typeof root.render === 'function') root.render();
        }
    }

    function startListening() {
        if (isGuestMode() || !isCollabMode() || _unsubscribeSnapshot) return;
        const db = getFirestoreDb();
        if (!db) return;
        const col = db.collection('documents');
        if (typeof col?.onSnapshot !== 'function') return;

        try {
            _unsubscribeSnapshot = col.onSnapshot(snapshot => {
                if (!snapshot) return;
                const changes = typeof snapshot.docChanges === 'function' ? snapshot.docChanges() : [];
                if (changes.length > 0) {
                    for (const change of changes) {
                        if (change.doc?.metadata?.hasPendingWrites) continue;
                        const docId = change.doc?.id;
                        if (!docId) continue;
                        if (change.type === 'removed') { applyRemoteDoc({ id: docId }, 'removed'); continue; }
                        const rawData = typeof change.doc.data === 'function' ? change.doc.data() : change.doc;
                        const remoteDoc = fromFirestoreDoc(rawData, docId);
                        if (remoteDoc) {
                            const known = _knownDocs.get(docId);
                            if (known && known.version === remoteDoc.version && known.updatedAt === remoteDoc.updatedAt) continue;
                            applyRemoteDoc(remoteDoc, change.type);
                        }
                    }
                } else if (typeof snapshot.forEach === 'function') {
                    snapshot.forEach(docSnap => {
                        if (docSnap.metadata?.hasPendingWrites) return;
                        const docId = docSnap.id, remoteDoc = fromFirestoreDoc(typeof docSnap.data === 'function' ? docSnap.data() : docSnap, docId);
                        if (remoteDoc) {
                            const known = _knownDocs.get(docId);
                            if (known && known.version === remoteDoc.version && known.updatedAt === remoteDoc.updatedAt) return;
                            applyRemoteDoc(remoteDoc, 'modified');
                        }
                    });
                }
            }, err => console.error('[CollabStore] onSnapshot error:', err));
        } catch (err) { console.error('[CollabStore] Failed to attach onSnapshot:', err); }
    }

    function stopListening() {
        if (_unsubscribeSnapshot) {
            try { _unsubscribeSnapshot(); } catch (_) {}
            _unsubscribeSnapshot = null;
        }
    }

    async function loadDocuments() {
        if (isGuestMode() || !isCollabMode()) return [];
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');
        await enableOfflinePersistence(db);

        const snapshot = await db.collection('documents').get();
        const loaded = [];
        _knownDocs.clear();

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const doc = fromFirestoreDoc(data, docSnap.id);
            if (doc) {
                loaded.push(doc);
                _knownDocs.set(doc.id, { ...doc });
            }
        });

        startListening();
        return loaded;
    }

    async function persist(currentDocuments) {
        if (isGuestMode() || !isCollabMode() || !Array.isArray(currentDocuments)) return;
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');
        await enableOfflinePersistence(db);
        const user = getCurrentUser();
        if (!user?.uid) throw new Error('Cannot persist in collab mode: unauthenticated');

        const uid = user.uid;

        // 1. New documents (CREATE)
        for (const doc of currentDocuments) {
            if (!doc?.id || _knownDocs.has(doc.id)) continue;
            const now = Date.now(), createdAt = typeof doc.createdAt === 'number' ? doc.createdAt : now;
            const updatedAt = typeof doc.updatedAt === 'number' ? doc.updatedAt : now;
            const data = toFirestoreDoc(doc, { version: 1, createdBy: uid, updatedBy: uid, createdAt, updatedAt });

            try {
                await db.collection('documents').doc(doc.id).set(data);
                doc.version = 1; doc.createdBy = uid; doc.updatedBy = uid; doc.createdAt = createdAt; doc.updatedAt = updatedAt;
                _knownDocs.set(doc.id, { ...doc });
            } catch (err) {
                if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to save offline', 'error');
                throw err;
            }
        }

        // 2. Modified documents (UPDATE)
        for (const doc of currentDocuments) {
            if (!doc?.id || !_knownDocs.has(doc.id)) continue;
            const known = _knownDocs.get(doc.id);
            const isUpdated = typeof doc.updatedAt === 'number' && doc.updatedAt > (known.updatedAt || 0);
            const isFocusUpdated = typeof doc.focusWorkflowUpdatedAt === 'number' && doc.focusWorkflowUpdatedAt > (known.focusWorkflowUpdatedAt || 0);
            if (!isUpdated && !isFocusUpdated) continue;

            const nextVersion = (typeof known.version === 'number' ? known.version : 1) + 1;
            const createdBy = known.createdBy || doc.createdBy || uid;
            const createdAt = typeof known.createdAt === 'number' ? known.createdAt : (doc.createdAt || Date.now());
            const data = toFirestoreDoc(doc, { version: nextVersion, createdBy, updatedBy: uid, createdAt, updatedAt: doc.updatedAt });

            try {
                await db.collection('documents').doc(doc.id).set(data);
                doc.version = nextVersion; doc.createdBy = createdBy; doc.updatedBy = uid;
                _knownDocs.set(doc.id, { ...doc });
            } catch (err) {
                const isPermDenied = err?.code === 'permission-denied' || err?.code === 7 ||
                    String(err?.message || '').includes('PERMISSION_DENIED') || String(err?.message || '').includes('permission-denied');

                if (isPermDenied) {
                    let isVersionMismatch = true;
                    try {
                        const remoteSnap = await db.collection('documents').doc(doc.id).get();
                        if (remoteSnap.exists) isVersionMismatch = (remoteSnap.data().version !== known.version);
                    } catch (_) {}

                    if (isVersionMismatch) {
                        notifyConflict('Someone else saved this document. Reload to see their version.');
                        continue;
                    }
                }
                if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to save offline', 'error');
                throw err;
            }
        }

        // 3. Disappeared documents (DELETE)
        const currentIds = new Set(currentDocuments.filter(d => d?.id).map(d => d.id));
        for (const [id] of Array.from(_knownDocs.entries())) {
            if (!currentIds.has(id)) {
                try {
                    await db.collection('documents').doc(id).delete();
                    _knownDocs.delete(id);
                } catch (err) {
                    if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to delete offline', 'error');
                    throw err;
                }
            }
        }
    }

    root.applyRemoteDoc = applyRemoteDoc;

    root.CollabStore = {
        loadDocuments,
        persist,
        toFirestoreDoc,
        fromFirestoreDoc,
        getKnownDocs: () => _knownDocs,
        clearKnownDocs: () => _knownDocs.clear(),
        getLastConflict: () => _lastConflict,
        clearLastConflict: () => { _lastConflict = null; },
        setDb: (db) => { _customDb = db; },
        setUser: (user) => { _customUser = user; },
        startListening,
        stopListening,
        applyRemoteDoc,
        isEditorDirty,
        showEditorConflictBanner,
        enableOfflinePersistence,
        isListening: () => Boolean(_unsubscribeSnapshot)
    };
})(typeof window !== 'undefined' ? window : globalThis);
