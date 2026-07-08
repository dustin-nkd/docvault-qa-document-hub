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
    lastSelectedId: null
};

let documents = [];

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

    if (migrated) await persist();
}
