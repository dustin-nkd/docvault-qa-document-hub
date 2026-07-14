// ========================
// TRENDS (B1 + B2) — quality over time, drawn client-side from stored data
// ========================
window.setTrendsRange = function(days) { state.trendsRange = days; renderContent(); };

// bucket a list of timestamps into n equal time-slots over [start, end]
function _trendBuckets(timestamps, start, end, n) {
    const counts = new Array(n).fill(0);
    const span = Math.max(end - start, 1);
    timestamps.forEach(ts => {
        let i = Math.floor((ts - start) / span * n);
        if (i < 0) i = 0; if (i >= n) i = n - 1;
        counts[i]++;
    });
    return counts;
}

// Compact "13 Apr" axis date — mirrors fmtDate()'s own use of a fixed en-US
// locale for the long-date fallback, so chart axes stay consistent with the
// rest of the app's date formatting rather than introducing a second style.
function _axisDate(ts) {
    const d = new Date(ts);
    if (!ts || isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// Shared chart canvas: reserves a left gutter for Y-axis value labels and a
// bottom strip for X-axis date labels, so every trend chart can be read
// without relying solely on the prose caption below it.
const _CHART_W = 300, _CHART_H = 118, _CHART_PAD_L = 28, _CHART_PAD_R = 8, _CHART_TOP = 10, _CHART_BOT = _CHART_H - 26;

function _chartYGrid(values, y, fmt) {
    return values.map(v => `
        <line x1="${_CHART_PAD_L}" y1="${y(v).toFixed(1)}" x2="${_CHART_W - _CHART_PAD_R}" y2="${y(v).toFixed(1)}" stroke="var(--brd)" stroke-dasharray="${v === 0 ? '0' : '2 3'}" opacity="${v === 0 ? '1' : '0.6'}"/>
        <text x="${_CHART_PAD_L - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="var(--tx-d)">${fmt(v)}</text>`).join('');
}

function _chartXAxis(xLabels) {
    if (!xLabels) return '';
    return `
        <text x="${_CHART_PAD_L}" y="${_CHART_H - 6}" text-anchor="start" font-size="8" fill="var(--tx-d)">${xLabels[0]}</text>
        <text x="${_CHART_W - _CHART_PAD_R}" y="${_CHART_H - 6}" text-anchor="end" font-size="8" fill="var(--tx-d)">${xLabels[1]}</text>`;
}

// minimal, theme-aware SVG line (optional area fill) + emphasized endpoint.
// yFmt formats axis/tooltip values (e.g. add "%"); xLabels are [start, end]
// date strings shown under the chart so the time span is never a guess.
function _trendLine(vals, color, { yMax, fill, yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP, bot = _CHART_BOT;
    const max = yMax != null ? yMax : Math.max(...vals, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = vals.length;
    const x = i => _CHART_PAD_L + (n === 1 ? (w - _CHART_PAD_L - _CHART_PAD_R) / 2 : i * (w - _CHART_PAD_L - _CHART_PAD_R) / (n - 1));
    const y = v => top + (1 - v / max) * (bot - top);
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const li = n - 1;
    const area = fill ? `<polygon points="${x(0).toFixed(1)},${bot} ${pts} ${x(li).toFixed(1)},${bot}" fill="${color}" opacity="0.14"/>` : '';
    const grid = _chartYGrid([max, max / 2, 0], y, fmt);
    const markers = vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === li ? 3.6 : 2.2}" fill="${color}" opacity="${i === li ? 1 : 0.55}"><title>${fmt(v)}</title></circle>`).join('');
    return `<svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
        ${grid}
        ${area}
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
        ${markers}
        <circle cx="${x(li).toFixed(1)}" cy="${y(vals[li]).toFixed(1)}" r="7" fill="${color}" opacity="0.18"/>
        ${_chartXAxis(xLabels)}
    </svg>`;
}

function _trendDualLine(valsA, valsB, colorA, colorB, { yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP, bot = _CHART_BOT;
    const max = Math.max(...valsA, ...valsB, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = Math.max(valsA.length, valsB.length);
    const x = i => _CHART_PAD_L + (n === 1 ? (w - _CHART_PAD_L - _CHART_PAD_R) / 2 : i * (w - _CHART_PAD_L - _CHART_PAD_R) / (n - 1));
    const y = v => top + (1 - v / max) * (bot - top);
    const points = vals => vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const markers = (vals, color) => vals.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${i === vals.length - 1 ? 3.4 : 2}" fill="${color}" opacity="${i === vals.length - 1 ? 1 : 0.55}"><title>${fmt(v)}</title></circle>`).join('');
    const grid = _chartYGrid([max, max / 2, 0], y, fmt);
    return `<div>
        <svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
            ${grid}
            <polyline points="${points(valsA)}" fill="none" stroke="${colorA}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
            <polyline points="${points(valsB)}" fill="none" stroke="${colorB}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
            ${markers(valsA, colorA)}
            ${markers(valsB, colorB)}
            ${_chartXAxis(xLabels)}
        </svg>
        <div class="trend-dual-legend">
            <span><i style="background:${colorA};"></i>${t('trOpened')}</span>
            <span><i style="background:${colorB};"></i>${t('trResolved')}</span>
        </div>
    </div>`;
}

function _trendBars(vals, color, { yFmt, xLabels } = {}) {
    const w = _CHART_W, top = _CHART_TOP + 4, bot = _CHART_BOT;
    const max = Math.max(...vals, 1);
    const fmt = yFmt || (v => String(Math.round(v)));
    const n = vals.length, gap = n > 12 ? 2 : 4;
    const bw = (w - _CHART_PAD_L - _CHART_PAD_R - (n - 1) * gap) / n;
    const bars = vals.map((v, i) => {
        const bh = (v / max) * (bot - top);
        const bx = _CHART_PAD_L + i * (bw + gap);
        const label = v > 0 ? `<text x="${(bx + bw / 2).toFixed(1)}" y="${(bot - bh - 4).toFixed(1)}" text-anchor="middle" font-size="8" fill="var(--tx-d)">${fmt(v)}</text>` : '';
        return `<g><rect x="${bx.toFixed(1)}" y="${(bot - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${color}" opacity="${i === n - 1 ? '1' : '0.55'}"><title>${fmt(v)}</title></rect>${label}</g>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${_CHART_H}" style="width:100%;height:auto;display:block;" preserveAspectRatio="none">
        <line x1="${_CHART_PAD_L}" y1="${bot}" x2="${w - _CHART_PAD_R}" y2="${bot}" stroke="var(--brd)"/>
        <text x="${_CHART_PAD_L - 6}" y="${(top + 3)}" text-anchor="end" font-size="8" fill="var(--tx-d)">${fmt(max)}</text>
        ${bars}
        ${_chartXAxis(xLabels)}
    </svg>`;
}

function _trendCard(title, caption, chartOrEmpty, badge = '') {
    return `<div class="doc-card trend-card p-4" style="cursor:default;">
        <div class="trend-card-head">
            <p class="text-[10px] font-bold uppercase tracking-wider" style="color:var(--tx-d);">${title}</p>
            ${badge ? `<span class="trend-estimate">${badge}</span>` : ''}
        </div>
        ${chartOrEmpty}
        ${caption ? `<p class="trend-caption">${caption}</p>` : ''}
    </div>`;
}

function _trendEmpty(msg, h = _CHART_H) {
    return `<div class="flex items-center justify-center text-center" style="height:${h - 10}px;">
        <p class="text-[11px]" style="color:var(--tx-d);">${msg}</p></div>`;
}

function _renderTrends(docs, m) {
    const rangeDays = state.trendsRange != null ? state.trendsRange : 90;
    const now = Date.now();
    const cutoff = rangeDays === 0 ? 0 : now - rangeDays * 86400000;
    const inRange = ts => rangeDays === 0 || (ts || 0) >= cutoff;
    const rangeLabel = rangeDays === 0 ? t('trAllRange') : t('trDays', { n: rangeDays });

    // ── 1 · pass-rate per test run ────────────────────────────────────────────
    const runs = (m.runs || [])
        .filter(r => r.runData?.results && inRange(r.createdAt))
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const passPts = [], passDates = [];
    runs.forEach(r => {
        let p = 0, tot = 0;
        Object.values(r.runData.results).forEach(tc => Object.values(tc || {}).forEach(v => {
            if (v === 'pass' || v === 'fail' || v === 'blocked') { tot++; if (v === 'pass') p++; }
        }));
        if (tot > 0) { passPts.push(Math.round(p / tot * 100)); passDates.push(r.createdAt); }
    });
    let passChart, passCap = '';
    if (passPts.length < 2) {
        passChart = _trendEmpty(t('trPassEmpty'));
    } else {
        const last = passPts[passPts.length - 1];
        const c = last >= 80 ? '#34d399' : last >= 60 ? '#fb923c' : '#f87171';
        passChart = _trendLine(passPts, c, { yMax: 100, yFmt: v => Math.round(v) + '%', xLabels: [_axisDate(passDates[0]), _axisDate(passDates[passDates.length - 1])] });
        const delta = last - passPts[0];
        passCap = t('trPassCap', {
            runs: passPts.length,
            pct: `<b style="color:${c}">${last}%</b>`,
            delta: `${delta >= 0 ? '▲ +' : '▼ '}${delta}%`
        });
    }

    // ── 2 · bugs opened per period ────────────────────────────────────────────
    const bugTs = (m.bugs || []).map(b => b.createdAt || 0).filter(inRange).sort((a, b) => a - b);
    let bugChart, bugCap = '';
    if (bugTs.length === 0) {
        bugChart = _trendEmpty(t('trBugEmpty', { range: rangeLabel }));
    } else {
        const start = rangeDays === 0 ? bugTs[0] : cutoff;
        const n = rangeDays === 30 ? 5 : rangeDays === 90 ? 7 : 8;
        bugChart = _trendBars(_trendBuckets(bugTs, start, now, n), '#f87171', { xLabels: [_axisDate(start), _axisDate(now)] });
        bugCap = t('trBugCap', { n: `<b style="color:#f87171">${bugTs.length}</b>`, range: rangeLabel });
    }

    // ── 3 · documents created (cumulative growth) ─────────────────────────────
    const docTs = docs.map(d => d.createdAt || 0).filter(inRange).sort((a, b) => a - b);
    let docChart, docCap = '';
    if (docTs.length < 2) {
        docChart = _trendEmpty(t('trDocEmpty', { range: rangeLabel }));
    } else {
        const start = rangeDays === 0 ? docTs[0] : cutoff;
        const buckets = _trendBuckets(docTs, start, now, 8);
        let run = 0; const cum = buckets.map(c => (run += c));
        docChart = _trendLine(cum, 'var(--acc)', { fill: true, xLabels: [_axisDate(start), _axisDate(now)] });
        docCap = t('trDocCap', { n: `<b style="color:var(--acc-l)">+${docTs.length}</b>`, range: rangeLabel });
    }

    // ── B3 · bug lifecycle from recorded status_changed events ────────────────
    const terminalStatuses = BUG_TERMINAL_STATUSES;
    const lifecycleBugs = (m.bugs || [])
        .map(bug => {
            const openedAt = bug.createdAt || 0;
            let events = Array.isArray(bug.bugStatusEvents)
                ? bug.bugStatusEvents
                    .filter(event => event?.type === 'status_changed' && Number.isFinite(Number(event.ts)))
                    .map(event => ({
                        from: event.from == null ? null : _normBugStatus(event.from),
                        to: _normBugStatus(event.to),
                        ts: Number(event.ts),
                        estimated: !!event.estimated
                    }))
                    .sort((a, b) => a.ts - b.ts)
                : [];
            if (events.length === 0) {
                const current = _normBugStatus(bug.bugStatus);
                events = [{ from: null, to: 'new', ts: openedAt, estimated: true }];
                if (current !== 'new') {
                    events.push({ from: 'new', to: current, ts: Math.max(openedAt, bug.updatedAt || openedAt), estimated: true });
                }
            }
            const resolvedAt = events
                .filter(event => !terminalStatuses.has(event.from) && terminalStatuses.has(event.to))
                .map(event => event.ts);
            const statusAt = ts => {
                let status = 'new';
                events.forEach(event => { if (event.ts <= ts) status = event.to; });
                return status;
            };
            return { openedAt, resolvedAt, statusAt, estimated: events.some(event => event.estimated) };
        })
        .filter(bug => bug.openedAt > 0);
    const hasLegacyEstimate = lifecycleBugs.some(bug => bug.estimated);
    const lifecycleBadge = hasLegacyEstimate ? t('trEstimate') : '';
    const lifecycleStart = lifecycleBugs.length === 0
        ? now
        : rangeDays === 0
            ? Math.min(...lifecycleBugs.map(bug => bug.openedAt))
            : cutoff;
    const lifecycleBuckets = rangeDays === 30 ? 5 : rangeDays === 90 ? 7 : 8;
    const openedInRange = lifecycleBugs.map(bug => bug.openedAt).filter(ts => ts >= lifecycleStart && ts <= now);
    const resolvedInRange = lifecycleBugs.flatMap(bug => bug.resolvedAt).filter(ts => ts >= lifecycleStart && ts <= now);
    const openedSeries = _trendBuckets(openedInRange, lifecycleStart, now, lifecycleBuckets);
    const resolvedSeries = _trendBuckets(resolvedInRange, lifecycleStart, now, lifecycleBuckets);

    let velocityChart, velocityCap = '';
    if (openedInRange.length + resolvedInRange.length === 0) {
        velocityChart = _trendEmpty(t('trLifeEmpty', { range: rangeLabel }));
    } else {
        velocityChart = _trendDualLine(openedSeries, resolvedSeries, '#f87171', '#34d399', { xLabels: [_axisDate(lifecycleStart), _axisDate(now)] });
        velocityCap = t('trVelocityCap', {
            opened: `<b style="color:#f87171">${openedInRange.length}</b>`,
            resolved: `<b style="color:#34d399">${resolvedInRange.length}</b>`,
            range: rangeLabel
        });
    }

    let backlogChart, backlogCap = '';
    if (lifecycleBugs.length === 0) {
        backlogChart = _trendEmpty(t('trLifeEmpty', { range: rangeLabel }));
    } else {
        const backlogAt = ts => lifecycleBugs.filter(bug =>
            bug.openedAt <= ts && !terminalStatuses.has(bug.statusAt(ts))
        ).length;
        const backlogStart = backlogAt(lifecycleStart);
        const backlogSeries = [backlogStart];
        for (let i = 1; i <= lifecycleBuckets; i++) {
            backlogSeries.push(backlogAt(lifecycleStart + (now - lifecycleStart) * i / lifecycleBuckets));
        }
        const backlogNow = backlogSeries[backlogSeries.length - 1];
        const backlogDelta = backlogNow - backlogStart;
        const deltaText = backlogDelta > 0
            ? t('trDeltaUp', { n: backlogDelta })
            : backlogDelta < 0
                ? t('trDeltaDown', { n: Math.abs(backlogDelta) })
                : t('trDeltaFlat');
        backlogChart = _trendLine(backlogSeries, backlogDelta > 0 ? '#f87171' : '#fbbf24', { fill: true, xLabels: [_axisDate(lifecycleStart), _axisDate(now)] });
        backlogCap = t('trBacklogCap', {
            n: `<b style="color:${backlogDelta > 0 ? '#f87171' : '#fbbf24'}">${backlogNow}</b>`,
            delta: deltaText
        });
    }

    const rangeBtns = [[30, '30d'], [90, '90d'], [0, t('trAll')]].map(([d, l]) =>
        `<button class="px-2.5 py-1 rounded-md text-[11px] font-semibold" style="${rangeDays === d ? 'background:var(--acc);color:#fff;' : 'color:var(--tx-m);'};transition:all .15s;" data-onclick="setTrendsRange(${d})">${l}</button>`
    ).join('');

    return `<div class="dashboard-trends">
        <div class="flex items-center justify-between mb-3">
            <h3 class="font-heading font-semibold text-base">${t('trTitle')} <span class="text-[11px] font-normal" style="color:var(--tx-d);">· ${t('trSub')}</span></h3>
            <div class="flex gap-1 p-1 rounded-lg" style="background:var(--bg2);border:1px solid var(--brd);">${rangeBtns}</div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            ${_trendCard(t('trPassTitle'), passCap, passChart)}
            ${_trendCard(t('trBugTitle'), bugCap, bugChart)}
            ${_trendCard(t('trDocTitle'), docCap, docChart)}
        </div>
        <div class="trend-lifecycle-block">
            <div class="trend-lifecycle-head">
                <h4>${t('trLifeTitle')}</h4>
                <p>${t('trLifeSub')}</p>
            </div>
            <div class="trend-lifecycle-grid">
                ${_trendCard(t('trVelocityTitle'), velocityCap, velocityChart, lifecycleBadge)}
                ${_trendCard(t('trBacklogTitle'), backlogCap, backlogChart, lifecycleBadge)}
            </div>
        </div>
    </div>`;
}
