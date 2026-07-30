// ========================
// SHARE REGISTRY (US-304) — track created share links so they can be revoked
// ========================
const SHARE_REGISTRY_KEY = 'docvault_shares';
function _getShares() {
    try { return JSON.parse(localStorage.getItem(SHARE_REGISTRY_KEY) || '[]'); } catch(e) { return []; }
}
function _saveShares(list) { localStorage.setItem(SHARE_REGISTRY_KEY, JSON.stringify(list)); }
function _recordShare(entry) {
    const list = _getShares().filter(s => s.shareId !== entry.shareId);
    list.unshift(entry);
    _saveShares(list);
}
function _removeShare(shareId) { _saveShares(_getShares().filter(s => s.shareId !== shareId)); }

window.showShareManager = function() {
    const shares = _getShares();
    const rows = shares.length ? shares.map(s => `
        <div class="flex items-center gap-3 p-3 rounded-lg mb-2" style="background:var(--bg2);border:1px solid var(--brd);">
            <i class="fa-solid fa-link text-xs shrink-0" style="color:var(--acc);"></i>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate" style="color:var(--tx);">${escHtml(s.title || 'Untitled')}</div>
                <div class="text-[11px]" style="color:var(--tx-d);">${escHtml(s.category || 'doc')} &middot; shared ${new Date(s.createdAt).toLocaleDateString()}</div>
            </div>
            <button class="btn-d text-xs py-1 px-2.5 shrink-0" data-onclick="revokeShare('${s.shareId}')"><i class="fa-solid fa-trash mr-1"></i>Revoke</button>
        </div>`).join('') : `<p class="text-sm text-center py-8" style="color:var(--tx-d);">No active share links.</p>`;
    showModal(`
        <div>
            <h3 class="font-heading font-bold text-lg mb-1" style="color:var(--tx);"><i class="fa-solid fa-share-nodes text-[var(--acc)] mr-2"></i>Shared Links</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Revoking deletes the encrypted file from GitHub, so the link stops working for everyone.</p>
            <div style="max-height:400px;overflow-y:auto;">${rows}</div>
            <div class="flex justify-end mt-4"><button class="btn-s" data-onclick="closeModal()">Close</button></div>
        </div>
    `);
};

window.revokeShare = async function(shareId) {
    const settings = await GitHubSync.getSettings();
    const entry = _getShares().find(s => s.shareId === shareId);
    if (settings && settings.token) {
        const base = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/shared/${shareId}.enc`;
        try {
            let sha = entry && entry.sha;
            if (!sha) {
                const g = await fetch(`${base}?ref=${settings.branch || 'main'}`, { headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json' } });
                if (g.ok) { sha = (await g.json()).sha; }
            }
            if (sha) {
                const del = await fetch(base, {
                    method: 'DELETE',
                    headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: `Revoke share ${shareId}`, sha, branch: settings.branch || 'main' })
                });
                if (!del.ok && del.status !== 404) throw new Error(`GitHub error ${del.status}`);
            }
        } catch(e) {
            toast('Removed from list, but GitHub delete failed: ' + e.message, 'error');
            _removeShare(shareId);
            showShareManager();
            return;
        }
    } else {
        toast('No GitHub token configured — removed from list only; the file may still exist remotely.', 'warning');
    }
    _removeShare(shareId);
    toast('Share link revoked.', 'success');
    showShareManager();
};

// ========================
// SHARE PAYLOAD (shared by initial share + background re-sync)
// ========================
// These helpers deliberately live in the same file as shareDoc() rather than a
// separate module. Assets are served with `Cache-Control: max-age=600`, so a
// browser can hold a 10-minute-stale index.html while fetching a fresh
// actions-sharing.js. When these lived in their own file, that combination
// loaded a shareDoc() that called an _encryptSharePayload() the stale
// index.html had never requested — "Failed to create share link:
// _encryptSharePayload is not defined". Keeping caller and callee in one file
// makes them always the same version, so no partial-deploy window exists.
//
// Security: drop secret-flagged environment properties (and the legacy
// secret dbInfo) from anything that enters the share payload — the
// document's own envData AND any environment carried in a linked doc.
function _stripEnvSecrets(ed) {
    return ed ? {
        ...ed,
        properties: Array.isArray(ed.properties) ? ed.properties.filter(p => !p.secret) : ed.properties,
        dbInfo: undefined,
    } : ed;
}

function _buildSharePayload(doc) {
    const allLinkedIds = doc.category === 'release'
        ? [...(doc.releaseData?.linkedRuns || []), ...(doc.releaseData?.linkedBugs || []), ...(doc.releaseData?.linkedEnvs || [])]
        : doc.category === 'testplan'
        ? [...(doc.tcPlanData?.linkedTCs || []), ...(doc.tcPlanData?.linkedRuns || [])]
        : [];
    const linkedDocs = doc.category === 'testrun' && doc.runData?.targetIds?.length
        ? documents.filter(d => doc.runData.targetIds.includes(d.id) && d.status !== 'deleted')
              .map(d => ({ id: d.id, title: d.title, category: d.category, tcData: d.tcData, content: d.content, tags: d.tags || [] }))
        : doc.category === 'environment' && doc.envData?.linkedCreds?.length
        ? documents.filter(d => doc.envData.linkedCreds.includes(d.id) && d.status !== 'deleted')
              .map(d => ({ id: d.id, title: d.title, category: d.category, status: d.status, tags: d.tags || [], createdAt: d.createdAt, updatedAt: d.updatedAt, favorite: false }))
        : (doc.category === 'release' || doc.category === 'testplan') && allLinkedIds.length
        ? documents.filter(d => allLinkedIds.includes(d.id) && d.status !== 'deleted')
              .map(d => ({ id: d.id, title: d.title, category: d.category, status: d.status, tags: d.tags || [], createdAt: d.createdAt, updatedAt: d.updatedAt, favorite: false, runData: d.runData, bugData: d.bugData, envData: _stripEnvSecrets(d.envData), tcData: d.tcData }))
        : [];
    return {
        title: doc.title, category: doc.category, content: doc.content,
        tags: doc.tags, createdAt: doc.createdAt, status: doc.status, subfolder: doc.subfolder,
        envData: _stripEnvSecrets(doc.envData),
        runData: doc.runData,
        releaseData: doc.releaseData,
        tcData: doc.tcData, bugData: doc.bugData, apiData: doc.apiData,
        tcPlanData: doc.tcPlanData,
        _linkedDocs: linkedDocs.length ? linkedDocs : undefined,
    };
}

async function _encryptSharePayload(doc, keyBytes) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const plain = new TextEncoder().encode(JSON.stringify(_buildSharePayload(doc)));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rawKey, plain);
    const packed = new Uint8Array(12 + cipher.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(cipher), 12);
    return uint8ToBase64(packed);
}

// ========================
// KEEP SHARED LINKS UP TO DATE
// ========================
// A share link publishes a snapshot at share-time. So an edit made after
// sharing is visible to viewers on their next reload (not just to the next
// person who opens a fresh link), re-push the encrypted snapshot to the same
// shared/{shareId}.enc path whenever the source document's updatedAt moves
// past what was last pushed. Runs after every persist() (best-effort,
// fire-and-forget — see persist() in state.js) so it covers every edit path
// (editor saves, bug status changes, kanban moves, etc.) without each one
// needing to know about sharing.
async function _pushShareSnapshot(entry, doc, settings) {
    const encContent = await _encryptSharePayload(doc, Uint8Array.from(atob(entry.keyBase64), c => c.charCodeAt(0)));
    const base = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/shared/${entry.shareId}.enc`;
    const headers = { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
    const body = { message: `Update share: ${doc.title}`, content: btoa(unescape(encodeURIComponent(encContent))), branch: settings.branch || 'main' };
    if (entry.sha) body.sha = entry.sha;

    let res = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) });
    if (!res.ok && (res.status === 409 || res.status === 422)) {
        // Our cached sha is stale (e.g. this browser missed a prior push) —
        // fetch the current one and retry once before giving up.
        const g = await fetch(`${base}?ref=${settings.branch || 'main'}`, { headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json' } });
        if (g.ok) {
            body.sha = (await g.json()).sha;
            res = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(body) });
        }
    }
    if (!res.ok) throw new Error(`GitHub error ${res.status}`);

    const putData = await res.json().catch(() => ({}));
    entry.sha = (putData.content && putData.content.sha) || entry.sha;
    entry.docUpdatedAt = doc.updatedAt;
}

async function syncActiveShares() {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
    const shares = _getShares();
    if (!shares.length) return;

    const stale = shares.filter(entry => entry.keyBase64 && entry.docUpdatedAt !== undefined
        ? documents.some(d => d.id === entry.docId && d.status !== 'deleted' && d.updatedAt !== entry.docUpdatedAt)
        : false);
    if (!stale.length) return;

    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) return; // sharing needs a token anyway; retry silently on the next persist

    let changed = false;
    for (const entry of stale) {
        const doc = documents.find(d => d.id === entry.docId && d.status !== 'deleted');
        // A doc that turned into a credential after being shared must never sync plaintext secrets.
        if (!doc || doc.category === 'credential') continue;
        try {
            await _pushShareSnapshot(entry, doc, settings);
            changed = true;
        } catch (e) {
            console.warn('[syncActiveShares] failed for', entry.shareId, e);
        }
    }
    if (changed) _saveShares(shares);
}

// ========================
// SHARE DOCUMENT
// ========================
window.shareDoc = async function(id) {
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        toast('Sharing is disabled in demo mode.', 'info');
        return;
    }
    const doc = documents.find(d => d.id === id);
    if (!doc) return;

    // Security: a share link publishes AES-GCM ciphertext with the decryption
    // key in the URL fragment (#key=), so anyone holding the link can decrypt
    // the payload. Credential documents hold plaintext username/password and
    // must never be shared this way.
    if (doc.category === 'credential') {
        toast('Sharing is disabled for credential documents for security.', 'info');
        return;
    }

    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) {
        toast('Configure GitHub in Settings to share documents.', 'warning');
        return;
    }

    showModal(`
        <div class="text-center py-6">
            <i class="fa-solid fa-spinner fa-spin text-2xl mb-4" style="color:var(--acc)"></i>
            <p class="text-sm" style="color:var(--tx-m)">Generating secure link...</p>
        </div>
    `);

    try {
        const keyBytes = crypto.getRandomValues(new Uint8Array(32));
        const keyBase64 = uint8ToBase64(keyBytes);
        const encContent = await _encryptSharePayload(doc, keyBytes);

        const shareId = `sh_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 6)}`;
        const res = await fetch(
            `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/shared/${shareId}.enc`,
            {
                method: 'PUT',
                headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Share: ${doc.title}`, content: btoa(unescape(encodeURIComponent(encContent))), branch: settings.branch || 'main' })
            }
        );
        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

        // Record the share so it can be listed and revoked later (US-304), and so
        // it can be kept in sync (with its own key + last-pushed updatedAt) whenever
        // the source document changes — see syncActiveShares() above.
        const putData = await res.json().catch(() => ({}));
        _recordShare({ shareId, docId: doc.id, title: doc.title, category: doc.category, createdAt: Date.now(), sha: (putData.content && putData.content.sha) || null, keyBase64, docUpdatedAt: doc.updatedAt });

        const shareUrl = `${location.origin}${location.pathname}?shareId=${shareId}#key=${encodeURIComponent(keyBase64)}`;

        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.1);">
                    <i class="fa-solid fa-check text-emerald-400 text-xl"></i>
                </div>
                <h3 class="font-heading font-semibold text-lg mb-2">Link Ready!</h3>
                <p class="text-sm mb-4" style="color:var(--tx-m);">Anyone with this link can view the document. The content is end-to-end encrypted.</p>
                <div class="flex items-center gap-2 p-3 rounded-lg border mb-5 text-left" style="background:var(--bg);border-color:var(--brd);">
                    <input type="text" readonly id="share-url-input" value="${escHtml(shareUrl)}" class="flex-1 bg-transparent text-xs outline-none font-mono" style="color:var(--tx);">
                    <button class="shrink-0 btn-s px-3 py-1.5 text-xs" data-onclick="copyShareUrl(this)">
                        <i class="fa-regular fa-copy mr-1"></i>Copy
                    </button>
                </div>
                <button class="btn-s px-4" data-onclick="closeModal()">Close</button>
            </div>
        `);
    } catch(e) {
        console.error('[shareDoc]', e);
        toast('Failed to create share link: ' + e.message, 'error');
        closeModal();
    }
};

async function loadSharedDoc(shareId, keyBase64) {
    try {
        const d = GitHubSync.DEFAULTS;
        // Fetch via the GitHub Contents API, NOT raw.githubusercontent.com. The raw
        // CDN caches files for ~5 minutes, so a revoked (deleted) share would keep
        // resolving from cache and stay viewable. The API reflects deletions
        // immediately (404), which is what makes revocation actually take effect.
        const apiUrl = `https://api.github.com/repos/${d.owner}/${d.repo}/contents/shared/${shareId}.enc?ref=${d.branch || 'main'}`;
        const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github+json' }, cache: 'no-store' });
        if (!res.ok) throw new Error('Document not found or link has expired.');

        const data = await res.json();
        const encContent = decodeURIComponent(escape(atob((data.content || '').replace(/\n/g, '')))).trim();
        const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));

        const packed = Uint8Array.from(atob(encContent), c => c.charCodeAt(0));
        const iv = packed.slice(0, 12);
        const cipher = packed.slice(12);

        const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, rawKey, cipher);
        const doc = JSON.parse(new TextDecoder().decode(plain));
        const embeddedLinkedDocs = doc._linkedDocs || [];
        delete doc._linkedDocs;

        const mainDoc = { ...doc, id: shareId, status: doc.status || 'published', favorite: false, updatedAt: doc.createdAt || Date.now(), tags: doc.tags || [] };
        documents = [mainDoc, ...embeddedLinkedDocs];
        state.view = 'viewer';
        state.sharedView = true;
        state.editingDoc = documents[0];
        document.getElementById('sidebar').style.display = 'none';
        const sbBtn = document.querySelector('button[data-onclick="toggleSidebar()"]');
        if (sbBtn) sbBtn.style.display = 'none';
        render();
    } catch(e) {
        console.error('[loadSharedDoc]', e);
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen" style="background:var(--bg)"><div class="p-10 text-center max-w-sm"><div class="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style="background:rgba(244,63,94,0.1);"><i class="fa-solid fa-link-slash text-rose-400 text-2xl"></i></div><h1 class="font-heading text-xl font-bold mb-3" style="color:var(--tx)">Link Invalid or Expired</h1><p class="text-sm mb-6" style="color:var(--tx-m)">${escHtml(e.message)}</p><button class="btn-p" data-onclick="openAppHome()">Go to DocVault</button></div></div>`;
    }
}
