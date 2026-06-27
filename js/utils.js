// ========================
// UTILS
// ========================
function uid() { return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }

function fmtDate(ts) {
    const d = new Date(ts);
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

function escHtml(s) {
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ========================
// MARKDOWN RENDERER
// ========================
function renderMd(text) {
    if (!text) return `<p style="color:var(--tx-d)">${t('noContent')}</p>`;
    let h = text;

    const codeBlocks = [];
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const rawCodeB64 = btoa(unescape(encodeURIComponent(code.trim())));
        codeBlocks.push(`
<pre><button class="code-copy-btn" data-onclick="copyCodeBlock(this, '${rawCodeB64}')" title="Copy"><i class="fa-regular fa-copy"></i></button><code>${escHtml(code.trim())}</code></pre>`);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });

    const inlineCodes = [];
    h = h.replace(/`([^`]+)`/g, (_, code) => {
        inlineCodes.push(`<code>${escHtml(code)}</code>`);
        return `__INLINE_CODE_${inlineCodes.length - 1}__`;
    });

    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    h = h.replace(/^---+$/gm, '<hr>');
    h = h.replace(/^- \[x\] (.+)$/gm, '<li class="chk-li" style="list-style:none;"><input type="checkbox" class="form-checkbox" checked disabled> <span class="align-middle">$1</span></li>');
    h = h.replace(/^- \[ \] (.+)$/gm, '<li class="chk-li" style="list-style:none;"><input type="checkbox" class="form-checkbox" disabled> <span class="align-middle">$1</span></li>');
    h = h.replace(/^- (.+)$/gm, '<li class="ul-li">$1</li>');
    h = h.replace(/^\d+\. (.+)$/gm, '<li class="ol-li">$1</li>');

    h = h.replace(/((?:<li class="chk-li".*?>.*<\/li>\n?)+)/g, '<ul style="list-style:none;padding-left:4px;">$1</ul>');
    h = h.replace(/((?:<li class="ul-li".*?>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    h = h.replace(/((?:<li class="ol-li".*?>.*<\/li>\n?)+)/g, '<ol style="list-style-type:decimal;padding-left:24px;">$1</ol>');
    h = h.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, headerRow, sep, bodyRows) => {
        const headers = headerRow.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const rows = bodyRows.trim().split('\n').map(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });
    h = h.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" style="max-width:100%;border-radius:6px;margin:6px 0;display:block;">');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    h = h.replace(/^(?!<[houblptd]|<\/|<li|<input|<tr|<table|__CODE_BLOCK_|__INLINE_CODE_)([^\n]+)$/gm, '<p>$1</p>');
    h = h.replace(/<p><\/p>/g, '');

    h = h.replace(/__INLINE_CODE_(\d+)__/g, (_, idx) => inlineCodes[idx]);
    h = h.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[idx]);

    return h;
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
    if (s.includes('.')) {
        try {
            const url = s.startsWith('http') ? s : `https://${s}`;
            return new URL(url).hostname;
        } catch(e) {
            return s;
        }
    }
    return s.replace(/\s+/g, '') + '.com';
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
