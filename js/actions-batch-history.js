// ========================
// NAVIGATION HISTORY
// ========================
// Builds the address-bar query string, preserving guest=1 in demo mode. Without
// this, any navigation (viewDoc/saveDoc/navigate/navigateBack) calls
// history.replaceState with a URL that drops guest=1, so a guest who opens any
// document and then reloads would fall out of the demo into the real (locked)
// vault. Route every history.replaceState in this file through this helper.
function _appUrl(viewId) {
    const guest = (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) ? 'guest=1' : '';
    if (viewId) return '?view=' + viewId + (guest ? '&' + guest : '');
    return guest ? '?' + guest : location.pathname;
}

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
            history.replaceState({}, '', _appUrl(state.editingDoc.id));
        } else {
            history.replaceState({}, '', _appUrl());
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
    state.docListPage = 1;
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    if (state.sidebarOpen) toggleSidebar();
    history.replaceState({}, '', _appUrl());
    render();
};

// Saved Views and Focus Queue workflow actions are defined in actions-focus.js.

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
    let firstDoc = null;
    ids.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc) { doc.status = 'deleted'; doc.deletedAt = Date.now(); doc.updatedAt = Date.now(); if (!firstDoc) firstDoc = doc; }
    });
    if (firstDoc) ActivityLog.record('trashed', firstDoc, { note: `batch: ${ids.length} document${ids.length > 1 ? 's' : ''}`, batchCount: ids.length });
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
    let firstDoc = null;
    state.selectedIds.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc && !doc.tags.includes(tag)) { doc.tags.push(tag); doc.updatedAt = Date.now(); changed++; if (!firstDoc) firstDoc = doc; }
    });
    if (changed > 0) {
        ActivityLog.record('tagged', firstDoc, { note: `tag "${tag}" added to ${changed} document${changed > 1 ? 's' : ''}`, batchCount: changed });
        await persist();
    }
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
    let firstDoc = null;
    state.selectedIds.forEach(id => {
        const doc = documents.find(d => d.id === id);
        if (doc) { doc.subfolder = folder; doc.updatedAt = Date.now(); if (!firstDoc) firstDoc = doc; }
    });
    const n = state.selectedIds.size;
    if (firstDoc) ActivityLog.record('moved', firstDoc, { note: `moved ${n} document${n > 1 ? 's' : ''} to ${folder || 'no folder'}`, batchCount: n });
    await persist();
    closeModal();
    toast(`${n} document${n > 1 ? 's' : ''} moved to ${folder || 'no folder'}`, 'success');
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    renderContent();
};

// Batch edit for the Bug Kanban (Sprint 16, 16-3): sets Severity/Priority/
// Assignee across every selected bug at once. Each field defaults to
// "no change" so triaging severity for a batch doesn't accidentally wipe
// everyone's assignee.
window.showBatchBugEditModal = function() {
    const n = state.selectedIds.size;
    if (!n) return;
    showModal(`
        <div class="p-6 text-left">
            <h3 class="font-heading font-bold text-lg mb-1">Batch Edit ${n} Bug${n > 1 ? 's' : ''}</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Only fields you change below will be applied.</p>
            <div class="flex flex-col gap-3">
                <div>
                    <label class="text-xs font-medium block mb-1" style="color:var(--tx-m);">Severity</label>
                    ${renderSelect('batch-bug-severity', [
                        { value: '', label: '— No change —' },
                        { value: 'Critical', label: t('severityCritical') },
                        { value: 'Major', label: t('severityMajor') },
                        { value: 'Minor', label: t('severityMinor') },
                        { value: 'Trivial', label: t('severityTrivial') }
                    ], '', 'w-full')}
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1" style="color:var(--tx-m);">Priority</label>
                    ${renderSelect('batch-bug-priority', [
                        { value: '', label: '— No change —' },
                        { value: 'P1', label: 'P1 — Urgent' },
                        { value: 'P2', label: 'P2 — High' },
                        { value: 'P3', label: 'P3 — Medium' },
                        { value: 'P4', label: 'P4 — Low' }
                    ], '', 'w-full')}
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1" style="color:var(--tx-m);">Assignee</label>
                    <input type="text" id="batch-bug-assignee" class="form-input w-full" placeholder="Leave blank for no change...">
                </div>
            </div>
            <div class="flex gap-3 justify-end mt-5">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-p" data-onclick="confirmBatchBugEdit()">Apply</button>
            </div>
        </div>
    `);
};

window.confirmBatchBugEdit = async function() {
    const severity = document.getElementById('batch-bug-severity')?.value || '';
    const priority = document.getElementById('batch-bug-priority')?.value || '';
    const assignee = document.getElementById('batch-bug-assignee')?.value.trim() || '';
    if (!severity && !priority && !assignee) { toast('No changes selected.', 'warning'); return; }
    let changed = 0;
    state.selectedIds.forEach(id => {
        const doc = documents.find(d => d.id === id && d.category === 'bug');
        if (!doc) return;
        if (!doc.bugData) doc.bugData = {};
        if (severity) doc.bugData.severity = severity;
        if (priority) doc.bugData.priority = priority;
        if (assignee) doc.bugData.assignee = assignee;
        doc.updatedAt = Date.now();
        changed++;
    });
    if (changed > 0) await persist();
    closeModal();
    toast(`Updated ${changed} bug${changed !== 1 ? 's' : ''}.`, 'success');
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
