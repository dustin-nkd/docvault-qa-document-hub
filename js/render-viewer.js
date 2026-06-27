// ========================
// RENDER VIEWER
// ========================
function renderViewer() {
    const doc = documents.find(d => d.id === state.editingDoc?.id);
    if (!doc) return `<div class="text-center py-20" style="color:var(--tx-d);">Document not found.</div>`;

    return `<div class="fade-up max-w-4xl mx-auto">
        <!-- Meta -->
        <div class="flex flex-wrap items-center gap-2.5 mb-4">
            <span class="cat-badge ${CAT_META[doc.category].cls}">${CAT_META[doc.category].label}</span>
            ${doc.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(doc.subfolder)}</span>` : ''}
            <span class="st-badge st-${doc.status}">${doc.status}</span>
            ${(doc.tags || []).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
            ${state.sharedView ? '' : `<button class="fav-btn ${doc.favorite ? 'on' : ''} text-sm ml-auto" style="color:${doc.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="toggleFav('${doc.id}')">
                <i class="fa-${doc.favorite ? 'solid' : 'regular'} fa-star"></i>
            </button>`}
        </div>
        <!-- Title -->
        <h1 class="font-heading font-bold text-2xl mb-2" style="color:var(--tx);">${escHtml(doc.title)}</h1>

        <p class="text-xs mb-6" style="color:var(--tx-d);">
            Created ${fmtDate(doc.createdAt)} &middot; Updated ${fmtDate(doc.updatedAt)}
        </p>

        ${doc.category === 'credential' ? `
        <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Username / Email</p>
                <div class="flex items-center gap-3">
                    <div class="cred-avatar ${credAvatarColor(doc.title)} shrink-0">
                        <img class="cred-favicon" src="https://icons.duckduckgo.com/ip3/${guessDomain(doc.title)}.ico" onload="this.classList.add('loaded'); this.nextElementSibling.style.display='none'; this.parentElement.classList.add('has-favicon');" onerror="this.style.display='none'">
                        <span>${escHtml(doc.title.charAt(0).toUpperCase())}</span>
                    </div>
                    <div class="flex-1 flex items-center gap-2 min-w-0">
                        <div class="flex-1 flex items-center px-3 py-2 rounded-lg min-w-0" style="background:var(--bg);border:1px solid var(--brd);">
                            <span class="text-sm font-mono truncate" style="color:var(--tx);">${escHtml(doc.username || 'N/A')}</span>
                        </div>
                        ${doc.username ? `<button class="btn-s py-2 px-4 shrink-0" data-onclick="copyUsername('${doc.id}', this)"><i class="fa-solid fa-copy mr-1.5"></i>${t('copy')}</button>` : ''}
                    </div>
                </div>
            </div>
            <div>
                <p class="text-[11px] font-medium tracking-wide uppercase mb-1.5" style="color:var(--tx-d);">Password</p>
                ${state.sharedView ? `
                <div class="flex items-center gap-2 px-3 py-2 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);">
                    <i class="fa-solid fa-lock text-sm"></i>
                    <span class="text-sm">Password hidden in shared view</span>
                </div>` : `
                <div class="flex items-center gap-2">
                    <div class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);">
                        <input type="password" id="view-pw" value="${escHtml(doc.password || '')}" class="bg-transparent border-none outline-none text-sm w-full font-mono tracking-wider" style="color:var(--tx);" readonly>
                        <button id="view-pw-btn" class="text-xs p-1" style="color:var(--tx-m);transition:color .2s;" data-onmouseenter="this.style.color='var(--tx)'" data-onmouseleave="this.style.color='var(--tx-m)'" data-onclick="togglePasswordVisibility('view-pw')"><i class="fa-solid fa-eye"></i></button>
                    </div>
                    <button class="btn-p py-2 px-4" data-onclick="copyPassword('${doc.id}', this)"><i class="fa-solid fa-copy mr-1.5"></i>Copy</button>
                </div>`}
            </div>
        </div>
        ` : ''}

        ${doc.category === 'environment' ? `
        <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
            <div class="flex items-center justify-between mb-5">
                <h3 class="font-heading font-semibold text-lg" style="color:var(--tx);">Environment Details</h3>
                <span class="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase" style="background:${doc.envData?.status === 'healthy' ? '#10b98122' : doc.envData?.status === 'down' ? '#ef444422' : '#f59e0b22'}; color:${doc.envData?.status === 'healthy' ? '#10b981' : doc.envData?.status === 'down' ? '#ef4444' : '#f59e0b'}; border:1px solid ${doc.envData?.status === 'healthy' ? '#10b98155' : doc.envData?.status === 'down' ? '#ef444455' : '#f59e0b55'};">
                    <i class="fa-solid fa-circle text-[8px] mr-1.5"></i>${doc.envData?.status || 'Unknown'}
                </span>
            </div>

            ${(() => {
                const props = doc.envData?.properties || [];
                const legacyProps = [];
                if (!props.length) {
                    if (doc.envData?.frontendUrl) legacyProps.push({label: 'Frontend URL', value: doc.envData.frontendUrl, secret: false});
                    if (doc.envData?.backendUrl) legacyProps.push({label: 'Backend API URL', value: doc.envData.backendUrl, secret: false});
                    if (doc.envData?.dbInfo) legacyProps.push({label: 'Database Connection', value: doc.envData.dbInfo, secret: true});
                }
                const allProps = props.length ? props : legacyProps;
                if (!allProps.length) return '';

                return `<div class="grid sm:grid-cols-2 gap-4 mb-5">
                    ${allProps.map(prop => `
                    <div class="p-4 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                        <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">${escHtml(prop.label)}</p>
                        <div class="flex items-center gap-2">
                            ${prop.secret ? `
                                <input type="password" id="view-env-prop-${escHtml(prop.label).replace(/\s+/g,'-').toLowerCase()}" value="${escHtml(prop.value)}" class="bg-transparent border-none outline-none text-sm w-full font-mono tracking-wider flex-1" style="color:var(--tx);" readonly>
                                <button class="btn-s px-2 py-1 text-xs" data-onclick="togglePasswordVisibility('view-env-prop-${escHtml(prop.label).replace(/\s+/g,'-').toLowerCase()}')"><i class="fa-solid fa-eye"></i></button>
                            ` : `
                                ${prop.value.startsWith('http') ?
                                    `<a href="${escHtml(prop.value)}" target="_blank" class="text-sm font-mono text-emerald-400 hover:underline truncate flex-1">${escHtml(prop.value)}</a>` :
                                    `<span class="text-sm font-mono flex-1 truncate" style="color:var(--tx);">${escHtml(prop.value)}</span>`
                                }
                            `}
                            <button class="btn-s px-2 py-1 text-xs" data-copy-value="${escHtml(prop.value)}" data-onclick="_copyProp(this)"><i class="fa-solid fa-copy"></i></button>
                        </div>
                    </div>
                    `).join('')}
                </div>`;
            })()}

            ${doc.envData?.linkedCreds?.length ? `
            <div>
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Credentials</p>
                <div class="flex flex-wrap gap-2">
                    ${doc.envData.linkedCreds.map(id => {
                        const cred = documents.find(d => d.id === id && d.status !== 'deleted');
                        if (!cred) return '';
                        return `
                        <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'" data-onclick="viewDoc('${cred.id}')">
                            <i class="fa-solid fa-key text-xs" style="color:var(--c-cred);"></i>
                            <span class="text-xs font-medium" style="color:var(--tx);">${escHtml(cred.title)}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
        </div>
        ` : ''}

        ${doc.category === 'testrun' ? `
        <!-- Test Run Execution UI -->
        ${(() => {
            const results = doc.runData?.results || {};
            const targetIds = doc.runData?.targetIds || [];
            const targets = documents.filter(d => targetIds.includes(d.id) && d.status !== 'deleted');

            let totalSteps = 0;
            let passCount = 0;
            let failCount = 0;
            let blockedCount = 0;

            targets.forEach(tc => {
                const steps = tc.tcData?.steps || [];
                totalSteps += steps.length;
                steps.forEach((_, i) => {
                    const st = results[tc.id]?.[i];
                    if (st === 'pass') passCount++;
                    if (st === 'fail') failCount++;
                    if (st === 'blocked') blockedCount++;
                });
            });

            const untestedCount = totalSteps - (passCount + failCount + blockedCount);
            const passPct = totalSteps ? (passCount / totalSteps * 100) : 0;
            const failPct = totalSteps ? (failCount / totalSteps * 100) : 0;
            const blockedPct = totalSteps ? (blockedCount / totalSteps * 100) : 0;
            const untestedPct = totalSteps ? (untestedCount / totalSteps * 100) : 100;

            let html = `
            <div class="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('pass')}</div>
                    <div class="text-3xl font-bold" style="color:#10b981;">${passCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('fail')}</div>
                    <div class="text-3xl font-bold" style="color:#ef4444;">${failCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('blocked')}</div>
                    <div class="text-3xl font-bold" style="color:#f59e0b;">${blockedCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('untested')}</div>
                    <div class="text-3xl font-bold" style="color:var(--tx-m);">${untestedCount}</div>
                </div>
            </div>

            <div class="mb-8">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold uppercase tracking-wider" style="color:var(--tx-m);">${t('testRunProgress')} (${totalSteps} steps)</span>
                    <span class="text-xs font-medium" style="color:var(--tx);">${Math.round(passPct)}% Passed</span>
                </div>
                <div class="w-full h-1.5 rounded-full overflow-hidden flex" style="background:var(--bg2); border:1px solid var(--brd);">
                    <div style="width:${passPct}%;background:#10b981;transition:width .4s ease;"></div>
                    <div style="width:${failPct}%;background:#ef4444;transition:width .4s ease;"></div>
                    <div style="width:${blockedPct}%;background:#f59e0b;transition:width .4s ease;"></div>
                    <div style="width:${untestedPct}%;background:transparent;"></div>
                </div>
            </div>
            <div class="space-y-4">
            `;

            if (targets.length === 0) {
                html += `<div class="text-center text-sm py-4" style="color:var(--tx-d);">No test cases selected.</div>`;
            } else {
                targets.forEach(tc => {
                    const steps = tc.tcData?.steps || [];
                    const tcNote = doc.runData?.results?.[tc.id]?.note || '';
                    html += `
                    <div class="rounded-xl overflow-hidden" style="border:1px solid var(--brd);">
                        <div class="px-4 py-3 flex items-center gap-3" style="background:var(--bg2); border-bottom:1px solid var(--brd);">
                            <span class="w-2 h-2 rounded-full shrink-0" style="background:var(--c-tc);"></span>
                            <span class="font-medium text-sm" style="color:var(--tx);">${escHtml(tc.title)}</span>
                            ${state.sharedView ? '' : `<button class="btn-s text-xs ml-auto" data-onclick="viewDoc('${tc.id}')" title="View Test Case"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`}
                        </div>
                        <div class="bg-transparent p-4">
                            ${steps.length === 0 ? `<div class="text-xs" style="color:var(--tx-m);">No steps defined.</div>` :
                            steps.map((step, idx) => {
                                const status = results[tc.id]?.[idx] || 'untested';
                                const statusColors = { pass: '#10b981', fail: '#ef4444', blocked: '#f59e0b', untested: 'var(--tx-d)' };
                                const statusLabels = { pass: '<i class="fa-solid fa-check mr-1"></i>Pass', fail: '<i class="fa-solid fa-xmark mr-1"></i>Fail', blocked: '<i class="fa-solid fa-ban mr-1"></i>Blocked', untested: 'Untested' };
                                return `
                                <div class="py-4 ${idx !== steps.length - 1 ? 'border-b' : ''}" style="border-color:var(--brd);">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5" style="color:var(--tx-m);">Step ${idx + 1}</span>
                                    </div>
                                    <div class="flex flex-col md:flex-row gap-4">
                                        <div class="flex-1 space-y-2">
                                            <div class="text-sm leading-relaxed" style="color:var(--tx);">${escHtml(step.action).replace(/\n/g, '<br>')}</div>
                                            ${step.expected ? `<div class="text-[13px] leading-relaxed" style="color:var(--tx-m);"><span class="font-semibold opacity-60 uppercase text-[10px] tracking-wider mr-1">Expected:</span> ${escHtml(step.expected).replace(/\n/g, '<br>')}</div>` : ''}
                                        </div>
                                        <div class="shrink-0 flex items-start">
                                            ${state.sharedView ? `
                                            <span class="px-3 py-1.5 text-[11px] font-medium rounded-lg" style="background:${status !== 'untested' ? statusColors[status] + '22' : 'var(--bg2)'}; color:${statusColors[status]}; border:1px solid ${status !== 'untested' ? statusColors[status] + '55' : 'var(--brd)'};">
                                                ${statusLabels[status]}
                                            </span>
                                            ` : `
                                            <div class="flex rounded-lg overflow-hidden border" style="border-color:var(--brd); background:var(--bg2); box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'pass' ? 'bg-emerald-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'pass' ? 'color:var(--tx-m);' : ''} border-right:1px solid var(--brd);" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'pass')" title="${t('pass')}"><i class="fa-solid fa-check mr-1.5"></i>Pass</button>
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'fail' ? 'bg-rose-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'fail' ? 'color:var(--tx-m);' : ''} border-right:1px solid var(--brd);" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'fail')" title="${t('fail')}"><i class="fa-solid fa-xmark mr-1.5"></i>Fail</button>
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'blocked' ? 'bg-amber-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'blocked' ? 'color:var(--tx-m);' : ''}" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'blocked')" title="${t('blocked')}"><i class="fa-solid fa-ban mr-1.5"></i>Block</button>
                                            </div>
                                            `}
                                        </div>
                                    </div>
                                </div>
                                `;
                            }).join('')}

                            ${state.sharedView ? (tcNote ? `
                            <div class="mt-4 pt-4 border-t" style="border-color:var(--brd);">
                                <p class="text-xs font-semibold uppercase tracking-wider mb-2" style="color:var(--tx-m);">Execution Note</p>
                                <p class="text-sm" style="color:var(--tx);">${escHtml(tcNote)}</p>
                            </div>` : '') : `
                            <div class="mt-4 pt-4 border-t" style="border-color:var(--brd);">
                                <p class="text-xs font-semibold uppercase tracking-wider mb-2" style="color:var(--tx-m);">Execution Note</p>
                                <textarea id="tr-note-${tc.id}" class="form-input w-full text-sm bg-black/20" style="height:60px;" placeholder="Add any notes about this test case execution..." data-onchange="updateTestRunNote('${doc.id}', '${tc.id}', this.value)">${escHtml(tcNote)}</textarea>
                            </div>`}
                        </div>
                    </div>
                    `;
                });
            }
            html += `</div>`;
            return html;
        })()}
        ` : doc.category === 'testplan' ? `
        ${(() => {
            const linkedTCs = (doc.tcPlanData?.linkedTCs || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);
            const linkedRuns = (doc.tcPlanData?.linkedRuns || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);

            const coveredTCIds = new Set();
            linkedRuns.forEach(run => (run.runData?.targetIds || []).forEach(id => coveredTCIds.add(id)));

            let totalSteps = 0, passSteps = 0;
            linkedRuns.forEach(run => {
                const results = run.runData?.results || {};
                linkedTCs.forEach(tc => {
                    const steps = tc.tcData?.steps || [];
                    totalSteps += steps.length;
                    steps.forEach((_, i) => { if (results[tc.id]?.[i] === 'pass') passSteps++; });
                });
            });
            const passPct = totalSteps > 0 ? Math.round(passSteps / totalSteps * 100) : null;
            const coveredCount = linkedTCs.filter(tc => coveredTCIds.has(tc.id)).length;
            const coveragePct = linkedTCs.length > 0 ? Math.round(coveredCount / linkedTCs.length * 100) : null;

            return `
            <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(245,158,11,0.12);">
                        <i class="fa-solid fa-clipboard-list" style="color:var(--c-tp);"></i>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm font-semibold" style="color:var(--tx);">Test Coverage</div>
                        <div class="text-xs mt-0.5" style="color:var(--tx-d);">${linkedTCs.length} test cases · ${linkedRuns.length} runs linked</div>
                    </div>
                </div>
                <div class="grid grid-cols-3 gap-3 mb-4">
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Test Cases</div>
                        <div class="text-2xl font-bold" style="color:var(--c-tp);">${linkedTCs.length}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Coverage</div>
                        <div class="text-2xl font-bold" style="color:${coveragePct === null ? 'var(--tx-d)' : coveragePct === 100 ? '#10b981' : coveragePct >= 70 ? '#f59e0b' : '#ef4444'};">${coveragePct !== null ? coveragePct + '%' : '—'}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Pass Rate</div>
                        <div class="text-2xl font-bold" style="color:${passPct === null ? 'var(--tx-d)' : passPct >= 80 ? '#10b981' : passPct >= 50 ? '#f59e0b' : '#ef4444'};">${passPct !== null ? passPct + '%' : '—'}</div>
                    </div>
                </div>
                ${linkedTCs.length > 0 ? `
                <div class="mb-1">
                    <div class="flex items-center justify-between mb-1.5">
                        <span class="text-[11px] uppercase tracking-wider font-medium" style="color:var(--tx-d);">Coverage Progress</span>
                        <span class="text-[11px]" style="color:var(--tx-m);">${coveredCount} / ${linkedTCs.length} covered</span>
                    </div>
                    <div class="w-full h-1.5 rounded-full overflow-hidden" style="background:var(--card);border:1px solid var(--brd);">
                        <div style="width:${coveragePct || 0}%;height:100%;background:linear-gradient(90deg,#10b981,#34d399);transition:width .4s ease;border-radius:9999px;"></div>
                    </div>
                </div>` : ''}
            </div>
            ${linkedTCs.length ? `
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Test Cases (${linkedTCs.length})</p>
                <div class="space-y-2">
                    ${linkedTCs.map(tc => {
                        const isCovered = coveredTCIds.has(tc.id);
                        return `<div class="flex items-center gap-3 p-3 rounded-lg border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;${state.sharedView ? '' : 'cursor:pointer;'}" ${state.sharedView ? '' : `data-onclick="viewDoc('${tc.id}')"`} data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                            <i class="fa-solid fa-flask-vial text-xs shrink-0" style="color:var(--c-tc);"></i>
                            <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(tc.title)}</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold" style="background:${isCovered ? '#10b98120' : 'rgba(122,139,168,0.1)'}; color:${isCovered ? '#10b981' : 'var(--tx-d)'};">${isCovered ? 'Covered' : 'Not run'}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
            ${linkedRuns.length ? `
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Test Runs (${linkedRuns.length})</p>
                <div class="space-y-2">
                    ${linkedRuns.map(run => {
                        const results = run.runData?.results || {};
                        let rTotal = 0, rPass = 0;
                        linkedTCs.forEach(tc => {
                            const steps = tc.tcData?.steps || [];
                            rTotal += steps.length;
                            steps.forEach((_, i) => { if (results[tc.id]?.[i] === 'pass') rPass++; });
                        });
                        const pct = rTotal ? Math.round(rPass / rTotal * 100) : null;
                        return `<div class="flex items-center gap-3 p-3 rounded-lg border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;${state.sharedView ? '' : 'cursor:pointer;'}" ${state.sharedView ? '' : `data-onclick="viewDoc('${run.id}')"`} data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                            <i class="fa-solid fa-play-circle text-sm shrink-0" style="color:var(--c-testrun);"></i>
                            <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(run.title)}</span>
                            <span class="text-xs font-mono font-semibold" style="color:${pct === null ? 'var(--tx-d)' : pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'};">${pct !== null ? pct + '%' : '—'}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
            `;
        })()}
        ` : doc.category === 'release' ? `
        ${(() => {
            const linkedRuns = (doc.releaseData?.linkedRuns || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);
            const linkedBugs = (doc.releaseData?.linkedBugs || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);
            const linkedEnvs = (doc.releaseData?.linkedEnvs || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);

            let totalSteps = 0, passSteps = 0;
            linkedRuns.forEach(run => {
                const results = run.runData?.results || {};
                (run.runData?.targetIds || []).forEach(tcId => {
                    const tc = documents.find(d => d.id === tcId);
                    if (!tc) return;
                    const steps = tc.tcData?.steps || [];
                    totalSteps += steps.length;
                    steps.forEach((_, i) => { if (results[tcId]?.[i] === 'pass') passSteps++; });
                });
            });
            const passPct = totalSteps ? Math.round(passSteps / totalSteps * 100) : null;
            const criticalBugs = linkedBugs.filter(b => b.bugData?.severity === 'Critical').length;
            const sevColor = s => s === 'Critical' ? '#ef4444' : s === 'Major' ? '#f97316' : s === 'Minor' ? '#f59e0b' : '#7a8ba8';

            const statusStyle = s => ({
                released: { bg: '#10b98122', color: '#10b981', border: '#10b98155', label: '🚀 Released' },
                'in-progress': { bg: '#6366f122', color: '#6366f1', border: '#6366f155', label: '🔨 In Progress' },
                cancelled: { bg: '#ef444422', color: '#ef4444', border: '#ef444455', label: '❌ Cancelled' },
                planning: { bg: 'rgba(122,139,168,0.12)', color: 'var(--tx-m)', border: 'var(--brd)', label: '📋 Planning' }
            }[s] || { bg: 'rgba(122,139,168,0.12)', color: 'var(--tx-m)', border: 'var(--brd)', label: '📋 Planning' });

            const st = statusStyle(doc.releaseData?.status);

            return `
            <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(168,85,247,0.12);">
                            <i class="fa-solid fa-rocket" style="color:var(--c-rel);"></i>
                        </div>
                        <div>
                            <div class="font-mono font-bold text-xl" style="color:var(--c-rel);">${escHtml(doc.releaseData?.version || 'v?.?.?')}</div>
                            ${doc.releaseData?.releaseDate ? `<div class="text-xs mt-0.5" style="color:var(--tx-d);">Release Date: ${escHtml(doc.releaseData.releaseDate)}</div>` : ''}
                        </div>
                    </div>
                    <span class="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase" style="background:${st.bg}; color:${st.color}; border:1px solid ${st.border};">${st.label}</span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Test Runs</div>
                        <div class="text-2xl font-bold" style="color:var(--c-rel);">${linkedRuns.length}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Pass Rate</div>
                        <div class="text-2xl font-bold" style="color:${passPct === null ? 'var(--tx-d)' : passPct >= 80 ? '#10b981' : passPct >= 50 ? '#f59e0b' : '#ef4444'};">${passPct !== null ? passPct + '%' : '—'}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Total Bugs</div>
                        <div class="text-2xl font-bold" style="color:${linkedBugs.length === 0 ? '#10b981' : '#ef4444'};">${linkedBugs.length}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Critical</div>
                        <div class="text-2xl font-bold" style="color:${criticalBugs === 0 ? '#10b981' : '#ef4444'};">${criticalBugs}</div>
                    </div>
                </div>
            </div>
            ${linkedRuns.length ? `
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Test Runs (${linkedRuns.length})</p>
                <div class="space-y-2">
                    ${linkedRuns.map(run => {
                        const results = run.runData?.results || {};
                        let rTotal = 0, rPass = 0;
                        (run.runData?.targetIds || []).forEach(tcId => {
                            const tc = documents.find(d => d.id === tcId);
                            if (!tc) return;
                            const steps = tc.tcData?.steps || [];
                            rTotal += steps.length;
                            steps.forEach((_, i) => { if (results[tcId]?.[i] === 'pass') rPass++; });
                        });
                        const pct = rTotal ? Math.round(rPass / rTotal * 100) : null;
                        return `<div class="flex items-center gap-3 p-3 rounded-lg border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;${state.sharedView ? '' : 'cursor:pointer;'}" ${state.sharedView ? '' : `data-onclick="viewDoc('${run.id}')"`} data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                            <i class="fa-solid fa-play-circle text-sm shrink-0" style="color:var(--c-testrun);"></i>
                            <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(run.title)}</span>
                            <span class="text-xs font-mono font-semibold" style="color:${pct === null ? 'var(--tx-d)' : pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'};">${pct !== null ? pct + '%' : '—'}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
            ${linkedBugs.length ? `
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Bug Reports (${linkedBugs.length})</p>
                <div class="space-y-2">
                    ${linkedBugs.map(bug => `
                    <div class="flex items-center gap-3 p-3 rounded-lg border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;${state.sharedView ? '' : 'cursor:pointer;'}" ${state.sharedView ? '' : `data-onclick="viewDoc('${bug.id}')"`} data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                        <i class="fa-solid fa-bug text-sm shrink-0" style="color:var(--c-bug);"></i>
                        <span class="text-sm font-medium flex-1" style="color:var(--tx);">${escHtml(bug.title)}</span>
                        ${bug.bugData?.severity ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:${sevColor(bug.bugData.severity)}22; color:${sevColor(bug.bugData.severity)};">${escHtml(bug.bugData.severity)}</span>` : ''}
                    </div>`).join('')}
                </div>
            </div>` : ''}
            ${linkedEnvs.length ? `
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Environments (${linkedEnvs.length})</p>
                <div class="flex flex-wrap gap-2">
                    ${linkedEnvs.map(env => `
                    <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;${state.sharedView ? '' : 'cursor:pointer;'}" ${state.sharedView ? '' : `data-onclick="viewDoc('${env.id}')"`} data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                        <i class="fa-solid fa-network-wired text-xs" style="color:var(--c-env);"></i>
                        <span class="text-xs font-medium" style="color:var(--tx);">${escHtml(env.title)}</span>
                        ${env.envData?.status ? `<span class="w-1.5 h-1.5 rounded-full shrink-0 ml-1" style="background:${env.envData.status === 'healthy' ? '#10b981' : env.envData.status === 'down' ? '#ef4444' : '#f59e0b'};"></span>` : ''}
                    </div>`).join('')}
                </div>
            </div>` : ''}
            ${(() => {
                const otherReleases = documents
                    .filter(d => d.category === 'release' && d.status !== 'deleted' && d.id !== doc.id)
                    .sort((a, b) => b.createdAt - a.createdAt);
                const prev = otherReleases[0];
                if (!prev) return '';
                const prevRuns = (prev.releaseData?.linkedRuns || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);
                const prevBugs = (prev.releaseData?.linkedBugs || []).map(id => documents.find(d => d.id === id && d.status !== 'deleted')).filter(Boolean);
                let prevTotal = 0, prevPass = 0;
                prevRuns.forEach(run => {
                    const results = run.runData?.results || {};
                    (run.runData?.targetIds || []).forEach(tcId => {
                        const tc = documents.find(d => d.id === tcId);
                        if (!tc) return;
                        const steps = tc.tcData?.steps || [];
                        prevTotal += steps.length;
                        steps.forEach((_, i) => { if (results[tcId]?.[i] === 'pass') prevPass++; });
                    });
                });
                const prevPct = prevTotal ? Math.round(prevPass / prevTotal * 100) : null;
                const prevCritical = prevBugs.filter(b => b.bugData?.severity === 'Critical').length;
                const deltaPct = (passPct !== null && prevPct !== null) ? passPct - prevPct : null;
                const deltaBugs = linkedBugs.length - prevBugs.length;
                const deltaCrit = criticalBugs - prevCritical;
                const delta = (v, invert) => {
                    if (v === 0) return `<span style="color:var(--tx-d);">±0</span>`;
                    const up = v > 0;
                    const good = invert ? !up : up;
                    return `<span style="color:${good ? '#10b981' : '#ef4444'};">${up ? '+' : ''}${v}</span>`;
                };
                return `
                <div class="mt-4 pt-4 border-t" style="border-color:var(--brd);">
                    <p class="text-[11px] font-medium tracking-wide uppercase mb-3" style="color:var(--tx-d);">vs. Previous Release — <span style="color:var(--tx-m);">${escHtml(prev.releaseData?.version || prev.title)}</span></p>
                    <div class="grid grid-cols-3 gap-3">
                        <div class="p-3 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                            <div class="text-[10px] uppercase tracking-wider mb-1" style="color:var(--tx-d);">Pass Rate</div>
                            <div class="text-lg font-bold font-mono">${passPct !== null ? passPct + '%' : '—'}</div>
                            <div class="text-xs mt-0.5">${deltaPct !== null ? delta(deltaPct) : '<span style="color:var(--tx-d);">—</span>'} vs ${prevPct !== null ? prevPct + '%' : '—'}</div>
                        </div>
                        <div class="p-3 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                            <div class="text-[10px] uppercase tracking-wider mb-1" style="color:var(--tx-d);">Total Bugs</div>
                            <div class="text-lg font-bold font-mono">${linkedBugs.length}</div>
                            <div class="text-xs mt-0.5">${delta(deltaBugs, true)} vs ${prevBugs.length}</div>
                        </div>
                        <div class="p-3 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                            <div class="text-[10px] uppercase tracking-wider mb-1" style="color:var(--tx-d);">Critical Bugs</div>
                            <div class="text-lg font-bold font-mono">${criticalBugs}</div>
                            <div class="text-xs mt-0.5">${delta(deltaCrit, true)} vs ${prevCritical}</div>
                        </div>
                    </div>
                </div>`;
            })()}
            `;
        })()}
        ${doc.content && doc.content.trim() ? `
        <div class="mt-6">
            <p class="text-[11px] font-medium tracking-wide uppercase mb-3" style="color:var(--tx-d);">Release Notes</p>
            <div id="viewer-container" class="p-6 rounded-xl toastui-editor-dark" style="background:var(--card);border:1px solid var(--brd);min-height:100px;"></div>
        </div>` : ''}
        ` : (!doc.content || doc.content.trim() === '' || (doc.category === 'credential' && doc.content.trim() === (TEMPLATES['credential'] || '').trim())) ? '' : `
        <!-- Content -->
        <div id="viewer-container" class="p-6 rounded-xl toastui-editor-dark" style="background:var(--card);border:1px solid var(--brd);min-height:200px;">
        </div>
        `}
        <textarea id="vw-content-hidden" style="display:none;">${escHtml(doc.content)}</textarea>

        <!-- Actions bottom (hidden in shared view) -->
        ${state.sharedView ? '' : `
        <div class="flex items-center gap-3 mt-5">
            <button class="btn-p" data-onclick="editDoc('${doc.id}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
            <button class="btn-s" data-onclick="duplicateDoc('${doc.id}')"><i class="fa-solid fa-copy mr-1.5"></i>${t('duplicate')}</button>
            <button class="btn-d ml-auto" data-onclick="showDeleteModal('${doc.id}')"><i class="fa-solid fa-trash mr-1.5"></i>${t('delete')}</button>
        </div>
        `}
    </div>`;
}

// ========================
// TEST RUN STEP / NOTE ACTIONS
// ========================
window.updateTestRunStep = async function(runDocId, tcId, stepIdx, status) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc || !doc.runData) return;

    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};

    doc.runData.results[tcId][stepIdx] = status;
    doc.updatedAt = Date.now();

    if (state.editingDoc?.id === runDocId) {
        state.editingDoc = { ...doc };
    }

    await persist();
    render();
};

window.updateTestRunNote = async function(runDocId, tcId, note) {
    if (state.sharedView) return;
    const doc = documents.find(d => d.id === runDocId);
    if (!doc || !doc.runData) return;

    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};

    doc.runData.results[tcId].note = note;
    doc.updatedAt = Date.now();

    if (state.editingDoc?.id === runDocId) {
        state.editingDoc = { ...doc };
    }

    await persist();
};
