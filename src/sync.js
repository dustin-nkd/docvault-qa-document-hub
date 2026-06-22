const SyncService = {
    // Authenticate with Google
    async getAuthToken() {
        return new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, function(token) {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else if (token) {
                    resolve(token);
                } else {
                    reject(new Error("Failed to get auth token"));
                }
            });
        });
    },

    // Get user info (optional, just to show logged in email)
    async getUserInfo(token) {
        const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        return await response.json();
    },

    // Search for docvault_data.json in appDataFolder
    async getDriveFileId(token) {
        const response = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name="docvault_data.json"', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!response.ok) throw new Error("Failed to query drive files");
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    },

    // Download data from Drive
    async downloadData() {
        try {
            const token = await this.getAuthToken();
            const fileId = await this.getDriveFileId(token);
            if (!fileId) return null; // No data on drive

            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) throw new Error("Failed to download data");
            return await response.json();
        } catch (err) {
            console.error("Sync Download Error:", err);
            throw err;
        }
    },

    // Upload data to Drive
    async uploadData(localData) {
        try {
            const token = await this.getAuthToken();
            const fileId = await this.getDriveFileId(token);
            
            const metadata = {
                name: 'docvault_data.json',
                parents: ['appDataFolder']
            };
            
            const fileContent = JSON.stringify(localData);
            const file = new Blob([fileContent], {type: 'application/json'});
            
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
            form.append('file', file);

            let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            let method = 'POST';

            // If file already exists, we must PATCH it instead of creating a new one
            if (fileId) {
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
                method = 'PATCH';
                // Remove parents for patch
                delete metadata.parents;
                const updateForm = new FormData();
                updateForm.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
                updateForm.append('file', file);
                
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: updateForm
                });
                if (!response.ok) throw new Error("Failed to update data on Drive");
                return await response.json();
            } else {
                const response = await fetch(url, {
                    method: method,
                    headers: { 'Authorization': 'Bearer ' + token },
                    body: form
                });
                if (!response.ok) throw new Error("Failed to upload new data to Drive");
                return await response.json();
            }
        } catch (err) {
            console.error("Sync Upload Error:", err);
            throw err;
        }
    },
    
    // Revoke token / Logout
    async logout() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, function(token) {
                if (token) {
                    chrome.identity.removeCachedAuthToken({ token: token }, function() {
                        fetch('https://accounts.google.com/o/oauth2/revoke?token=' + token).then(() => {
                            resolve();
                        });
                    });
                } else {
                    resolve();
                }
            });
        });
    }
};

window.SyncService = SyncService;
