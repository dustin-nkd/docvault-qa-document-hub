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
        return (name && email && name !== email) ? `${name} (${email})` : (email || name || 'Unknown account');
    }

    function getSortedMembers() {
        return Array.from(_membersMap.values()).filter(m => m && (m.role === 'owner' || m.role === 'editor' || m.role === 'viewer')).sort((a, b) => {
            const ea = String(a.email || ''), eb = String(b.email || '');
            if (ea < eb) return -1; if (ea > eb) return 1;
            const ua = String(a.uid || ''), ub = String(b.uid || '');
            return ua < ub ? -1 : (ua > ub ? 1 : 0);
        });
    }

    function buildAssigneeOptions(currentVal, currentUid, isBatch) {
        currentVal = String(currentVal || '').trim(); currentUid = String(currentUid || '').trim();
        const members = getSortedMembers(), options = [isBatch ? { value: '', label: '— No change —' } : { value: '', label: 'Unassigned' }];
        let selectedValue = '';
        if (currentUid && _membersMap.has(currentUid)) selectedValue = currentUid;
        else if (currentVal && _membersMap.has(currentVal)) selectedValue = currentVal;
        else if (currentVal) { const m = members.find(x => getMemberLabel(x) === currentVal); if (m) selectedValue = m.uid; }
        if (!isBatch && currentVal && !selectedValue) { options.push({ value: currentVal, label: currentVal }); selectedValue = currentVal; }
        members.forEach(m => options.push({ value: m.uid, label: getMemberLabel(m) }));
        return { options, selectedValue: isBatch ? '' : selectedValue };
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
        const { options, selectedValue } = buildAssigneeOptions(workflow?.owner || '', workflow?.ownerUid || '', false);
        return root.renderSelect('focus-owner', options, selectedValue, 'w-full');
    }

    function renderBatchAssigneeField() {
        if (!isCollabMode() || !root.renderSelect) return null;
        const { options, selectedValue } = buildAssigneeOptions('', '', true);
        return root.renderSelect('batch-bug-assignee', options, selectedValue, 'w-full');
    }

    function replaceCustomSelectInput(inputId, currentVal, currentUid) {
        if (!isCollabMode() || typeof document === 'undefined') return;
        const el = document.getElementById(inputId);
        if (!el || el.type === 'hidden') return;
        const { options, selectedValue } = buildAssigneeOptions(currentVal || el.value || '', currentUid || '', false);
        const html = root.renderSelect ? root.renderSelect(inputId, options, selectedValue, 'w-full') : '';
        if (!html) return;
        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        if (temp.firstElementChild && el.parentNode) el.parentNode.replaceChild(temp.firstElementChild, el);
    }

    function replaceBugAssigneeInput() {
        const bugData = root.state?.editingDoc?.bugData || root.state?._newBugData || {};
        replaceCustomSelectInput('ed-bug-assignee', bugData.assignee, bugData.assigneeUid);
    }

    function replaceTaskAssigneeInput() {
        const d = root.state?.editingDoc;
        replaceCustomSelectInput('ed-task-assignee', d?.assignee || d?.taskData?.assignee || root.state?._newTaskAssignee, d?.assigneeUid || d?.taskData?.assigneeUid || root.state?._newTaskAssigneeUid);
    }

    function ensureAssignStyles() {
        if (_stylesInjected || typeof document === 'undefined') return;
        const head = document.head || document.body || document.documentElement;
        if (!head) return;
        const style = document.createElement('style');
        style.id = 'collab-assign-styles';
        style.textContent = '#collab-notif-btn{position:relative;}.collab-notif-badge{position:absolute;top:-5px;right:-5px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;line-height:1;padding:2px 4px;border-radius:9999px;border:2px solid var(--bg);pointer-events:none;}#collab-notif-panel{position:fixed;z-index:1000;width:360px;max-width:calc(100vw - 24px);max-height:420px;overflow:hidden;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.4);display:flex;flex-direction:column;}.collab-notif-item{padding:10px 12px;border-bottom:1px solid var(--brd);cursor:pointer;transition:background .15s;}.collab-notif-item:last-child{border-bottom:none;}.collab-notif-item:hover{background:var(--bg-hover,rgba(255,255,255,0.06));}.collab-notif-item.is-unread{background:rgba(59,130,246,0.08);}[data-ui-style="bauhaus"] #collab-notif-panel{border:2px solid #121212 !important;border-radius:0 !important;box-shadow:3px 3px 0 0 #121212 !important;}[data-ui-style="bauhaus"] .collab-notif-badge,[data-ui-style="bauhaus"] .collab-notif-avatar,[data-ui-style="bauhaus"] .collab-notif-action-btn,[data-ui-style="bauhaus"] .collab-assignee-avatar{border:1.5px solid #121212 !important;border-radius:0 !important;}';
        head.appendChild(style);
        _stylesInjected = true;
    }

    function getAvatarColor(key) {
        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
        let hash = 0, str = String(key || '');
        for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
        return colors[(hash >>> 0) % colors.length];
    }

    function getActorDisplayName(name, email) {
        name = String(name || '').trim(); email = String(email || '').trim();
        if (name && name !== email && !name.includes('@')) return name;
        if (name && !email) return name;
        if (email) return email.split('@')[0] || email;
        return 'Team Member';
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
        const displayItems = _notifications.slice(0, 50), unreadCount = _notifications.filter(n => n.readAt == null).length;

        const headerHtml = `<div class="collab-notif-header flex items-center justify-between px-3.5 py-2.5 border-b shrink-0" style="border-color:var(--brd);background:var(--bg2);"><div class="flex items-center gap-2"><span class="text-xs font-semibold" style="color:var(--tx);">Notifications</span>${unreadCount > 0 ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style="background:rgba(59,130,246,0.15);color:var(--acc);">${unreadCount}</span>` : ''}</div><div class="flex items-center gap-1"><button type="button" class="collab-notif-action-btn flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--bg)] text-xs transition-colors" style="color:var(--tx-m);${unreadCount === 0 ? 'opacity:.35;cursor:default;' : ''}" title="Mark all as read" aria-label="Mark all as read" data-onclick="collabMarkAllNotificationsRead(event)"><i class="fa-solid fa-check-double"></i></button><button type="button" class="collab-notif-action-btn flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--bg)] hover:text-red-400 text-xs transition-colors" style="color:var(--tx-m);${!displayItems.length ? 'opacity:.35;cursor:default;' : ''}" title="Delete all notifications" aria-label="Delete all notifications" data-onclick="collabClearAllNotifications(event)"><i class="fa-solid fa-trash-can"></i></button></div></div>`;

        if (!displayItems.length) {
            panel.innerHTML = headerHtml + '<div class="p-6 text-xs text-center" style="color:var(--tx-d);">No assignments yet.</div>';
            return;
        }

        const itemsHtml = displayItems.map(item => {
            const unreadClass = item.readAt == null ? ' is-unread' : '', actorName = getActorDisplayName(item.actorName, item.actorEmail);
            const member = item.actorUid ? _membersMap.get(item.actorUid) : null;
            const photo = (typeof item.actorPhotoUrl === 'string' && /^https:\/\//i.test(item.actorPhotoUrl)) ? item.actorPhotoUrl : (member?.photoURL || member?.photoUrl);
            const isValidPhoto = typeof photo === 'string' && /^https:\/\//i.test(photo);
            const initial = (actorName.charAt(0) || 'U').toUpperCase(), avatarColor = getAvatarColor(item.actorUid || item.actorEmail || actorName);
            const avatarHtml = isValidPhoto
                ? `<img src="${esc(photo)}" alt="${esc(actorName)}" class="collab-notif-avatar w-7 h-7 rounded-full object-cover shrink-0" style="border:1px solid var(--brd);">`
                : `<div class="collab-notif-avatar w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-bold text-xs text-white select-none" style="background-color:${avatarColor};">${esc(initial)}</div>`;
            const docsList = typeof root.documents !== 'undefined' ? root.documents : (typeof documents !== 'undefined' ? documents : []);
            const foundDoc = Array.isArray(docsList) ? docsList.find(d => d.id === item.docId) : null;
            const docTitle = (foundDoc && foundDoc.title) ? foundDoc.title : ((item.docTitle && item.docTitle !== item.docId) ? item.docTitle : (foundDoc?.title || item.docTitle || 'Untitled'));
            const actionVerb = item.kind === 'comment_mention' ? 'mentioned you in' : 'assigned you';
            const cat = (item.kind === 'bug' || item.kind === 'task') ? item.kind : (foundDoc?.category || (String(item.docTitle || '').startsWith('BUG-') ? 'bug' : 'task'));
            let catMeta = typeof root.getCatMeta === 'function' ? root.getCatMeta(cat) : null;
            if (item.kind === 'comment_mention') catMeta = { icon: 'fa-comment', color: 'var(--acc)', label: 'Comment' };
            else if (item.kind === 'focus') catMeta = { icon: 'fa-crosshairs', color: 'var(--c-run)', label: 'Focus' };
            else if (!catMeta) catMeta = cat === 'bug' ? { icon: 'fa-bug', color: 'var(--c-bug)', label: 'Bug' } : { icon: 'fa-list-check', color: 'var(--c-task)', label: 'Task' };
            const actionClick = typeof root.actionAttr === 'function' ? root.actionAttr('collabOpenNotification', item.id, item.docId) : `collabOpenNotification('${esc(item.id)}','${esc(item.docId)}')`;

            return `<div class="collab-notif-item${unreadClass} flex items-center gap-2.5" data-onclick="${actionClick}">` +
                avatarHtml +
                `<div class="flex-1 min-w-0"><div class="text-xs leading-snug truncate" style="color:var(--tx);font-weight:${item.readAt == null ? '600' : '400'};"><span>${esc(actorName)}</span> ${actionVerb} <span class="underline-offset-2">${esc(docTitle)}</span></div></div>` +
                `<div class="shrink-0 ml-1.5 flex items-center justify-center w-5 h-5" style="color:${catMeta.color || 'var(--tx-d)'};" title="${esc(catMeta.label || cat)}"><i class="fa-solid ${catMeta.icon || 'fa-file'} text-xs"></i></div>` +
                `</div>`;
        }).join('');

        panel.innerHTML = headerHtml + `<div class="collab-notif-list flex flex-col overflow-y-auto" style="max-height:350px;">${itemsHtml}</div>`;
    }

    async function markAllNotificationsRead(e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        const unread = _notifications.filter(n => n.readAt == null);
        if (!unread.length) return;
        const prev = _notifications.map(n => ({ ...n })), now = Date.now(), committed = new Set();
        unread.forEach(n => { n.readAt = now; });
        updateNotificationBell();
        const db = getFirestoreDb();
        if (db) {
            try {
                if (typeof db.batch === 'function') {
                    for (let i = 0; i < unread.length; i += 400) {
                        const chunk = unread.slice(i, i + 400), b = db.batch();
                        chunk.forEach(n => b.update(db.collection('notifications').doc(n.id), { readAt: now }));
                        await b.commit();
                        chunk.forEach(n => committed.add(n.id));
                    }
                } else {
                    await Promise.all(unread.map(async n => { await db.collection('notifications').doc(n.id).update({ readAt: now }); committed.add(n.id); }));
                }
            } catch (err) {
                _notifications = prev.map(n => committed.has(n.id) ? { ...n, readAt: now } : n);
                updateNotificationBell();
                if (typeof root.toast === 'function') root.toast('Failed to mark notifications read', 'error');
                console.warn('[CollabAssign] markAllNotificationsRead:', err);
            }
        }
    }

    async function clearAllNotifications(e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (!_notifications.length) return;
        const prev = [..._notifications], toDelete = [..._notifications], committed = new Set();
        _notifications = [];
        updateNotificationBell();
        const db = getFirestoreDb();
        if (db) {
            try {
                if (typeof db.batch === 'function') {
                    for (let i = 0; i < toDelete.length; i += 400) {
                        const chunk = toDelete.slice(i, i + 400), b = db.batch();
                        chunk.forEach(n => b.delete(db.collection('notifications').doc(n.id)));
                        await b.commit();
                        chunk.forEach(n => committed.add(n.id));
                    }
                } else {
                    await Promise.all(toDelete.map(async n => { await db.collection('notifications').doc(n.id).delete(); committed.add(n.id); }));
                }
            } catch (err) {
                _notifications = prev.filter(n => !committed.has(n.id));
                updateNotificationBell();
                if (typeof root.toast === 'function') root.toast('Failed to clear notifications', 'error');
                console.warn('[CollabAssign] clearAllNotifications:', err);
            }
        }
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
        if (!currentUid || newUid === currentUid || !_membersMap.has(newUid)) return;
        const db = getFirestoreDb(); if (!db) return;
        const member = getCurrentMember(), actorName = member?.displayName || authUser?.displayName || member?.email || authUser?.email || 'Team Member', actorEmail = member?.email || authUser?.email || '';
        const actorPhoto = (typeof authUser?.photoURL === 'string' && /^https:\/\//i.test(authUser.photoURL)) ? authUser.photoURL : ((typeof member?.photoURL === 'string' && /^https:\/\//i.test(member.photoURL)) ? member.photoURL : '');
        const docsList = typeof root.documents !== 'undefined' ? root.documents : (typeof documents !== 'undefined' ? documents : []);
        const foundDoc = Array.isArray(docsList) ? docsList.find(d => d.id === doc.id) : null;
        const docTitle = (doc && doc.title && doc.title !== doc.id) ? doc.title : (foundDoc?.title || doc?.title || 'Untitled');
        const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        const payload = { recipientUid: newUid, actorUid: currentUid, actorName, actorEmail, docId: doc.id, docTitle, kind, signalKey: signalKey || '', createdAt: Date.now(), readAt: null };
        if (actorPhoto) payload.actorPhotoUrl = actorPhoto;
        try {
            await db.collection('notifications').doc(notifId).set(payload);
        } catch (err) { console.warn('[CollabAssign] create notification:', err); }
    }

    async function notifyBatchBugAssign(items) {
        if (!isCollabMode() || !Array.isArray(items)) return;
        for (const item of items) await notifyAssignment({ doc: item.doc, kind: 'bug', signalKey: '', oldUid: item.oldUid || '', newUid: item.newUid || '' });
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
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap, uid = docSnap.id || data?.uid;
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
                        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap, notifId = docSnap.id || data?.id;
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
        _membersMap.clear(); _notifications = []; closeNotificationPanel();
    }

    if (root.renderEditor && !root.renderEditor._collabAssignWrapped) {
        const origRenderEditor = root.renderEditor;
        root.renderEditor = function(...args) {
            let html = origRenderEditor.apply(this, args);
            if (isCollabMode() && root.renderSelect) {
                const b = root.state?.editingDoc?.bugData || root.state?._newBugData || {};
                const bOpts = buildAssigneeOptions(b.assignee || '', b.assigneeUid || '', false);
                html = html.replace(/<input\s+id=["']ed-bug-assignee["'][^>]*>/i, root.renderSelect('ed-bug-assignee', bOpts.options, bOpts.selectedValue, 'w-full'));
                const td = root.state?.editingDoc;
                const tOpts = buildAssigneeOptions(td?.assignee || td?.taskData?.assignee || root.state?._newTaskAssignee || '', td?.assigneeUid || td?.taskData?.assigneeUid || root.state?._newTaskAssigneeUid || '', false);
                html = html.replace(/<input\s+id=["']ed-task-assignee["'][^>]*>/i, root.renderSelect('ed-task-assignee', tOpts.options, tOpts.selectedValue, 'w-full'));
            }
            return html;
        };
        root.renderEditor._collabAssignWrapped = true;
    }

    function wrapMethod(obj, prop, flag, after) {
        if (obj[prop] && !obj[prop][flag]) {
            const orig = obj[prop];
            obj[prop] = function(...args) { const res = orig.apply(this, args); after(); return res; };
            obj[prop][flag] = true;
        }
    }

    wrapMethod(root, 'renderContent', '_collabAssignWrapped', () => { replaceBugAssigneeInput(); replaceTaskAssigneeInput(); });
    wrapMethod(root, 'updateHeader', '_collabBellWrapped', attachNotificationBell);
    wrapMethod(root, 'render', '_collabBellWrapped', attachNotificationBell);

    root.collabToggleNotifications = toggleNotifications;
    root.collabOpenNotification = openNotification;
    root.collabMarkAllNotificationsRead = markAllNotificationsRead;
    root.collabClearAllNotifications = clearAllNotifications;

    root.CollabAssign = {
        getMembers: () => getSortedMembers(), getMemberLabel, buildAssigneeOptions, resolveMember,
        renderFocusOwnerField, renderBatchAssigneeField, replaceBugAssigneeInput, replaceTaskAssigneeInput,
        attachNotificationBell, updateNotificationBell, toggleNotifications, openNotification,
        markAllNotificationsRead, clearAllNotifications, notifyAssignment, notifyBatchBugAssign,
        startListening, stopListening, setMembers: (map) => { _membersMap = map; }, setNotifications: (list) => { _notifications = list; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
