// ========================
// WORKSPACES — registry, switching, management
// ========================
// A workspace is a completely separate vault: its own documents, trash, share
// registry, activity log, document history, saved views, and its own folder in
// the GitHub repo. Switching workspace swaps all of it at once, so different
// jobs (e.g. "trulioo" and "opentext") never mix.
//
// The DATA layer lives in storage.js (wsKey/wsPath) on purpose — this file only
// owns the registry and the UI. storage.js is what a stale cached shell already
// ships, so the vault stays correctly namespaced even if this file is missing.
//
// Global, shared by every workspace: the master password, the GitHub token and
// repo, the recovery blob and hint.

const WS_NAME_MAX = 32;
const WS_DEFAULT_NAME = 'Personal';
// Kept local rather than read from storage.js: this file must stay usable when
// a browser pairs it with a stale copy of that one (assets ship with
// max-age=600). Same values as WS_DEFAULT_ID / WS_ID_PATTERN there.
const WS_DEFAULT = 'default';
const WS_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

function _activeWsId() {
    try {
        const id = localStorage.getItem('docvault_active_workspace');
        return (id && WS_ID_RE.test(id)) ? id : WS_DEFAULT;
    } catch (e) { return WS_DEFAULT; }
}

function _wsRegistry() {
    try {
        const stored = JSON.parse(localStorage.getItem('docvault_workspaces') || '[]');
        return Array.isArray(stored) ? stored.filter(w => w && typeof w.id === 'string' && WS_ID_RE.test(w.id) && w.id !== WS_DEFAULT) : [];
    } catch (e) { return []; }
}

function _saveWsRegistry(list) {
    localStorage.setItem('docvault_workspaces', JSON.stringify(list));
}

// The default workspace is implicit — it exists before any registry does, and
// holds the vault that was there before workspaces were introduced. Only its
// label is ever stored, and only once it has been renamed.
function getWorkspaces() {
    let defaultName = WS_DEFAULT_NAME;
    try { defaultName = localStorage.getItem('docvault_workspace_default_name') || WS_DEFAULT_NAME; } catch (e) { /* keep the fallback */ }
    return [
        { id: WS_DEFAULT, name: defaultName, createdAt: 0 },
        ..._wsRegistry().map(w => ({ id: w.id, name: String(w.name || w.id).slice(0, WS_NAME_MAX), createdAt: Number(w.createdAt) || 0 }))
    ];
}

function getActiveWorkspace() {
    const id = _activeWsId();
    return getWorkspaces().find(w => w.id === id) || { id: WS_DEFAULT, name: WS_DEFAULT_NAME, createdAt: 0 };
}

// Names are free text; the id is what ends up in storage keys and GitHub paths,
// so it is derived, validated, and never taken from user input directly.
function _slugifyWorkspaceName(name) {
    const base = String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, WS_NAME_MAX);
    const candidate = /^[a-z0-9]/.test(base) ? base : ('ws-' + base).replace(/-+$/, '');
    return WS_ID_RE.test(candidate) ? candidate : 'ws-' + Date.now().toString(36);
}

window.renderWorkspaceSwitcher = function() {
    const label = document.getElementById('workspace-switcher-name');
    if (!label) return;
    // Guest mode must never read the real registry — not even for a name. It
    // shows the demo's own single vault instead; renderGuestBanner() disables
    // the control itself. This runs on every render, so it has to keep saying
    // so rather than letting a later render restore a real workspace name.
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) { label.textContent = 'Demo vault'; return; }
    label.textContent = getActiveWorkspace().name;
};

// ========================
// SWITCHING
// ========================
// The dangerous part of this feature. Two things must be true before the active
// workspace id changes:
//   1. no unsaved editor state is about to be thrown away, and
//   2. no GitHub push is still in flight — that push resolves its target paths
//      and shas lazily, so letting it land after the switch would write this
//      workspace's documents over the next workspace's shards.
window.switchWorkspace = async function(id) {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        toast('Workspaces aren’t available in demo mode.', 'info');
        return;
    }
    if (!WS_ID_RE.test(id) || !getWorkspaces().some(w => w.id === id)) {
        toast('That workspace no longer exists.', 'error');
        return;
    }
    if (id === _activeWsId()) { closeModal(); return; }

    if (state.view === 'editor' && state._editorSnapshot !== undefined
        && typeof _captureEditorFormState === 'function'
        && _captureEditorFormState() !== state._editorSnapshot) {
        toast('Save or discard your edits before switching workspace.', 'warning');
        return;
    }

    closeModal();
    const target = getWorkspaces().find(w => w.id === id);
    toast(`Switching to ${target.name}…`, 'info');

    try {
        await _flushActiveWorkspaceSync();
    } catch (e) {
        console.warn('[workspaces] could not flush pending sync before switching', e);
        toast('Changes in the previous workspace are still waiting to sync — they will retry when you return to it.', 'warning');
    }

    localStorage.setItem('docvault_active_workspace', id);
    // Cached remote state belongs to the workspace we just left.
    GitHubSync._remoteSharded = false;
    // hasPendingSync() also consults an in-memory flag that is not per-workspace;
    // re-seed it from the workspace we just entered.
    DocStorage._pending = localStorage.getItem(DocStorage.PENDING_SYNC_KEY) === '1';

    documents = [];
    state.view = 'dashboard';
    state.category = 'all';
    state.subfolder = '';
    state.search = '';
    state.statusFilter = 'all';
    state.editingDoc = null;
    state.editorTags = [];
    state._editorSnapshot = undefined;
    state.history = [];
    state.batchMode = false;
    state.selectedIds = new Set();
    state.docListPage = 1;
    if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch (e) {} }
    window.tuiEditor = null;

    await hydrate();
    render();
    if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
    toast(`Workspace: ${target.name}`, 'success');
};

// Waits for any in-flight push, then drains anything still queued, so nothing
// from the outgoing workspace can land after the paths have changed.
async function _flushActiveWorkspaceSync() {
    if (DocStorage._syncInFlight) await DocStorage._syncInFlight;
    if (!DocStorage.hasPendingSync()) return;
    if (!navigator.onLine || !(await GitHubSync.isConfigured())) return;
    await DocStorage.queueSync(documents, {}, { silent: true });
}

// ========================
// CREATE / RENAME / DELETE
// ========================
window.createWorkspace = async function() {
    const input = document.getElementById('ws-new-name');
    const name = (input?.value || '').trim().slice(0, WS_NAME_MAX);
    if (!name) { toast('Enter a workspace name.', 'error'); return; }

    const id = _slugifyWorkspaceName(name);
    if (getWorkspaces().some(w => w.id === id)) { toast('A workspace with that name already exists.', 'error'); return; }

    _saveWsRegistry([..._wsRegistry(), { id, name, createdAt: Date.now() }]);
    await switchWorkspace(id);
};

window.renameWorkspace = function(id) {
    const input = document.getElementById('ws-rename-input');
    const name = (input?.value || '').trim().slice(0, WS_NAME_MAX);
    if (!name) { toast('Enter a workspace name.', 'error'); return; }
    if (id === WS_DEFAULT) {
        // The default workspace has no registry entry to rename — only a label.
        localStorage.setItem('docvault_workspace_default_name', name);
    } else {
        const list = _wsRegistry();
        const entry = list.find(w => w.id === id);
        if (!entry) { toast('That workspace no longer exists.', 'error'); return; }
        entry.name = name;
        _saveWsRegistry(list);
    }
    renderWorkspaceSwitcher();
    showWorkspaceManager();
    toast('Workspace renamed.', 'success');
};

window.showRenameWorkspace = function(id) {
    const workspace = getWorkspaces().find(w => w.id === id);
    if (!workspace) return;
    showModal(`
        <div>
            <h3 class="font-heading font-bold text-lg mb-4" style="color:var(--tx);">Rename workspace</h3>
            <input id="ws-rename-input" type="text" class="form-input w-full mb-4" maxlength="${WS_NAME_MAX}" value="${escHtml(workspace.name)}">
            <div class="flex gap-3 justify-end">
                <button class="btn-s" data-onclick="showWorkspaceManager()">Cancel</button>
                <button class="btn-p" data-onclick="renameWorkspace('${workspace.id}')">Save</button>
            </div>
        </div>
    `);
};

window.confirmDeleteWorkspace = function(id) {
    const workspace = getWorkspaces().find(w => w.id === id);
    if (!workspace || id === WS_DEFAULT) return;
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);">
                <i class="fa-solid fa-trash text-rose-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">Delete workspace</h3>
            <p class="text-sm mb-3" style="color:var(--tx-m);">Permanently delete "<strong style="color:var(--tx);">${escHtml(workspace.name)}</strong>" and everything in it?</p>
            <p class="text-xs mb-6 py-2 px-3 rounded-lg text-left" style="color:var(--tx-m);background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.25);">
                Every document, its trash, its activity log and its share links are removed from this device <em>and</em> from GitHub. This cannot be undone.
            </p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="showWorkspaceManager()">Cancel</button>
                <button class="btn-d" data-onclick="deleteWorkspace('${workspace.id}')">Delete workspace</button>
            </div>
        </div>
    `);
};

// Removes every localStorage key this workspace owns. Enumerated by prefix
// rather than by a fixed list because per-document history keys carry a
// document id, so they cannot be named up front.
function _purgeWorkspaceLocalData(id) {
    const prefix = 'ws_' + id + '__';
    const doomed = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) doomed.push(key);
    }
    doomed.forEach(key => localStorage.removeItem(key));
    return doomed.length;
}

// Best-effort removal of the workspace's folder in the vault repo. The Contents
// API has no folder delete, so the files are listed from the git tree and
// deleted one by one. A failure here is reported, never fatal: the local data
// is already gone and the user can retry from GitHub directly.
async function _purgeWorkspaceRemoteData(id) {
    let settings = null;
    try { settings = await GitHubSync.getSettings(); } catch (e) { settings = null; }
    if (!settings || !settings.token) return { deleted: 0, failed: 0 };
    const tree = await GitHubSync._getTree(settings);
    if (!tree) return { deleted: 0, failed: 0 };

    const prefix = 'workspaces/' + id + '/';
    const paths = Object.keys(tree).filter(path => path.startsWith(prefix));
    const headers = {
        'Authorization': `token ${settings.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    };
    let deleted = 0;
    let failed = 0;
    for (const path of paths) {
        try {
            const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${path}`, {
                method: 'DELETE',
                headers,
                body: JSON.stringify({ message: `Delete workspace ${id}`, sha: tree[path], branch: settings.branch || 'main' })
            });
            if (res.ok || res.status === 404) deleted++;
            else failed++;
        } catch (e) {
            failed++;
            console.warn('[workspaces] could not delete', path, e);
        }
    }
    return { deleted, failed };
}

window.deleteWorkspace = async function(id) {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
    if (id === WS_DEFAULT || !WS_ID_RE.test(id)) return;
    closeModal();

    // Leave first if it is the workspace being deleted — otherwise the app would
    // be sitting on documents whose storage is about to disappear.
    if (_activeWsId() === id) await switchWorkspace(WS_DEFAULT);

    // Published links outlive local data, so revoke them before the registry
    // that names them is purged.
    if (typeof revokeSharesInWorkspace === 'function') {
        try {
            const { failed } = await revokeSharesInWorkspace(id);
            if (failed) toast(`${failed} share link${failed > 1 ? 's' : ''} from that workspace could not be revoked.`, 'warning');
        } catch (e) { console.warn('[workspaces] share revocation failed', e); }
    }

    let remote = { deleted: 0, failed: 0 };
    try { remote = await _purgeWorkspaceRemoteData(id); }
    catch (e) { console.warn('[workspaces] remote purge failed', e); remote = { deleted: 0, failed: 1 }; }

    _purgeWorkspaceLocalData(id);
    _saveWsRegistry(_wsRegistry().filter(w => w.id !== id));

    renderWorkspaceSwitcher();
    if (remote.failed) toast(`Workspace deleted locally, but ${remote.failed} file${remote.failed > 1 ? 's' : ''} could not be removed from GitHub.`, 'warning');
    else toast('Workspace deleted.', 'success');
};

// ========================
// MANAGER MODAL
// ========================
window.showWorkspaceManager = function() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        toast('Workspaces aren’t available in demo mode.', 'info');
        return;
    }
    const activeId = _activeWsId();
    const rows = getWorkspaces().map(workspace => {
        const isActive = workspace.id === activeId;
        return `
        <div class="flex items-center gap-3 p-3 rounded-lg mb-2" style="background:var(--bg2);border:1px solid ${isActive ? 'var(--acc)' : 'var(--brd)'};">
            <i class="fa-solid ${isActive ? 'fa-circle-check' : 'fa-layer-group'} text-xs shrink-0" style="color:${isActive ? 'var(--acc)' : 'var(--tx-d)'};"></i>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate" style="color:var(--tx);">${escHtml(workspace.name)}</div>
                <div class="text-[11px]" style="color:var(--tx-d);">${isActive ? 'Current workspace' : (workspace.id === WS_DEFAULT ? 'Original vault' : 'Created ' + new Date(workspace.createdAt).toLocaleDateString())}</div>
            </div>
            ${isActive ? '' : `<button class="btn-p text-xs py-1 px-2.5 shrink-0" data-onclick="switchWorkspace('${workspace.id}')">Open</button>`}
            <button class="btn-s text-xs py-1 px-2 shrink-0" title="Rename" data-onclick="showRenameWorkspace('${workspace.id}')"><i class="fa-solid fa-pen"></i></button>
            ${workspace.id === WS_DEFAULT ? '' : `<button class="btn-d text-xs py-1 px-2 shrink-0" title="Delete workspace" data-onclick="confirmDeleteWorkspace('${workspace.id}')"><i class="fa-solid fa-trash"></i></button>`}
        </div>`;
    }).join('');

    showModal(`
        <div>
            <h3 class="font-heading font-bold text-lg mb-1" style="color:var(--tx);"><i class="fa-solid fa-layer-group text-[var(--acc)] mr-2"></i>Workspaces</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Each workspace is a separate vault — documents, trash, activity and share links do not cross between them. They share one master password and one GitHub connection.</p>
            <div style="max-height:340px;overflow-y:auto;">${rows}</div>
            <div class="mt-4 pt-4" style="border-top:1px solid var(--brd);">
                <label class="block text-xs font-semibold tracking-wider uppercase mb-2" style="color:var(--tx-d);">New workspace</label>
                <div class="flex gap-2">
                    <input id="ws-new-name" type="text" class="form-input flex-1" maxlength="${WS_NAME_MAX}" placeholder="e.g. Trulioo">
                    <button class="btn-p shrink-0" data-onclick="createWorkspace()"><i class="fa-solid fa-plus mr-1.5"></i>Create</button>
                </div>
            </div>
            <div class="flex justify-end mt-4"><button class="btn-s" data-onclick="closeModal()">Close</button></div>
        </div>
    `);
};
