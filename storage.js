// ========================
// GITHUB DATA SYNC
// ========================
const GitHubSync = {
    DATA_PATH: 'database/docvault-data.json',
    SHA_KEY: 'github_data_sha',

    getSettings() {
        const s = localStorage.getItem('github_settings');
        if (!s) return null;
        try { return JSON.parse(s); } catch(e) { return null; }
    },

    isConfigured() {
        const s = this.getSettings();
        return !!(s && s.owner && s.repo && s.token);
    },

    _headers(token) {
        return {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        };
    },

    _encode(docs) {
        // UTF-8 safe base64 for Vietnamese characters
        return btoa(unescape(encodeURIComponent(JSON.stringify(docs, null, 2))));
    },

    _decode(b64) {
        return JSON.parse(decodeURIComponent(escape(atob(b64.replace(/\n/g, '')))));
    },

    async pull() {
        const s = this.getSettings();
        if (!s) return null;

        const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${this.DATA_PATH}?ref=${s.branch || 'main'}`;
        try {
            const res = await fetch(url, { headers: this._headers(s.token) });
            if (res.status === 404) return null; // File not created yet
            if (!res.ok) throw new Error(`GitHub pull error: ${res.status}`);

            const data = await res.json();
            localStorage.setItem(this.SHA_KEY, data.sha);
            return this._decode(data.content);
        } catch(e) {
            console.error('[GitHubSync] pull failed:', e);
            return null;
        }
    },

    async push(docs, retryOnConflict = true) {
        const s = this.getSettings();
        if (!s) return;

        const sha = localStorage.getItem(this.SHA_KEY);
        const body = {
            message: `DocVault sync ${new Date().toISOString()}`,
            content: this._encode(docs),
            branch: s.branch || 'main'
        };
        if (sha) body.sha = sha;

        const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${this.DATA_PATH}`;
        try {
            const res = await fetch(url, {
                method: 'PUT',
                headers: this._headers(s.token),
                body: JSON.stringify(body)
            });

            if (res.status === 409 && retryOnConflict) {
                // SHA is stale — pull latest, merge, push again
                console.warn('[GitHubSync] conflict, pulling latest before retry...');
                const remote = await this.pull();
                if (remote) {
                    const merged = DocStorage._merge(docs, remote);
                    await DocStorage._saveLocal(merged);
                    return this.push(merged, false);
                }
                return;
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `GitHub push error: ${res.status}`);
            }

            const data = await res.json();
            localStorage.setItem(this.SHA_KEY, data.content.sha);
            console.log('[GitHubSync] push OK');
        } catch(e) {
            console.error('[GitHubSync] push failed:', e);
            throw e;
        }
    }
};

window.GitHubSync = GitHubSync;

// ========================
// DOC STORAGE
// ========================
const DocStorage = {
    STORAGE_KEY: 'docvault_docs',

    // Merge two doc arrays — latest updatedAt per id wins
    _merge(local, remote) {
        const map = new Map();
        (local || []).forEach(d => map.set(d.id, d));
        (remote || []).forEach(r => {
            const l = map.get(r.id);
            if (!l || r.updatedAt > l.updatedAt) map.set(r.id, r);
        });
        return Array.from(map.values());
    },

    async _getLocal() {
        const key = this.STORAGE_KEY;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise(resolve => {
                chrome.storage.local.get(key, result => resolve(result[key] || null));
            });
        }
        const data = localStorage.getItem(key);
        try { return data ? JSON.parse(data) : null; } catch(e) { return null; }
    },

    async _saveLocal(docs) {
        const key = this.STORAGE_KEY;
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await new Promise(resolve => chrome.storage.local.set({ [key]: docs }, resolve));
            } else {
                localStorage.setItem(key, JSON.stringify(docs));
            }
        } catch(e) {
            console.error('Error saving docs locally:', e);
        }
    },

    async getAll() {
        const local = await this._getLocal();

        if (!GitHubSync.isConfigured()) return local;

        // Pull from GitHub and merge with local
        const remote = await GitHubSync.pull();
        if (!remote) return local; // GitHub file not yet created

        const merged = this._merge(local || [], remote);

        // If merge produced changes vs local, save them back
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
            await this._saveLocal(merged);
        }

        return merged;
    },

    async save(docs) {
        await this._saveLocal(docs);

        // Push to GitHub async (non-blocking) so UI stays snappy
        if (GitHubSync.isConfigured()) {
            GitHubSync.push(docs).catch(e => {
                if (typeof toast === 'function') {
                    const msg = typeof t === 'function' ? t('ghSyncFail') : 'GitHub sync failed';
                    toast(msg + ': ' + e.message, 'error');
                }
            });
        }
    },

    async exportData() {
        const docs = await this.getAll();
        if (!docs || docs.length === 0) throw new Error('Không có dữ liệu để export.');

        const exportObj = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            documentCount: docs.length,
            documents: docs
        };
        const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `docvault-backup-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    async importData(file, mode = 'merge') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    let importDocs = Array.isArray(parsed) ? parsed : (parsed.documents || null);
                    if (!importDocs || !importDocs.every(d => d.id && d.title && d.category)) {
                        return reject(new Error('Dữ liệu document không hợp lệ.'));
                    }

                    if (mode === 'replace') {
                        await this.save(importDocs);
                        resolve({ imported: importDocs.length, total: importDocs.length });
                    } else {
                        const existing = (await this.getAll()) || [];
                        const existingIds = new Set(existing.map(d => d.id));
                        let imported = 0;
                        for (const doc of importDocs) {
                            if (!existingIds.has(doc.id)) {
                                existing.push(doc);
                                imported++;
                            }
                        }
                        await this.save(existing);
                        resolve({ imported, total: existing.length });
                    }
                } catch(err) { reject(new Error('Lỗi đọc file: ' + err.message)); }
            };
            reader.onerror = () => reject(new Error('Không thể đọc file.'));
            reader.readAsText(file);
        });
    },

    async getSettings() {
        const data = localStorage.getItem('docvault_settings');
        try { return data ? JSON.parse(data) : {}; } catch(e) { return {}; }
    },

    async saveSettings(settings) {
        localStorage.setItem('docvault_settings', JSON.stringify(settings));
    },

    async getUsage() {
        return { used: 0, total: 0 };
    }
};

window.DocStorage = DocStorage;

// ========================
// LOCAL AUTH (Master Password)
// ========================
const LocalAuth = {
    HASH_KEY: 'docvault_master_hash',
    SESSION_KEY: 'docvault_unlocked',

    async _hash(password) {
        const enc = new TextEncoder().encode(password);
        const buf = await crypto.subtle.digest('SHA-256', enc);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    },

    isConfigured() {
        return !!localStorage.getItem(this.HASH_KEY);
    },

    isUnlocked() {
        return sessionStorage.getItem(this.SESSION_KEY) === '1';
    },

    async unlock(password) {
        const btn = document.getElementById('lock-submit-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';

        try {
            const hash = await this._hash(password);
            const stored = localStorage.getItem(this.HASH_KEY);

            if (!stored) {
                localStorage.setItem(this.HASH_KEY, hash);
            } else if (hash !== stored) {
                if (btn) btn.innerHTML = 'Unlock Vault';
                if (typeof toast === 'function') toast(typeof t === 'function' ? t('mpIncorrect') : 'Incorrect password.', 'error');
                return;
            }

            sessionStorage.setItem(this.SESSION_KEY, '1');
            document.getElementById('lock-screen').classList.add('hidden');
            if (typeof toast === 'function') toast(typeof t === 'function' ? t('vaultUnlocked') : 'Vault Unlocked', 'success');
            if (window._afterUnlock) window._afterUnlock();
        } catch(e) {
            console.error(e);
            if (btn) btn.innerHTML = 'Unlock Vault';
        }
    },

    async changePassword(oldPassword, newPassword) {
        const oldHash = await this._hash(oldPassword);
        const stored = localStorage.getItem(this.HASH_KEY);
        if (stored && oldHash !== stored) throw new Error('Current password is incorrect.');
        const newHash = await this._hash(newPassword);
        localStorage.setItem(this.HASH_KEY, newHash);
    },

    reset() {
        if (confirm('Xoá Master Password sẽ mất bảo vệ vault. Bạn chắc chắn?')) {
            localStorage.removeItem(this.HASH_KEY);
            sessionStorage.removeItem(this.SESSION_KEY);
            window.location.reload();
        }
    }
};

window.LocalAuth = LocalAuth;
