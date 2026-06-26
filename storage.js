// Safe base64 for Uint8Arrays — spread operator stack-overflows on large arrays
function uint8ToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

// ========================
// VAULT — AES-256-GCM + PBKDF2 encryption
// Fixed salt enables same password → same key across devices (required for GitHub sync)
// ========================
const Vault = {
    PREFIX: 'ENC:',
    SALT: new TextEncoder().encode('docvault-kdf-v1'),

    async _key(password) {
        const raw = await crypto.subtle.importKey(
            'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: this.SALT, iterations: 100000, hash: 'SHA-256' },
            raw,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    },

    isEncrypted(s) {
        return typeof s === 'string' && s.startsWith(this.PREFIX);
    },

    async encrypt(data, password) {
        const key = await this._key(password);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const plain = new TextEncoder().encode(JSON.stringify(data));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
        const buf = new Uint8Array(12 + cipher.byteLength);
        buf.set(iv);
        buf.set(new Uint8Array(cipher), 12);
        return this.PREFIX + uint8ToBase64(buf);
    },

    async decrypt(encStr, password) {
        if (!this.isEncrypted(encStr)) throw new Error('Not encrypted');
        const key = await this._key(password);
        const buf = Uint8Array.from(atob(encStr.slice(this.PREFIX.length).trim()), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12)
        );
        const decStr = new TextDecoder().decode(plain);
        try {
            let parsed = JSON.parse(decStr);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed); // recover from double stringify bug
            return parsed;
        } catch(e) {
            return decStr; // fallback for non-JSON content if any
        }
    }
};

window.Vault = Vault;

// ========================
// GITHUB DATA SYNC
// ========================
const GitHubSync = {
    // Hardcoded vault repo — same on every device, no config needed
    DEFAULTS: { owner: 'dustin-nkd', repo: 'docvault-assets', branch: 'main', path: 'images' },

    DATA_PATH: 'database/docvault-data.json',
    SHA_KEY: 'github_data_sha',
    SETTINGS_KEY: 'github_settings',

    _pwd() {
        return sessionStorage.getItem('docvault_pwd') || null;
    },

    // Returns merged settings: hardcoded defaults + stored overrides (token from stored)
    async getSettings() {
        const raw = localStorage.getItem(this.SETTINGS_KEY);
        let stored = null;
        if (raw) {
            try {
                if (Vault.isEncrypted(raw)) {
                    const pwd = this._pwd();
                    stored = pwd ? await Vault.decrypt(raw, pwd) : null;
                } else {
                    stored = JSON.parse(raw);
                }
            } catch(e) { stored = null; }
        }
        // Merge: defaults for owner/repo/branch/path, stored for token
        return { ...this.DEFAULTS, ...(stored || {}) };
    },

    async saveSettings(settings) {
        const pwd = this._pwd();
        const value = pwd
            ? await Vault.encrypt(settings, pwd)
            : JSON.stringify(settings);
        localStorage.setItem(this.SETTINGS_KEY, value);
    },

    clearSettings() {
        localStorage.removeItem(this.SETTINGS_KEY);
    },

    // Only needs a token — owner/repo are hardcoded defaults
    async isConfigured() {
        const s = await this.getSettings();
        return !!(s && s.token);
    },

    _headers(token) {
        return {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        };
    },

    // Parse raw content string → {docs, cfg}  (handles both old array format and new wrapper)
    async _parseContent(content) {
        const pwd = this._pwd();
        let payload;
        if (Vault.isEncrypted(content)) {
            if (!pwd) throw new Error('Vault is locked');
            payload = await Vault.decrypt(content, pwd);
        } else {
            payload = JSON.parse(content);
        }
        if (Array.isArray(payload)) return { docs: payload, cfg: null }; // old format
        return { docs: payload.docs || [], cfg: payload.cfg || null };
    },

    // Encode docs + cfg for GitHub API (base64 of UTF-8 file content)
    async _encode(docs) {
        const pwd = this._pwd();
        const cfg = await this.getSettings();
        // Always embed cfg so other devices can bootstrap automatically
        const wrapper = { docs, cfg: cfg || null };
        const content = pwd
            ? await Vault.encrypt(wrapper, pwd)
            : JSON.stringify(wrapper, null, 2);
        return btoa(unescape(encodeURIComponent(content)));
    },

    // Decode GitHub API base64 content → {docs, cfg}
    async _decode(b64) {
        const content = decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
        return this._parseContent(content);
    },

    // Fetch via GitHub API (no auth needed for public repos) — avoids raw CDN 5-min cache
    async fetchPublic(owner, repo, branch) {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${this.DATA_PATH}?ref=${branch || 'main'}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
            if (!res.ok) return null;
            const data = await res.json();
            localStorage.setItem(this.SHA_KEY, data.sha);
            const result = await this._decode(data.content);
            return result;
        } catch(e) {
            console.error('[GitHubSync] public fetch failed:', e);
            return null;
        }
    },

    // Bootstrap a new device: fetch data + embedded cfg, save settings locally
    // For public repos: only owner+repo needed (no token)
    // For private repos: token required
    async bootstrap(owner, repo, branch, token) {
        branch = branch || 'main';

        // Try without token first (public repo)
        let result = await this.fetchPublic(owner, repo, branch);

        // Fallback: try with token (private repo or auth required)
        if (!result && token) {
            const tempSettings = { owner, repo, branch, path: 'images', token };
            await this.saveSettings(tempSettings);
            result = await this.pull();
            if (!result) {
                this.clearSettings();
                return false;
            }
        }

        if (!result) return false;

        const { docs, cfg } = result;

        // Use embedded cfg if available, else build minimal one from inputs
        const finalCfg = cfg || { owner, repo, branch, path: 'images', token: token || '' };
        await this.saveSettings(finalCfg);

        // Save docs locally
        if (docs && docs.length > 0) {
            await DocStorage._saveLocal(docs);
        }

        return true;
    },

    async pull() {
        const s = await this.getSettings();
        if (!s) return null;

        const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${this.DATA_PATH}?ref=${s.branch || 'main'}`;
        try {
            const res = await fetch(url, { headers: this._headers(s.token) });
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`GitHub pull error: ${res.status}`);

            const data = await res.json();
            localStorage.setItem(this.SHA_KEY, data.sha);
            const { docs } = await this._decode(data.content);
            return docs;
        } catch(e) {
            console.error('[GitHubSync] pull failed:', e);
            return null;
        }
    },

    async push(docs, retryOnConflict = true) {
        const s = await this.getSettings();
        if (!s) return;

        const sha = localStorage.getItem(this.SHA_KEY);
        const body = {
            message: `DocVault sync ${new Date().toISOString()}`,
            content: await this._encode(docs),
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

            if ((res.status === 409 || res.status === 422) && retryOnConflict) {
                console.warn(`[GitHubSync] status ${res.status}, pulling latest SHA before retry...`);
                const remote = await this.pull();
                if (remote) {
                    const merged = DocStorage._merge(docs, remote);
                    await DocStorage._saveLocal(merged);
                    return this.push(merged, false);
                }
                return this.push(docs, false);
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

    _pwd() {
        return sessionStorage.getItem('docvault_pwd') || null;
    },

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
        let raw;
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            raw = await new Promise(resolve =>
                chrome.storage.local.get(key, result => resolve(result[key] || null))
            );
            if (raw && typeof raw !== 'string') return raw;
        } else {
            raw = localStorage.getItem(key);
        }
        if (!raw) return null;
        try {
            if (Vault.isEncrypted(raw)) {
                const pwd = this._pwd();
                if (!pwd) return null;
                return await Vault.decrypt(raw, pwd);
            }
            return typeof raw === 'string' ? JSON.parse(raw) : raw;
        } catch(e) { return null; }
    },

    async _saveLocal(docs) {
        const key = this.STORAGE_KEY;
        const pwd = this._pwd();
        let toStore;
        try {
            toStore = pwd ? await Vault.encrypt(docs, pwd) : JSON.stringify(docs);
        } catch(e) {
            toStore = JSON.stringify(docs);
        }
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await new Promise(resolve => chrome.storage.local.set({ [key]: toStore }, resolve));
            } else {
                localStorage.setItem(key, toStore);
            }
        } catch(e) {
            console.error('Error saving docs locally:', e);
        }
    },

    async getAll() {
        const local = await this._getLocal();
        if (!(await GitHubSync.isConfigured())) return local;

        const remote = await GitHubSync.pull();
        if (!remote) return local;

        const merged = this._merge(local || [], remote);
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
            await this._saveLocal(merged);
        }
        return merged;
    },

    async save(docs) {
        await this._saveLocal(docs);
        if (await GitHubSync.isConfigured()) {
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
        if (!docs || docs.length === 0) throw new Error('No data to export.');
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
                        return reject(new Error('Invalid document data.'));
                    }
                    if (mode === 'replace') {
                        await this.save(importDocs);
                        resolve({ imported: importDocs.length, total: importDocs.length });
                    } else {
                        const existing = (await this.getAll()) || [];
                        const existingIds = new Set(existing.map(d => d.id));
                        let imported = 0;
                        for (const doc of importDocs) {
                            if (!existingIds.has(doc.id)) { existing.push(doc); imported++; }
                        }
                        await this.save(existing);
                        resolve({ imported, total: existing.length });
                    }
                } catch(err) { reject(new Error('File read error: ' + err.message)); }
            };
            reader.onerror = () => reject(new Error('Cannot read file.'));
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

    async getUsage() { return { used: 0, total: 0 }; }
};

window.DocStorage = DocStorage;

// ========================
// LOCAL AUTH (Master Password)
// ========================
const LocalAuth = {
    HASH_KEY: 'docvault_master_hash',
    SESSION_KEY: 'docvault_unlocked',
    SESSION_PWD: 'docvault_pwd',

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

            sessionStorage.setItem(this.SESSION_PWD, password);
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

        const rawDocs = localStorage.getItem(DocStorage.STORAGE_KEY);
        if (rawDocs && Vault.isEncrypted(rawDocs)) {
            const dec = await Vault.decrypt(rawDocs, oldPassword);
            localStorage.setItem(DocStorage.STORAGE_KEY, await Vault.encrypt(dec, newPassword));
        }

        const rawGh = localStorage.getItem(GitHubSync.SETTINGS_KEY);
        if (rawGh && Vault.isEncrypted(rawGh)) {
            const dec = await Vault.decrypt(rawGh, oldPassword);
            localStorage.setItem(GitHubSync.SETTINGS_KEY, await Vault.encrypt(dec, newPassword));
        }

        localStorage.setItem(this.HASH_KEY, await this._hash(newPassword));
        sessionStorage.setItem(this.SESSION_PWD, newPassword);
    },

    reset() {
        if (confirm('Remove Master Password? All encrypted local data will be cleared. Are you sure?')) {
            localStorage.removeItem(this.HASH_KEY);
            localStorage.removeItem(DocStorage.STORAGE_KEY);
            localStorage.removeItem(GitHubSync.SETTINGS_KEY);
            sessionStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem(this.SESSION_PWD);
            window.location.reload();
        }
    }
};

window.LocalAuth = LocalAuth;
