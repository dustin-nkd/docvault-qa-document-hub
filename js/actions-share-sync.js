// ========================
// SHARE PAYLOAD (shared by initial share + background re-sync)
// ========================
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
