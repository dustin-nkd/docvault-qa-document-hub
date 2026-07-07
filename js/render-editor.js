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
    const tcPlanData = isEdit ? doc.tcPlanData : state._newTcPlanData;

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
                            ${existingFolders.map(f => `<div class="subfolder-option px-3 py-2 text-sm cursor-pointer" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card-h)'" data-onmouseleave="this.style.background='transparent'" data-onclick="selectSubfolder('${escHtml(f.replace(/'/g, "\\'"))}')">${escHtml(f)}</div>`).join('')}
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

        ${category === 'credential' ? `
        <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('usernameEmail')}</label>
                <input id="ed-username" class="form-input" placeholder="e.g. admin" value="${escHtml(doc?.username || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('passwordField')}</label>
                <div class="flex items-center gap-2">
                    <input type="password" id="ed-password" class="form-input" placeholder="••••••••" value="${escHtml(doc?.password || '')}">
                    <button id="ed-password-btn" class="btn-s px-3 py-2" data-onclick="togglePasswordVisibility('ed-password')"><i class="fa-solid fa-eye"></i></button>
                </div>
            </div>
        </div>
        ` : category === 'bug' ? `
        <div class="grid sm:grid-cols-3 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugEnv')}</label>
                <input id="ed-bug-env" class="form-input" placeholder="${t('bugEnvPl')}" value="${escHtml(bugData?.env || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugDevice')}</label>
                <input id="ed-bug-browser" class="form-input" placeholder="${t('bugDevicePl')}" value="${escHtml(bugData?.browser || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugSeverity')}</label>
                ${renderSelect('ed-bug-severity', [
                    {value: 'Critical', label: t('severityCritical')},
                    {value: 'Major', label: t('severityMajor')},
                    {value: 'Minor', label: t('severityMinor')},
                    {value: 'Trivial', label: t('severityTrivial')}
                ], bugData?.severity || 'Minor', 'w-full')}
            </div>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugAssignee')}</label>
                <input id="ed-bug-assignee" class="form-input" placeholder="${t('bugAssigneePl')}" value="${escHtml(bugData?.assignee || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Priority</label>
                ${renderSelect('ed-bug-priority', [
                    {value: 'P1', label: 'P1 — Urgent'},
                    {value: 'P2', label: 'P2 — High'},
                    {value: 'P3', label: 'P3 — Medium'},
                    {value: 'P4', label: 'P4 — Low'}
                ], bugData?.priority || 'P3', 'w-full')}
            </div>
        </div>

        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugPrecond')}</label>
            <textarea id="ed-bug-precond" class="form-input" style="height:60px;" placeholder="${t('bugPrecondPl')}">${escHtml(bugData?.precond || '')}</textarea>
        </div>

        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugSteps')}</label>
            <div id="bug-steps-container">
                ${(Array.isArray(bugData?.steps) ? bugData.steps : (bugData?.steps ? [bugData.steps] : [''])).map((step, idx) => `
                    <div class="flex items-center gap-2 mb-2 bug-step-row">
                        <span class="text-xs font-semibold step-idx" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
                        <input class="form-input flex-1 bug-step-input" placeholder="${t('stepPl', {idx: idx + 1})}" value="${escHtml(step)}">
                        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
            <button class="btn-s text-xs mt-1" data-onclick="addBugStep()"><i class="fa-solid fa-plus mr-1"></i> ${t('addStep')}</button>
        </div>

        <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugExpected')}</label>
                <textarea id="ed-bug-expected" class="form-input" style="height:100px;" placeholder="${t('bugExpectedPl')}">${escHtml(bugData?.expected || '')}</textarea>
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugActual')}</label>
                <textarea id="ed-bug-actual" class="form-input" style="height:100px;" placeholder="${t('bugActualPl')}">${escHtml(bugData?.actual || '')}</textarea>
            </div>
        </div>
        ` : category === 'testcases' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcModule')}</label>
                    <input id="ed-tc-module" class="form-input" placeholder="${t('tcModulePl')}" value="${escHtml(tcData?.module || '')}">
                </div>
                <div class="sm:col-span-2">
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcData')}</label>
                    <input id="ed-tc-data" class="form-input" placeholder="${t('tcDataPl')}" value="${escHtml(tcData?.data || '')}">
                </div>
            </div>

            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcPrecond')}</label>
                <textarea id="ed-tc-precond" class="form-input" style="height:60px;" placeholder="${t('tcPrecondPl')}">${escHtml(tcData?.precond || '')}</textarea>
            </div>

            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-xs font-medium block" style="color:var(--tx-m);">${t('tcSteps')}</label>
                    <div class="flex items-center gap-2" style="width: calc(100% - 30px);">
                        <span class="text-xs font-medium flex-1 text-center" style="color:var(--tx-d);">${t('tcAction')}</span>
                        <span class="text-xs font-medium flex-1 text-center" style="color:var(--tx-d);">${t('tcExpected')}</span>
                    </div>
                </div>
                <div id="tc-steps-container">
                    ${(tcData?.steps?.length ? tcData.steps : [{action: '', expected: ''}]).map((step, idx) => `
                        <div class="flex items-start gap-2 mb-2 tc-step-row">
                            <span class="text-xs font-semibold step-idx mt-2" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
                            <textarea class="form-input flex-1 tc-step-action" style="height:60px;" placeholder="${t('tcActionPl')}">${escHtml(step.action || '')}</textarea>
                            <textarea class="form-input flex-1 tc-step-expected" style="height:60px;" placeholder="${t('tcExpectedPl')}">${escHtml(step.expected || '')}</textarea>
                            <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-s text-sm mt-2" data-onclick="addTcStep()"><i class="fa-solid fa-plus mr-1"></i> ${t('addStep')}</button>
            </div>
        </div>
        ` : category === 'environment' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('healthStatus')}</label>
                    ${renderSelect('ed-env-status', [
                        {value: 'healthy', label: '🟢 Healthy (Up & Running)'},
                        {value: 'maintenance', label: '🟡 Maintenance'},
                        {value: 'down', label: '🔴 Down (Offline)'}
                    ], envData?.status || 'healthy', 'w-full text-sm')}
                </div>
            </div>
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-xs font-medium block" style="color:var(--tx-m);">${t('properties')}</label>
                </div>
                <div id="env-props-container">
                    ${((envData?.properties && envData.properties.length > 0) ? envData.properties : (envData?.frontendUrl || envData?.backendUrl || envData?.dbInfo) ?
                        [
                            ...(envData?.frontendUrl ? [{label: 'Frontend URL', value: envData.frontendUrl, secret: false}] : []),
                            ...(envData?.backendUrl ? [{label: 'Backend API URL', value: envData.backendUrl, secret: false}] : []),
                            ...(envData?.dbInfo ? [{label: 'Database Connection', value: envData.dbInfo, secret: true}] : [])
                        ] : [{label: '', value: '', secret: false}]
                    ).map((prop, idx) => `
                        <div class="flex items-center gap-2 mb-2 env-prop-row">
                            <input class="form-input env-prop-label text-sm" style="flex:0 0 35%;" placeholder="${t('envLabelPl')}" value="${escHtml(prop.label || '')}">
                            <input class="form-input env-prop-value flex-1 text-sm font-mono" placeholder="${t('envValuePl')}" value="${escHtml(prop.value || '')}">
                            <input type="checkbox" class="env-prop-secret hidden" ${prop.secret ? 'checked' : ''}>
                            <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:${prop.secret ? 'var(--acc)' : 'var(--tx-m)'};" title="${t('toggleSecret')}" data-onclick="toggleEnvSecret(this)">
                                <i class="fa-solid ${prop.secret ? 'fa-eye-slash' : 'fa-eye'}"></i>
                            </button>
                            <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:var(--tx-m);" data-onclick="removeEnvProp(this)"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-s text-sm mt-2" data-onclick="addEnvProp()"><i class="fa-solid fa-plus mr-1"></i> ${t('addProperty')}</button>
            </div>
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('linkedCreds')}</label>
                <div class="p-3 rounded-lg flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'credential' && d.status !== 'deleted').map(c => `
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="form-checkbox ed-env-cred" value="${c.id}" ${(envData?.linkedCreds || []).includes(c.id) ? 'checked' : ''}>
                            <span class="text-sm font-medium" style="color:var(--tx);">${escHtml(c.title)}</span>
                        </label>
                    `).join('') || `<div class="text-xs text-center py-2" style="color:var(--tx-d);">${t('noCredFound')}</div>`}
                </div>
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('notes')}</label>
                <textarea id="ed-env-notes" class="form-input text-sm w-full" style="height:80px;" placeholder="${t('envNotesPl')}">${escHtml(envData?.notes || '')}</textarea>
            </div>
        </div>
        ` : category === 'api' ? `
        <div class="rounded-xl mb-4 overflow-hidden" style="border:1px solid var(--brd);">

            <!-- Method + Endpoint unified bar -->
            <div class="flex items-stretch" style="background:var(--card);border-bottom:1px solid var(--brd);">
                <div style="width:120px;flex-shrink:0;border-right:1px solid var(--brd);">
                    ${renderSelect('ed-api-method', ['GET','POST','PUT','PATCH','DELETE'].map(m => ({value: m, label: m})), apiData?.method || 'GET', 'w-full font-mono font-bold text-sm')}
                </div>
                <input id="ed-api-endpoint" class="flex-1 bg-transparent border-0 outline-none font-mono text-sm px-4" style="color:var(--tx);min-width:0;" placeholder="/api/v1/users" value="${escHtml(apiData?.endpoint || '')}">
            </div>

            <div class="p-5">
                <!-- REQUEST section -->
                <div class="flex items-center gap-3 mb-4">
                    <span class="text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Request</span>
                    <div class="flex-1" style="height:1px;background:var(--brd);"></div>
                </div>

                <!-- Headers + Params side by side -->
                <div class="grid sm:grid-cols-2 gap-4 mb-4">
                    <div>
                        <p class="text-xs font-medium mb-2" style="color:var(--tx-m);">${t('apiHeaders')}</p>
                        <div id="api-headers-container">
                            ${(apiData?.headers?.length ? apiData.headers : []).map(h => `
                                <div class="flex items-center gap-1.5 mb-1.5 api-header-row">
                                    <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}" value="${escHtml(h.key)}">
                                    <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}" value="${escHtml(h.value)}">
                                    <div class="flex items-center gap-1 shrink-0">
                                        <input type="checkbox" class="form-checkbox api-req" title="${t('apiRequired')}" ${h.req ? 'checked' : ''}>
                                        <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)"><i class="fa-solid fa-xmark"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn-s text-xs mt-1" data-onclick="addApiHeader()"><i class="fa-solid fa-plus mr-1"></i> ${t('addHeader')}</button>
                    </div>
                    <div>
                        <p class="text-xs font-medium mb-2" style="color:var(--tx-m);">${t('apiParams')}</p>
                        <div id="api-params-container">
                            ${(apiData?.params?.length ? apiData.params : []).map(p => `
                                <div class="flex items-center gap-1.5 mb-1.5 api-param-row">
                                    <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}" value="${escHtml(p.key)}">
                                    <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}" value="${escHtml(p.value)}">
                                    <div class="flex items-center gap-1 shrink-0">
                                        <input type="checkbox" class="form-checkbox api-req" title="${t('apiRequired')}" ${p.req ? 'checked' : ''}>
                                        <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)"><i class="fa-solid fa-xmark"></i></button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <button class="btn-s text-xs mt-1" data-onclick="addApiParam()"><i class="fa-solid fa-plus mr-1"></i> ${t('addParam')}</button>
                    </div>
                </div>

                <!-- Request Body full-width -->
                <div class="mb-6">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-xs font-medium" style="color:var(--tx-m);">${t('apiBody')} <span class="opacity-40 font-normal text-[10px]">JSON</span></p>
                        <button class="text-[10px] opacity-60 hover:opacity-100 transition-opacity" data-onclick="formatJson('ed-api-body')" title="${t('formatJson')}"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Format</button>
                    </div>
                    <textarea id="ed-api-body" class="form-input font-mono text-xs w-full" style="height:110px;" placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}">${escHtml(apiData?.body || '')}</textarea>
                </div>

                <!-- RESPONSE section -->
                <div class="flex items-center gap-3 mb-4">
                    <span class="text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Response</span>
                    <div class="flex-1" style="height:1px;background:var(--brd);"></div>
                </div>

                <!-- Status code + Format -->
                <div class="flex items-center justify-between mb-2">
                    <div style="width:165px;">
                        ${renderSelect('ed-api-status', [
                            {value: '200', label: '200 OK'},
                            {value: '201', label: '201 Created'},
                            {value: '204', label: '204 No Content'},
                            {value: '301', label: '301 Moved Permanently'},
                            {value: '400', label: '400 Bad Request'},
                            {value: '401', label: '401 Unauthorized'},
                            {value: '403', label: '403 Forbidden'},
                            {value: '404', label: '404 Not Found'},
                            {value: '409', label: '409 Conflict'},
                            {value: '422', label: '422 Unprocessable Entity'},
                            {value: '429', label: '429 Too Many Requests'},
                            {value: '500', label: '500 Internal Server Error'},
                            {value: '502', label: '502 Bad Gateway'},
                            {value: '503', label: '503 Service Unavailable'},
                        ], apiData?.statusCode || '200', 'w-full font-mono text-xs')}
                    </div>
                    <button class="text-[10px] opacity-60 hover:opacity-100 transition-opacity" data-onclick="formatJson('ed-api-response')" title="${t('formatJson')}"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Format</button>
                </div>
                <textarea id="ed-api-response" class="form-input font-mono text-xs w-full" style="height:110px;" placeholder="{\n  &quot;status&quot;: &quot;success&quot;\n}">${escHtml(apiData?.response || '')}</textarea>
            </div>
        </div>
        ` : category === 'testrun' ? `
        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Environment / Build <span style="color:var(--tx-d)">(Optional)</span></label>
            <input id="ed-run-env" class="form-input" placeholder="e.g. Staging · build #1234" value="${escHtml((isEdit ? doc.runData?.environment : state._newRunData?.environment) || '')}">
        </div>
        <div class="mb-4">
            <label class="text-xs font-medium block mb-2" style="color:var(--tx-m);">Select Test Cases for Execution</label>
            <div class="p-3 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: 300px; overflow-y: auto;">
                ${documents.filter(d => d.category === 'testcases' && d.status !== 'deleted').length === 0 ? `<div class="text-center text-sm py-4" style="color:var(--tx-d);">No test cases available. Please create some Test Cases first.</div>` : documents.filter(d => d.category === 'testcases' && d.status !== 'deleted').map(tc => {
                    const isChecked = (doc?.runData?.targetIds || state._newRunData?.targetIds || []).includes(tc.id);
                    return `
                    <label class="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors" style="border-bottom: 1px solid var(--brd); transition: background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'">
                        <input type="checkbox" class="form-checkbox testrun-tc-cb" value="${tc.id}" ${isChecked ? 'checked' : ''}>
                        <div class="flex-1">
                            <div class="text-sm font-medium" style="color:var(--tx);">${escHtml(tc.title)}</div>
                            <div class="text-[11px]" style="color:var(--tx-d);">${tc.tcData?.steps?.length || 0} steps</div>
                        </div>
                    </label>
                    `;
                }).join('')}
            </div>
        </div>
        ` : category === 'testplan' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="mb-4">
                <label class="text-xs font-medium block mb-2" style="color:var(--tx-m);">Linked Test Cases <span class="opacity-60">(for coverage tracking)</span></label>
                <div class="p-3 rounded-lg flex flex-col gap-1 max-h-52 overflow-y-auto" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'testcases' && d.status !== 'deleted').length === 0
                        ? `<div class="text-xs text-center py-3" style="color:var(--tx-d);">No test cases available.</div>`
                        : documents.filter(d => d.category === 'testcases' && d.status !== 'deleted').map(tc => {
                            const isChecked = (tcPlanData?.linkedTCs || []).includes(tc.id);
                            return `<label class="flex items-center gap-3 p-2 rounded cursor-pointer" style="border-bottom:1px solid var(--brd); transition:background .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'">
                                <input type="checkbox" class="form-checkbox tp-tc-cb" value="${tc.id}" ${isChecked ? 'checked' : ''}>
                                <div class="flex-1">
                                    <div class="text-sm font-medium" style="color:var(--tx);">${escHtml(tc.title)}</div>
                                    <div class="text-[11px]" style="color:var(--tx-d);">${tc.tcData?.steps?.length || 0} steps · ${tc.tcData?.module ? escHtml(tc.tcData.module) : 'no module'}</div>
                                </div>
                            </label>`;
                        }).join('')}
                </div>
            </div>
            <div>
                <label class="text-xs font-medium block mb-2" style="color:var(--tx-m);">Linked Test Runs <span class="opacity-60">(to view execution coverage)</span></label>
                <div class="p-3 rounded-lg flex flex-col gap-1 max-h-40 overflow-y-auto" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'testrun' && d.status !== 'deleted').length === 0
                        ? `<div class="text-xs text-center py-3" style="color:var(--tx-d);">No test runs found.</div>`
                        : documents.filter(d => d.category === 'testrun' && d.status !== 'deleted').map(run => {
                            const isChecked = (tcPlanData?.linkedRuns || []).includes(run.id);
                            return `<label class="flex items-center gap-2 p-2 rounded cursor-pointer" style="border-bottom:1px solid var(--brd); transition:background .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'">
                                <input type="checkbox" class="form-checkbox tp-run-cb" value="${run.id}" ${isChecked ? 'checked' : ''}>
                                <i class="fa-solid fa-play-circle text-xs" style="color:var(--c-testrun);"></i>
                                <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(run.title)}</span>
                            </label>`;
                        }).join('')}
                </div>
            </div>
        </div>
        <div id="editor-container" class="mt-4 text-left"></div>
        <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        ` : category === 'release' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Version</label>
                    <input id="ed-rel-version" class="form-input text-sm w-full font-mono" placeholder="e.g. v1.2.0" value="${escHtml(releaseData?.version || '')}">
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Status</label>
                    ${renderSelect('ed-rel-status', [
                        {value: 'planning', label: '📋 Planning'},
                        {value: 'in-progress', label: '🔨 In Progress'},
                        {value: 'released', label: '🚀 Released'},
                        {value: 'cancelled', label: '❌ Cancelled'}
                    ], releaseData?.status || 'planning', 'w-full text-sm')}
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Release Date</label>
                    <div class="dp-wrap" id="dp-wrap">
                        <div class="dp-trigger" data-onclick="dpToggle()">
                            ${releaseData?.releaseDate
                                ? `<span class="dp-value">${(() => { const p = releaseData.releaseDate.split('-'); return p[1]+'/'+p[2]+'/'+p[0]; })()}</span>`
                                : `<span class="dp-placeholder">mm/dd/yyyy</span>`}
                            <i class="fa-regular fa-calendar dp-icon"></i>
                        </div>
                        <input type="hidden" id="ed-rel-date" value="${escHtml(releaseData?.releaseDate || '')}">
                        <div class="dp-panel hidden" id="dp-panel"></div>
                    </div>
                </div>
            </div>
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Linked Test Runs</label>
                <div class="p-3 rounded-lg flex flex-col gap-2 max-h-36 overflow-y-auto" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'testrun' && d.status !== 'deleted').map(run => `
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="form-checkbox ed-rel-run" value="${run.id}" ${(releaseData?.linkedRuns || []).includes(run.id) ? 'checked' : ''}>
                            <i class="fa-solid fa-play-circle text-xs" style="color:var(--c-testrun);"></i>
                            <span class="text-sm font-medium" style="color:var(--tx);">${escHtml(run.title)}</span>
                        </label>
                    `).join('') || `<div class="text-xs text-center py-2" style="color:var(--tx-d);">No test runs found. Create some Test Runs first.</div>`}
                </div>
            </div>
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Linked Bug Reports</label>
                <div class="p-3 rounded-lg flex flex-col gap-2 max-h-36 overflow-y-auto" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'bug' && d.status !== 'deleted').map(bug => `
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="form-checkbox ed-rel-bug" value="${bug.id}" ${(releaseData?.linkedBugs || []).includes(bug.id) ? 'checked' : ''}>
                            <i class="fa-solid fa-bug text-xs" style="color:var(--c-bug);"></i>
                            <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(bug.title)}</span>
                            ${bug.bugData?.severity ? `<span class="text-[10px] px-1.5 py-0.5 rounded" style="background:${bug.bugData.severity === 'Critical' ? '#ef444422' : bug.bugData.severity === 'Major' ? '#f9731622' : '#f59e0b22'}; color:${bug.bugData.severity === 'Critical' ? '#ef4444' : bug.bugData.severity === 'Major' ? '#f97316' : '#f59e0b'};">${escHtml(bug.bugData.severity)}</span>` : ''}
                        </label>
                    `).join('') || `<div class="text-xs text-center py-2" style="color:var(--tx-d);">No bug reports found.</div>`}
                </div>
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Linked Environments</label>
                <div class="p-3 rounded-lg flex flex-col gap-2 max-h-36 overflow-y-auto" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'environment' && d.status !== 'deleted').map(env => `
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="form-checkbox ed-rel-env" value="${env.id}" ${(releaseData?.linkedEnvs || []).includes(env.id) ? 'checked' : ''}>
                            <i class="fa-solid fa-network-wired text-xs" style="color:var(--c-env);"></i>
                            <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(env.title)}</span>
                            ${env.envData?.status ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full" style="background:${env.envData.status === 'healthy' ? '#10b98122' : env.envData.status === 'down' ? '#ef444422' : '#f59e0b22'}; color:${env.envData.status === 'healthy' ? '#10b981' : env.envData.status === 'down' ? '#ef4444' : '#f59e0b'};">${escHtml(env.envData.status)}</span>` : ''}
                        </label>
                    `).join('') || `<div class="text-xs text-center py-2" style="color:var(--tx-d);">No environments found.</div>`}
                </div>
            </div>
        </div>
        <div class="mt-4">
            <label class="text-xs font-medium block mb-2" style="color:var(--tx-m);">Release Notes <span class="opacity-60">(markdown)</span></label>
            <div id="editor-container" class="text-left"></div>
            <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        </div>
        ` : `
        <!-- Content area -->
        <div id="editor-container" class="mt-4 text-left"></div>
        <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        `}

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
// STEP HELPERS — BUG
// ========================
window.addBugStep = function() {
    const container = document.getElementById('bug-steps-container');
    if (!container) return;
    const idx = container.querySelectorAll('.bug-step-row').length;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 bug-step-row';
    div.innerHTML = `
        <span class="text-xs font-semibold step-idx" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
        <input class="form-input flex-1 bug-step-input" placeholder="Step ${idx + 1}...">
        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
};

window.removeBugStep = function(btn) {
    const row = btn.closest('.bug-step-row');
    row.remove();
    const container = document.getElementById('bug-steps-container');
    container.querySelectorAll('.bug-step-row').forEach((r, i) => {
        r.querySelector('.step-idx').textContent = (i + 1) + '.';
        r.querySelector('.bug-step-input').placeholder = 'Step ' + (i + 1) + '...';
    });
};

// ========================
// STEP HELPERS — TEST CASE
// ========================
window.addTcStep = function() {
    const container = document.getElementById('tc-steps-container');
    if (!container) return;
    const idx = container.querySelectorAll('.tc-step-row').length;
    const div = document.createElement('div');
    div.className = 'flex items-start gap-2 mb-2 tc-step-row';
    div.innerHTML = `
        <span class="text-xs font-semibold step-idx mt-2" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
        <textarea class="form-input flex-1 tc-step-action" style="height:60px;" placeholder="${t('tcActionPl')}"></textarea>
        <textarea class="form-input flex-1 tc-step-expected" style="height:60px;" placeholder="${t('tcExpectedPl')}"></textarea>
        <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
};

window.removeTcStep = function(btn) {
    const row = btn.closest('.tc-step-row');
    const container = row.parentElement;
    row.remove();
    container.querySelectorAll('.tc-step-row').forEach((r, i) => {
        r.querySelector('.step-idx').textContent = (i + 1) + '.';
    });
};

// ========================
// STEP HELPERS — API
// ========================
window.addApiHeader = function() {
    const container = document.getElementById('api-headers-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 api-header-row';
    div.innerHTML = `
        <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}">
        <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}">
        <div class="flex items-center gap-1">
            <input type="checkbox" class="form-checkbox api-req" title="${t('apiRequired')}">
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
    container.appendChild(div);
};
window.removeApiHeader = function(btn) { btn.closest('.api-header-row').remove(); };

window.addApiParam = function() {
    const container = document.getElementById('api-params-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 api-param-row';
    div.innerHTML = `
        <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}">
        <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}">
        <div class="flex items-center gap-1">
            <input type="checkbox" class="form-checkbox api-req" title="${t('apiRequired')}">
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
    container.appendChild(div);
};
window.removeApiParam = function(btn) { btn.closest('.api-param-row').remove(); };

// ========================
// ENVIRONMENT PROPERTY HELPERS
// ========================
window.addEnvProp = function() {
    const container = document.getElementById('env-props-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 env-prop-row';
    div.innerHTML = `
        <input class="form-input env-prop-label text-sm" style="flex:0 0 35%;" placeholder="${t('envLabelPl')}">
        <input class="form-input env-prop-value flex-1 text-sm font-mono" placeholder="${t('envValuePl')}">
        <input type="checkbox" class="env-prop-secret hidden">
        <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:var(--tx-m);" title="${t('toggleSecret')}" data-onclick="toggleEnvSecret(this)">
            <i class="fa-solid fa-eye"></i>
        </button>
        <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:var(--tx-m);" data-onclick="removeEnvProp(this)"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
    div.querySelector('.env-prop-label').focus();
};
window.removeEnvProp = function(btn) { btn.closest('.env-prop-row').remove(); };
window.toggleEnvSecret = function(btn) {
    const row = btn.closest('.env-prop-row');
    const cb = row.querySelector('.env-prop-secret');
    cb.checked = !cb.checked;
    const icon = btn.querySelector('i');
    if (cb.checked) {
        icon.className = 'fa-solid fa-eye-slash';
        btn.style.color = 'var(--acc)';
    } else {
        icon.className = 'fa-solid fa-eye';
        btn.style.color = 'var(--tx-m)';
    }
};

// ========================
// CUSTOM SELECT (renderSelect)
// ========================
window.renderSelect = function(id, options, selectedValue, customClass, onChangeCode) {
    customClass = customClass || '';
    onChangeCode = onChangeCode || '';
    const selOpt = options.find(o => o.value === selectedValue) || options[0] || {label:'', value:''};
    const optionsHtml = options.map(o => `
        <div class="subfolder-option px-3 py-2 text-sm cursor-pointer" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card-h)'" data-onmouseleave="this.style.background='transparent'" data-onclick="selectCustomOption('${id}', '${escHtml(o.value.replace(/'/g, "\\'"))}', '${escHtml(o.label.replace(/'/g, "\\'"))}', '${onChangeCode.replace(/'/g, "\\'")}')">${escHtml(o.label)}</div>
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
