// DocVault team collaboration workspaces module
(function(root) {
    const WS_DEFAULT = 'default', WS_DEFAULT_NAME = 'Personal', WS_NAME_MAX = 32, WS_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;
    let _remoteWorkspaces = [], _defaultWorkspaceName = WS_DEFAULT_NAME, _unsubWorkspaces = null;

    function isGuestMode() { return Boolean(root.GUEST_MODE || /(?:^|[?&])guest=1(?:&|$)/.test(root.location?.search || '')); }
    function isCollabMode() { return !isGuestMode() && Boolean(root.COLLAB_MODE); }
    function getFirestoreDb() { return root.CollabStore?.getFirestoreDb ? root.CollabStore.getFirestoreDb() : (root.firebase?.firestore ? root.firebase.firestore() : null); }
    function getCurrentMember() { return root.CollabBootstrap?.getCurrentMember?.() || null; }
    function isViewer() { return getCurrentMember()?.role === 'viewer'; }
    function isOwner() { return getCurrentMember()?.role === 'owner'; }
    function _activeWsId() { try { const id = root.localStorage?.getItem('docvault_active_workspace'); return (id && WS_ID_RE.test(id)) ? id : WS_DEFAULT; } catch (_) { return WS_DEFAULT; } }
    function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function _slugify(name) {
        const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, WS_NAME_MAX);
        const candidate = /^[a-z0-9]/.test(base) ? base : ('ws-' + base).replace(/-+$/, '');
        return WS_ID_RE.test(candidate) ? candidate : 'ws-' + Date.now().toString(36);
    }

    function getWorkspaces() {
        if (!isCollabMode()) return (typeof _origGetWorkspaces === 'function') ? _origGetWorkspaces() : [{ id: WS_DEFAULT, name: WS_DEFAULT_NAME, createdAt: 0 }];
        return [
            { id: WS_DEFAULT, name: _defaultWorkspaceName || WS_DEFAULT_NAME, createdAt: 0 },
            ..._remoteWorkspaces.map(w => ({ id: w.id, name: String(w.name || w.id).slice(0, WS_NAME_MAX), createdAt: typeof w.createdAt === 'number' ? w.createdAt : (Date.parse(w.createdAt) || 0) }))
        ];
    }

    function getActiveWorkspace() {
        const id = _activeWsId();
        return getWorkspaces().find(w => w.id === id) || { id: WS_DEFAULT, name: _defaultWorkspaceName || WS_DEFAULT_NAME, createdAt: 0 };
    }

    function renderWorkspaceSwitcher() {
        if (typeof document === 'undefined') return;
        const label = document.getElementById('workspace-switcher-name');
        if (!label) return;
        if (isGuestMode()) { label.textContent = 'Demo vault'; return; }
        label.textContent = getActiveWorkspace().name;
    }

    function parseWorkspaceSnap(docSnap) {
        const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data || {}, id = docSnap.id;
        if (id === WS_DEFAULT) { if (data.name) _defaultWorkspaceName = data.name; }
        else if (WS_ID_RE.test(id)) { _remoteWorkspaces.push({ id, ...data, docCount: typeof data.docCount === 'number' ? data.docCount : 0 }); }
    }

    async function loadWorkspaces() {
        if (!isCollabMode()) return;
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) return;

        try {
            const snap = await db.collection('workspaces').get();
            _remoteWorkspaces = [];
            snap.forEach(parseWorkspaceSnap);
            renderWorkspaceSwitcher();
        } catch (err) { console.warn('[CollabWorkspaces] loadWorkspaces failed:', err); }

        if (_unsubWorkspaces) { try { _unsubWorkspaces(); } catch (_) {} _unsubWorkspaces = null; }

        if (typeof db.collection('workspaces')?.onSnapshot === 'function') {
            try {
                _unsubWorkspaces = db.collection('workspaces').onSnapshot(snapshot => {
                    if (!snapshot) return;
                    _remoteWorkspaces = [];
                    snapshot.forEach(parseWorkspaceSnap);
                    renderWorkspaceSwitcher();
                    const title = document.querySelector?.('#modal h3');
                    if (title && title.textContent.includes('Workspaces')) showWorkspaceManager();
                }, () => {});
            } catch (_) {}
        }
    }

    async function switchWorkspace(id, options = {}) {
        if (!isCollabMode()) { if (_origSwitchWorkspace) return _origSwitchWorkspace(id, options); return; }
        if (!WS_ID_RE.test(id) || !getWorkspaces().some(w => w.id === id)) { root.toast?.('That workspace no longer exists.', 'error'); return; }
        if (id === _activeWsId()) { if (!options.keepModal) root.closeModal?.(); return; }

        const s = (typeof state !== 'undefined' && state) ? state : (root.state || null);
        if (s?.view === 'editor' && s._editorSnapshot !== undefined) {
            const captureFn = root._captureEditorFormState || (typeof _captureEditorFormState === 'function' ? _captureEditorFormState : null);
            if (captureFn && captureFn() !== s._editorSnapshot) { root.toast?.('Save or discard your edits before switching workspace.', 'warning'); return; }
        }

        if (!options.keepModal) root.closeModal?.();
        const target = getWorkspaces().find(w => w.id === id);
        if (!options.silent) root.toast?.(`Switching to ${target.name}…`, 'info');

        root.localStorage?.setItem('docvault_active_workspace', id);
        const allKnown = root.CollabStore?.getKnownDocs ? Array.from(root.CollabStore.getKnownDocs().values()) : [];
        const activeDocs = allKnown.filter(d => (d.workspaceId || WS_DEFAULT) === id).map(d => ({ ...d, tags: Array.isArray(d.tags) ? [...d.tags] : [] }));

        if (Array.isArray(root.documents)) { root.documents.length = 0; root.documents.push(...activeDocs); }
        else if (typeof documents !== 'undefined' && Array.isArray(documents)) { documents.length = 0; documents.push(...activeDocs); }

        if (s) {
            Object.assign(s, { view: 'dashboard', category: 'all', subfolder: '', search: '', statusFilter: 'all', editingDoc: null, editorTags: [], _editorSnapshot: undefined, history: [], batchMode: false, docListPage: 1 });
            s.selectedIds = new Set();
        }
        if (root.tuiEditor) { try { root.tuiEditor.destroy(); } catch (_) {} root.tuiEditor = null; }

        root.render?.();
        renderWorkspaceSwitcher();
        root.updateSyncIndicator?.();
        if (!options.silent) root.toast?.(`Workspace: ${target.name}`, 'success');
    }

    async function createWorkspace() {
        if (!isCollabMode()) { if (_origCreateWorkspace) return _origCreateWorkspace(); return; }
        if (isViewer()) { root.toast?.('You have view access', 'error'); return; }

        const input = typeof document !== 'undefined' ? document.getElementById('ws-new-name') : null;
        const name = (input?.value || '').trim().slice(0, WS_NAME_MAX);
        if (!name) { root.toast?.('Enter a workspace name.', 'error'); return; }

        const id = _slugify(name);
        if (id === WS_DEFAULT || getWorkspaces().some(w => w.id === id)) { root.toast?.('A workspace with that name already exists.', 'error'); return; }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) { root.toast?.('Database not available.', 'error'); return; }
        const user = root.CollabBootstrap?.getCurrentUser?.() || root.CollabStore?.getCurrentUser?.() || root.firebase?.auth?.().currentUser;
        if (!user?.uid) { root.toast?.('Unauthenticated.', 'error'); return; }

        try {
            await db.collection('workspaces').doc(id).set({ id, name, createdAt: new Date().toISOString(), createdBy: user.uid, docCount: 0 });
            _remoteWorkspaces.push({ id, name, createdAt: Date.now(), createdBy: user.uid, docCount: 0 });
            renderWorkspaceSwitcher();
            await switchWorkspace(id);
            root.toast?.('Workspace created.', 'success');
        } catch (err) { root.toast?.(err?.message || 'Failed to create workspace.', 'error'); throw err; }
    }

    async function renameWorkspace(id) {
        if (!isCollabMode()) { if (_origRenameWorkspace) return _origRenameWorkspace(id); return; }
        if (isViewer()) { root.toast?.('You have view access', 'error'); return; }

        const input = typeof document !== 'undefined' ? document.getElementById('ws-rename-input') : null;
        const name = (input?.value || '').trim().slice(0, WS_NAME_MAX);
        if (!name) { root.toast?.('Enter a workspace name.', 'error'); return; }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) return;

        try {
            if (id === WS_DEFAULT) {
                await db.collection('workspaces').doc(WS_DEFAULT).set({ name }, { merge: true });
                _defaultWorkspaceName = name;
            } else {
                const entry = _remoteWorkspaces.find(w => w.id === id);
                if (!entry) { root.toast?.('That workspace no longer exists.', 'error'); return; }
                await db.collection('workspaces').doc(id).update({ name });
                entry.name = name;
            }
            renderWorkspaceSwitcher();
            showWorkspaceManager();
            root.toast?.('Workspace renamed.', 'success');
        } catch (err) { root.toast?.(err?.message || 'Failed to rename workspace.', 'error'); }
    }

    function showRenameWorkspace(id) {
        if (!isCollabMode()) { if (_origShowRenameWorkspace) return _origShowRenameWorkspace(id); return; }
        if (isViewer()) { root.toast?.('You have view access', 'error'); return; }
        const workspace = getWorkspaces().find(w => w.id === id);
        if (!workspace) return;
        root.showModal?.(`<div><h3 class="font-heading font-bold text-lg mb-4" style="color:var(--tx);">Rename workspace</h3><input id="ws-rename-input" type="text" class="form-input w-full mb-4" maxlength="${WS_NAME_MAX}" value="${esc(workspace.name)}"><div class="flex gap-3 justify-end"><button class="btn-s" data-onclick="showWorkspaceManager()">Cancel</button><button class="btn-p" data-onclick="renameWorkspace('${workspace.id}')">Save</button></div></div>`);
    }

    function confirmDeleteWorkspace(id) {
        if (!isCollabMode()) { if (_origConfirmDeleteWorkspace) return _origConfirmDeleteWorkspace(id); return; }
        if (isViewer()) { root.toast?.('You have view access', 'error'); return; }
        if (!isOwner()) { root.toast?.('Only the team owner can delete workspaces.', 'error'); return; }
        const workspace = getWorkspaces().find(w => w.id === id);
        if (!workspace || id === WS_DEFAULT) return;

        const allKnown = root.CollabStore?.getKnownDocs ? Array.from(root.CollabStore.getKnownDocs().values()) : [];
        if (allKnown.some(d => (d.workspaceId || WS_DEFAULT) === id)) { root.toast?.('Cannot delete workspace containing documents.', 'error'); return; }

        root.showModal?.(`<div class="text-center"><div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);"><i class="fa-solid fa-trash text-rose-400"></i></div><h3 class="font-heading font-semibold text-lg mb-2">Delete workspace</h3><p class="text-sm mb-3" style="color:var(--tx-m);">Permanently delete <strong class="delete-target-name">${esc(workspace.name)}</strong>?</p><p class="delete-warning-callout text-xs mb-6 py-2 px-3 rounded-lg text-left">This workspace will be removed for all team members. This cannot be undone.</p><div class="flex gap-3 justify-center"><button class="btn-s" data-onclick="showWorkspaceManager()">Cancel</button><button id="btn-confirm-delete-ws" class="btn-d" data-onclick="deleteWorkspace('${workspace.id}')">Delete workspace</button></div></div>`);
    }

    async function deleteWorkspace(id) {
        if (!isCollabMode()) { if (_origDeleteWorkspace) return _origDeleteWorkspace(id); return; }
        if (isViewer()) { root.toast?.('You have view access', 'error'); return; }
        if (!isOwner()) { root.toast?.('Only the team owner can delete workspaces.', 'error'); return; }
        if (id === WS_DEFAULT || !WS_ID_RE.test(id)) { root.toast?.('Cannot delete the default workspace.', 'error'); return; }

        const allKnown = root.CollabStore?.getKnownDocs ? Array.from(root.CollabStore.getKnownDocs().values()) : [];
        if (allKnown.some(d => (d.workspaceId || WS_DEFAULT) === id)) { root.toast?.('Cannot delete workspace containing documents.', 'error'); return; }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) return;

        try {
            if (_activeWsId() === id) await switchWorkspace(WS_DEFAULT, { keepModal: true, silent: true });
            await db.collection('workspaces').doc(id).delete();
            _remoteWorkspaces = _remoteWorkspaces.filter(w => w.id !== id);
            renderWorkspaceSwitcher();
            root.closeModal?.();
            root.toast?.('Workspace deleted.', 'success');
        } catch (err) { root.toast?.(err?.message || 'Failed to delete workspace.', 'error'); throw err; }
    }

    function showWorkspaceManager() {
        if (!isCollabMode()) { if (_origShowWorkspaceManager) return _origShowWorkspaceManager(); return; }
        if (isGuestMode()) { root.toast?.('Workspaces aren’t available in demo mode.', 'info'); return; }

        const activeId = _activeWsId(), viewer = isViewer(), owner = isOwner();
        const rows = getWorkspaces().map(workspace => {
            const isActive = workspace.id === activeId;
            const renameAttr = viewer ? 'disabled aria-disabled="true" title="You have view access"' : `data-onclick="showRenameWorkspace('${workspace.id}')" title="Rename"`;
            const deleteAttr = viewer
                ? 'disabled aria-disabled="true" title="You have view access"'
                : (!owner ? 'disabled aria-disabled="true" title="Only the team owner can delete workspaces"' : `data-onclick="confirmDeleteWorkspace('${workspace.id}')" title="Delete workspace"`);

            return `<div class="flex items-center gap-3 p-3 rounded-lg mb-2" style="background:var(--bg2);border:1px solid ${isActive ? 'var(--acc)' : 'var(--brd)'};"><i class="fa-solid ${isActive ? 'fa-circle-check' : 'fa-layer-group'} text-xs shrink-0" style="color:${isActive ? 'var(--acc)' : 'var(--tx-d)'};"></i><div class="flex-1 min-w-0"><div class="text-sm font-medium truncate" style="color:var(--tx);">${esc(workspace.name)}</div><div class="text-[11px]" style="color:var(--tx-d);">${isActive ? 'Current workspace' : (workspace.id === WS_DEFAULT ? 'Default workspace' : 'Created ' + new Date(workspace.createdAt).toLocaleDateString())}</div></div>${isActive ? '' : `<button class="btn-p text-xs py-1 px-2.5 shrink-0" data-onclick="switchWorkspace('${workspace.id}')">Open</button>`}<button class="btn-s text-xs py-1 px-2 shrink-0" ${renameAttr}><i class="fa-solid fa-pen"></i></button>${workspace.id === WS_DEFAULT ? '' : `<button class="btn-d text-xs py-1 px-2 shrink-0" ${deleteAttr}><i class="fa-solid fa-trash"></i></button>`}</div>`;
        }).join('');

        const createDisabled = viewer ? 'disabled aria-disabled="true" title="You have view access"' : 'data-onclick="createWorkspace()"';
        root.showModal?.(`<div><h3 class="font-heading font-bold text-lg mb-1" style="color:var(--tx);"><i class="fa-solid fa-layer-group text-[var(--acc)] mr-2"></i>Workspaces</h3><p class="text-sm mb-4" style="color:var(--tx-m);">All workspaces share one team vault.</p><div style="max-height:340px;overflow-y:auto;">${rows}</div><div class="mt-4 pt-4" style="border-top:1px solid var(--brd);"><label class="block text-xs font-semibold tracking-wider uppercase mb-2" style="color:var(--tx-d);">New workspace</label><div class="flex gap-2"><input id="ws-new-name" type="text" class="form-input flex-1" maxlength="${WS_NAME_MAX}" placeholder="e.g. Mobile QA Hub" ${viewer ? 'disabled aria-disabled="true"' : ''}><button class="btn-p shrink-0" ${createDisabled}><i class="fa-solid fa-plus mr-1.5"></i>Create</button></div></div><div class="flex justify-end mt-4"><button class="btn-s" data-onclick="closeModal()">Close</button></div></div>`);
    }

    async function batchCreateDoc(db, docRef, data, wsId) {
        const wsRef = db.collection('workspaces').doc(wsId);
        let ws = _remoteWorkspaces.find(w => w.id === wsId);
        let cur = (typeof ws?.docCount === 'number') ? ws.docCount : null;
        if (cur === null) {
            try {
                const s = await wsRef.get();
                cur = (s.exists && typeof s.data()?.docCount === 'number') ? s.data().docCount : 0;
            } catch (_) { cur = 0; }
        }
        const next = cur + 1;
        const batch = db.batch();
        batch.set(docRef, data);
        batch.update(wsRef, { docCount: next, lastDocId: data.id });
        await batch.commit();
        if (ws) ws.docCount = next;
    }

    async function batchDeleteDoc(db, docId, wsId) {
        const wsRef = db.collection('workspaces').doc(wsId);
        let ws = _remoteWorkspaces.find(w => w.id === wsId);
        let cur = (typeof ws?.docCount === 'number') ? ws.docCount : null;
        if (cur === null) {
            try {
                const s = await wsRef.get();
                cur = (s.exists && typeof s.data()?.docCount === 'number') ? s.data().docCount : 1;
            } catch (_) { cur = 1; }
        }
        const next = Math.max(0, cur - 1);
        const batch = db.batch();
        batch.delete(db.collection('documents').doc(docId));
        batch.update(wsRef, { docCount: next, lastDeletedDocId: docId });
        await batch.commit();
        if (ws) ws.docCount = next;
    }

    function stopListening() {
        if (_unsubWorkspaces) { try { _unsubWorkspaces(); } catch (_) {} _unsubWorkspaces = null; }
        _remoteWorkspaces = [];
        _defaultWorkspaceName = WS_DEFAULT_NAME;
    }

    const _origGetWorkspaces = root.getWorkspaces;
    const _origGetActiveWorkspace = root.getActiveWorkspace;
    const _origSwitchWorkspace = root.switchWorkspace;
    const _origCreateWorkspace = root.createWorkspace;
    const _origRenameWorkspace = root.renameWorkspace;
    const _origShowRenameWorkspace = root.showRenameWorkspace;
    const _origConfirmDeleteWorkspace = root.confirmDeleteWorkspace;
    const _origDeleteWorkspace = root.deleteWorkspace;
    const _origShowWorkspaceManager = root.showWorkspaceManager;
    const _origRenderWorkspaceSwitcher = root.renderWorkspaceSwitcher;

    root.getWorkspaces = getWorkspaces;
    root.getActiveWorkspace = getActiveWorkspace;
    root.switchWorkspace = switchWorkspace;
    root.createWorkspace = createWorkspace;
    root.renameWorkspace = renameWorkspace;
    root.showRenameWorkspace = showRenameWorkspace;
    root.confirmDeleteWorkspace = confirmDeleteWorkspace;
    root.deleteWorkspace = deleteWorkspace;
    root.showWorkspaceManager = showWorkspaceManager;
    root.renderWorkspaceSwitcher = renderWorkspaceSwitcher;

    root.CollabWorkspaces = {
        loadWorkspaces,
        getWorkspaces,
        getActiveWorkspace,
        switchWorkspace,
        createWorkspace,
        renameWorkspace,
        deleteWorkspace,
        showWorkspaceManager,
        renderWorkspaceSwitcher,
        batchCreateDoc,
        batchDeleteDoc,
        stopListening,
        setRemoteWorkspaces: (ws) => { _remoteWorkspaces = ws; },
        setDefaultWorkspaceName: (name) => { _defaultWorkspaceName = name; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
