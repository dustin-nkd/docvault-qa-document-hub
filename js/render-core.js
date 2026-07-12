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
            <button class="btn-s flex items-center justify-center h-[38px]" data-onclick="cancelEdit()"><i class="fa-solid fa-xmark mr-1.5"></i>${t('cancel')}</button>
            <button class="btn-p flex items-center justify-center h-[38px]" data-onclick="saveDoc()"><i class="fa-solid fa-check mr-1.5"></i>${t('save')}</button>
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
    } else if (state.view === 'focus') {
        title = `<h2 class="font-heading font-bold text-lg">${t('focus')}</h2>`;
    } else if (state.view === 'traceability') {
        title = `<h2 class="font-heading font-bold text-lg">${t('traceability')}</h2>`;
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
    else if (state.view === 'focus') updateDOM(c, renderFocus());
    else if (state.view === 'traceability') updateDOM(c, renderTraceability());
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

function _renderInsightCards(m) {
    const passRate = m.rTotal > 0 ? Math.round(m.rPass / m.rTotal * 100) : null;
    const passColor = passRate === null ? 'var(--tx-d)' : passRate >= 80 ? '#34d399' : passRate >= 60 ? '#fb923c' : '#f87171';
    const activeTasks = (m.board.inProgress || 0) + (m.board.review || 0);
    const coveredIds = new Set(m.runs.flatMap(run => run.runData?.targetIds || []));
    const coveredCases = m.tcs.filter(tc => coveredIds.has(tc.id)).length;
    const coverageRate = m.tcs.length > 0 ? Math.round(coveredCases / m.tcs.length * 100) : null;
    const coverageColor = coverageRate === null ? 'var(--tx-d)' : coverageRate >= 80 ? '#34d399' : coverageRate >= 50 ? '#fb923c' : '#f87171';

    const segments = parts => {
        const visible = parts.filter(part => part.count > 0);
        if (visible.length === 0) return `<span style="flex:1;background:var(--brd);"></span>`;
        return visible.map(part => `<span style="flex:${part.count};background:${part.color};" title="${escHtml(part.label)}: ${part.count}"></span>`).join('');
    };

    const legend = items => `<div class="insight-legend">${items.map(item => `
        <span><i style="background:${item.color};"></i><em>${item.label}</em><b>${item.count}</b></span>`).join('')}</div>`;

    const resultParts = [
        { label: t('pass'), count: m.rPass, color: '#34d399' },
        { label: t('fail'), count: m.rFail, color: '#f87171' },
        { label: t('blocked'), count: m.rBlocked, color: '#fb923c' }
    ];
    const defectParts = [
        { label: t('dbActiveBugs'), count: m.openBugs.length, color: '#f87171' },
        { label: t('bugRetest'), count: m.bugLifecycle.retest, color: '#c084fc' },
        { label: t('bugClosed'), count: m.bugLifecycle.closed, color: '#34d399' }
    ];
    const taskParts = [
        { label: t('todo'), count: m.board.todo, color: 'var(--tx-d)' },
        { label: t('inProgress'), count: m.board.inProgress, color: '#60a5fa' },
        { label: t('review'), count: m.board.review, color: '#fb923c' },
        { label: t('done'), count: m.board.done, color: '#34d399' }
    ];

    return `<section class="dashboard-snapshot">
        <div class="dashboard-section-head">
            <h3>${t('dbSnapshot')}</h3>
            <p>${t('dbSnapshotSub')}</p>
        </div>
        <div class="dashboard-insights">
            <button class="insight-card" style="--insight-color:${passColor};" data-onclick="navigate('documents','testrun')">
                <span class="insight-card-icon"><i class="fa-solid fa-vial-circle-check"></i></span>
                <span class="insight-card-label">${t('dbTestPassRate')}</span>
                <strong style="color:${passColor};">${passRate !== null ? passRate + '%' : '—'}</strong>
                <small>${m.runs.length > 0 ? t('dbAcrossRuns', { n: m.runs.length }) : t('dbNoRuns')}</small>
                <span class="insight-segments">${segments(resultParts)}</span>
                ${legend(resultParts)}
            </button>

            <button class="insight-card" style="--insight-color:#f87171;" data-onclick="navigate('documents','bug')">
                <span class="insight-card-icon"><i class="fa-solid fa-bug"></i></span>
                <span class="insight-card-label">${t('dbDefectRisk')}</span>
                <strong style="color:${m.openBugs.length > 0 ? '#f87171' : '#34d399'};">${m.openBugs.length}</strong>
                <small>${t('dbCritical', { n: m.bugSev.Critical })} · ${t('dbOpenClosed', { open: m.openBugs.length, closed: m.bugLifecycle.closed })}</small>
                <span class="insight-segments">${segments(defectParts)}</span>
                ${legend([
                    { label: t('severityCritical'), count: m.bugSev.Critical, color: '#f87171' },
                    { label: t('severityMajor'), count: m.bugSev.Major, color: '#fb923c' },
                    { label: t('bugClosed'), count: m.bugLifecycle.closed, color: '#34d399' }
                ])}
            </button>

            <button class="insight-card" style="--insight-color:#60a5fa;" data-onclick="navigate('documents','task')">
                <span class="insight-card-icon"><i class="fa-solid fa-list-check"></i></span>
                <span class="insight-card-label">${t('dbDeliveryFlow')}</span>
                <strong style="color:${activeTasks > 0 ? '#60a5fa' : 'var(--tx-d)'};">${activeTasks}</strong>
                <small>${t('dbInProgressReview')}</small>
                <span class="insight-segments">${segments(taskParts)}</span>
                ${legend(taskParts)}
            </button>

            <button class="insight-card" style="--insight-color:${coverageColor};" data-onclick="navigate('documents','testcases')">
                <span class="insight-card-icon"><i class="fa-solid fa-shield-halved"></i></span>
                <span class="insight-card-label">${t('dbCoverage')}</span>
                <strong style="color:${coverageColor};">${coverageRate !== null ? coverageRate + '%' : '—'}</strong>
                <small>${t('dbCasesCovered', { covered: coveredCases, total: m.tcs.length })}</small>
                <span class="insight-modules">
                    ${m.coverage.length === 0 ? `<span class="insight-empty">${t('trDocEmpty', { range: t('trAllRange') })}</span>` : m.coverage.slice(0, 3).map(module => `
                        <span class="insight-module-row">
                            <em title="${escHtml(module.name)}">${escHtml(module.name)}</em>
                            <i><b style="width:${module.pct}%;background:${module.pct >= 80 ? '#34d399' : module.pct >= 50 ? '#fb923c' : '#f87171'};"></b></i>
                            <strong>${module.pct}%</strong>
                        </span>`).join('')}
                </span>
            </button>
        </div>
    </section>`;
}

function _renderAttentionPanel(m) {
    const now = Date.now();
    const items = [];
    const used = new Set();

    const bugAge = bug => {
        const hours = Math.max(0, Math.floor((now - (bug.createdAt || now)) / 3600000));
        return hours < 48 ? t('dbAgeHours', { n: hours }) : t('dbAgeDays', { n: Math.floor(hours / 24) });
    };

    m.criticalAging.forEach(bug => {
        used.add(bug.id);
        items.push({
            doc: bug,
            icon: 'fa-triangle-exclamation',
            color: '#f87171',
            label: t('dbCriticalOverdue'),
            meta: `${bugRef(bug)} · ${bugAge(bug)}`
        });
    });

    m.bugs
        .filter(bug => _normBugStatus(bug.bugStatus) === 'retest' && !used.has(bug.id))
        .forEach(bug => {
            used.add(bug.id);
            items.push({
                doc: bug,
                icon: 'fa-rotate',
                color: '#c084fc',
                label: t('dbReadyRetest'),
                meta: bugRef(bug)
            });
        });

    m.stale
        .filter(doc => !used.has(doc.id))
        .forEach(doc => {
            const days = Math.max(30, Math.floor((now - (doc.updatedAt || now)) / 86400000));
            items.push({
                doc,
                icon: 'fa-clock-rotate-left',
                color: '#fb923c',
                label: t('dbStaleDoc'),
                meta: t('dbStaleDays', { n: days })
            });
        });

    const visible = items.slice(0, 6);
    return `<section class="dashboard-attention ${visible.length === 0 ? 'is-clear' : 'has-items'}">
        <div class="attention-head">
            <span class="attention-head-icon"><i class="fa-solid ${visible.length > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i></span>
            <div class="min-w-0 flex-1">
                <h3>${t('dbAttention')}</h3>
                <p>${t('dbAttentionSub')}</p>
            </div>
            ${items.length > 0 ? `<span class="attention-count">${items.length}</span>` : ''}
        </div>
        ${visible.length === 0 ? `
            <div class="attention-clear">
                <div>
                    <p class="text-sm font-semibold">${t('dbAllClear')}</p>
                    <p class="text-xs mt-1" style="color:var(--tx-d);">${t('dbAllClearSub')}</p>
                </div>
            </div>` : `
            <div class="attention-list">
                ${visible.map(item => `
                    <button class="attention-item" data-onclick="viewDoc('${item.doc.id}')">
                        <span class="attention-icon" style="color:${item.color};background:${item.color}14;"><i class="fa-solid ${item.icon}"></i></span>
                        <span class="min-w-0 flex-1 text-left">
                            <span class="attention-label" style="color:${item.color};">${item.label}</span>
                            <span class="attention-title">${escHtml(item.doc.title)}</span>
                            <span class="attention-meta">${item.meta}</span>
                        </span>
                        <i class="fa-solid fa-chevron-right attention-arrow"></i>
                    </button>`).join('')}
            </div>`}
    </section>`;
}

// ========================
// DASHBOARD
// ========================
function renderDashboard() {
    const activeDocs = documents.filter(d => d.status !== 'deleted');
    const m = _getDashboardMetrics(activeDocs);

    return `<div class="fade-up max-w-6xl 2xl:max-w-[1600px] mx-auto">
        <section class="dashboard-hero">
            <div>
                <p class="dashboard-eyebrow">${t('dbEyebrow')}</p>
                <p class="dashboard-intro">${t('dbIntro')}</p>
            </div>
        </section>

        ${_renderAttentionPanel(m)}
        ${_renderInsightCards(m)}
        ${_renderTrends(activeDocs, m)}
    </div>`;
}

// ========================
// FOCUS / TODAY (C)
// ========================
function renderFocus() {
    const activeDocs = documents.filter(doc => doc.status !== 'deleted');
    const metrics = _getDashboardMetrics(activeDocs);
    const now = Date.now();
    const used = new Set();
    const age = doc => {
        const days = Math.max(0, Math.floor((now - (doc.createdAt || doc.updatedAt || now)) / 86400000));
        return days > 0 ? t('dbAgeDays', { n: days }) : t('justNow');
    };
    const critical = metrics.criticalAging.map(doc => {
        used.add(doc.id);
        return { doc, icon: 'fa-triangle-exclamation', color: '#f87171', meta: `${bugRef(doc)} · ${age(doc)}` };
    });
    const retest = metrics.bugs
        .filter(doc => _normBugStatus(doc.bugStatus) === 'retest' && !used.has(doc.id))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(doc => ({ doc, icon: 'fa-rotate', color: '#c084fc', meta: `${bugRef(doc)} · ${t('focusOpen')}` }));
    const activeWork = metrics.tasks
        .filter(doc => ['in-progress', 'review'].includes(doc.kanbanStatus || 'todo'))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .map(doc => ({
            doc,
            icon: doc.kanbanStatus === 'review' ? 'fa-eye' : 'fa-spinner',
            color: doc.kanbanStatus === 'review' ? '#fb923c' : '#60a5fa',
            meta: doc.kanbanStatus === 'review' ? t('review') : t('inProgress')
        }));
    const stale = metrics.stale
        .filter(doc => !used.has(doc.id))
        .map(doc => ({
            doc,
            icon: 'fa-clock-rotate-left',
            color: '#fbbf24',
            meta: t('focusUpdated', { n: fmtDate(doc.updatedAt) })
        }));
    const groups = [
        { id: 'critical', title: t('focusDoNow'), count: t('focusCriticalCount', { n: critical.length }), items: critical, color: '#f87171' },
        { id: 'retest', title: t('focusRetest'), count: t('focusRetestCount', { n: retest.length }), items: retest, color: '#c084fc' },
        { id: 'work', title: t('focusWork'), count: t('focusWorkCount', { n: activeWork.length }), items: activeWork, color: '#60a5fa' },
        { id: 'stale', title: t('focusStale'), count: t('focusStaleCount', { n: stale.length }), items: stale, color: '#fbbf24' }
    ];
    const activeGroups = groups.filter(group => group.items.length > 0);
    const focusItem = item => `<button class="focus-item" data-onclick="viewDoc('${item.doc.id}')">
        <span class="focus-item-icon" style="color:${item.color};background:${item.color}16;"><i class="fa-solid ${item.icon}"></i></span>
        <span class="min-w-0 flex-1 text-left">
            <strong>${escHtml(item.doc.title)}</strong>
            <small>${item.meta}</small>
        </span>
        <i class="fa-solid fa-chevron-right focus-item-arrow"></i>
    </button>`;

    return `<div class="fade-up max-w-5xl mx-auto focus-page">
        <section class="focus-hero">
            <div>
                <p class="dashboard-eyebrow">${t('focus')}</p>
                <h3>${t('focusTitle')}</h3>
                <p>${t('focusSub')}</p>
            </div>
            <div class="focus-total"><b>${activeGroups.reduce((total, group) => total + group.items.length, 0)}</b><span>${t('dbAttention')}</span></div>
        </section>
        ${activeGroups.length === 0 ? `<section class="focus-clear">
            <i class="fa-solid fa-circle-check"></i><p>${t('focusClear')}</p>
        </section>` : `<div class="focus-grid">${activeGroups.map(group => `<section class="focus-group">
            <div class="focus-group-head">
                <span class="focus-group-icon" style="color:${group.color};background:${group.color}16;"><i class="fa-solid ${group.id === 'critical' ? 'fa-fire-flame-curved' : group.id === 'retest' ? 'fa-rotate' : group.id === 'work' ? 'fa-list-check' : 'fa-clock'}"></i></span>
                <div class="min-w-0 flex-1"><h4>${group.title}</h4><p>${group.count}</p></div>
                <span class="focus-group-count" style="color:${group.color};">${group.items.length}</span>
            </div>
            <div class="focus-list">${group.items.slice(0, 6).map(focusItem).join('')}</div>
        </section>`).join('')}</div>`}
    </div>`;
}

// ========================
// TRACEABILITY MATRIX (A)
// ========================
window.setTraceabilityFilter = function(filter) {
    state.traceabilityFilter = filter;
    renderContent();
};

function _traceRunOutcome(run, tcId) {
    if (!run) return 'missing';
    const values = Object.entries(run.runData?.results?.[tcId] || {})
        .filter(([key]) => key !== 'note')
        .map(([, value]) => value);
    if (values.includes('fail')) return 'fail';
    if (values.includes('blocked')) return 'blocked';
    if (values.length > 0 && values.every(value => value === 'pass')) return 'pass';
    return 'untested';
}

function renderTraceability() {
    const activeDocs = documents.filter(doc => doc.status !== 'deleted');
    const testCases = activeDocs.filter(doc => doc.category === 'testcases')
        .sort((a, b) => a.title.localeCompare(b.title));
    const runs = activeDocs.filter(doc => doc.category === 'testrun')
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const bugs = activeDocs.filter(doc => doc.category === 'bug');
    const releases = activeDocs.filter(doc => doc.category === 'release');

    const rows = testCases.map(tc => {
        const latestRun = runs.find(run => (run.runData?.targetIds || []).includes(tc.id)) || null;
        const outcome = _traceRunOutcome(latestRun, tc.id);
        const linkedBugs = bugs.filter(bug =>
            bug.bugData?.foundInTc === tc.id || bug.bugData?.linkedTc === tc.id
        );
        const activeBug = linkedBugs.some(bug => !BUG_TERMINAL_STATUSES.has(_normBugStatus(bug.bugStatus)));
        const relatedReleases = releases.filter(release =>
            (latestRun && (release.releaseData?.linkedRuns || []).includes(latestRun.id)) ||
            linkedBugs.some(bug => (release.releaseData?.linkedBugs || []).includes(bug.id))
        );
        const stateName = !latestRun || outcome === 'untested' ? 'missing'
            : activeBug || outcome === 'fail' || outcome === 'blocked' ? 'risk'
            : 'covered';
        return { tc, latestRun, outcome, linkedBugs, relatedReleases, stateName };
    });

    const summary = {
        covered: rows.filter(row => row.stateName === 'covered').length,
        risk: rows.filter(row => row.stateName === 'risk').length,
        missing: rows.filter(row => row.stateName === 'missing').length
    };
    const filter = state.traceabilityFilter || 'all';
    const visibleRows = rows.filter(row => filter === 'all' || row.stateName === filter);
    const outcomeLabels = {
        pass: t('traceCovered'), fail: t('traceAtRisk'), blocked: t('traceAtRisk'),
        untested: t('traceUntested'), missing: t('traceNoRun')
    };
    const filterButtons = [
        ['all', t('traceAll'), rows.length],
        ['risk', t('traceRisk'), summary.risk],
        ['missing', t('traceMissing'), summary.missing]
    ].map(([id, label, count]) => `
        <button class="trace-filter ${filter === id ? 'is-active' : ''}" data-onclick="setTraceabilityFilter('${id}')">
            ${label}<span>${count}</span>
        </button>`).join('');

    const docButton = (doc, cls = '') => doc
        ? `<button class="trace-link ${cls}" data-onclick="viewDoc('${doc.id}')" title="${escHtml(doc.title)}">${escHtml(doc.title)}</button>`
        : '';
    const outcomeClass = { pass: 'is-pass', fail: 'is-fail', blocked: 'is-blocked', untested: 'is-untested', missing: 'is-missing' };

    return `<div class="fade-up max-w-6xl 2xl:max-w-[1600px] mx-auto traceability-page">
        <section class="traceability-hero">
            <div>
                <p class="dashboard-eyebrow">${t('traceability')}</p>
                <p class="dashboard-intro">${t('traceSub')}</p>
            </div>
            <div class="trace-summary" aria-label="${t('traceTitle')} summary">
                <span class="trace-summary-item is-covered"><b>${summary.covered}</b>${t('traceCovered')}</span>
                <span class="trace-summary-item is-risk"><b>${summary.risk}</b>${t('traceAtRisk')}</span>
                <span class="trace-summary-item is-missing"><b>${summary.missing}</b>${t('traceMissingShort')}</span>
            </div>
        </section>
        <div class="trace-filter-bar">${filterButtons}</div>
        <div class="trace-table-wrap">
            <table class="trace-table">
                <thead><tr>
                    <th>${t('traceTestCase')}</th>
                    <th>${t('traceExecution')}</th>
                    <th>${t('traceBugs')}</th>
                    <th>${t('traceEnvironment')}</th>
                    <th>${t('traceRelease')}</th>
                </tr></thead>
                <tbody>${visibleRows.map(row => {
                    const execution = row.latestRun
                        ? `<div class="trace-cell-stack">${docButton(row.latestRun)}<span class="trace-status ${outcomeClass[row.outcome]}">${outcomeLabels[row.outcome]}</span></div>`
                        : `<span class="trace-muted">${t('traceNoRun')}</span>`;
                    const bugCell = row.linkedBugs.length
                        ? `<div class="trace-cell-stack">${row.linkedBugs.slice(0, 2).map(bug => docButton(bug, !BUG_TERMINAL_STATUSES.has(_normBugStatus(bug.bugStatus)) ? 'is-risk' : '')).join('')}${row.linkedBugs.length > 2 ? `<span class="trace-muted">+${row.linkedBugs.length - 2}</span>` : ''}</div>`
                        : `<span class="trace-muted">${t('traceNoBugs')}</span>`;
                    const releaseCell = row.relatedReleases.length
                        ? `<div class="trace-cell-stack">${row.relatedReleases.slice(0, 2).map(release => docButton(release)).join('')}${row.relatedReleases.length > 2 ? `<span class="trace-muted">+${row.relatedReleases.length - 2}</span>` : ''}</div>`
                        : `<span class="trace-muted">${t('traceNoRelease')}</span>`;
                    return `<tr class="trace-row is-${row.stateName}">
                        <td><div class="trace-tc">${docButton(row.tc)}<span>${escHtml(row.tc.tcData?.module || '')}</span></div></td>
                        <td>${execution}</td>
                        <td>${bugCell}</td>
                        <td>${row.latestRun?.runData?.environment ? `<span class="trace-env">${escHtml(row.latestRun.runData.environment)}</span>` : '<span class="trace-muted">—</span>'}</td>
                        <td>${releaseCell}</td>
                    </tr>`;
                }).join('') || `<tr><td colspan="5" class="trace-empty">${t('traceEmpty')}</td></tr>`}</tbody>
            </table>
        </div>
    </div>`;
}

// ========================
// TRENDS (B1 + B2) — quality over time, drawn client-side from stored data
// ========================
window.setTrendsRange = function(days) { state.trendsRange = days; renderContent(); };

// bucket a list of timestamps into n equal time-slots over [start, end]
function _trendBuckets(timestamps, start, end, n) {
    const counts = new Array(n).fill(0);
    const span = Math.max(end - start, 1);
    timestamps.forEach(ts => {
        let i = Math.floor((ts - start) / span * n);
        if (i < 0) i = 0; if (i >= n) i = n - 1;
        counts[i]++;
    });
    return counts;
}

// Compact "13 Apr" axis date — mirrors fmtDate()'s own use of a fixed en-US
// locale for the long-date fallback, so chart axes stay consistent with the
// rest of the app's date formatting rather than introducing a second style.
function _axisDate(ts) {
    const d = new Date(ts);
    if (!ts || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// Shared chart canvas: reserves a left gutter for Y-axis value labels and a
// bottom strip for X-axis date labels, so every trend chart can be read
// without relying solely on the prose caption below it.
const _CHART_W = 300, _CHART_H = 118, _CHART_PAD_L = 28, _CHART_PAD_R = 8, _CHART_TOP = 10, _CHART_BOT = _CHART_H - 26;

function _chartYGrid(values, y, fmt) {
    return values.map(v => `
        <line x1="${_CHART_PAD_L}" y1="${y(v).toFixed(1)}" x2="${_CHART_W - _CHART_PAD_R}" y2="${y(v).toFixed(1)}" stroke="var(--brd)" stroke-dasharray="${v === 0 ? '0' : '2 3'}" opacity="${v === 0 ? '1' : '0.6'}"/>
        <text x="${_CHART_PAD_L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--tx-d)">${fmt(v)}</text>`).join('');
}

function _chartXAxis(xLabels) {
    if (!xLabels) return '';
    return `
        <text x="${_CHART_PAD_L}" y="${_CHART_H - 6}" text-anchor="start" font-size="8" fill="var(--tx-d)">${xLabels[0]}</text>
        <text x="${_CHART_W - _CHART_PAD_R}" y="${_CHART_H - 6}" text-anchor="end" font-size="8" fill="var(--tx-d)">${xLabels[1]}</text>`;
}

// minimal, theme-aware SVG line (optional area fill) + emphasized endpoint.
// yFmt formats axis/tooltip values (e.g. add "%"); xLabels are [start, end]
// date strings shown under the chart so the time span is never a guess.
function _trendLine(vals, color, { yMax, fill, yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP, bot = _CHART_BOT;
    const max = yMax != null ? yMax : Math.max(...vals, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = vals.length;
    const x = i => _CHART_PAD_L + (n === 1 ? (w - _CHART_PAD_L - _CHART_PAD_R) / 2 : i * (w - _CHART_PAD_L - _CHART_PAD_R) / (n - 1));
    const y = v => top + (1 - v / max) * (bot - top);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const li = n - 1;
    const area = fill ? `<polygon points="${x(0).toFixed(1)},${bot} ${pts} ${x(li).toFixed(1)},${bot}" fill="${color}" opacity="0.14"/>` : '';
    const grid = _chartYGrid([max, max / 2, 0], y, fmt);
    const markers = vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === li ? 3.6 : 2.2}" fill="${color}" opacity="${i === li ? 1 : 0.55}"><title>${fmt(v)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
        ${grid}
        ${area}
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
        ${markers}
        <circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="7" fill="${color}" opacity="0.18"/>
        ${_chartXAxis(xLabels)}
    </svg>`;
}

function _trendDualLine(valsA, valsB, colorA, colorB, { yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP, bot = _CHART_BOT;
    const max = Math.max(...valsA, ...valsB, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = Math.max(valsA.length, valsB.length);
    const x = i => _CHART_PAD_L + (n === 1 ? (w - _CHART_PAD_L - _CHART_PAD_R) / 2 : i * (w - _CHART_PAD_L - _CHART_PAD_R) / (n - 1));
    const y = v => top + (1 - v / max) * (bot - top);
    const points = vals => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const markers = (vals, color) => vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === vals.length - 1 ? 3.4 : 2}" fill="${color}" opacity="${i === vals.length - 1 ? 1 : 0.55}"><title>${fmt(v)}</title></circle>`).join('');
    const grid = _chartYGrid([max, 0], y, fmt);
    return `<div>
        <svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
            ${grid}
            <polyline points="${points(valsA)}" fill="none" stroke="${colorA}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
            <polyline points="${points(valsB)}" fill="none" stroke="${colorB}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
            ${markers(valsA, colorA)}
            ${markers(valsB, colorB)}
            ${_chartXAxis(xLabels)}
        </svg>
        <div class="trend-dual-legend">
            <span><i style="background:${colorA};"></i>${t('trOpened')}</span>
            <span><i style="background:${colorB};"></i>${t('trResolved')}</span>
        </div>
    </div>`;
}

function _trendBars(vals, color, { yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP + 4, bot = _CHART_BOT;
    const max = Math.max(...vals, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = vals.length, gap = n > 12 ? 2 : 4;
    const bw = (w - _CHART_PAD_L - _CHART_PAD_R - (n - 1) * gap) / n;
    const bars = vals.map((v, i) => {
        const bh = (v / max) * (bot - top);
        const bx = _CHART_PAD_L + i * (bw + gap);
        const label = v > 0 ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${(bot - bh - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--tx-d)">${fmt(v)}</text>` : '';
        return `<g><rect x="${bx.toFixed(1)}" y="${(bot - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${color}" opacity="${i === n - 1 ? '1' : '0.55'}"><title>${fmt(v)}</title></rect>${label}</g>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
        <line x1="${_CHART_PAD_L}" y1="${bot}" x2="${w - _CHART_PAD_R}" y2="${bot}" stroke="var(--brd)"/>
        <text x="${_CHART_PAD_L - 6}" y="${(top + 3)}" text-anchor="end" font-size="8" fill="var(--tx-d)">${fmt(max)}</text>
        ${bars}
        ${_chartXAxis(xLabels)}
    </svg>`;
}

function _trendCard(title, caption, chartOrEmpty, badge = '') {
    return `<div class="doc-card p-4" style="cursor:default;">
        <div class="trend-card-head">
            <p class="text-[10px] font-bold uppercase tracking-wider" style="color:var(--tx-d);">${title}</p>
            ${badge ? `<span class="trend-estimate">${badge}</span>` : ''}
        </div>
        ${chartOrEmpty}
        ${caption ? `<p class="text-[11px] mt-2.5" style="color:var(--tx-m);font-variant-numeric:tabular-nums;">${caption}</p>` : ''}
    </div>`;
}

function _trendEmpty(msg) {
    return `<div class="flex items-center justify-center text-center" style="height:${_CHART_H - 10}px;">
        <p class="text-[11px]" style="color:var(--tx-d);">${msg}</p></div>`;
}

function _renderTrends(docs, m) {
    const rangeDays = state.trendsRange != null ? state.trendsRange : 90;
    const now = Date.now();
    const cutoff = rangeDays === 0 ? 0 : now - rangeDays * 86400000;
    const inRange = ts => rangeDays === 0 || (ts || 0) >= cutoff;
    const rangeLabel = rangeDays === 0 ? t('trAllRange') : t('trDays', { n: rangeDays });

    // ── 1 · pass-rate per test run ────────────────────────────────────────────
    const runs = (m.runs || [])
        .filter(r => r.runData?.results && inRange(r.createdAt))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const passPts = [], passDates = [];
    runs.forEach(r => {
        let p = 0, tot = 0;
        Object.values(r.runData.results).forEach(tc => Object.values(tc || {}).forEach(v => {
            if (v === 'pass' || v === 'fail' || v === 'blocked') { tot++; if (v === 'pass') p++; }
        }));
        if (tot > 0) { passPts.push(Math.round(p / tot * 100)); passDates.push(r.createdAt); }
    });
    let passChart, passCap = '';
    if (passPts.length < 2) {
        passChart = _trendEmpty(t('trPassEmpty'));
    } else {
        const last = passPts[passPts.length - 1];
        const c = last >= 80 ? '#34d399' : last >= 60 ? '#fb923c' : '#f87171';
        passChart = _trendLine(passPts, c, { yMax: 100, yFmt: v => Math.round(v) + '%', xLabels: [_axisDate(passDates[0]), _axisDate(passDates[passDates.length - 1])] });
        const delta = last - passPts[0];
        passCap = t('trPassCap', {
            runs: passPts.length,
            pct: `<b style="color:${c}">${last}%</b>`,
            delta: `${delta >= 0 ? '▲ +' : '▼ '}${delta}%`
        });
    }

    // ── 2 · bugs opened per period ────────────────────────────────────────────
    const bugTs = (m.bugs || []).map(b => b.createdAt || 0).filter(inRange).sort((a, b) => a - b);
    let bugChart, bugCap = '';
    if (bugTs.length === 0) {
        bugChart = _trendEmpty(t('trBugEmpty', { range: rangeLabel }));
    } else {
        const start = rangeDays === 0 ? bugTs[0] : cutoff;
        const n = rangeDays === 30 ? 5 : rangeDays === 90 ? 7 : 8;
        bugChart = _trendBars(_trendBuckets(bugTs, start, now, n), '#f87171', { xLabels: [_axisDate(start), _axisDate(now)] });
        bugCap = t('trBugCap', { n: `<b style="color:#f87171">${bugTs.length}</b>`, range: rangeLabel });
    }

    // ── 3 · documents created (cumulative growth) ─────────────────────────────
    const docTs = docs.map(d => d.createdAt || 0).filter(inRange).sort((a, b) => a - b);
    let docChart, docCap = '';
    if (docTs.length < 2) {
        docChart = _trendEmpty(t('trDocEmpty', { range: rangeLabel }));
    } else {
        const start = rangeDays === 0 ? docTs[0] : cutoff;
        const buckets = _trendBuckets(docTs, start, now, 8);
        let run = 0; const cum = buckets.map(c => (run += c));
        docChart = _trendLine(cum, 'var(--acc)', { fill: true, xLabels: [_axisDate(start), _axisDate(now)] });
        docCap = t('trDocCap', { n: `<b style="color:var(--acc-l)">+${docTs.length}</b>`, range: rangeLabel });
    }

    // ── B3 · bug lifecycle from recorded status_changed events ────────────────
    const terminalStatuses = BUG_TERMINAL_STATUSES;
    const lifecycleBugs = (m.bugs || [])
        .map(bug => {
            const openedAt = bug.createdAt || 0;
            let events = Array.isArray(bug.bugStatusEvents)
                ? bug.bugStatusEvents
                    .filter(event => event?.type === 'status_changed' && Number.isFinite(Number(event.ts)))
                    .map(event => ({
                        from: event.from == null ? null : _normBugStatus(event.from),
                        to: _normBugStatus(event.to),
                        ts: Number(event.ts),
                        estimated: !!event.estimated
                    }))
                    .sort((a, b) => a.ts - b.ts)
                : [];
            if (events.length === 0) {
                const current = _normBugStatus(bug.bugStatus);
                events = [{ from: null, to: 'new', ts: openedAt, estimated: true }];
                if (current !== 'new') {
                    events.push({ from: 'new', to: current, ts: Math.max(openedAt, bug.updatedAt || openedAt), estimated: true });
                }
            }
            const resolvedAt = events
                .filter(event => !terminalStatuses.has(event.from) && terminalStatuses.has(event.to))
                .map(event => event.ts);
            const statusAt = ts => {
                let status = 'new';
                events.forEach(event => { if (event.ts <= ts) status = event.to; });
                return status;
            };
            return { openedAt, resolvedAt, statusAt, estimated: events.some(event => event.estimated) };
        })
        .filter(bug => bug.openedAt > 0);
    const hasLegacyEstimate = lifecycleBugs.some(bug => bug.estimated);
    const lifecycleBadge = hasLegacyEstimate ? t('trEstimate') : '';
    const lifecycleStart = lifecycleBugs.length === 0
        ? now
        : rangeDays === 0
            ? Math.min(...lifecycleBugs.map(bug => bug.openedAt))
            : cutoff;
    const lifecycleBuckets = rangeDays === 30 ? 5 : rangeDays === 90 ? 7 : 8;
    const openedInRange = lifecycleBugs.map(bug => bug.openedAt).filter(ts => ts >= lifecycleStart && ts <= now);
    const resolvedInRange = lifecycleBugs.flatMap(bug => bug.resolvedAt).filter(ts => ts >= lifecycleStart && ts <= now);
    const openedSeries = _trendBuckets(openedInRange, lifecycleStart, now, lifecycleBuckets);
    const resolvedSeries = _trendBuckets(resolvedInRange, lifecycleStart, now, lifecycleBuckets);

    let velocityChart, velocityCap = '';
    if (openedInRange.length + resolvedInRange.length === 0) {
        velocityChart = _trendEmpty(t('trLifeEmpty', { range: rangeLabel }));
    } else {
        velocityChart = _trendDualLine(openedSeries, resolvedSeries, '#f87171', '#34d399', { xLabels: [_axisDate(lifecycleStart), _axisDate(now)] });
        velocityCap = t('trVelocityCap', {
            opened: `<b style="color:#f87171">${openedInRange.length}</b>`,
            resolved: `<b style="color:#34d399">${resolvedInRange.length}</b>`,
            range: rangeLabel
        });
    }

    let backlogChart, backlogCap = '';
    if (lifecycleBugs.length === 0) {
        backlogChart = _trendEmpty(t('trLifeEmpty', { range: rangeLabel }));
    } else {
        const backlogAt = ts => lifecycleBugs.filter(bug =>
            bug.openedAt <= ts && !terminalStatuses.has(bug.statusAt(ts))
        ).length;
        const backlogStart = backlogAt(lifecycleStart);
        const backlogSeries = [backlogStart];
        for (let i = 1; i <= lifecycleBuckets; i++) {
            backlogSeries.push(backlogAt(lifecycleStart + (now - lifecycleStart) * i / lifecycleBuckets));
        }
        const backlogNow = backlogSeries[backlogSeries.length - 1];
        const backlogDelta = backlogNow - backlogStart;
        const deltaText = backlogDelta > 0
            ? t('trDeltaUp', { n: backlogDelta })
            : backlogDelta < 0
                ? t('trDeltaDown', { n: Math.abs(backlogDelta) })
                : t('trDeltaFlat');
        backlogChart = _trendLine(backlogSeries, backlogDelta > 0 ? '#f87171' : '#fbbf24', { fill: true, xLabels: [_axisDate(lifecycleStart), _axisDate(now)] });
        backlogCap = t('trBacklogCap', {
            n: `<b style="color:${backlogDelta > 0 ? '#f87171' : '#fbbf24'}">${backlogNow}</b>`,
            delta: deltaText
        });
    }

    const rangeBtns = [[30, '30d'], [90, '90d'], [0, t('trAll')]].map(([d, l]) =>
        `<button class="px-2.5 py-1 rounded-md text-[11px] font-semibold" style="${rangeDays === d ? 'background:var(--acc);color:#fff;' : 'color:var(--tx-m);'};transition:all .15s;" data-onclick="setTrendsRange(${d})">${l}</button>`
    ).join('');

    return `<div class="dashboard-trends">
        <div class="flex items-center justify-between mb-3">
            <h3 class="font-heading font-semibold text-base">${t('trTitle')} <span class="text-[11px] font-normal" style="color:var(--tx-d);">· ${t('trSub')}</span></h3>
            <div class="flex gap-1 p-1 rounded-lg" style="background:var(--bg2);border:1px solid var(--brd);">${rangeBtns}</div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${_trendCard(t('trPassTitle'), passCap, passChart)}
            ${_trendCard(t('trBugTitle'), bugCap, bugChart)}
            ${_trendCard(t('trDocTitle'), docCap, docChart)}
        </div>
        <div class="trend-lifecycle-block">
            <div class="trend-lifecycle-head">
                <h4>${t('trLifeTitle')}</h4>
                <p>${t('trLifeSub')}</p>
            </div>
            <div class="trend-lifecycle-grid">
                ${_trendCard(t('trVelocityTitle'), velocityCap, velocityChart, lifecycleBadge)}
                ${_trendCard(t('trBacklogTitle'), backlogCap, backlogChart, lifecycleBadge)}
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
                        <p class="text-xs leading-relaxed flex-1 mb-3" style="color:var(--tx-d);">${escHtml(excerpt(d.content, 100))}</p>
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
