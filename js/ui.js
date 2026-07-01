// ========================
// THEME
// ========================
window.lockVault = function() {
    if (!LocalAuth.isConfigured()) { toast('No master password set — nothing to lock.', 'info'); return; }
    sessionStorage.removeItem(LocalAuth.SESSION_KEY);
    sessionStorage.removeItem(LocalAuth.SESSION_PWD);

    // Reset lock screen to clean state before showing
    const pwdInput = document.getElementById('master-password');
    if (pwdInput) pwdInput.value = '';
    const submitBtn = document.getElementById('lock-submit-btn');
    if (submitBtn) submitBtn.innerHTML = 'Unlock Vault';
    const recoveryPanel = document.getElementById('lock-recovery-panel');
    if (recoveryPanel) recoveryPanel.classList.add('hidden');
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
    if (button) button.textContent = isOpening ? 'Cancel recovery' : 'Forgot password?';
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

// ========================
// MODAL
// ========================
function showModal(html) {
    const m = document.getElementById('modal');
    m.className = 'fixed inset-0 z-[90] flex items-center justify-center modal-bg';
    m.innerHTML = `<div class="fade-up rounded-xl p-6 w-full max-w-lg mx-4" style="background:var(--bg2);border:1px solid var(--brd);max-height:90vh;overflow-y:auto;">${html}</div>`;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { document.getElementById('modal').className = 'fixed inset-0 z-[90] hidden'; }

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
    }
    await persist();
    toast(t('docRestored') || "Document Restored", 'success');
    render();
}

async function hardDeleteDoc(id) {
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
    const trashedIds = documents.filter(d => d.status === 'deleted').map(d => d.id);
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
function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mob-overlay');
    state.sidebarOpen = !state.sidebarOpen;
    sb.classList.toggle('open', state.sidebarOpen);
    ov.classList.toggle('hidden', !state.sidebarOpen);
}

function updateSidebar() {
    const lblDash = document.getElementById('lbl-dashboard'); if (lblDash) lblDash.textContent = t('dashboard');
    const lblDocs = document.getElementById('lbl-documents'); if (lblDocs) lblDocs.textContent = t('documents');
    const lblFavs = document.getElementById('lbl-favorites'); if (lblFavs) lblFavs.textContent = t('favorites');
    const lblTrash = document.getElementById('lbl-trash'); if (lblTrash) lblTrash.textContent = t('trash') || 'Trash';
    const lblCats = document.getElementById('lbl-categories'); if (lblCats) lblCats.textContent = t('categories') || 'Categories';

    const activeDocs = documents.filter(d => d.status !== 'deleted');
    document.getElementById('cnt-all').textContent = activeDocs.length;
    document.getElementById('cnt-fav').textContent = activeDocs.filter(d => d.favorite).length;

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
                        <div class="${sfCls}" style="color:var(--tx-m); cursor:pointer; border-color:${isActiveSf ? m.color : 'transparent'}; transition:all 0.2s;" data-onclick="navigate('documents','${k}','${sf.replace(/'/g, "\\'")}')">
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
        if (v === state.view && (v === 'dashboard' || v === 'favorites' || c === state.category)) {
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
    const tagsLine = doc.tags?.length ? `\ntags: [${doc.tags.map(t => `"${t.replace(/"/g, '\\"')}"`).join(', ')}]` : '';
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
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--acc);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();restoreDoc('${id}')">
                <i class="fa-solid fa-rotate-left w-4 text-center"></i> ${t('restore') || 'Restore'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#f43f5e;transition:background .15s;" data-onmouseenter="this.style.background='rgba(244,63,94,0.06)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}', true)">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('deleteForever') || 'Delete Forever'} </button>
        `;
    } else {
        menuHtml = `
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--c-run);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();shareDoc('${id}')">
                <i class="fa-solid fa-share-nodes w-4 text-center"></i> ${t('share') || 'Share Link'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();editDoc('${id}')">
                <i class="fa-solid fa-pen w-4 text-center"></i> ${t('edit')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();duplicateDoc('${id}')">
                <i class="fa-solid fa-copy w-4 text-center"></i> ${t('duplicate')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();exportDoc('${id}')">
                <i class="fa-solid fa-file-arrow-down w-4 text-center"></i> Export Markdown </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#f43f5e;transition:background .15s;" data-onmouseenter="this.style.background='rgba(244,63,94,0.06)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}')">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('delete')} </button>
        `;
        const bugDoc = documents.find(d => d.id === id);
        if (bugDoc?.category === 'bug') {
            const bs = bugDoc.bugStatus || 'new';
            const isClosed = bs === 'closed';
            menuHtml += `<div style="height:1px;background:var(--brd);margin:4px 0;"></div>`;
            if (isClosed) {
                menuHtml += `<button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#fb923c;transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="reopenBug('${id}')"><i class="fa-solid fa-rotate-left w-4 text-center"></i> ${t('bugReopen')}</button>`;
            } else {
                menuHtml += `
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#94a3b8;transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="resolveBug('${id}','wont-fix')"><i class="fa-solid fa-ban w-4 text-center"></i> ${t('bugWontFix')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#94a3b8;transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="promptDuplicateBug('${id}')"><i class="fa-solid fa-copy w-4 text-center"></i> ${t('bugDuplicate')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#94a3b8;transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="resolveBug('${id}','rejected')"><i class="fa-solid fa-circle-xmark w-4 text-center"></i> ${t('bugRejected')}</button>
                    <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#fb923c;transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="resolveBug('${id}','deferred')"><i class="fa-solid fa-clock w-4 text-center"></i> ${t('bugDeferred')}</button>`;
            }
        }
    }
    menu.innerHTML = menuHtml;
    document.body.appendChild(menu);
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
