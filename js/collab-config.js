// DocVault collaboration runtime configuration
// Evaluates edition flags, hostnames, and guest parameters to determine collab mode.
(function(root) {
    function isGuestMode() {
        try {
            const search = root.location?.search || '';
            if (typeof URLSearchParams !== 'undefined') {
                return new URLSearchParams(search).get('guest') === '1';
            }
            if (root.URLSearchParams) {
                return new root.URLSearchParams(search).get('guest') === '1';
            }
            return /(?:^|[?&])guest=1(?:&|$)/.test(search);
        } catch (_) {
            return false;
        }
    }

    function isTeamHostname() {
        try {
            const host = root.location?.hostname || '';
            return host.endsWith('.web.app') ||
                host.endsWith('.firebaseapp.com') ||
                host === 'localhost' ||
                host === '127.0.0.1';
        } catch (_) {
            return false;
        }
    }

    function isCollabMode() {
        // Must meet all 3 criteria:
        // 1. Not in guest demo mode (?guest=1)
        // 2. Build edition is explicitly set to "team"
        // 3. Running on Firebase Hosting (*.web.app, *.firebaseapp.com) or local emulator host
        if (isGuestMode()) return false;
        if (root.DOCVAULT_EDITION !== 'team') return false;
        return isTeamHostname();
    }

    function getFirebaseConfig() {
        return root.FIREBASE_CONFIG || null;
    }

    root.CollabConfig = {
        isGuestMode,
        isTeamHostname,
        isCollabMode,
        getFirebaseConfig
    };

    root.COLLAB_MODE = isCollabMode();
})(typeof window !== 'undefined' ? window : globalThis);
