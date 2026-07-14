// ========================
// THEME
// ========================
window.resetLockFormState = function() {
    const pwdInput = document.getElementById('master-password');
    if (pwdInput) pwdInput.value = '';

    const recoveryInput = document.getElementById('recovery-code-input');
    if (recoveryInput) recoveryInput.value = '';

    const submitBtn = document.getElementById('lock-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Unlock Vault';
    }

    const recoverBtn = document.getElementById('recover-submit-btn');
    if (recoverBtn) {
        recoverBtn.disabled = false;
        recoverBtn.textContent = 'Recover Access';
    }

    const recoveryPanel = document.getElementById('lock-recovery-panel');
    if (recoveryPanel) recoveryPanel.classList.add('hidden');

    const recoveryToggle = document.getElementById('lock-recovery-toggle');
    const recoveryToggleBtn = recoveryToggle?.querySelector('button');
    if (recoveryToggleBtn) recoveryToggleBtn.textContent = 'Forgot password?';
};

window.lockVault = function() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) { toast('Demo mode — no real vault to lock.', 'info'); return; }
    if (!LocalAuth.isConfigured()) { toast('No master password set — nothing to lock.', 'info'); return; }
    sessionStorage.removeItem(LocalAuth.SESSION_KEY);
    sessionStorage.removeItem(LocalAuth.SESSION_PWD);

    // Reset lock screen to clean state before showing
    resetLockFormState();
    updateLockSecurityState();

    document.getElementById('lock-screen').classList.remove('hidden');
};

window.updateLockSecurityState = function() {
    const hint = LocalAuth.getHint ? LocalAuth.getHint() : '';
    const hasRecovery = !!localStorage.getItem(LocalAuth.RECOVERY_KEY);
    const hintBox = document.getElementById('lock-pwd-hint');
    const hintTextEl = document.getElementById('lock-pwd-hint-text');
    const recoveryPanel = document.getElementById('lock-recovery-panel');
    const recoveryToggle = document.getElementById('lock-recovery-toggle');

    if (hintTextEl) hintTextEl.textContent = hint;
    if (hintBox) hintBox.classList.add('hidden');
    if (recoveryPanel) recoveryPanel.classList.add('hidden');
    if (recoveryToggle) {
        const btn = recoveryToggle.querySelector('button');
        if (btn) btn.textContent = 'Forgot password?';
        recoveryToggle.classList.toggle('hidden', !hint && !hasRecovery);
    }
};

window.toggleLockRecovery = function(button) {
    const hint = LocalAuth.getHint ? LocalAuth.getHint() : '';
    const hasRecovery = !!localStorage.getItem(LocalAuth.RECOVERY_KEY);
    const hintBox = document.getElementById('lock-pwd-hint');
    const recoveryPanel = document.getElementById('lock-recovery-panel');
    const isOpening = Boolean(
        (hint && hintBox?.classList.contains('hidden')) ||
        (hasRecovery && recoveryPanel?.classList.contains('hidden'))
    );

    if (hintBox) hintBox.classList.toggle('hidden', !(isOpening && hint));
    if (recoveryPanel) recoveryPanel.classList.toggle('hidden', !(isOpening && hasRecovery));
    if (!isOpening) {
        const recoveryInput = document.getElementById('recovery-code-input');
        if (recoveryInput) recoveryInput.value = '';
    }
    if (button) button.textContent = isOpening ? 'Cancel recovery' : 'Forgot password?';
};

// ========================
// SYNC PENDING INDICATOR (Sprint 13, A1)
// ========================
window.updateSyncIndicator = function() {
    const dot = document.getElementById('sync-pending-dot');
    if (dot) dot.classList.toggle('hidden', !DocStorage.hasPendingSync());
};

window.initTheme = function() {
    const saved = localStorage.getItem('qahub_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
};
window.toggleTheme = function() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('qahub_theme', next);
};

// ========================
// TOAST
// ========================
function toast(msg, type = 'success') {
    const el = document.createElement('div');
    const colors = { success: 'border-l-4 border-emerald-500', error: 'border-l-4 border-rose-500', info: 'border-l-4 border-cyan-500' };
    const icons = { success: 'fa-check-circle text-emerald-400', error: 'fa-exclamation-circle text-rose-400', info: 'fa-info-circle text-cyan-400' };
    el.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg ${colors[type] || colors.info}`;
    el.style.cssText = 'background:var(--card);pointer-events:auto;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="text-sm" style="color:var(--tx);">${msg}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3000);
}

function setButtonBusy(button, busy, busyLabel = 'Working...') {
    if (!button) return;
    if (busy) {
        if (!button.dataset.idleHtml) button.dataset.idleHtml = button.innerHTML;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        button.classList.add('is-busy');
        button.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>' + escHtml(busyLabel) + '</span>';
        return;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-busy');
    if (button.dataset.idleHtml) {
        button.innerHTML = button.dataset.idleHtml;
        delete button.dataset.idleHtml;
    }
}

// ========================
// INTERACTION ACCESSIBILITY
// ========================
function enhanceInteractionSemantics(root = document, syncLayout = true) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    const actions = [];
    if (scope instanceof Element && scope.matches('[data-onclick]')) actions.push(scope);
    actions.push(...scope.querySelectorAll('[data-onclick]'));

    actions.forEach(element => {
        if (element.getAttribute('aria-hidden') === 'true') return;
        const nativeControl = element.matches('button, a[href], input, select, textarea, summary');
        if (!nativeControl) {
            if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
            if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '0');
        }
    });

    scope.querySelectorAll('button:not([type])').forEach(button => { button.type = 'button'; });
    scope.querySelectorAll('button[title]').forEach(button => {
        if (!button.getAttribute('aria-label') && !button.textContent.trim()) {
            button.setAttribute('aria-label', button.title);
        }
    });
    scope.querySelectorAll('.nav-item').forEach(item => {
        if (item.classList.contains('active')) item.setAttribute('aria-current', 'page');
        else item.removeAttribute('aria-current');
    });
    if (syncLayout) syncSidebarAccessibility();
}

function syncSidebarAccessibility() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const hiddenOffCanvas = window.matchMedia('(max-width: 767px)').matches && !state.sidebarOpen;
    sidebar.inert = hiddenOffCanvas;
    sidebar.toggleAttribute('inert', hiddenOffCanvas);
    if (hiddenOffCanvas) sidebar.setAttribute('aria-hidden', 'true');
    else sidebar.removeAttribute('aria-hidden');
}

window.addEventListener('resize', syncSidebarAccessibility);

// ========================
// MODAL
// ========================
// Modal focus management (Sprint 19, 19-2): move focus into the modal on
// open, trap Tab/Shift+Tab so it can't escape to the page behind it, and
// restore focus to whatever triggered the modal on close.
let _modalPreviouslyFocusedEl = null;

function _modalFocusables() {
    const m = document.getElementById('modal');
    if (!m) return [];
    return Array.from(m.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(el => el.offsetParent !== null);
}

function _modalTrapHandler(e) {
    if (e.key !== 'Tab') return;
    const m = document.getElementById('modal');
    if (!m || m.classList.contains('hidden')) return;
    const focusables = _modalFocusables();
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

function showModal(html) {
    const m = document.getElementById('modal');
    _modalPreviouslyFocusedEl = document.activeElement;
    m.className = 'fixed inset-0 z-[90] flex items-center justify-center modal-bg';
    m.innerHTML = `<div class="fade-up rounded-xl p-6 w-full max-w-lg mx-4" role="dialog" aria-modal="true" tabindex="-1" style="background:var(--bg2);border:1px solid var(--brd);max-height:90vh;overflow-y:auto;">${html}</div>`;
    const dialog = m.querySelector('[role="dialog"]');
    const heading = dialog?.querySelector('h1, h2, h3');
    if (heading) {
        heading.id = heading.id || 'modal-title';
        dialog.setAttribute('aria-labelledby', heading.id);
    } else if (dialog) {
        dialog.setAttribute('aria-label', 'Dialog');
    }
    enhanceInteractionSemantics(m);
    m.onclick = (e) => { if (e.target === m) closeModal(); };
    document.addEventListener('keydown', _modalTrapHandler);
    const f = _modalFocusables();
    if (f.length) f[0].focus();
    else dialog?.focus();
}
function closeModal() {
    document.getElementById('modal').className = 'fixed inset-0 z-[90] hidden';
    document.removeEventListener('keydown', _modalTrapHandler);
    const prev = _modalPreviouslyFocusedEl;
    _modalPreviouslyFocusedEl = null;
    if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        try { prev.focus(); } catch (e) {}
    }
}

function showDeleteModal(id, isPermanent = false) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    const actionStr = isPermanent ? `hardDeleteDoc('${id}')` : `confirmDelete('${id}')`;
    const titleStr = isPermanent ? (t('delTitleForever') || 'Delete Permanently') : t('delTitle');
    const warningStr = isPermanent ? (t('delConfirmForever') || 'Are you sure you want to permanently delete this? It cannot be recovered.') : t('delConfirm');
    const btnStr = isPermanent ? (t('delConfirmBtnForever') || 'Permanently Delete') : t('delConfirmBtn');

    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);">
                <i class="fa-solid fa-trash text-rose-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">${titleStr}</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">${warningStr} "<strong style="color:var(--tx);">${escHtml(doc.title)}</strong>"?</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">${t('cancel')}</button>
                <button class="btn-d" data-onclick="${actionStr}">${btnStr}</button>
            </div>
        </div>
    `);
}

async function confirmDelete(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.status = 'deleted';
        doc.deletedAt = Date.now();
        doc.updatedAt = Date.now();
        ActivityLog.record('trashed', doc);
    }
    await persist();
    closeModal();
    toast(t('docDeleted'), 'success');
    if (state.view === 'viewer' || state.view === 'editor') navigate('documents', state.category);
    else render();
}

async function restoreDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.status = 'draft';
        delete doc.deletedAt;
        doc.updatedAt = Date.now();
        ActivityLog.record('restored', doc);
    }
    await persist();
    toast(t('docRestored') || "Document Restored", 'success');
    render();
}

async function hardDeleteDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) ActivityLog.record('deleted', doc);
    await DocStorage.addDeletedIds([id]);
    documents = documents.filter(d => d.id !== id);
    await persist();
    closeModal();
    toast(t('docDeletedForever') || "Permanently Deleted", 'success');
    render();
}

function showEmptyTrashModal() {
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);">
                <i class="fa-solid fa-dumpster-fire text-rose-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">${t('emptyTrashTitle') || 'Empty Trash'}</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">${t('emptyTrashConfirm') || 'Are you sure you want to permanently delete all items in the Trash? This action cannot be undone.'}</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">${t('cancel')}</button>
                <button class="btn-d" data-onclick="emptyTrash()">${t('emptyTrashBtn') || 'Empty Trash'}</button>
            </div>
        </div>
    `);
}

async function emptyTrash() {
    const trashed = documents.filter(d => d.status === 'deleted');
    if (trashed.length > 0) {
        // One summary entry rather than one per doc — emptying trash can be
        // dozens of docs at once, which would flood a 200-entry log.
        ActivityLog.record('deleted', trashed[0], { note: `emptied trash (${trashed.length} document${trashed.length > 1 ? 's' : ''})`, batchCount: trashed.length });
    }
    const trashedIds = trashed.map(d => d.id);
    await DocStorage.addDeletedIds(trashedIds);
    documents = documents.filter(d => d.status !== 'deleted');
    await persist();
    closeModal();
    toast(t('trashEmptied') || "Trash Emptied", 'success');
    render();
}

// ========================
// TEMPLATE MODAL
// ========================
function showTemplateModal() {
    const cats = Object.entries(CAT_META);
    showModal(`
        <div>
            <h3 class="font-heading font-semibold text-lg mb-1">${t('newDoc')}</h3>
            <p class="text-sm mb-5" style="color:var(--tx-m);">${t('chooseTemplate')}</p>
            <button class="tpl-card w-full mb-4 flex items-center gap-4 text-left" data-onclick="createDoc(null)">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(16,185,129,0.1);">
                    <i class="fa-solid fa-file-circle-plus" style="color:var(--acc);"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold" style="color:var(--tx);">${t('blankPage')}</p>
                    <p class="text-xs" style="color:var(--tx-d);">${t('startFromScratch')}</p>
                </div>
            </button>
            <div class="grid grid-cols-2 gap-3">
                ${cats.map(([key, meta]) => `
                    <button class="tpl-card text-left" data-onclick="createDoc('${key}')">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style="background:${meta.color}15;">
                            <i class="fa-solid ${meta.icon} text-xs" style="color:${meta.color};"></i>
                        </div>
                        <p class="text-sm font-semibold" style="color:var(--tx);">${meta.label}</p>
                        <p class="text-[11px] mt-0.5" style="color:var(--tx-d);">${t('template')} ${meta.label}</p>
                    </button>
                `).join('')}
            </div>
        </div>
    `);
}

// ========================
// SIDEBAR
// ========================
// Sprint 26: sidebar open/close now uses plain Tailwind translate utilities
// (toggled directly) instead of a hand-rolled `.open` class + inline
// `@media` block in index.html. Below `md`, `-translate-x-full`/
// `translate-x-0` (whichever this toggles on) controls visibility; at `md`
// and up, index.html's static `md:translate-x-0` always wins in the
// cascade (Tailwind emits responsive variants after the base utility, same
// specificity, so the media-scoped rule takes precedence there) regardless
// of which plain class is toggled — so this never needs to special-case
// desktop.
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mob-overlay');
    state.sidebarOpen = !state.sidebarOpen;
    sb.classList.toggle('-translate-x-full', !state.sidebarOpen);
    sb.classList.toggle('translate-x-0', state.sidebarOpen);
    ov.classList.toggle('hidden', !state.sidebarOpen);
    document.querySelectorAll('[aria-controls="sidebar"]').forEach(control => {
        control.setAttribute('aria-expanded', String(state.sidebarOpen));
        control.setAttribute('aria-label', state.sidebarOpen ? 'Close navigation' : 'Open navigation');
    });
    syncSidebarAccessibility();
}

function updateSidebar() {
    const lblDash = document.getElementById('lbl-dashboard'); if (lblDash) lblDash.textContent = t('dashboard');
    const lblDocs = document.getElementById('lbl-all-documents'); if (lblDocs) lblDocs.textContent = t('allDocuments');
    const lblFavs = document.getElementById('lbl-favorites'); if (lblFavs) lblFavs.textContent = t('favorites');
    const lblTrash = document.getElementById('lbl-trash'); if (lblTrash) lblTrash.textContent = t('trash') || 'Trash';
    const lblCats = document.getElementById('lbl-categories'); if (lblCats) lblCats.textContent = t('categories') || 'Categories';

    const activeDocs = documents.filter(d => d.status !== 'deleted');
    document.getElementById('cnt-all').textContent = activeDocs.length;
    document.getElementById('cnt-fav').textContent = activeDocs.filter(d => d.favorite).length;

    const savedViewsWrap = document.getElementById('saved-views-wrap');
    const savedViewsNav = document.getElementById('saved-views-nav');
    if (savedViewsWrap && savedViewsNav) {
        const views = (typeof _getSavedViews === 'function') ? _getSavedViews() : [];
        savedViewsWrap.classList.toggle('hidden', views.length === 0);
        const viewsHtml = views.map(v => {
            const isActive = state.view === 'documents' && state.category === (v.category || 'all') && state.statusFilter === (v.statusFilter || 'all') && state.search === (v.search || '') && state.sortBy === (v.sortBy || 'updated');
            const cls = isActive ? 'nav-item active flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm' : 'nav-item flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm';
            return `
                <div class="${cls}" style="color:var(--tx-m);cursor:pointer;" data-onclick="${actionAttr('applySavedView', v.id)}">
                    <i class="fa-regular fa-bookmark w-4 text-center text-xs"></i>
                    <span class="truncate">${escHtml(v.name)}</span>
                    <button class="text-xs shrink-0 ml-auto" style="color:var(--tx-d);" title="Remove view" data-onclick="event.stopPropagation();${actionAttr('deleteSavedView', v.id)}"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
        }).join('');
        if (typeof morphdom !== 'undefined') {
            morphdom(savedViewsNav, `<nav class="px-3 flex flex-col gap-0.5 mb-2" id="saved-views-nav">${viewsHtml}</nav>`);
        } else {
            savedViewsNav.innerHTML = viewsHtml;
        }
    }

    const catNav = document.getElementById('cat-nav');
    if (catNav) {
        let catHtml = '';
        Object.entries(CAT_META).forEach(([k, m]) => {
            const catDocs = activeDocs.filter(d => d.category === k);
            const isActiveCat = state.view === 'documents' && state.category === k && !state.subfolder;
            const cls = isActiveCat ? 'nav-item active flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm' : 'nav-item flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm';

            catHtml += `
                <div class="${cls}" style="color:var(--tx-m); cursor:pointer;" data-onclick="navigate('documents','${k}')">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background:${m.color};"></span>
                    <span class="truncate">${m.label}</span>
                    <span class="count ml-auto">${catDocs.length}</span>
                </div>
            `;

            const subfolders = [...new Set(catDocs.filter(d => d.subfolder).map(d => d.subfolder))];
            if (subfolders.length > 0) {
                subfolders.sort().forEach(sf => {
                    const sfCount = catDocs.filter(d => d.subfolder === sf).length;
                    const isActiveSf = state.view === 'documents' && state.category === k && state.subfolder === sf;
                    const sfCls = isActiveSf ? 'nav-item active flex items-center gap-2 px-3 py-1.5 rounded-r-lg text-xs ml-4 border-l-2' : 'nav-item flex items-center gap-2 px-3 py-1.5 rounded-r-lg text-xs ml-4 border-l-2';

                    catHtml += `
                        <div class="${sfCls}" style="color:var(--tx-m); cursor:pointer; border-color:${isActiveSf ? m.color : 'transparent'}; transition:all 0.2s;" data-onclick="navigate('documents','${k}','${escHtml(sf.replace(/'/g, "\\'"))}')">
                            <i class="fa-regular fa-folder w-3 text-center opacity-50"></i>
                            <span class="truncate">${escHtml(sf)}</span>
                            <span class="count ml-auto" style="font-size:10px;">${sfCount}</span>
                        </div>
                    `;
                });
            }
        });

        if (typeof morphdom !== 'undefined') {
            morphdom(catNav, `<nav class="px-3 flex flex-col gap-0.5" id="cat-nav">${catHtml}</nav>`);
        } else {
            catNav.innerHTML = catHtml;
        }
    }

    const trashCount = documents.filter(d => d.status === 'deleted').length;
    const cntTrash = document.getElementById('cnt-trash');
    if (cntTrash) cntTrash.textContent = trashCount;

    const storageEl = document.getElementById('storage-info');
    if (storageEl) storageEl.textContent = activeDocs.length + ' documents saved locally';

    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        const v = n.dataset.view;
        const c = n.dataset.cat;
        if (v === state.view && (v === 'dashboard' || v === 'favorites' || v === 'activity' || c === state.category)) {
            n.classList.add('active');
        }
    });
}

// ========================
// MARKDOWN EXPORT
// ========================
window.exportDoc = function(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    const iso = (ts) => ts ? new Date(ts).toISOString().slice(0, 10) : '';
    const tagsLine = doc.tags?.length ? `\ntags: [${doc.tags.map(tg => `"${tg.replace(/"/g, '\\"')}"`).join(', ')}]` : '';
    const folderLine = doc.subfolder ? `\nfolder: "${doc.subfolder}"` : '';

    const frontmatter = `---\ntitle: "${(doc.title || '').replace(/"/g, '\\"')}"\ncategory: ${doc.category}${tagsLine}${folderLine}\nstatus: ${doc.status || 'published'}\ncreated: ${iso(doc.createdAt)}\nupdated: ${iso(doc.updatedAt)}\n---\n\n`;
    const blob = new Blob([frontmatter + (doc.content || '')], { type: 'text/markdown;charset=utf-8' });
    const filename = (doc.title || 'document').replace(/[<>:"/\\|?*]/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.md';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported: ${filename}`, 'success');
};

// ========================
// DOCUMENT CONTEXT MENU
// ========================
function showDocMenu(id, btn) {
    const old = document.getElementById('doc-menu');
    if (old) old.remove();

    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'doc-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;padding:4px;z-index:80;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
    let menuHtml = '';
    if (state.view === 'trash') {
        menuHtml = `
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:var(--acc);transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();restoreDoc('${id}')">
                <i class="fa-solid fa-rotate-left w-4 text-center"></i> ${t('restore') || 'Restore'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-danger" style="color:#f43f5e;transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}', true)">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('deleteForever') || 'Delete Forever'} </button>
        `;
    } else {
        menuHtml = `
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:var(--c-run);transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();shareDoc('${id}')">
                <i class="fa-solid fa-share-nodes w-4 text-center"></i> ${t('share') || 'Share Link'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:var(--tx-m);transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();editDoc('${id}')">
                <i class="fa-solid fa-pen w-4 text-center"></i> ${t('edit')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:var(--tx-m);transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();duplicateDoc('${id}')">
                <i class="fa-solid fa-copy w-4 text-center"></i> ${t('duplicate')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:var(--tx-m);transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();exportDoc('${id}')">
                <i class="fa-solid fa-file-arrow-down w-4 text-center"></i> Export Markdown </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-danger" style="color:#f43f5e;transition:background .15s;" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}')">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('delete')} </button>
        `;
        const bugDoc = documents.find(d => d.id === id);
        if (bugDoc?.category === 'bug') {
            const bs = bugDoc.bugStatus || 'new';
            const isClosed = bs === 'closed';
            menuHtml += `<div style="height:1px;background:var(--brd);margin:4px 0;"></div>`;
            if (isClosed) {
                menuHtml += `<button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:#fb923c;transition:background .15s;" data-onclick="reopenBug('${id}')"><i class="fa-solid fa-rotate-left w-4 text-center"></i> ${t('bugReopen')}</button>`;
            } else {
                menuHtml += `
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:#94a3b8;transition:background .15s;" data-onclick="resolveBug('${id}','wont-fix')"><i class="fa-solid fa-ban w-4 text-center"></i> ${t('bugWontFix')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:#94a3b8;transition:background .15s;" data-onclick="promptDuplicateBug('${id}')"><i class="fa-solid fa-copy w-4 text-center"></i> ${t('bugDuplicate')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:#94a3b8;transition:background .15s;" data-onclick="resolveBug('${id}','rejected')"><i class="fa-solid fa-circle-xmark w-4 text-center"></i> ${t('bugRejected')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2 ui-hover-card" style="color:#fb923c;transition:background .15s;" data-onclick="resolveBug('${id}','deferred')"><i class="fa-solid fa-clock w-4 text-center"></i> ${t('bugDeferred')}</button>`;
            }
        }
    }
    menu.innerHTML = menuHtml;
    document.body.appendChild(menu);
    enhanceInteractionSemantics(menu);
    setTimeout(() => {
        const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 10);
}

// ========================
// COPY HELPERS
// ========================
function _copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        if (!btn) return;
        const icon = btn.querySelector('i');
        if (icon) {
            const origClass = icon.className;
            const origBtnColor = btn.style.color;
            icon.className = icon.className.replace(/fa-regular|fa-light/, 'fa-solid').replace('fa-copy', 'fa-check');
            if (origBtnColor) {
                icon.style.color = '#10b981';
                btn.style.color = '#10b981';
            }
            setTimeout(() => {
                icon.className = origClass;
                icon.style.color = '';
                btn.style.color = origBtnColor;
            }, 2000);
        }
    }).catch(() => toast(t('copyFail'), 'error'));
}
window._shareCopyFeedback = function(btn, url) { _copyText(url, btn); };
window._copyProp = function(btn) { _copyText(btn.dataset.copyValue || '', btn); };
window._copyPre = function(preId, btn) { _copyText(document.getElementById(preId)?.textContent || '', btn); };
window.openAppHome = function() {
    window.location.href = window.location.pathname;
};

window.enterGuestMode = function() {
    window.location.href = window.location.pathname + '?guest=1';
};

window.copyShareUrl = function(button) {
    const input = document.getElementById('share-url-input');
    if (!input) return;
    window._shareCopyFeedback(button, input.value);
};
