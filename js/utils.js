// ========================
// UTILS
// ========================
function uid() { return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

// Delays calling fn until `wait` ms after the last call — used to avoid
// re-filtering/re-rendering the full document list on every single keystroke
// in search inputs (Sprint 21).
function debounce(fn, wait) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
    };
}

// Reuse normalized search text across document-list and global-search queries.
// Entries invalidate automatically when searchable fields change, including
// tags mutated in place by the editor/batch actions.
const SEARCH_INDEX_CACHE = new WeakMap();
function getSearchIndexEntry(doc) {
    const title = String(doc?.title || '');
    const content = String(doc?.content || '');
    const tags = Array.isArray(doc?.tags) ? doc.tags : [];
    const tagsKey = tags.join('\u0000');
    const cached = doc && SEARCH_INDEX_CACHE.get(doc);
    if (cached && cached.sourceTitle === title && cached.sourceContent === content && cached.tagsKey === tagsKey) return cached;

    const entry = {
        sourceTitle: title,
        sourceContent: content,
        tagsKey,
        title: title.toLowerCase(),
        content: content.toLowerCase(),
        tags: tags.map(tag => String(tag).toLowerCase())
    };
    if (doc && typeof doc === 'object') SEARCH_INDEX_CACHE.set(doc, entry);
    return entry;
}

function matchesSearchQuery(doc, query) {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return true;
    const entry = getSearchIndexEntry(doc);
    return entry.title.includes(normalized) || entry.content.includes(normalized) || entry.tags.some(tag => tag.includes(normalized));
}

function scoreSearchDocument(doc, words) {
    const entry = getSearchIndexEntry(doc);
    let score = 0;
    (words || []).forEach(word => {
        const normalized = String(word || '').toLowerCase();
        if (!normalized) return;
        if (entry.title === normalized) score += 5;
        else if (entry.title.startsWith(normalized)) score += 3;
        else if (entry.title.includes(normalized)) score += 2;
        if (entry.tags.some(tag => tag.includes(normalized))) score += 1.5;
        if (entry.content.includes(normalized)) score += 0.5;
    });
    return score;
}

// Credential rotation-age helper (Sprint 18, 18-2). Falls back to createdAt
// when no explicit rotatedAt is set — a credential never marked as rotated
// is aging since it was created. Informational only: a fixed 90-day
// threshold flags a reminder badge, it never locks or expires anything.
const CRED_ROTATE_THRESHOLD_DAYS = 90;
function credRotationInfo(doc) {
    const baseline = doc.rotatedAt ? new Date(doc.rotatedAt).getTime() : (doc.createdAt || Date.now());
    const ageDays = Math.max(0, Math.floor((Date.now() - baseline) / 86400000));
    return { ageDays, stale: ageDays > CRED_ROTATE_THRESHOLD_DAYS };
}

function fmtDate(ts) {
    const d = new Date(ts);
    // Guard against undefined/null/invalid timestamps, which would otherwise fall
    // through and print an ugly "Invalid Date" in the UI (US-406 / #9).
    if (!ts || isNaN(d.getTime())) return '—';
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return t('justNow');
    if (diff < 3600000) return t('minsAgo', {m: Math.floor(diff/60000)});
    if (diff < 86400000) return t('hoursAgo', {h: Math.floor(diff/3600000)});
    if (diff < 604800000) return t('daysAgo', {d: Math.floor(diff/86400000)});
    return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function excerpt(text, len = 120) {
    if (!text) return '';
    const clean = text
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
        .replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\r\n]+/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/[#*`>|_~\\]/g, '')
        .replace(/\n+/g, ' ')
        .trim();
    return clean.length > len ? clean.substring(0, len) + '...' : clean;
}

// Escapes HTML special chars INCLUDING quotes. escHtml() is used both for text
// content and for values interpolated into double-quoted HTML attributes
// (value="...", title="...", data-copy-value="..."), so quotes MUST be escaped —
// otherwise a value containing `"` can break out of the attribute and inject a
// handler (e.g. a credential password of `p"onfocus="alert(1)`). The old
// textContent→innerHTML trick did not escape quotes.
function escHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Builds delegated action attributes without mixing untrusted values into
// executable-looking strings. Arguments are JSON literals, then the complete
// action is HTML-escaped before it enters a data-* attribute.
function actionCode(name, ...args) {
    const functionName = String(name || '');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) {
        throw new Error('Invalid delegated action name: ' + functionName);
    }
    const serialized = args.map(value => value === undefined ? 'null' : JSON.stringify(value));
    return functionName + '(' + serialized.join(',') + ')';
}

function actionAttr(name, ...args) {
    return escHtml(actionCode(name, ...args));
}

function decodeActionArgument(serialized) {
    const value = String(serialized || '').trim();
    if (value.startsWith('"') && value.endsWith('"')) {
        try { return JSON.parse(value); } catch (e) { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1).replace(/\\(['"\\])/g, '$1');
    }
    return value;
}

function renderActionButton({ className = '', action, args = [], label = '', icon = '', title = '' }) {
    const titleAttr = title ? ' title="' + escHtml(title) + '"' : '';
    const content = icon
        ? '<i class="' + escHtml(icon) + '"></i><span>' + escHtml(label) + '</span>'
        : escHtml(label);
    return '<button type="button" class="' + escHtml(className) + '" data-onclick="' +
        actionAttr(action, ...args) + '"' + titleAttr + '>' + content + '</button>';
}

// Escapes a value for use inside a GitHub-flavored Markdown table cell: pipes
// would otherwise start a new column, and raw newlines would break the row.
function mdCell(v) {
    return String(v == null ? '' : v).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

// Human-readable bug reference, e.g. BUG-007 (US-202). Empty for non-bugs or
// legacy bugs that have not been assigned a number yet.
function bugRef(doc) {
    return (doc && doc.category === 'bug' && typeof doc.bugNumber === 'number')
        ? 'BUG-' + String(doc.bugNumber).padStart(3, '0')
        : '';
}

// ---- CSV export helpers (US-301) ----
function _csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(rows) {
    return rows.map(r => r.map(_csvCell).join(',')).join('\r\n');
}
function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ========================
// CREDENTIAL HELPERS
// ========================
window.credAvatarColor = function(site) {
    const s = site || '';
    if (!s) return 'avatar-0';
    return `avatar-${s.charCodeAt(0) % 8}`;
};

window.guessDomain = function(site) {
    const s = (site || '').trim().toLowerCase();
    let domain;
    if (s.includes('.')) {
        try {
            const url = s.startsWith('http') ? s : `https://${s}`;
            domain = new URL(url).hostname;
        } catch(e) {
            domain = s;
        }
    } else {
        domain = s.replace(/\s+/g, '') + '.com';
    }
    // Strip any character not valid in a hostname. Prevents HTML-attribute
    // injection when the result is interpolated into an <img src="..."> URL
    // (a malicious credential title could otherwise break out and add onerror).
    return domain.replace(/[^a-z0-9.-]/g, '');
};

window.copyPassword = function(id, btn) {
    const doc = documents.find(d => d.id === id);
    if (!doc || !doc.password || (typeof Vault !== 'undefined' && Vault.isEncrypted(doc.password))) return;
    _copyText(doc.password, btn);
};

window.copyUsername = function(id, btn) {
    const doc = documents.find(d => d.id === id);
    if (!doc || !doc.username) return;
    _copyText(doc.username, btn);
};

window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
};

// ========================
// COPY CODE BLOCK
// ========================
window.copyCodeBlock = function(btn, b64) {
    try {
        const text = decodeURIComponent(escape(atob(b64)));
        _copyText(text, btn);
    } catch (e) {
        toast(t('copyFail'), 'error');
    }
};

// Safe base64 encode for Uint8Arrays — spread operator stack-overflows on large arrays
function uint8ToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
