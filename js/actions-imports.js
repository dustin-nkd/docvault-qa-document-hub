// ========================
// CSV EXPORT (US-301)
// ========================
window.exportBugsCsv = function() {
    const bugs = documents.filter(d => d.category === 'bug' && d.status !== 'deleted');
    if (!bugs.length) { toast('No bugs to export.', 'info'); return; }
    const header = ['ID', 'Title', 'Severity', 'Priority', 'Status', 'Classification', 'Assignee', 'Decision SLA (h)', 'Triaged', 'Duplicate Of', 'Environment', 'Browser', 'Created', 'Updated'];
    const norm = (typeof _normBugStatus === 'function') ? _normBugStatus : (s => s || 'new');
    const iso = ts => ts ? new Date(ts).toISOString().slice(0, 10) : '';
    const rows = [header];
    bugs.sort((a, b) => (a.bugNumber || 0) - (b.bugNumber || 0)).forEach(b => {
        rows.push([
            bugRef(b), b.title || '', b.bugData?.severity || '', b.bugData?.priority || '',
            norm(b.bugStatus), b.bugData?.classification || 'unclassified', b.bugData?.assignee || '',
            b.bugData?.slaHours || '', iso(b.bugData?.triagedAt), b.bugData?.duplicateOf || '',
            b.bugData?.env || '', b.bugData?.browser || '', iso(b.createdAt), iso(b.updatedAt)
        ]);
    });
    downloadFile(`docvault-bugs-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    toast(`Exported ${bugs.length} bug${bugs.length > 1 ? 's' : ''} to CSV.`, 'success');
};

window.exportTestRunCsv = function(runId) {
    const run = documents.find(d => d.id === runId);
    if (!run || run.category !== 'testrun') return;
    const results = run.runData?.results || {};
    const snapshot = run.runData?.snapshot || {};
    const targetIds = run.runData?.targetIds || [];
    const rows = [['Test Case', 'Step #', 'Action', 'Expected', 'Result', 'Note']];
    targetIds.forEach(tcId => {
        const tc = documents.find(d => d.id === tcId);
        const steps = snapshot[tcId] || tc?.tcData?.steps || [];
        const note = results[tcId]?.note || '';
        if (!steps.length) { rows.push([tc?.title || tcId, '', '', '', '', note]); return; }
        steps.forEach((s, i) => {
            rows.push([tc?.title || tcId, i + 1, s.action || '', s.expected || '', results[tcId]?.[i] || 'untested', i === 0 ? note : '']);
        });
    });
    const slug = (run.title || 'run').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    downloadFile(`docvault-run-${slug}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
    toast('Test run exported to CSV.', 'success');
};

// ========================
// API IMPORT — Postman Collection v2.x / OpenAPI 3.x (Sprint 12)
// ========================
function _parsePostmanRequest(item, subfolderPath) {
    const req = item.request;
    if (!req) return null;
    const method = (req.method || 'GET').toUpperCase();
    let endpoint = '';
    if (typeof req.url === 'string') endpoint = req.url;
    else if (req.url && typeof req.url === 'object') endpoint = req.url.raw || ('/' + (req.url.path || []).join('/'));

    const headers = (req.header || []).filter(h => !h.disabled).map(h => ({ key: h.key || '', value: h.value || '', req: true }));
    const params = ((req.url && req.url.query) || []).filter(q => !q.disabled).map(q => ({ key: q.key || '', value: q.value || '', req: false }));

    let body = '';
    if (req.body) {
        if (req.body.mode === 'raw') body = req.body.raw || '';
        else if (req.body.mode === 'urlencoded') body = (req.body.urlencoded || []).filter(p => !p.disabled).map(p => `${p.key}=${p.value}`).join('&');
    }

    let statusCode = '200', response = '';
    if (Array.isArray(item.response) && item.response.length) {
        statusCode = String(item.response[0].code || 200);
        response = item.response[0].body || '';
    }

    return {
        title: item.name || endpoint || 'Untitled Request',
        subfolder: subfolderPath.join('/'),
        apiData: { method, endpoint, headers, params, body, statusCode, response }
    };
}

// Postman collections nest requests inside folders (item[].item[]...); walk the
// tree and flatten it, turning the folder path into a DocVault subfolder.
function _parsePostmanCollection(json) {
    const results = [];
    (function walk(items, path) {
        (items || []).forEach(it => {
            if (Array.isArray(it.item)) walk(it.item, [...path, it.name || 'Folder']);
            else if (it.request) { const p = _parsePostmanRequest(it, path); if (p) results.push(p); }
        });
    })(json.item, []);
    return results;
}

function _parseOpenApi(json) {
    const results = [];
    const paths = json.paths || {};
    const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
    Object.keys(paths).forEach(pathKey => {
        const pathItem = paths[pathKey] || {};
        METHODS.forEach(m => {
            const op = pathItem[m];
            if (!op) return;

            const headers = [], params = [];
            (op.parameters || []).forEach(p => {
                const entry = { key: p.name || '', value: p.example !== undefined ? String(p.example) : '', req: !!p.required };
                (p.in === 'header' ? headers : params).push(entry);
            });

            let body = '';
            try {
                const jc = op.requestBody && op.requestBody.content && op.requestBody.content['application/json'];
                if (jc) body = JSON.stringify(jc.example !== undefined ? jc.example : jc.schema, null, 2);
            } catch (e) {}

            let statusCode = '200', response = '';
            try {
                const responses = op.responses || {};
                const codes = Object.keys(responses);
                const okCode = codes.find(c => c.startsWith('2')) || codes[0];
                if (okCode) {
                    statusCode = okCode;
                    const jc = responses[okCode].content && responses[okCode].content['application/json'];
                    if (jc) response = JSON.stringify(jc.example !== undefined ? jc.example : jc.schema, null, 2);
                }
            } catch (e) {}

            results.push({
                title: op.summary || `${m.toUpperCase()} ${pathKey}`,
                subfolder: (op.tags && op.tags[0]) || '',
                apiData: { method: m.toUpperCase(), endpoint: pathKey, headers, params, body, statusCode, response }
            });
        });
    });
    return results;
}

window.triggerApiImport = function() {
    let input = document.getElementById('api-import-input');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'api-import-input';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.addEventListener('change', () => window.handleApiImportFile(input));
        document.body.appendChild(input);
    }
    input.value = ''; // allow re-importing the same file
    input.click();
};

window.handleApiImportFile = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        let json;
        try { json = JSON.parse(e.target.result); }
        catch (err) { toast('Could not parse file — not valid JSON.', 'error'); return; }

        let parsed = [], formatLabel = '';
        try {
            const isPostman = Array.isArray(json.item) || (json.info && /postman/i.test(json.info.schema || ''));
            const isOpenApi = !!(json.openapi || json.swagger);
            if (isPostman) { parsed = _parsePostmanCollection(json); formatLabel = 'Postman Collection'; }
            else if (isOpenApi) { parsed = _parseOpenApi(json); formatLabel = 'OpenAPI'; }
            else { toast('Unrecognized file — expected a Postman Collection or OpenAPI spec.', 'error'); return; }
        } catch (err) { toast('Failed to parse the file: ' + err.message, 'error'); return; }

        if (!parsed.length) { toast('No API requests found in this file.', 'warning'); return; }

        window._pendingApiImport = parsed;
        const folders = new Set(parsed.map(p => p.subfolder).filter(Boolean));
        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.12);"><i class="fa-solid fa-file-import" style="color:var(--acc);"></i></div>
                <h3 class="font-heading font-semibold text-lg mb-2">Import ${parsed.length} API request${parsed.length > 1 ? 's' : ''}?</h3>
                <p class="text-sm mb-5" style="color:var(--tx-m);">Detected format: <strong style="color:var(--tx);">${formatLabel}</strong>${folders.size ? ` across ${folders.size} folder${folders.size > 1 ? 's' : ''}` : ''}. Each becomes a new draft API Specs document (tagged "imported"). Existing documents aren't checked for duplicates.</p>
                <div class="flex gap-3 justify-center">
                    <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                    <button class="btn-p" data-onclick="_doApiImport()">Import</button>
                </div>
            </div>`);
    };
    reader.onerror = () => toast('Could not read the file.', 'error');
    reader.readAsText(file);
};

window._doApiImport = async function() {
    closeModal();
    const parsed = window._pendingApiImport || [];
    window._pendingApiImport = null;
    if (!parsed.length) return;
    const now = Date.now();
    parsed.forEach((p, i) => {
        documents.unshift({
            id: uid(), title: p.title, category: 'api', subfolder: p.subfolder || '',
            status: 'draft', content: '', tags: ['imported'], favorite: false,
            apiData: p.apiData, createdAt: now + i, updatedAt: now + i
        });
    });
    await persist();
    render();
    toast(`Imported ${parsed.length} API spec${parsed.length > 1 ? 's' : ''}.`, 'success');
};

// ========================
// API TRY-IT — send a live request from the browser
// ========================
window.saveApiTryitBaseUrl = function(v) {
    localStorage.setItem('docvault_api_tryit_baseurl', v || '');
};

// Simulates a network round-trip and returns the doc's own saved status/body
// as the "live" response — no fetch() call happens, so it works with no
// backend, no CORS, and no internet (see API_TRYIT_MOCK_BASE, constants.js).
async function _mockApiResponse(api) {
    await new Promise(r => setTimeout(r, 250 + Math.random() * 350));
    const statusText = {
        200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request',
        401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error'
    };
    const status = parseInt(api.statusCode || '200') || 200;
    return {
        status,
        statusText: statusText[status] || '',
        text: async () => (api.response && api.response.trim()) ? api.response : '{}',
        mocked: true
    };
}

window.tryApiRequest = async function(docId) {
    const doc = documents.find(d => d.id === docId);
    if (!doc || !doc.apiData) return;
    const api = doc.apiData;

    const btn = document.getElementById('api-tryit-btn');
    const resultEl = document.getElementById('api-tryit-result');
    const baseUrlInput = document.getElementById('api-tryit-baseurl');
    const baseUrl = (baseUrlInput?.value || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        toast('Enter a base URL first (e.g. https://api.example.com).', 'error');
        baseUrlInput?.focus();
        return;
    }

    const path = (api.endpoint || '/').trim();
    const fullPath = path.startsWith('/') ? path : '/' + path;
    const params = (api.params || []).filter(p => p.key && p.key.trim());
    const query = params.length
        ? '?' + params.map(p => `${encodeURIComponent(p.key.trim())}=${encodeURIComponent(p.value || '')}`).join('&')
        : '';
    const url = baseUrl + fullPath + query;

    const headers = {};
    (api.headers || []).forEach(h => { if (h.key && h.key.trim()) headers[h.key.trim()] = h.value || ''; });

    const method = (api.method || 'GET').toUpperCase();
    const opts = { method, headers };
    if (!['GET', 'HEAD'].includes(method) && api.body && api.body.trim()) {
        opts.body = api.body;
        if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = 'application/json';
        }
    }

    setButtonBusy(btn, true, 'Sending request...');
    if (resultEl) {
        resultEl.setAttribute('aria-busy', 'true');
        resultEl.innerHTML = '<div class="ui-state ui-state-compact" role="status"><span class="ui-state-icon"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i></span><h3>Sending request</h3><p>Waiting for the endpoint to respond...</p></div>';
    }

    const isMock = baseUrl.toLowerCase() === API_TRYIT_MOCK_BASE.toLowerCase();

    const start = performance.now();
    try {
        const res = isMock ? await _mockApiResponse(api) : await fetch(url, opts);
        const elapsed = Math.round(performance.now() - start);
        const text = await res.text();
        let pretty = text;
        try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch(e) { /* not JSON, show raw */ }

        const expected = parseInt(api.statusCode || '200');
        const matches = res.status === expected;
        const statusColor = res.status < 300 ? '#10b981' : res.status < 400 ? '#60a5fa' : res.status < 500 ? '#f97316' : '#ef4444';

        if (resultEl) resultEl.innerHTML = `
            <div class="px-4 pt-4">
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <span class="text-xs font-bold px-2 py-0.5 rounded font-mono" style="background:${statusColor}22;color:${statusColor};">${res.status} ${escHtml(res.statusText || '')}</span>
                    <span class="text-xs" style="color:var(--tx-d);">${elapsed}ms</span>
                    ${matches
                        ? `<span class="text-xs font-medium" style="color:#10b981;"><i class="fa-solid fa-check mr-1"></i>Matches expected ${expected}</span>`
                        : `<span class="text-xs font-medium" style="color:#f97316;"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Expected ${expected}</span>`}
                    ${res.mocked ? `<span class="text-xs font-medium" style="color:#8b5cf6;"><i class="fa-solid fa-flask mr-1"></i>Mocked response — no real network call</span>` : ''}
                </div>
                <pre id="viewer-api-tryit-response" class="text-xs p-3 rounded-lg overflow-x-auto custom-scrollbar mb-4" style="position:relative;background:var(--card);border:1px solid var(--brd);color:var(--tx);font-family:monospace;white-space:pre-wrap;word-break:break-all;margin:0;"><button class="code-copy-btn" data-onclick="_copyPre('viewer-api-tryit-response', this)" title="Copy"><i class="fa-regular fa-copy"></i></button>${escHtml(pretty || '(empty response body)')}</pre>
            </div>`;
    } catch(e) {
        if (resultEl) resultEl.innerHTML = `
            <div class="ui-state ui-state-error ui-state-compact" role="alert">
                <span class="ui-state-icon"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i></span>
                <h3>Request failed</h3>
                <p>The endpoint may be unreachable, blocked by CORS, or using an invalid URL.</p>
                <div class="ui-state-actions"><button class="btn-s text-xs" data-onclick="tryApiRequest('${docId}')"><i class="fa-solid fa-rotate-right mr-1.5"></i>Retry request</button></div>
            </div>`;
    } finally {
        setButtonBusy(btn, false);
        if (resultEl) resultEl.removeAttribute('aria-busy');
    }
};

// ========================
// IMAGE COMPRESSION + INLINE BASE64
// ========================
async function compressImage(blob, maxPx, quality) {
    // PNG with transparency stays PNG; everything else becomes JPEG
    const keepPng = blob.type === 'image/png';
    const bitmap = await createImageBitmap(blob);
    let { width, height } = bitmap;
    if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', keepPng ? undefined : quality);
}

// Image storage strategy (A1, opt-in / PA B):
// - Default: inline base64, which stays INSIDE the encrypted document.
// - Opt-in (docvault_img_cdn flag) + a GitHub token: upload the compressed image
//   to the public repo's images/ folder and reference it by URL, so large images
//   don't bloat the encrypted vault. Note this makes those images public.
// - Any failure (no token, upload error) falls back to inline so nothing is lost.
async function uploadImageToCloud(blob, callback) {
    let dataUrl;
    try {
        dataUrl = await compressImage(blob, 1200, 0.80);
    } catch(err) {
        toast(t('imgProcessFail'), 'error');
        return;
    }

    const cdnOn = localStorage.getItem('docvault_img_cdn') === '1';
    let settings = null;
    if (cdnOn) { try { settings = await GitHubSync.getSettings(); } catch(e) {} }
    if (!cdnOn || !settings || !settings.token) {
        callback(dataUrl, blob.name || 'image');
        return;
    }

    try {
        const url = await _putImageToCdn(dataUrl, settings);
        callback(url, blob.name || 'image');
    } catch(e) {
        toast('Image CDN upload failed — stored inline instead.', 'error');
        callback(dataUrl, blob.name || 'image');
    }
}

// Upload a data:image base64 URL to the repo's images/ folder, return its raw URL.
async function _putImageToCdn(dataUrl, settings) {
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(0, comma);
    const b64 = dataUrl.slice(comma + 1); // base64 of the image bytes = GitHub PUT content
    const ext = /image\/png/.test(meta) ? 'png' : (/image\/gif/.test(meta) ? 'gif' : (/image\/webp/.test(meta) ? 'webp' : 'jpg'));
    const name = `img_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const res = await fetch(`https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/images/${name}`, {
        method: 'PUT',
        headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Image ${name}`, content: b64, branch: settings.branch || 'main' })
    });
    if (!res.ok) throw new Error('GitHub ' + res.status);
    return `https://raw.githubusercontent.com/${settings.owner}/${settings.repo}/${settings.branch || 'main'}/images/${name}`;
}

// Migrate all inline base64 images in active documents to the public CDN (S6-2).
window.compactImages = async function() {
    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) { toast('Add a GitHub token in Settings first.', 'warning'); return; }
    const DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
    let imgs = 0, bytes = 0;
    documents.forEach(d => {
        if (d.status === 'deleted' || typeof d.content !== 'string') return;
        [...new Set(d.content.match(DATA_RE) || [])].forEach(u => { imgs++; bytes += u.length; });
    });
    if (imgs === 0) { toast('No inline images to compact.', 'info'); return; }
    const mb = (bytes / 1048576).toFixed(1);
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(99,102,241,0.12);"><i class="fa-solid fa-compress" style="color:#818cf8;"></i></div>
            <h3 class="font-heading font-semibold text-lg mb-2">Compact ${imgs} inline image${imgs > 1 ? 's' : ''}?</h3>
            <p class="text-sm mb-5" style="color:var(--tx-m);">This uploads ~${mb} MB of embedded images to the <strong style="color:#f59e0b;">public</strong> GitHub CDN and replaces them with links, shrinking your vault. Images become publicly readable.</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                <button class="btn-p" data-onclick="_doCompactImages()">Compact</button>
            </div>
        </div>`);
};

window._doCompactImages = async function() {
    closeModal();
    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) return;
    toast('Compacting images…', 'info');
    const DATA_RE = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
    let uploaded = 0, failed = 0;
    for (const d of documents) {
        if (d.status === 'deleted' || typeof d.content !== 'string' || !d.content.includes('data:image/')) continue;
        const urls = [...new Set(d.content.match(DATA_RE) || [])];
        if (!urls.length) continue;
        let content = d.content, changed = false;
        for (const dataUrl of urls) {
            try { const cdn = await _putImageToCdn(dataUrl, settings); content = content.split(dataUrl).join(cdn); changed = true; uploaded++; }
            catch(e) { failed++; }
        }
        if (changed) { d.content = content; d.updatedAt = Date.now(); }
    }
    await persist();
    if (state.editingDoc) { const cur = documents.find(x => x.id === state.editingDoc.id); if (cur) state.editingDoc = { ...cur }; }
    render();
    toast(`Compacted ${uploaded} image${uploaded !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'success');
};

// ========================
// IMAGE GARBAGE COLLECTION (Sprint 9) — delete CDN images no document references
// ========================
window.cleanupUnusedImages = async function() {
    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) { toast('Add a GitHub token in Settings first.', 'warning'); return; }
    toast('Scanning for unused images…', 'info');
    try {
        // Refresh from GitHub first (local+remote merge) to shrink the window in
        // which an image referenced only by an unsynced edit on another device
        // could be misidentified as orphaned.
        const fresh = await DocStorage.getAll();
        if (fresh) documents = fresh;

        const listUrl = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/images?ref=${settings.branch || 'main'}`;
        const listRes = await fetch(listUrl, { headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json' } });
        if (listRes.status === 404) { toast('No images folder found — nothing to clean up.', 'info'); return; }
        if (!listRes.ok) throw new Error('GitHub ' + listRes.status);
        const files = await listRes.json();
        if (!Array.isArray(files) || files.length === 0) { toast('No images found on the CDN.', 'info'); return; }

        // Referenced-by-any-document check includes Trash (status='deleted' docs
        // are kept for 30 days, see GitHubSync._encode) — an image is only a
        // deletion candidate if NO document, live or trashed, still links to it.
        const referenced = new Set();
        documents.forEach(d => {
            if (typeof d.content !== 'string') return;
            (d.content.match(/https:\/\/raw\.githubusercontent\.com\/[^\s)"]+\/images\/[^\s)"]+/g) || []).forEach(u => {
                referenced.add(u.slice(u.lastIndexOf('/') + 1));
            });
        });

        const orphans = files.filter(f => f.type === 'file' && !referenced.has(f.name));
        if (orphans.length === 0) { toast('No unused images found — everything is referenced.', 'success'); return; }

        window._pendingImageCleanup = orphans.map(f => ({ name: f.name, sha: f.sha, path: f.path }));
        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(239,68,68,0.12);"><i class="fa-solid fa-broom" style="color:#f87171;"></i></div>
                <h3 class="font-heading font-semibold text-lg mb-2">Delete ${orphans.length} unused image${orphans.length > 1 ? 's' : ''}?</h3>
                <p class="text-sm mb-5" style="color:var(--tx-m);">These CDN files aren't referenced by any document, including Trash. This <strong style="color:#f87171;">permanently deletes</strong> them from GitHub and cannot be undone. An image referenced only by an edit not yet synced from another device could be affected.</p>
                <div class="flex gap-3 justify-center">
                    <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                    <button class="btn-d" data-onclick="_doCleanupUnusedImages()">Delete</button>
                </div>
            </div>`);
    } catch(e) {
        toast('Scan failed: ' + e.message, 'error');
    }
};

window._doCleanupUnusedImages = async function() {
    closeModal();
    const orphans = window._pendingImageCleanup || [];
    window._pendingImageCleanup = null;
    if (!orphans.length) return;
    const settings = await GitHubSync.getSettings();
    if (!settings || !settings.token) return;
    toast('Deleting unused images…', 'info');
    let deleted = 0, failed = 0;
    for (const f of orphans) {
        try {
            const url = `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${f.path}`;
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `Remove unused image ${f.name}`, sha: f.sha, branch: settings.branch || 'main' })
            });
            if (res.ok) deleted++; else failed++;
        } catch(e) { failed++; }
    }
    toast(`Deleted ${deleted} unused image${deleted !== 1 ? 's' : ''}${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'success');
};

// ========================
// BACKUP EXPORT / IMPORT (Sprint 13, A2) — wires up DocStorage.exportData /
// importData, which existed with no UI entry point anywhere in the app.
// ========================
window.exportBackup = async function() {
    try {
        await DocStorage.exportData();
        toast('Backup exported.', 'success');
    } catch (e) {
        toast(e.message || 'Export failed.', 'error');
    }
};

window.triggerImportBackup = function() {
    let input = document.getElementById('backup-import-input');
    if (!input) {
        input = document.createElement('input');
        input.type = 'file';
        input.id = 'backup-import-input';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.addEventListener('change', () => window.handleImportBackupFile(input));
        document.body.appendChild(input);
    }
    input.value = ''; // allow re-selecting the same file
    input.click();
};

window.handleImportBackupFile = function(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    window._pendingBackupFile = file;
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(99,102,241,0.12);"><i class="fa-solid fa-box-archive" style="color:#818cf8;"></i></div>
            <h3 class="font-heading font-semibold text-lg mb-2">Import "${escHtml(file.name)}"</h3>
            <p class="text-sm mb-5" style="color:var(--tx-m);">Choose how to import this backup.</p>
            <div class="flex flex-col gap-2">
                <button class="btn-p py-2" data-onclick="_doImportBackup('merge')">Merge — add missing documents, keep existing</button>
                <button class="btn-d py-2" data-onclick="_doImportBackup('replace')">Replace ALL documents (cannot be undone)</button>
                <button class="btn-s py-2 mt-1" data-onclick="closeModal()">Cancel</button>
            </div>
        </div>`);
};

window._doImportBackup = async function(mode) {
    closeModal();
    const file = window._pendingBackupFile;
    window._pendingBackupFile = null;
    if (!file) return;
    try {
        const result = await DocStorage.importData(file, mode);
        // importData() writes through DocStorage but doesn't touch the app's
        // in-memory `documents` array — refresh it so the UI reflects the import
        // immediately instead of on next reload.
        const fresh = await DocStorage.getAll();
        if (fresh) documents = fresh;
        render();
        toast(`Imported ${result.imported} document${result.imported !== 1 ? 's' : ''} (${result.total} total).`, 'success');
    } catch (e) {
        toast(e.message || 'Import failed.', 'error');
    }
};

async function _migrateDocImages(doc) {
    if (!doc?.content) return;
    const CDN_RE = /https:\/\/raw\.githubusercontent\.com\/dustin-nkd\/docvault-assets\/[^\s)"]+/g;
    const urls = [...new Set(doc.content.match(CDN_RE) || [])];
    if (urls.length === 0) return;

    const settings = await GitHubSync.getSettings();
    if (!settings?.token) return;

    let content = doc.content;
    let changed = false;

    for (const url of urls) {
        try {
            const pathMatch = url.match(/\/docvault-assets\/[^/]+\/(.+)$/);
            if (!pathMatch) continue;
            const filePath = pathMatch[1];
            const apiUrl = `https://api.github.com/repos/dustin-nkd/docvault-assets/contents/${filePath}`;
            const res = await fetch(apiUrl, {
                headers: { 'Authorization': `token ${settings.token}`, 'Accept': 'application/vnd.github+json' }
            });
            if (!res.ok) continue;
            const data = await res.json();
            const rawBase64 = data.content.replace(/\n/g, '');
            const ext = filePath.split('.').pop().toLowerCase();
            const mimeMap = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
            const mime = mimeMap[ext] || 'image/jpeg';
            const binaryStr = atob(rawBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: mime });
            const compressed = await compressImage(blob, 1200, 0.80);
            content = content.split(url).join(compressed);
            changed = true;
        } catch(e) {
            console.warn('[migrate-img] failed for', url, e.message);
        }
    }

    if (changed) {
        const idx = documents.findIndex(d => d.id === doc.id);
        if (idx !== -1) {
            documents[idx].content = content;
            state.editingDoc = { ...documents[idx] };
            await persist();
            render();
            toast('Images migrated to inline storage', 'info');
        }
    }
}
