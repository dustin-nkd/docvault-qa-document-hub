// ========================
// RENDER EDITOR
// ========================
function renderEditor() {
    const doc = state.editingDoc;
    const isEdit = !!doc;
    const title = isEdit ? doc.title : (state._newTitle || '');
    const category = isEdit ? doc.category : (state._newCat || 'runbook');
    const status = isEdit ? doc.status : (state._newStatus || 'draft');
    const content = isEdit ? doc.content : (state._newContent || '');
    const tags = isEdit ? doc.tags : state.editorTags;
    const bugData = isEdit ? doc.bugData : state._newBugData;
    const tcData = isEdit ? doc.tcData : state._newTcData;
    const apiData = isEdit ? doc.apiData : state._newApiData;
    const runData = isEdit ? doc.runData : state._newRunData;
    const envData = isEdit ? doc.envData : state._newEnvData;
    const releaseData = isEdit ? doc.releaseData : state._newReleaseData;
    const releasePolicy = normalizeReleasePolicy(releaseData?.readinessPolicy);
    const tcPlanData = isEdit ? doc.tcPlanData : state._newTcPlanData;
    const bugDefaultSla = { Critical: 4, Major: 24, Minor: 72, Trivial: 168 }[bugData?.severity || 'Minor'] || 72;

    const subfolder = isEdit ? (doc.subfolder || '') : (state._newSubfolder || '');
    const existingFolders = [...new Set(documents.filter(d => d.subfolder).map(d => d.subfolder))];

    return `<div class="fade-up max-w-4xl mx-auto">

        <div class="grid md:grid-cols-3 gap-4 mb-4">
            <div class="md:col-span-2 grid sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${category === 'credential' ? 'Service Name' : 'Title'}</label>
                    <input id="ed-title" class="form-input" placeholder="${category === 'credential' ? t('egCred') : t('enterTitle')}" value="${escHtml(title)}">
                </div>
                <div class="relative">
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Sub-folder <span style="color:var(--tx-d)">(Optional)</span></label>
                    <div class="subfolder-select-wrapper" style="position:relative;">
                        <input id="ed-subfolder" class="form-select w-full" placeholder="e.g. ProjectA/Backend" value="${escHtml(subfolder)}" autocomplete="off" data-onclick="toggleSubfolderDropdown()" data-oninput="filterSubfolderDropdown()">
                        <div id="subfolder-dropdown" class="hidden" style="position:absolute;top:100%;left:0;right:0;z-index:50;margin-top:4px;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;max-height:180px;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.4);">
                            ${existingFolders.map(f => `<div class="subfolder-option px-3 py-2 text-sm cursor-pointer ui-hover-card-h" style="color:var(--tx-m);transition:background .15s;" data-onclick="${actionAttr('selectSubfolder', f)}">${escHtml(f)}</div>`).join('')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('category')}</label>
                    ${renderSelect('ed-cat', Object.entries(CAT_META).map(([k, m]) => ({value: k, label: m.label})), category, 'w-full', 'changeEditorCat(this.value)')}
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('status')}</label>
                    ${renderSelect('ed-status', [
                        {value: 'draft', label: t('statusDraft')},
                        {value: 'published', label: t('statusPublished')},
                        {value: 'archived', label: t('statusArchived')}
                    ], status, 'w-full')}
                </div>
            </div>
        </div>

        <!-- Tags -->
        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tags')}</label>
            <div class="flex flex-wrap items-center gap-2 p-2.5 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);min-height:42px;" id="tag-container" data-onclick="document.getElementById('tag-input').focus()">
                ${tags.map((t, i) => `<span class="tag">${escHtml(t)}<span class="rm" data-onclick="event.stopPropagation();removeTag(${i})">&times;</span></span>`).join('')}
                <input id="tag-input" class="bg-transparent border-none outline-none text-sm flex-1 min-w-[100px]" style="color:var(--tx);" placeholder="${tags.length === 0 ? t('enterTag') : ''}" data-onkeydown="handleTagInput(event)">
            </div>
        </div>

        ${renderEditorCategory({
            doc, isEdit, category, content, bugData, tcData, apiData,
            runData, envData, releaseData, releasePolicy, tcPlanData, bugDefaultSla
        })}
        <div class="flex items-center gap-3 mt-5">
            <button class="btn-s" data-onclick="cancelEdit()">${t('cancel')}</button>
            <button class="btn-p ml-auto" data-onclick="saveDoc()">${t('save')}</button>
        </div>
    </div>`;
}

// ========================
// TAG INPUT
// ========================
function handleTagInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const inp = e.target;
        const val = inp.value.trim().toLowerCase().replace(/[^a-z0-9À-ɏḀ-ỿ_-]/g, '');
        if (val && !state.editorTags.includes(val)) {
            state.editorTags.push(val);
            inp.value = '';
            renderContent();
            setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
        }
    } else if (e.key === 'Backspace' && !e.target.value && state.editorTags.length > 0) {
        state.editorTags.pop();
        renderContent();
        setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
    }
}

function removeTag(i) {
    state.editorTags.splice(i, 1);
    renderContent();
    setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
}

// ========================
// CHANGE EDITOR CATEGORY
// ========================
window.changeEditorCat = function(cat) {
    if (state.editingDoc) {
        state.editingDoc.category = cat;
        state.editingDoc.title = document.getElementById('ed-title')?.value || '';
        state.editingDoc.subfolder = document.getElementById('ed-subfolder')?.value || '';
        if (cat === 'bug' && !state.editingDoc.bugData) state.editingDoc.bugData = {};
        if (cat === 'testcases' && !state.editingDoc.tcData) state.editingDoc.tcData = {};
        if (cat === 'api' && !state.editingDoc.apiData) state.editingDoc.apiData = {};
    } else {
        state._newCat = cat;
        state._newTitle = document.getElementById('ed-title')?.value || '';
        state._newSubfolder = document.getElementById('ed-subfolder')?.value || '';
        if (cat === 'testcases' && !state._newTcData) state._newTcData = {};
        if (cat === 'api' && !state._newApiData) state._newApiData = {};
    }
    render();
    setTimeout(() => {
        const titleInput = document.getElementById('ed-title');
        if (titleInput) {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        }
    }, 0);
};

// ========================
// CUSTOM SELECT (renderSelect)
// ========================
window.renderSelect = function(id, options, selectedValue, customClass, onChangeCode) {
    customClass = customClass || '';
    onChangeCode = onChangeCode || '';
    const selOpt = options.find(o => o.value === selectedValue) || options[0] || {label:'', value:''};
    const optionsHtml = options.map(o => `
        <div class="subfolder-option px-3 py-2 text-sm cursor-pointer ui-hover-card-h" style="color:var(--tx-m);transition:background .15s;" data-onclick="${actionAttr('selectCustomOption', id, o.value, o.label, onChangeCode)}">${escHtml(o.label)}</div>
    `).join('');

    return `
        <div class="custom-select-wrapper" style="position:relative;">
            <input type="hidden" id="${id}" value="${escHtml(selOpt.value)}">
            <input id="${id}-display" class="form-select ${customClass}" readonly style="cursor:pointer;" value="${escHtml(selOpt.label)}" data-onclick="toggleCustomSelect('${id}')">
            <div id="${id}-dropdown" class="hidden custom-select-list" style="position:absolute;top:100%;left:0;right:0;z-index:50;margin-top:4px;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;max-height:180px;overflow-y:auto;box-shadow:0 8px 30px rgba(0,0,0,0.4);">
                ${optionsHtml}
            </div>
        </div>
    `;
};

window.toggleCustomSelect = function(id) {
    document.querySelectorAll('.custom-select-list').forEach(el => {
        if (el.id !== id + '-dropdown') el.classList.add('hidden');
    });

    const dd = document.getElementById(id + '-dropdown');
    if (!dd) return;

    if (!dd.classList.contains('hidden')) {
        dd.classList.add('hidden');
        return;
    }

    dd.classList.remove('hidden');

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!e.target.closest('#' + id + '-display')) {
                dd.classList.add('hidden');
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
};

window.selectCustomOption = function(id, val, label, onChangeCode) {
    const hid = document.getElementById(id);
    const disp = document.getElementById(id + '-display');
    const dd = document.getElementById(id + '-dropdown');
    if (hid) hid.value = val;
    if (disp) disp.value = label;
    if (dd) dd.classList.add('hidden');

    if (onChangeCode) {
        // Safe dispatch instead of eval(): parse "fnName(args)" and invoke it.
        // `this.value` resolves to the selected value, which is passed as a real
        // argument (never string-interpolated into code), so a value containing
        // quotes or commas cannot inject anything (US-403).
        const m = onChangeCode.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
        if (m && typeof window[m[1]] === 'function') {
            const args = m[2].trim() === '' ? [] : m[2].split(',').map(s => {
                s = s.trim();
                if (s === 'this.value') return val;
                if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
                if (!isNaN(s)) return Number(s);
                return s;
            });
            window[m[1]](...args);
        }
    }
};

// ========================
// SUBFOLDER DROPDOWN HELPERS
// ========================
window.toggleSubfolderDropdown = function() {
    const dd = document.getElementById('subfolder-dropdown');
    if (!dd) return;

    if (!dd.classList.contains('hidden')) {
        dd.classList.add('hidden');
        return;
    }

    dd.classList.remove('hidden');
    dd.querySelectorAll('.subfolder-option').forEach(opt => { opt.style.display = ''; });

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!e.target.closest('.subfolder-select-wrapper')) {
                dd.classList.add('hidden');
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 10);
};

window.filterSubfolderDropdown = function() {
    const input = document.getElementById('ed-subfolder');
    const dd = document.getElementById('subfolder-dropdown');
    if (!input || !dd) return;
    const val = input.value.toLowerCase();
    let hasVisible = false;
    dd.querySelectorAll('.subfolder-option').forEach(opt => {
        const matches = opt.textContent.toLowerCase().includes(val);
        opt.style.display = matches ? '' : 'none';
        if (matches) hasVisible = true;
    });
    dd.classList.toggle('hidden', !hasVisible);
};

window.selectSubfolder = function(value) {
    const input = document.getElementById('ed-subfolder');
    if (input) input.value = value;
    const dd = document.getElementById('subfolder-dropdown');
    if (dd) dd.classList.add('hidden');
};

// ========================
// FORMAT JSON
// ========================
window.formatJson = function(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return;
    try {
        const obj = JSON.parse(el.value);
        el.value = JSON.stringify(obj, null, 2);
    } catch (e) {
        toast(t('invalidJson'), 'error');
    }
};

// ========================
// CUSTOM DATE PICKER
// ========================
let _dpYear = 0, _dpMonth = 0, _dpSel = null;

const _DP_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function _dpBuildGrid() {
    const panel = document.getElementById('dp-panel');
    if (!panel) return;

    const firstDay = new Date(_dpYear, _dpMonth, 1).getDay();
    const daysInMonth = new Date(_dpYear, _dpMonth + 1, 0).getDate();
    const daysInPrev = new Date(_dpYear, _dpMonth, 0).getDate();
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    const now = new Date();
    const todayY = now.getFullYear(), todayM = now.getMonth(), todayD = now.getDate();

    const prevY = _dpMonth === 0 ? _dpYear - 1 : _dpYear;
    const prevM = _dpMonth === 0 ? 11 : _dpMonth - 1;
    const nextY = _dpMonth === 11 ? _dpYear + 1 : _dpYear;
    const nextM = _dpMonth === 11 ? 0 : _dpMonth + 1;

    let cells = '';
    for (let i = firstDay - 1; i >= 0; i--) {
        const d = daysInPrev - i;
        cells += `<div class="dp-cell dp-other" data-onclick="dpSelect(${prevY},${prevM},${d})">${d}</div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = _dpYear === todayY && _dpMonth === todayM && d === todayD;
        const isSel = _dpSel && _dpSel.y === _dpYear && _dpSel.m === _dpMonth && _dpSel.d === d;
        const cls = (isToday && !isSel ? ' dp-today' : '') + (isSel ? ' dp-selected' : '');
        cells += `<div class="dp-cell${cls}" data-onclick="dpSelect(${_dpYear},${_dpMonth},${d})">${d}</div>`;
    }
    let nd = 1;
    for (let i = firstDay + daysInMonth; i < totalCells; i++) {
        cells += `<div class="dp-cell dp-other" data-onclick="dpSelect(${nextY},${nextM},${nd})">${nd}</div>`;
        nd++;
    }

    panel.innerHTML = `
        <div class="dp-hd">
            <button class="dp-nav-btn" data-onclick="dpPrev()"><i class="fa-solid fa-chevron-left" style="font-size:9px;"></i></button>
            <div class="dp-month-lbl">${_DP_MONTHS[_dpMonth]} ${_dpYear}</div>
            <button class="dp-nav-btn" data-onclick="dpNext()"><i class="fa-solid fa-chevron-right" style="font-size:9px;"></i></button>
        </div>
        <div class="dp-dow-row"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
        <div class="dp-grid">${cells}</div>
        <div class="dp-foot">
            <button class="dp-foot-btn dp-clear" data-onclick="dpClear()">Clear</button>
            <button class="dp-foot-btn dp-today-btn" data-onclick="dpToday()">Today</button>
        </div>
    `;
}

window.dpToggle = function() {
    const panel = document.getElementById('dp-panel');
    if (!panel) return;
    if (!panel.classList.contains('hidden')) { panel.classList.add('hidden'); return; }

    const val = document.getElementById('ed-rel-date')?.value;
    if (val) {
        const d = new Date(val + 'T12:00:00');
        _dpYear = d.getFullYear(); _dpMonth = d.getMonth();
        _dpSel = { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() };
    } else {
        const n = new Date();
        _dpYear = n.getFullYear(); _dpMonth = n.getMonth();
        _dpSel = null;
    }
    _dpBuildGrid();
    panel.classList.remove('hidden');
};

window.dpPrev = function() {
    _dpMonth--; if (_dpMonth < 0) { _dpMonth = 11; _dpYear--; }
    _dpBuildGrid();
};

window.dpNext = function() {
    _dpMonth++; if (_dpMonth > 11) { _dpMonth = 0; _dpYear++; }
    _dpBuildGrid();
};

window.dpSelect = function(y, m, d) {
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(d).padStart(2, '0');
    const hidden = document.getElementById('ed-rel-date');
    if (hidden) hidden.value = `${y}-${mm}-${dd}`;

    const trigger = document.querySelector('#dp-wrap .dp-trigger');
    if (trigger) {
        trigger.innerHTML = `<span class="dp-value">${mm}/${dd}/${y}</span><i class="fa-regular fa-calendar dp-icon"></i>`;
    }

    document.getElementById('dp-panel')?.classList.add('hidden');
};

window.dpToday = function() {
    const n = new Date();
    dpSelect(n.getFullYear(), n.getMonth(), n.getDate());
};

window.dpClear = function() {
    const hidden = document.getElementById('ed-rel-date');
    if (hidden) hidden.value = '';
    const trigger = document.querySelector('#dp-wrap .dp-trigger');
    if (trigger) {
        trigger.innerHTML = `<span class="dp-placeholder">mm/dd/yyyy</span><i class="fa-regular fa-calendar dp-icon"></i>`;
    }
    document.getElementById('dp-panel')?.classList.add('hidden');
};
