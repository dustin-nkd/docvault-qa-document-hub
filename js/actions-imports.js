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

    const rawResponses = (Array.isArray(item.response) ? item.response : []).map(r => ({
        code: String(r.code || ''),
        body: typeof r.body === 'string' ? r.body : (r.body !== undefined ? JSON.stringify(r.body, null, 2) : '')
    }));
    const responses = _normalizeApiResponses({ responses: rawResponses });
    const primary = _primaryApiExample(responses);
    const statusCode = primary.code, response = primary.body;

    return {
        title: item.name || endpoint || 'Untitled Request',
        subfolder: subfolderPath.join('/'),
        apiData: { method, endpoint, headers, params, body, statusCode, response, responses }
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

            let responses = [{ code: '200', body: '' }];
            try {
                const opResponses = op.responses || {};
                const rawResponses = Object.keys(opResponses).map(code => {
                    const jc = opResponses[code]?.content?.['application/json'];
                    const resBody = jc ? JSON.stringify(jc.example !== undefined ? jc.example : jc.schema, null, 2) : '';
                    return { code: String(code), body: resBody };
                });
                responses = _normalizeApiResponses({ responses: rawResponses });
            } catch (e) {}
            const primary = _primaryApiExample(responses);
            const statusCode = primary.code, response = primary.body;

            results.push({
                title: op.summary || `${m.toUpperCase()} ${pathKey}`,
                subfolder: (op.tags && op.tags[0]) || '',
                apiData: { method: m.toUpperCase(), endpoint: pathKey, headers, params, body, statusCode, response, responses }
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
// API SPEC RESPONSE EXAMPLES
// ========================
function _normalizeApiResponses(api) {
    const raw = (Array.isArray(api?.responses) && api.responses.length)
        ? api.responses
        : [{ code: String(api?.statusCode || '200'), body: String(api?.response || '') }];
    const valid = new Set((window.API_STATUS_OPTIONS || []).map(o => String(o.value)));
    const seen = new Set(), result = [];
    raw.forEach(r => {
        const code = String(r?.code || '').trim();
        if (valid.has(code) && !seen.has(code)) {
            seen.add(code);
            result.push({ code, body: typeof r.body === 'string' ? r.body : (r.body != null ? String(r.body) : '') });
        }
    });
    return result.length ? result : [{ code: '200', body: '' }];
}

function _primaryApiExample(examples) {
    if (!Array.isArray(examples) || !examples.length) return { code: '200', body: '' };
    return examples.find(e => String(e.code || '').startsWith('2')) || examples[0];
}

function _apiChangeFingerprint(api) {
    if (!api) return '';
    const responses = _normalizeApiResponses(api);
    const primary = _primaryApiExample(responses);
    return JSON.stringify({
        method: api.method || 'GET', endpoint: api.endpoint || '', module: api.module || '',
        headers: (api.headers || []).map(h => ({ key: h.key || '', value: h.value || '', req: !!h.req })),
        params: (api.params || []).map(p => ({ key: p.key || '', value: p.value || '', req: !!p.req })),
        body: api.body || '', statusCode: primary.code, response: primary.body, responses
    });
}

function renderApiResponseExamples(api, docId) {
    const responses = _normalizeApiResponses(api);
    const primary = _primaryApiExample(responses);
    const id = docId || (documents.find(d => d.apiData === api)?.id || '');
    const chipsHtml = responses.map(ex => {
        const c = parseInt(ex.code) || 200;
        const col = c < 300 ? '#10b981' : c < 400 ? '#60a5fa' : c < 500 ? '#f97316' : '#ef4444';
        const isSel = ex.code === primary.code;
        return `<button type="button" class="api-example-chip text-xs font-bold px-2 py-0.5 rounded font-mono" style="background:${col}22;color:${col};border:1px solid ${isSel ? col : 'transparent'};cursor:pointer;" data-onclick="showApiResponseExample('${escHtml(id)}','${escHtml(ex.code)}')" data-code="${escHtml(ex.code)}" data-color="${col}">${escHtml(ex.code)}</button>`;
    }).join('');
    const bodiesHtml = responses.map(ex => {
        const isSel = ex.code === primary.code;
        const hasBody = !!(ex.body && ex.body.trim());
        if (!hasBody) return `<p class="api-example-empty text-xs py-2" style="${isSel ? '' : 'display:none;'}color:var(--tx-d);" data-code="${escHtml(ex.code)}">No response body defined.</p>`;
        return `<pre ${isSel ? 'id="viewer-api-response"' : ''} class="api-example-body text-xs p-3 rounded-lg overflow-x-auto custom-scrollbar" style="${isSel ? '' : 'display:none;'}position:relative;background:var(--card);border:1px solid var(--brd);color:var(--tx);font-family:monospace;white-space:pre-wrap;word-break:break-all;margin:0;" data-code="${escHtml(ex.code)}"><button class="code-copy-btn" data-onclick="_copyPre('viewer-api-response', this)" title="Copy"><i class="fa-regular fa-copy"></i></button>${escHtml(ex.body)}</pre>`;
    }).join('');
    return `<div class="api-response-block" data-doc-id="${escHtml(id)}"><div class="api-section-divider flex items-center gap-3 mb-3"><span class="api-section-title text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Response</span><div class="api-section-line flex-1" style="height:1px;background:var(--brd);"></div></div><div class="flex flex-wrap gap-2 mb-3">${chipsHtml}</div>${bodiesHtml}</div>`;
}

window.showApiResponseExample = function(docId, code) {
    const card = (docId ? document.querySelector(`.api-response-block[data-doc-id="${docId}"]`) : null) || document.querySelector('.api-response-block') || document.querySelector('.api-viewer-card');
    if (!card) return;
    card.querySelectorAll('.api-example-chip').forEach(ch => {
        const match = ch.getAttribute('data-code') === String(code);
        ch.style.borderColor = match ? (ch.getAttribute('data-color') || '#10b981') : 'transparent';
    });
    const cur = card.querySelector('#viewer-api-response');
    if (cur) cur.removeAttribute('id');
    card.querySelectorAll('.api-example-body').forEach(pre => {
        const match = pre.getAttribute('data-code') === String(code);
        pre.style.display = match ? '' : 'none';
        if (match) pre.id = 'viewer-api-response';
    });
    card.querySelectorAll('.api-example-empty').forEach(el => {
        el.style.display = el.getAttribute('data-code') === String(code) ? '' : 'none';
    });
};

function _renderApiResponseRow(code, body, idx, canDel) {
    const sId = 'ed-api-status-' + idx, bId = 'ed-api-response-' + idx;
    return `<div class="api-response-row p-3 rounded-lg mb-3" style="background:var(--bg);border:1px solid var(--brd);"><div class="flex items-center justify-between gap-2 mb-2"><div class="api-status-select-wrap" style="width:165px;">${renderSelect(sId, window.API_STATUS_OPTIONS || [], code, 'w-full font-mono text-xs', '', 'Response status code')}</div><div class="flex items-center gap-2"><button type="button" class="btn-s text-[10px] px-2 py-1" data-onclick="formatJson('${bId}')" title="${t('formatJson')}"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Format</button><button type="button" class="btn-s px-2 py-1 api-response-del-btn" style="color:var(--tx-m);${canDel ? '' : 'display:none;'}" data-onclick="removeApiResponse(this)" aria-label="Remove response" title="Remove response"><i class="fa-solid fa-trash"></i></button></div></div><textarea id="${bId}" class="form-input font-mono text-xs w-full api-response-body" style="height:90px;" placeholder="{\\n  &quot;status&quot;: &quot;success&quot;\\n}">${escHtml(body || '')}</textarea></div>`;
}

function renderApiResponseEditor(apiData) {
    const list = _normalizeApiResponses(apiData);
    return list.map((r, i) => _renderApiResponseRow(r.code, r.body, i, list.length > 1)).join('');
}

window.addApiResponse = function() {
    const cont = document.getElementById('api-responses-container');
    if (!cont) return;
    const existing = new Set(Array.from(cont.querySelectorAll('.api-response-row')).map(row => row.querySelector('.api-status-select-wrap input[type="hidden"]')?.value || ''));
    const next = (window.API_STATUS_OPTIONS || []).find(o => !existing.has(o.value));
    if (!next) return;
    const idx = cont.querySelectorAll('.api-response-row').length + '_' + Date.now();
    const wrap = document.createElement('div');
    wrap.innerHTML = _renderApiResponseRow(next.value, '', idx, true);
    cont.appendChild(wrap.firstElementChild);
    cont.querySelectorAll('.api-response-del-btn').forEach(btn => { btn.style.display = ''; btn.disabled = false; });
};

window.removeApiResponse = function(btn) {
    const cont = document.getElementById('api-responses-container');
    if (!cont || cont.querySelectorAll('.api-response-row').length <= 1) return;
    btn.closest('.api-response-row')?.remove();
    const rows = cont.querySelectorAll('.api-response-row');
    if (rows.length <= 1) {
        rows.forEach(r => { const del = r.querySelector('.api-response-del-btn'); if (del) { del.style.display = 'none'; del.disabled = true; } });
    }
};

window._normalizeApiResponses = _normalizeApiResponses;
window._primaryApiExample = _primaryApiExample;
window._apiChangeFingerprint = _apiChangeFingerprint;
window.renderApiResponseExamples = renderApiResponseExamples;
window.renderApiResponseEditor = renderApiResponseEditor;

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
window.compressImage = compressImage;

// Image storage strategy (A1, opt-in / PA B):
async function uploadImageToCloud(blob, callback) {
    if (window.COLLAB_MODE && window.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
        toast('You have view access', 'error');
        return;
    }
    if (window.COLLAB_MODE) {
        if (window.CollabImages?.uploadImage) {
            return window.CollabImages.uploadImage(blob, callback);
        }
        toast('Team image service not ready', 'error');
        return;
    }
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
    if (window.COLLAB_MODE) {
        if (window.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            toast('You have view access', 'error');
            return;
        }
        return window.CollabImages?.compactImages ? window.CollabImages.compactImages() : null;
    }
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
    if (window.COLLAB_MODE) {
        if (window.CollabBootstrap?.getCurrentMember?.()?.role === 'viewer') {
            toast('You have view access', 'error');
            return;
        }
        return window.CollabImages?.doCompactImages ? window.CollabImages.doCompactImages() : null;
    }
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
        // An imported file only has to carry id/title/category, so its documents
        // can arrive with no tags array. hydrate() normalises that on load; this
        // path skips hydrate, so it must do the same or the next render throws.
        if (typeof normalizeDocTags === 'function') normalizeDocTags(fresh);
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
