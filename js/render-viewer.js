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
        ${_isCollabCommentsEligible(doc) ? _renderCollabCommentsSection(doc) : ''}
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

// ============================================
// COLLAB COMMENTS INTEGRATION (Bug & Task)
// ============================================

let _collabCommentsDocId = null;
let _collabCommentsCache = [];
let _collabCommentsFlatCache = [];
let _collabCommentsUnsub = null;

function isCollabMode() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (typeof root.isCollabMode === 'function' && root.isCollabMode !== isCollabMode) {
        return Boolean(root.isCollabMode());
    }
    if (typeof root.COLLAB_MODE !== 'undefined') {
        return Boolean(root.COLLAB_MODE);
    }
    if (root.CollabConfig && typeof root.CollabConfig.isCollabMode === 'function') {
        return Boolean(root.CollabConfig.isCollabMode());
    }
    return false;
}

function _isCollabCommentsEligible(doc) {
    if (!doc || !doc.id) return false;
    const isShared = typeof state !== 'undefined' ? Boolean(state.sharedView) : false;
    if (isShared) return false;
    if (doc.category !== 'bug' && doc.category !== 'task') return false;
    return isCollabMode();
}

function _getCollabMembersList() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root.CollabAssign && typeof root.CollabAssign.getMembers === 'function') {
        const list = root.CollabAssign.getMembers();
        if (Array.isArray(list) && list.length) return list;
    }
    if (root.CollabActivity && typeof root.CollabActivity.getMembersMap === 'function') {
        const map = root.CollabActivity.getMembersMap();
        if (map instanceof Map) return Array.from(map.values());
        if (map && typeof map === 'object') return Object.values(map);
    }
    if (Array.isArray(root._collabMembers)) return root._collabMembers;
    return [];
}

function _getCollabMembersMap() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root.CollabActivity && typeof root.CollabActivity.getMembersMap === 'function') {
        const map = root.CollabActivity.getMembersMap();
        if (map) return map;
    }
    const members = _getCollabMembersList();
    const map = new Map();
    for (const m of members) {
        const uid = m?.uid || m?.id;
        if (uid) map.set(uid, m);
    }
    return map;
}

function _getCollabCurrentUid() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root._collabCurrentUser?.uid) return root._collabCurrentUser.uid;
    if (root._currentUid) return root._currentUid;
    if (root.CollabComments && typeof root.CollabComments.getCurrentUser === 'function') {
        const u = root.CollabComments.getCurrentUser();
        if (u?.uid) return u.uid;
    }
    if (root.CollabComments && typeof root.CollabComments.getCurrentMember === 'function') {
        const m = root.CollabComments.getCurrentMember();
        if (m?.uid) return m.uid;
    }
    if (root.CollabMembers && typeof root.CollabMembers.getCurrentMember === 'function') {
        const m = root.CollabMembers.getCurrentMember();
        if (m?.uid) return m.uid;
    }
    if (root.firebase?.auth?.().currentUser?.uid) {
        return root.firebase.auth().currentUser.uid;
    }
    return '';
}

function _getCollabIsOwner() {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (typeof root._isOwner === 'boolean') return root._isOwner;
    if (root._collabCurrentUser?.role === 'owner') return true;
    if (root.CollabMembers && typeof root.CollabMembers.isOwner === 'function') {
        return Boolean(root.CollabMembers.isOwner());
    }
    if (root.CollabComments && typeof root.CollabComments.getCurrentMember === 'function') {
        const m = root.CollabComments.getCurrentMember();
        if (m?.role === 'owner') return true;
    }
    return false;
}

function _getCollabInitials(name) {
    if (!name || typeof name !== 'string') return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
}

function _getCollabAvatarColor(key) {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
    let hash = 0;
    const str = String(key || '');
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) & 0xffffffff;
    }
    return colors[Math.abs(hash) % colors.length];
}

function _getCollabAuthorRole(authorUid, membersMap) {
    if (!authorUid) return '';
    if (membersMap instanceof Map) {
        const m = membersMap.get(authorUid);
        if (m && m.role) return m.role;
    } else if (Array.isArray(membersMap)) {
        const m = membersMap.find(x => x && (x.uid === authorUid || x.id === authorUid));
        if (m && m.role) return m.role;
    }
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root.CollabMembers && typeof root.CollabMembers.getCurrentMember === 'function') {
        const cur = root.CollabMembers.getCurrentMember();
        if (cur && cur.uid === authorUid && cur.role) return cur.role;
    }
    return '';
}

function _countAllCollabComments(tree) {
    if (!Array.isArray(tree)) return 0;
    let count = 0;
    for (const item of tree) {
        count += 1;
        if (Array.isArray(item.replies)) {
            count += item.replies.length;
        }
    }
    return count;
}

function _formatCommentBody(content, membersMap) {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (root.CollabComments && typeof root.CollabComments.formatCommentContent === 'function') {
        return root.CollabComments.formatCommentContent(content, membersMap);
    }
    if (typeof escHtml === 'function') return escHtml(content);
    return String(content || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _formatCommentDate(createdAt) {
    if (typeof fmtDate === 'function') return fmtDate(createdAt);
    const d = new Date(createdAt);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

function _renderCommentCard(doc, c, membersMap, currentUid, isOwner, isReply) {
    const safeEsc = typeof escHtml === 'function' ? escHtml : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeAction = typeof actionAttr === 'function' ? actionAttr : (name, ...args) => escHtml(name + '(' + args.map(a => JSON.stringify(a)).join(',') + ')');

    const authorName = c.authorName || 'Team Member';
    const initials = _getCollabInitials(authorName);
    const avatarColor = _getCollabAvatarColor(c.authorUid || authorName);
    const role = _getCollabAuthorRole(c.authorUid, membersMap) || c.authorRole || '';
    const dateStr = _formatCommentDate(c.createdAt);
    const formattedContent = _formatCommentBody(c.content, membersMap);

    const isAuthor = Boolean(currentUid && c.authorUid === currentUid);
    const canEdit = isAuthor;
    const canDelete = Boolean(currentUid && (c.authorUid === currentUid || isOwner));

    const cardClass = isReply
        ? 'collab-comment-card collab-reply-card p-3 rounded-lg border border-[var(--brd)]'
        : 'collab-comment-card p-4 rounded-xl border border-[var(--brd)]';
    const cardBg = isReply ? 'var(--bg2)' : 'var(--card)';
    const avatarSize = isReply ? 'w-6 h-6 text-[10px]' : 'w-7 h-7 text-xs';

    return `
    <div class="${cardClass}" style="background:${cardBg};" data-comment-id="${safeEsc(c.id)}">
        <div class="flex items-start gap-2.5 sm:gap-3">
            <div class="collab-comment-avatar ${avatarSize} rounded-full flex items-center justify-center font-bold text-white shrink-0 select-none" style="background-color:${avatarColor};" title="${safeEsc(authorName)}">${safeEsc(initials)}</div>
            <div class="flex-1 min-w-0">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="collab-comment-author font-semibold text-xs" style="color:var(--tx);">${safeEsc(authorName)}</span>
                    ${role ? `<span class="collab-comment-role text-[10px] px-1.5 py-0.5 rounded capitalize" style="background:${isReply ? 'var(--card)' : 'var(--bg2)'};color:var(--tx-m);border:1px solid var(--brd);">${safeEsc(role)}</span>` : ''}
                    <span class="collab-comment-meta text-[11px]" style="color:var(--tx-d);">${dateStr}</span>
                    ${c.updatedAt ? `<span class="collab-comment-edited text-[10px]" style="color:var(--tx-d);">(edited)</span>` : ''}
                </div>
                <div id="collab-comment-body-${safeEsc(c.id)}" class="collab-comment-body text-xs sm:text-sm mt-1 mb-2 leading-relaxed" style="color:var(--tx);">${formattedContent}</div>
                <div id="collab-comment-edit-box-${safeEsc(c.id)}" class="collab-comment-edit-box mt-2 mb-2" style="display:none;">
                    <textarea id="collab-edit-input-${safeEsc(c.id)}" class="collab-comment-textarea form-input w-full text-xs p-2 rounded-lg" rows="2">${safeEsc(c.content)}</textarea>
                    <div class="flex items-center justify-end gap-2 mt-1.5">
                        <button type="button" class="btn-s text-xs px-2.5 py-1" data-onclick="${safeAction('collabCancelEditComment', c.id)}">Cancel</button>
                        <button type="button" class="btn-p text-xs px-3 py-1" data-onclick="${safeAction('collabSaveEditComment', doc.id, c.id)}">Save</button>
                    </div>
                </div>
                <div class="collab-comment-actions flex items-center gap-3 text-xs" style="color:var(--tx-m);">
                    ${!isReply ? `
                    <button type="button" class="collab-comment-action-btn collab-reply-btn flex items-center gap-1 hover:text-[var(--acc)]" data-onclick="${safeAction('collabToggleReplyForm', c.id)}">
                        <i class="fa-solid fa-reply text-[10px]"></i><span>Reply</span>
                    </button>` : ''}
                    ${canEdit ? `
                    <button type="button" class="collab-comment-action-btn collab-edit-btn flex items-center gap-1 hover:text-[var(--acc)]" data-onclick="${safeAction('collabEditComment', c.id)}">
                        <i class="fa-solid fa-pen text-[10px]"></i><span>Edit</span>
                    </button>` : ''}
                    ${canDelete ? `
                    <button type="button" class="collab-comment-action-btn collab-delete-btn flex items-center gap-1 hover:text-red-500" data-onclick="${safeAction('collabDeleteComment', c.id, doc.id)}">
                        <i class="fa-solid fa-trash text-[10px]"></i><span>Delete</span>
                    </button>` : ''}
                </div>
                ${!isReply ? `
                <div id="collab-reply-form-${safeEsc(c.id)}" class="collab-reply-form mt-3" style="display:none;">
                    <div class="relative">
                        <textarea id="collab-reply-input-${safeEsc(c.id)}" class="collab-comment-textarea form-input w-full text-xs p-2.5 rounded-lg" rows="2" placeholder="Write a reply or type @ to mention..." data-oninput="${safeAction('collabHandleMentionInput', c.id)}"></textarea>
                        <div id="collab-mention-dropdown-${safeEsc(c.id)}" class="collab-mention-dropdown shadow-lg rounded-lg border border-[var(--brd)]" style="display:none;"></div>
                    </div>
                    <div class="flex items-center justify-end gap-2 mt-2">
                        <button type="button" class="btn-s text-xs px-2.5 py-1" data-onclick="${safeAction('collabToggleReplyForm', c.id, false)}">Cancel</button>
                        <button type="button" class="btn-p text-xs px-3 py-1" data-onclick="${safeAction('collabSubmitReply', doc.id, c.id)}"><i class="fa-solid fa-paper-plane mr-1 text-[10px]"></i>Reply</button>
                    </div>
                </div>` : ''}
            </div>
        </div>
        ${!isReply && Array.isArray(c.replies) && c.replies.length > 0 ? `
        <div class="collab-reply-thread border-l-2 border-[var(--brd)] pl-4 mt-3 ml-3 sm:ml-4 space-y-3">
            ${c.replies.map(rep => _renderCommentCard(doc, rep, membersMap, currentUid, isOwner, true)).join('')}
        </div>` : ''}
    </div>`;
}

function _renderCommentsListHTML(doc, tree) {
    if (!Array.isArray(tree) || tree.length === 0) {
        return `<div class="collab-comments-empty text-xs py-4 text-center" style="color:var(--tx-d);">No comments yet. Start the discussion below.</div>`;
    }
    const membersMap = _getCollabMembersMap();
    const currentUid = _getCollabCurrentUid();
    const isOwner = _getCollabIsOwner();
    return tree.map(c => _renderCommentCard(doc, c, membersMap, currentUid, isOwner, false)).join('');
}

function _getCommentsTreeForDoc(doc) {
    const root = typeof window !== 'undefined' ? window : globalThis;
    if (_collabCommentsCache && _collabCommentsCache.length > 0) {
        return _collabCommentsCache;
    }
    if (Array.isArray(doc?.comments) && doc.comments.length > 0) {
        if (doc.comments[0]?.replies !== undefined) return doc.comments;
        if (root.CollabComments && typeof root.CollabComments.buildCommentTree === 'function') {
            return root.CollabComments.buildCommentTree(doc.comments);
        }
        return doc.comments;
    }
    if (Array.isArray(root._collabComments) && root._collabComments.length > 0) {
        if (root._collabComments[0]?.replies !== undefined) return root._collabComments;
        if (root.CollabComments && typeof root.CollabComments.buildCommentTree === 'function') {
            return root.CollabComments.buildCommentTree(root._collabComments);
        }
        return root._collabComments;
    }
    return [];
}

function _renderCollabCommentsSection(doc) {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const safeEsc = typeof escHtml === 'function' ? escHtml : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeAction = typeof actionAttr === 'function' ? actionAttr : (name, ...args) => escHtml(name + '(' + args.map(a => JSON.stringify(a)).join(',') + ')');

    // Subscription lifecycle management
    if (_collabCommentsDocId !== doc.id) {
        if (typeof _collabCommentsUnsub === 'function') {
            try { _collabCommentsUnsub(); } catch (_) {}
        }
        _collabCommentsUnsub = null;
        _collabCommentsCache = [];
        _collabCommentsFlatCache = [];
        _collabCommentsDocId = doc.id;

        if (root.CollabComments && typeof root.CollabComments.subscribe === 'function') {
            _collabCommentsUnsub = root.CollabComments.subscribe(doc.id, (tree, flatList) => {
                _collabCommentsCache = tree || [];
                _collabCommentsFlatCache = flatList || [];
                _updateCommentsSectionDOM(doc.id);
            }, (err) => {
                if (err && err.message !== 'Firestore DB unavailable') {
                    console.warn('[CollabComments] UI subscribe err:', err);
                }
            });
        }
    }

    const tree = _getCommentsTreeForDoc(doc);
    const totalCount = _countAllCollabComments(tree);
    const listHtml = _renderCommentsListHTML(doc, tree);

    return `
    <section id="collab-comments-section" class="mt-8 pt-6 border-t border-[var(--brd)]" data-doc-id="${safeEsc(doc.id)}">
        <div class="collab-comments-header flex items-center justify-between mb-4">
            <h3 class="font-heading font-semibold text-base flex items-center gap-2" style="color:var(--tx);">
                <i class="fa-regular fa-comments text-sm" style="color:var(--acc);"></i>
                <span>Comments &amp; Discussion</span>
                <span class="collab-comments-count px-2 py-0.5 text-xs rounded-full font-bold" style="background:var(--bg2);color:var(--tx-m);border:1px solid var(--brd);">${totalCount}</span>
            </h3>
        </div>
        <div id="collab-comments-list" class="space-y-4 mb-6">
            ${listHtml}
        </div>
        <div class="collab-root-input-container mt-6 p-4 rounded-xl border border-[var(--brd)]" style="background:var(--card);">
            <div class="relative">
                <textarea id="collab-root-comment-input" class="collab-comment-textarea form-input w-full text-xs sm:text-sm p-3 rounded-lg" rows="3" placeholder="Leave a comment or type @ to mention..." data-oninput="${safeAction('collabHandleMentionInput', 'root')}"></textarea>
                <div id="collab-mention-dropdown-root" class="collab-mention-dropdown shadow-lg rounded-lg border border-[var(--brd)]" style="display:none;"></div>
            </div>
            <div class="flex items-center justify-between mt-3 pt-2 border-t border-[var(--brd)]">
                <span class="text-[11px]" style="color:var(--tx-d);">Tip: Type @ to mention a teammate</span>
                <button type="button" class="btn-p text-xs px-3.5 py-1.5 flex items-center gap-1.5" data-onclick="${safeAction('collabSubmitComment', doc.id)}">
                    <i class="fa-solid fa-comment text-xs"></i>
                    <span>Comment</span>
                </button>
            </div>
        </div>
    </section>`;
}

function _updateCommentsSectionDOM(docId) {
    if (typeof document === 'undefined') return;
    const section = document.getElementById('collab-comments-section');
    if (!section || section.getAttribute('data-doc-id') !== docId) return;

    const countBadge = section.querySelector('.collab-comments-count');
    const listContainer = document.getElementById('collab-comments-list');
    const root = typeof window !== 'undefined' ? window : globalThis;
    const doc = (root.documents || []).find(d => d.id === docId) || { id: docId };

    const tree = _collabCommentsCache || [];
    const totalCount = _countAllCollabComments(tree);

    if (countBadge) countBadge.textContent = String(totalCount);
    if (listContainer) {
        listContainer.innerHTML = _renderCommentsListHTML(doc, tree);
        if (typeof enhanceInteractionSemantics === 'function') {
            enhanceInteractionSemantics(listContainer, false);
        }
    }
}

function cleanupCollabCommentsSubscription() {
    if (typeof _collabCommentsUnsub === 'function') {
        try { _collabCommentsUnsub(); } catch (_) {}
    }
    _collabCommentsUnsub = null;
    _collabCommentsDocId = null;
    _collabCommentsCache = [];
    _collabCommentsFlatCache = [];
}
const rootObj = typeof window !== 'undefined' ? window : globalThis;
rootObj.cleanupCollabCommentsSubscription = cleanupCollabCommentsSubscription;

// Global Action Handlers
rootObj.collabSubmitComment = async function(docId) {
    const targetDocId = docId || _collabCommentsDocId || (rootObj.state?.editingDoc?.id);
    const ta = typeof document !== 'undefined' ? document.getElementById('collab-root-comment-input') : null;
    const content = ta ? ta.value?.trim() : '';
    if (!content) {
        if (typeof rootObj.toast === 'function') rootObj.toast('Please enter a comment', 'error');
        return;
    }
    const members = _getCollabMembersList();
    const mentions = (rootObj.CollabComments && typeof rootObj.CollabComments.extractMentions === 'function')
        ? rootObj.CollabComments.extractMentions(content, members)
        : [];
    try {
        if (rootObj.CollabComments && typeof rootObj.CollabComments.addComment === 'function') {
            await rootObj.CollabComments.addComment(targetDocId, { content, mentions });
        }
        if (ta) ta.value = '';
        const dropdown = typeof document !== 'undefined' ? document.getElementById('collab-mention-dropdown-root') : null;
        if (dropdown) { dropdown.style.display = 'none'; dropdown.innerHTML = ''; }
    } catch (err) {
        console.warn('[CollabComments] Failed to submit comment:', err);
        if (typeof rootObj.toast === 'function') rootObj.toast('Failed to submit comment: ' + (err.message || err), 'error');
    }
};

rootObj.collabToggleReplyForm = function(commentId, forceOpen) {
    if (typeof document === 'undefined') return;
    const form = document.getElementById(`collab-reply-form-${commentId}`);
    if (!form) return;
    const isOpen = form.style.display !== 'none';
    const shouldOpen = forceOpen !== undefined ? (forceOpen === true || forceOpen === 'true') : !isOpen;
    form.style.display = shouldOpen ? 'block' : 'none';
    if (shouldOpen) {
        const ta = document.getElementById(`collab-reply-input-${commentId}`);
        if (ta) ta.focus?.();
    }
};

rootObj.collabSubmitReply = async function(docId, parentId) {
    const targetDocId = docId || _collabCommentsDocId || (rootObj.state?.editingDoc?.id);
    const ta = typeof document !== 'undefined' ? document.getElementById(`collab-reply-input-${parentId}`) : null;
    const content = ta ? ta.value?.trim() : '';
    if (!content) {
        if (typeof rootObj.toast === 'function') rootObj.toast('Please enter a reply', 'error');
        return;
    }
    const members = _getCollabMembersList();
    const mentions = (rootObj.CollabComments && typeof rootObj.CollabComments.extractMentions === 'function')
        ? rootObj.CollabComments.extractMentions(content, members)
        : [];
    try {
        if (rootObj.CollabComments && typeof rootObj.CollabComments.addComment === 'function') {
            await rootObj.CollabComments.addComment(targetDocId, { content, parentId, mentions });
        }
        if (ta) ta.value = '';
        rootObj.collabToggleReplyForm(parentId, false);
    } catch (err) {
        console.warn('[CollabComments] Failed to submit reply:', err);
        if (typeof rootObj.toast === 'function') rootObj.toast('Failed to submit reply: ' + (err.message || err), 'error');
    }
};

rootObj.collabEditComment = function(commentId, docId, newContent) {
    if (typeof newContent === 'string') {
        const targetDocId = docId || _collabCommentsDocId || (rootObj.state?.editingDoc?.id);
        const members = _getCollabMembersList();
        const mentions = (rootObj.CollabComments && typeof rootObj.CollabComments.extractMentions === 'function')
            ? rootObj.CollabComments.extractMentions(newContent, members)
            : [];
        return rootObj.CollabComments.updateComment(targetDocId, commentId, { content: newContent, mentions });
    }
    if (typeof document === 'undefined') return;
    const bodyEl = document.getElementById(`collab-comment-body-${commentId}`);
    const editBox = document.getElementById(`collab-comment-edit-box-${commentId}`);
    if (bodyEl && editBox) {
        bodyEl.style.display = 'none';
        editBox.style.display = 'block';
        const ta = document.getElementById(`collab-edit-input-${commentId}`);
        if (ta) ta.focus?.();
    }
};

rootObj.collabCancelEditComment = function(commentId) {
    if (typeof document === 'undefined') return;
    const bodyEl = document.getElementById(`collab-comment-body-${commentId}`);
    const editBox = document.getElementById(`collab-comment-edit-box-${commentId}`);
    if (bodyEl && editBox) {
        bodyEl.style.display = '';
        editBox.style.display = 'none';
    }
};

rootObj.collabSaveEditComment = async function(docId, commentId) {
    if (typeof document === 'undefined') return;
    const targetDocId = docId || _collabCommentsDocId || (rootObj.state?.editingDoc?.id);
    const ta = document.getElementById(`collab-edit-input-${commentId}`);
    if (!ta) return;
    const content = ta.value?.trim();
    if (!content) {
        if (typeof rootObj.toast === 'function') rootObj.toast('Comment cannot be empty', 'error');
        return;
    }
    const members = _getCollabMembersList();
    const mentions = (rootObj.CollabComments && typeof rootObj.CollabComments.extractMentions === 'function')
        ? rootObj.CollabComments.extractMentions(content, members)
        : [];
    try {
        if (rootObj.CollabComments && typeof rootObj.CollabComments.updateComment === 'function') {
            await rootObj.CollabComments.updateComment(targetDocId, commentId, { content, mentions });
        }
        rootObj.collabCancelEditComment(commentId);
    } catch (err) {
        console.warn('[CollabComments] Failed to update comment:', err);
        if (typeof rootObj.toast === 'function') rootObj.toast('Failed to update comment: ' + (err.message || err), 'error');
    }
};

rootObj.collabDeleteComment = async function(commentId, docId) {
    const targetDocId = docId || _collabCommentsDocId || (rootObj.state?.editingDoc?.id);
    if (typeof rootObj.confirm === 'function') {
        const ok = rootObj.confirm('Are you sure you want to delete this comment?');
        if (!ok) return;
    }
    try {
        if (rootObj.CollabComments && typeof rootObj.CollabComments.deleteComment === 'function') {
            await rootObj.CollabComments.deleteComment(targetDocId, commentId);
        }
    } catch (err) {
        console.warn('[CollabComments] Failed to delete comment:', err);
        if (typeof rootObj.toast === 'function') rootObj.toast('Failed to delete comment: ' + (err.message || err), 'error');
    }
};

rootObj.collabHandleMentionInput = function(textareaOrScope, optScope) {
    let scopeId = optScope;
    let textarea = null;
    if (typeof textareaOrScope === 'string') {
        scopeId = textareaOrScope;
        textarea = scopeId === 'root'
            ? (typeof document !== 'undefined' ? document.getElementById('collab-root-comment-input') : null)
            : (typeof document !== 'undefined' ? document.getElementById(`collab-reply-input-${scopeId}`) : null);
    } else {
        textarea = textareaOrScope;
    }
    if (!textarea) return;
    const val = textarea.value || '';
    const cursor = textarea.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const match = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(textBefore);

    const dropdown = typeof document !== 'undefined' ? document.getElementById(`collab-mention-dropdown-${scopeId}`) : null;
    if (!dropdown) return;

    if (!match) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    const query = match[1].toLowerCase();
    const members = _getCollabMembersList();
    const currentUid = _getCollabCurrentUid();
    const safeEsc = typeof escHtml === 'function' ? escHtml : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeAction = typeof actionAttr === 'function' ? actionAttr : (n, ...a) => escHtml(n + '(' + a.map(x => JSON.stringify(x)).join(',') + ')');

    const filtered = members.filter(m => {
        const uid = m?.uid || m?.id;
        if (uid && uid === currentUid) return false;
        const name = (m?.displayName || m?.name || '').toLowerCase();
        const email = (m?.email || '').toLowerCase();
        return !query || name.includes(query) || email.includes(query);
    }).slice(0, 5);

    if (filtered.length === 0) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    dropdown.innerHTML = filtered.map(m => {
        const uid = m.uid || m.id;
        const name = m.displayName || m.name || m.email || 'Team Member';
        const role = m.role || 'member';
        const color = _getCollabAvatarColor(uid);
        const initials = _getCollabInitials(name);
        return `
        <div class="collab-mention-item flex items-center gap-2 p-2 cursor-pointer hover:bg-[var(--bg2)] text-xs" data-onclick="${safeAction('collabSelectMention', scopeId, uid, name)}">
            <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0" style="background-color:${color};">${safeEsc(initials)}</div>
            <span class="font-medium" style="color:var(--tx);">${safeEsc(name)}</span>
            <span class="text-[10px] ml-auto" style="color:var(--tx-d);">${safeEsc(role)}</span>
        </div>`;
    }).join('');
    dropdown.style.display = 'block';
    if (typeof enhanceInteractionSemantics === 'function') {
        enhanceInteractionSemantics(dropdown, false);
    }
};

rootObj.collabSelectMention = function(scopeId, uid, name) {
    if (typeof document === 'undefined') return;
    const isRoot = scopeId === 'root';
    const textarea = isRoot
        ? document.getElementById('collab-root-comment-input')
        : document.getElementById(`collab-reply-input-${scopeId}`);
    const dropdown = document.getElementById(`collab-mention-dropdown-${scopeId}`);
    if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }
    if (!textarea) return;

    const val = textarea.value || '';
    const cursor = textarea.selectionStart ?? val.length;
    const textBefore = val.slice(0, cursor);
    const textAfter = val.slice(cursor);
    const match = /(?:^|\s)@([a-zA-Z0-9._-]*)$/.exec(textBefore);

    const replacement = `@[${name}](${uid}) `;
    if (match) {
        const atIdx = textBefore.lastIndexOf('@');
        textarea.value = textBefore.slice(0, atIdx) + replacement + textAfter;
        const newPos = atIdx + replacement.length;
        textarea.setSelectionRange?.(newPos, newPos);
    } else {
        textarea.value = val + (val.endsWith(' ') || !val ? '' : ' ') + replacement;
    }
    textarea.focus?.();
};

