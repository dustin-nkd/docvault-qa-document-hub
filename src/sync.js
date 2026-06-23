const SyncService = {
    clientId: '821273695892-0n81gju50nenhne1ohmkedmvv2ik09qv.apps.googleusercontent.com',
    scopes: 'https://www.googleapis.com/auth/drive.appdata',

    // Authenticate with Google (Web GSI)
    async getAuthToken() {
        return new Promise((resolve, reject) => {
            if (!window.google || !window.google.accounts) {
                reject(new Error("Google Identity Services library not loaded. Please wait or reload."));
                return;
            }

            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.clientId,
                scope: this.scopes,
                callback: (response) => {
                    if (response.error !== undefined) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response.access_token);
                },
            });
            tokenClient.requestAccessToken();
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
        // Since launchWebAuthFlow doesn't use Chrome's internal token cache,
        // we simply "sign out" the user by assuming they are logged out in our app state.
        // To truly log out of Google, they would log out of the browser.
        return Promise.resolve();
    }
};

window.SyncService = SyncService;
