// ========================
// FILTER / SORT HELPERS
// ========================
window.applyStatusFilter = function(val) { state.statusFilter = val; state.docListPage = 1; renderContent(); };
window.applySortBy = function(val) { state.sortBy = val; state.docListPage = 1; renderContent(); };
window.setDocListPage = function(p) {
    state.docListPage = p;
    renderContent();
    document.getElementById('content')?.scrollTo({ top: 0, behavior: 'smooth' });
};

// ========================
// HEADER
// ========================
function updateHeader() {
    const h = document.getElementById('app-header');
    let title = '', actions = '';

    if (state.view === 'dashboard') {
        title = `<h2 class="font-heading font-bold text-lg">${t('dashboard')}</h2>`;
        actions = `<button class="btn-p header-new-doc-btn flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> ${t('newDoc')}</button>`;
    } else if (state.view === 'documents' || state.view === 'favorites') {
        const catLabel = state.view === 'favorites' ? t('favorites') : (state.category === 'all' ? t('allDocuments') : getCatMeta(state.category).labelPlural);
        title = `<h2 class="font-heading font-bold text-lg">${catLabel}</h2>`;
        actions = `<button class="btn-p header-new-doc-btn flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> ${t('newDoc')}</button>`;
    } else if (state.view === 'editor') {
        title = `<h2 class="font-heading font-bold text-lg">${state.editingDoc ? t('editDoc') : t('newDoc')}</h2>`;
        actions = `
            <button class="btn-s" data-onclick="cancelEdit()"><i class="fa-solid fa-xmark mr-1.5"></i>${t('cancel')}</button>
            <button class="btn-p" data-onclick="saveDoc()"><i class="fa-solid fa-check mr-1.5"></i>${t('save')}</button>
        `;
    } else if (state.view === 'viewer') {
        const doc = documents.find(d => d.id === state.editingDoc?.id);
        title = `<h2 class="font-heading font-bold text-lg truncate max-w-md" title="${doc ? escHtml(doc.title) : ''}">${doc ? escHtml(doc.title) : ''}</h2>`;
        if (state.sharedView) {
            actions = state.history?.length > 0
                ? `<button class="btn-s" data-onclick="navigateBack()"><i class="fa-solid fa-arrow-left mr-1.5"></i>${t('back')}</button>`
                : `<button class="btn-p text-sm" onclick="window.location.href=window.location.pathname">Open DocVault</button>`;
        } else {
            actions = `
                ${doc && doc.category !== 'credential' ? `<button class="btn-s hdr-icon-btn flex items-center justify-center h-[38px]" data-onclick="shareDoc('${doc.id}')" title="${t('share') || 'Share'}"><i class="fa-solid fa-share-nodes sm:mr-1.5"></i><span class="hdr-btn-label">${t('share') || 'Share'}</span></button>` : ''}
                <button class="btn-s hdr-icon-btn flex items-center justify-center h-[38px]" data-onclick="navigateBack()" title="${t('back')}"><i class="fa-solid fa-arrow-left sm:mr-1.5"></i><span class="hdr-btn-label">${t('back')}</span></button>
                ${doc && doc.category !== 'credential' ? `<button class="btn-s hdr-icon-btn flex items-center justify-center h-[38px]" data-onclick="showHistoryPanel('${doc.id}')" title="History"><i class="fa-regular fa-clock sm:mr-1.5"></i><span class="hdr-btn-label">History</span></button>` : ''}
                ${doc && doc.category !== 'credential' ? `<button class="btn-s hdr-icon-btn flex items-center justify-center h-[38px]" data-onclick="exportDoc('${doc.id}')" title="Export"><i class="fa-solid fa-file-export sm:mr-1.5"></i><span class="hdr-btn-label">Export</span></button>` : ''}
                <button class="btn-p hdr-icon-btn flex items-center justify-center h-[38px]" data-onclick="editDoc('${doc ? doc.id : ''}')" title="${t('edit')}"><i class="fa-solid fa-pen sm:mr-1.5"></i><span class="hdr-btn-label">${t('edit')}</span></button>
            `;
        }
    } else if (state.view === 'trash') {
        title = `<h2 class="font-heading font-bold text-lg">${t('trash') || 'Trash'}</h2>`;
    }

    const isSearchView = state.view === 'documents' || state.view === 'favorites';
    h.innerHTML = `
        <button class="hidden mr-1 p-2 rounded-lg" style="color:var(--tx-m);" data-onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>
        ${title}
        <div class="flex-1"></div>
        ${isSearchView ? `
            <div class="search-w hdr-sm-block" style="width:280px;">
                <i class="fa-solid fa-search"></i>
                <input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;debouncedRenderContent();">
            </div>
        ` : ''}
        <div class="flex items-center gap-2">
        <button class="btn-s flex items-center justify-center h-[38px] gap-1.5" data-onclick="openSearch()" title="Global Search (Ctrl+K)">
            <i class="fa-solid fa-magnifying-glass"></i> <span class="hdr-btn-label">Ctrl+K</span>
        </button>
        ${actions}
</div>
    `;
}

// ========================
// GET FILTERED DOCS
// ========================
function getFiltered() {
    let docs = [...documents];
    if (state.view === 'trash') {
        docs = docs.filter(d => d.status === 'deleted');
    } else {
        docs = docs.filter(d => d.status !== 'deleted');
        if (state.view === 'favorites') docs = docs.filter(d => d.favorite);
        else if (state.category !== 'all') {
            docs = docs.filter(d => d.category === state.category);
            if (state.subfolder) docs = docs.filter(d => d.subfolder === state.subfolder);
        }
    }
    if (state.search) {
        const q = state.search.toLowerCase();
        docs = docs.filter(d => d.title.toLowerCase().includes(q) || (d.content && d.content.toLowerCase().includes(q)) || d.tags.some(t => t.toLowerCase().includes(q)));
    }
    if (state.statusFilter !== 'all') docs = docs.filter(d => d.status === state.statusFilter);
    docs.sort((a, b) => {
        if (state.sortBy === 'updated') return b.updatedAt - a.updatedAt;
        if (state.sortBy === 'created') return b.createdAt - a.createdAt;
        if (state.sortBy === 'title') return a.title.localeCompare(b.title);
        return 0;
    });
    return docs;
}

// ========================
// SYNC EDITOR STATE
// ========================
window.syncEditorState = function() {
    if (state.view !== 'editor') return;

    const titleEl = document.getElementById('ed-title');
    if (!titleEl) return;

    const title = titleEl.value || '';
    const cat = document.getElementById('ed-cat')?.value || 'runbook';
    const subfolder = document.getElementById('ed-subfolder')?.value || '';
    const status = document.getElementById('ed-status')?.value || 'draft';
    const content = window.tuiEditor ? window.tuiEditor.getMarkdown() : '';

    let bugData = null;
    let tcData = null;
    let apiData = null;
    if (cat === 'bug') {
        bugData = {
            env: document.getElementById('ed-bug-env')?.value || '',
            browser: document.getElementById('ed-bug-browser')?.value || '',
            severity: document.getElementById('ed-bug-severity')?.value || 'Minor',
            priority: document.getElementById('ed-bug-priority')?.value || 'P3',
            assignee: document.getElementById('ed-bug-assignee')?.value || '',
            precond: document.getElementById('ed-bug-precond')?.value || '',
            steps: Array.from(document.querySelectorAll('.bug-step-input')).map(inp => inp.value),
            expected: document.getElementById('ed-bug-expected')?.value || '',
            actual: document.getElementById('ed-bug-actual')?.value || ''
        };
    } else if (cat === 'testcases') {
        tcData = {
            module: document.getElementById('ed-tc-module')?.value || '',
            precond: document.getElementById('ed-tc-precond')?.value || '',
            data: document.getElementById('ed-tc-data')?.value || '',
            steps: Array.from(document.querySelectorAll('.tc-step-row')).map(row => ({
                action: row.querySelector('.tc-step-action')?.value || '',
                expected: row.querySelector('.tc-step-expected')?.value || ''
            }))
        };
    } else if (cat === 'api') {
        apiData = {
            method: document.getElementById('ed-api-method')?.value || 'GET',
            endpoint: document.getElementById('ed-api-endpoint')?.value || '',
            headers: Array.from(document.querySelectorAll('.api-header-row')).map(row => ({
                key: row.querySelector('.api-key')?.value || '',
                value: row.querySelector('.api-value')?.value || '',
                req: row.querySelector('.api-req')?.checked || false
            })),
            params: Array.from(document.querySelectorAll('.api-param-row')).map(row => ({
                key: row.querySelector('.api-key')?.value || '',
                value: row.querySelector('.api-value')?.value || '',
                req: row.querySelector('.api-req')?.checked || false
            })),
            body: document.getElementById('ed-api-body')?.value || '',
            statusCode: document.getElementById('ed-api-status')?.value || '200',
            response: document.getElementById('ed-api-response')?.value || ''
        };
    }

    if (state.editingDoc) {
        state.editingDoc.title = title;
        state.editingDoc.subfolder = subfolder;
        state.editingDoc.category = cat;
        state.editingDoc.status = status;
        if (window.tuiEditor || document.getElementById('ed-content-hidden')) state.editingDoc.content = content;
        if (cat === 'bug') state.editingDoc.bugData = bugData;
        if (cat === 'testcases') state.editingDoc.tcData = tcData;
        if (cat === 'api') state.editingDoc.apiData = apiData;
    } else {
        state._newTitle = title;
        state._newSubfolder = subfolder;
        state._newCat = cat;
        state._newStatus = status;
        if (window.tuiEditor || document.getElementById('ed-content-hidden')) state._newContent = content;
        state._newBugData = bugData;
        state._newTcData = tcData;
        state._newApiData = apiData;
    }
};

// ========================
// UPDATE DOM (morphdom)
// ========================
function updateDOM(el, htmlStr) {
    if (typeof morphdom !== 'undefined') {
        morphdom(el, `<div id="${el.id}" class="${el.className}">${htmlStr}</div>`, {
            onBeforeElUpdated: function(fromEl, toEl) {
                if (fromEl.id === 'editor-container' || fromEl.id === 'viewer-container') return false;
                if (fromEl.classList.contains('cred-favicon') && fromEl.classList.contains('loaded')) {
                    toEl.classList.add('loaded');
                }
                if (fromEl.classList.contains('cred-avatar') && fromEl.classList.contains('has-favicon')) {
                    toEl.classList.add('has-favicon');
                }
                return true;
            }
        });
    } else {
        el.innerHTML = htmlStr;
    }
}

// ========================
// RENDER CONTENT
// ========================
// Debounced wrapper used by search inputs (Sprint 21): state.search is set
// synchronously on every keystroke so the input stays responsive, but the
// expensive re-filter/re-sort/re-render of the (potentially large) document
// list is delayed until typing pauses.
// executeAction() dispatches via window[funcName](), and a top-level `const`
// (unlike a `function` declaration) does NOT become a window property — must
// assign explicitly or data-oninput="debouncedRenderContent()" would no-op.
window.debouncedRenderContent = debounce(() => renderContent(), 180);

function renderContent() {
    if (state.view === 'editor') syncEditorState();

    if (state.view !== 'viewer') {
        if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
        window.currentViewerDocId = null;
    }

    const c = document.getElementById('content');
    if (state.view === 'dashboard') updateDOM(c, renderDashboard());
    else if (state.view === 'activity') updateDOM(c, renderActivityLog());
    else if (state.view === 'documents' || state.view === 'favorites' || state.view === 'trash') updateDOM(c, renderDocList());
    else if (state.view === 'editor') {
        if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
        c.innerHTML = renderEditor();
        window.tuiEditor = null;
        const container = document.getElementById('editor-container');
        if (container) {
            const hiddenTa = document.getElementById('ed-content-hidden');
            const initialVal = hiddenTa ? hiddenTa.value : '';
            window.tuiEditor = new toastui.Editor({
                el: container,
                height: 'calc(100vh - 300px)',
                initialEditType: 'markdown',
                previewStyle: 'vertical',
                initialValue: initialVal,
                theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : undefined,
                hooks: {
                    addImageBlobHook: uploadImageToCloud
                }
            });
        }
    }
    else if (state.view === 'viewer') {
        const isSameDoc = window.currentViewerDocId === state.editingDoc?.id;
        if (isSameDoc) {
            updateDOM(c, renderViewer());
        } else {
            if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch(e) {} window.tuiEditor = null; }
            if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
            c.innerHTML = renderViewer();
            window.currentViewerDocId = state.editingDoc?.id;
            requestAnimationFrame(() => {
                setTimeout(() => {
                    const container = document.getElementById('viewer-container');
                    if (!container) return;
                    const hiddenTa = document.getElementById('vw-content-hidden');
                    window.tuiViewer = toastui.Editor.factory({
                        el: container,
                        viewer: true,
                        initialValue: hiddenTa ? hiddenTa.value : '',
                        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : undefined
                    });
                    setTimeout(() => {
                        container.querySelectorAll('pre code').forEach(codeEl => {
                            const pre = codeEl.parentElement;
                            if (pre.querySelector('.code-copy-btn')) return;
                            const b64 = btoa(unescape(encodeURIComponent(codeEl.textContent)));
                            const btn = document.createElement('button');
                            btn.className = 'code-copy-btn';
                            btn.title = 'Copy';
                            btn.setAttribute('data-onclick', `copyCodeBlock(this, '${b64}')`);
                            btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                            pre.style.position = 'relative';
                            pre.insertBefore(btn, pre.firstChild);
                        });
                    }, 100);
                }, 50);
            });
        }
    }
    _restoreFaviconState();
}

function render() {
    updateSidebar();
    updateHeader();
    renderContent();
}

function _restoreFaviconState() {
    document.querySelectorAll('.cred-favicon').forEach(img => {
        if (img.complete && img.naturalWidth > 0) {
            img.classList.add('loaded');
            const span = img.nextElementSibling;
            if (span && span.tagName === 'SPAN') span.style.display = 'none';
            img.parentElement.classList.add('has-favicon');
        }
    });
}

// ========================
// DASHBOARD HEALTH METRICS
// ========================
function _getDashboardMetrics(docs) {
    const STALE_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    // Bug severity + lifecycle
    const bugs = docs.filter(d => d.category === 'bug');
    const openBugs = bugs.filter(b => _normBugStatus(b.bugStatus) !== 'closed');
    const bugSev = { Critical: 0, Major: 0, Minor: 0, Trivial: 0 };
    openBugs.forEach(b => { const s = b.bugData?.severity; if (s && bugSev[s] !== undefined) bugSev[s]++; });
    const bugLifecycle = { new: 0, open: 0, 'in-progress': 0, resolved: 0, retest: 0, verified: 0, closed: 0 };
    bugs.forEach(b => { const s = _normBugStatus(b.bugStatus); if (bugLifecycle[s] !== undefined) bugLifecycle[s]++; });

    // Test run pass/fail/blocked aggregated across all runs
    const runs = docs.filter(d => d.category === 'testrun');
    let rPass = 0, rFail = 0, rBlocked = 0, rTotal = 0;
    runs.forEach(run => {
        if (!run.runData?.results) return;
        Object.values(run.runData.results).forEach(tcRes => {
            if (typeof tcRes !== 'object' || Array.isArray(tcRes)) return;
            Object.entries(tcRes).forEach(([k, v]) => {
                if (k === 'note') return;
                rTotal++;
                if (v === 'pass') rPass++;
                else if (v === 'fail') rFail++;
                else if (v === 'blocked') rBlocked++;
            });
        });
    });

    // Task board kanban distribution
    const tasks = docs.filter(d => d.category === 'task');
    const board = { todo: 0, inProgress: 0, review: 0, done: 0 };
    tasks.forEach(t => { let s = t.kanbanStatus || 'todo'; if (s === 'in-progress') s = 'inProgress'; if (board[s] !== undefined) board[s]++; });

    // Stale docs (>30d, exclude credentials, tasks, trashed)
    const stale = docs
        .filter(d => d.category !== 'credential' && d.category !== 'task' && (now - (d.updatedAt || 0)) > STALE_MS)
        .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0))
        .slice(0, 4);

    // Critical bugs aging past a 48h SLA (Sprint 16, 16-2) — a distinct, more
    // urgent signal than the generic 30-day "stale" widget above: a Critical
    // bug open for 2 days deserves attention regardless of when it was last
    // touched (unlike "stale", which only fires on 30 days of no updates).
    const SLA_MS = 48 * 60 * 60 * 1000;
    const criticalAging = openBugs
        .filter(b => b.bugData?.severity === 'Critical' && (now - (b.createdAt || 0)) > SLA_MS)
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    // Coverage by module — test cases whose subfolder = module, covered = included in any run
    const tcs = docs.filter(d => d.category === 'testcases');
    const coveredIds = new Set(runs.flatMap(r => r.runData?.targetIds || []));
    const modMap = {};
    tcs.forEach(tc => {
        const m = tc.subfolder || 'General';
        if (!modMap[m]) modMap[m] = { total: 0, covered: 0 };
        modMap[m].total++;
        if (coveredIds.has(tc.id)) modMap[m].covered++;
    });
    const coverage = Object.entries(modMap)
        .map(([name, { total, covered }]) => ({ name, total, covered, pct: Math.round(covered / total * 100) }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 4);

    return { bugs, openBugs, bugSev, bugLifecycle, runs, rPass, rFail, rBlocked, rTotal, tasks, board, stale, tcs, coverage, criticalAging };
}

function _renderHealthWidgets(m, inPanel) {
    const widgets = [];

    // Widget 1: Bug Severity (open bugs only)
    if (m.openBugs.length > 0) {
        const sevTotal = m.openBugs.length;
        const sevItems = [
            { label: 'Critical', count: m.bugSev.Critical, color: '#f87171' },
            { label: 'Major',    count: m.bugSev.Major,    color: '#fb923c' },
            { label: 'Minor',    count: m.bugSev.Minor,    color: '#60a5fa' },
            { label: 'Trivial',  count: m.bugSev.Trivial,  color: 'var(--tx-d)' },
        ].filter(s => s.count > 0);
        widgets.push(`
            <div class="doc-card p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);">Bug Severity</p>
                ${sevItems.map(s => `
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-[11px] w-12 shrink-0" style="color:${s.color};">${s.label}</span>
                        <div class="flex-1 rounded-full overflow-hidden" style="height:5px;background:var(--brd);">
                            <div style="width:${Math.round(s.count/sevTotal*100)}%;height:100%;background:${s.color};border-radius:9999px;"></div>
                        </div>
                        <span class="text-[11px] font-medium w-4 text-right" style="color:var(--tx-m);font-variant-numeric:tabular-nums;">${s.count}</span>
                    </div>`).join('')}
                <p class="text-[10px] mt-2 mb-3" style="color:var(--tx-d);">${sevTotal} open · ${m.bugs.length - sevTotal} closed</p>
                <div class="flex items-center gap-0.5 pt-2 border-t" style="border-color:var(--brd);">
                    ${[
                        { key: 'new',         label: 'New',      color: '#94a3b8' },
                        { key: 'open',        label: 'Open',     color: '#60a5fa' },
                        { key: 'in-progress', label: 'In Prog',  color: '#a78bfa' },
                        { key: 'resolved',    label: 'Resolved', color: '#38bdf8' },
                        { key: 'retest',      label: 'Retest',   color: '#c084fc' },
                        { key: 'verified',    label: 'Verified', color: '#4ade80' },
                        { key: 'closed',      label: 'Closed',   color: '#34d399' },
                    ].map(lc => `
                        <div class="flex-1 text-center">
                            <p class="font-heading font-bold text-sm" style="color:${m.bugLifecycle[lc.key] > 0 ? lc.color : 'var(--tx-d)'};font-variant-numeric:tabular-nums;">${m.bugLifecycle[lc.key]}</p>
                            <p class="text-[8px]" style="color:var(--tx-d);">${lc.label}</p>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    // Widget 2: Test Pass Rate
    if (m.runs.length > 0 && m.rTotal > 0) {
        const passRate = Math.round(m.rPass / m.rTotal * 100);
        const rateColor = passRate >= 80 ? '#34d399' : passRate >= 60 ? '#fb923c' : '#f87171';
        widgets.push(`
            <div class="doc-card p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);">Test Pass Rate</p>
                <p class="font-heading font-bold text-2xl mb-0.5" style="color:${rateColor};font-variant-numeric:tabular-nums;">${passRate}%</p>
                <p class="text-[11px] mb-3" style="color:var(--tx-d);">across ${m.runs.length} run${m.runs.length > 1 ? 's' : ''}</p>
                <div class="flex flex-col gap-1.5">
                    ${m.rPass > 0 ? `<div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#34d399;"></span><span class="text-[11px]" style="color:var(--tx-m);">Pass</span><span class="text-[11px] font-medium ml-auto" style="color:var(--tx);font-variant-numeric:tabular-nums;">${m.rPass}</span></div>` : ''}
                    ${m.rFail > 0 ? `<div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#f87171;"></span><span class="text-[11px]" style="color:var(--tx-m);">Fail</span><span class="text-[11px] font-medium ml-auto" style="color:var(--tx);font-variant-numeric:tabular-nums;">${m.rFail}</span></div>` : ''}
                    ${m.rBlocked > 0 ? `<div class="flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#fb923c;"></span><span class="text-[11px]" style="color:var(--tx-m);">Blocked</span><span class="text-[11px] font-medium ml-auto" style="color:var(--tx);font-variant-numeric:tabular-nums;">${m.rBlocked}</span></div>` : ''}
                </div>
            </div>`);
    }

    // Widget 3: Task Board
    if (m.tasks.length > 0) {
        const cols = [
            { key: 'todo',       label: 'To Do',   color: 'var(--tx-d)' },
            { key: 'inProgress', label: 'In Prog', color: '#60a5fa' },
            { key: 'review',     label: 'Review',  color: '#fb923c' },
            { key: 'done',       label: 'Done',    color: '#34d399' },
        ];
        widgets.push(`
            <div class="doc-card p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);">Task Board</p>
                <div class="grid grid-cols-4 gap-1.5 mb-2">
                    ${cols.map(c => `
                        <div class="text-center">
                            <p class="text-[10px] mb-1 truncate" style="color:var(--tx-d);">${c.label}</p>
                            <p class="font-heading font-bold text-lg" style="color:${m.board[c.key] > 0 ? c.color : 'var(--tx-d)'};font-variant-numeric:tabular-nums;">${m.board[c.key]}</p>
                        </div>`).join('')}
                </div>
                <div class="flex rounded-full overflow-hidden" style="height:4px;background:var(--brd);">
                    ${cols.map(c => m.board[c.key] > 0 ? `<div style="flex:${m.board[c.key]};background:${c.color};"></div>` : '').join('')}
                </div>
                <p class="text-[10px] mt-2" style="color:var(--tx-d);">${m.tasks.length} task${m.tasks.length > 1 ? 's' : ''} total</p>
            </div>`);
    }

    // Widget 3b: Critical Bugs Aging (SLA >48h)
    if (m.criticalAging.length > 0) {
        const fmtAge = ms => { const h = Math.floor(ms / 3600000); return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`; };
        widgets.push(`
            <div class="doc-card p-4" style="border-color:#ef4444;">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:#f87171;"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Critical Bugs Aging <span style="color:var(--tx-d);">&gt;48h</span></p>
                <div class="flex flex-col gap-2">
                    ${m.criticalAging.slice(0, 4).map(b => `
                        <div class="flex items-center gap-2 cursor-pointer" data-onclick="viewDoc('${b.id}')">
                            <span class="text-[10px] font-mono font-bold shrink-0" style="color:#f87171;">${bugRef(b)}</span>
                            <span class="text-[11px] flex-1 min-w-0 truncate" style="color:var(--tx-m);">${escHtml(b.title)}</span>
                            <span class="text-[10px] shrink-0 font-bold" style="color:#f87171;font-variant-numeric:tabular-nums;">${fmtAge(Date.now() - (b.createdAt || 0))}</span>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    // Widget 4: Stale Docs
    if (m.stale.length > 0) {
        const fmtAge = ms => { const d = Math.floor(ms / 86400000); return d >= 30 ? `${Math.floor(d/30)}mo` : `${d}d`; };
        widgets.push(`
            <div class="doc-card p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);">Stale Docs <span style="color:#fb923c;">&gt;30d</span></p>
                <div class="flex flex-col gap-2">
                    ${m.stale.map(d => `
                        <div class="flex items-center gap-2 cursor-pointer" data-onclick="viewDoc('${d.id}')">
                            <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:#fb923c;"></span>
                            <span class="text-[11px] flex-1 min-w-0 truncate" style="color:var(--tx-m);">${escHtml(d.title)}</span>
                            <span class="text-[10px] shrink-0 font-medium" style="color:var(--tx-d);font-variant-numeric:tabular-nums;">${fmtAge(Date.now() - (d.updatedAt || 0))}</span>
                        </div>`).join('')}
                </div>
            </div>`);
    }

    // Widget 5: Coverage by Module
    if (m.tcs.length > 0 && m.coverage.length > 0) {
        widgets.push(`
            <div class="doc-card p-4">
                <p class="text-[10px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);">Coverage by Module</p>
                ${m.coverage.map(c => {
                    const barColor = c.pct === 0 ? '#f87171' : c.pct < 50 ? '#fb923c' : '#34d399';
                    return `
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-[11px] truncate" style="color:var(--tx-m);width:60px;flex-shrink:0;" title="${escHtml(c.name)}">${escHtml(c.name)}</span>
                            <div class="flex-1 rounded-full overflow-hidden" style="height:5px;background:var(--brd);">
                                <div style="width:${c.pct}%;height:100%;background:${barColor};border-radius:9999px;transition:width .4s;"></div>
                            </div>
                            <span class="text-[11px] font-medium shrink-0" style="color:${barColor};font-variant-numeric:tabular-nums;width:28px;text-align:right;">${c.pct}%</span>
                        </div>`; }).join('')}
            </div>`);
    }

    if (widgets.length === 0) return '';

    if (inPanel) {
        return `
            <div>
                <h3 class="font-heading font-semibold text-base mb-3" style="color:var(--tx);">QA Health</h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    ${widgets.join('')}
                </div>
            </div>`;
    }
    return `
        <div class="grid gap-4 mb-8" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));">
            ${widgets.join('')}
        </div>`;
}

// ========================
// DASHBOARD
// ========================
function renderDashboard() {
    const activeDocs = documents.filter(d => d.status !== 'deleted');
    const total = activeDocs.length;
    const recent = [...activeDocs].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const m = _getDashboardMetrics(activeDocs);

    // Key metric derived values
    const passRate = m.rTotal > 0 ? Math.round(m.rPass / m.rTotal * 100) : null;
    const passColor = passRate === null ? 'var(--tx-d)' : passRate >= 80 ? '#34d399' : passRate >= 60 ? '#fb923c' : '#f87171';
    const activeTasks = (m.board.inProgress || 0) + (m.board.review || 0);

    // Category inventory — non-zero cats as clickable pills
    const catCounts = {};
    Object.keys(CAT_META).forEach(k => catCounts[k] = activeDocs.filter(d => d.category === k).length);
    const nonZeroCats = Object.entries(catCounts).filter(([, v]) => v > 0);

    return `<div class="fade-up max-w-6xl 2xl:max-w-[1600px] mx-auto">

        <!-- KEY METRICS ROW -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <div class="stat-card sc-total p-4">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Total Docs</p>
                <p class="font-heading font-bold text-2xl" style="color:var(--acc);">${total}</p>
            </div>
            <div class="stat-card p-4" style="${m.bugSev.Critical > 0 ? 'border-color:#f87171;' : ''}">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Open Bugs</p>
                <p class="font-heading font-bold text-2xl" style="color:${m.openBugs.length > 0 ? '#f87171' : 'var(--tx-d)'};">${m.openBugs.length}</p>
                ${m.bugSev.Critical > 0 ? `<p class="text-[10px] mt-0.5 font-medium" style="color:#f87171;">${m.bugSev.Critical} critical</p>` : `<p class="text-[10px] mt-0.5" style="color:var(--tx-d);">open</p>`}
            </div>
            <div class="stat-card p-4">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Pass Rate</p>
                <p class="font-heading font-bold text-2xl" style="color:${passColor};">${passRate !== null ? passRate + '%' : '—'}</p>
                <p class="text-[10px] mt-0.5" style="color:var(--tx-d);">${m.runs.length > 0 ? m.runs.length + ' run' + (m.runs.length > 1 ? 's' : '') : 'no runs yet'}</p>
            </div>
            <div class="stat-card p-4">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Active Tasks</p>
                <p class="font-heading font-bold text-2xl" style="color:${activeTasks > 0 ? '#60a5fa' : 'var(--tx-d)'};">${activeTasks}</p>
                <p class="text-[10px] mt-0.5" style="color:var(--tx-d);">in progress + review</p>
            </div>
            <div class="stat-card p-4" style="${m.stale.length > 0 ? 'border-color:#fb923c;' : ''}">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Need Review</p>
                <p class="font-heading font-bold text-2xl" style="color:${m.stale.length > 0 ? '#fb923c' : 'var(--tx-d)'};">${m.stale.length}</p>
                <p class="text-[10px] mt-0.5" style="color:var(--tx-d);">stale &gt;30 days</p>
            </div>
        </div>

        <!-- MAIN 2-COLUMN LAYOUT -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- LEFT: QA Health + Recently Updated -->
            <div class="lg:col-span-2 flex flex-col gap-6">

                ${_renderHealthWidgets(m, true)}

                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-heading font-semibold text-base">${t('recentlyUpdated')}</h3>
                        <button class="text-xs font-medium" style="color:var(--acc);" data-onclick="navigate('documents','all')">${t('viewAll')} <i class="fa-solid fa-arrow-right ml-1 text-[10px]"></i></button>
                    </div>
                    <div class="flex flex-col gap-2.5">
                        ${recent.length === 0 ? `<div class="text-center py-10" style="color:var(--tx-d);"><i class="fa-solid fa-inbox text-3xl mb-3 pulse-s block"></i><p class="text-sm">${t('noDocYet')}</p></div>` :
                        recent.map(d => `
                            <div class="doc-card p-3.5 flex items-center gap-3" data-onclick="viewDoc('${d.id}')">
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${getCatMeta(d.category).color}12;">
                                    <i class="fa-solid ${getCatMeta(d.category).icon} text-xs" style="color:${getCatMeta(d.category).color};"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-semibold truncate" style="color:var(--tx);">${escHtml(d.title)}</p>
                                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                                        <span class="cat-badge ${getCatMeta(d.category).cls}">${getCatMeta(d.category).label}</span>
                                        <span class="st-badge st-${d.status}">${d.status}</span>
                                        <span class="text-[11px]" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                                    </div>
                                </div>
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-sm p-1 shrink-0" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${d.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- RIGHT: Inventory + Quick Create + Favorites -->
            <div class="flex flex-col gap-6">

                ${nonZeroCats.length > 0 ? `
                <div>
                    <h3 class="font-heading font-semibold text-base mb-3">Inventory</h3>
                    <div class="flex flex-wrap gap-2">
                        ${nonZeroCats.map(([k, v]) => `
                            <button class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                                style="background:${CAT_META[k].color}15;color:${CAT_META[k].color};border:1px solid ${CAT_META[k].color}25;transition:opacity .15s;"
                                data-onclick="navigate('documents','${k}')">
                                <i class="fa-solid ${CAT_META[k].icon} text-[10px]"></i>
                                ${CAT_META[k].label}
                                <span style="opacity:.7;">${v}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>` : ''}

                <div>
                    <h3 class="font-heading font-semibold text-base mb-3">Quick Create</h3>
                    <div class="grid grid-cols-2 gap-2">
                        ${Object.entries(CAT_META).map(([k, cm]) => `
                            <button class="tpl-card text-center py-3" data-onclick="createDoc('${k}')">
                                <i class="fa-solid ${cm.icon} text-base mb-1.5 block" style="color:${cm.color};"></i>
                                <p class="text-[11px] font-semibold" style="color:var(--tx);">${cm.label}</p>
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-heading font-semibold text-base">${t('favorites')}</h3>
                        <button class="text-xs font-medium" style="color:var(--acc);" data-onclick="navigate('favorites')">${t('viewAll')}</button>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        ${activeDocs.filter(d => d.favorite).length === 0 ? `<p class="text-xs text-center py-4" style="color:var(--tx-d);">${t('noFavorites')}</p>` :
                        activeDocs.filter(d => d.favorite).slice(0, 5).map(d => `
                            <div class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer" style="transition:background .15s;"
                                data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'"
                                data-onclick="viewDoc('${d.id}')">
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${getCatMeta(d.category).color};"></span>
                                <span class="text-xs truncate" style="color:var(--tx-m);">${escHtml(d.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

            </div>
        </div>
    </div>`;
}

// ========================
// ACTIVITY LOG (Sprint 24)
// ========================
const ACTIVITY_META = {
    created:  { icon: 'fa-solid fa-file-circle-plus', color: '#10b981', label: 'Created' },
    updated:  { icon: 'fa-solid fa-pen',               color: '#60a5fa', label: 'Updated' },
    trashed:  { icon: 'fa-solid fa-trash',              color: '#f59e0b', label: 'Moved to trash' },
    restored: { icon: 'fa-solid fa-rotate-left',        color: '#10b981', label: 'Restored' },
    deleted:  { icon: 'fa-solid fa-trash-can',          color: '#ef4444', label: 'Permanently deleted' },
    tagged:   { icon: 'fa-solid fa-tag',                color: '#818cf8', label: 'Tagged' },
    moved:    { icon: 'fa-regular fa-folder',           color: '#818cf8', label: 'Moved' }
};

function renderActivityLog() {
    const entries = (typeof ActivityLog !== 'undefined') ? ActivityLog.getAll() : [];
    return `<div class="fade-up max-w-3xl mx-auto">
        <div class="flex items-center justify-between mb-5">
            <div>
                <h2 class="font-heading font-semibold text-lg">Activity</h2>
                <p class="text-xs" style="color:var(--tx-d);">A personal timeline of changes across this vault — last ${ActivityLog.MAX} actions, synced across your devices.</p>
            </div>
            ${entries.length > 0 ? `<button class="btn-s text-xs py-1.5 px-3" data-onclick="clearActivityLog()"><i class="fa-solid fa-broom mr-1.5"></i>Clear</button>` : ''}
        </div>
        ${entries.length === 0 ? `
            <div class="text-center py-20">
                <i class="fa-regular fa-clock text-4xl mb-4 block" style="color:var(--tx-d);"></i>
                <p class="text-sm font-medium mb-1" style="color:var(--tx-m);">No activity yet</p>
                <p class="text-xs" style="color:var(--tx-d);">Create, edit, or organize a document and it'll show up here.</p>
            </div>
        ` : `
            <div class="rounded-xl overflow-hidden" style="border:1px solid var(--brd);">
                ${entries.map((e, i) => {
                    const meta = ACTIVITY_META[e.type] || { icon: 'fa-solid fa-circle', color: 'var(--tx-d)', label: e.type };
                    const docExists = documents.some(d => d.id === e.docId);
                    return `
                    <div class="flex items-center gap-3 px-4 py-3" style="background:${i % 2 === 0 ? 'var(--card)' : 'transparent'};${i > 0 ? 'border-top:1px solid var(--brd);' : ''}">
                        <div class="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style="background:${meta.color}1a;">
                            <i class="${meta.icon}" style="font-size:11px;color:${meta.color};"></i>
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm truncate" style="color:var(--tx);">
                                <span style="color:${meta.color};font-weight:600;">${meta.label}</span>
                                ${docExists ? `<span class="cursor-pointer hover:underline" data-onclick="viewDoc('${e.docId}')"> ${escHtml(e.title)}</span>` : ` ${escHtml(e.title)}`}
                            </p>
                            ${e.note ? `<p class="text-xs" style="color:var(--tx-d);">${escHtml(e.note)}</p>` : ''}
                        </div>
                        <span class="text-[11px] shrink-0" style="color:var(--tx-d);">${fmtDate(e.ts)}</span>
                    </div>`;
                }).join('')}
            </div>
        `}
    </div>`;
}

window.clearActivityLog = function() {
    ActivityLog.clear();
    renderContent();
    toast('Activity log cleared.', 'info');
};

// ========================
// DOCUMENT LIST
// ========================
// Sprint 22: cap how many cards render at once so a large vault doesn't
// rebuild+diff hundreds of doc-card templates on every render() call (each
// keystroke, checkbox toggle, favorite, etc.) — see the render-core.js perf
// audit. Doesn't apply to the Kanban boards (task/bug), which have their own
// column-based layout and are unaffected by this list-view cost.
const DOC_LIST_PAGE_SIZE = 60;

function renderDocList() {
    const docs = getFiltered();
    const isMobileSearch = state.view === 'documents' || state.view === 'favorites';

    if (state.category === 'task' && state.view === 'documents') {
        return renderKanbanBoard(docs, isMobileSearch);
    }
    if (state.category === 'bug' && state.view === 'documents') {
        return renderBugKanban(docs, isMobileSearch);
    }

    // Clamp the current page against the live filtered count rather than
    // resetting it from every individual filter-changing action — covers
    // search/category/sort/status changes uniformly (a stale page number
    // from a larger result set just clamps down to the new last page).
    const totalPages = Math.max(1, Math.ceil(docs.length / DOC_LIST_PAGE_SIZE));
    if (state.docListPage > totalPages) state.docListPage = totalPages;
    if (state.docListPage < 1) state.docListPage = 1;
    const pageStart = (state.docListPage - 1) * DOC_LIST_PAGE_SIZE;
    const pageDocs = docs.slice(pageStart, pageStart + DOC_LIST_PAGE_SIZE);

    const bm = state.batchMode;
    const sel = state.selectedIds;
    const inTrash = state.view === 'trash';
    // "Select all" spans the whole filtered set (selectAllDocs() does too),
    // not just the current page — a page fully selected but with other
    // pages partially selected should still read as "not all selected".
    const allSelected = docs.length > 0 && docs.every(d => sel.has(d.id));

    const batchCheckbox = (id) => bm ? `
        <div style="position:absolute;top:10px;right:10px;z-index:5;pointer-events:none;">
            <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${sel.has(id) ? 'var(--acc)' : 'var(--brd2)'};background:${sel.has(id) ? 'var(--acc)' : 'rgba(13,21,36,0.7)'};display:flex;align-items:center;justify-content:center;transition:all .15s;">
                ${sel.has(id) ? '<i class="fa-solid fa-check" style="font-size:9px;color:white;"></i>' : ''}
            </div>
        </div>` : '';

    const cardAction = (id) => bm ? `toggleSelectDoc('${id}', event)` : `viewDoc('${id}')`;
    const cardCls = (id) => `doc-card p-4 flex flex-col${bm && sel.has(id) ? ' batch-selected' : ''}`;

    return `<div class="fade-up max-w-6xl 2xl:max-w-[1600px] mx-auto">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;debouncedRenderContent();"></div>` : ''}

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-5">
            ${renderSelect('hdr-status-filter', [
                {value: 'all', label: t('allStatus')},
                {value: 'published', label: 'Published'},
                {value: 'draft', label: 'Draft'},
                {value: 'archived', label: 'Archived'}
            ], state.statusFilter, 'text-sm !w-auto min-w-[130px]', 'applyStatusFilter(this.value)')}
            ${renderSelect('hdr-sort-by', [
                {value: 'updated', label: t('recentlyUpdated')},
                {value: 'created', label: t('newest')},
                {value: 'title', label: t('sortAZ')}
            ], state.sortBy, 'text-sm !w-auto min-w-[140px]', 'applySortBy(this.value)')}
            <span class="text-xs" style="color:var(--tx-d);">${docs.length} documents${totalPages > 1 ? ` · page ${state.docListPage}/${totalPages}` : ''}</span>
            ${!inTrash ? `<button class="btn-s text-xs flex items-center gap-1.5" data-onclick="showSaveViewModal()" title="Save this category + filter + sort combination"><i class="fa-regular fa-bookmark" style="font-size:11px;"></i> Save View</button>` : ''}
            ${state.category === 'api' && !inTrash ? `<button class="btn-s text-xs flex items-center gap-1.5" data-onclick="triggerApiImport()" title="Import a Postman Collection or OpenAPI spec"><i class="fa-solid fa-file-import" style="font-size:11px;"></i> Import</button>` : ''}
            <div class="flex items-center gap-2 ml-auto">
                ${!inTrash && docs.length > 0 ? `
                    ${bm ? `<span class="text-xs font-semibold" style="color:var(--acc);">${sel.size} selected</span>
                    <button class="text-xs py-1 px-2.5 rounded-md font-medium" style="color:var(--acc);border:1px solid rgba(16,185,129,.3);background:rgba(16,185,129,.06);" data-onclick="selectAllDocs()">
                        ${allSelected ? 'Deselect all' : 'Select all'}
                    </button>` : ''}
                    <button class="text-xs py-1 px-2.5 rounded-md border font-medium" style="border-color:var(--brd);color:var(--tx-m);background:transparent;transition:all .15s;" data-onclick="toggleBatchMode()">
                        ${bm ? '✕ Cancel' : '<i class="fa-regular fa-square-check" style="margin-right:5px;font-size:11px;"></i>Select'}
                    </button>
                ` : ''}
                ${inTrash && docs.length > 0 ? `<button class="btn-d text-xs py-1 px-2.5" data-onclick="showEmptyTrashModal()"><i class="fa-solid fa-trash-can mr-1.5"></i>${t('emptyTrash') || 'Empty Trash'}</button>` : ''}
            </div>
        </div>

        <!-- Grid -->
        ${docs.length === 0 ? `
            <div class="text-center py-20">
                <i class="fa-solid ${inTrash ? 'fa-trash' : 'fa-folder-open'} text-4xl mb-4 pulse-s block" style="color:var(--tx-d);"></i>
                <p class="text-sm font-medium mb-1" style="color:var(--tx-m);">${state.search ? t('noDocFound') : (inTrash ? (t('trashEmpty') || 'Trash is empty') : t('noDocYet'))}</p>
                <p class="text-xs mb-5" style="color:var(--tx-d);">${state.search ? t('tryDiffKey') : (inTrash ? '' : t('createFirstDoc'))}</p>
                ${!state.search && !inTrash ? `<button class="btn-p text-sm" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus mr-1.5"></i>${t('newDoc')}</button>` : ''}
            </div>
        ` : `
            <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                ${pageDocs.map(d => {
                    if (d.category === 'credential') {
                        const domain = guessDomain(d.title);
                        const favUrl = `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
                        return `
                        <div class="${cardCls(d.id)}" data-onclick="${cardAction(d.id)}" style="position:relative;">
                            ${batchCheckbox(d.id)}
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center gap-3">
                                    <div class="cred-avatar ${credAvatarColor(d.title)}">
                                        <img class="cred-favicon" src="${favUrl}" alt="" onload="this.classList.add('loaded'); this.nextElementSibling.style.display='none'; this.parentElement.classList.add('has-favicon');" onerror="this.style.display='none'">
                                        <span>${escHtml(d.title.charAt(0).toUpperCase())}</span>
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-sm font-semibold leading-snug truncate" style="color:var(--tx);">${escHtml(d.title)}</h4>
                                        ${d.username ? `<p class="text-[11px] truncate mt-0.5" style="color:var(--tx-m);">${escHtml(d.username)}</p>` : ''}
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0 ml-2" style="${bm ? 'visibility:hidden;' : ''}">
                                    <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${d.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                        <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                    </button>
                                    <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-auto flex items-center justify-between border-t" style="border-color:var(--brd); padding-top: 16px;">
                                <div class="flex items-center gap-1.5">
                                    <span class="cat-badge cat-credential">${t('credential')}</span>
                                    ${credRotationInfo(d).stale ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" style="background:rgba(245,158,11,0.15);color:#f59e0b;" title="Not rotated in ${credRotationInfo(d).ageDays} days"><i class="fa-solid fa-rotate" style="font-size:9px;"></i> ${credRotationInfo(d).ageDays}d</span>` : ''}
                                </div>
                                <div class="flex items-center gap-1" style="${bm ? 'visibility:hidden;' : ''}">
                                    ${d.username ? `<button class="text-xs p-1.5 rounded flex items-center gap-1.5" style="color:var(--tx-m);transition:all .15s;" data-onmouseenter="this.style.color='var(--tx)';this.style.background='var(--card-h)'" data-onmouseleave="this.style.color='var(--tx-m)';this.style.background='transparent'" data-onclick="event.stopPropagation();copyUsername('${d.id}', this)"><i class="fa-solid fa-copy"></i> ${t('copyUsername')}</button>` : ''}
                                    <button class="text-xs p-1.5 rounded flex items-center gap-1.5" style="color:var(--tx-m);transition:all .15s;" data-onmouseenter="this.style.color='var(--tx)';this.style.background='var(--card-h)'" data-onmouseleave="this.style.color='var(--tx-m)';this.style.background='transparent'" data-onclick="event.stopPropagation();copyPassword('${d.id}', this)"><i class="fa-solid fa-copy"></i> ${t('copyPassword')}</button>
                                </div>
                            </div>
                        </div>`;
                    }
                    return `
                    <div class="${cardCls(d.id)}" data-onclick="${cardAction(d.id)}" style="position:relative;">
                        ${batchCheckbox(d.id)}
                        <div class="flex items-start justify-between mb-2.5">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="cat-badge ${getCatMeta(d.category).cls}">${getCatMeta(d.category).label}</span>
                                ${d.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(d.subfolder)}</span>` : ''}
                                <span class="st-badge st-${d.status}">${d.status}</span>
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2" style="${bm ? 'visibility:hidden;' : ''}">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${d.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>
                        <h4 class="text-sm font-semibold mb-1.5 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>
                        <p class="text-xs leading-relaxed flex-1 mb-3" style="color:var(--tx-d);">${excerpt(d.content, 100)}</p>
                        <div class="flex items-center gap-1.5 flex-wrap mb-3">
                            ${d.tags.slice(0, 3).map(tg => `<span class="tag">${escHtml(tg)}</span>`).join('')}
                            ${d.tags.length > 3 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 3}</span>` : ''}
                        </div>
                        <p class="text-[11px]" style="color:var(--tx-d);"><i class="fa-regular fa-clock mr-1"></i>${fmtDate(d.updatedAt)}</p>
                    </div>
                `;}).join('')}
            </div>
        `}

        <!-- Pagination -->
        ${totalPages > 1 ? `
        <div class="flex items-center justify-center gap-3 mt-6">
            <button class="btn-s text-xs px-3 py-1.5" ${state.docListPage <= 1 ? 'disabled' : ''} style="${state.docListPage <= 1 ? 'opacity:.4;cursor:not-allowed;' : ''}" data-onclick="setDocListPage(${state.docListPage - 1})"><i class="fa-solid fa-chevron-left mr-1.5" style="font-size:10px;"></i>Prev</button>
            <span class="text-xs" style="color:var(--tx-m);">Page ${state.docListPage} of ${totalPages}</span>
            <button class="btn-s text-xs px-3 py-1.5" ${state.docListPage >= totalPages ? 'disabled' : ''} style="${state.docListPage >= totalPages ? 'opacity:.4;cursor:not-allowed;' : ''}" data-onclick="setDocListPage(${state.docListPage + 1})">Next<i class="fa-solid fa-chevron-right ml-1.5" style="font-size:10px;"></i></button>
        </div>
        ` : ''}

        <!-- Batch action toolbar -->
        <div class="batch-toolbar${bm && sel.size > 0 ? ' visible' : ''}">
            <span style="font-size:12px;font-weight:700;color:var(--tx);">${sel.size}</span>
            <span style="font-size:11px;color:var(--tx-m);">selected</span>
            <div style="width:1px;height:16px;background:var(--brd);margin:0 2px;"></div>
            <button class="batch-action-btn" style="color:var(--acc);" data-onclick="showBatchTagModal()">
                <i class="fa-solid fa-tag" style="font-size:10px;"></i> Add tag
            </button>
            <button class="batch-action-btn" style="color:#818cf8;" data-onclick="showBatchFolderModal()">
                <i class="fa-regular fa-folder" style="font-size:10px;"></i> Move
            </button>
            <button class="batch-action-btn" style="color:#f87171;" data-onclick="batchDelete()">
                <i class="fa-solid fa-trash" style="font-size:10px;"></i> Delete
            </button>
        </div>
    </div>`;
}

// ========================
// BUG KANBAN
// ========================
// Legacy bugStatus value normalization (old: confirmed→open, testing→retest)
const BUG_STATUS_NORMALIZE = { confirmed: 'open', testing: 'retest' };
function _normBugStatus(s) { return BUG_STATUS_NORMALIZE[s] || s || 'new'; }

const RES_LABEL = { 'wont-fix': "Won't Fix", duplicate: 'Duplicate', rejected: 'Rejected', deferred: 'Deferred', fixed: 'Fixed' };
const RES_COLOR = { 'wont-fix': '#6b7280', duplicate: '#94a3b8', rejected: '#f87171', deferred: '#fb923c', fixed: '#34d399' };
const PRIO_COLOR = { P1: '#ef4444', P2: '#f97316', P3: '#3b82f6', P4: '#94a3b8' };

function renderBugKanban(docs, isMobileSearch) {
    const SEV_COLOR = { Critical: '#ef4444', Major: '#f97316', Minor: '#f59e0b', Trivial: '#94a3b8' };
    const showClosed = window._bugShowClosed !== false; // default show all
    const bm = state.batchMode;
    const sel = state.selectedIds;

    const cols = [
        { id: 'new',         get label() { return t('bugNew'); },        color: '#94a3b8', icon: 'fa-circle-plus' },
        { id: 'open',        get label() { return t('bugOpen'); },       color: '#60a5fa', icon: 'fa-circle-dot' },
        { id: 'in-progress', get label() { return t('bugInProgress'); }, color: '#a78bfa', icon: 'fa-spinner' },
        { id: 'resolved',    get label() { return t('bugResolved'); },   color: '#38bdf8', icon: 'fa-circle-half-stroke' },
        { id: 'retest',      get label() { return t('bugRetest'); },     color: '#c084fc', icon: 'fa-rotate' },
        { id: 'verified',    get label() { return t('bugVerified'); },   color: '#4ade80', icon: 'fa-circle-check' },
        { id: 'closed',      get label() { return t('bugClosed'); },     color: '#34d399', icon: 'fa-circle-xmark', isEnd: true },
    ];

    const closedCount = docs.filter(d => _normBugStatus(d.bugStatus) === 'closed').length;
    const visibleCols = showClosed ? cols : cols.filter(c => !c.isEnd);

    const kanbanHtml = visibleCols.map(col => {
        const colDocs = docs.filter(d => _normBugStatus(d.bugStatus) === col.id);

        return `
        <div class="flex flex-col shrink-0 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: calc(100vh - 180px); width: 260px; min-width: 260px;"
             data-ondragover="handleDragOver"
             data-ondrop="handleDrop('${col.id}')">

            <div class="p-3.5 flex items-center justify-between border-b sticky top-0" style="border-color:var(--brd); background:var(--bg2); border-top-left-radius: 0.75rem; border-top-right-radius: 0.75rem; z-index: 10;">
                <h3 class="font-heading font-semibold text-sm flex items-center gap-2" style="color:${col.color};">
                    <i class="fa-solid ${col.icon}" style="font-size: 10px;"></i> ${col.label}
                </h3>
                <span class="text-xs font-medium py-0.5 px-2 rounded-full" style="background:var(--card); color:var(--tx-m);">${colDocs.length}</span>
            </div>

            <div class="flex-1 overflow-y-auto flex flex-col custom-scrollbar" style="padding: 10px; gap: 10px;">
                ${colDocs.map(d => {
                    const sev = d.bugData?.severity || 'Minor';
                    const sevColor = SEV_COLOR[sev] || '#f59e0b';
                    const env = d.bugData?.env && d.bugData.env !== '-' ? d.bugData.env : '';
                    const browser = d.bugData?.browser && d.bugData.browser !== '-' ? d.bugData.browser : '';
                    const assignee = d.bugData?.assignee || '';
                    const resolution = d.bugData?.resolution || '';
                    const reopenCount = d.bugData?.reopenCount || 0;
                    const priority = d.bugData?.priority || '';
                    const ref = bugRef(d);
                    return `
                    <div class="doc-card flex flex-col ${!bm ? 'cursor-grab active:cursor-grabbing' : ''}${bm && sel.has(d.id) ? ' batch-selected' : ''}"
                         draggable="${!bm}"
                         data-ondragstart="handleDragStart('${d.id}')"
                         data-ondragend="handleDragEnd"
                         data-onclick="${bm ? `toggleSelectDoc('${d.id}', event)` : `viewDoc('${d.id}')`}"
                         style="background:var(--card); padding: 12px; margin-bottom: 0; border-radius: 8px; border-left: 3px solid ${sevColor}; position:relative;">

                        ${bm ? `<div style="position:absolute;top:8px;right:8px;z-index:5;pointer-events:none;">
                            <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${sel.has(d.id) ? 'var(--acc)' : 'var(--brd-l)'};background:${sel.has(d.id) ? 'var(--acc)' : 'rgba(13,21,36,0.7)'};display:flex;align-items:center;justify-content:center;">
                                ${sel.has(d.id) ? '<i class="fa-solid fa-check" style="font-size:9px;color:white;"></i>' : ''}
                            </div>
                        </div>` : ''}
                        <div class="flex items-start justify-between mb-2">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="text-[10px] font-bold px-1.5 py-0.5 rounded" style="background:${sevColor}20; color:${sevColor}; letter-spacing:.3px;">${sev.toUpperCase()}</span>
                                ${priority ? `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded" style="background:${(PRIO_COLOR[priority] || '#94a3b8')}20; color:${PRIO_COLOR[priority] || '#94a3b8'};">${priority}</span>` : ''}
                                ${resolution ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" style="background:${(RES_COLOR[resolution] || '#6b7280')}18; color:${RES_COLOR[resolution] || '#6b7280'};">${RES_LABEL[resolution] || resolution}</span>` : ''}
                                ${reopenCount > 0 ? `<span class="text-[10px] font-semibold px-1.5 py-0.5 rounded" style="background:#f8717118;color:#f87171;" title="Reopened ${reopenCount}x"><i class="fa-solid fa-rotate-left" style="font-size:8px;"></i> ${reopenCount}</span>` : ''}
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2" style="${bm ? 'visibility:hidden;' : ''}">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${d.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>

                        <h4 class="text-sm font-semibold mb-2 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>

                        ${assignee ? `<p class="text-[10px] mb-1.5 flex items-center gap-1" style="color:var(--tx-d);"><i class="fa-solid fa-user" style="font-size:8px;"></i> ${escHtml(assignee)}</p>` : ''}
                        ${env || browser ? `<p class="text-[10px] mb-2 truncate" style="color:var(--tx-d);"><i class="fa-solid fa-bug mr-1"></i>${[env, browser].filter(Boolean).join(' · ')}</p>` : ''}

                        <div class="flex items-center gap-1.5 flex-wrap mt-auto pt-2 border-t" style="border-color:var(--brd);">
                            ${ref ? `<span class="text-[10px] font-mono font-semibold" style="color:var(--tx-d);">${ref}</span>` : ''}
                            ${d.tags.slice(0, 2).map(tg => `<span class="tag">${escHtml(tg)}</span>`).join('')}
                            ${d.tags.length > 2 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 2}</span>` : ''}
                            <span class="text-[10px] ml-auto" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                        </div>
                    </div>`;
                }).join('')}

                ${colDocs.length === 0 ? `
                    <div class="py-6 text-center border-2 border-dashed rounded-lg" style="border-color:var(--brd); color:var(--tx-d);">
                        <p class="text-[11px] font-medium">${t('dragBugHere')}</p>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    return `<div class="fade-up max-w-full">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;debouncedRenderContent();"></div>` : ''}

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-5">
            ${renderSelect('bug-status-filter', [
                {value: 'all', label: t('allStatus')},
                {value: 'published', label: 'Published'},
                {value: 'draft', label: 'Draft'},
                {value: 'archived', label: 'Archived'}
            ], state.statusFilter, 'text-sm !w-auto min-w-[130px]', 'applyStatusFilter(this.value)')}
            <button class="btn-s text-xs flex items-center gap-1.5" style="${showClosed ? 'color:var(--acc);' : 'color:var(--tx-d);'}" data-onclick="window._bugShowClosed=!window._bugShowClosed;renderContent();">
                <i class="fa-solid fa-${showClosed ? 'eye-slash' : 'eye'}" style="font-size:10px;"></i>
                ${showClosed ? 'Hide' : 'Show'} Closed${!showClosed && closedCount > 0 ? ` (${closedCount})` : ''}
            </button>
            <div class="flex-1"></div>
            ${docs.length > 0 ? `
                ${bm ? `<span class="text-xs font-semibold" style="color:var(--acc);">${sel.size} selected</span>` : ''}
                <button class="text-xs py-1 px-2.5 rounded-md border font-medium" style="border-color:var(--brd);color:var(--tx-m);background:transparent;transition:all .15s;" data-onclick="toggleBatchMode()">
                    ${bm ? '✕ Cancel' : '<i class="fa-regular fa-square-check" style="margin-right:5px;font-size:11px;"></i>Select'}
                </button>
            ` : ''}
            <button class="btn-s text-sm flex items-center gap-1.5" data-onclick="exportBugsCsv()" title="Export bugs to CSV"><i class="fa-solid fa-file-csv" style="font-size:11px;"></i> CSV</button>
            <button class="btn-p text-sm" data-onclick="createDoc('bug')"><i class="fa-solid fa-plus mr-1.5"></i>${t('newBug')}</button>
        </div>

        <!-- Bug Kanban Container -->
        <div class="overflow-x-auto pb-4 custom-scrollbar">
            <div class="flex items-start mx-auto w-max" style="min-height: 400px; gap: 1.25rem;">
                ${kanbanHtml}
            </div>
        </div>

        <!-- Batch action toolbar -->
        <div class="batch-toolbar${bm && sel.size > 0 ? ' visible' : ''}">
            <span style="font-size:12px;font-weight:700;color:var(--tx);">${sel.size}</span>
            <span style="font-size:11px;color:var(--tx-m);">selected</span>
            <div style="width:1px;height:16px;background:var(--brd);margin:0 2px;"></div>
            <button class="batch-action-btn" style="color:var(--acc);" data-onclick="showBatchBugEditModal()">
                <i class="fa-solid fa-pen" style="font-size:10px;"></i> Edit Severity/Priority/Assignee
            </button>
            <button class="batch-action-btn" style="color:#f87171;" data-onclick="batchDelete()">
                <i class="fa-solid fa-trash" style="font-size:10px;"></i> Delete
            </button>
        </div>
    </div>`;
}

// ========================
// KANBAN BOARD
// ========================
function renderKanbanBoard(docs, isMobileSearch) {
    const cols = [
        { id: 'todo', get label() { return t('todo'); }, color: '#64748b' },
        { id: 'in-progress', get label() { return t('inProgress'); }, color: '#3b82f6' },
        { id: 'review', get label() { return t('review'); }, color: '#f59e0b' },
        { id: 'done', get label() { return t('done'); }, color: '#10b981' }
    ];

    const kanbanHtml = cols.map(col => {
        const colDocs = docs.filter(d => (d.kanbanStatus || 'todo') === col.id);

        return `
        <div class="flex flex-col shrink-0 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: calc(100vh - 180px); width: 300px; min-width: 300px;"
             data-ondragover="handleDragOver"
             data-ondrop="handleDrop('${col.id}')">

            <div class="p-4 flex items-center justify-between border-b sticky top-0" style="border-color:var(--brd); background:var(--bg2); border-top-left-radius: 0.75rem; border-top-right-radius: 0.75rem; z-index: 10;">
                <h3 class="font-heading font-semibold text-sm flex items-center gap-2" style="color:${col.color};">
                    <i class="fa-solid fa-circle" style="font-size: 8px;"></i> ${col.label}
                </h3>
                <span class="text-xs font-medium py-0.5 px-2 rounded-full" style="background:var(--card); color:var(--tx-m);">${colDocs.length}</span>
            </div>

            <div class="flex-1 overflow-y-auto flex flex-col custom-scrollbar" style="padding: 12px; gap: 12px;">
                ${colDocs.map(d => `
                    <div class="doc-card flex flex-col cursor-grab active:cursor-grabbing"
                         draggable="true"
                         data-ondragstart="handleDragStart('${d.id}')"
                         data-ondragend="handleDragEnd"
                         data-onclick="viewDoc('${d.id}')"
                         style="background:var(--card); padding: 14px; margin-bottom: 0px; border-radius: 8px;">

                        <div class="flex items-start justify-between mb-2">
                            <span class="st-badge st-${d.status}">${d.status}</span>
                            <div class="flex items-center gap-1 shrink-0 ml-2">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${d.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>

                        <h4 class="text-sm font-semibold mb-2 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>

                        <div class="flex items-center gap-1.5 flex-wrap mt-auto pt-2 border-t" style="border-color:var(--brd);">
                            ${d.tags.slice(0, 2).map(tg => `<span class="tag">${escHtml(tg)}</span>`).join('')}
                            ${d.tags.length > 2 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 2}</span>` : ''}
                            <span class="text-[10px] ml-auto" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                        </div>
                    </div>
                `).join('')}

                ${colDocs.length === 0 ? `
                    <div class="py-6 text-center border-2 border-dashed rounded-lg" style="border-color:var(--brd); color:var(--tx-d);">
                        <p class="text-[11px] font-medium">${t('dragTaskHere')}</p>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    return `<div class="fade-up max-w-full">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchTasks')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;debouncedRenderContent();"></div>` : ''}

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-5">
            ${renderSelect('kb-status-filter', [
                {value: 'all', label: t('allStatus')},
                {value: 'published', label: 'Published'},
                {value: 'draft', label: 'Draft'},
                {value: 'archived', label: 'Archived'}
            ], state.statusFilter, 'text-sm !w-auto min-w-[130px]', 'applyStatusFilter(this.value)')}
            <div class="flex-1"></div>
            <button class="btn-p text-sm" data-onclick="createDoc('task')"><i class="fa-solid fa-plus mr-1.5"></i>${t('newTask')}</button>
        </div>

        <!-- Kanban Board Container -->
        <div class="overflow-x-auto pb-4 custom-scrollbar">
            <div class="flex items-start mx-auto w-max" style="min-height: 400px; gap: 1.25rem;">
                ${kanbanHtml}
            </div>
        </div>
    </div>`;
}
