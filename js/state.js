// ========================
// STATE
// ========================
// Tracks base64 → CDN URL swaps pending until the next Save
const pendingImageReplacements = new Map();

let state = {
    view: 'dashboard', // dashboard | documents | favorites | editor | viewer
    category: 'all',
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
    await DocStorage.save(documents);
}

async function hydrate() {
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
    if (migrated) await persist();
}
