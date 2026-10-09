// DocVault team collaboration store module
// Handles document loading (getDocs), change detection, versioned persistence, and conflict detection.
(function(root) {
    const _knownDocs = new Map();
    let _lastConflict = null;
    let _customDb = null;
    let _customUser = null;

    function isGuestMode() {
        if (typeof root.GUEST_MODE !== 'undefined' && root.GUEST_MODE) return true;
        try {
            const search = root.location?.search || '';
            return /(?:^|[?&])guest=1(?:&|$)/.test(search);
        } catch (_) {
            return false;
        }
    }

    function isCollabMode() {
        if (isGuestMode()) return false;
        if (typeof root.COLLAB_MODE !== 'undefined') {
            return Boolean(root.COLLAB_MODE);
        }
        return false;
    }

    function getFirestoreDb() {
        if (_customDb) return _customDb;
        if (!root.firebase || !root.firebase.firestore) return null;
        const db = root.firebase.firestore();
        const host = root.location?.hostname || '';
        const emulatorHost = root.FIRESTORE_EMULATOR_HOST ||
            (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) ||
            (host === 'localhost' || host === '127.0.0.1' ? '127.0.0.1:8080' : null);
        if (emulatorHost && !db._emulatorConnected) {
            try {
                const [h, p] = emulatorHost.split(':');
                db.useEmulator(h, parseInt(p || '8080', 10));
                db._emulatorConnected = true;
            } catch (_) {}
        }
        return db;
    }

    function getCurrentUser() {
        if (_customUser) return _customUser;
        if (root.CollabAuth?.getCurrentUser) {
            const u = root.CollabAuth.getCurrentUser();
            if (u) return u;
        }
        if (root.firebase?.auth) {
            return root.firebase.auth().currentUser || null;
        }
        return null;
    }

    function toFirestoreDoc(doc, meta = {}) {
        return {
            id: doc.id || '',
            title: doc.title || '',
            category: doc.category || 'general',
            subfolder: doc.subfolder || '',
            status: doc.status || 'active',
            content: typeof doc.content === 'string' ? doc.content : '',
            tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
            username: doc.username || '',
            password: doc.password || '',
            rotatedAt: typeof doc.rotatedAt === 'number' ? doc.rotatedAt : null,
            bugData: doc.bugData !== undefined && doc.bugData !== null ? doc.bugData : null,
            tcData: doc.tcData !== undefined && doc.tcData !== null ? doc.tcData : null,
            apiData: doc.apiData !== undefined && doc.apiData !== null ? doc.apiData : null,
            apiTcData: doc.apiTcData !== undefined && doc.apiTcData !== null ? doc.apiTcData : null,
            runData: doc.runData !== undefined && doc.runData !== null ? doc.runData : null,
            envData: doc.envData !== undefined && doc.envData !== null ? doc.envData : null,
            releaseData: doc.releaseData !== undefined && doc.releaseData !== null ? doc.releaseData : null,
            tcPlanData: doc.tcPlanData !== undefined && doc.tcPlanData !== null ? doc.tcPlanData : null,
            kanbanStatus: doc.kanbanStatus || '',
            bugStatus: doc.bugStatus || '',
            bugStatusEvents: Array.isArray(doc.bugStatusEvents) ? [...doc.bugStatusEvents] : [],
            bugNumber: typeof doc.bugNumber === 'number' ? doc.bugNumber : null,
            favorite: Boolean(doc.favorite),
            createdAt: typeof meta.createdAt === 'number' ? meta.createdAt : (typeof doc.createdAt === 'number' ? doc.createdAt : Date.now()),
            updatedAt: typeof meta.updatedAt === 'number' ? meta.updatedAt : (typeof doc.updatedAt === 'number' ? doc.updatedAt : Date.now()),
            version: typeof meta.version === 'number' ? meta.version : (typeof doc.version === 'number' ? doc.version : 1),
            createdBy: meta.createdBy || doc.createdBy || '',
            updatedBy: meta.updatedBy || doc.updatedBy || '',
            focusWorkflow: doc.focusWorkflow !== undefined && doc.focusWorkflow !== null ? doc.focusWorkflow : null,
            focusWorkflowUpdatedAt: typeof doc.focusWorkflowUpdatedAt === 'number' ? doc.focusWorkflowUpdatedAt : null
        };
    }

    function fromFirestoreDoc(data, docId) {
        if (!data) return null;
        return {
            id: data.id || docId,
            title: data.title || '',
            category: data.category || 'general',
            subfolder: data.subfolder || '',
            status: data.status || 'active',
            content: data.content || '',
            tags: Array.isArray(data.tags) ? data.tags : [],
            username: data.username || '',
            password: data.password || '',
            rotatedAt: data.rotatedAt || null,
            bugData: data.bugData || null,
            tcData: data.tcData || null,
            apiData: data.apiData || null,
            apiTcData: data.apiTcData || null,
            runData: data.runData || null,
            envData: data.envData || null,
            releaseData: data.releaseData || null,
            tcPlanData: data.tcPlanData || null,
            kanbanStatus: data.kanbanStatus || '',
            bugStatus: data.bugStatus || '',
            bugStatusEvents: Array.isArray(data.bugStatusEvents) ? data.bugStatusEvents : [],
            bugNumber: typeof data.bugNumber === 'number' ? data.bugNumber : null,
            favorite: Boolean(data.favorite),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
            version: typeof data.version === 'number' ? data.version : 1,
            createdBy: data.createdBy || '',
            updatedBy: data.updatedBy || '',
            focusWorkflow: data.focusWorkflow || null,
            focusWorkflowUpdatedAt: typeof data.focusWorkflowUpdatedAt === 'number' ? data.focusWorkflowUpdatedAt : null
        };
    }

    function notifyConflict(msg = 'Someone else saved this document. Reload to see their version.') {
        _lastConflict = { message: msg, timestamp: Date.now() };
        if (typeof root.toast === 'function') {
            root.toast(msg, 'error');
        } else if (typeof console !== 'undefined' && console.warn) {
            console.warn('[CollabStore]', msg);
        }
    }

    async function loadDocuments() {
        if (isGuestMode() || !isCollabMode()) return [];
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

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

        return loaded;
    }

    async function persist(currentDocuments) {
        if (isGuestMode() || !isCollabMode()) return;
        if (!Array.isArray(currentDocuments)) return;
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');
        const user = getCurrentUser();
        if (!user || !user.uid) throw new Error('Cannot persist in collab mode: unauthenticated');

        const uid = user.uid;

        // 1. New documents (CREATE)
        for (const doc of currentDocuments) {
            if (!doc || !doc.id) continue;
            if (!_knownDocs.has(doc.id)) {
                const now = Date.now();
                const createdAt = typeof doc.createdAt === 'number' ? doc.createdAt : now;
                const updatedAt = typeof doc.updatedAt === 'number' ? doc.updatedAt : now;
                const data = toFirestoreDoc(doc, {
                    version: 1,
                    createdBy: uid,
                    updatedBy: uid,
                    createdAt,
                    updatedAt
                });

                await db.collection('documents').doc(doc.id).set(data);
                doc.version = 1;
                doc.createdBy = uid;
                doc.updatedBy = uid;
                doc.createdAt = createdAt;
                doc.updatedAt = updatedAt;
                _knownDocs.set(doc.id, { ...doc });
            }
        }

        // 2. Modified documents (UPDATE)
        for (const doc of currentDocuments) {
            if (!doc || !doc.id) continue;
            if (_knownDocs.has(doc.id)) {
                const known = _knownDocs.get(doc.id);
                const isUpdated = typeof doc.updatedAt === 'number' && doc.updatedAt > (known.updatedAt || 0);
                const isFocusUpdated = typeof doc.focusWorkflowUpdatedAt === 'number' &&
                    doc.focusWorkflowUpdatedAt > (known.focusWorkflowUpdatedAt || 0);

                if (isUpdated || isFocusUpdated) {
                    const nextVersion = (typeof known.version === 'number' ? known.version : 1) + 1;
                    const createdBy = known.createdBy || doc.createdBy || uid;
                    const createdAt = typeof known.createdAt === 'number' ? known.createdAt : (doc.createdAt || Date.now());
                    const data = toFirestoreDoc(doc, {
                        version: nextVersion,
                        createdBy,
                        updatedBy: uid,
                        createdAt,
                        updatedAt: doc.updatedAt
                    });

                    try {
                        await db.collection('documents').doc(doc.id).set(data);
                        doc.version = nextVersion;
                        doc.createdBy = createdBy;
                        doc.updatedBy = uid;
                        _knownDocs.set(doc.id, { ...doc });
                    } catch (err) {
                        const isPermDenied = err?.code === 'permission-denied' ||
                            err?.code === 7 ||
                            String(err?.message || '').includes('PERMISSION_DENIED') ||
                            String(err?.message || '').includes('permission-denied');

                        if (isPermDenied) {
                            let isVersionMismatch = true;
                            try {
                                const remoteSnap = await db.collection('documents').doc(doc.id).get();
                                if (remoteSnap.exists) {
                                    const remoteVer = remoteSnap.data().version;
                                    isVersionMismatch = (remoteVer !== known.version);
                                }
                            } catch (_) {}

                            if (isVersionMismatch) {
                                notifyConflict('Someone else saved this document. Reload to see their version.');
                                continue;
                            }
                        }
                        throw err;
                    }
                }
            }
        }

        // 3. Disappeared documents (DELETE)
        const currentIds = new Set(currentDocuments.filter(d => d && d.id).map(d => d.id));
        for (const [id, known] of Array.from(_knownDocs.entries())) {
            if (!currentIds.has(id)) {
                try {
                    await db.collection('documents').doc(id).delete();
                    _knownDocs.delete(id);
                } catch (err) {
                    console.error('[CollabStore] Document deletion rejected:', id, err);
                }
            }
        }
    }

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
        setUser: (user) => { _customUser = user; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
