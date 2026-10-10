// DocVault team collaboration viewer restrictions module
(function(root) {
    const VIEWER_BLOCKED_RE = /\b(showTemplateModal|editDoc|duplicateDoc|showDeleteModal|showEmptyTrashModal|emptyTrash|confirmDelete|hardDeleteDoc|restoreDoc|saveDoc|shareDoc|confirmBatchDelete|confirmBatchAddTag|confirmBatchMoveFolder|confirmBatchBugEdit|saveFocusWorkflow|completeFocusItem|unsnoozeFocusItem|reopenFocusItem)\s*\(/;

    function isViewer() {
        if (root.COLLAB_MODE === false) return false;
        const member = root.CollabBootstrap?.getCurrentMember?.();
        return Boolean(member && member.role === 'viewer');
    }

    function applyViewerRestrictions() {
        if (typeof document === 'undefined') return;
        const viewerActive = isViewer();
        const qsa = typeof document.querySelectorAll === 'function' ? s => document.querySelectorAll(s) : () => [];

        for (const el of qsa('[data-onclick]')) {
            const code = (el.getAttribute ? el.getAttribute('data-onclick') : el.dataset?.onclick) || '';
            if (VIEWER_BLOCKED_RE.test(code)) {
                if (viewerActive) {
                    el.setAttribute?.('aria-disabled', 'true');
                    el.setAttribute?.('title', 'You have view access');
                    el.setAttribute?.('disabled', '');
                    el.disabled = true;
                    el.title = 'You have view access';
                    el._collabDisabled = true;
                } else if (el._collabDisabled) {
                    el.removeAttribute?.('aria-disabled');
                    el.removeAttribute?.('title');
                    el.removeAttribute?.('disabled');
                    el.disabled = false;
                    el._collabDisabled = false;
                }
            }
        }

        for (const el of qsa('[draggable="true"], [draggable="false"]')) {
            if (viewerActive) {
                if (el.getAttribute?.('draggable') === 'true' || el.draggable === true) {
                    el.setAttribute?.('draggable', 'false');
                    el.draggable = false;
                    el._collabDraggable = true;
                }
            } else if (el._collabDraggable) {
                el.setAttribute?.('draggable', 'true');
                el.draggable = true;
                el._collabDraggable = false;
            }
        }

        const debugErr = typeof document.getElementById === 'function' ? document.getElementById('debug-err') : null;
        if (debugErr && /Missing or insufficient permissions|permission-denied/i.test(debugErr.innerText || debugErr.textContent || '')) {
            if (debugErr.innerText !== undefined) debugErr.innerText = '';
            debugErr.textContent = '';
            if (debugErr.style) debugErr.style.display = 'none';
        }
    }

    function handleCaptureClick(e) {
        if (!isViewer()) return;
        let curr = e?.target;
        while (curr && curr !== document && curr.nodeType !== 9) {
            const code = (curr.getAttribute ? curr.getAttribute('data-onclick') : curr.dataset?.onclick) || '';
            if (code && VIEWER_BLOCKED_RE.test(code)) {
                e.preventDefault?.();
                e.stopPropagation?.();
                e.stopImmediatePropagation?.();
                if (typeof root.toast === 'function') root.toast('You have view access', 'error');
                return;
            }
            curr = curr.parentNode;
        }
    }

    function filterPermissionError(e) {
        const r = e?.reason, msg = String(r?.message || r || '');
        if (r?.code === 'permission-denied' || r?.code === 7 || /permission[-_ ]denied|Missing or insufficient permissions/i.test(msg)) {
            e.stopImmediatePropagation?.();
            e.stopPropagation?.();
            e.preventDefault?.();
            const debugErr = typeof document !== 'undefined' && typeof document.getElementById === 'function' ? document.getElementById('debug-err') : null;
            if (debugErr && /Missing or insufficient permissions|permission-denied/i.test(debugErr.innerText || debugErr.textContent || '')) {
                if (debugErr.innerText !== undefined) debugErr.innerText = '';
                debugErr.textContent = '';
                if (debugErr.style) debugErr.style.display = 'none';
            }
        }
    }

    function installCaptureListeners() {
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !document._collabCaptureClick) {
            document.addEventListener('click', handleCaptureClick, true);
            document._collabCaptureClick = true;
        }
        if (typeof root.addEventListener === 'function' && !root._collabCaptureRejection) {
            root.addEventListener('unhandledrejection', filterPermissionError, true);
            root._collabCaptureRejection = true;
        }
    }

    function patchRender() {
        if (typeof root.render === 'function' && !root.render._collabPatched) {
            const orig = root.render;
            root.render = Object.assign(function(...args) {
                const res = orig.apply(this, args);
                applyViewerRestrictions();
                return res;
            }, { _collabPatched: true });
        }
    }

    installCaptureListeners();
    patchRender();

    root.CollabViewer = {
        applyViewerRestrictions,
        handleCaptureClick,
        filterPermissionError,
        installCaptureListeners,
        patchRender,
        isViewer,
        VIEWER_BLOCKED_RE
    };
})(typeof window !== 'undefined' ? window : globalThis);
