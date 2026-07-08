// ========================
// UTILS
// ========================
function uid() { return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

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
