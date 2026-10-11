// RENDER VIEWER SHELL
function renderViewer() {
    const doc = documents.find(d => d.id === state.editingDoc?.id);
    if (!doc) return `<div class="text-center py-20" style="color:var(--tx-d);">Document not found.</div>`;

    return `<div class="fade-up max-w-6xl 2xl:max-w-[1600px] mx-auto pb-44">
        <!-- Meta -->
        <div class="flex flex-wrap items-center gap-2.5 mb-4">
            <span class="cat-badge ${getCatMeta(doc.category).cls}">${getCatMeta(doc.category).label}</span>
            ${doc.subfolder ? `<span class="cat-badge subfolder-badge" style="background:var(--card);border:1px solid var(--brd);color:var(--tx);"><i class="fa-regular fa-folder mr-1" style="color:var(--acc);"></i>${escHtml(doc.subfolder)}</span>` : ''}
            <span class="st-badge st-${escHtml(doc.status)}">${escHtml(doc.status)}</span>
            ${(doc.tags || []).map(tg => `<span class="tag">${escHtml(tg)}</span>`).join('')}
            ${state.sharedView ? '' : `<button class="fav-btn ${doc.favorite ? 'on' : ''} text-sm ml-auto" style="color:${doc.favorite ? '#f59e0b' : 'var(--tx-d)'};" aria-label="${doc.favorite ? 'Remove from favorites' : 'Add to favorites'}" data-onclick="toggleFav('${doc.id}')">
                <i class="fa-${doc.favorite ? 'solid' : 'regular'} fa-star"></i>
            </button>`}
        </div>
        <!-- Title -->
        <h1 class="font-heading font-bold text-2xl mb-2" style="color:var(--tx);">${escHtml(doc.title)}</h1>

        <p class="text-xs mb-6" style="color:var(--tx-d);">
            Created ${fmtDate(doc.createdAt)} &middot; Updated ${fmtDate(doc.updatedAt)}
        </p>

        ${(() => {
            if (state.sharedView || doc.category !== 'testcases' || _hasStructuredTc(doc)) return '';
            const linkedBugs = documents.filter(d => d.category === 'bug' && d.status !== 'deleted'
                && (d.bugData?.linkedTc === doc.id || d.bugData?.foundInTc === doc.id))
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            if (!linkedBugs.length) return '';
            const SEV = { Critical: '#ef4444', Major: '#f97316', Minor: '#f59e0b', Trivial: '#94a3b8' };
            return `
            <div class="mb-6 linked-bugs-section">
                <p class="linked-bugs-title text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Bugs (${linkedBugs.length})</p>
                <div class="space-y-2">
                    ${linkedBugs.map(b => {
                        const sev = b.bugData?.severity;
                        return `<div class="linked-bug-item flex items-center gap-3 p-3 rounded-lg border cursor-pointer ui-hover-card" style="background:var(--bg);border-color:var(--brd);transition:background .15s;" data-onclick="viewDoc('${b.id}')">
                            <span class="bug-ref-chip text-[10px] font-mono font-bold px-2 py-0.5 rounded shrink-0" style="background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#f87171;">${bugRef(b)}</span>
                            <span class="linked-bug-title text-sm font-medium flex-1 truncate" style="color:var(--tx);">${escHtml(b.title)}</span>
                            ${sev ? `<span class="linked-bug-sev text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style="background:${(SEV[sev] || '#94a3b8')}22;color:${SEV[sev] || '#94a3b8'};">${escHtml(sev)}</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        })()}

        ${renderViewerCategory(doc)}
        <textarea id="vw-content-hidden" style="display:none;">${escHtml(doc.content)}</textarea>

        <!-- Actions bottom (hidden in shared view) -->
        ${state.sharedView ? '' : `
        <div class="viewer-bottom-actions flex flex-wrap items-center gap-3 mt-8 pt-4 border-t border-[var(--brd)] pr-0 sm:pr-48">
            <button class="btn-p" data-onclick="editDoc('${doc.id}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
            <button class="btn-s" data-onclick="duplicateDoc('${doc.id}')"><i class="fa-solid fa-copy mr-1.5"></i>${t('duplicate')}</button>
            <button class="btn-d ml-auto" data-onclick="showDeleteModal('${doc.id}')"><i class="fa-solid fa-trash mr-1.5"></i>${t('delete')}</button>
        </div>
        `}
    </div>`;
}

function _hasStructuredTc(doc) {
    if (doc?.category !== 'testcases') return false;
    const d = doc.tcData;
    if (!d) return false;
    if ((d.module && d.module.trim()) || (d.precond && d.precond.trim()) || (d.data && d.data.trim())) return true;
    return Array.isArray(d.steps) && d.steps.some(s => (s?.action && s.action.trim()) || (s?.expected && s.expected.trim()));
}

function renderTestCaseViewer(doc) {
    if (!_hasStructuredTc(doc)) return '';
    const d = doc.tcData || {};
    const mod = (d.module || '').trim(), precond = (d.precond || '').trim(), testData = (d.data || '').trim();
    const steps = (d.steps || []).filter(s => (s?.action && s.action.trim()) || (s?.expected && s.expected.trim()));
    const runs = documents.filter(r => r.category === 'testrun' && r.status !== 'deleted' && (r.runData?.targetIds || []).includes(doc.id))
        .sort((a, b) => (new Date(b.updatedAt || 0).getTime() || 0) - (new Date(a.updatedAt || 0).getTime() || 0));
    const run = runs[0] || null;
    const out = run && typeof _traceRunOutcome === 'function' ? _traceRunOutcome(run, doc.id) : 'missing';
    const badge = out === 'pass' ? { l: 'Passed', c: '#10b981', b: '#10b98120' }
        : (out === 'fail' || out === 'blocked') ? { l: 'Needs attention', c: '#ef4444', b: '#ef444420' }
        : { l: 'Incomplete', c: 'var(--tx-d)', b: 'rgba(122,139,168,0.1)' };
    const bugs = documents.filter(b => b.category === 'bug' && b.status !== 'deleted' && (b.bugData?.foundInTc === doc.id || b.bugData?.linkedTc === doc.id))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    return `<div class="testcase-viewer-card mb-6 rounded-xl overflow-hidden" style="background:var(--card);border:1px solid var(--brd);">
        <div class="px-4 py-3 flex flex-wrap items-center gap-3 text-xs" style="background:var(--bg2);border-bottom:1px solid var(--brd);">
            ${mod ? `<span class="px-2 py-0.5 rounded font-semibold" style="background:var(--card);border:1px solid var(--brd);color:var(--tx);">${escHtml(mod)}</span>` : ''}
            <span style="color:var(--tx-m);">${steps.length} ${steps.length === 1 ? 'step' : 'steps'}</span>
            ${run ? `<span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" style="background:${badge.b};color:${badge.c};">${badge.l}</span>
            ${state.sharedView ? `<span style="color:var(--tx-m);">${escHtml(run.title)}</span>` : `<button class="text-xs font-medium underline ui-hover-text" style="color:var(--tx-m);" data-onclick="viewDoc('${run.id}')">${escHtml(run.title)}</button>`}` : ''}
        </div>
        <div class="p-5">
            ${precond ? `<div class="mb-4"><p class="text-[11px] font-medium tracking-wide uppercase mb-1" style="color:var(--tx-m);">${t('tcPrecond')}</p><p class="text-sm" style="color:var(--tx);">${escHtml(precond)}</p></div>` : ''}
            ${testData ? `<div class="mb-4"><p class="text-[11px] font-medium tracking-wide uppercase mb-1" style="color:var(--tx-m);">${t('tcData')}</p><div class="text-sm font-mono p-2.5 rounded-lg" style="background:var(--bg2);border:1px solid var(--brd);color:var(--tx);">${escHtml(testData)}</div></div>` : ''}
            <div class="mb-4"><div class="rounded-lg overflow-hidden" style="border:1px solid var(--brd);">
                <div class="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style="display:grid;grid-template-columns:2rem minmax(0,1.2fr) minmax(0,1fr);gap:12px;background:var(--bg2);border-bottom:1px solid var(--brd);color:var(--tx-m);">
                    <div class="text-center">#</div><div>${t('tcAction')}</div><div>${t('tcExpected')}</div>
                </div>
                ${steps.length === 0 ? `<div class="p-4 text-xs text-center" style="color:var(--tx-m);">No steps yet.</div>` : steps.map((s, idx) => `
                <div class="px-3 py-2.5 text-xs border-b last:border-b-0 items-start" style="display:grid;grid-template-columns:2rem minmax(0,1.2fr) minmax(0,1fr);gap:12px;background:${idx % 2 ? 'var(--bg2)' : 'var(--card)'};border-color:var(--brd);color:var(--tx);">
                    <div class="text-center font-mono font-medium" style="color:var(--tx-m);">${idx + 1}</div>
                    <div class="leading-relaxed" style="white-space:pre-wrap;word-break:break-word;">${escHtml(s.action || '')}</div>
                    <div class="leading-relaxed" style="color:var(--tx-m);white-space:pre-wrap;word-break:break-word;">${escHtml(s.expected || '—')}</div>
                </div>`).join('')}
            </div></div>
            ${bugs.length ? `<div class="mt-4 pt-4 border-t" style="border-color:var(--brd);">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Bugs (${bugs.length})</p>
                <div class="space-y-2">
                    ${bugs.map(b => `<div class="linked-bug-item flex items-center gap-2.5 p-2.5 rounded-lg border ${state.sharedView ? '' : 'cursor-pointer ui-hover-card'}" style="background:var(--bg2);border-color:var(--brd);"${state.sharedView ? '' : ` data-onclick="viewDoc('${b.id}')"`}><i class="fa-solid fa-bug text-xs shrink-0" style="color:var(--c-bug);"></i><span class="bug-ref-chip text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style="background:rgba(239,68,68,0.18);border:1px solid rgba(239,68,68,0.4);color:#f87171;">${bugRef(b)}</span><span class="linked-bug-title text-sm font-medium flex-1 truncate" style="color:var(--tx);">${escHtml(b.title)}</span></div>`).join('')}
                </div>
            </div>` : ''}
        </div>
    </div>`;
}

window.updateTestRunStep = async function(runDocId, tcId, stepIdx, status) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc?.runData) return;
    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};
    doc.runData.results[tcId][stepIdx] = status;
    doc.updatedAt = Date.now();
    if (state.editingDoc?.id === runDocId) state.editingDoc = { ...doc };
    await persist();
    renderContent();
};

window.updateTestRunNote = async function(runDocId, tcId, note) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc?.runData) return;
    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};
    doc.runData.results[tcId].note = note;
    doc.updatedAt = Date.now();
    if (state.editingDoc?.id === runDocId) state.editingDoc = { ...doc };
    await persist();
};
