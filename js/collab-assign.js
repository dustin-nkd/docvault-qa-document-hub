// DocVault team collaboration member assignments and notifications module
(function(root) {
    let _membersMap = new Map(), _notifications = [], _unsubMembers = null, _unsubNotifications = null, _bellPanelOpen = false, _stylesInjected = false;

    function isGuestMode() { return Boolean(root.GUEST_MODE || /(?:^|[?&])guest=1(?:&|$)/.test(root.location?.search || '')); }
    function isCollabMode() { return !isGuestMode() && Boolean(root.COLLAB_MODE); }
    function getFirestoreDb() { return root.CollabStore?.getFirestoreDb ? root.CollabStore.getFirestoreDb() : (root.firebase?.firestore ? root.firebase.firestore() : null); }
    function getCurrentMember() { return root.CollabBootstrap?.getCurrentMember?.() || null; }
    function getCurrentUser() { return root.firebase?.auth?.().currentUser || null; }
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function getMemberLabel(m) {
        if (!m) return 'Unknown account';
        const name = String(m.displayName || '').trim(), email = String(m.email || '').trim();
        if (name && email && name !== email) return `${name} (${email})`;
        if (email) return email;
        if (name) return name;
        return 'Unknown account';
    }

    function getSortedMembers() {
        return Array.from(_membersMap.values())
            .filter(m => m && (m.role === 'owner' || m.role === 'editor' || m.role === 'viewer'))
            .sort((a, b) => {
                const ea = String(a.email || ''), eb = String(b.email || '');
                if (ea < eb) return -1; if (ea > eb) return 1;
                const ua = String(a.uid || ''), ub = String(b.uid || '');
                if (ua < ub) return -1; if (ua > ub) return 1;
                return 0;
            });
    }

    function buildAssigneeOptions(currentVal, currentUid, isBatch) {
        currentVal = String(currentVal || '').trim();
        currentUid = String(currentUid || '').trim();
        const members = getSortedMembers();
        const options = [isBatch ? { value: '', label: '— No change —' } : { value: '', label: 'Unassigned' }];
        let selectedValue = '';
        if (currentUid && _membersMap.has(currentUid)) selectedValue = currentUid;
        else if (currentVal && _membersMap.has(currentVal)) selectedValue = currentVal;
        else if (currentVal) {
            const match = members.find(m => getMemberLabel(m) === currentVal);
            if (match) selectedValue = match.uid;
        }
        if (!isBatch && currentVal && !selectedValue) {
            options.push({ value: currentVal, label: currentVal });
            selectedValue = currentVal;
        }
        members.forEach(m => { options.push({ value: m.uid, label: getMemberLabel(m) }); });
        if (isBatch) selectedValue = '';
        return { options, selectedValue };
    }

    function resolveMember(val) {
        val = String(val || '').trim();
        if (!val) return { label: '', uid: '', assignee: '', assigneeUid: '' };
        if (_membersMap.has(val)) {
            const m = _membersMap.get(val), label = getMemberLabel(m);
            return { label, uid: m.uid, assignee: label, assigneeUid: m.uid };
        }
        return { label: val, uid: '', assignee: val, assigneeUid: '' };
    }

    function renderFocusOwnerField(workflow) {
        if (!isCollabMode() || !root.renderSelect) return null;
        const currentVal = workflow?.owner || '', currentUid = workflow?.ownerUid || '';
        const { options, selectedValue } = buildAssigneeOptions(currentVal, currentUid, false);
        return root.renderSelect('focus-owner', options, selectedValue, 'w-full');
    }

    function renderBatchAssigneeField() {
        if (!isCollabMode() || !root.renderSelect) return null;
        const { options, selectedValue } = buildAssigneeOptions('', '', true);
        return root.renderSelect('batch-bug-assignee', options, selectedValue, 'w-full');
    }

    function replaceBugAssigneeInput() {
        if (!isCollabMode() || typeof document === 'undefined') return;
        const el = document.getElementById('ed-bug-assignee');
        if (!el || el.type === 'hidden') return;
        const bugData = root.state?.editingDoc?.bugData || root.state?._newBugData || {};
        const { options, selectedValue } = buildAssigneeOptions(bugData.assignee || el.value || '', bugData.assigneeUid || '', false);
        const html = root.renderSelect ? root.renderSelect('ed-bug-assignee', options, selectedValue, 'w-full') : '';
        if (!html) return;
        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        if (temp.firstElementChild && el.parentNode) el.parentNode.replaceChild(temp.firstElementChild, el);
    }

    function ensureAssignStyles() {
        if (_stylesInjected || typeof document === 'undefined') return;
        const head = document.head || document.body || document.documentElement;
        if (!head) return;
        const style = document.createElement('style');
        style.id = 'collab-assign-styles';
        style.textContent = `
#collab-notif-btn{position:relative;}
.collab-notif-badge{position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;line-height:1;padding:2px 4px;border-radius:9999px;border:2px solid var(--bg);pointer-events:none;}
#collab-notif-panel{position:fixed;z-index:1000;width:340px;max-width:calc(100vw - 24px);max-height:400px;overflow-y:auto;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.4);}
.collab-notif-item{padding:10px 12px;border-bottom:1px solid var(--brd);cursor:pointer;transition:background .15s;}
.collab-notif-item:last-child{border-bottom:none;}
.collab-notif-item:hover{background:var(--bg-hover,rgba(255,255,255,0.06));}
.collab-notif-item.is-unread{background:rgba(59,130,246,0.08);}
[data-ui-style="bauhaus"] #collab-notif-panel{border:2px solid #121212 !important;border-radius:0 !important;box-shadow:3px 3px 0 0 #121212 !important;}
[data-ui-style="bauhaus"] .collab-notif-badge{border:1.5px solid #121212 !important;border-radius:0 !important;}
`;
        head.appendChild(style);
        _stylesInjected = true;
    }

    function attachNotificationBell() {
        if (!isCollabMode() || root.state?.sharedView || typeof document === 'undefined') return;
        ensureAssignStyles();
        const container = document.querySelector('#app-header .flex.items-center.gap-2');
        if (!container) return;
        let btn = document.getElementById('collab-notif-btn');
        if (!btn || btn.parentNode !== container || container.lastElementChild !== btn) {
            if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
            btn = document.createElement('button');
            btn.id = 'collab-notif-btn';
            btn.className = 'btn-s flex items-center justify-center h-[38px] relative';
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Notifications');
            btn.setAttribute('title', 'Notifications');
            btn.setAttribute('data-onclick', 'collabToggleNotifications()');
            btn.innerHTML = '<i class="fa-solid fa-bell"></i>';
            container.appendChild(btn);
        }
        updateNotificationBell();
    }

    function updateNotificationBell() {
        if (typeof document === 'undefined') return;
        const btn = document.getElementById('collab-notif-btn');
        if (!btn) return;
        const unreadCount = _notifications.filter(n => n.readAt == null).length;
        let badge = btn.querySelector('.collab-notif-badge');
        if (unreadCount > 0) {
            if (!badge) { badge = document.createElement('span'); badge.className = 'collab-notif-badge'; btn.appendChild(badge); }
            badge.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
        } else if (badge) { badge.remove(); }
        if (_bellPanelOpen) renderNotificationPanel();
    }

    function renderNotificationPanel() {
        if (typeof document === 'undefined') return;
        const btn = document.getElementById('collab-notif-btn');
        if (!btn) return;
        let panel = document.getElementById('collab-notif-panel');
        if (!panel) { panel = document.createElement('div'); panel.id = 'collab-notif-panel'; document.body.appendChild(panel); }
        const rect = btn.getBoundingClientRect();
        panel.style.top = `${Math.round(rect.bottom + 6)}px`;
        panel.style.right = `${Math.max(12, Math.round(document.documentElement.clientWidth - rect.right))}px`;
        const displayItems = _notifications.slice(0, 50);
        if (!displayItems.length) {
            panel.innerHTML = '<div class="p-4 text-xs text-center" style="color:var(--tx-d);">No assignments yet.</div>';
            return;
        }
        panel.innerHTML = displayItems.map(item => {
            const unreadClass = item.readAt == null ? ' is-unread' : '';
            const actorName = String(item.actorName || '').trim(), actorEmail = String(item.actorEmail || '').trim();
            const actorLabel = (actorName && actorEmail && !actorName.includes(actorEmail)) ? `${actorName} (${actorEmail})` : (actorName || actorEmail || 'Unknown account');
            const docTitle = String(item.docTitle || 'Untitled');
            return `<div class="collab-notif-item${unreadClass}" data-onclick="collabOpenNotification('${esc(item.id)}','${esc(item.docId)}')"><div class="text-xs" style="color:var(--tx);font-weight:${item.readAt == null ? '600' : '400'};">${esc(actorLabel)} assigned you ${esc(docTitle)}</div></div>`;
        }).join('');
    }

    function closeNotificationPanel() {
        _bellPanelOpen = false;
        const panel = typeof document !== 'undefined' ? document.getElementById('collab-notif-panel') : null;
        if (panel) panel.remove();
    }

    function toggleNotifications() {
        _bellPanelOpen = !_bellPanelOpen;
        if (_bellPanelOpen) {
            renderNotificationPanel();
            setTimeout(() => {
                const closeHandler = (e) => {
                    const btn = document.getElementById('collab-notif-btn'), panel = document.getElementById('collab-notif-panel');
                    if (btn && btn.contains(e.target)) return;
                    if (panel && panel.contains(e.target)) return;
                    closeNotificationPanel();
                    document.removeEventListener('click', closeHandler);
                };
                document.addEventListener('click', closeHandler);
            }, 10);
        } else { closeNotificationPanel(); }
    }

    async function openNotification(notifId, docId) {
        closeNotificationPanel();
        const notif = _notifications.find(n => n.id === notifId);
        if (notif && notif.readAt == null) {
            notif.readAt = Date.now();
            updateNotificationBell();
            const db = getFirestoreDb();
            if (db) {
                try { await db.collection('notifications').doc(notifId).update({ readAt: notif.readAt }); } catch (err) { console.warn('[CollabAssign] update readAt:', err); }
            }
        }
        if (docId && typeof root.viewDoc === 'function') root.viewDoc(docId);
    }

    async function notifyAssignment(opts) {
        if (!isCollabMode() || !opts) return;
        const { doc, kind, signalKey = '', oldUid = '', newUid = '' } = opts;
        if (!doc || !newUid || newUid === oldUid) return;
        const authUser = getCurrentUser(), currentUid = authUser?.uid || getCurrentMember()?.uid;
        if (!currentUid || newUid === currentUid) return;
        if (!_membersMap.has(newUid)) return;
        const db = getFirestoreDb(); if (!db) return;
        const member = getCurrentMember();
        const actorName = member?.displayName || authUser?.displayName || member?.email || authUser?.email || 'Team Member';
        const actorEmail = member?.email || authUser?.email || '';
        const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const payload = {
            recipientUid: newUid, actorUid: currentUid, actorName, actorEmail,
            docId: doc.id, docTitle: doc.title || 'Untitled', kind,
            signalKey: signalKey || '', createdAt: Date.now(), readAt: null
        };
        try { await db.collection('notifications').doc(notifId).set(payload); } catch (err) { console.warn('[CollabAssign] create notification:', err); }
    }

    async function notifyBatchBugAssign(items) {
        if (!isCollabMode() || !Array.isArray(items)) return;
        for (const item of items) {
            await notifyAssignment({ doc: item.doc, kind: 'bug', signalKey: '', oldUid: item.oldUid || '', newUid: item.newUid || '' });
        }
    }

    function startListening() {
        if (isGuestMode() || !isCollabMode()) return;
        ensureAssignStyles();
        const db = getFirestoreDb(); if (!db) return;
        if (!_unsubMembers && typeof db.collection('members')?.onSnapshot === 'function') {
            try {
                _unsubMembers = db.collection('members').onSnapshot(snap => {
                    if (!snap) return;
                    _membersMap.clear();
                    snap.forEach(docSnap => {
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                        const uid = docSnap.id || data?.uid;
                        if (uid) _membersMap.set(uid, { ...data, uid });
                    });
                }, err => console.warn('[CollabAssign] members onSnapshot:', err));
            } catch (err) { console.warn('[CollabAssign] startListening members:', err); }
        }
        const member = getCurrentMember(), uid = member?.uid || getCurrentUser()?.uid;
        if (uid && !_unsubNotifications && typeof db.collection('notifications')?.where === 'function') {
            try {
                _unsubNotifications = db.collection('notifications').where('recipientUid', '==', uid).onSnapshot(snap => {
                    if (!snap) return;
                    const list = [];
                    snap.forEach(docSnap => {
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                        const notifId = docSnap.id || data?.id;
                        if (notifId) list.push({ ...data, id: notifId });
                    });
                    _notifications = list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                    updateNotificationBell();
                }, err => console.warn('[CollabAssign] notifications onSnapshot:', err));
            } catch (err) { console.warn('[CollabAssign] startListening notifs:', err); }
        }
    }

    function stopListening() {
        if (_unsubMembers) { try { _unsubMembers(); } catch (_) {} _unsubMembers = null; }
        if (_unsubNotifications) { try { _unsubNotifications(); } catch (_) {} _unsubNotifications = null; }
        _membersMap.clear();
        _notifications = [];
        closeNotificationPanel();
    }

    if (root.renderEditor && !root.renderEditor._collabAssignWrapped) {
        const origRenderEditor = root.renderEditor;
        root.renderEditor = function(...args) {
            let html = origRenderEditor.apply(this, args);
            if (isCollabMode() && root.renderSelect) {
                const bugData = root.state?.editingDoc?.bugData || root.state?._newBugData || {};
                const { options, selectedValue } = buildAssigneeOptions(bugData.assignee || '', bugData.assigneeUid || '', false);
                const selectHtml = root.renderSelect('ed-bug-assignee', options, selectedValue, 'w-full');
                html = html.replace(/<input\s+id=["']ed-bug-assignee["'][^>]*>/i, selectHtml);
            }
            return html;
        };
        root.renderEditor._collabAssignWrapped = true;
    }

    if (root.renderContent && !root.renderContent._collabAssignWrapped) {
        const origRenderContent = root.renderContent;
        root.renderContent = function(...args) {
            origRenderContent.apply(this, args);
            replaceBugAssigneeInput();
        };
        root.renderContent._collabAssignWrapped = true;
    }

    if (root.updateHeader && !root.updateHeader._collabBellWrapped) {
        const origUpdateHeader = root.updateHeader;
        root.updateHeader = function(...args) {
            origUpdateHeader.apply(this, args);
            attachNotificationBell();
        };
        root.updateHeader._collabBellWrapped = true;
    }

    if (root.render && !root.render._collabBellWrapped) {
        const origRender = root.render;
        root.render = function(...args) {
            origRender.apply(this, args);
            attachNotificationBell();
        };
        root.render._collabBellWrapped = true;
    }

    root.collabToggleNotifications = toggleNotifications;
    root.collabOpenNotification = openNotification;

    root.CollabAssign = {
        getMembers: () => getSortedMembers(),
        getMemberLabel,
        buildAssigneeOptions,
        resolveMember,
        renderFocusOwnerField,
        renderBatchAssigneeField,
        replaceBugAssigneeInput,
        attachNotificationBell,
        updateNotificationBell,
        toggleNotifications,
        openNotification,
        notifyAssignment,
        notifyBatchBugAssign,
        startListening,
        stopListening,
        setMembers: (map) => { _membersMap = map; },
        setNotifications: (list) => { _notifications = list; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
