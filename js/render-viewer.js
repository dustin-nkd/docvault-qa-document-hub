// ========================
// RENDER VIEWER
// ========================
function renderBugTriage(doc) {
    const info = bugTriageInfo(doc);
    const data = doc.bugData || {};
    const statusLabel = {
        pending: t('triageStatusPending'), soon: t('triageStatusSoon'), breached: t('triageStatusBreached'),
        done: t('triageStatusDone'), missed: t('triageStatusMissed'), duplicate: t('triageStatusDuplicate')
    }[info.stateName];
    const slaDetail = info.triagedAt
        ? `${t('triageDecidedAt', { time: fmtDate(info.triagedAt) })} &middot; ${info.outsideSla ? t('triageMissedSla') : t('triageMetSla')}`
        : info.remaining <= 0
            ? t('triageOverdueBy', { time: bugTriageDuration(info.remaining) })
            : t('triageDueIn', { time: bugTriageDuration(info.remaining) });
    const original = info.duplicate
        ? documents.find(candidate => candidate.id === data.duplicateOf && candidate.status !== 'deleted')
        : null;
    const decision = info.duplicate ? t('triageDecisionDuplicate')
        : info.triagedAt ? t('triageDecisionFix')
        : statusLabel;

    return `<section class="bug-triage-card is-${info.stateName}">
        <div class="bug-triage-head">
            <div><h3>${t('triageTitle')}</h3><p>${t('triageCardSub')}</p></div>
            <span class="bug-triage-status is-${info.stateName}">${statusLabel}</span>
        </div>
        <div class="bug-triage-grid">
            <div><span>${t('triageClassification')}</span><b>${escHtml(info.classificationLabel)}</b></div>
            <div><span>${t('triageOwner')}</span><b>${escHtml(data.assignee || t('triageNoOwner'))}</b></div>
            <div><span>${t('triageDeadline')}</span><b>${info.slaHours}h &middot; ${slaDetail}</b></div>
            <div><span>${t('triageDecision')}</span><b>${decision}</b></div>
        </div>
        ${info.missing.length && !info.duplicate ? `<div class="bug-triage-missing">${info.missing.map(item => `<span><i class="fa-solid fa-circle-exclamation"></i>${item}</span>`).join('')}</div>` : ''}
        ${info.duplicate ? `<div class="bug-triage-original">
            <i class="fa-solid fa-copy"></i>
            ${original && !state.sharedView
                ? `<button data-onclick="viewDoc('${original.id}')">${bugRef(original)} &middot; ${escHtml(original.title)}</button>`
                : `<span>${original ? `${bugRef(original)} &middot; ${escHtml(original.title)}` : t('triageDecisionDuplicate')}</span>`}
        </div>` : ''}
        ${state.sharedView ? '' : `<div class="bug-triage-actions">
            <button class="btn-s text-xs" data-onclick="editDoc('${doc.id}')"><i class="fa-solid fa-user-check"></i>${t('triageEdit')}</button>
            ${info.duplicate ? '' : `<button class="btn-s text-xs" data-onclick="promptDuplicateBug('${doc.id}')"><i class="fa-solid fa-copy"></i>${t('triageMarkDuplicate')}</button>`}
        </div>`}
    </section>`;
}

function renderReleaseQualityScorecard(release) {
    const quality = getReleaseQuality(release, documents);
    const previousRelease = documents
        .filter(item => item.category === 'release' && item.status !== 'deleted' && item.id !== release.id && (item.createdAt || 0) < (release.createdAt || 0))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
    const baseline = previousRelease ? getReleaseQuality(previousRelease, documents) : null;
    const deltaScore = baseline ? quality.score - baseline.score : null;
    const band = !quality.hasEvidence ? 'unknown' : quality.score >= 85 ? 'strong' : quality.score >= 70 ? 'watch' : 'risk';
    const bandLabel = {
        strong: t('scoreBandStrong'), watch: t('scoreBandWatch'),
        risk: t('scoreBandRisk'), unknown: t('scoreBandUnknown')
    }[band];
    const deltaHtml = value => value == null
        ? `<span class="score-delta is-flat">${t('scoreNoBaseline')}</span>`
        : `<span class="score-delta ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : 'is-flat'}">${value > 0 ? '+' : ''}${value}</span>`;
    const dimensions = [
        { key: 'passRate', label: t('scorePassRate'), value: quality.passRate, max: 100, weight: QUALITY_SCORE_WEIGHTS.passRate },
        { key: 'execution', label: t('scoreExecution'), value: quality.execution, max: 100, weight: QUALITY_SCORE_WEIGHTS.execution },
        { key: 'coverage', label: t('scoreCoverage'), value: quality.coverage, max: 100, weight: QUALITY_SCORE_WEIGHTS.coverage },
        { key: 'defectPoints', label: t('scoreDefects'), value: quality.defectPoints, max: QUALITY_SCORE_WEIGHTS.defects, weight: QUALITY_SCORE_WEIGHTS.defects }
    ];
    const driverCandidates = baseline ? dimensions.map(item => {
        const previous = Number(baseline[item.key]) || 0;
        const current = Number(quality[item.key]) || 0;
        const contribution = item.key === 'defectPoints'
            ? current - previous
            : (current - previous) * item.weight / 100;
        return { ...item, previous, current, contribution };
    }).filter(item => Math.abs(item.contribution) >= .5).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 2) : [];
    const baselineModules = new Map((baseline?.modules || []).map(item => [_qualityModuleKey(item.name), item]));

    return `<section class="quality-scorecard">
        <div class="quality-score-head">
            <div>
                <h3>${t('scoreTitle')}</h3>
                <p>${t('scoreSub')}</p>
            </div>
            <span class="quality-baseline">
                <b>${t('scoreBaseline')}</b>
                ${previousRelease ? escHtml(previousRelease.releaseData?.version || previousRelease.title) : t('scoreFirstRelease')}
            </span>
        </div>
        <div class="quality-score-overview">
            <div class="quality-score-value is-${band}">
                <strong>${quality.score}</strong><span>/100</span>
                <em>${bandLabel}</em>
            </div>
            <div class="quality-score-summary">
                <span>${t('scoreVsBaseline')}</span>
                <div>${deltaHtml(deltaScore)}<b>${baseline ? `${baseline.score}/100` : t('scoreNoBaseline')}</b></div>
                <small>${quality.source === 'snapshot' && quality.capturedAt ? t('scoreFrozen', { time: fmtDate(quality.capturedAt) }) : t('scoreLive')}</small>
            </div>
            <div class="quality-drivers">
                <span>${t('scoreDrivers')}</span>
                ${driverCandidates.length ? driverCandidates.map(item => `<b class="${item.contribution > 0 ? 'is-up' : 'is-down'}">
                    <i class="fa-solid ${item.contribution > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
                    ${item.label} ${item.contribution > 0 ? '+' : ''}${Math.round(item.contribution)}
                </b>`).join('') : `<small>${baseline ? t('scoreStable') : t('scoreNeedsBaseline')}</small>`}
            </div>
        </div>
        <div class="quality-dimensions">
            ${dimensions.map(item => {
                const pct = Math.max(0, Math.min(100, item.value / item.max * 100));
                const display = item.key === 'defectPoints' ? `${item.value}/${item.max}` : `${item.value}%`;
                return `<div>
                    <span>${item.label}<em>${t('scoreWeight', { value: item.weight })}</em></span>
                    <b>${display}</b>
                    <i><u style="width:${pct}%"></u></i>
                </div>`;
            }).join('')}
        </div>
        <div class="quality-modules">
            <div class="quality-modules-head"><b>${t('scoreModules')}</b><span>${t('scoreModulesSub')}</span></div>
            ${quality.modules.length ? quality.modules.map(module => {
                const previous = baselineModules.get(_qualityModuleKey(module.name));
                const moduleDelta = previous ? module.score - previous.score : null;
                return `<div class="quality-module-row">
                    <strong>${escHtml(module.name)}</strong>
                    <span class="quality-module-score">${module.score}<small>/100</small>${deltaHtml(moduleDelta)}</span>
                    <span><b>${module.passRate}%</b><small>${t('scorePassRate')}</small></span>
                    <span><b>${module.execution}%</b><small>${t('scoreExecution')}</small></span>
                    <span><b>${module.coverage}%</b><small>${t('scoreCoverage')}</small></span>
                    <span><b>${module.openBugs}</b><small>${t('scoreOpenBugs')}</small></span>
                </div>`;
            }).join('') : `<div class="quality-empty">${t('scoreNoModules')}</div>`}
        </div>
    </section>`;
}

function renderViewer() {
    const doc = documents.find(d => d.id === state.editingDoc?.id);
    if (!doc) return `<div class="text-center py-20" style="color:var(--tx-d);">Document not found.</div>`;

    return `<div class="fade-up max-w-4xl mx-auto">
        <!-- Meta -->
        <div class="flex flex-wrap items-center gap-2.5 mb-4">
            <span class="cat-badge ${getCatMeta(doc.category).cls}">${getCatMeta(doc.category).label}</span>
            ${doc.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(doc.subfolder)}</span>` : ''}
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
            if (state.sharedView || doc.category !== 'testcases') return '';
            // A bug can reference this test case either manually (bugData.linkedTc,
            // Sprint 16) or automatically via "Report bug from step" (bugData.foundInTc,
            // B1) — show both kinds together, most recent first.
            const linkedBugs = documents.filter(d => d.category === 'bug' && d.status !== 'deleted'
                && (d.bugData?.linkedTc === doc.id || d.bugData?.foundInTc === doc.id))
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
            if (!linkedBugs.length) return '';
            const SEV = { Critical: '#ef4444', Major: '#f97316', Minor: '#f59e0b', Trivial: '#94a3b8' };
            return `
            <div class="mb-6">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Bugs (${linkedBugs.length})</p>
                <div class="space-y-2">
                    ${linkedBugs.map(b => {
                        const sev = b.bugData?.severity;
                        return `<div class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer" style="background:var(--bg);border-color:var(--brd);transition:background .15s;" data-onclick="viewDoc('${b.id}')" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'">
                            <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0" style="background:var(--card);color:var(--c-bug);">${bugRef(b)}</span>
                            <span class="text-sm font-medium flex-1 truncate" style="color:var(--tx);">${escHtml(b.title)}</span>
                            ${sev ? `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style="background:${(SEV[sev] || '#94a3b8')}22;color:${SEV[sev] || '#94a3b8'};">${escHtml(sev)}</span>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        })()}

        ${doc.category === 'bug' ? (() => {
            const SEV = { Critical: '#ef4444', Major: '#f97316', Minor: '#f59e0b', Trivial: '#94a3b8' };
            const sev = doc.bugData?.severity;
            const prio = doc.bugData?.priority;
            const prioColor = (typeof PRIO_COLOR !== 'undefined' && PRIO_COLOR[prio]) || '#94a3b8';
            const ref = bugRef(doc);
            return `
        <div class="mb-6 flex flex-wrap items-center gap-2">
            ${ref ? `<span class="font-mono text-sm font-bold px-2.5 py-1 rounded" style="background:var(--card);border:1px solid var(--brd);color:var(--c-bug);">${ref}</span>` : ''}
            ${sev ? `<span class="text-[11px] font-bold px-2 py-1 rounded" style="background:${(SEV[sev] || '#94a3b8')}20;color:${SEV[sev] || '#94a3b8'};">${escHtml(sev)}</span>` : ''}
            ${prio ? `<span class="text-[11px] font-bold px-2 py-1 rounded" style="background:${prioColor}20;color:${prioColor};" title="Priority">${escHtml(prio)}</span>` : ''}
            ${doc.bugData?.assignee ? `<span class="text-xs flex items-center gap-1.5" style="color:var(--tx-m);"><i class="fa-solid fa-user" style="font-size:10px;"></i>${escHtml(doc.bugData.assignee)}</span>` : ''}
            ${(() => {
                const runId = doc.bugData?.foundInRun;
                if (!runId || state.sharedView) return '';
                const run = documents.find(d => d.id === runId && d.status !== 'deleted');
                if (!run) return '';
                return `<button class="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded" style="background:rgba(99,102,241,0.1);color:#818cf8;" data-onclick="viewDoc('${run.id}')" title="Open the test run this bug was found in"><i class="fa-solid fa-play-circle" style="font-size:10px;"></i>Found in: ${escHtml(run.title)}</button>`;
            })()}
            ${(() => {
                if (state.sharedView || !doc.bugData?.linkedTc) return '';
                const tc = documents.find(d => d.id === doc.bugData.linkedTc && d.status !== 'deleted');
                if (!tc) return '';
                return `<button class="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded" style="background:rgba(245,158,11,0.1);color:var(--c-tc);" data-onclick="viewDoc('${tc.id}')" title="Open the linked test case"><i class="fa-solid fa-flask-vial" style="font-size:10px;"></i>Linked TC: ${escHtml(tc.title)}</button>`;
            })()}
            ${(() => {
                if (state.sharedView || doc.bugData?.resolution !== 'duplicate' || !doc.bugData?.duplicateOf) return '';
                const original = documents.find(d => d.id === doc.bugData.duplicateOf && d.status !== 'deleted');
                if (!original) return '<span class="text-[11px] px-2 py-1 rounded" style="background:rgba(148,163,184,0.1);color:var(--tx-d);"><i class="fa-solid fa-copy mr-1"></i>Duplicate of a removed bug</span>';
                return `<button class="text-[11px] flex items-center gap-1.5 px-2 py-1 rounded" style="background:rgba(148,163,184,0.15);color:var(--tx-m);" data-onclick="viewDoc('${original.id}')" title="Open the original bug"><i class="fa-solid fa-copy" style="font-size:10px;"></i>Duplicate of: ${bugRef(original)} ${escHtml(original.title)}</button>`;
            })()}
        </div>`;
        })() : ''}

        ${doc.category === 'bug' ? renderBugTriage(doc) : ''}

        ${doc.category === 'credential' ? `
        <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
            ${(() => {
                const info = credRotationInfo(doc);
                if (!info.stale) return '';
                return `<div class="flex items-center justify-between gap-3 mb-4 p-3 rounded-lg" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);">
                    <div class="flex items-center gap-2 min-w-0">
                        <i class="fa-solid fa-triangle-exclamation shrink-0" style="color:#f59e0b;"></i>
                        <span class="text-xs" style="color:var(--tx);">Not rotated in <strong>${info.ageDays} days</strong> — consider updating this credential.</span>
                    </div>
                    ${state.sharedView ? '' : `<button class="btn-s text-xs py-1 px-2.5 shrink-0" data-onclick="markCredentialRotated('${doc.id}')"><i class="fa-solid fa-rotate mr-1"></i>Mark as Rotated</button>`}
                </div>`;
            })()}
            <div class="mb-4">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Username / Email</p>
                <div class="flex items-center gap-3">
                    <div class="cred-avatar ${credAvatarColor(doc.title)} shrink-0">
                        <img class="cred-favicon" src="https://icons.duckduckgo.com/ip3/${encodeURIComponent(guessDomain(doc.title))}.ico" onload="this.classList.add('loaded'); this.nextElementSibling.style.display='none'; this.parentElement.classList.add('has-favicon');" onerror="this.style.display='none'">
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

        ${doc.category === 'api' ? `
        ${(() => {
            const api = doc.apiData || {};
            const method = api.method || 'GET';
            const methodColor = { GET: '#10b981', POST: '#6366f1', PUT: '#f97316', PATCH: '#f59e0b', DELETE: '#ef4444' }[method] || '#60a5fa';
            const statusCode = api.statusCode || '200';
            const statusNum = parseInt(statusCode);
            const statusColor = statusNum < 300 ? '#10b981' : statusNum < 400 ? '#60a5fa' : statusNum < 500 ? '#f97316' : '#ef4444';
            const headers = (api.headers || []).filter(h => h.key);
            const params = (api.params || []).filter(p => p.key);
            return `
            <div class="mb-6 rounded-xl overflow-hidden" style="border:1px solid var(--brd);">

                <!-- Method + Endpoint + Status header bar -->
                <div class="flex items-center gap-3 px-4 py-3" style="background:var(--card);border-bottom:1px solid var(--brd);">
                    <span class="text-xs font-bold px-2.5 py-1 rounded font-mono shrink-0" style="background:${methodColor}22;color:${methodColor};letter-spacing:.03em;">${escHtml(method)}</span>
                    <span class="font-mono text-sm flex-1 truncate" style="color:var(--tx);">${escHtml(api.endpoint || '/')}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded font-mono shrink-0" style="background:${statusColor}22;color:${statusColor};">${escHtml(statusCode)}</span>
                </div>
                ${(api.module || ['low', 'medium', 'high'].includes(api.changeImpact)) ? `
                <div class="api-impact-view">
                    ${api.module ? `<span><b>${t('impactModule')}:</b> ${escHtml(api.module)}</span>` : ''}
                    ${['low', 'medium', 'high'].includes(api.changeImpact) ? `<span class="impact-level is-${api.changeImpact}">${t(`apiImpact${api.changeImpact[0].toUpperCase()}${api.changeImpact.slice(1)}`)}</span>` : ''}
                    ${api.changedAt ? `<span><b>${t('impactChanged')}:</b> ${fmtDate(api.changedAt)}</span>` : ''}
                </div>` : ''}

                <!-- Try it: send a live request from the browser -->
                <div class="flex items-center gap-2 px-4 py-3 flex-wrap" style="background:var(--bg2);border-bottom:1px solid var(--brd);">
                    <input id="api-tryit-baseurl" type="text" class="form-input text-xs font-mono flex-1" style="min-width:200px;" placeholder="https://api.example.com (base URL)" value="${escHtml(localStorage.getItem('docvault_api_tryit_baseurl') || API_TRYIT_MOCK_BASE)}" data-onchange="saveApiTryitBaseUrl(this.value)">
                    <button id="api-tryit-btn" class="btn-p text-xs py-1.5 px-3 shrink-0" data-onclick="tryApiRequest('${doc.id}')" title="Send a request using this base URL + the endpoint/headers/params/body above"><i class="fa-solid fa-play mr-1.5"></i>Try it</button>
                    <p class="text-[11px] w-full" style="color:var(--tx-d);">Prefilled with a built-in mock server (no real network call) so you can try this out. Point it at a real base URL to send an actual request.</p>
                </div>
                <div id="api-tryit-result"></div>

                <div class="p-5">
                    ${(headers.length || params.length) ? `
                    <!-- REQUEST section label -->
                    <div class="flex items-center gap-3 mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Request</span>
                        <div class="flex-1" style="height:1px;background:var(--brd);"></div>
                    </div>

                    <!-- Headers + Params -->
                    <div class="grid ${headers.length && params.length ? 'sm:grid-cols-2' : 'grid-cols-1'} gap-4 mb-5">
                        ${headers.length ? `
                        <div>
                            <p class="text-[11px] font-medium mb-2" style="color:var(--tx-m);">Headers</p>
                            <div class="rounded-lg overflow-hidden" style="border:1px solid var(--brd);">
                                ${headers.map((h, i) => `
                                <div class="flex items-baseline gap-3 px-3 py-2 font-mono text-xs" style="background:${i % 2 === 0 ? 'var(--card)' : 'transparent'};">
                                    <span class="shrink-0 font-medium" style="color:var(--tx-d);min-width:100px;word-break:break-all;">${escHtml(h.key)}${h.req ? '<span style="color:#f97316;margin-left:2px;">*</span>' : ''}</span>
                                    <span style="color:var(--tx);word-break:break-all;">${escHtml(h.value || '—')}</span>
                                </div>`).join('')}
                            </div>
                        </div>` : ''}
                        ${params.length ? `
                        <div>
                            <p class="text-[11px] font-medium mb-2" style="color:var(--tx-m);">Query Parameters</p>
                            <div class="rounded-lg overflow-hidden" style="border:1px solid var(--brd);">
                                ${params.map((p, i) => `
                                <div class="flex items-baseline gap-3 px-3 py-2 font-mono text-xs" style="background:${i % 2 === 0 ? 'var(--card)' : 'transparent'};">
                                    <span class="shrink-0 font-medium" style="color:var(--tx-d);min-width:100px;word-break:break-all;">${escHtml(p.key)}${p.req ? '<span style="color:#f97316;margin-left:2px;">*</span>' : ''}</span>
                                    <span style="color:var(--tx);word-break:break-all;">${escHtml(p.value || '—')}</span>
                                </div>`).join('')}
                            </div>
                        </div>` : ''}
                    </div>` : ''}

                    ${api.body ? `
                    ${!(headers.length || params.length) ? `
                    <div class="flex items-center gap-3 mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Request</span>
                        <div class="flex-1" style="height:1px;background:var(--brd);"></div>
                    </div>` : ''}
                    <div class="mb-5">
                        <p class="text-[11px] font-medium mb-2" style="color:var(--tx-m);">Body</p>
                        <pre id="viewer-api-body" class="text-xs p-3 rounded-lg overflow-x-auto custom-scrollbar" style="position:relative;background:var(--card);border:1px solid var(--brd);color:var(--tx);font-family:monospace;white-space:pre-wrap;word-break:break-all;margin:0;"><button class="code-copy-btn" data-onclick="_copyPre('viewer-api-body', this)" title="Copy"><i class="fa-regular fa-copy"></i></button>${escHtml(api.body)}</pre>
                    </div>` : ''}

                    <!-- RESPONSE section label -->
                    <div class="flex items-center gap-3 mb-3">
                        <span class="text-[10px] font-bold uppercase tracking-widest shrink-0" style="color:var(--tx-d);">Response</span>
                        <div class="flex-1" style="height:1px;background:var(--brd);"></div>
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded font-mono shrink-0" style="background:${statusColor}22;color:${statusColor};">${escHtml(statusCode)}</span>
                    </div>
                    ${api.response
                        ? `<pre id="viewer-api-response" class="text-xs p-3 rounded-lg overflow-x-auto custom-scrollbar" style="position:relative;background:var(--card);border:1px solid var(--brd);color:var(--tx);font-family:monospace;white-space:pre-wrap;word-break:break-all;margin:0;"><button class="code-copy-btn" data-onclick="_copyPre('viewer-api-response', this)" title="Copy"><i class="fa-regular fa-copy"></i></button>${escHtml(api.response)}</pre>`
                        : `<p class="text-xs py-2" style="color:var(--tx-d);">No response body defined.</p>`}
                </div>
            </div>`;
        })()}
        ` : ''}

        ${doc.category === 'testrun' ? `
        <!-- Test Run Execution UI -->
        ${(() => {
            const results = doc.runData?.results || {};
            const targetIds = doc.runData?.targetIds || [];
            const targets = documents.filter(d => targetIds.includes(d.id) && d.status !== 'deleted');
            // Render against the step snapshot captured when the run was saved (US-103),
            // so results stay aligned even if the test case is edited afterwards.
            const stepsOf = tc => (doc.runData?.snapshot?.[tc.id] || tc.tcData?.steps || []);
            const isDrifted = tc => !!doc.runData?.snapshot?.[tc.id]
                && JSON.stringify(doc.runData.snapshot[tc.id]) !== JSON.stringify(tc.tcData?.steps || []);

            let totalSteps = 0;
            let passCount = 0;
            let failCount = 0;
            let blockedCount = 0;

            targets.forEach(tc => {
                const steps = stepsOf(tc);
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

            // Test Cycle & Trend (B2): runs sharing a cycle (this run's own id is the
            // cycle root the first time it's re-run) sorted chronologically, so a
            // trend of pass-rate across executions can be shown.
            const cycleId = doc.runData?.cycleId || doc.id;
            const cycleRuns = documents.filter(d => d.category === 'testrun' && d.status !== 'deleted' && (d.runData?.cycleId || d.id) === cycleId)
                .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

            let html = `
            ${(doc.runData?.environment || !state.sharedView) ? `<div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
                ${doc.runData?.environment ? `<span class="text-xs flex items-center gap-1.5 px-2 py-1 rounded" style="background:rgba(99,102,241,0.1);color:#818cf8;" title="Environment / Build"><i class="fa-solid fa-server" style="font-size:10px;"></i>${escHtml(doc.runData.environment)}</span>` : '<span></span>'}
                ${state.sharedView ? '' : `<div class="flex items-center gap-2 ml-auto">
                    <button class="btn-s text-xs flex items-center gap-1.5" data-onclick="rerunTestRun('${doc.id}')" title="Start a fresh execution of the same test cases"><i class="fa-solid fa-rotate" style="font-size:11px;"></i> Re-run</button>
                    <button class="btn-s text-xs flex items-center gap-1.5" data-onclick="exportTestRunCsv('${doc.id}')" title="Export results to CSV"><i class="fa-solid fa-file-csv" style="font-size:11px;"></i> Export CSV</button>
                </div>`}
            </div>` : ''}
            ${cycleRuns.length > 1 ? `
            <div class="mb-5 p-4 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
                <p class="text-[11px] font-bold uppercase tracking-wider mb-3" style="color:var(--tx-d);"><i class="fa-solid fa-chart-line mr-1.5" style="color:#818cf8;"></i>Pass Rate Trend — ${cycleRuns.length} executions</p>
                <div class="flex items-end gap-2" style="height:64px;">
                    ${cycleRuns.map(r => {
                        const isCurrent = r.id === doc.id;
                        const rResults = r.runData?.results || {};
                        const rTargets = r.runData?.targetIds || [];
                        let rTotal = 0, rPass = 0;
                        rTargets.forEach(tcId => {
                            const steps = r.runData?.snapshot?.[tcId] || [];
                            rTotal += steps.length;
                            steps.forEach((_, i) => { if (rResults[tcId]?.[i] === 'pass') rPass++; });
                        });
                        const pct = rTotal ? Math.round(rPass / rTotal * 100) : 0;
                        const color = rTotal === 0 ? 'var(--brd-l)' : pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
                        return `<div class="flex-1 flex flex-col items-center justify-end gap-1 cursor-pointer" title="${escHtml(r.title)} — ${rTotal ? pct + '%' : 'no results'}" data-onclick="viewDoc('${r.id}')">
                            <span class="text-[10px] font-bold" style="color:${color};">${rTotal ? pct + '%' : '—'}</span>
                            <div style="width:100%;max-width:28px;height:${Math.max(4, pct * 0.4)}px;background:${color};border-radius:3px 3px 0 0;${isCurrent ? 'outline:2px solid #fff3;outline-offset:1px;' : ''}"></div>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
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
                    const steps = stepsOf(tc);
                    const drifted = isDrifted(tc);
                    const tcNote = doc.runData?.results?.[tc.id]?.note || '';
                    html += `
                    <div class="rounded-xl overflow-hidden" style="border:1px solid var(--brd);">
                        <div class="px-4 py-3 flex items-center gap-3" style="background:var(--bg2); border-bottom:1px solid var(--brd);">
                            <span class="w-2 h-2 rounded-full shrink-0" style="background:var(--c-tc);"></span>
                            <span class="font-medium text-sm" style="color:var(--tx);">${escHtml(tc.title)}</span>
                            ${drifted ? `<span class="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style="background:rgba(245,158,11,0.12);color:#f59e0b;" title="This test case was edited after this run was recorded. Results reflect the steps at run time."><i class="fa-solid fa-triangle-exclamation" style="font-size:8px;"></i> TC changed</span>` : ''}
                            ${state.sharedView ? '' : `<button class="btn-s text-xs ml-auto" data-onclick="viewDoc('${tc.id}')" title="View Test Case"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>`}
                        </div>
                        <div class="bg-transparent p-4">
                            ${steps.length === 0 ? `<div class="text-xs" style="color:var(--tx-m);">No steps defined.</div>` :
                            steps.map((step, idx) => {
                                const status = results[tc.id]?.[idx] || 'untested';
                                const statusColors = { pass: '#10b981', fail: '#ef4444', blocked: '#f59e0b', untested: 'var(--tx-d)' };
                                const statusLabels = { pass: '<i class="fa-solid fa-check mr-1"></i>Pass', fail: '<i class="fa-solid fa-xmark mr-1"></i>Fail', blocked: '<i class="fa-solid fa-ban mr-1"></i>Blocked', untested: 'Untested' };
                                // B1: a bug already reported from this exact step, if any
                                const linkedBug = documents.find(b => b.category === 'bug' && b.status !== 'deleted' && b.bugData && b.bugData.foundInRun === doc.id && b.bugData.foundInTc === tc.id && b.bugData.foundInStep === idx);
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
                                        <div class="shrink-0 flex flex-col items-end gap-1.5">
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
                                            ${!state.sharedView && status === 'fail' ? (linkedBug
                                                ? `<button class="text-[10px] font-semibold px-2 py-0.5 rounded-full" style="background:rgba(239,68,68,0.12);color:#f87171;" data-onclick="viewDoc('${linkedBug.id}')" title="View linked bug"><i class="fa-solid fa-bug mr-1" style="font-size:9px;"></i>${bugRef(linkedBug)}</button>`
                                                : `<button class="text-[10px] font-semibold px-2 py-1 rounded" style="background:rgba(239,68,68,0.1);color:#f87171;border:1px solid rgba(239,68,68,0.2);" data-onclick="reportBugFromStep('${doc.id}','${tc.id}',${idx})"><i class="fa-solid fa-bug mr-1" style="font-size:9px;"></i>Report bug</button>`
                                            ) : ''}
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
            const readiness = evaluateReleaseReadiness(doc, documents); const linkedRuns = readiness.linkedRuns;
            const linkedBugs = readiness.linkedBugs;
            const linkedEnvs = readiness.linkedEnvs;

            const passPct = readiness.metrics.passRate;
            const criticalBugs = readiness.metrics.critical;
            const sevColor = s => s === 'Critical' ? '#ef4444' : s === 'Major' ? '#f97316' : s === 'Minor' ? '#f59e0b' : '#7a8ba8';

            const statusStyle = s => ({
                released: { bg: '#10b98122', color: '#10b981', border: '#10b98155', label: '🚀 Released' },
                'in-progress': { bg: '#6366f122', color: '#6366f1', border: '#6366f155', label: '🔨 In Progress' },
                cancelled: { bg: '#ef444422', color: '#ef4444', border: '#ef444455', label: '❌ Cancelled' },
                planning: { bg: 'rgba(122,139,168,0.12)', color: 'var(--tx-m)', border: 'var(--brd)', label: '📋 Planning' }
            }[s] || { bg: 'rgba(122,139,168,0.12)', color: 'var(--tx-m)', border: 'var(--brd)', label: '📋 Planning' });

            const st = statusStyle(doc.releaseData?.status);

            const cockpitGate = ({
                go: { label: 'GO', color: '#10b981', bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.4)', icon: 'fa-circle-check', detail: 'All required release evidence passes policy.' },
                'go-with-risk': { label: 'GO WITH RISK', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', icon: 'fa-triangle-exclamation', detail: 'A documented exception overrides automatic blockers.' },
                'no-go': { label: 'NO-GO', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.4)', icon: 'fa-circle-xmark', detail: readiness.manualDecision === 'no-go' ? 'Release is manually held with a documented reason.' : `${readiness.blockers.length} release condition${readiness.blockers.length === 1 ? '' : 's'} need attention.` },
                insufficient: { label: 'INSUFFICIENT EVIDENCE', color: 'var(--tx-d)', bg: 'rgba(122,139,168,0.12)', border: 'var(--brd)', icon: 'fa-circle-question', detail: 'Link and execute test evidence before making a release decision.' }
            })[readiness.outcome];
            const checkCopy = check => ({
                evidence: ['Test evidence', `${check.value} linked test run${check.value === 1 ? '' : 's'}`],
                'pass-rate': ['Pass rate threshold', check.value == null ? `No measurable result &middot; target ${check.threshold}%` : `${check.value}% &middot; target ${check.threshold}%`],
                execution: ['Execution completeness', `${check.value}/${check.total} steps executed`],
                defects: ['Defect policy', `${check.critical} Critical &middot; ${check.major} Major open`],
                environments: ['Environment health', readiness.policy.requireHealthyEnvironments ? `${check.unhealthy} unhealthy of ${check.value}` : 'Not required by policy']
            })[check.id];
            const decisionLog = Array.isArray(doc.releaseData?.decisionLog) ? doc.releaseData.decisionLog : [];

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
                <div class="release-cockpit-outcome mb-4" style="background:${cockpitGate.bg};border-color:${cockpitGate.border};">
                    <i class="fa-solid ${cockpitGate.icon}" style="color:${cockpitGate.color};"></i>
                    <div class="flex-1 min-w-0">
                        <strong style="color:${cockpitGate.color};">${cockpitGate.label}</strong>
                        <span>${cockpitGate.detail}</span>
                    </div>
                </div>
                ${readiness.decisionReason ? `<div class="release-decision-reason"><i class="fa-solid fa-quote-left"></i><span>${escHtml(readiness.decisionReason)}</span></div>` : ''}
                <div class="release-checklist mb-4">
                    ${readiness.checks.map(check => {
                        const copy = checkCopy(check);
                        const icon = check.status === 'pass' ? 'fa-circle-check' : check.status === 'fail' ? 'fa-circle-xmark' : 'fa-circle-question';
                        const sourceId = check.docIds?.[0];
                        return `<div class="release-check is-${check.status}">
                            <i class="fa-solid ${icon}"></i>
                            <span class="min-w-0 flex-1"><b>${copy[0]}</b><small>${copy[1]}</small></span>
                            ${sourceId && !state.sharedView ? `<button data-onclick="viewDoc('${sourceId}')" title="Open source evidence"><i class="fa-solid fa-arrow-up-right-from-square"></i>${check.docIds.length > 1 ? `<em>+${check.docIds.length - 1}</em>` : ''}</button>` : ''}
                        </div>`;
                    }).join('')}
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Test Runs</div>
                        <div class="text-2xl font-bold" style="color:var(--c-rel);">${linkedRuns.length}</div>
                    </div>
                    <div class="p-3 rounded-lg text-center" style="background:var(--card);border:1px solid var(--brd);">
                        <div class="text-[11px] uppercase tracking-wider mb-1" style="color:var(--tx-m);">Pass Rate</div>
                        <div class="text-2xl font-bold" style="color:${passPct === null ? 'var(--tx-d)' : passPct >= readiness.policy.minPassRate ? '#10b981' : passPct >= 50 ? '#f59e0b' : '#ef4444'};">${passPct !== null ? passPct + '%' : '—'}</div>
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
                ${decisionLog.length ? `<div class="release-decision-log">
                    <p>Decision history</p>
                    ${decisionLog.slice(0, 3).map(entry => `<div>
                        <span>${entry.decision === 'go-with-risk' ? 'GO WITH RISK' : entry.decision === 'no-go' ? 'NO-GO' : 'AUTOMATIC'}</span>
                        <small>${fmtDate(entry.ts)} &middot; ${escHtml(entry.reason || '')}</small>
                    </div>`).join('')}
                </div>` : ''}
            </div>
            ${renderReleaseQualityScorecard(doc)}

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
                return ''; // Superseded by the explainable release quality scorecard above.
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
        ` : (doc.category === 'api' || !doc.content || doc.content.trim() === '' || (doc.category === 'credential' && doc.content.trim() === (TEMPLATES['credential'] || '').trim())) ? '' : `
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
    // Only the viewer content changes on a step result — a full render() would
    // needlessly rebuild the sidebar and header on every Pass/Fail click.
    renderContent();
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
