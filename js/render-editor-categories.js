// ========================
// CATEGORY-SPECIFIC EDITOR RENDERERS AND CONTROLS
// ========================
function renderEditorCategory(context) {
    const {
        doc, isEdit, category, content, bugData, tcData, apiData,
        runData, envData, releaseData, releasePolicy, tcPlanData, bugDefaultSla
    } = context;
    return`
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
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Last Rotated <span style="color:var(--tx-d)">(optional)</span></label>
                <input type="date" id="ed-cred-rotated" class="form-input" value="${escHtml(doc?.rotatedAt || '')}">
                <p class="text-[10px] mt-1" style="color:var(--tx-d);">Used for the rotation-reminder badge. Leave blank to use the creation date.</p>
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
        <section class="bug-triage-editor mb-4">
            <div class="bug-triage-editor-head">
                <div><h3>${t('triageTitle')}</h3><p>${t('triageEditorSub')}</p></div>
                <span>${t('triageDecisionTarget')}</span>
            </div>
            <div class="grid sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('triageClassification')}</label>
                    ${renderSelect('ed-bug-classification', [
                        {value: 'unclassified', label: t('triageUnclassified')},
                        {value: 'functional', label: t('triageTypeFunctional')},
                        {value: 'regression', label: t('triageTypeRegression')},
                        {value: 'performance', label: t('triageTypePerformance')},
                        {value: 'security', label: t('triageTypeSecurity')},
                        {value: 'usability', label: t('triageTypeUsability')},
                        {value: 'data', label: t('triageTypeData')},
                        {value: 'compatibility', label: t('triageTypeCompatibility')}
                    ], bugData?.classification || 'unclassified', 'w-full')}
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('triageSla')}</label>
                    ${renderSelect('ed-bug-sla', [
                        {value: '4', label: t('triageSlaHours', {count: 4})},
                        {value: '24', label: t('triageSlaHours', {count: 24})},
                        {value: '48', label: t('triageSlaHours', {count: 48})},
                        {value: '72', label: t('triageSlaHours', {count: 72})},
                        {value: '168', label: t('triageSlaHours', {count: 168})}
                    ], String(bugData?.slaHours || bugDefaultSla), 'w-full')}
                </div>
            </div>
            <p class="bug-triage-rule"><i class="fa-solid fa-circle-info"></i>${t('triageReadyRule')}</p>
        </section>


        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Linked Test Case <span style="color:var(--tx-d)">(Optional)</span></label>
            ${renderSelect('ed-bug-linked-tc', [
                { value: '', label: '— None —' },
                ...documents.filter(d => d.category === 'testcases' && d.status !== 'deleted')
                    .map(tc => ({ value: tc.id, label: tc.title }))
            ], bugData?.linkedTc || '', 'w-full')}
            <p class="text-[10px] mt-1" style="color:var(--tx-d);">Manually link this bug to the test case it relates to, separate from "Found in run" (set automatically from a failed test-run step).</p>
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
                        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)" aria-label="Remove step" title="Remove step"><i class="fa-solid fa-trash"></i></button>
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
                            <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)" aria-label="Remove step" title="Remove step"><i class="fa-solid fa-trash"></i></button>
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
                            <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:var(--tx-m);" data-onclick="removeEnvProp(this)" aria-label="Remove property" title="Remove property"><i class="fa-solid fa-trash"></i></button>
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
                <div class="api-impact-editor mb-6">
                    <div class="grid sm:grid-cols-2 gap-4">
                        <div>
                            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('apiModule')}</label>
                            <input id="ed-api-module" class="form-input w-full" placeholder="${t('apiModulePlaceholder')}" value="${escHtml(apiData?.module || '')}">
                        </div>
                        <div>
                            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('apiChangeImpact')}</label>
                            ${renderSelect('ed-api-impact', [
                                {value: 'none', label: t('apiImpactNone')},
                                {value: 'low', label: t('apiImpactLow')},
                                {value: 'medium', label: t('apiImpactMedium')},
                                {value: 'high', label: t('apiImpactHigh')}
                            ], apiData?.changeImpact || 'none', 'w-full')}
                        </div>
                    </div>
                    <label class="api-impact-check mt-3">
                        <input id="ed-api-mark-changed" type="checkbox" class="form-checkbox">
                        <span>${t('apiMarkChanged')}</span>
                    </label>
                    <p class="api-impact-hint">${t('apiImpactHint')}</p>
                </div>
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
                                        <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)" aria-label="Remove header" title="Remove header"><i class="fa-solid fa-xmark"></i></button>
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
                                        <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)" aria-label="Remove parameter" title="Remove parameter"><i class="fa-solid fa-xmark"></i></button>
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
            ${(() => {
                const allTc = documents.filter(d => d.category === 'testcases' && d.status !== 'deleted');
                const targetIds = doc?.runData?.targetIds || state._newRunData?.targetIds || [];
                return `
                <div class="flex items-center justify-between mb-2">
                    <label class="text-xs font-medium" style="color:var(--tx-m);">Select Test Cases for Execution</label>
                    <span id="ed-run-tc-count" class="text-[11px]" style="color:var(--tx-d);">${targetIds.length > 0 ? `${targetIds.length} selected` : ''}</span>
                </div>
                ${allTc.length > 0 ? `<div class="search-w mb-2"><i class="fa-solid fa-search"></i><input type="text" id="ed-run-tc-search" class="form-input text-sm" placeholder="Filter test cases by title or module..." data-oninput="_filterTestRunTcList(this.value)"></div>` : ''}
                <div class="p-3 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: 300px; overflow-y: auto;">
                    ${allTc.length === 0 ? `<div class="text-center text-sm py-4" style="color:var(--tx-d);">No test cases available. Please create some Test Cases first.</div>` : allTc.map(tc => {
                        const isChecked = targetIds.includes(tc.id);
                        const filterKey = `${tc.title} ${tc.tcData?.module || ''}`.toLowerCase();
                        return `
                        <label class="testrun-tc-row flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ui-hover-card" data-filter-key="${escHtml(filterKey)}" style="border-bottom: 1px solid var(--brd); transition: background .15s;">
                            <input type="checkbox" class="form-checkbox testrun-tc-cb" value="${tc.id}" ${isChecked ? 'checked' : ''} data-onchange="_updateTestRunTcCount()">
                            <div class="flex-1">
                                <div class="text-sm font-medium" style="color:var(--tx);">${escHtml(tc.title)}</div>
                                <div class="text-[11px]" style="color:var(--tx-d);">${tc.tcData?.module ? escHtml(tc.tcData.module) + ' · ' : ''}${tc.tcData?.steps?.length || 0} steps</div>
                            </div>
                        </label>
                        `;
                    }).join('')}
                    <div id="ed-run-tc-empty" class="hidden text-center text-sm py-4" style="color:var(--tx-d);">No test cases match your filter.</div>
                </div>`;
            })()}
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
                            return `<label class="flex items-center gap-3 p-2 rounded cursor-pointer ui-hover-bg2" style="border-bottom:1px solid var(--brd); transition:background .15s;">
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
                            return `<label class="flex items-center gap-2 p-2 rounded cursor-pointer ui-hover-bg2" style="border-bottom:1px solid var(--brd); transition:background .15s;">
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
            <div class="release-policy-card mb-4">
                <div class="release-policy-head">
                    <div>
                        <strong>Release readiness policy</strong>
                        <p>Define the evidence required before this release can move forward.</p>
                    </div>
                    <i class="fa-solid fa-shield-halved"></i>
                </div>
                <div class="release-policy-grid">
                    <label class="release-policy-rate">
                        <span>Minimum pass rate</span>
                        <span class="release-rate-input"><input type="number" id="ed-rel-min-pass" min="0" max="100" value="${releasePolicy.minPassRate}"><b>%</b></span>
                    </label>
                    <label class="release-policy-toggle">
                        <input type="checkbox" id="ed-rel-block-critical" ${releasePolicy.blockCritical ? 'checked' : ''}>
                        <span><b>Block Critical defects</b><small>Open Critical bugs prevent release.</small></span>
                    </label>
                    <label class="release-policy-toggle">
                        <input type="checkbox" id="ed-rel-block-major" ${releasePolicy.blockMajor ? 'checked' : ''}>
                        <span><b>Block Major defects</b><small>Open Major bugs also prevent release.</small></span>
                    </label>
                    <label class="release-policy-toggle">
                        <input type="checkbox" id="ed-rel-complete-execution" ${releasePolicy.requireCompleteExecution ? 'checked' : ''}>
                        <span><b>Require complete execution</b><small>Every linked run step needs a result.</small></span>
                    </label>
                    <label class="release-policy-toggle">
                        <input type="checkbox" id="ed-rel-healthy-env" ${releasePolicy.requireHealthyEnvironments ? 'checked' : ''}>
                        <span><b>Require healthy environments</b><small>At least one linked environment; all healthy.</small></span>
                    </label>
                </div>
                <div class="release-decision-editor">
                    <div>
                        <label>Decision override</label>
                        ${renderSelect('ed-rel-decision', [
                            { value: 'auto', label: 'Automatic \u00b7 follow policy' },
                            { value: 'go-with-risk', label: 'GO WITH RISK \u00b7 accepted exception' },
                            { value: 'no-go', label: 'NO-GO \u00b7 manual hold' }
                        ], releaseData?.manualDecision || 'auto', 'w-full text-sm')}
                    </div>
                    <div>
                        <label>Reason <span>(required for override)</span></label>
                        <textarea id="ed-rel-decision-reason" class="form-input" rows="2" maxlength="500" placeholder="State the accepted risk or reason for holding the release...">${escHtml(releaseData?.decisionReason || '')}</textarea>
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
            <div class="flex items-center justify-between mb-2">
                <label class="text-xs font-medium" style="color:var(--tx-m);">Release Notes <span class="opacity-60">(markdown)</span></label>
                <button type="button" class="btn-s text-[11px] py-1 px-2.5 flex items-center gap-1.5" data-onclick="generateReleaseNotes()"><i class="fa-solid fa-wand-magic-sparkles" style="font-size:10px;"></i> Generate from linked data</button>
            </div>
            <div id="editor-container" class="text-left"></div>
            <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        </div>
        ` : `
        <!-- Content area -->
        <div id="editor-container" class="mt-4 text-left"></div>
        <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        `}
`;
}

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
        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)" aria-label="Remove step" title="Remove step"><i class="fa-solid fa-trash"></i></button>
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
        <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)" aria-label="Remove step" title="Remove step"><i class="fa-solid fa-trash"></i></button>
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
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)" aria-label="Remove header" title="Remove header"><i class="fa-solid fa-xmark"></i></button>
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
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)" aria-label="Remove parameter" title="Remove parameter"><i class="fa-solid fa-xmark"></i></button>
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
        <button type="button" class="btn-s shrink-0 flex items-center justify-center" style="width:34px;height:34px;color:var(--tx-m);" data-onclick="removeEnvProp(this)" aria-label="Remove property" title="Remove property"><i class="fa-solid fa-trash"></i></button>
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
