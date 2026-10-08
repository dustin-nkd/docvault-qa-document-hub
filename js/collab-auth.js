// DocVault Firebase Authentication module
// Implements same-origin Google OAuth via signInWithRedirect and getRedirectResult.
(function(root) {
    let _authInstance = null;
    let _initPromise = null;

    async function getAuthInstance() {
        if (_authInstance) return _authInstance;
        if (!_initPromise) {
            _initPromise = (async () => {
                const firebase = await (root.ensureFirebase ? root.ensureFirebase() : Promise.resolve(root.firebase));
                if (!firebase) throw new Error('Firebase SDK is not available');

                if (!firebase.apps || !firebase.apps.length) {
                    const config = root.CollabConfig?.getFirebaseConfig
                        ? root.CollabConfig.getFirebaseConfig()
                        : root.FIREBASE_CONFIG;
                    if (!config) throw new Error('Missing Firebase configuration');
                    firebase.initializeApp(config);
                }

                const auth = firebase.auth();

                // If running on local emulator host, connect to the local Auth emulator
                const host = root.location?.hostname || '';
                const isLocal = host === 'localhost' || host === '127.0.0.1';
                const emulatorUrl = root.FIREBASE_AUTH_EMULATOR_URL ||
                    (typeof process !== 'undefined' && process.env?.FIREBASE_AUTH_EMULATOR_HOST
                        ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`
                        : (isLocal ? 'http://127.0.0.1:9099' : null));

                if (emulatorUrl && !auth._emulatorConnected) {
                    try {
                        auth.useEmulator(emulatorUrl);
                        auth._emulatorConnected = true;
                    } catch (_) {
                        // useEmulator can only be called once before network calls
                    }
                }

                _authInstance = auth;
                return _authInstance;
            })().catch(err => {
                _initPromise = null;
                throw err;
            });
        }
        return _initPromise;
    }

    async function signInWithGoogle() {
        const auth = await getAuthInstance();
        const provider = new root.firebase.auth.GoogleAuthProvider();
        provider.addScope('email');
        provider.addScope('profile');
        provider.setCustomParameters({ prompt: 'select_account' });
        return auth.signInWithRedirect(provider);
    }

    async function getRedirectResult() {
        const auth = await getAuthInstance();
        return auth.getRedirectResult();
    }

    async function signOutUser() {
        const auth = await getAuthInstance();
        return auth.signOut();
    }

    function onAuthChanged(callback) {
        let unsubscribe = null;
        let cancelled = false;

        getAuthInstance().then(auth => {
            if (cancelled) return;
            unsubscribe = auth.onAuthStateChanged(callback);
            if (cancelled && typeof unsubscribe === 'function') {
                unsubscribe();
                unsubscribe = null;
            }
        }).catch(err => {
            console.error('[CollabAuth] Failed to subscribe to auth state:', err);
        });

        return function removeListener() {
            cancelled = true;
            if (typeof unsubscribe === 'function') {
                unsubscribe();
                unsubscribe = null;
            }
        };
    }

    function getCurrentUser() {
        if (!_authInstance) return null;
        return _authInstance.currentUser || null;
    }

    root.CollabAuth = {
        getAuthInstance,
        signInWithGoogle,
        getRedirectResult,
        signOutUser,
        onAuthChanged,
        getCurrentUser
    };
})(typeof window !== 'undefined' ? window : globalThis);
