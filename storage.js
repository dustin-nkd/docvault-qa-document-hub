const DocStorage = {
    async getAll() {
        const STORAGE_KEY = 'docvault_docs';
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise((resolve) => {
                chrome.storage.local.get(STORAGE_KEY, (result) => {
                    resolve(result[STORAGE_KEY] || null);
                });
            });
        }
        const data = localStorage.getItem(STORAGE_KEY);
        try { return data ? JSON.parse(data) : null; }
        catch (e) { return null; }
    },

    async save(docs) {
        const STORAGE_KEY = 'docvault_docs';
        try {
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                await new Promise((resolve) => {
                    chrome.storage.local.set({ [STORAGE_KEY]: docs }, () => resolve());
                });
            } else {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
            }
        } catch (err) {
            console.error('Error saving docs locally:', err);
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
                } catch (err) { reject(new Error('Lỗi đọc file: ' + err.message)); }
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
