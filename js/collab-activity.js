// DocVault team collaboration activity module
// Synchronizes remote activity audit trail, decorates timeline entries with actor accounts, and controls owner activity clear.
(function(root) {
    let _remoteActivities = [];
    const _membersMap = new Map();
    let _unsubActivity = null;
    let _unsubMembers = null;
    let _customDb = null;

    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function isGuestMode() {
        return Boolean(root.GUEST_MODE || /(?:^|[?&])guest=1(?:&|$)/.test(root.location?.search || ''));
    }

    function isCollabMode() {
        return !isGuestMode() && Boolean(root.COLLAB_MODE);
    }

    function getFirestoreDb() {
        if (_customDb) return _customDb;
        if (!root.firebase?.firestore) return null;
        const db = root.firebase.firestore();
        const host = root.location?.hostname || '';
        const emulatorHost = root.FIRESTORE_EMULATOR_HOST || (typeof process !== 'undefined' && process.env?.FIRESTORE_EMULATOR_HOST) ||
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

    function formatAccountText(entry) {
        if (!entry) return 'by Unknown account';
        let email = '';
        let name = '';
        if (entry.actorUid && _membersMap.has(entry.actorUid)) {
            const m = _membersMap.get(entry.actorUid);
            email = m?.email || '';
            name = m?.displayName || '';
        }
        if (!email && entry.actorEmail) email = entry.actorEmail;
        if (!name && entry.actorName) name = entry.actorName;

        if (name && email && name !== email) {
            return `by ${esc(name)} (${esc(email)})`;
        }
        if (email) {
            return `by ${esc(email)}`;
        }
        if (name) {
            return `by ${esc(name)}`;
        }
        return 'by Unknown account';
    }

    function startListening() {
        if (isGuestMode() || !isCollabMode() || _unsubActivity) return;
        const db = getFirestoreDb();
        if (!db) return;

        // 1. Members listener for resolving actorUid to latest displayName and email
        if (!_unsubMembers && typeof db.collection('members')?.onSnapshot === 'function') {
            try {
                _unsubMembers = db.collection('members').onSnapshot(snapshot => {
                    if (!snapshot) return;
                    _membersMap.clear();
                    snapshot.forEach(docSnap => {
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                        if (docSnap.id) _membersMap.set(docSnap.id, data);
                    });
                    if (root.state?.view === 'activity' && typeof root.renderContent === 'function') {
                        root.renderContent();
                    }
                }, err => console.warn('[CollabActivity] members onSnapshot warning:', err));
            } catch (err) {
                console.warn('[CollabActivity] Failed to attach members onSnapshot:', err);
            }
        }

        // 2. Activity collection listener (replaces entire list, client-side sort, deduplicated by id)
        if (typeof db.collection('activity')?.onSnapshot === 'function') {
            try {
                _unsubActivity = db.collection('activity').onSnapshot(snapshot => {
                    if (!snapshot) return;
                    const byId = new Map();
                    snapshot.forEach(docSnap => {
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                        const id = docSnap.id || data?.id;
                        if (!id) return;
                        byId.set(id, { ...data, id });
                    });
                    const max = root.ActivityLog?.MAX || 200;
                    _remoteActivities = Array.from(byId.values())
                        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
                        .slice(0, max);
                    if (root.state?.view === 'activity' && typeof root.renderContent === 'function') {
                        root.renderContent();
                    }
                }, err => console.warn('[CollabActivity] activity onSnapshot warning:', err));
            } catch (err) {
                console.warn('[CollabActivity] Failed to attach activity onSnapshot:', err);
            }
        }
    }

    function stopListening() {
        if (_unsubActivity) {
            try { _unsubActivity(); } catch (_) {}
            _unsubActivity = null;
        }
        if (_unsubMembers) {
            try { _unsubMembers(); } catch (_) {}
            _unsubMembers = null;
        }
        _remoteActivities = [];
        _membersMap.clear();
    }

    function wrapRenderers() {
        // Wrap ActivityLog.getAll
        if (root.ActivityLog && !root.ActivityLog.getAll?._collabWrapped) {
            const origGetAll = root.ActivityLog.getAll;
            root.ActivityLog.getAll = function() {
                if (isCollabMode()) {
                    return [..._remoteActivities];
                }
                return origGetAll ? origGetAll.call(this) : [];
            };
            root.ActivityLog.getAll._collabWrapped = true;
        }

        // Wrap _renderActivityRow
        if (root._renderActivityRow && !root._renderActivityRow._collabWrapped) {
            const origRow = root._renderActivityRow;
            root._renderActivityRow = function(entry) {
                let html = origRow(entry);
                if (!isCollabMode() || !entry) return html;
                const accountText = formatAccountText(entry);
                return html.replace(/(<\/span>)(\s*<\/span>\s*<time\b)/, (m, c1, c2) => ' <span class="act-actor">' + accountText + '</span>' + c1 + c2);
            };
            root._renderActivityRow._collabWrapped = true;
        }

        // Wrap renderActivityLog
        if (root.renderActivityLog && !root.renderActivityLog._collabWrapped) {
            const origLog = root.renderActivityLog;
            root.renderActivityLog = function() {
                let html = origLog();
                if (!isCollabMode()) return html;
                const max = root.ActivityLog?.MAX || 200;
                html = html.replace(
                    /A personal timeline of changes across this vault — last \d+ actions, synced across your devices\./,
                    `Changes in this team vault — last ${max} actions, with the account that made each one.`
                );
                const member = root.CollabBootstrap?.getCurrentMember?.();
                const isOwner = member?.role === 'owner';
                if (!isOwner) {
                    html = html.replace(/<button[^>]*data-onclick="confirmClearActivityLog\(\)"[^>]*>[\s\S]*?<\/button>/, '');
                }
                return html;
            };
            root.renderActivityLog._collabWrapped = true;
        }

        // Wrap clearActivityLog
        if (root.clearActivityLog && !root.clearActivityLog._collabWrapped) {
            const origClear = root.clearActivityLog;
            root.clearActivityLog = async function() {
                if (!isCollabMode()) {
                    return origClear ? origClear() : undefined;
                }
                const member = root.CollabBootstrap?.getCurrentMember?.();
                if (member?.role !== 'owner') {
                    if (typeof root.closeModal === 'function') root.closeModal();
                    return;
                }
                if (typeof root.closeModal === 'function') root.closeModal();
                try {
                    const db = getFirestoreDb();
                    if (db) {
                        const snap = await db.collection('activity').get();
                        const batch = typeof db.batch === 'function' ? db.batch() : null;
                        const deletes = [];
                        snap.forEach(docSnap => {
                            if (batch) batch.delete(db.collection('activity').doc(docSnap.id));
                            else deletes.push(db.collection('activity').doc(docSnap.id).delete());
                        });
                        if (batch) await batch.commit();
                        else await Promise.all(deletes);
                    }
                    _remoteActivities = [];
                    if (root.state) root.state.activityFilter = 'all';
                    if (typeof root.renderContent === 'function') root.renderContent();
                    if (typeof root.toast === 'function') root.toast('Activity log cleared.', 'info');
                } catch (err) {
                    console.error('[CollabActivity] clearActivityLog error:', err);
                    if (typeof root.toast === 'function') root.toast('Failed to clear activity log.', 'error');
                }
            };
            root.clearActivityLog._collabWrapped = true;
        }
    }

    wrapRenderers();

    root.CollabActivity = {
        startListening: () => { wrapRenderers(); startListening(); },
        stopListening,
        getRemoteActivities: () => [..._remoteActivities],
        setRemoteActivities: (list) => { _remoteActivities = [...list]; },
        getMembersMap: () => _membersMap,
        setDb: (db) => { _customDb = db; },
        formatAccountText,
        wrapRenderers
    };
})(typeof window !== 'undefined' ? window : globalThis);
