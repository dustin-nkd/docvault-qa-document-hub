// ========================
// RENDER VIEWER SHELL
// ========================
function renderViewer() {
    const doc = documents.find(d => d.id === state.editingDoc?.id);
    if (!doc) return `<div class="text-center py-20" style="color:var(--tx-d);">Document not found.</div>`;

    return `<div class="fade-up max-w-4xl mx-auto">
        <!-- Meta -->
        <div class="flex flex-wrap items-center gap-2.5 mb-4">
            <span class="cat-badge ${getCatMeta(doc.category).cls}">${getCatMeta(doc.category).label}</span>
            ${doc.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(doc.subfolder)}</span>` : ''}
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
            if (state.sharedView || doc.category !== 'testcases') return '';
            // A bug can reference this test case either manually (bugData.linkedTc,
            // Sprint 16) or automatically via "Report bug from step" (bugData.foundInTc,
            // B1) — show both kinds together, most recent first.
            const linkedBugs = documents.filter(d => d.category === 'bug' && d.status !== 'deleted'
                && (d.bugData?.linkedTc === doc.id || d.bugData?.foundInTc === doc.id))
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            if (!linkedBugs.length) return '';
            const SEV = { Critical: '#ef4444', Major: '#f97316', Minor: '#f59e0b', Trivial: '#94a3b8' };
            return `
            <div class="mb-6">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Bugs (${linkedBugs.length})</p>
                <div class="space-y-2">
                    ${linkedBugs.map(b => {
                        const sev = b.bugData?.severity;
                        return `<div class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer ui-hover-card" style="background:var(--bg);border-color:var(--brd);transition:background .15s;" data-onclick="viewDoc('${b.id}')">
                            <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style="background:var(--card);color:var(--c-bug);">${bugRef(b)}</span>
                            <span class="text-sm font-medium flex-1 truncate" style="color:var(--tx);">${escHtml(b.title)}</span>
                            ${sev ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style="background:${(SEV[sev] || '#94a3b8')}22;color:${SEV[sev] || '#94a3b8'};">${escHtml(sev)}</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        })()}

        ${renderViewerCategory(doc)}
        <textarea id="vw-content-hidden" style="display:none;">${escHtml(doc.content)}</textarea>

        <!-- Actions bottom (hidden in shared view) -->
        ${state.sharedView ? '' : `
        <div class="flex items-center gap-3 mt-5">
            <button class="btn-p" data-onclick="editDoc('${doc.id}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
            <button class="btn-s" data-onclick="duplicateDoc('${doc.id}')"><i class="fa-solid fa-copy mr-1.5"></i>${t('duplicate')}</button>
            <button class="btn-d ml-auto" data-onclick="showDeleteModal('${doc.id}')"><i class="fa-solid fa-trash mr-1.5"></i>${t('delete')}</button>
        </div>
        `}
    </div>`;
}

// ========================
// TEST RUN STEP / NOTE ACTIONS
// ========================
window.updateTestRunStep = async function(runDocId, tcId, stepIdx, status) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc || !doc.runData) return;

    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};

    doc.runData.results[tcId][stepIdx] = status;
    doc.updatedAt = Date.now();

    if (state.editingDoc?.id === runDocId) {
        state.editingDoc = { ...doc };
    }

    await persist();
    // Only the viewer content changes on a step result — a full render() would
    // needlessly rebuild the sidebar and header on every Pass/Fail click.
    renderContent();
};

window.updateTestRunNote = async function(runDocId, tcId, note) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc || !doc.runData) return;

    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};

    doc.runData.results[tcId].note = note;
    doc.updatedAt = Date.now();

    if (state.editingDoc?.id === runDocId) {
        state.editingDoc = { ...doc };
    }

    await persist();
};
