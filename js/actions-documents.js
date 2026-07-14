// ========================
// DOCUMENT CRUD
// ========================
// Captures every editable field currently in the editor DOM as one comparable
// string (Sprint 15 unsaved-changes guard). Scoped to #content — the only
// thing rendered there in the editor view — so it can't pick up sidebar or
// header inputs. Deliberately generic (scrapes every input/textarea/select by
// DOM order) rather than hand-listing fields per category, so a future field
// or category can't silently slip past the guard the way a hand-maintained
// list could.
function _captureEditorFormState() {
    const root = document.getElementById('content');
    if (!root) return '';
    const parts = [];
    root.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.id === 'ed-content-hidden') return; // superseded by tuiEditor content below
        parts.push(el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value);
    });
    parts.push('tags:' + (state.editorTags || []).join(','));
    parts.push('content:' + getEditorMarkdown());
    return parts.join('|');
}

function createDoc(cat) {
    closeModal();
    pushHistory();
    state.view = 'editor';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state._newCat = cat || 'runbook';
    state._newTitle = '';
    state._newSubfolder = '';
    state._newStatus = 'draft';
    state._newBugData = null;
    state._newTcData = null;
    state._newApiData = null;
    state._newRunData = null;
    state._newTcPlanData = null;
    state._newReleaseData = null;
    state._newContent = cat && TEMPLATES[cat] ? TEMPLATES[cat] : '# New Document\n\nStart writing here...';
    render();
    state._editorSnapshot = _captureEditorFormState();
    setTimeout(() => document.getElementById('ed-title')?.focus(), 100);
}

function editDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'editor';
    state.editingDoc = { ...doc };
    state.editorTags = [...doc.tags];
    state.editorMode = 'edit';
    render();
    state._editorSnapshot = _captureEditorFormState();
}

function viewDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'viewer';
    state.editingDoc = { ...doc };
    state.batchMode = false;
    state.selectedIds = new Set();
    state.lastSelectedId = null;
    history.replaceState({}, '', _appUrl(id));
    render();
    _migrateDocImages(doc);
}

// ========================
// REPORT BUG FROM A FAILED TEST-RUN STEP (B1)
// ========================
window.reportBugFromStep = function(runId, tcId, stepIdx) {
    const run = documents.find(d => d.id === runId);
    const tc = documents.find(d => d.id === tcId);
    if (!run || !tc) { toast('Test run or test case not found.', 'error'); return; }
    const steps = (run.runData?.snapshot?.[tcId]) || tc.tcData?.steps || [];
    const step = steps[stepIdx];
    if (!step) { toast('Step not found.', 'error'); return; }

    pushHistory();
    state.view = 'editor';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state._newCat = 'bug';
    state._newTitle = `[BUG] ${tc.title} — Step ${stepIdx + 1} failed`;
    state._newSubfolder = '';
    state._newStatus = 'draft';
    state._newTcData = null; state._newApiData = null; state._newRunData = null; state._newTcPlanData = null;
    state._newBugData = {
        severity: 'Major', priority: 'P2', env: run.runData?.environment || '', browser: '', precond: '',
        // Repro steps = the test case's actions up to and including the failed step.
        steps: steps.slice(0, stepIdx + 1).map(s => s.action).filter(Boolean),
        expected: step.expected || '',
        actual: '',
        foundInRun: runId, foundInTc: tcId, foundInStep: stepIdx
    };
    state._newContent = `> Reported from test run **${escHtml(run.title)}** — ${escHtml(tc.title)}, step ${stepIdx + 1}.`;
    render();
    setTimeout(() => document.getElementById('ed-bug-actual')?.focus(), 120);
};

// ========================
// BUG LIFECYCLE ACTIONS
// ========================
window.resolveBug = async function(id, resolution) {
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    document.getElementById('doc-menu')?.remove();
    const doc = documents[idx];
    recordBugStatusChange(doc, 'closed');
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.resolution = resolution;
    doc.bugData.triagedAt = doc.bugData.triagedAt || Date.now();
    await persist();
    renderContent();
    const label = { 'wont-fix': "Won't Fix", duplicate: 'Duplicate', rejected: 'Rejected', deferred: 'Deferred' }[resolution] || resolution;
    toast(`Bug closed: ${label}`, 'info');
};

// Bug-duplicate picker (Sprint 15, 15-3): duplicateOf was a free-typed string
// via prompt() and, as it turned out, never actually rendered anywhere in the
// UI — so switching it to store a real document id (making it an actual,
// clickable link) is a safe change with zero backward-compat display to
// preserve.
window.promptDuplicateBug = function(id) {
    document.getElementById('doc-menu')?.remove();
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const otherBugs = documents.filter(d => d.category === 'bug' && d.status !== 'deleted' && d.id !== id)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    window._pendingDuplicateBugId = id;
    showModal(`
        <div class="text-left">
            <h3 class="font-heading font-bold text-lg mb-1" style="color:var(--tx);">Mark as Duplicate</h3>
            <p class="text-sm mb-4" style="color:var(--tx-m);">Select the original bug this is a duplicate of.</p>
            ${otherBugs.length === 0 ? `<p class="text-sm text-center py-6" style="color:var(--tx-d);">No other bugs to link to.</p>` : `
            <input type="text" id="dup-bug-search" class="form-input w-full mb-3 text-sm" placeholder="Search bugs by title..." data-oninput="_filterDuplicateBugList(this.value)" autocomplete="off">
            <div id="dup-bug-list" style="max-height:280px;overflow-y:auto;">
                ${otherBugs.map(b => `
                    <div class="dup-bug-row flex items-center gap-3 p-2.5 rounded-lg cursor-pointer ui-hover-card-h" data-filter-key="${escHtml(b.title.toLowerCase())}" style="border:1px solid var(--brd);margin-bottom:6px;transition:background .15s;" data-onclick="_selectDuplicateOfBug('${b.id}')">
                        <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style="background:var(--card);color:var(--c-bug);">${bugRef(b)}</span>
                        <span class="text-sm flex-1 truncate" style="color:var(--tx);">${escHtml(b.title)}</span>
                        <span class="st-badge st-${b.status} shrink-0">${b.status}</span>
                    </div>
                `).join('')}
                <div id="dup-bug-empty" class="hidden text-center text-sm py-4" style="color:var(--tx-d);">No matching bugs.</div>
            </div>`}
            <div class="flex justify-end mt-3"><button class="btn-s" data-onclick="closeModal()">Cancel</button></div>
        </div>
    `);
    setTimeout(() => document.getElementById('dup-bug-search')?.focus(), 50);
};

window._filterDuplicateBugList = function(query) {
    const q = (query || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.dup-bug-row').forEach(row => {
        const match = (row.getAttribute('data-filter-key') || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    const empty = document.getElementById('dup-bug-empty');
    if (empty) empty.classList.toggle('hidden', !(q && visible === 0));
};

window._selectDuplicateOfBug = async function(originalBugId) {
    const id = window._pendingDuplicateBugId;
    window._pendingDuplicateBugId = null;
    closeModal();
    if (!id) return;
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    const doc = documents[idx];
    recordBugStatusChange(doc, 'closed');
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.resolution = 'duplicate';
    doc.bugData.duplicateOf = originalBugId;
    doc.bugData.triagedAt = doc.bugData.triagedAt || Date.now();
    await persist();
    renderContent();
    toast('Marked as Duplicate', 'info');
};

window.reopenBug = async function(id) {
    const idx = documents.findIndex(d => d.id === id);
    if (idx === -1) return;
    document.getElementById('doc-menu')?.remove();
    const doc = documents[idx];
    recordBugStatusChange(doc, 'open');
    if (!doc.bugData) doc.bugData = {};
    doc.bugData.reopenCount = (doc.bugData.reopenCount || 0) + 1;
    doc.bugData.resolution = '';
    doc.bugData.duplicateOf = '';
    await persist();
    renderContent();
    toast('Bug reopened', 'info');
};

window.cancelEdit = function() {
    if (state._editorSnapshot !== undefined && _captureEditorFormState() !== state._editorSnapshot) {
        showModal(`
            <div class="p-2 text-center">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-4" style="color:#f59e0b;"></i>
                <h3 class="font-heading font-bold text-lg mb-2">Discard unsaved changes?</h3>
                <p class="text-sm mb-6" style="color:var(--tx-m);">You have unsaved edits. Leaving now will lose them.</p>
                <div class="flex gap-3 justify-center">
                    <button class="btn-s" data-onclick="closeModal()">Keep Editing</button>
                    <button class="btn-d" data-onclick="_forceCancelEdit()">Discard</button>
                </div>
            </div>
        `);
        return;
    }
    _forceCancelEdit();
};

window._forceCancelEdit = function() {
    closeModal();
    if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch(e) {} }
    window.tuiEditor = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state._editorSnapshot = undefined;
    pendingImageReplacements.clear();
    navigateBack();
};

// Filters the test-case picker in the Test Run editor (Sprint 15, 15-2) by
// title/module. Pure DOM show/hide — never re-renders the checkbox list —
// so in-progress selections that haven't been synced back into state yet
// are never lost while the user is typing a filter.
window._filterTestRunTcList = function(query) {
    const q = (query || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.testrun-tc-row').forEach(row => {
        const match = (row.getAttribute('data-filter-key') || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
    });
    const empty = document.getElementById('ed-run-tc-empty');
    if (empty) empty.classList.toggle('hidden', !(q && visible === 0));
};

window._updateTestRunTcCount = function() {
    const el = document.getElementById('ed-run-tc-count');
    if (!el) return;
    const checked = document.querySelectorAll('.testrun-tc-cb:checked').length;
    el.textContent = checked > 0 ? `${checked} selected` : '';
};

// Freezes the current step definitions of each target test case into a
// snapshot (US-103), so a run's recorded results stay aligned even if the
// test case is edited later. Shared by saveDoc's testrun branch and
// rerunTestRun (B2).
function _buildRunSnapshot(targetIds) {
    const snapshot = {};
    targetIds.forEach(id => {
        const tc = documents.find(d => d.id === id);
        if (tc && tc.tcData && Array.isArray(tc.tcData.steps)) {
            snapshot[id] = tc.tcData.steps.map(s => ({ action: s.action || '', expected: s.expected || '' }));
        }
    });
    return snapshot;
}

// Start a fresh execution of the same test cases (B2 "Test Cycle"). Creates a
// new Test Run document with the current step definitions (US-103 semantics —
// re-execution snapshots steps as they are NOW), empty results, and the same
// environment. All runs descending from the same original share a cycleId so
// the viewer can show a pass-rate trend across executions.
window.rerunTestRun = async function(runId) {
    const orig = documents.find(d => d.id === runId);
    if (!orig || orig.category !== 'testrun') return;
    const targetIds = orig.runData?.targetIds || [];
    if (!targetIds.length) { toast('This run has no test cases to re-execute.', 'warning'); return; }

    const cycleId = orig.runData.cycleId || orig.id;
    if (!orig.runData.cycleId) { orig.runData.cycleId = cycleId; orig.updatedAt = Date.now(); }

    const baseTitle = (orig.title || 'Test Run').replace(/\s*\(Run \d+\)\s*$/, '');
    const cycleRunCount = documents.filter(d => d.category === 'testrun' && d.status !== 'deleted'
        && (d.runData?.cycleId || d.id) === cycleId).length;

    const newRun = {
        id: uid(), title: `${baseTitle} (Run ${cycleRunCount + 1})`, category: 'testrun',
        subfolder: orig.subfolder || '', status: 'draft', content: '',
        tags: [...(orig.tags || [])], favorite: false,
        runData: { targetIds, results: {}, snapshot: _buildRunSnapshot(targetIds), environment: orig.runData?.environment || '', cycleId },
        createdAt: Date.now(), updatedAt: Date.now()
    };
    documents.unshift(newRun);
    await persist();
    toast('New execution started — same test cases, fresh results.', 'success');
    viewDoc(newRun.id);
};

// ========================
// RELEASE NOTES GENERATOR (Sprint 17, 17-2)
// ========================
// Builds a Markdown changelog from the release editor's currently-checked
// linked runs/bugs/environments and writes it into the Toast UI Editor.
// Reads the live form (not saved releaseData), so it reflects link changes
// the user hasn't saved yet — consistent with how saveDoc() itself reads
// these same checkboxes.
window.generateReleaseNotes = function() {
    const hasLinks = document.querySelectorAll('.ed-rel-run:checked, .ed-rel-bug:checked, .ed-rel-env:checked').length > 0;
    if (!hasLinks) {
        toast('Link some test runs, bugs, or environments first.', 'warning');
        return;
    }
    // Checked AFTER hasLinks: a brand-new release doc's content is never truly
    // blank (it starts from the "# New Document..." placeholder), so checking
    // this first would show "Replace existing notes?" even when nothing has
    // been linked yet to generate from.
    const currentMd = getEditorMarkdown();
    if (currentMd.trim()) {
        showModal(`
            <div class="text-center">
                <i class="fa-solid fa-triangle-exclamation text-2xl mb-3" style="color:#f59e0b;"></i>
                <h3 class="font-heading font-bold text-lg mb-2">Replace existing notes?</h3>
                <p class="text-sm mb-5" style="color:var(--tx-m);">This will overwrite the current Release Notes content.</p>
                <div class="flex gap-3 justify-center">
                    <button class="btn-s" data-onclick="closeModal()">Cancel</button>
                    <button class="btn-d" data-onclick="closeModal();_doGenerateReleaseNotes()">Replace</button>
                </div>
            </div>`);
        return;
    }
    _doGenerateReleaseNotes();
};

window._doGenerateReleaseNotes = function() {
    const version = document.getElementById('ed-rel-version')?.value.trim() || 'Unreleased';
    const releaseDate = document.getElementById('ed-rel-date')?.value || '';
    const runs = Array.from(document.querySelectorAll('.ed-rel-run:checked')).map(cb => documents.find(d => d.id === cb.value)).filter(Boolean);
    const bugs = Array.from(document.querySelectorAll('.ed-rel-bug:checked')).map(cb => documents.find(d => d.id === cb.value)).filter(Boolean);
    const envs = Array.from(document.querySelectorAll('.ed-rel-env:checked')).map(cb => documents.find(d => d.id === cb.value)).filter(Boolean);

    if (!runs.length && !bugs.length && !envs.length) {
        toast('Link some test runs, bugs, or environments first.', 'warning');
        return;
    }

    let md = `# Release ${version}\n`;
    if (releaseDate) md += `**Date:** ${releaseDate}\n`;

    if (bugs.length) {
        md += `\n## Fixed\n`;
        bugs.forEach(b => {
            const ref = bugRef(b);
            md += `- ${ref ? ref + ' — ' : ''}${escHtml(b.title)}${b.bugData?.severity ? ` (${escHtml(b.bugData.severity)})` : ''}\n`;
        });
    }

    if (runs.length) {
        md += `\n## Tested\n`;
        runs.forEach(r => {
            const results = r.runData?.results || {};
            const targetIds = r.runData?.targetIds || [];
            let total = 0, pass = 0;
            targetIds.forEach(tcId => {
                const steps = r.runData?.snapshot?.[tcId] || [];
                total += steps.length;
                steps.forEach((_, i) => { if (results[tcId]?.[i] === 'pass') pass++; });
            });
            const pct = total ? Math.round(pass / total * 100) : null;
            md += `- ${escHtml(r.title)}${pct !== null ? ` (${pct}% pass)` : ' (no results recorded)'}\n`;
        });
    }

    if (envs.length) {
        md += `\n## Environments\n`;
        envs.forEach(e => { md += `- ${escHtml(e.title)}${e.envData?.status ? ` — ${escHtml(e.envData.status)}` : ''}\n`; });
    }

    setEditorMarkdown(md);
    toast('Release notes generated — review before saving.', 'success');
};

// Next sequential bug number for a human-readable BUG-### reference (US-202).
function _nextBugNumber() {
    let max = 0;
    documents.forEach(d => {
        if (d.category === 'bug' && typeof d.bugNumber === 'number' && d.bugNumber > max) max = d.bugNumber;
    });
    return max + 1;
}

async function saveDoc() {
    const title = document.getElementById('ed-title')?.value.trim();
    const subfolder = document.getElementById('ed-subfolder')?.value.trim() || '';
    const cat = document.getElementById('ed-cat')?.value;
    const status = document.getElementById('ed-status')?.value;

    let content = getEditorMarkdown();
    let finalContent = content;
    let bugData = null;
    let tcData = null;
    let apiData = null;
    let runData = null;
    let envData = null;
    let releaseData = null;
    let tcPlanData = null;

    if (cat === 'bug') {
        const env = document.getElementById('ed-bug-env')?.value || '';
        const browser = document.getElementById('ed-bug-browser')?.value || '';
        const severity = document.getElementById('ed-bug-severity')?.value || 'Minor';
        const precond = document.getElementById('ed-bug-precond')?.value || '';
        const stepInputs = document.querySelectorAll('.bug-step-input');
        const steps = Array.from(stepInputs).map(inp => inp.value.trim()).filter(v => v);
        const assignee = document.getElementById('ed-bug-assignee')?.value || '';
        const priority = document.getElementById('ed-bug-priority')?.value || 'P3';
        const classification = document.getElementById('ed-bug-classification')?.value || 'unclassified';
        const slaHours = Number(document.getElementById('ed-bug-sla')?.value) || ({ Critical: 4, Major: 24, Minor: 72, Trivial: 168 }[severity] || 72);
        const linkedTc = document.getElementById('ed-bug-linked-tc')?.value || '';
        const expected = document.getElementById('ed-bug-expected')?.value || '';
        const actual = document.getElementById('ed-bug-actual')?.value || '';
        // For a new bug prefilled from a failed test step (B1), the link fields live
        // on state._newBugData; for an edit they live on the existing doc.
        const existing = state.editingDoc?.bugData || state._newBugData || {};
        const triagedAt = existing.resolution
            ? (existing.triagedAt || Date.now())
            : (classification !== 'unclassified' && assignee.trim()
                ? (existing.triagedAt || Date.now()) : null);

        bugData = { env, browser, severity, priority, assignee, classification, slaHours, triagedAt, precond, steps, expected, actual, linkedTc,
            resolution: existing.resolution || '',
            duplicateOf: existing.duplicateOf || '',
            reopenCount: existing.reopenCount || 0,
            foundInRun: existing.foundInRun, foundInTc: existing.foundInTc, foundInStep: existing.foundInStep };

        finalContent = `# ${title}

## ${t('bugEnv')}
- **Environment:** ${env || '-'}
- **Device/Browser:** ${browser || '-'}
- **Severity:** ${severity}

${precond ? `## ${t('bugPrecond')}\n${precond}\n` : ''}
## ${t('bugSteps')}\n${steps.length ? steps.map((s, i) => (i + 1) + '. ' + s).join('\n') : '-'}

## ${t('bugExpected')}
${expected || '-'}

## ${t('bugActual')}
${actual || '-'}`;
    } else if (cat === 'testcases') {
        const module = document.getElementById('ed-tc-module')?.value || '';
        const precond = document.getElementById('ed-tc-precond')?.value || '';
        const testData = document.getElementById('ed-tc-data')?.value || '';
        const stepRows = document.querySelectorAll('.tc-step-row');
        const steps = Array.from(stepRows).map(row => ({
            action: row.querySelector('.tc-step-action')?.value.trim() || '',
            expected: row.querySelector('.tc-step-expected')?.value.trim() || ''
        })).filter(s => s.action || s.expected);

        tcData = { module, precond, data: testData, steps };

        finalContent = `# ${title}

${module ? `**Module:** ${module}` : ''}

${precond ? `## ${t('tcPrecond')}\n${precond}\n` : ''}
${testData ? `## ${t('tcData')}\n${testData}\n` : ''}

## ${t('tcSteps')}
| Step | ${t('tcAction')} | ${t('tcExpected')} |
|---|---|---|
${steps.length ? steps.map((s, i) => `| ${i+1} | ${mdCell(s.action)} | ${mdCell(s.expected)} |`).join('\n') : '| - | - | - |'}
`;
    } else if (cat === 'api') {
        const method = document.getElementById('ed-api-method')?.value || 'GET';
        const endpoint = document.getElementById('ed-api-endpoint')?.value || '';
        const module = document.getElementById('ed-api-module')?.value.trim() || '';
        const changeImpact = document.getElementById('ed-api-impact')?.value || 'none';

        const hRows = document.querySelectorAll('.api-header-row');
        const headers = Array.from(hRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);

        const pRows = document.querySelectorAll('.api-param-row');
        const params = Array.from(pRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);

        const body = document.getElementById('ed-api-body')?.value || '';
        const statusCode = document.getElementById('ed-api-status')?.value || '200';
        const response = document.getElementById('ed-api-response')?.value || '';

        const previousApi = state.editingDoc?.apiData || {};
        const changeFingerprint = JSON.stringify({ method, endpoint, module, headers, params, body, statusCode, response });
        const previousFingerprint = previousApi.changeFingerprint || JSON.stringify({
            method: previousApi.method || 'GET', endpoint: previousApi.endpoint || '', module: previousApi.module || '',
            headers: previousApi.headers || [], params: previousApi.params || [], body: previousApi.body || '',
            statusCode: previousApi.statusCode || '200', response: previousApi.response || ''
        });
        const markChanged = document.getElementById('ed-api-mark-changed')?.checked || false;
        const tracked = ['low', 'medium', 'high'].includes(changeImpact);
        const changedAt = tracked
            ? (markChanged || !previousApi.changedAt || previousApi.changeImpact !== changeImpact || previousFingerprint !== changeFingerprint ? Date.now() : previousApi.changedAt)
            : null;

        apiData = { method, endpoint, module, changeImpact, changedAt, changeFingerprint, headers, params, body, statusCode, response };

        finalContent = `# ${title}

**Method:** \`${method}\` | **Endpoint:** \`${endpoint}\`

${headers.length ? `## ${t('apiHeaders')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${headers.map(h => `| ${mdCell(h.key) || '-'} | ${mdCell(h.value) || '-'} | ${h.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${params.length ? `## ${t('apiParams')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${params.map(p => `| ${mdCell(p.key) || '-'} | ${mdCell(p.value) || '-'} | ${p.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${body ? `## ${t('apiBody')}\n\`\`\`json\n${body}\n\`\`\`\n` : ''}
${response ? `## ${t('apiResponse')} (${statusCode})\n\`\`\`json\n${response}\n\`\`\`\n` : ''}`;
    } else if (cat === 'testrun') {
        const checkboxes = document.querySelectorAll('.testrun-tc-cb:checked');
        const targetIds = Array.from(checkboxes).map(cb => cb.value);
        const environment = document.getElementById('ed-run-env')?.value.trim() || '';
        const existingResults = (state.editingDoc && state.editingDoc.runData && state.editingDoc.runData.results) ? state.editingDoc.runData.results : {};
        // Re-saving the run refreshes the snapshot to the test cases' current steps.
        const snapshot = _buildRunSnapshot(targetIds);
        // Preserve cycle membership (B2) across edits of an existing run.
        const cycleId = state.editingDoc?.runData?.cycleId;
        runData = { targetIds, results: existingResults, snapshot, environment, cycleId };
    } else if (cat === 'testplan') {
        const linkedTCs = Array.from(document.querySelectorAll('.tp-tc-cb:checked')).map(cb => cb.value);
        const linkedRuns = Array.from(document.querySelectorAll('.tp-run-cb:checked')).map(cb => cb.value);
        tcPlanData = { linkedTCs, linkedRuns };
    } else if (cat === 'release') {
        const version = document.getElementById('ed-rel-version')?.value || '';
        const releaseDate = document.getElementById('ed-rel-date')?.value || '';
        const relStatus = document.getElementById('ed-rel-status')?.value || 'planning';
        const linkedRuns = Array.from(document.querySelectorAll('.ed-rel-run:checked')).map(cb => cb.value);
        const linkedBugs = Array.from(document.querySelectorAll('.ed-rel-bug:checked')).map(cb => cb.value);
        const linkedEnvs = Array.from(document.querySelectorAll('.ed-rel-env:checked')).map(cb => cb.value);
        const readinessPolicy = normalizeReleasePolicy({
            minPassRate: document.getElementById('ed-rel-min-pass')?.value,
            blockCritical: document.getElementById('ed-rel-block-critical')?.checked,
            blockMajor: document.getElementById('ed-rel-block-major')?.checked,
            requireCompleteExecution: document.getElementById('ed-rel-complete-execution')?.checked,
            requireHealthyEnvironments: document.getElementById('ed-rel-healthy-env')?.checked
        });
        const manualDecision = document.getElementById('ed-rel-decision')?.value || 'auto';
        const decisionReason = (document.getElementById('ed-rel-decision-reason')?.value || '').trim().slice(0, 500);
        if (manualDecision !== 'auto' && !decisionReason) {
            toast('Add a reason before overriding the automatic release decision.', 'warning');
            document.getElementById('ed-rel-decision-reason')?.focus();
            return;
        }
        const savedDecisionReason = manualDecision === 'auto' ? '' : decisionReason;
        const previousData = state.editingDoc?.releaseData || {};
        const decisionLog = Array.isArray(previousData.decisionLog) ? previousData.decisionLog.slice(0, 49) : [];
        const decisionChanged = manualDecision !== (previousData.manualDecision || 'auto')
            || savedDecisionReason !== (previousData.decisionReason || '');
        if (decisionChanged) {
            decisionLog.unshift({
                id: uid(), decision: manualDecision,
                reason: savedDecisionReason || 'Returned to automatic policy', ts: Date.now()
            });
        }
        const releaseDraft = { version, releaseDate, status: relStatus, linkedRuns, linkedBugs, linkedEnvs, readinessPolicy, manualDecision, decisionReason: savedDecisionReason, decisionLog };
        let qualitySnapshot = previousData.qualitySnapshot || null;
        if (relStatus === 'released' && !qualitySnapshot) {
            const measured = calculateReleaseQuality({ ...(state.editingDoc || {}), releaseData: releaseDraft }, documents);
            qualitySnapshot = {
                score: measured.score, passRate: measured.passRate, execution: measured.execution,
                coverage: measured.coverage, defectPoints: measured.defectPoints, openBugs: measured.openBugs,
                hasEvidence: measured.hasEvidence, targetedCases: measured.targetedCases, totalCases: measured.totalCases,
                unmappedBugs: measured.unmappedBugs, modules: measured.modules, capturedAt: Date.now()
            };
        }
        releaseData = { ...releaseDraft, qualitySnapshot };
    } else if (cat === 'environment') {
        const envStatus = document.getElementById('ed-env-status')?.value || 'healthy';
        const propRows = document.querySelectorAll('.env-prop-row');
        const properties = Array.from(propRows).map(row => ({
            label: row.querySelector('.env-prop-label')?.value.trim() || '',
            value: row.querySelector('.env-prop-value')?.value.trim() || '',
            secret: row.querySelector('.env-prop-secret')?.checked || false
        })).filter(p => p.label || p.value);
        const linkedCreds = Array.from(document.querySelectorAll('.ed-env-cred:checked')).map(cb => cb.value);
        const notes = document.getElementById('ed-env-notes')?.value || '';

        envData = { status: envStatus, properties, linkedCreds, notes };
        finalContent = `# Environment Notes\n${notes}`;
    }

    const tags = [...state.editorTags];
    const username = document.getElementById('ed-username')?.value || '';
    const password = document.getElementById('ed-password')?.value || '';
    const rotatedAt = document.getElementById('ed-cred-rotated')?.value || '';

    if (!title) { toast(t('titleRequired'), 'error'); document.getElementById('ed-title')?.focus(); return; }

    const editingIdx = (state.editingDoc && state.editingDoc.id)
        ? documents.findIndex(d => d.id === state.editingDoc.id)
        : -1;

    if (editingIdx !== -1) {
        const idx = editingIdx;
        DocHistory.save(documents[idx]);
        documents[idx] = { ...documents[idx], title, category: cat, subfolder, status, content: finalContent, tags, username, password, rotatedAt, bugData: bugData !== null ? bugData : documents[idx].bugData, tcData: tcData !== null ? tcData : documents[idx].tcData, apiData: apiData !== null ? apiData : documents[idx].apiData, runData: runData !== null ? runData : documents[idx].runData, envData: envData !== null ? envData : documents[idx].envData, releaseData: releaseData !== null ? releaseData : documents[idx].releaseData, tcPlanData: tcPlanData !== null ? tcPlanData : documents[idx].tcPlanData, updatedAt: Date.now() };
        ActivityLog.record('updated', documents[idx]);
        toast(t('docUpdated'), 'success');
        state.editingDoc = { ...documents[idx] };
        state.view = 'viewer';
    } else if (state.editingDoc && state.editingDoc.id) {
        // The document being edited vanished (deleted on another device / concurrent
        // sync). Save the edits as a fresh document instead of dereferencing
        // documents[-1] (which previously produced a broken "?view=undefined" viewer).
        const revivedAt = Date.now();
        const revivedBugStatus = cat === 'bug' ? normalizeBugStatusValue(state.editingDoc.bugStatus) : undefined;
        const revived = { id: uid(), title, category: cat, subfolder, status, content: finalContent, tags, username, password, rotatedAt, bugData, tcData, apiData, runData, envData, releaseData, tcPlanData, kanbanStatus: cat === 'task' ? (state.editingDoc.kanbanStatus || 'todo') : undefined, bugStatus: revivedBugStatus, bugStatusEvents: cat === 'bug' ? [{ type: 'status_changed', from: null, to: revivedBugStatus, ts: revivedAt }] : undefined, bugNumber: cat === 'bug' ? (state.editingDoc.bugNumber || _nextBugNumber()) : undefined, favorite: false, createdAt: revivedAt, updatedAt: revivedAt };
        documents.unshift(revived);
        toast('Original document was removed elsewhere — saved as a new copy.', 'info');
        state.editingDoc = { ...revived };
        state.view = 'viewer';
        state.category = cat;
    } else {
        const createdAt = Date.now();
        const newDoc = { id: uid(), title, category: cat, subfolder, status, content: finalContent, tags, username, password, rotatedAt, bugData, tcData, apiData, runData, envData, releaseData, tcPlanData, kanbanStatus: cat === 'task' ? 'todo' : undefined, bugStatus: cat === 'bug' ? 'new' : undefined, bugStatusEvents: cat === 'bug' ? [{ type: 'status_changed', from: null, to: 'new', ts: createdAt }] : undefined, bugNumber: cat === 'bug' ? _nextBugNumber() : undefined, favorite: false, createdAt, updatedAt: createdAt };
        documents.unshift(newDoc);
        ActivityLog.record('created', newDoc);
        toast(t('docCreated'), 'success');
        state.editingDoc = { ...newDoc };
        state.view = 'viewer';
        state.category = cat;
    }
    if (window.tuiEditor) { try { window.tuiEditor.destroy(); } catch(e) {} }
    if (window.tuiViewer) { try { window.tuiViewer.destroy(); } catch(e) {} window.tuiViewer = null; }
    window.currentViewerDocId = null;
    window.tuiEditor = null;
    state._editorSnapshot = undefined;
    history.replaceState({}, '', _appUrl(state.editingDoc.id));
    await persist();
    await new Promise(r => setTimeout(() => requestAnimationFrame(r), 60));
    render();
}

async function toggleFav(id) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.favorite = !doc.favorite;
        await persist();
        render();
    }
}

// Credential rotation reminder quick action (Sprint 18, 18-2).
window.markCredentialRotated = async function(id) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === id && d.category === 'credential');
    if (!doc) return;
    doc.rotatedAt = new Date().toISOString().slice(0, 10);
    doc.updatedAt = Date.now();
    if (state.editingDoc?.id === id) state.editingDoc = { ...doc };
    await persist();
    render();
    toast('Marked as rotated today.', 'success');
};

async function duplicateDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    // Deep-clone so nested objects (runData, bugData, tcData, apiData, envData,
    // releaseData, tcPlanData) are NOT shared by reference with the original.
    // A shallow spread left them shared, so editing the copy — e.g. recording
    // test-run results — mutated the source document too (US-402).
    const dup = (typeof structuredClone === 'function') ? structuredClone(doc) : JSON.parse(JSON.stringify(doc));
    dup.id = uid();
    dup.title = doc.title + ' (Copy)';
    dup.favorite = false;
    dup.createdAt = Date.now();
    dup.updatedAt = Date.now();
    // A duplicated bug is a distinct report — give it its own BUG-### (US-202),
    // otherwise the copy would collide with the original's number.
    if (dup.category === 'bug') {
        dup.bugNumber = _nextBugNumber();
        dup.bugStatus = normalizeBugStatusValue(dup.bugStatus);
        dup.bugStatusEvents = [{
            type: 'status_changed',
            from: null,
            to: dup.bugStatus,
            ts: dup.createdAt
        }];
    }
    documents.unshift(dup);
    ActivityLog.record('created', dup, { note: 'duplicated' });
    await persist();
    toast(t('docDuplicated'), 'success');
    render();
}
