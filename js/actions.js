// ========================
// NAVIGATION HISTORY
// ========================
window.pushHistory = function() {
    if (!state.history) state.history = [];
    const last = state.history[state.history.length - 1];
    const current = {
        view: state.view,
        category: state.category,
        subfolder: state.subfolder || '',
        docId: state.editingDoc?.id || null
    };
    if (!last || last.view !== current.view || last.category !== current.category || last.subfolder !== current.subfolder || last.docId !== current.docId) {
        state.history.push(current);
        if (state.history.length > 20) state.history.shift();
    }
};

window.navigateBack = function() {
    if (state.history && state.history.length > 0) {
        const prev = state.history.pop();
        state.view = prev.view;
        state.category = prev.category;
        state.subfolder = prev.subfolder;
        state.search = '';
        state.statusFilter = 'all';

        if (prev.docId) {
            const doc = documents.find(d => d.id === prev.docId);
            if (doc) {
                state.editingDoc = { ...doc };
                state.editorTags = [...doc.tags];
            } else {
                state.editingDoc = null;
            }
        } else {
            state.editingDoc = null;
        }
        if (state.view === 'viewer' && state.editingDoc?.id) {
            history.replaceState({}, '', '?view=' + state.editingDoc.id);
        } else {
            history.replaceState({}, '', location.pathname);
        }
        render();
    } else {
        if (state.view === 'editor' || state.view === 'viewer') {
            navigate('documents', state.category);
        } else {
            navigate('dashboard');
        }
    }
};

window.navigate = function(view, cat, subfolder) {
    subfolder = subfolder || '';
    if (state.view === 'editor') syncEditorState();
    pushHistory();
    state.view = view;
    if (cat !== undefined) state.category = cat;
    if (view === 'favorites' || view === 'trash' || view === 'search') state.category = 'all';
    state.subfolder = subfolder;
    state.search = '';
    state.statusFilter = 'all';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    if (state.sidebarOpen) toggleSidebar();
    history.replaceState({}, '', location.pathname);
    render();
};

// ========================
// BATCH OPERATIONS
// ========================
window.toggleBatchMode = function() {
    state.batchMode = !state.batchMode;
    if (!state.batchMode) {
        state.selectedIds = new Set();
        state.lastSelectedId = null;
    }
    renderContent();
};

window.toggleSelectDoc = function(id, event) {
    if (!state.batchMode) {
        state.batchMode = true;
        state.selectedIds = new Set([id]);
        state.lastSelectedId = id;
        renderContent();
        return;
    }
    if (event && event.shiftKey && state.lastSelectedId && state.lastSelectedId !== id) {
        const docs = getFiltered();
        const ids = docs.map(d => d.id);
        const a = ids.indexOf(state.lastSelectedId);
        const b = ids.indexOf(id);
        if (a !== -1 && b !== -1) {
            const [from, to] = a < b ? [a, b] : [b, a];
            for (let i = from; i <= to; i++) state.selectedIds.add(ids[i]);
        }
    } else {
        if (state.selectedIds.has(id)) state.selectedIds.delete(id);
        else state.selectedIds.add(id);
        state.lastSelectedId = id;
    }
    renderContent();
};

window.selectAllDocs = function() {
    const docs = getFiltered();
    const allSelected = docs.every(d => state.selectedIds.has(d.id));
    if (allSelected) {
        state.selectedIds = new Set();
    } else {
        docs.forEach(d => state.selectedIds.add(d.id));
    }
    renderContent();
};

window.batchDelete = function() {
    const n = state.selectedIds.size;
    if (!n) return;
    showModal(`
        <div class="p-6 text-center">
            <i class="fa-solid fa-trash text-3xl mb-4" style="color:#f87171;"></i>
            <h3 class="font-heading font-bold text-lg mb-2">Delete ${n} document${n > 1 ? 's' : ''}?</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">They will be moved to trash and can be restored later.</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-d" data-onclick="confirmBatchDelete()">Delete ${n}</button>
            </div>
        </div>
    `);
};

window.confirmBatchDelete = async function() {
    const ids = [...state.selectedIds];
    ids.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc) { doc.status = 'deleted'; doc.deletedAt = Date.now(); doc.updatedAt = Date.now(); }
    });
    await persist();
    closeModal();
    const n = ids.length;
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    toast(`${n} document${n > 1 ? 's' : ''} moved to trash`, 'success');
    renderContent();
};

window.showBatchTagModal = function() {
    const n = state.selectedIds.size;
    if (!n) return;
    showModal(`
        <div class="p-6">
            <h3 class="font-heading font-bold text-lg mb-1">Add tag</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Will be added to ${n} selected document${n > 1 ? 's' : ''}.</p>
            <input type="text" id="batch-tag-input" class="form-input w-full mb-5" placeholder="Tag name..." autocomplete="off">
            <div class="flex gap-3 justify-end">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-p" data-onclick="confirmBatchAddTag()">Add tag</button>
            </div>
        </div>
    `);
    setTimeout(() => document.getElementById('batch-tag-input')?.focus(), 50);
};

window.confirmBatchAddTag = async function() {
    const tag = document.getElementById('batch-tag-input')?.value?.trim();
    if (!tag) return;
    let changed = 0;
    state.selectedIds.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc && !doc.tags.includes(tag)) { doc.tags.push(tag); doc.updatedAt = Date.now(); changed++; }
    });
    if (changed > 0) await persist();
    closeModal();
    toast(`Tag "${tag}" added to ${changed} document${changed !== 1 ? 's' : ''}`, 'success');
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    renderContent();
};

window.showBatchFolderModal = function() {
    const n = state.selectedIds.size;
    if (!n) return;
    const folders = [...new Set(documents.filter(d => d.subfolder && d.status !== 'deleted').map(d => d.subfolder))].sort();
    showModal(`
        <div class="p-6">
            <h3 class="font-heading font-bold text-lg mb-1">Move to folder</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">${n} document${n > 1 ? 's' : ''} will be moved. Leave blank to clear folder.</p>
            <input type="text" id="batch-folder-input" class="form-input w-full mb-2" placeholder="Folder name..." autocomplete="off" list="batch-folder-list">
            <datalist id="batch-folder-list">${folders.map(f => `<option value="${escHtml(f)}">`).join('')}</datalist>
            <div class="flex gap-3 justify-end mt-5">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-p" data-onclick="confirmBatchMoveFolder()">Move</button>
            </div>
        </div>
    `);
    setTimeout(() => document.getElementById('batch-folder-input')?.focus(), 50);
};

window.confirmBatchMoveFolder = async function() {
    const folder = document.getElementById('batch-folder-input')?.value?.trim() || '';
    state.selectedIds.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc) { doc.subfolder = folder; doc.updatedAt = Date.now(); }
    });
    await persist();
    closeModal();
    const n = state.selectedIds.size;
    toast(`${n} document${n > 1 ? 's' : ''} moved to ${folder || 'no folder'}`, 'success');
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    renderContent();
};

// ========================
// HISTORY PANEL + DIFF VIEW
// ========================
function _diffLines(oldText, newText) {
    const a = (oldText || '').split('\n');
    const b = (newText || '').split('\n');
    const m = a.length, n = b.length;
    if (m * n > 300000) {
        return a.map(l => ({ type: 'del', line: l })).concat(b.map(l => ({ type: 'add', line: l })));
    }
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
    const result = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && a[i-1] === b[j-1]) { result.unshift({ type: 'eq', line: a[i-1] }); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) { result.unshift({ type: 'add', line: b[j-1] }); j--; }
        else { result.unshift({ type: 'del', line: a[i-1] }); i--; }
    }
    return result;
}

function _buildDiffHtml(diff) {
    const CTX = 3;
    const near = new Array(diff.length).fill(false);
    diff.forEach((d, i) => {
        if (d.type !== 'eq') for (let k = Math.max(0, i - CTX); k <= Math.min(diff.length - 1, i + CTX); k++) near[k] = true;
    });
    let html = '', skip = 0;
    for (let i = 0; i <= diff.length; i++) {
        const d = diff[i];
        const collapse = !d || (d.type === 'eq' && !near[i]);
        if (collapse) { if (i < diff.length) { skip++; } }
        if (!collapse || i === diff.length) {
            if (skip) { html += `<div class="diff-skip">··· ${skip} line${skip > 1 ? 's' : ''} unchanged ···</div>`; skip = 0; }
            if (i === diff.length) break;
            const s = escHtml(d.line || '') || '&nbsp;';
            if (d.type === 'add') html += `<div class="diff-add"><span class="diff-sign">+</span><span>${s}</span></div>`;
            else if (d.type === 'del') html += `<div class="diff-del"><span class="diff-sign">−</span><span>${s}</span></div>`;
            else html += `<div class="diff-ctx"><span class="diff-sign"> </span><span>${s}</span></div>`;
        }
    }
    return html || `<div class="diff-ctx"><span class="diff-sign"> </span><span style="color:var(--tx-d);font-style:italic;">(empty)</span></div>`;
}

window.showSnapshotDiff = function(id, snapIndex) {
    const snaps = DocHistory.get(id);
    const snap = snaps[snapIndex];
    if (!snap) return;
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    const titleChanged = snap.title !== doc.title;
    const contentChanged = (snap.content || '') !== (doc.content || '');
    if (!titleChanged && !contentChanged) { toast('No changes since this snapshot.', 'info'); return; }

    const diff = _diffLines(snap.content || '', doc.content || '');
    const added = diff.filter(d => d.type === 'add').length;
    const removed = diff.filter(d => d.type === 'del').length;
    const snapDate = new Date(snap.ts).toLocaleString();

    const titleBlock = titleChanged ? `
        <div style="padding:8px 0 0;border-bottom:1px solid var(--brd);flex-shrink:0;">
            <div style="font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-d);padding:0 14px 6px;">Title</div>
            <div class="diff-del" style="padding-left:14px;"><span class="diff-sign">−</span><span style="font-weight:600;">${escHtml(snap.title)}</span></div>
            <div class="diff-add" style="padding-left:14px;"><span class="diff-sign">+</span><span style="font-weight:600;">${escHtml(doc.title)}</span></div>
        </div>` : '';

    const m = document.getElementById('modal');
    m.className = 'fixed inset-0 z-[90] flex items-center justify-center modal-bg';
    m.innerHTML = `<div class="fade-up rounded-xl w-full mx-4" style="background:var(--bg2);border:1px solid var(--brd);max-height:90vh;overflow:hidden;display:flex;flex-direction:column;max-width:780px;">
        <div style="padding:14px 18px;border-bottom:1px solid var(--brd);display:flex;align-items:center;gap:12px;flex-shrink:0;">
            <div style="width:32px;height:32px;border-radius:8px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <i class="fa-solid fa-code-compare" style="color:#818cf8;font-size:13px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;color:var(--tx);">Snapshot Diff</div>
                <div style="font-size:11px;color:var(--tx-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${snapDate} → Current</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <span style="font-size:11px;background:rgba(16,185,129,.1);color:var(--acc);border:1px solid rgba(16,185,129,.2);padding:2px 8px;border-radius:99px;font-variant-numeric:tabular-nums;">+${added}</span>
                <span style="font-size:11px;background:rgba(239,68,68,.1);color:#f87171;border:1px solid rgba(239,68,68,.2);padding:2px 8px;border-radius:99px;font-variant-numeric:tabular-nums;">−${removed}</span>
                <button class="btn-s text-xs py-1.5 px-3" data-onclick="restoreSnapshot('${id}', ${snapIndex})"><i class="fa-solid fa-rotate-left mr-1"></i>Restore</button>
                <button class="btn-s text-xs py-1.5 px-3" data-onclick="closeModal()">Close</button>
            </div>
        </div>
        ${titleBlock}
        <div style="font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--tx-d);padding:10px 14px 6px;flex-shrink:0;">Content</div>
        <div style="flex:1;overflow-y:auto;"><div class="diff-view">${_buildDiffHtml(diff)}</div></div>
    </div>`;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
};

window.showHistoryPanel = function(id) {
    const snaps = DocHistory.get(id);
    if (!snaps.length) {
        toast('No history yet — snapshots are saved each time you update a document.', 'info');
        return;
    }
    const rows = snaps.map((s, i) => `
        <div class="flex items-start gap-3 p-3 rounded-lg" style="border:1px solid var(--brd);background:var(--bg2);margin-bottom:8px;">
            <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate" style="color:var(--tx);">${escHtml(s.title)}</div>
                <div class="text-xs mt-1" style="color:var(--tx-d);">${new Date(s.ts).toLocaleString()} &middot; ${(s.content||'').length.toLocaleString()} chars</div>
                <span class="st-badge st-${s.status}" style="display:inline-block;margin-top:4px;">${s.status}</span>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="btn-s text-xs py-1.5 px-3" data-onclick="showSnapshotDiff('${id}', ${i})">
                    <i class="fa-solid fa-code-compare mr-1"></i>Diff
                </button>
                <button class="btn-s text-xs py-1.5 px-3" data-onclick="restoreSnapshot('${id}', ${i})">
                    <i class="fa-solid fa-rotate-left mr-1"></i>Restore
                </button>
            </div>
        </div>
    `).join('');
    showModal(`
        <div class="p-5">
            <div class="flex items-center gap-3 mb-5">
                <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);">
                    <i class="fa-regular fa-clock" style="color:#818cf8;font-size:15px;"></i>
                </div>
                <div>
                    <h3 class="font-heading font-semibold" style="color:var(--tx);">Document History</h3>
                    <p class="text-xs" style="color:var(--tx-m);">${snaps.length} snapshot${snaps.length > 1 ? 's' : ''} &middot; newest first &middot; max 10</p>
                </div>
            </div>
            <div style="max-height:380px;overflow-y:auto;padding-right:2px;">${rows}</div>
            <div class="flex justify-end mt-4">
                <button class="btn-s" data-onclick="closeModal()">Close</button>
            </div>
        </div>
    `);
};

window.restoreSnapshot = async function(id, index) {
    const snaps = DocHistory.get(id);
    const snap = snaps[index];
    if (!snap) return;
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    DocHistory.save(documents[idx]);
    documents[idx] = { ...documents[idx], title: snap.title, content: snap.content, tags: snap.tags || [], status: snap.status, subfolder: snap.subfolder || '', updatedAt: Date.now() };
    state.editingDoc = { ...documents[idx] };
    closeModal();
    toast('Version restored — current state saved to history.', 'success');
    await persist();
    render();
};

// ========================
// SHARE DOCUMENT
// ========================
window.shareDoc = async function(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) {
        toast('Configure GitHub in Settings to share documents.', 'warning');
        return;
    }

    showModal(`
        <div class="text-center py-6">
            <i class="fa-solid fa-spinner fa-spin text-2xl mb-4" style="color:var(--acc)"></i>
            <p class="text-sm" style="color:var(--tx-m)">Generating secure link...</p>
        </div>
    `);

    try {
        const keyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyBase64 = uint8ToBase64(keyBytes);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
        const allLinkedIds = doc.category === 'release'
            ? [...(doc.releaseData?.linkedRuns || []), ...(doc.releaseData?.linkedBugs || []), ...(doc.releaseData?.linkedEnvs || [])]
            : doc.category === 'testplan'
            ? [...(doc.tcPlanData?.linkedTCs || []), ...(doc.tcPlanData?.linkedRuns || [])]
            : [];
        const linkedDocs = doc.category === 'testrun' && doc.runData?.targetIds?.length
            ? documents.filter(d => doc.runData.targetIds.includes(d.id) && d.status !== 'deleted')
                  .map(d => ({ id: d.id, title: d.title, category: d.category, tcData: d.tcData, content: d.content, tags: d.tags || [] }))
            : doc.category === 'environment' && doc.envData?.linkedCreds?.length
            ? documents.filter(d => doc.envData.linkedCreds.includes(d.id) && d.status !== 'deleted')
                  .map(d => ({ id: d.id, title: d.title, category: d.category, username: d.username, status: d.status, tags: d.tags || [], createdAt: d.createdAt, updatedAt: d.updatedAt, favorite: false }))
            : (doc.category === 'release' || doc.category === 'testplan') && allLinkedIds.length
            ? documents.filter(d => allLinkedIds.includes(d.id) && d.status !== 'deleted')
                  .map(d => ({ id: d.id, title: d.title, category: d.category, status: d.status, tags: d.tags || [], createdAt: d.createdAt, updatedAt: d.updatedAt, favorite: false, runData: d.runData, bugData: d.bugData, envData: d.envData, tcData: d.tcData }))
            : [];
        const plain = new TextEncoder().encode(JSON.stringify({
            title: doc.title, category: doc.category, content: doc.content,
            tags: doc.tags, createdAt: doc.createdAt, status: doc.status, subfolder: doc.subfolder,
            username: doc.username, password: doc.password,
            envData: doc.envData,
            runData: doc.runData,
            releaseData: doc.releaseData,
            tcData: doc.tcData, bugData: doc.bugData, apiData: doc.apiData,
            tcPlanData: doc.tcPlanData,
            _linkedDocs: linkedDocs.length ? linkedDocs : undefined,
        }));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rawKey, plain);

        const packed = new Uint8Array(12 + cipher.byteLength);
        packed.set(iv);
        packed.set(new Uint8Array(cipher), 12);
        const encContent = uint8ToBase64(packed);

        const shareId = `sh_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        const res = await fetch(
            `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/shared/${shareId}.enc`,
            {
                method: 'PUT',
                headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Share: ${doc.title}`, content: btoa(unescape(encodeURIComponent(encContent))), branch: settings.branch || 'main' })
            }
        );
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

        const shareUrl = `${location.origin}${location.pathname}?shareId=${shareId}#key=${encodeURIComponent(keyBase64)}`;

        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.1);">
                    <i class="fa-solid fa-check text-emerald-400 text-xl"></i>
                </div>
                <h3 class="font-heading font-semibold text-lg mb-2">Link Ready!</h3>
                <p class="text-sm mb-4" style="color:var(--tx-m);">Anyone with this link can view the document. The content is end-to-end encrypted.</p>
                <div class="flex items-center gap-2 p-3 rounded-lg border mb-5 text-left" style="background:var(--bg);border-color:var(--brd);">
                    <input type="text" readonly id="share-url-input" value="${escHtml(shareUrl)}" class="flex-1 bg-transparent text-xs outline-none font-mono" style="color:var(--tx);">
                    <button class="shrink-0 btn-s px-3 py-1.5 text-xs" onclick="window._shareCopyFeedback(this,document.getElementById('share-url-input').value)">
                        <i class="fa-regular fa-copy mr-1"></i>Copy
                    </button>
                </div>
                <button class="btn-s px-4" data-onclick="closeModal()">Close</button>
            </div>
        `);
    } catch(e) {
        console.error('[shareDoc]', e);
        toast('Failed to create share link: ' + e.message, 'error');
        closeModal();
    }
};

async function loadSharedDoc(shareId, keyBase64) {
    try {
        const d = GitHubSync.DEFAULTS;
        const rawUrl = `https://raw.githubusercontent.com/${d.owner}/${d.repo}/${d.branch}/shared/${shareId}.enc`;
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error('Document not found or link has expired.');

        const fileText = await res.text();
        const encContent = fileText.trim();
        const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));

        const packed = Uint8Array.from(atob(encContent), c => c.charCodeAt(0));
        const iv = packed.slice(0, 12);
        const cipher = packed.slice(12);

        const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, rawKey, cipher);
        const doc = JSON.parse(new TextDecoder().decode(plain));
        const embeddedLinkedDocs = doc._linkedDocs || [];
        delete doc._linkedDocs;

        const mainDoc = { ...doc, id: shareId, status: doc.status || 'published', favorite: false, updatedAt: doc.createdAt || Date.now(), tags: doc.tags || [] };
        documents = [mainDoc, ...embeddedLinkedDocs];
        state.view = 'viewer';
        state.sharedView = true;
        state.editingDoc = documents[0];
        document.getElementById('sidebar').style.display = 'none';
        const sbBtn = document.querySelector('button[data-onclick="toggleSidebar()"]');
        if (sbBtn) sbBtn.style.display = 'none';
        render();
    } catch(e) {
        console.error('[loadSharedDoc]', e);
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen" style="background:var(--bg)"><div class="p-10 text-center max-w-sm"><div class="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style="background:rgba(244,63,94,0.1);"><i class="fa-solid fa-link-slash text-rose-400 text-2xl"></i></div><h1 class="font-heading text-xl font-bold mb-3" style="color:var(--tx)">Link Invalid or Expired</h1><p class="text-sm mb-6" style="color:var(--tx-m)">${escHtml(e.message)}</p><button class="btn-p" onclick="window.location.href=window.location.pathname">Go to DocVault</button></div></div>`;
    }
}

// ========================
// IMAGE COMPRESSION + INLINE BASE64
// ========================
async function compressImage(blob, maxPx, quality) {
    // PNG with transparency stays PNG; everything else becomes JPEG
    const keepPng = blob.type === 'image/png';
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : quality);
}

async function uploadImageToCloud(blob, callback) {
    try {
        const dataUrl = await compressImage(blob, 1200, 0.80);
        callback(dataUrl, blob.name || 'image');
    } catch(err) {
        toast(t('imgProcessFail'), 'error');
    }
}

async function _migrateDocImages(doc) {
    if (!doc?.content) return;
    const CDN_RE = /https:\/\/raw\.githubusercontent\.com\/dustin-nkd\/docvault-assets\/[^\s)"]+/g;
    const urls = [...new Set(doc.content.match(CDN_RE) || [])];
    if (urls.length === 0) return;

    const settings = await GitHubSync.getSettings();
    if (!settings?.token) return;

    let content = doc.content;
    let changed = false;

    for (const url of urls) {
        try {
            const pathMatch = url.match(/\/docvault-assets\/[^/]+\/(.+)$/);
            if (!pathMatch) continue;
            const filePath = pathMatch[1];
            const apiUrl = `https://api.github.com/repos/dustin-nkd/docvault-assets/contents/${filePath}`;
            const res = await fetch(apiUrl, {
                headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json' }
            });
            if (!res.ok) continue;
            const data = await res.json();
            const rawBase64 = data.content.replace(/\n/g, '');
            const ext = filePath.split('.').pop().toLowerCase();
            const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
            const mime = mimeMap[ext] || 'image/jpeg';
            const binaryStr = atob(rawBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            const compressed = await compressImage(blob, 1200, 0.80);
            content = content.split(url).join(compressed);
            changed = true;
        } catch(e) {
            console.warn('[migrate-img] failed for', url, e.message);
        }
    }

    if (changed) {
        const idx = documents.findIndex(d => d.id === doc.id);
        if (idx !== -1) {
            documents[idx].content = content;
            state.editingDoc = { ...documents[idx] };
            await persist();
            render();
            toast('Images migrated to inline storage', 'info');
        }
    }
}

// ========================
// GITHUB SETTINGS MODAL
// ========================
window.showGitHubSettingsModal = async function() {
    let ghSettings = { owner: '', repo: '', branch: 'main', token: '' };
    const storedGh = await GitHubSync.getSettings();
    if (storedGh) {
        ghSettings = { ...ghSettings, ...storedGh };
    }
    const currentHint = window.LocalAuth ? window.LocalAuth.getHint() : '';
    const hasRecovery = !!localStorage.getItem(window.LocalAuth ? window.LocalAuth.RECOVERY_KEY : 'docvault_recovery_blob');

    showModal(`
        <div>
            <h3 class="font-heading font-bold text-lg mb-4 flex items-center gap-2" style="color:var(--tx);"><i class="fa-solid fa-sliders text-[var(--acc)]"></i> DocVault Settings</h3>

            <!-- SECTION 1: MASTER PASSWORD -->
            <div class="mb-5 pb-5 border-b border-[var(--brd)] text-left">
                <h4 class="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style="color:var(--tx-m);"><i class="fa-solid fa-lock text-[var(--acc)] text-[10px]"></i> 1. Master Password</h4>
                <form onsubmit="event.preventDefault(); changeMasterPassword();" class="flex flex-col gap-3">
                    <div>
                        <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Current Password</label>
                        <input type="password" id="mp-current" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">New Password</label>
                        <input type="password" id="mp-new" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
                    </div>
                    <div>
                        <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Confirm New Password</label>
                        <input type="password" id="mp-confirm" class="form-input w-full py-1.5 px-3 text-xs" placeholder="••••••••">
                    </div>
                    <button type="submit" class="btn-p py-1.5 px-4 text-xs w-full flex items-center justify-center gap-1.5">
                        <i class="fa-solid fa-key text-[10px]"></i> Change Master Password
                    </button>
                </form>
            </div>

            <!-- SECTION 2: SECURITY -->
            <div class="mb-5 pb-5 border-b border-[var(--brd)] text-left">
                <h4 class="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5" style="color:var(--tx-m);"><i class="fa-solid fa-shield-halved text-[var(--acc)] text-[10px]"></i> 2. Security</h4>
                <div class="mb-4">
                    <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m);">Password Hint <span class="font-normal" style="color:var(--tx-d);">(stored unencrypted)</span></label>
                    <div class="flex gap-2">
                        <input type="text" id="sec-hint" class="form-input flex-1 py-1.5 px-3 text-xs" placeholder="e.g. Pet name + year" maxlength="80" value="${escHtml(currentHint)}">
                        <button type="button" class="btn-s py-1.5 px-3 text-xs whitespace-nowrap" data-onclick="savePasswordHint()">Save</button>
                    </div>
                    <p class="text-[10px] mt-1" style="color:var(--tx-d);">Shown on lock screen as a reminder. Never include your actual password.</p>
                </div>
                <div>
                    <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m);">Recovery Key</label>
                    <p class="text-[11px] mb-2" style="color:${hasRecovery ? 'var(--acc)' : '#f59e0b'};">
                        <i class="fa-solid fa-${hasRecovery ? 'circle-check' : 'triangle-exclamation'} mr-1"></i>${hasRecovery ? 'Recovery key is active.' : 'No key set — forgotten password means lost data.'}
                    </p>
                    <button type="button" id="sec-gen-recovery-btn" class="btn-s py-1.5 px-4 text-xs flex items-center gap-1.5" data-onclick="generateRecoveryKey()">
                        <i class="fa-solid fa-key text-[10px]"></i> ${hasRecovery ? 'Regenerate Key' : 'Generate Recovery Key'}
                    </button>
                    <p class="text-[10px] mt-1.5" style="color:var(--tx-d);">20-character code that can unlock your vault if you forget your password. Store it offline.</p>
                </div>
            </div>

            <!-- SECTION 3: GITHUB SYNC -->
            <div class="text-left">
                <h4 class="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5" style="color:var(--tx-m);"><i class="fa-solid fa-rotate text-[var(--acc)] text-[10px]"></i> 3. GitHub Sync</h4>
                <div class="bg-[var(--bg)] border border-[var(--brd)] rounded-lg px-3 py-2 mb-3 text-[11px]" style="color:var(--tx-d)">
                    <i class="fa-solid fa-circle-info mr-1 text-[var(--acc)]"></i>
                    Syncing to <strong style="color:var(--tx)">dustin-nkd/docvault-assets</strong>. Only the token is needed — repo is fixed.
                </div>
                <form onsubmit="event.preventDefault(); saveGitHubSettings();" class="flex flex-col gap-3">
                    <div>
                        <label class="block text-[11px] font-bold mb-1" style="color:var(--tx-m)">Personal Access Token (PAT)</label>
                        <input type="password" id="gh-token" class="form-input w-full py-1.5 px-3 text-xs" placeholder="github_pat_..." value="${escHtml(ghSettings.token || '')}">
                        <p class="text-[10px] mt-1" style="color:var(--tx-d)">Token requires <strong>Contents: Read & Write</strong> permission on the repo.</p>
                    </div>
                    <div class="pt-3 mt-2 border-t border-[var(--brd)] flex gap-2 justify-end">
                        <button type="button" class="btn-s py-1.5 px-4 text-xs" data-onclick="closeModal()">Close</button>
                        <button type="submit" class="btn-p py-1.5 px-4 text-xs flex items-center justify-center gap-1.5">
                            <i class="fa-solid fa-save text-[10px]"></i> Save Token
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `);
};

window.saveGitHubSettings = async function() {
    const token = document.getElementById('gh-token').value.trim();
    const d = GitHubSync.DEFAULTS;
    if (token) {
        await GitHubSync.saveSettings({ ...d, token });
        toast(t('ghSaveSuccess'), "success");
        closeModal();
    } else {
        GitHubSync.clearSettings();
        toast(t('ghCleared'), "info");
        closeModal();
    }
};

window.changeMasterPassword = async function() {
    const current = document.getElementById('mp-current').value;
    const newPwd = document.getElementById('mp-new').value;
    const confirm = document.getElementById('mp-confirm').value;

    if (!current || !newPwd || !confirm) {
        toast(t('mpFillAll'), "warning");
        return;
    }
    if (newPwd !== confirm) {
        toast(t('mpMismatch'), "error");
        return;
    }
    if (newPwd.length < 4) {
        toast(t('mpTooShort'), "warning");
        return;
    }

    try {
        await window.LocalAuth.changePassword(current, newPwd);
        // Sync the re-encrypted vault (and the now-revoked recovery blob, rb:null) to
        // GitHub immediately. Otherwise other devices still need the OLD password until
        // the next document save, and the stale recovery blob lingers remotely.
        if (await window.GitHubSync.isConfigured()) {
            try {
                await window.GitHubSync.push(documents, true, { securityMeta: window.GitHubSync._getLocalSecurityMeta() });
            } catch (e) {
                toast('Password changed locally, but GitHub sync failed: ' + e.message, "error");
            }
        }
        toast(t('mpChanged'), "success");
        toast('Recovery key was revoked — generate a new one in the Security section.', "info");
        if (window.updateLockSecurityState) window.updateLockSecurityState();
        document.getElementById('mp-current').value = '';
        document.getElementById('mp-new').value = '';
        document.getElementById('mp-confirm').value = '';
    } catch (e) {
        toast(e.message || t('mpChangeFail'), "error");
    }
};

window.savePasswordHint = async function() {
    const input = document.getElementById('sec-hint');
    if (!input) return;
    const text = input.value.trim();
    window.LocalAuth.setHint(text);
    if (window.updateLockSecurityState) window.updateLockSecurityState();
    if (await window.GitHubSync.isConfigured()) {
        window.GitHubSync.push(documents, true, { securityMeta: window.GitHubSync._getLocalSecurityMeta() }).catch(e => {
            toast('Password hint saved locally, but sync failed: ' + e.message, 'error');
        });
    }
    toast(text ? 'Password hint saved.' : 'Password hint cleared.', 'success');
};

window.generateRecoveryKey = async function() {
    const pwd = sessionStorage.getItem(window.LocalAuth.SESSION_PWD);
    if (!pwd) { toast('Vault must be unlocked to generate a recovery key.', 'warning'); return; }
    const btn = document.getElementById('sec-gen-recovery-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-[10px]"></i> Generating…'; }
    try {
        const code = await window.LocalAuth.generateRecovery(pwd);
        // Push immediately so the blob is available cross-device without waiting for the next doc save
        if (await window.GitHubSync.isConfigured()) {
            window.GitHubSync.push(documents, true, { securityMeta: window.GitHubSync._getLocalSecurityMeta() }).catch(() => {});
        }
        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-xl mx-auto flex items-center justify-center mb-4" style="background:rgba(16,185,129,0.15);">
                    <i class="fa-solid fa-key text-xl" style="color:var(--acc);"></i>
                </div>
                <h3 class="font-bold text-base mb-1" style="color:var(--tx);">Recovery Key Generated</h3>
                <p class="text-xs mb-5" style="color:var(--tx-m);">Save this key somewhere safe. You will <strong>not</strong> see it again.</p>
                <div class="rounded-xl px-4 py-4 mb-4 cursor-pointer select-all" style="background:var(--bg);border:2px solid var(--acc);font-family:monospace;font-size:17px;font-weight:700;letter-spacing:0.14em;color:var(--acc);" title="Click to select all">${escHtml(code)}</div>
                <div class="rounded-lg px-3 py-2 mb-5 text-left text-[11px]" style="background:var(--card);border:1px solid var(--brd);">
                    <i class="fa-solid fa-triangle-exclamation text-amber-400 mr-1"></i>
                    <strong style="color:var(--tx-m);">Store this offline</strong><span style="color:var(--tx-d);"> — in a password manager, printed paper, or secure notes app. This is the only copy.</span>
                </div>
                <button class="btn-p py-2 px-6 text-sm w-full" data-onclick="closeModal()">I've saved it — Close</button>
            </div>
        `);
    } catch(e) {
        toast(e.message || 'Failed to generate recovery key.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key text-[10px]"></i> Generate Recovery Key'; }
    }
};

window.recoverVault = async function() {
    const input = document.getElementById('recovery-code-input');
    if (!input) return;
    const code = input.value.trim();
    if (!code) { toast('Enter your recovery code.', 'warning'); return; }
    const btn = document.getElementById('recover-submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Recovering…'; }
    try {
        const password = await window.LocalAuth.recoverWithCode(code);
        // Guard against a stale recovery blob (e.g. one generated before the master
        // password was changed): the recovered password must match the CURRENT vault
        // hash, otherwise unlocking would decrypt nothing and look like data loss.
        const storedHash = localStorage.getItem(window.LocalAuth.HASH_KEY);
        if (storedHash) {
            const recoveredHash = await window.LocalAuth._hash(password);
            if (recoveredHash !== storedHash) {
                throw new Error('This recovery key is outdated — the master password was changed after it was created. Use the current password, or reset the vault.');
            }
        }
        sessionStorage.setItem(window.LocalAuth.SESSION_KEY, '1');
        sessionStorage.setItem(window.LocalAuth.SESSION_PWD, password);
        document.getElementById('lock-screen').classList.add('hidden');
        if (window.resetLockFormState) window.resetLockFormState();
        toast('Vault recovered! Consider changing your password in Settings.', 'success');
        if (window._afterUnlock) window._afterUnlock();
    } catch(e) {
        toast(e.message || 'Recovery failed.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Recover Access'; }
    }
};

// ========================
// DOCUMENT CRUD
// ========================
function createDoc(cat) {
    closeModal();
    pushHistory();
    state.view = 'editor';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state._newCat = cat || 'runbook';
    state._newTitle = '';
    state._newSubfolder = '';
    state._newStatus = 'draft';
    state._newBugData = null;
    state._newTcData = null;
    state._newApiData = null;
    state._newRunData = null;
    state._newTcPlanData = null;
    state._newContent = cat && TEMPLATES[cat] ? TEMPLATES[cat] : '# New Document\n\nStart writing here...';
    render();
    setTimeout(() => document.getElementById('ed-title')?.focus(), 100);
}

function editDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'editor';
    state.editingDoc = { ...doc };
    state.editorTags = [...doc.tags];
    state.editorMode = 'edit';
    render();
}

function viewDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'viewer';
    state.editingDoc = { ...doc };
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    history.replaceState({}, '', '?view=' + id);
    render();
    _migrateDocImages(doc);
}

// ========================
// BUG LIFECYCLE ACTIONS
// ========================
window.resolveBug = async function(id, resolution) {
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    document.getElementById('doc-menu')?.remove();
    const doc = documents[idx];
    doc.bugStatus = 'closed';
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.resolution = resolution;
    doc.updatedAt = Date.now();
    await persist();
    renderContent();
    const label = { 'wont-fix': "Won't Fix", duplicate: 'Duplicate', rejected: 'Rejected', deferred: 'Deferred' }[resolution] || resolution;
    toast(`Bug closed: ${label}`, 'info');
};

window.promptDuplicateBug = function(id) {
    document.getElementById('doc-menu')?.remove();
    const ref = prompt('Enter the title or ID of the original bug:');
    if (!ref) return;
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    const doc = documents[idx];
    doc.bugStatus = 'closed';
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.resolution = 'duplicate';
    doc.bugData.duplicateOf = ref.trim();
    doc.updatedAt = Date.now();
    persist().then(() => { renderContent(); toast('Marked as Duplicate', 'info'); });
};

window.reopenBug = async function(id) {
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    document.getElementById('doc-menu')?.remove();
    const doc = documents[idx];
    doc.bugStatus = 'open';
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.reopenCount = (doc.bugData.reopenCount || 0) + 1;
    doc.bugData.resolution = '';
    doc.bugData.duplicateOf = '';
    doc.updatedAt = Date.now();
    await persist();
    renderContent();
    toast('Bug reopened', 'info');
};

window.cancelEdit = function() {
    if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch(e) {} }
    window.tuiEditor = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    pendingImageReplacements.clear();
    navigateBack();
};

async function saveDoc() {
    const title = document.getElementById('ed-title')?.value.trim();
    const subfolder = document.getElementById('ed-subfolder')?.value.trim() || '';
    const cat = document.getElementById('ed-cat')?.value;
    const status = document.getElementById('ed-status')?.value;

    let content = window.tuiEditor ? window.tuiEditor.getMarkdown() : '';
    let finalContent = content;
    let bugData = null;
    let tcData = null;
    let apiData = null;
    let runData = null;
    let envData = null;
    let releaseData = null;
    let tcPlanData = null;

    if (cat === 'bug') {
        const env = document.getElementById('ed-bug-env')?.value || '';
        const browser = document.getElementById('ed-bug-browser')?.value || '';
        const severity = document.getElementById('ed-bug-severity')?.value || 'Minor';
        const precond = document.getElementById('ed-bug-precond')?.value || '';
        const stepInputs = document.querySelectorAll('.bug-step-input');
        const steps = Array.from(stepInputs).map(inp => inp.value.trim()).filter(v => v);
        const assignee = document.getElementById('ed-bug-assignee')?.value || '';
        const expected = document.getElementById('ed-bug-expected')?.value || '';
        const actual = document.getElementById('ed-bug-actual')?.value || '';
        const existing = state.editingDoc?.bugData || {};

        bugData = { env, browser, severity, assignee, precond, steps, expected, actual,
            resolution: existing.resolution || '',
            duplicateOf: existing.duplicateOf || '',
            reopenCount: existing.reopenCount || 0 };

        finalContent = `# ${title}

## ${t('bugEnv')}
- **Environment:** ${env || '-'}
- **Device/Browser:** ${browser || '-'}
- **Severity:** ${severity}

${precond ? `## ${t('bugPrecond')}\n${precond}\n` : ''}
## ${t('bugSteps')}\n${steps.length ? steps.map((s, i) => (i + 1) + '. ' + s).join('\n') : '-'}

## ${t('bugExpected')}
${expected || '-'}

## ${t('bugActual')}
${actual || '-'}`;
    } else if (cat === 'testcases') {
        const module = document.getElementById('ed-tc-module')?.value || '';
        const precond = document.getElementById('ed-tc-precond')?.value || '';
        const testData = document.getElementById('ed-tc-data')?.value || '';
        const stepRows = document.querySelectorAll('.tc-step-row');
        const steps = Array.from(stepRows).map(row => ({
            action: row.querySelector('.tc-step-action')?.value.trim() || '',
            expected: row.querySelector('.tc-step-expected')?.value.trim() || ''
        })).filter(s => s.action || s.expected);

        tcData = { module, precond, data: testData, steps };

        finalContent = `# ${title}

${module ? `**Module:** ${module}` : ''}

${precond ? `## ${t('tcPrecond')}\n${precond}\n` : ''}
${testData ? `## ${t('tcData')}\n${testData}\n` : ''}

## ${t('tcSteps')}
| Step | ${t('tcAction')} | ${t('tcExpected')} |
|---|---|---|
${steps.length ? steps.map((s, i) => `| ${i+1} | ${s.action.replace(/\n/g, '<br>')} | ${s.expected.replace(/\n/g, '<br>')} |`).join('\n') : '| - | - | - |'}
`;
    } else if (cat === 'api') {
        const method = document.getElementById('ed-api-method')?.value || 'GET';
        const endpoint = document.getElementById('ed-api-endpoint')?.value || '';

        const hRows = document.querySelectorAll('.api-header-row');
        const headers = Array.from(hRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);

        const pRows = document.querySelectorAll('.api-param-row');
        const params = Array.from(pRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);

        const body = document.getElementById('ed-api-body')?.value || '';
        const statusCode = document.getElementById('ed-api-status')?.value || '200';
        const response = document.getElementById('ed-api-response')?.value || '';

        apiData = { method, endpoint, headers, params, body, statusCode, response };

        finalContent = `# ${title}

**Method:** \`${method}\` | **Endpoint:** \`${endpoint}\`

${headers.length ? `## ${t('apiHeaders')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${headers.map(h => `| ${h.key || '-'} | ${h.value || '-'} | ${h.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${params.length ? `## ${t('apiParams')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${params.map(p => `| ${p.key || '-'} | ${p.value || '-'} | ${p.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${body ? `## ${t('apiBody')}\n\`\`\`json\n${body}\n\`\`\`\n` : ''}
${response ? `## ${t('apiResponse')} (${statusCode})\n\`\`\`json\n${response}\n\`\`\`\n` : ''}`;
    } else if (cat === 'testrun') {
        const checkboxes = document.querySelectorAll('.testrun-tc-cb:checked');
        const targetIds = Array.from(checkboxes).map(cb => cb.value);
        const existingResults = (state.editingDoc && state.editingDoc.runData && state.editingDoc.runData.results) ? state.editingDoc.runData.results : {};
        runData = { targetIds, results: existingResults };
    } else if (cat === 'testplan') {
        const linkedTCs = Array.from(document.querySelectorAll('.tp-tc-cb:checked')).map(cb => cb.value);
        const linkedRuns = Array.from(document.querySelectorAll('.tp-run-cb:checked')).map(cb => cb.value);
        tcPlanData = { linkedTCs, linkedRuns };
    } else if (cat === 'release') {
        const version = document.getElementById('ed-rel-version')?.value || '';
        const releaseDate = document.getElementById('ed-rel-date')?.value || '';
        const relStatus = document.getElementById('ed-rel-status')?.value || 'planning';
        const linkedRuns = Array.from(document.querySelectorAll('.ed-rel-run:checked')).map(cb => cb.value);
        const linkedBugs = Array.from(document.querySelectorAll('.ed-rel-bug:checked')).map(cb => cb.value);
        const linkedEnvs = Array.from(document.querySelectorAll('.ed-rel-env:checked')).map(cb => cb.value);
        releaseData = { version, releaseDate, status: relStatus, linkedRuns, linkedBugs, linkedEnvs };
    } else if (cat === 'environment') {
        const envStatus = document.getElementById('ed-env-status')?.value || 'healthy';
        const propRows = document.querySelectorAll('.env-prop-row');
        const properties = Array.from(propRows).map(row => ({
            label: row.querySelector('.env-prop-label')?.value.trim() || '',
            value: row.querySelector('.env-prop-value')?.value.trim() || '',
            secret: row.querySelector('.env-prop-secret')?.checked || false
        })).filter(p => p.label || p.value);
        const linkedCreds = Array.from(document.querySelectorAll('.ed-env-cred:checked')).map(cb => cb.value);
        const notes = document.getElementById('ed-env-notes')?.value || '';

        envData = { status: envStatus, properties, linkedCreds, notes };
        finalContent = `# Environment Notes\n${notes}`;
    }

    const tags = [...state.editorTags];
    const username = document.getElementById('ed-username')?.value || '';
    const password = document.getElementById('ed-password')?.value || '';

    if (!title) { toast(t('titleRequired'), 'error'); document.getElementById('ed-title')?.focus(); return; }

    const editingIdx = (state.editingDoc && state.editingDoc.id)
        ? documents.findIndex(d => d.id === state.editingDoc.id)
        : -1;

    if (editingIdx !== -1) {
        const idx = editingIdx;
        DocHistory.save(documents[idx]);
        documents[idx] = { ...documents[idx], title, category: cat, subfolder, status, content: finalContent, tags, username, password, bugData: bugData !== null ? bugData : documents[idx].bugData, tcData: tcData !== null ? tcData : documents[idx].tcData, apiData: apiData !== null ? apiData : documents[idx].apiData, runData: runData !== null ? runData : documents[idx].runData, envData: envData !== null ? envData : documents[idx].envData, releaseData: releaseData !== null ? releaseData : documents[idx].releaseData, tcPlanData: tcPlanData !== null ? tcPlanData : documents[idx].tcPlanData, updatedAt: Date.now() };
        toast(t('docUpdated'), 'success');
        state.editingDoc = { ...documents[idx] };
        state.view = 'viewer';
    } else if (state.editingDoc && state.editingDoc.id) {
        // The document being edited vanished (deleted on another device / concurrent
        // sync). Save the edits as a fresh document instead of dereferencing
        // documents[-1] (which previously produced a broken "?view=undefined" viewer).
        const revived = { id: uid(), title, category: cat, subfolder, status, content: finalContent, tags, username, password, bugData, tcData, apiData, runData, envData, releaseData, tcPlanData, kanbanStatus: cat === 'task' ? (state.editingDoc.kanbanStatus || 'todo') : undefined, bugStatus: cat === 'bug' ? (state.editingDoc.bugStatus || 'new') : undefined, favorite: false, createdAt: Date.now(), updatedAt: Date.now() };
        documents.unshift(revived);
        toast('Original document was removed elsewhere — saved as a new copy.', 'info');
        state.editingDoc = { ...revived };
        state.view = 'viewer';
        state.category = cat;
    } else {
        const newDoc = { id: uid(), title, category: cat, subfolder, status, content: finalContent, tags, username, password, bugData, tcData, apiData, runData, envData, releaseData, tcPlanData, kanbanStatus: cat === 'task' ? 'todo' : undefined, bugStatus: cat === 'bug' ? 'new' : undefined, favorite: false, createdAt: Date.now(), updatedAt: Date.now() };
        documents.unshift(newDoc);
        toast(t('docCreated'), 'success');
        state.editingDoc = { ...newDoc };
        state.view = 'viewer';
        state.category = cat;
    }
    if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch(e) {} }
    if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
    window.currentViewerDocId = null;
    window.tuiEditor = null;
    history.replaceState({}, '', '?view=' + state.editingDoc.id);
    await persist();
    await new Promise(r => setTimeout(() => requestAnimationFrame(r), 60));
    render();
}

async function toggleFav(id) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.favorite = !doc.favorite;
        await persist();
        render();
    }
}

async function duplicateDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const dup = { ...doc, id: uid(), title: doc.title + ' (Copy)', favorite: false, createdAt: Date.now(), updatedAt: Date.now(), tags: [...doc.tags] };
    documents.unshift(dup);
    await persist();
    toast(t('docDuplicated'), 'success');
    render();
}
