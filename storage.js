/**
 * DocVault Storage Module - Firebase Edition
 * Wraps Firebase Firestore for data persistence and Firebase Storage for files.
 */
const DocStorage = {
    // Flag to check if Firebase is initialized
    isFirebaseReady: false,

    async init() {
        if (this.isFirebaseReady) return;
        try {
            // Get config from localStorage
            const storedConfigStr = localStorage.getItem('firebase_config');
            if (storedConfigStr) {
                const config = JSON.parse(storedConfigStr);
                if (config.apiKey && !firebase.apps.length) {
                    firebase.initializeApp(config);
                    this.db = firebase.firestore();
                    this.db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
                    this.db.enablePersistence().catch(err => {
                        console.warn('Firebase offline persistence error:', err);
                    });
                    this.isFirebaseReady = true;
                    console.log("Firebase initialized successfully.");
                }
            }
        } catch (e) {
            console.error("Firebase init failed:", e);
        }
    },

    async getAll() {
        await this.init();
        if (!this.isFirebaseReady) return null;

        try {
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Firebase connection timeout (6s). Project may be deleted or offline.")), 6000)
            );
            const fetchPromise = this.db.collection('documents').get();
            const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
            
            const docs = [];
            snapshot.forEach(doc => docs.push(doc.data()));
            return docs;
        } catch (err) {
            console.error('Error fetching docs from Firebase:', err);
            if (typeof toast === 'function') {
                toast("Lỗi kết nối Firebase. Nhấp vào biểu tượng Răng cưa ở góc trái dưới cùng để reset lại cấu hình.", "error");
            }
            return null;
        }
    },

    async save(docs) {
        await this.init();
        if (!this.isFirebaseReady) return;

        try {
            const batch = this.db.batch();
            const collectionRef = this.db.collection('documents');
            
            for (const doc of docs) {
                const docRef = collectionRef.doc(doc.id);
                batch.set(docRef, doc, { merge: true });
            }
            
            const snapshot = await collectionRef.get();
            const currentIds = new Set(docs.map(d => d.id));
            snapshot.forEach(docSnap => {
                if (!currentIds.has(docSnap.id)) {
                    batch.delete(docSnap.ref);
                }
            });

            await batch.commit();
        } catch (err) {
            console.error('Error saving docs to Firebase:', err);
        }
    },

    async getOldLocalData() {
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

    async migrateDataToCloud() {
        const oldDocs = await this.getOldLocalData();
        if (oldDocs && oldDocs.length > 0) {
            await this.init();
            if (!this.isFirebaseReady) throw new Error("Firebase not ready");
            await this.save(oldDocs);
            
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.remove('docvault_docs');
            }
            localStorage.removeItem('docvault_docs');
            return oldDocs.length;
        }
        return 0;
    },

    async getUsage() {
        return { used: 0, total: 1048576000 }; // 1GB fake quota for Firebase
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

    onChanged(callback) {
        this.init().then(() => {
            if (this.isFirebaseReady) {
                this.db.collection('documents').onSnapshot((snapshot) => {
                    const docs = [];
                    snapshot.forEach(doc => docs.push(doc.data()));
                    callback(docs);
                }, (err) => {
                    console.error("Firestore onSnapshot error:", err);
                });
            }
        });
    }
};

window.DocStorage = DocStorage;
