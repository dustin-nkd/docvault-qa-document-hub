// ========================
// WINDOW ERROR HANDLERS
// ========================
window.addEventListener('error', function(e) {
    const el = document.getElementById('debug-err');
    if (el) { el.style.display = 'block'; el.innerText += '\n' + e.message + ' at ' + e.filename + ':' + e.lineno; }
});
window.addEventListener('unhandledrejection', function(e) {
    const el = document.getElementById('debug-err');
    if (el) { el.style.display = 'block'; el.innerText += '\nPromise Error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason); }
});

// ========================
// SYNC RETRY ON RECONNECT (Sprint 13, A1)
// ========================
// Now that the PWA (Sprint 10) works fully offline, edits made offline had no
// path back to GitHub other than the user happening to save something else
// while back online. Retry the pending push as soon as connectivity returns.
window.addEventListener('online', async () => {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return; // guest mode never syncs
    if (!DocStorage._pending) return;
    if (!(await GitHubSync.isConfigured())) return;
    toast('Back online — syncing pending changes…', 'info');
    try {
        await GitHubSync.syncPush(documents);
        DocStorage._pending = false;
        if (typeof updateSyncIndicator === 'function') updateSyncIndicator();
        toast(t('ghSyncOk') || 'Synced to GitHub', 'success');
    } catch (e) {
        toast('Sync retry failed: ' + e.message, 'error');
    }
});
window.addEventListener('offline', () => {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
    toast('You are offline — changes will sync automatically once you reconnect.', 'warning');
});

// ========================
// KEYBOARD SHORTCUTS
// ========================
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && state.view === 'editor') {
        e.preventDefault();
        saveDoc();
    }
    if (e.key === 'Escape') {
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) { closeModal(); return; }
        const menu = document.getElementById('doc-menu');
        if (menu) { menu.remove(); return; }
        if (state.view === 'editor') {
            // Route through the same unsaved-changes guard as the Cancel button
            // (Sprint 15), instead of navigating away unconditionally.
            cancelEdit();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k' && (state.view === 'documents' || state.view === 'favorites')) {
        e.preventDefault();
        const inp = document.querySelector('.search-w input');
        if (inp) inp.focus();
    }
});

// ========================
// IMAGE PASTE / DROP IN TEXTAREAS
// ========================
document.addEventListener('paste', async (e) => {
    const target = e.target;
    if (target.tagName === 'TEXTAREA' && !target.closest('.toastui-editor-defaultUI')) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file') {
                const blob = item.getAsFile();
                if (blob && blob.type.startsWith('image/')) {
                    e.preventDefault();
                    const startPos = target.selectionStart;
                    const endPos = target.selectionEnd;
                    const uploadingText = '![Uploading image...]()';
                    target.value = target.value.substring(0, startPos) + uploadingText + target.value.substring(endPos);

                    uploadImageToCloud(blob, (url) => {
                        target.value = target.value.replace(uploadingText, `![Image](${url})`);
                        if(target.onchange) target.onchange();
                    });
                }
            }
        }
    }
});

document.addEventListener('drop', async (e) => {
    const target = e.target;
    if (target.tagName === 'TEXTAREA' && !target.closest('.toastui-editor-defaultUI')) {
        const files = e.dataTransfer.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
            e.preventDefault();
            const blob = files[0];
            const startPos = target.selectionStart || target.value.length;
            const uploadingText = '![Uploading image...]()\n';
            target.value = target.value.substring(0, startPos) + uploadingText + target.value.substring(startPos);

            uploadImageToCloud(blob, (url) => {
                target.value = target.value.replace(uploadingText, `![Image](${url})\n`);
                if(target.onchange) target.onchange();
            });
        }
    }
});

// Close doc context menu on content scroll
document.getElementById('content')?.addEventListener('scroll', () => {
    const menu = document.getElementById('doc-menu');
    if (menu) menu.remove();
});

// ========================
// INIT & APP START
// ========================
async function init() {
    await hydrate();
    render();
}

async function startApp() {
    initTheme();
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        // Guest demo: skip LocalAuth and GitHubSync entirely — no lock screen, no
        // password hash checks, no real-token bootstrap/pull/push. Just load the
        // isolated in-memory sample set and render.
        await init();
        renderGuestBanner();
        handleUrlParams();
        return;
    }
    const configured = await GitHubSync.isConfigured();
    if (!configured) {
        const d = GitHubSync.DEFAULTS;
        const ok = await GitHubSync.bootstrap(d.owner, d.repo, d.branch);
        if (ok) {
            sessionStorage.removeItem(LocalAuth.PROVISIONAL_KEY);
            toast('Vault synced from GitHub', 'success');
        } else {
            const hasRemoteData = await _checkRemoteExists(d.owner, d.repo, d.branch);
            const provisional = sessionStorage.getItem(LocalAuth.PROVISIONAL_KEY) === '1';
            if (hasRemoteData && provisional) {
                // The master password just created on this device can't decrypt the
                // existing remote vault, so it was the wrong password. Roll it back
                // (instead of locking the user into a wrong hash forever) and re-lock
                // for another attempt (US-401). Only fires for a freshly-minted hash,
                // never for a returning user whose local hash already matched.
                localStorage.removeItem(LocalAuth.HASH_KEY);
                sessionStorage.removeItem(LocalAuth.SESSION_KEY);
                sessionStorage.removeItem(LocalAuth.SESSION_PWD);
                sessionStorage.removeItem(LocalAuth.PROVISIONAL_KEY);
                toast('Wrong master password — enter the same password you used on your other device.', 'error');
                const ls = document.getElementById('lock-screen');
                if (ls) ls.classList.remove('hidden');
                if (window.resetLockFormState) window.resetLockFormState();
                if (window.updateLockSecurityState) window.updateLockSecurityState();
                return;
            }
            sessionStorage.removeItem(LocalAuth.PROVISIONAL_KEY);
            if (hasRemoteData) {
                toast('Sync failed: wrong master password — enter the same password you used on your other device.', 'error');
            }
        }
    } else {
        sessionStorage.removeItem(LocalAuth.PROVISIONAL_KEY);
    }
    await init();
    // If security metadata exists locally, push now so it is available cross-device.
    // Handles users who saved it before metadata sync was implemented.
    if ((localStorage.getItem(LocalAuth.RECOVERY_KEY) || LocalAuth.getHint()) && await GitHubSync.isConfigured()) {
        GitHubSync.syncPush(documents, { securityMeta: GitHubSync._getLocalSecurityMeta() }).catch(() => {});
    }
    handleUrlParams();
}

async function _checkRemoteExists(owner, repo, branch) {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${GitHubSync.DATA_PATH}?ref=${branch || 'main'}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
        return res.ok;
    } catch(e) { return false; }
}

// ========================
// GUEST DEMO BANNER
// ========================
// Visible, unmissable indicator that this is sample data (not the real vault),
// plus an exit link. Injected as a floating pill instead of a layout-affecting
// bar, so it can't break the app's fixed h-screen layout. Anchored to the
// bottom-right corner (not top-center) so it can never sit on top of the
// header — the header's own button count/text varies by view (e.g. the doc
// viewer's Share/Back/History/Export/Edit row), so any top-anchored position
// tuned for one view's header height ends up colliding with another's.
function renderGuestBanner() {
    if (document.getElementById('guest-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'guest-banner';
    banner.style.cssText = 'position:fixed;bottom:24px;right:20px;z-index:300;display:flex;align-items:center;gap:10px;background:linear-gradient(90deg,#6366f1,#8b5cf6);color:#fff;font-size:12px;font-weight:600;padding:7px 14px;border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,0.35);pointer-events:auto;';
    banner.innerHTML = `<span class="gb-emoji">🎭</span><span class="gb-text">Guest Demo — sample data, nothing is saved</span><a href="${location.pathname}" class="gb-exit" style="color:#fff;background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:999px;text-decoration:none;white-space:nowrap;">Exit demo</a>`;
    document.body.appendChild(banner);

    // Hide entry points to real-vault operations that make no sense (and must
    // never run) in demo mode. The handlers themselves are also guarded
    // (defense in depth), this just avoids dead clicks.
    document.querySelector('[data-onclick="lockVault()"]')?.style.setProperty('display', 'none');
    document.querySelector('[data-onclick="showGitHubSettingsModal()"]')?.style.setProperty('display', 'none');
}

// ========================
// URL PARAMETER HANDLING
// ========================
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('shareId');
    const action = params.get('action');
    const viewId = params.get('view');

    if (shareId) {
        const key = decodeURIComponent(location.hash.replace('#key=', ''));
        loadSharedDoc(shareId, key);
    } else if (action === 'new') {
        showTemplateModal();
    } else if (viewId) {
        const doc = documents.find(d => d.id === viewId);
        if (doc) viewDoc(viewId);
    }
}

// ========================
// CSP EVENT DELEGATOR (executeAction)
// ========================
// Split a string on a TOP-LEVEL delimiter only, leaving delimiters that sit
// inside quoted strings untouched. Handles \' and \" escapes. Shared by
// _splitArgs (comma-separated call arguments, US-404 — a naive split broke
// values such as a subfolder named "QA, Release 1") and executeAction's
// statement splitter (semicolon-separated calls). Splitting on the raw
// delimiter before this quote-aware pass is what let a value containing an
// unescaped `;` (a character escHtml() never touches) smuggle in and execute
// an attacker-chosen second function call — this is the security fix for
// that class of bug: quote-awareness must happen before ANY delimiter split.
function _splitTopLevel(str, delim) {
    const parts = [];
    let cur = '', quote = null;
    for (let i = 0; i < str.length; i++) {
        const c = str[i];
        if (quote) {
            cur += c;
            if (c === '\\' && i + 1 < str.length) { cur += str[++i]; }
            else if (c === quote) { quote = null; }
        } else if (c === "'" || c === '"') {
            quote = c; cur += c;
        } else if (c === delim) {
            parts.push(cur); cur = '';
        } else {
            cur += c;
        }
    }
    parts.push(cur);
    return parts;
}

function _splitArgs(str) {
    return _splitTopLevel(str, ',');
}

function executeAction(code, event, element) {
    if (!code) return;

    if (code.includes('event.stopPropagation()')) {
        event.stopPropagation();
    }

    const calls = _splitTopLevel(code, ';').map(s => s.trim()).filter(Boolean);
    for (const call of calls) {
        if (call === 'event.stopPropagation()') continue;

        if (call === "document.getElementById('import-input').click()") {
            document.getElementById('import-input').click();
            continue;
        }
        if (call.startsWith("document.getElementById('doc-menu').remove()")) {
            const menu = document.getElementById('doc-menu');
            if (menu) menu.remove();
            continue;
        }
        if (call === "state.search=this.value") {
            state.search = element.value;
            continue;
        }
        if (call === "state.statusFilter=this.value") {
            state.statusFilter = element.value;
            continue;
        }
        if (call === "state.sortBy=this.value") {
            state.sortBy = element.value;
            continue;
        }
        if (call === "state.editorMode='edit'") {
            state.editorMode = 'edit';
            continue;
        }
        if (call === "state.editorMode='preview'") {
            state.editorMode = 'preview';
            continue;
        }
        if (call === "document.getElementById('ed-content').focus()") {
            setTimeout(() => document.getElementById('ed-content')?.focus(), 0);
            continue;
        }
        if (call === "this.style.background='var(--card-h)'") {
            element.style.background = 'var(--card-h)';
            continue;
        }
        if (call === "this.style.background='var(--card)'") {
            element.style.background = 'var(--card)';
            continue;
        }
        if (call === "this.style.background='var(--bg2)'") {
            element.style.background = 'var(--bg2)';
            continue;
        }
        if (call === "this.style.background='transparent'") {
            element.style.background = 'transparent';
            continue;
        }
        if (call === "this.style.background='rgba(244,63,94,0.06)'") {
            element.style.background = 'rgba(244,63,94,0.06)';
            continue;
        }
        if (call === "this.style.color='var(--tx-m)'") {
            element.style.color = 'var(--tx-m)';
            continue;
        }
        if (call === "this.style.color='var(--tx-d)'") {
            element.style.color = 'var(--tx-d)';
            continue;
        }

        const match = call.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
        if (match) {
            const funcName = match[1];
            const argsStr = match[2];

            let args = [];
            if (argsStr.trim() !== '') {
                args = _splitArgs(argsStr).map(s => {
                    s = s.trim();
                    if (s === 'this') return element;
                    if (s === 'this.value') return element.value;
                    if (s === 'event') return event;
                    if (s === 'null') return null;
                    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
                        return s.slice(1, -1).replace(/\\(['"])/g, '$1');
                    }
                    if (!isNaN(s)) return Number(s);
                    return s;
                });
            }

            if (typeof window[funcName] === 'function') {
                window[funcName](...args);
            }
        }
    }
}

// e.target is only guaranteed to be a real Element (with .closest()) when a
// user actually interacts with the page. A keydown/click/etc dispatched with
// target=document (automated testing, some extensions, or a stray future
// document.dispatchEvent call) has e.target === document, which has no
// .closest() and would otherwise crash every delegated handler below.
document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element)) return;
    // close date picker when clicking outside
    const dpPanel = document.getElementById('dp-panel');
    if (dpPanel && !dpPanel.classList.contains('hidden')) {
        if (!e.target.closest('#dp-wrap')) dpPanel.classList.add('hidden');
    }

    let target = e.target.closest('[data-onclick]');
    if (target) {
        executeAction(target.getAttribute('data-onclick'), e, target);
    }
});

document.addEventListener('input', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-oninput]');
    if (target) {
        executeAction(target.getAttribute('data-oninput'), e, target);
    }
});

document.addEventListener('change', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-onchange]');
    if (target) {
        executeAction(target.getAttribute('data-onchange'), e, target);
    }
});

document.addEventListener('keydown', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-onkeydown]');
    if (target) {
        executeAction(target.getAttribute('data-onkeydown'), e, target);
    }
});

document.addEventListener('mouseover', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-onmouseenter]');
    if (target) {
        executeAction(target.getAttribute('data-onmouseenter'), e, target);
    }
});

document.addEventListener('mouseout', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-onmouseleave]');
    if (target) {
        executeAction(target.getAttribute('data-onmouseleave'), e, target);
    }
});

// ========================
// DRAG HANDLERS (Kanban)
// ========================
window.handleDragStart = function(event, id, element) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    setTimeout(() => { element.classList.add('opacity-50'); }, 0);
};

window.handleDragEnd = function(event, element) {
    element.classList.remove('opacity-50');
};

window.handleDragOver = function(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
};

window.handleDrop = async function(event, newStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;

    const idx = documents.findIndex(d => d.id === id);
    if (idx !== -1 && documents[idx].status !== 'deleted') {
        const field = documents[idx].category === 'bug' ? 'bugStatus' : 'kanbanStatus';
        if (documents[idx][field] !== newStatus) {
            if (field === 'bugStatus') recordBugStatusChange(documents[idx], newStatus);
            else {
                documents[idx][field] = newStatus;
                documents[idx].updatedAt = Date.now();
            }
            await persist();
            renderContent();
        }
    }
};

document.addEventListener('dragstart', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-ondragstart]');
    if (target) {
        const action = target.getAttribute('data-ondragstart');
        if (action.startsWith('handleDragStart')) {
            const id = action.match(/'([^']+)'/)[1];
            window.handleDragStart(e, id, target);
        }
    }
});

document.addEventListener('dragend', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-ondragend]');
    if (target) {
        window.handleDragEnd(e, target);
    }
});

document.addEventListener('dragover', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-ondragover]');
    if (target) {
        window.handleDragOver(e);
    }
});

document.addEventListener('drop', (e) => {
    if (!(e.target instanceof Element)) return;
    let target = e.target.closest('[data-ondrop]');
    if (target) {
        const action = target.getAttribute('data-ondrop');
        if (action.startsWith('handleDrop')) {
            const status = action.match(/'([^']+)'/)[1];
            window.handleDrop(e, status);
        }
    }
});

// ========================
// TOUCH DRAG (Kanban mobile)
// ========================
let _touchDragId = null;
let _touchGhost = null;
let _touchCurrentCol = null;
let _touchStartPos = null;
let _touchDragging = false;

document.addEventListener('touchstart', (e) => {
    if (!(e.target instanceof Element)) return;
    const card = e.target.closest('[data-ondragstart]');
    if (!card) return;
    const action = card.getAttribute('data-ondragstart');
    if (!action || !action.startsWith('handleDragStart')) return;

    _touchDragId = action.match(/'([^']+)'/)[1];
    _touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY, card };
    _touchDragging = false;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!_touchDragId || !_touchStartPos) return;
    const touch = e.touches[0];
    const dx = touch.clientX - _touchStartPos.x;
    const dy = touch.clientY - _touchStartPos.y;

    if (!_touchDragging && Math.sqrt(dx * dx + dy * dy) < 8) return;

    if (!_touchDragging) {
        _touchDragging = true;
        const { card } = _touchStartPos;
        const rect = card.getBoundingClientRect();
        _touchGhost = card.cloneNode(true);
        Object.assign(_touchGhost.style, {
            position: 'fixed', zIndex: 9999, pointerEvents: 'none',
            width: rect.width + 'px', opacity: '0.9',
            left: rect.left + 'px', top: rect.top + 'px',
            transform: 'scale(1.03) rotate(1deg)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
            borderRadius: '8px', transition: 'none'
        });
        document.body.appendChild(_touchGhost);
        card.style.opacity = '0.35';
    }

    const gw = _touchGhost.offsetWidth;
    _touchGhost.style.left = (touch.clientX - gw / 2) + 'px';
    _touchGhost.style.top = (touch.clientY - 40) + 'px';

    _touchGhost.style.display = 'none';
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    _touchGhost.style.display = '';

    const col = el && el.closest('[data-ondrop]');
    if (_touchCurrentCol && _touchCurrentCol !== col) {
        _touchCurrentCol.style.outline = '';
    }
    _touchCurrentCol = col || null;
    if (_touchCurrentCol) _touchCurrentCol.style.outline = '2px solid var(--acc)';
    e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', async () => {
    if (!_touchDragId) return;

    if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
    if (_touchCurrentCol) { _touchCurrentCol.style.outline = ''; }
    if (_touchStartPos?.card) _touchStartPos.card.style.opacity = '';

    if (_touchDragging && _touchCurrentCol) {
        const action = _touchCurrentCol.getAttribute('data-ondrop');
        if (action && action.startsWith('handleDrop')) {
            const newStatus = action.match(/'([^']+)'/)[1];
            const idx = documents.findIndex(d => d.id === _touchDragId);
            if (idx !== -1) {
                const field = documents[idx].category === 'bug' ? 'bugStatus' : 'kanbanStatus';
                if (documents[idx][field] !== newStatus) {
                    if (field === 'bugStatus') recordBugStatusChange(documents[idx], newStatus);
                    else {
                        documents[idx][field] = newStatus;
                        documents[idx].updatedAt = Date.now();
                    }
                    await persist();
                    renderContent();
                }
            }
        }
    }

    _touchCurrentCol = null;
    _touchDragId = null;
    _touchStartPos = null;
    _touchDragging = false;
});

// ========================
// STARTUP — MUST BE LAST
// ========================
window._afterUnlock = startApp;

const _shareIdOnLoad = new URLSearchParams(location.search).get('shareId');
if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
    // Highest priority: never show the lock screen, never touch LocalAuth.
    document.getElementById('lock-screen')?.classList.add('hidden');
    startApp();
} else if (_shareIdOnLoad) {
    const _shareKey = decodeURIComponent(location.hash.replace('#key=', ''));
    loadSharedDoc(_shareIdOnLoad, _shareKey);
} else if (window.LocalAuth && !window.LocalAuth.isUnlocked()) {
    const ls = document.getElementById('lock-screen');
    if (ls) {
        ls.classList.remove('hidden');
        const refreshLockSecurityMeta = () => {
            window.GitHubSync.fetchSecurityMetaPublic().then(meta => {
                if (!meta) return;
                window.GitHubSync._applySecurityMeta(meta);
                if (window.updateLockSecurityState) window.updateLockSecurityState();
            });
        };

        if (!window.LocalAuth.isConfigured()) {
            const hint = document.getElementById('lock-screen-hint');
            const sub = document.getElementById('lock-screen-sub');
            if (hint) hint.textContent = 'Enter your Master Password to sync your data from GitHub.';
            if (sub) sub.textContent = 'Use the same password from your other device. First time? Enter any password to create your vault.';
            refreshLockSecurityMeta();
        } else {
            if (window.updateLockSecurityState) window.updateLockSecurityState();
            refreshLockSecurityMeta();
        }
    }
} else {
    startApp();
}
