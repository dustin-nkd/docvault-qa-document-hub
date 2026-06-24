// E2EE Sync Service using JSONBin.io and CryptoJS
const E2EESyncService = {
    saveSettings(apiKey, binId, masterPassword) {
        localStorage.setItem('e2ee_api_key', apiKey || '');
        localStorage.setItem('e2ee_bin_id', binId || '');
        sessionStorage.setItem('e2ee_master_password', masterPassword || '');
    },

    getSettings() {
        return {
            apiKey: localStorage.getItem('e2ee_api_key') || '$2a$10$taCC8A46/1HYhSkqCEPyJejJ8iJrKyCRBy7xfzBECpMLJWshJ5P9u',
            binId: localStorage.getItem('e2ee_bin_id') || '6a3bcc60da38895dfef72f76',
            masterPassword: sessionStorage.getItem('e2ee_master_password') || ''
        };
    },

    isConfigured() {
        const s = this.getSettings();
        return !!s.apiKey && !!s.binId;
    },

    isUnlocked() {
        return !!sessionStorage.getItem('e2ee_master_password');
    },

    encryptData(data, password) {
        if (!window.CryptoJS) throw new Error("CryptoJS not loaded");
        const jsonStr = JSON.stringify(data);
        return CryptoJS.AES.encrypt(jsonStr, password).toString();
    },

    decryptData(cipherText, password) {
        if (!window.CryptoJS) throw new Error("CryptoJS not loaded");
        const bytes = CryptoJS.AES.decrypt(cipherText, password);
        const decStr = bytes.toString(CryptoJS.enc.Utf8);
        if (!decStr) throw new Error("Decryption failed. Incorrect password.");
        return JSON.parse(decStr);
    },

    async pullAndUnlock(password) {
        const s = this.getSettings();
        if (!s.apiKey || !s.binId) return false;

        toast("Fetching data from Cloud...", "info");
        try {
            const res = await fetch('https://api.jsonbin.io/v3/b/' + s.binId + '/latest', {
                headers: { 'X-Master-Key': s.apiKey }
            });
            if (!res.ok) throw new Error("Failed to fetch from JSONBin");
            const payload = await res.json();
            
            if (payload.record && payload.record.data) {
                const plainData = this.decryptData(payload.record.data, password);
                localStorage.setItem('docvault_data', JSON.stringify(plainData));
                sessionStorage.setItem('e2ee_master_password', password);
                return true;
            } else {
                sessionStorage.setItem('e2ee_master_password', password);
                return false;
            }
        } catch (err) {
            console.error(err);
            throw err;
        }
    },

    async pushData() {
        if (!this.isConfigured() || !this.isUnlocked()) return;

        const s = this.getSettings();
        const rawData = localStorage.getItem('docvault_data');
        if (!rawData) return;
        
        try {
            const parsedData = JSON.parse(rawData);
            const cipherText = this.encryptData(parsedData, s.masterPassword);

            const res = await fetch('https://api.jsonbin.io/v3/b/' + s.binId, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': s.apiKey
                },
                body: JSON.stringify({ data: cipherText })
            });
            
            if (!res.ok) throw new Error("Failed to push to JSONBin");
            console.log("Auto-Sync Complete");
        } catch (err) {
            console.error("Auto-Sync Error:", err);
            toast("Auto-sync failed. Check your network.", "error");
        }
    },
    
    async unlock(password) {
        const btn = document.querySelector('#lock-screen button[type="submit"]');
        if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Decrypting...';
        
        try {
            if (this.isConfigured()) {
                const hasData = await this.pullAndUnlock(password);
                if (!hasData) {
                    // Bin is empty! Push local data to initialize it
                    await this.pushData();
                }
            } else {
                sessionStorage.setItem('e2ee_master_password', password);
            }
            document.getElementById('lock-screen').classList.add('hidden');
            toast("Vault Unlocked", "success");
            
            if (window.initAppAfterUnlock) await window.initAppAfterUnlock();
        } catch (err) {
            toast(err.message === "Failed to fetch from JSONBin" ? "JSONBin API Error" : "Incorrect Password!", "error");
            if (btn) btn.innerHTML = 'Unlock Vault';
        }
    },
    
    skipSync() {
        sessionStorage.setItem('e2ee_master_password', 'skipped');
        document.getElementById('lock-screen').classList.add('hidden');
        if (window.initAppAfterUnlock) window.initAppAfterUnlock();
    }
};

window.SyncService = E2EESyncService;
