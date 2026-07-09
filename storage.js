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
    DEFAULTS: { owner: 'dustin-nkd', repo: 'docvault-assets', branch: 'main' },

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

    // Parse raw content string → {docs, cfg, deletedIds}
    // Handles: new envelope {v, rb, hint}, old encrypted string, old plain JSON.
    // Side effect: restores lock-screen security metadata from remote data.
    async _parseContent(content) {
        const pwd = this._pwd();
        let vaultContent = content;
        let recoveryBlob = null;
        let passwordHint = '';
        let hasPasswordHint = false;

        // Detect new envelope format: { v: "<vault>", rb: "<recovery_blob_or_null>", hint: "<password_hint_or_null>" }
        if (!Vault.isEncrypted(content)) {
            try {
                const outer = JSON.parse(content);
                if (outer && typeof outer === 'object' && 'v' in outer) {
                    vaultContent = outer.v;
                    recoveryBlob = outer.rb || null;
                    if (Object.prototype.hasOwnProperty.call(outer, 'hint')) {
                        hasPasswordHint = true;
                        passwordHint = typeof outer.hint === 'string' ? outer.hint : '';
                    }
                }
            } catch(e) { /* old plain-array format — fall through */ }
        }

        // Restore security metadata to localStorage so lock-screen recovery works cross-device.
        if (recoveryBlob) {
            localStorage.setItem(LocalAuth.RECOVERY_KEY, recoveryBlob);
        }
        // Only adopt a NON-EMPTY remote hint. An empty/null remote hint means the
        // owner chose not to sync it (US-102) — it must not wipe this device's own
        // local hint, it only signals the public copy has been cleared.
        if (hasPasswordHint && passwordHint && window.LocalAuth) {
            LocalAuth.setHint(passwordHint);
        }

        let payload;
        if (Vault.isEncrypted(vaultContent)) {
            if (!pwd) throw new Error('Vault is locked');
            payload = await Vault.decrypt(vaultContent, pwd);
        } else {
            payload = JSON.parse(vaultContent);
        }
        if (Array.isArray(payload)) return { docs: payload, cfg: null, deletedIds: [] }; // old format
        return { docs: payload.docs || [], cfg: payload.cfg || null, deletedIds: payload.deletedIds || [] };
    },

    // Encode docs + cfg for GitHub API (base64 of UTF-8 file content).
    // Wraps the vault in an envelope so the recovery blob can be fetched without decryption.
    // Soft-deleted docs (status='deleted') are kept on GitHub for 30 days so trash syncs across devices.
    // After 30 days they are auto-purged and their IDs added to deletedIds (tombstone).
    _getLocalSecurityMeta() {
        // The password hint is only synced to the (public) repo when the user has
        // explicitly opted in (US-102). When opted out we send '' so the remote copy
        // is cleared without touching this device's local hint.
        const syncHint = window.LocalAuth && LocalAuth.isHintSyncEnabled && LocalAuth.isHintSyncEnabled();
        return {
            recoveryBlob: window.LocalAuth ? (localStorage.getItem(LocalAuth.RECOVERY_KEY) || null) : null,
            passwordHint: (syncHint && LocalAuth.getHint) ? LocalAuth.getHint() : ''
        };
    },

    _applySecurityMeta(meta) {
        if (!meta || !window.LocalAuth) return;
        if (meta.recoveryBlob) {
            localStorage.setItem(LocalAuth.RECOVERY_KEY, meta.recoveryBlob);
        }
        // Only a non-empty hint is applied locally (see _parseContent); an empty
        // hint clears only the remote copy, never the local one.
        if (meta.passwordHint) {
            LocalAuth.setHint(meta.passwordHint);
        }
    },

    async _encode(docs, securityMeta = null) {
        const pwd = this._pwd();
        const cfg = await this.getSettings();
        const meta = securityMeta || this._getLocalSecurityMeta();
        const TRASH_TTL = 30 * 24 * 60 * 60 * 1000;
        const autoPurgedIds = [];
        const activeDocs = docs.filter(d => {
            if (d.status !== 'deleted') return true;
            const age = Date.now() - (d.deletedAt || 0);
            if (age >= TRASH_TTL) { autoPurgedIds.push(d.id); return false; }
            return true;
        });
        if (autoPurgedIds.length > 0 && DocStorage) {
            await DocStorage.addDeletedIds(autoPurgedIds);
        }
        // Re-encrypt credential passwords that were decrypted in memory before pushing
        const safeDocs = DocStorage ? await DocStorage._encryptCredPasswords(activeDocs, pwd) : activeDocs;
        const deletedIds = DocStorage ? [...DocStorage._getLocalDeletedIds()] : [];
        const wrapper = { docs: safeDocs, cfg: cfg || null, deletedIds };
        const vaultContent = pwd
            ? await Vault.encrypt(wrapper, pwd)
            : JSON.stringify(wrapper, null, 2);
        // Envelope: vault + lock-screen security metadata.
        const envelope = JSON.stringify({
            v: vaultContent,
            rb: meta.recoveryBlob || null,
            hint: meta.passwordHint || null
        });
        return btoa(unescape(encodeURIComponent(envelope)));
    },

    // Decode GitHub API base64 content → {docs, cfg}
    async _decode(b64) {
        const content = decodeURIComponent(escape(atob(b64.replace(/\n/g, ''))));
        return this._parseContent(content);
    },

    // Fetch lock-screen metadata from the public GitHub repo -- no auth or decryption needed.
    // Used on new devices to show hint/recovery before the vault is configured.
    async fetchSecurityMetaPublic() {
        const { owner, repo, branch } = this.DEFAULTS;
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${this.DATA_PATH}?ref=${branch || 'main'}`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } });
            if (!res.ok) return null;
            const data = await res.json();
            const content = decodeURIComponent(escape(atob(data.content.replace(/\n/g, ''))));
            const outer = JSON.parse(content);
            if (!outer || typeof outer !== 'object' || !('v' in outer)) return null;
            const meta = {
                recoveryBlob: outer.rb || null
            };
            if (Object.prototype.hasOwnProperty.call(outer, 'hint')) {
                meta.passwordHint = typeof outer.hint === 'string' ? outer.hint : '';
            }
            return meta;
        } catch(e) { return null; }
    },

    async fetchRecoveryBlobPublic() {
        const meta = await this.fetchSecurityMetaPublic();
        return meta ? meta.recoveryBlob : null;
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
            const tempSettings = { owner, repo, branch, token };
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
        const finalCfg = cfg || { owner, repo, branch, token: token || '' };
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
            const { docs, deletedIds } = await this._decode(data.content);
            return { docs, deletedIds: deletedIds || [] };
        } catch(e) {
            console.error('[GitHubSync] pull failed:', e);
            return null;
        }
    },

    async push(docs, retryOnConflict = true, options = {}) {
        const s = await this.getSettings();
        if (!s) return;
        const securityMeta = options.securityMeta || null;

        const sha = localStorage.getItem(this.SHA_KEY);
        const body = {
            message: `DocVault sync ${new Date().toISOString()}`,
            content: await this._encode(docs, securityMeta),
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
                    const remoteDocs = remote.docs || remote;
                    const remoteDeletedIds = new Set(remote.deletedIds || []);
                    const localDeletedIds = DocStorage._getLocalDeletedIds();
                    const allDeletedIds = new Set([...localDeletedIds, ...remoteDeletedIds]);
                    if (allDeletedIds.size > localDeletedIds.size) {
                        DocStorage._saveLocalDeletedIds(allDeletedIds);
                    }
                    const merged = DocStorage._merge(docs, remoteDocs, allDeletedIds);
                    await DocStorage._saveLocal(merged);
                    return this.push(merged, false, options);
                }
                return this.push(docs, false, options);
            }

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.message || `GitHub push error: ${res.status}`);
            }

            const data = await res.json();
            localStorage.setItem(this.SHA_KEY, data.content.sha);
            if (securityMeta) this._applySecurityMeta(securityMeta);
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
    DELETED_IDS_KEY: 'docvault_deleted_ids',

    _pwd() {
        return sessionStorage.getItem('docvault_pwd') || null;
    },

    async _encryptCredPasswords(docs, pwd) {
        if (!pwd || !Array.isArray(docs)) return docs;
        return Promise.all(docs.map(async doc => {
            if (doc.category !== 'credential' || !doc.password || Vault.isEncrypted(doc.password)) return doc;
            const encPwd = await Vault.encrypt(doc.password, pwd);
            return { ...doc, password: encPwd };
        }));
    },

    async _decryptCredPasswords(docs, pwd) {
        if (!Array.isArray(docs)) return docs;
        return Promise.all(docs.map(async doc => {
            if (doc.category !== 'credential' || !doc.password || !Vault.isEncrypted(doc.password)) return doc;
            if (!pwd) return { ...doc, password: '' };
            try {
                const plain = await Vault.decrypt(doc.password, pwd);
                return { ...doc, password: typeof plain === 'string' ? plain : '' };
            } catch(e) { return { ...doc, password: '' }; }
        }));
    },

    _getLocalDeletedIds() {
        try {
            return new Set(JSON.parse(localStorage.getItem(this.DELETED_IDS_KEY) || '[]'));
        } catch(e) { return new Set(); }
    },

    _saveLocalDeletedIds(set) {
        localStorage.setItem(this.DELETED_IDS_KEY, JSON.stringify([...set]));
    },

    async addDeletedIds(ids) {
        const set = this._getLocalDeletedIds();
        ids.forEach(id => set.add(id));
        this._saveLocalDeletedIds(set);
    },

    _merge(local, remote, deletedIds = new Set()) {
        const map = new Map();
        (local || []).forEach(d => { if (!deletedIds.has(d.id)) map.set(d.id, d); });
        (remote || []).forEach(r => {
            if (deletedIds.has(r.id)) return;
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
            let parsed;
            if (Vault.isEncrypted(raw)) {
                const pwd = this._pwd();
                if (!pwd) return null;
                parsed = await Vault.decrypt(raw, pwd);
            } else {
                parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            }
            return await this._decryptCredPasswords(parsed, this._pwd());
        } catch(e) { return null; }
    },

    async _saveLocal(docs) {
        const key = this.STORAGE_KEY;
        const pwd = this._pwd();
        let toStore;
        try {
            const docsToStore = await this._encryptCredPasswords(docs, pwd);
            toStore = pwd ? await Vault.encrypt(docsToStore, pwd) : JSON.stringify(docsToStore);
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
        const localDeletedIds = this._getLocalDeletedIds();

        if (!(await GitHubSync.isConfigured())) return local;

        const remote = await GitHubSync.pull();
        if (!remote) return local;

        const { docs: remoteDocs, deletedIds: remoteDeletedIds } = remote;
        const allDeletedIds = new Set([...localDeletedIds, ...(remoteDeletedIds || [])]);
        if (allDeletedIds.size > localDeletedIds.size) {
            this._saveLocalDeletedIds(allDeletedIds);
        }

        const merged = this._merge(local || [], remoteDocs, allDeletedIds);
        if (JSON.stringify(merged) !== JSON.stringify(local)) {
            await this._saveLocal(merged);
        }
        return merged;
    },

    // Set when a push fails (e.g. offline) so a later 'online' event knows there's
    // something to retry (Sprint 13, A1). Session-only — not persisted across
    // reloads, which is an accepted simplification for this pass.
    _pending: false,

    async save(docs) {
        await this._saveLocal(docs);
        if (await GitHubSync.isConfigured()) {
            GitHubSync.push(docs).then(() => {
                this._pending = false;
                if (typeof window.updateSyncIndicator === 'function') window.updateSyncIndicator();
            }).catch(e => {
                this._pending = true;
                if (typeof window.updateSyncIndicator === 'function') window.updateSyncIndicator();
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
    RECOVERY_KEY: 'docvault_recovery_blob',
    HINT_KEY: 'docvault_pwd_hint',

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

    MIN_PASSWORD_LENGTH: 8,
    // Marks a hash that was just created this session for a first-time/new device.
    // startApp() clears it once sync confirms the password, or rolls the hash back
    // if the password turns out to be wrong for existing remote data (US-401).
    PROVISIONAL_KEY: 'docvault_provisional',

    // Attempts to repair a stale local HASH_KEY by verifying the typed password
    // against the public GitHub vault. Reuses GitHubSync.bootstrap(), which pulls
    // the vault unauthenticated, decrypts it with the given password (via the
    // session password set below), and — on success — re-saves both the GitHub
    // settings and the document cache locally, re-encrypted under this password.
    // Returns true only if the remote vault genuinely decrypted with `password`.
    async _recoverStaleHash(password) {
        if (typeof GitHubSync === 'undefined') return false;
        if (typeof GUEST_MODE !== 'undefined' && GUEST_MODE) return false;
        const prevPwd = sessionStorage.getItem(this.SESSION_PWD);
        sessionStorage.setItem(this.SESSION_PWD, password);
        try {
            const d = GitHubSync.DEFAULTS;
            const ok = await GitHubSync.bootstrap(d.owner, d.repo, d.branch);
            if (!ok) return false;
            localStorage.setItem(this.HASH_KEY, await this._hash(password));
            return true;
        } catch(e) {
            console.error(e);
            return false;
        } finally {
            // unlock() re-sets SESSION_PWD itself right after this returns, but
            // clean up here too in case a caller checks it before that happens.
            if (prevPwd) sessionStorage.setItem(this.SESSION_PWD, prevPwd);
            else sessionStorage.removeItem(this.SESSION_PWD);
        }
    },

    async unlock(password) {
        const btn = document.getElementById('lock-submit-btn');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Checking...';
        try {
            const hash = await this._hash(password);
            const stored = localStorage.getItem(this.HASH_KEY);

            if (!stored) {
                // First-time setup: enforce a minimum password length. (Existing
                // vaults are compared against the stored hash and never re-checked,
                // so no one gets locked out by tightening the policy.)
                if ((password || '').length < this.MIN_PASSWORD_LENGTH) {
                    if (btn) btn.innerHTML = 'Unlock Vault';
                    if (typeof toast === 'function') toast(`Master password must be at least ${this.MIN_PASSWORD_LENGTH} characters.`, 'error');
                    return;
                }
                localStorage.setItem(this.HASH_KEY, hash);
                sessionStorage.setItem(this.PROVISIONAL_KEY, '1');
            } else if (hash !== stored) {
                // The local hash can go stale when the master password is changed on
                // a different device (changePassword() only updates the device it
                // runs on — HASH_KEY is never synced). Before rejecting, check
                // whether the typed password decrypts the public vault on GitHub; if
                // it does, it's the legitimate new password and this device just
                // hasn't caught up yet. Re-run the same bootstrap this app uses for a
                // brand-new device to repair the stale local hash/settings/doc cache,
                // instead of forcing a localStorage wipe to recover.
                const recovered = await this._recoverStaleHash(password);
                if (!recovered) {
                    if (btn) btn.innerHTML = 'Unlock Vault';
                    if (typeof toast === 'function') toast(typeof t === 'function' ? t('mpIncorrect') : 'Incorrect password.', 'error');
                    return;
                }
                if (typeof toast === 'function') toast('Master password was changed on another device — this device is now in sync.', 'success');
            }

            sessionStorage.setItem(this.SESSION_PWD, password);
            sessionStorage.setItem(this.SESSION_KEY, '1');
            document.getElementById('lock-screen').classList.add('hidden');
            if (window.resetLockFormState) window.resetLockFormState();
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

        // The recovery blob encrypts the OLD password (keyed by the recovery code,
        // which we don't have here), so it cannot be re-wrapped for the new password
        // and would silently unlock into an undecryptable vault. Revoke it — the user
        // must generate a fresh recovery key. Removing it here also makes the next
        // push send rb:null, clearing the stale blob from GitHub.
        localStorage.removeItem(this.RECOVERY_KEY);
    },

    async generateRecovery(password) {
        const bytes = crypto.getRandomValues(new Uint8Array(20));
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
        let raw = '';
        for (let i = 0; i < 20; i++) raw += chars[bytes[i] % 32];
        const code = [raw.slice(0,5), raw.slice(5,10), raw.slice(10,15), raw.slice(15,20)].join('-');
        const blob = await Vault.encrypt({ pwd: password }, raw);
        localStorage.setItem(this.RECOVERY_KEY, blob);
        return code;
    },

    async recoverWithCode(code) {
        const blob = localStorage.getItem(this.RECOVERY_KEY);
        if (!blob) throw new Error('No recovery key found. Generate one in Settings first.');
        const clean = code.replace(/-/g, '').toUpperCase().trim();
        if (clean.length !== 20) throw new Error('Invalid code format — should be 20 characters (dashes optional).');
        try {
            const result = await Vault.decrypt(blob, clean);
            return (result && typeof result === 'object' && result.pwd) ? result.pwd : result;
        } catch {
            throw new Error('Incorrect recovery code.');
        }
    },

    getHint() {
        return localStorage.getItem(this.HINT_KEY) || '';
    },

    setHint(text) {
        const value = String(text || '').trim().slice(0, 80);
        if (value) localStorage.setItem(this.HINT_KEY, value);
        else localStorage.removeItem(this.HINT_KEY);
    },

    // Whether the password hint may be synced to the (public) GitHub repo.
    // Opt-in only: the hint is readable by anyone without the master password, so
    // it stays on this device unless the user explicitly enables cross-device sync.
    HINT_SYNC_KEY: 'docvault_hint_sync',
    isHintSyncEnabled() {
        return localStorage.getItem(this.HINT_SYNC_KEY) === '1';
    },
    setHintSync(enabled) {
        if (enabled) localStorage.setItem(this.HINT_SYNC_KEY, '1');
        else localStorage.removeItem(this.HINT_SYNC_KEY);
    },

    reset() {
        if (confirm('Remove Master Password? All encrypted local data will be cleared. Are you sure?')) {
            localStorage.removeItem(this.HASH_KEY);
            localStorage.removeItem(this.RECOVERY_KEY);
            localStorage.removeItem(this.HINT_KEY);
            localStorage.removeItem(DocStorage.STORAGE_KEY);
            localStorage.removeItem(GitHubSync.SETTINGS_KEY);
            sessionStorage.removeItem(this.SESSION_KEY);
            sessionStorage.removeItem(this.SESSION_PWD);
            window.location.reload();
        }
    }
};

window.LocalAuth = LocalAuth;
