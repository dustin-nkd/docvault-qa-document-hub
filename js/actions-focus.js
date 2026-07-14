// ========================
// SAVED VIEWS (Sprint 19, 19-1)
// ========================
// A saved view is just a named snapshot of {category, statusFilter, search,
// sortBy}. Written to real localStorage like theme/lang (a UI preference,
// not vault data) — EXCEPT in guest mode, where it's skipped entirely rather
// than persisted, matching DocHistory's "leave zero trace" precedent, since
// the search text saved here could reveal what a demo visitor was looking at.
function _getSavedViews() {
    try { return JSON.parse(localStorage.getItem('docvault_saved_views') || '[]'); } catch (e) { return []; }
}
function _setSavedViews(views) {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
    localStorage.setItem('docvault_saved_views', JSON.stringify(views));
}

window.showSaveViewModal = function() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        toast('Saved views aren’t available in demo mode.', 'info');
        return;
    }
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.12);"><i class="fa-regular fa-bookmark" style="color:var(--acc);"></i></div>
            <h3 class="font-heading font-bold text-lg mb-2">Save Current View</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Saves the current category, status filter, search, and sort as a one-click shortcut in the sidebar.</p>
            <input type="text" id="save-view-name" class="form-input w-full mb-4" placeholder="e.g. My open criticals" maxlength="40">
            <div class="flex gap-3 justify-center">
                ${renderActionButton({ className: 'btn-s', action: 'closeModal', label: 'Cancel' })}
                ${renderActionButton({ className: 'btn-p', action: '_doSaveView', label: 'Save' })}
            </div>
        </div>`);
    setTimeout(() => document.getElementById('save-view-name')?.focus(), 50);
};

window._doSaveView = function() {
    const name = document.getElementById('save-view-name')?.value.trim();
    if (!name) { toast('Enter a name for this view.', 'warning'); return; }
    const views = _getSavedViews();
    views.push({ id: uid(), name, category: state.category, statusFilter: state.statusFilter, search: state.search, sortBy: state.sortBy });
    _setSavedViews(views);
    closeModal();
    render();
    toast(`Saved view "${name}".`, 'success');
};

window.applySavedView = function(id) {
    const v = _getSavedViews().find(x => x.id === id);
    if (!v) return;
    // Mirrors navigate()'s body, but restores the saved filters instead of
    // resetting them to defaults.
    if (state.view === 'editor') syncEditorState();
    pushHistory();
    state.view = 'documents';
    state.category = v.category || 'all';
    state.subfolder = '';
    state.statusFilter = v.statusFilter || 'all';
    state.search = v.search || '';
    state.sortBy = v.sortBy || 'updated';
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

window.deleteSavedView = function(id) {
    _setSavedViews(_getSavedViews().filter(v => v.id !== id));
    render();
};

// ========================
// FOCUS QUEUE WORKFLOW
// ========================
function _focusWorkflowTarget(docId, signalKey) {
    if (!FOCUS_SIGNAL_KEYS.has(signalKey)) return null;
    const doc = documents.find(item => item.id === docId && item.status !== 'deleted');
    return doc ? { doc, workflow: getFocusWorkflow(doc, signalKey) } : null;
}

function _focusTomorrowDate() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + month + '-' + day;
}

window.showFocusWorkflowModal = function(docId, signalKey) {
    const target = _focusWorkflowTarget(docId, signalKey);
    if (!target) return;
    const { doc, workflow } = target;
    const snoozeValue = getFocusWorkflowStatus(workflow) === 'snoozed' ? workflow.snoozedUntil : '';
    showModal(`
        <div class="focus-workflow-modal">
            <div class="focus-workflow-modal-head">
                <span><i class="fa-solid fa-bullseye"></i></span>
                <div><p>${t('focusWorkflow')}</p><h3>${escHtml(doc.title)}</h3></div>
            </div>
            <label>${t('focusOwner')}</label>
            <input id="focus-owner" class="form-input w-full" maxlength="80" value="${escHtml(workflow.owner)}" placeholder="${escHtml(t('focusOwnerPlaceholder'))}">
            <div class="focus-workflow-date-grid">
                <div>
                    <label>${t('focusDueDate')}</label>
                    <input id="focus-due-date" type="date" class="form-input w-full" value="${escHtml(workflow.dueDate)}">
                </div>
                <div>
                    <label>${t('focusSnoozeUntil')}</label>
                    <input id="focus-snooze-until" type="date" class="form-input w-full" min="${_focusTomorrowDate()}" value="${escHtml(snoozeValue)}">
                </div>
            </div>
            <p class="focus-workflow-hint">${t('focusWorkflowHint')}</p>
            <div class="flex justify-end gap-2 mt-5">
                ${renderActionButton({ className: 'btn-s', action: 'closeModal', label: t('cancel') })}
                ${renderActionButton({ className: 'btn-p', action: 'saveFocusWorkflow', args: [doc.id, signalKey], label: t('save') })}
            </div>
        </div>`);
};

window.saveFocusWorkflow = async function(docId, signalKey) {
    const target = _focusWorkflowTarget(docId, signalKey);
    if (!target) return;
    const owner = (document.getElementById('focus-owner')?.value || '').trim().slice(0, 80);
    const dueDate = document.getElementById('focus-due-date')?.value || '';
    const snoozedUntil = document.getElementById('focus-snooze-until')?.value || '';
    if (snoozedUntil) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil) || snoozedUntil < _focusTomorrowDate()) {
            toast(t('focusSnoozeFuture'), 'warning');
            return;
        }
    }
    setFocusWorkflow(target.doc, signalKey, { owner, dueDate, snoozedUntil });
    await persist();
    closeModal();
    renderContent();
    toast(t('focusWorkflowSaved'), 'success');
};

window.completeFocusItem = async function(docId, signalKey) {
    const target = _focusWorkflowTarget(docId, signalKey);
    if (!target) return;
    setFocusWorkflow(target.doc, signalKey, { resolvedAt: Date.now(), snoozedUntil: '' });
    await persist();
    renderContent();
    toast(t('focusMarkedDone'), 'success');
};

window.unsnoozeFocusItem = async function(docId, signalKey) {
    const target = _focusWorkflowTarget(docId, signalKey);
    if (!target) return;
    setFocusWorkflow(target.doc, signalKey, { snoozedUntil: '' });
    await persist();
    renderContent();
    toast(t('focusUnsnoozed'), 'success');
};

window.reopenFocusItem = async function(docId, signalKey) {
    const target = _focusWorkflowTarget(docId, signalKey);
    if (!target) return;
    setFocusWorkflow(target.doc, signalKey, { resolvedAt: null, snoozedUntil: '' });
    await persist();
    renderContent();
    toast(t('focusReopened'), 'success');
};
