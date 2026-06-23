/**
 * DocVault Storage Module
 * Wraps chrome.storage.local with localStorage fallback for development.
 * All methods are async to support chrome.storage.local's async API.
 */
const DocStorage = {
    STORAGE_KEY: 'docvault_docs',
    SETTINGS_KEY: 'docvault_settings',

    /**
     * Check if running as Chrome extension
     */
    _isChromeExt() {
        return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
    },

    /**
     * Get all documents
     * @returns {Promise<Array|null>} Array of documents or null if none saved
     */
    async getAll() {
        if (this._isChromeExt()) {
            return new Promise((resolve) => {
                chrome.storage.local.get(this.STORAGE_KEY, (result) => {
                    resolve(result[this.STORAGE_KEY] || null);
                });
            });
        } else {
            const data = localStorage.getItem(this.STORAGE_KEY);
            try {
                return data ? JSON.parse(data) : null;
            } catch (e) {
                return null;
            }
        }
    },

    /**
     * Save all documents (replaces entire collection)
     * @param {Array} docs - Array of document objects
     */
    async save(docs) {
        if (this._isChromeExt()) {
            return new Promise((resolve) => {
                chrome.storage.local.set({ [this.STORAGE_KEY]: docs }, () => {
                    resolve();
                });
            });
        } else {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(docs));
        }
    },

    /**
     * Get storage usage info
     * @returns {Promise<{used: number, total: number}>} Bytes used and total
     */
    async getUsage() {
        if (this._isChromeExt()) {
            return new Promise((resolve) => {
                chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                    resolve({
                        used: bytesInUse,
                        total: chrome.storage.local.QUOTA_BYTES || 10485760
                    });
                });
            });
        } else {
            let used = 0;
            for (let key in localStorage) {
                if (localStorage.hasOwnProperty(key)) {
                    used += localStorage.getItem(key).length * 2; // rough estimate (UTF-16)
                }
            }
            return { used, total: 5242880 }; // ~5MB for localStorage
        }
    },

    /**
     * Export all documents as a JSON file download
     */
    async exportData() {
        const docs = await this.getAll();
        if (!docs || docs.length === 0) {
            throw new Error('Không có dữ liệu để export.');
        }
        const exportObj = {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            documentCount: docs.length,
            documents: docs
        };
        const data = JSON.stringify(exportObj, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `docvault-backup-${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /**
     * Import documents from a JSON file
     * @param {File} file - JSON file to import
     * @param {string} mode - 'replace' or 'merge'
     * @returns {Promise<{imported: number, total: number}>} Import result
     */
    async importData(file, mode = 'merge') {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const parsed = JSON.parse(e.target.result);
                    let importDocs;

                    // Support both raw array and wrapped format
                    if (Array.isArray(parsed)) {
                        importDocs = parsed;
                    } else if (parsed.documents && Array.isArray(parsed.documents)) {
                        importDocs = parsed.documents;
                    } else {
                        reject(new Error('File không đúng định dạng DocVault.'));
                        return;
                    }

                    // Validate each document has required fields
                    const valid = importDocs.every(d => d.id && d.title && d.category);
                    if (!valid) {
                        reject(new Error('Dữ liệu document không hợp lệ.'));
                        return;
                    }

                    if (mode === 'replace') {
                        await this.save(importDocs);
                        resolve({ imported: importDocs.length, total: importDocs.length });
                    } else {
                        // Merge mode: add new, skip duplicates by ID
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
                } catch (err) {
                    reject(new Error('Lỗi đọc file: ' + err.message));
                }
            };
            reader.onerror = () => reject(new Error('Không thể đọc file.'));
            reader.readAsText(file);
        });
    },

    
    /**
     * Get settings
     */
    async getSettings() {
        if (this._isChromeExt()) {
            return new Promise((resolve) => {
                chrome.storage.local.get(this.SETTINGS_KEY, (result) => {
                    resolve(result[this.SETTINGS_KEY] || {});
                });
            });
        } else {
            const data = localStorage.getItem(this.SETTINGS_KEY);
            try {
                return data ? JSON.parse(data) : {};
            } catch (e) {
                return {};
            }
        }
    },

    /**
     * Save settings
     */
    async saveSettings(settings) {
        if (this._isChromeExt()) {
            return new Promise((resolve) => {
                chrome.storage.local.set({ [this.SETTINGS_KEY]: settings }, () => {
                    resolve();
                });
            });
        } else {
            localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
        }
    },

    /**
     * Listen for storage changes (useful for syncing across tabs/popup)
     * @param {Function} callback - Called with updated documents array
     */
    onChanged(callback) {
        if (this._isChromeExt()) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes[this.STORAGE_KEY]) {
                    callback(changes[this.STORAGE_KEY].newValue || []);
                }
            });
        } else {
            // localStorage doesn't have a cross-tab change event built-in
            // but we can use the storage event
            window.addEventListener('storage', (e) => {
                if (e.key === this.STORAGE_KEY) {
                    try {
                        callback(JSON.parse(e.newValue) || []);
                    } catch (err) { /* ignore */ }
                }
            });
        }
    }
};

window.DocStorage = DocStorage;

