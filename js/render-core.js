// ========================
// FILTER / SORT HELPERS
// ========================
window.applyStatusFilter = function(val) { state.statusFilter = val; renderContent(); };
window.applySortBy = function(val) { state.sortBy = val; renderContent(); };

// ========================
// HEADER
// ========================
function updateHeader() {
    const h = document.getElementById('app-header');
    let title = '', actions = '';

    if (state.view === 'dashboard') {
        title = `<h2 class="font-heading font-bold text-lg">${t('dashboard')}</h2>`;
        actions = `<button class="btn-p flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> ${t('newDoc')}</button>`;
    } else if (state.view === 'documents' || state.view === 'favorites') {
        const catLabel = state.category === 'all' ? t('allDocuments') : (state.view === 'favorites' ? t('favorites') : CAT_META[state.category]?.label + 's');
        title = `<h2 class="font-heading font-bold text-lg">${catLabel}</h2>`;
        actions = `<button class="btn-p flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> ${t('newDoc')}</button>`;
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
                <button class="btn-s" data-onclick="shareDoc('${doc ? doc.id : ''}')"><i class="fa-solid fa-share-nodes mr-1.5"></i>${t('share') || 'Share'}</button>
                <button class="btn-s" data-onclick="navigateBack()"><i class="fa-solid fa-arrow-left mr-1.5"></i>${t('back')}</button>
                ${doc && doc.category !== 'credential' ? `<button class="btn-s" data-onclick="showHistoryPanel('${doc.id}')"><i class="fa-regular fa-clock mr-1.5"></i>History</button>` : ''}
                <button class="btn-p" data-onclick="editDoc('${doc ? doc.id : ''}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
            `;
        }
    }

    const isSearchView = state.view === 'documents' || state.view === 'favorites';
    h.innerHTML = `
        <button class="md:hidden mr-1 p-2 rounded-lg" style="color:var(--tx-m);" data-onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>
        ${title}
        <div class="flex-1"></div>
        ${isSearchView ? `
            <div class="search-w hidden sm:block" style="width:280px;">
                <i class="fa-solid fa-search"></i>
                <input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();">
            </div>
        ` : ''}
        <div class="flex items-center gap-2">
        <button class="btn-s flex items-center justify-center h-[38px] gap-1.5" data-onclick="openSearch()" title="Global Search (Ctrl+K)">
            <i class="fa-solid fa-magnifying-glass"></i> <span class="hidden sm:inline">Ctrl+K</span>
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
function renderContent() {
    if (state.view === 'editor') syncEditorState();

    if (state.view !== 'viewer') {
        if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
        window.currentViewerDocId = null;
    }

    const c = document.getElementById('content');
    if (state.view === 'dashboard') updateDOM(c, renderDashboard());
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
                theme: 'dark',
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
                        theme: 'dark'
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

    // Bug severity
    const bugs = docs.filter(d => d.category === 'bug');
    const bugSev = { Critical: 0, Major: 0, Minor: 0, Trivial: 0 };
    bugs.forEach(b => { const s = b.bugData?.severity; if (s && bugSev[s] !== undefined) bugSev[s]++; });

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

    return { bugs, bugSev, runs, rPass, rFail, rBlocked, rTotal, tasks, board, stale, tcs, coverage };
}

function _renderHealthWidgets(m, inPanel) {
    const widgets = [];

    // Widget 1: Bug Severity
    if (m.bugs.length > 0) {
        const sevTotal = m.bugs.length;
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
                <p class="text-[10px] mt-2" style="color:var(--tx-d);">${sevTotal} total open</p>
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
                            <span class="text-[11px] flex-1 truncate" style="color:var(--tx-m);">${escHtml(d.title)}</span>
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
                <div class="grid grid-cols-2 gap-3">
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

    return `<div class="fade-up max-w-6xl mx-auto">

        <!-- KEY METRICS ROW -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <div class="stat-card sc-total p-4">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Total Docs</p>
                <p class="font-heading font-bold text-2xl" style="color:var(--acc);">${total}</p>
            </div>
            <div class="stat-card p-4" style="${m.bugSev.Critical > 0 ? 'border-color:#f87171;' : ''}">
                <p class="text-[11px] font-medium mb-1" style="color:var(--tx-d);">Open Bugs</p>
                <p class="font-heading font-bold text-2xl" style="color:${m.bugs.length > 0 ? '#f87171' : 'var(--tx-d)'};">${m.bugs.length}</p>
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
        <div class="grid lg:grid-cols-3 gap-6">

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
                                <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style="background:${CAT_META[d.category].color}12;">
                                    <i class="fa-solid ${CAT_META[d.category].icon} text-xs" style="color:${CAT_META[d.category].color};"></i>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-semibold truncate" style="color:var(--tx);">${escHtml(d.title)}</p>
                                    <div class="flex items-center gap-2 mt-1 flex-wrap">
                                        <span class="cat-badge ${CAT_META[d.category].cls}">${CAT_META[d.category].label}</span>
                                        <span class="st-badge st-${d.status}">${d.status}</span>
                                        <span class="text-[11px]" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                                    </div>
                                </div>
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-sm p-1 shrink-0" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
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
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${CAT_META[d.category].color};"></span>
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
// DOCUMENT LIST
// ========================
function renderDocList() {
    const docs = getFiltered();
    const isMobileSearch = state.view === 'documents' || state.view === 'favorites';

    if (state.category === 'task' && state.view === 'documents') {
        return renderKanbanBoard(docs, isMobileSearch);
    }

    const bm = state.batchMode;
    const sel = state.selectedIds;
    const inTrash = state.view === 'trash';
    const allSelected = docs.length > 0 && docs.every(d => sel.has(d.id));

    const batchCheckbox = (id) => bm ? `
        <div style="position:absolute;top:10px;right:10px;z-index:5;pointer-events:none;">
            <div style="width:18px;height:18px;border-radius:4px;border:2px solid ${sel.has(id) ? 'var(--acc)' : 'var(--brd2)'};background:${sel.has(id) ? 'var(--acc)' : 'rgba(13,21,36,0.7)'};display:flex;align-items:center;justify-content:center;transition:all .15s;">
                ${sel.has(id) ? '<i class="fa-solid fa-check" style="font-size:9px;color:white;"></i>' : ''}
            </div>
        </div>` : '';

    const cardAction = (id) => bm ? `toggleSelectDoc('${id}', event)` : `viewDoc('${id}')`;
    const cardCls = (id) => `doc-card p-4 flex flex-col${bm && sel.has(id) ? ' batch-selected' : ''}`;

    return `<div class="fade-up max-w-6xl mx-auto">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();"></div>` : ''}

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
            <span class="text-xs" style="color:var(--tx-d);">${docs.length} documents</span>
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
            <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                ${docs.map(d => {
                    if (d.category === 'credential') {
                        const domain = guessDomain(d.title);
                        const favUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
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
                                    <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                        <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                    </button>
                                    <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-auto flex items-center justify-between border-t" style="border-color:var(--brd); padding-top: 16px;">
                                <span class="cat-badge cat-credential">${t('credential')}</span>
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
                                <span class="cat-badge ${CAT_META[d.category].cls}">${CAT_META[d.category].label}</span>
                                ${d.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(d.subfolder)}</span>` : ''}
                                <span class="st-badge st-${d.status}">${d.status}</span>
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2" style="${bm ? 'visibility:hidden;' : ''}">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
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
                            ${d.tags.slice(0, 3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
                            ${d.tags.length > 3 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 3}</span>` : ''}
                        </div>
                        <p class="text-[11px]" style="color:var(--tx-d);"><i class="fa-regular fa-clock mr-1"></i>${fmtDate(d.updatedAt)}</p>
                    </div>
                `;}).join('')}
            </div>
        `}

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
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>

                        <h4 class="text-sm font-semibold mb-2 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>

                        <div class="flex items-center gap-1.5 flex-wrap mt-auto pt-2 border-t" style="border-color:var(--brd);">
                            ${d.tags.slice(0, 2).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
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
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchTasks')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();"></div>` : ''}

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
