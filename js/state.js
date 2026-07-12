// ========================
// STATE
// ========================
// Kept for legacy cancel/save cleanup; no longer populated (images are inline base64)
const pendingImageReplacements = new Map();

let state = {
    view: 'dashboard', // dashboard | documents | favorites | editor | viewer
    category: 'all',
    subfolder: '',
    search: '',
    statusFilter: 'all',
    sortBy: 'updated',
    editingDoc: null, // null = new, object = editing
    editorTags: [],
    editorMode: 'edit', // edit | preview
    sidebarOpen: false,
    history: [],
    sharedView: false,  // true when viewing a public share link (read-only)
    batchMode: false,
    selectedIds: new Set(),
    lastSelectedId: null,
    docListPage: 1, // Sprint 22: pagination for the documents grid
    traceabilityFilter: 'all'
};

let documents = [];

// ========================
// BUG STATUS TIMELINE (QA Trends B3)
// ========================
// Stored on each bug so lifecycle metrics travel with the document through
// local persistence, export/import, and GitHub sync. Legacy bugs are backfilled
// conservatively and keep estimated=true so the dashboard never presents an
// inferred timestamp as an exact historical fact.
const BUG_STATUS_ALIASES = { confirmed: 'open', testing: 'retest' };
const BUG_TERMINAL_STATUSES = new Set(['resolved', 'verified', 'closed']);

function normalizeBugStatusValue(status) {
    return BUG_STATUS_ALIASES[status] || status || 'new';
}

function ensureBugStatusEvents(doc) {
    if (!doc || doc.category !== 'bug') return [];
    const createdAt = Number(doc.createdAt) || Number(doc.updatedAt) || Date.now();
    const current = normalizeBugStatusValue(doc.bugStatus);
    const raw = Array.isArray(doc.bugStatusEvents) ? doc.bugStatusEvents : [];
    const events = raw
        .filter(event => event && event.type === 'status_changed' && Number.isFinite(Number(event.ts)))
        .map(event => ({
            type: 'status_changed',
            from: event.from == null ? null : normalizeBugStatusValue(event.from),
            to: normalizeBugStatusValue(event.to),
            ts: Number(event.ts),
            ...(event.estimated ? { estimated: true } : {})
        }))
        .sort((a, b) => a.ts - b.ts);

    if (events.length === 0) {
        events.push({ type: 'status_changed', from: null, to: 'new', ts: createdAt, estimated: true });
        if (current !== 'new') {
            events.push({
                type: 'status_changed',
                from: 'new',
                to: current,
                ts: Math.max(createdAt, Number(doc.updatedAt) || createdAt),
                estimated: true
            });
        }
    }

    doc.bugStatusEvents = events;
    return events;
}

function recordBugStatusChange(doc, nextStatus, ts = Date.now()) {
    if (!doc || doc.category !== 'bug') return false;
    const from = normalizeBugStatusValue(doc.bugStatus);
    const to = normalizeBugStatusValue(nextStatus);
    if (from === to) return false;
    const events = ensureBugStatusEvents(doc);
    events.push({ type: 'status_changed', from, to, ts });
    events.sort((a, b) => a.ts - b.ts);
    doc.bugStatus = to;
    doc.updatedAt = ts;
    return true;
}

// ========================
// DOCUMENT HISTORY
// ========================
const DocHistory = {
    MAX: 10,
    _key: id => `docvault_history_${id}`,
    save(doc) {
        // Guest demo: leave zero trace in the browser's real localStorage.
        if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
        if (!doc?.id || doc.category === 'credential') return;
        let snaps;
        try { snaps = JSON.parse(localStorage.getItem(this._key(doc.id)) || '[]'); } catch { snaps = []; }
        if (snaps.length && snaps[0].content === (doc.content || '') && snaps[0].title === doc.title) return;
        snaps.unshift({ ts: Date.now(), title: doc.title, content: doc.content || '', tags: doc.tags || [], status: doc.status, subfolder: doc.subfolder || '' });
        localStorage.setItem(this._key(doc.id), JSON.stringify(snaps.slice(0, this.MAX)));
    },
    get(id) {
        try { return JSON.parse(localStorage.getItem(this._key(id)) || '[]'); } catch { return []; }
    }
};

// ========================
// ACTIVITY LOG (Sprint 24, synced Sprint 25)
// ========================
// A lightweight personal "what did I do lately" timeline across the whole
// vault — NOT a real audit trail (no tamper-evidence, no access control) —
// see the BA/PO discussion that led here: this app has one user, so "who
// did what" has one answer, but a cross-device "what changed recently" is
// still useful. Synced piggybacking on the sharded-sync meta file
// (GitHubSync.pushSharded/pullSharded, storage.js) — each entry carries a
// stable `id` specifically so entries from different devices can be merged
// (union + dedup by id, newest MAX kept) instead of one device's history
// clobbering another's.
const ActivityLog = {
    KEY: 'docvault_activity_log',
    MAX: 200,

    _genId() {
        return 'act_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    },

    record(type, doc, meta = {}) {
        if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return; // leave zero trace in demo mode
        if (!doc) return;
        let entries;
        try { entries = JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { entries = []; }
        entries.unshift({
            id: this._genId(),
            ts: Date.now(),
            type, // 'created' | 'updated' | 'trashed' | 'restored' | 'deleted' | 'tagged' | 'moved'
            docId: doc.id,
            title: doc.title,
            category: doc.category,
            ...meta
        });
        localStorage.setItem(this.KEY, JSON.stringify(entries.slice(0, this.MAX)));
    },

    getAll() {
        // Guest demo must never surface this browser's real activity log —
        // same isolation guarantee as the rest of guest mode.
        if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return [];
        try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch { return []; }
    },

    // Union local + remote entries by id, newest-first, capped at MAX.
    // Pure function — used both to fold incoming remote entries into local
    // storage (pullSharded) and to resolve a meta-file push conflict
    // between two devices' logs (GitHubSync's meta mergeFn).
    merge(localEntries, remoteEntries) {
        const byId = new Map();
        (remoteEntries || []).forEach(e => { if (e && e.id) byId.set(e.id, e); });
        (localEntries || []).forEach(e => { if (e && e.id) byId.set(e.id, e); }); // local wins on id collision (shouldn't happen — ids are random)
        return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, this.MAX);
    },

    // Merges `remoteEntries` into this device's local log (used on pull).
    mergeIncoming(remoteEntries) {
        if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
        if (!Array.isArray(remoteEntries) || remoteEntries.length === 0) return;
        const merged = this.merge(this.getAll(), remoteEntries);
        localStorage.setItem(this.KEY, JSON.stringify(merged));
    },

    clear() {
        localStorage.removeItem(this.KEY);
    }
};

// ========================
// PERSISTENCE
// ========================
async function persist() {
    // Guest demo mode: in-memory only. NEVER call DocStorage.save here — that would
    // write to the browser's real localStorage vault key and, if a real GitHub token
    // happens to be configured in this browser, push demo edits to the real repo.
    // Guest edits simply live for the session and vanish on reload.
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return;
    await DocStorage.save(documents);
}

async function hydrate() {
    // Guest demo mode: load the isolated sample set and stop — never touch
    // LocalAuth, real localStorage, or GitHubSync.
    if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) {
        documents = JSON.parse(JSON.stringify(GUEST_DEMO_DOCS));
        return;
    }

    // Clean up legacy keys from old Firebase/E2EE architecture
    localStorage.removeItem('firebase_config');
    localStorage.removeItem('e2ee_api_key');
    localStorage.removeItem('e2ee_bin_id');
    sessionStorage.removeItem('e2ee_master_password');

    const settings = await DocStorage.getSettings();
    const saved = await DocStorage.getAll();
    if (saved && Array.isArray(saved) && saved.length > 0) {
        documents = saved;
    } else {
        documents = [...SAMPLE_DOCS];
    }

    let migrated = false;
    documents.forEach(d => {
        if (d.category === 'onboarding') {
            d.category = 'knowledge';
            d.subfolder = d.subfolder || 'Onboarding';
            migrated = true;
        } else if (d.category === 'meeting') {
            d.category = 'knowledge';
            d.subfolder = d.subfolder || 'Meeting Notes';
            migrated = true;
        }
    });

    // Backfill sequential bug numbers for bugs created before US-202, in creation
    // order, so every bug has a stable BUG-### reference.
    let maxBugNumber = documents.reduce((m, d) =>
        (d.category === 'bug' && typeof d.bugNumber === 'number') ? Math.max(m, d.bugNumber) : m, 0);
    documents
        .filter(d => d.category === 'bug' && typeof d.bugNumber !== 'number')
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        .forEach(d => { d.bugNumber = ++maxBugNumber; migrated = true; });

    // B3: start carrying bug lifecycle events with every bug. Existing records
    // retain estimated markers because their historic transition times were not
    // captured before this release.
    documents.filter(d => d.category === 'bug').forEach(d => {
        if (!Array.isArray(d.bugStatusEvents) || d.bugStatusEvents.length === 0) {
            ensureBugStatusEvents(d);
            migrated = true;
        }
    });

    if (migrated) await persist();
}
