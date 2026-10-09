// DocVault team collaboration bootstrap module
// Manages Google sign-in on lock screen, team initialization, and member access verification.
(function(root) {
    let _currentMember = null;

    function getFirestoreDb() {
        if (!root.firebase || !root.firebase.firestore) return null;
        const db = root.firebase.firestore();
        const host = root.location?.hostname || '';
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        if (isLocal && !db._emulatorConnected) {
            try {
                db.useEmulator('127.0.0.1', 8080);
                db._emulatorConnected = true;
            } catch (_) {}
        }
        return db;
    }

    async function initTeamUser(user) {
        if (!user) return { status: 'unauthenticated' };

        if (root.ensureFirebase) {
            await root.ensureFirebase();
        }

        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

        // Check if meta/team already exists
        let isTeamInitialized = false;
        try {
            const metaSnap = await db.collection('meta').doc('team').get();
            isTeamInitialized = metaSnap.exists;
        } catch (err) {
            // Under firestore.rules, strangers receive permission-denied once team exists
            isTeamInitialized = true;
        }

        // First user bootstrapping: create meta/team and member with role owner
        if (!isTeamInitialized) {
            const now = new Date().toISOString();
            await db.collection('meta').doc('team').set({
                ownerUid: user.uid,
                name: 'DocVault Team',
                createdAt: now,
                initialized: true
            });

            const ownerMember = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || user.email || 'Team Owner',
                role: 'owner',
                createdAt: now,
                updatedAt: now
            };
            await db.collection('members').doc(user.uid).set(ownerMember);
            _currentMember = ownerMember;
            return { status: 'owner', role: 'owner', member: ownerMember };
        }

        // Team already exists: check if current user is an existing member
        let memberSnap = null;
        try {
            memberSnap = await db.collection('members').doc(user.uid).get();
        } catch (_) {}

        if (memberSnap && memberSnap.exists) {
            const memberData = memberSnap.data();
            _currentMember = memberData;
            return { status: 'member', role: memberData.role, member: memberData };
        }

        // Check if an invite exists for user's Google email
        let inviteSnap = null;
        if (user.email) {
            try {
                inviteSnap = await db.collection('invites').doc(user.email).get();
            } catch (_) {}
        }

        if (inviteSnap && inviteSnap.exists) {
            const inviteData = inviteSnap.data();
            const now = new Date().toISOString();
            const newMember = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email || 'Team Member',
                role: inviteData.role,
                createdAt: now,
                updatedAt: now
            };
            await db.collection('members').doc(user.uid).set(newMember);
            await db.collection('invites').doc(user.email).delete().catch(() => {});
            _currentMember = newMember;
            return { status: 'member', role: inviteData.role, member: newMember };
        }

        // Authenticated user with no invite: blocked from accessing or creating team data
        _currentMember = null;
        return {
            status: 'uninvited',
            message: 'Ask an owner for an invite'
        };
    }

    function showCollabLockScreen(state = 'signin') {
        const ls = document.getElementById('lock-screen');
        if (!ls) return;
        ls.classList.remove('hidden');

        // Hide legacy master password elements
        const form = ls.querySelector('form[data-onsubmit="unlockVaultFromForm()"]');
        if (form) form.classList.add('hidden');
        document.getElementById('lock-demo-btn')?.classList.add('hidden');
        document.getElementById('lock-pwd-hint')?.classList.add('hidden');
        document.getElementById('lock-recovery-toggle')?.classList.add('hidden');
        document.getElementById('lock-recovery-panel')?.classList.add('hidden');
        document.getElementById('lock-screen-sub')?.classList.add('hidden');

        // Show collab lock panel
        const collabPanel = document.getElementById('collab-lock-panel');
        if (collabPanel) collabPanel.classList.remove('hidden');

        const signinBtn = document.getElementById('collab-google-signin-btn');
        const uninvitedCard = document.getElementById('collab-uninvited-card');
        const hint = document.getElementById('lock-screen-hint');

        if (state === 'uninvited') {
            if (signinBtn) signinBtn.classList.add('hidden');
            if (uninvitedCard) uninvitedCard.classList.remove('hidden');
            if (hint) hint.textContent = 'Team collaboration mode';
        } else {
            if (signinBtn) signinBtn.classList.remove('hidden');
            if (uninvitedCard) uninvitedCard.classList.add('hidden');
            if (hint) hint.textContent = 'Sign in with Google to access the team vault.';
        }
    }

    async function handleUserAuth(user) {
        if (!user) {
            showCollabLockScreen('signin');
            return;
        }

        try {
            const res = await initTeamUser(user);
            if (res.status === 'uninvited') {
                showCollabLockScreen('uninvited');
                return;
            }

            if (res.status === 'owner' || res.status === 'member') {
                const ls = document.getElementById('lock-screen');
                if (ls) ls.classList.add('hidden');
                if (typeof root.startApp === 'function') {
                    await root.startApp();
                }
            }
        } catch (err) {
            console.error('[CollabBootstrap] User initialization failed:', err);
            showCollabLockScreen('signin');
        }
    }

    function start() {
        showCollabLockScreen('signin');

        // Process any pending redirect auth result
        if (root.CollabAuth?.getRedirectResult) {
            root.CollabAuth.getRedirectResult().then(res => {
                if (res && res.user) {
                    handleUserAuth(res.user);
                }
            }).catch(err => {
                console.error('[CollabBootstrap] Redirect result error:', err);
            });
        }

        // Subscribe to auth state changes
        if (root.CollabAuth?.onAuthChanged) {
            if (root._collabAuthUnsub) {
                root._collabAuthUnsub();
            }
            root._collabAuthUnsub = root.CollabAuth.onAuthChanged(user => {
                handleUserAuth(user);
            });
        }
    }

    async function signOut() {
        if (root._collabAuthUnsub) {
            root._collabAuthUnsub();
            root._collabAuthUnsub = null;
        }
        _currentMember = null;
        if (root.CollabAuth?.signOutUser) {
            await root.CollabAuth.signOutUser().catch(() => {});
        }
        showCollabLockScreen('signin');
    }

    root.CollabBootstrap = {
        initTeamUser,
        handleUserAuth,
        start,
        signOut,
        showCollabLockScreen,
        getCurrentMember: () => _currentMember
    };

    root.collabSignInWithGoogle = async function() {
        if (root.CollabAuth?.signInWithGoogle) {
            return root.CollabAuth.signInWithGoogle();
        }
    };

    root.collabSignOut = async function() {
        return signOut();
    };
})(typeof window !== 'undefined' ? window : globalThis);
