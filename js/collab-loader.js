// DocVault Firebase lazy loader
// Injects same-origin Firebase compat scripts on demand and memoizes the load promise.
(function(root) {
    const FIREBASE_SCRIPTS = [
        'vendor/firebase/firebase-app-compat.js',
        'vendor/firebase/firebase-auth-compat.js',
        'vendor/firebase/firebase-firestore-compat.js'
    ];

    let _firebaseLoadPromise = null;

    function _loadScript(url) {
        if (typeof document === 'undefined') {
            return Promise.resolve();
        }

        const existing = document.querySelector(`script[data-runtime-asset="${url}"]`);
        if (existing?.dataset.loaded === 'true') {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = existing || document.createElement('script');
            const onLoad = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            const onError = () => {
                script.remove();
                reject(new Error(`Unable to load Firebase asset: ${url}`));
            };

            script.addEventListener('load', onLoad, { once: true });
            script.addEventListener('error', onError, { once: true });
            if (existing) return;

            script.dataset.runtimeAsset = url;
            script.src = url;
            script.async = false;
            document.head.appendChild(script);
        });
    }

    function ensureFirebase() {
        const isGuest = root.CollabConfig?.isGuestMode
            ? root.CollabConfig.isGuestMode()
            : (new URLSearchParams(root.location?.search || '').get('guest') === '1');

        if (isGuest) {
            return Promise.reject(new Error('Firebase SDK is not available in guest mode (?guest=1)'));
        }

        if (root.firebase?.initializeApp && root.firebase?.auth && root.firebase?.firestore) {
            return Promise.resolve(root.firebase);
        }

        if (!_firebaseLoadPromise) {
            _firebaseLoadPromise = (async () => {
                for (const scriptUrl of FIREBASE_SCRIPTS) {
                    await _loadScript(scriptUrl);
                }
                if (!root.firebase?.initializeApp) {
                    throw new Error('Firebase compat SDK loaded but firebase.initializeApp is missing');
                }
                return root.firebase;
            })().catch(error => {
                _firebaseLoadPromise = null;
                throw error;
            });
        }

        return _firebaseLoadPromise;
    }

    root.CollabLoader = {
        ensureFirebase,
        FIREBASE_SCRIPTS
    };

    root.ensureFirebase = ensureFirebase;
})(typeof window !== 'undefined' ? window : globalThis);
