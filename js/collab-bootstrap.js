// DocVault team collaboration bootstrap module
(function(root) {
    let _currentMember = null;

    function esc(str) {
        if (str == null) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderRoleBadge(role) {
        if (role === 'owner') return '<span class="collab-me-badge px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0" style="background:rgba(59,130,246,0.15);color:var(--acc);border:1px solid rgba(59,130,246,0.3);"><i class="fa-solid fa-crown text-[8px] mr-1"></i>Owner</span>';
        if (role === 'editor') return '<span class="collab-me-badge px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-pen text-[8px] mr-1"></i>Editor</span>';
        return '<span class="collab-me-badge px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0" style="background:rgba(107,114,128,0.15);color:var(--tx-d);border:1px solid rgba(107,114,128,0.3);"><i class="fa-solid fa-eye text-[8px] mr-1"></i>Viewer</span>';
    }

    function updateSidebarLockToSignOut() {
        if (typeof document === 'undefined') return;
        const footer = typeof document.getElementById === 'function' ? document.getElementById('sidebar-footer') : null;
        const btn = footer && typeof footer.querySelector === 'function'
            ? (footer.querySelector('[data-onclick="lockVault()"]') || footer.querySelector('[data-onclick="collabSignOut()"]'))
            : (typeof document.querySelector === 'function'
                ? (document.querySelector('#sidebar-footer [data-onclick="lockVault()"]') || document.querySelector('#sidebar-footer [data-onclick="collabSignOut()"]'))
                : null);
        if (!btn) return;
        if (typeof btn.setAttribute === 'function') {
            btn.setAttribute('data-onclick', 'collabSignOut()');
            btn.setAttribute('title', 'Sign out');
        }
        btn.dataset = btn.dataset || {};
        btn.dataset.onclick = 'collabSignOut()';
        btn.title = 'Sign out';

        const icon = btn.querySelector ? btn.querySelector('i') : null;
        if (icon) icon.className = 'fa-solid fa-right-from-bracket';
        const span = btn.querySelector ? btn.querySelector('span') : null;
        if (span) span.textContent = 'Sign out';
    }

    function removeCollabMe() {
        if (typeof document === 'undefined') return;
        const el = (typeof document.getElementById === 'function' ? document.getElementById('collab-me') : null) || (typeof document.querySelector === 'function' ? document.querySelector('#collab-me') : null);
        if (el) { if (typeof el.remove === 'function') el.remove(); else if (el.parentNode) el.parentNode.removeChild(el); }
    }

    function renderCollabMe(user, member) {
        if (typeof document === 'undefined') return;
        const footer = typeof document.getElementById === 'function' ? document.getElementById('sidebar-footer') : null;
        if (!footer) return;
        removeCollabMe();
        if (typeof document.createElement !== 'function') return;

        const displayName = member?.displayName || user?.displayName || member?.email || user?.email || 'Team Member';
        const email = member?.email || user?.email || '', roleBadge = renderRoleBadge(member?.role);
        const photoUrl = (typeof user?.photoURL === 'string' && user.photoURL.startsWith('https://')) ? user.photoURL : '';
        const avatarHtml = photoUrl
            ? `<img src="${esc(photoUrl)}" alt="${esc(displayName)}" class="collab-me-avatar w-8 h-8 rounded-full object-cover shrink-0" style="border:1px solid var(--brd);">`
            : `<div class="collab-me-avatar w-8 h-8 rounded-full shrink-0 flex items-center justify-center font-bold text-xs" style="background:rgba(59,130,246,0.15);color:var(--acc);border:1px solid var(--brd);">${esc((displayName.trim().charAt(0) || 'U').toUpperCase())}</div>`;

        const meEl = document.createElement('div');
        meEl.id = 'collab-me';
        meEl.className = 'px-3 py-2.5 border-b flex items-center gap-2.5';
        meEl.style.borderColor = 'var(--brd)';
        meEl.innerHTML = `
            <style>[data-ui-style="bauhaus"] #collab-me { border-bottom: 2px solid #121212 !important; } [data-ui-style="bauhaus"] #collab-me .collab-me-name { color: #121212 !important; } [data-ui-style="bauhaus"] #collab-me .collab-me-email { color: #555555 !important; font-weight: 600 !important; } [data-ui-style="bauhaus"] #collab-me .collab-me-badge { border: 1.5px solid #121212 !important; border-radius: 0 !important; box-shadow: 1px 1px 0 0 #121212 !important; } [data-ui-style="bauhaus"] #collab-me .collab-me-avatar { border: 1.5px solid #121212 !important; border-radius: 0 !important; }</style>
            ${avatarHtml}
            <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between gap-1">
                    <span class="collab-me-name font-medium text-xs truncate" style="color:var(--tx);">${esc(displayName)}</span>
                    ${roleBadge}
                </div>
                ${email ? `<div class="collab-me-email text-[10px] truncate" style="color:var(--tx-d);">${esc(email)}</div>` : ''}
            </div>
        `.trim();

        if (typeof footer.insertBefore === 'function' && footer.firstChild) footer.insertBefore(meEl, footer.firstChild);
        else if (typeof footer.prepend === 'function') footer.prepend(meEl);
        else if (typeof footer.appendChild === 'function') footer.appendChild(meEl);
    }

    function getFirestoreDb() {
        if (!root.firebase || !root.firebase.firestore) return null;
        const db = root.firebase.firestore();
        const host = root.location?.hostname || '';
        if ((host === 'localhost' || host === '127.0.0.1') && !db._emulatorConnected) {
            try {
                db.useEmulator('127.0.0.1', 8080);
                db._emulatorConnected = true;
            } catch (_) {}
        }
        return db;
    }

    async function createTeam(userOrDb, maybeUser) {
        let db, user;
        if (userOrDb && typeof userOrDb.collection === 'function') {
            db = userOrDb; user = maybeUser;
        } else {
            user = userOrDb; db = maybeUser || getFirestoreDb();
        }
        if (!user) throw new Error('User required to create team');
        if (!db) throw new Error('Firestore is not available');
        const now = new Date().toISOString();
        const teamData = { ownerUid: user.uid, name: 'DocVault Team', createdAt: now, initialized: true };
        const ownerMember = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || user.email || 'Owner',
            displayName: user.displayName || user.email || 'Team Owner',
            role: 'owner',
            joinedAt: Date.now(), createdAt: now, updatedAt: now
        };
        try {
            if (typeof db.batch === 'function') {
                const batch = db.batch();
                batch.set(db.collection('meta').doc('team'), teamData);
                batch.set(db.collection('members').doc(user.uid), ownerMember);
                await batch.commit();
            } else if (typeof db.runTransaction === 'function') {
                await db.runTransaction(async tx => {
                    tx.set(db.collection('meta').doc('team'), teamData);
                    tx.set(db.collection('members').doc(user.uid), ownerMember);
                });
            } else {
                await db.collection('meta').doc('team').set(teamData);
                await db.collection('members').doc(user.uid).set(ownerMember);
            }
        } catch (_) {
            await db.collection('meta').doc('team').set(teamData);
            await db.collection('members').doc(user.uid).set(ownerMember);
        }
        _currentMember = ownerMember;
        return { status: 'owner', role: 'owner', member: ownerMember };
    }

    async function initTeamUser(user) {
        if (!user) return { status: 'unauthenticated' };
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');
        if (root.CollabStore?.enableOfflinePersistence) {
            await root.CollabStore.enableOfflinePersistence(db);
        }

        let isTeamInitialized = false, teamData = null;
        try {
            const metaSnap = await db.collection('meta').doc('team').get();
            isTeamInitialized = metaSnap.exists;
            if (metaSnap.exists) {
                teamData = (typeof metaSnap.data === 'function') ? metaSnap.data() : metaSnap.data;
            }
        } catch (err) {
            const isPermissionDenied = err?.code === 'permission-denied' || err?.code === 7 || String(err?.message || '').includes('PERMISSION_DENIED');
            if (isPermissionDenied) isTeamInitialized = true; else throw err;
        }

        if (!isTeamInitialized) {
            return await createTeam(db, user);
        }

        let memberSnap = null;
        memberSnap = await db.collection('members').doc(user.uid).get();

        if (memberSnap && memberSnap.exists) {
            const memberData = memberSnap.data();
            _currentMember = memberData;
            if (user.email) {
                const em = (user.email || '').trim();
                const d1 = db.collection('invites').doc(em);
                if (typeof d1?.delete === 'function') d1.delete().catch(() => {});
                if (em.toLowerCase() !== em) {
                    const d2 = db.collection('invites').doc(em.toLowerCase());
                    if (typeof d2?.delete === 'function') d2.delete().catch(() => {});
                }
            }
            return { status: 'member', role: memberData.role, member: memberData };
        }

        // Owner Bootstrap Lockout Recovery: if meta/team.ownerUid === user.uid (or team is initialized) and members/{uid} is missing,
        // automatically recreate the owner member document and continue as owner instead of returning 'uninvited'.
        if (teamData?.ownerUid === user.uid || (!teamData && isTeamInitialized)) {
            try {
                const now = new Date().toISOString();
                const ownerMember = {
                    uid: user.uid, role: 'owner',
                    name: user.displayName || user.email || 'Owner',
                    displayName: user.displayName || user.email || 'Team Owner',
                    email: user.email || '', joinedAt: Date.now(), createdAt: now, updatedAt: now
                };
                await db.collection('members').doc(user.uid).set(ownerMember);
                _currentMember = ownerMember;
                return { status: 'owner', role: 'owner', member: ownerMember };
            } catch (_) {}
        }

        let inviteSnap = null, matchedInviteId = null;
        const rawEmail = (user.email || '').trim(), normalizedEmail = rawEmail.toLowerCase();
        if (rawEmail) {
            inviteSnap = await db.collection('invites').doc(rawEmail).get();
            if (inviteSnap?.exists) matchedInviteId = rawEmail;
            else if (normalizedEmail && normalizedEmail !== rawEmail) {
                inviteSnap = await db.collection('invites').doc(normalizedEmail).get();
                if (inviteSnap?.exists) matchedInviteId = normalizedEmail;
            }
        }

        if (inviteSnap && inviteSnap.exists) {
            const inviteData = inviteSnap.data(), now = new Date().toISOString();
            const newMember = {
                uid: user.uid, email: normalizedEmail || rawEmail,
                displayName: user.displayName || normalizedEmail || 'Team Member',
                role: inviteData.role, createdAt: now, updatedAt: now
            };
            await db.collection('members').doc(user.uid).set(newMember);
            const toDel = new Set([matchedInviteId, rawEmail, normalizedEmail].filter(Boolean));
            for (const id of toDel) await db.collection('invites').doc(id).delete().catch(() => {});
            _currentMember = newMember;
            return { status: 'member', role: inviteData.role, member: newMember };
        }

        _currentMember = null;
        return { status: 'uninvited', message: 'Ask an owner for an invite' };
    }

    function showCollabLockScreen(state = 'signin', errorMessage = '') {
        const ls = document.getElementById('lock-screen');
        if (!ls) return;
        ls.classList.remove('hidden');

        const form = ls.querySelector('form[data-onsubmit="unlockVaultFromForm()"]');
        if (form) form.classList.add('hidden');
        document.getElementById('lock-demo-btn')?.classList.add('hidden');
        document.getElementById('lock-pwd-hint')?.classList.add('hidden');
        document.getElementById('lock-recovery-toggle')?.classList.add('hidden');
        document.getElementById('lock-recovery-panel')?.classList.add('hidden');
        document.getElementById('lock-screen-sub')?.classList.add('hidden');

        const collabPanel = document.getElementById('collab-lock-panel');
        if (collabPanel) collabPanel.classList.remove('hidden');

        const signinBtn = document.getElementById('collab-google-signin-btn');
        const uninvitedCard = document.getElementById('collab-uninvited-card');
        const hint = document.getElementById('lock-screen-hint');

        if (state === 'uninvited') {
            if (signinBtn) signinBtn.classList.add('hidden');
            if (uninvitedCard) uninvitedCard.classList.remove('hidden');
            const uninvitedTitle = document.getElementById('collab-uninvited-title');
            const uninvitedText = document.getElementById('collab-uninvited-text');
            if (uninvitedTitle) uninvitedTitle.textContent = 'Access Restricted';
            if (uninvitedText) uninvitedText.textContent = 'Ask an owner for an invite';
            if (hint) hint.textContent = 'Team collaboration mode';
        } else if (state === 'error') {
            if (signinBtn) signinBtn.classList.remove('hidden');
            if (uninvitedCard) uninvitedCard.classList.add('hidden');
            if (hint) hint.textContent = errorMessage || 'Failed to connect. Please try again.';
        } else {
            if (signinBtn) signinBtn.classList.remove('hidden');
            if (uninvitedCard) uninvitedCard.classList.add('hidden');
            if (hint) hint.textContent = 'Sign in with Google to access the team vault.';
        }
    }

    async function handleUserAuth(user) {
        if (!user) {
            removeCollabMe();
            showCollabLockScreen('signin');
            return;
        }

        try {
            const res = await initTeamUser(user);
            if (res.status === 'uninvited') {
                removeCollabMe();
                showCollabLockScreen('uninvited');
                return;
            }

            if (res.status === 'owner' || res.status === 'member') {
                renderCollabMe(user, res.member);
                updateSidebarLockToSignOut();
                await Promise.all([loadCollabViewer(), loadCollabWorkspaces(), loadCollabActivity(), loadCollabAssign(), loadCollabComments()]);
                await root.CollabWorkspaces?.loadWorkspaces?.();
                root.CollabActivity?.startListening?.();
                root.CollabAssign?.startListening?.();
                root.CollabViewer?.applyViewerRestrictions?.();
                const ls = document.getElementById('lock-screen');
                if (ls) ls.classList.add('hidden');
                if (typeof root.startApp === 'function') {
                    await root.startApp();
                    root.CollabViewer?.applyViewerRestrictions?.();
                }
            }
        } catch (err) {
            console.error('[CollabBootstrap] User initialization failed:', err);
            removeCollabMe();
            showCollabLockScreen('error', err.message || 'Failed to connect. Please try again.');
        }
    }

    const _pendingScripts = {};
    function _loadScript(srcUrl) {
        if (_pendingScripts[srcUrl]) return _pendingScripts[srcUrl];
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return Promise.resolve();
        const p = new Promise(resolve => {
            const s = document.createElement('script');
            s.onload = () => { delete _pendingScripts[srcUrl]; resolve(); };
            s.onerror = () => { delete _pendingScripts[srcUrl]; resolve(); };
            s.src = srcUrl;
            const parent = document.head || document.body || document.documentElement || document;
            if (parent && typeof parent.appendChild === 'function') parent.appendChild(s);
            else { delete _pendingScripts[srcUrl]; resolve(); }
        });
        _pendingScripts[srcUrl] = p;
        return p;
    }

    function loadCollabViewer() { if (root.CollabViewer) { root.CollabViewer.applyViewerRestrictions(); return Promise.resolve(); } let s = {}; s.src = 'js/collab-viewer.js'; return _loadScript(s.src).then(() => root.CollabViewer?.applyViewerRestrictions?.()); }
    function loadCollabWorkspaces() { if (root.CollabWorkspaces) return Promise.resolve(); let s = {}; s.src = 'js/collab-workspaces.js'; return _loadScript(s.src); }
    function loadCollabActivity() { if (root.CollabActivity) return Promise.resolve(); let s = {}; s.src = 'js/collab-activity.js'; return _loadScript(s.src); }
    function loadCollabAssign() { if (root.CollabAssign) return Promise.resolve(); let s = {}; s.src = 'js/collab-assign.js'; return _loadScript(s.src); }
    function loadCollabComments() { if (root.CollabComments) return Promise.resolve(); let s = {}; s.src = 'js/collab-comments.js'; return _loadScript(s.src); }

    function start() {
        loadCollabViewer();
        loadCollabWorkspaces();
        loadCollabActivity();
        loadCollabAssign();
        loadCollabComments();
        showCollabLockScreen('signin');
        updateSidebarLockToSignOut();

        // Conclude any pending OAuth redirect flow without triggering handleUserAuth
        if (root.CollabAuth?.getRedirectResult) {
            root.CollabAuth.getRedirectResult().catch(err => {
                console.error('[CollabBootstrap] Redirect result error:', err);
            });
        }

        // Only onAuthChanged invokes handleUserAuth
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
        root.CollabViewer?.applyViewerRestrictions?.();
        if (root.CollabStore?.stopListening) root.CollabStore.stopListening();
        if (root.CollabWorkspaces?.stopListening) root.CollabWorkspaces.stopListening();
        if (root.CollabActivity?.stopListening) root.CollabActivity.stopListening();
        if (root.CollabAssign?.stopListening) root.CollabAssign.stopListening();
        if (root.CollabComments?.stopListening) root.CollabComments.stopListening();
        if (root.CollabAuth?.signOutUser) {
            await root.CollabAuth.signOutUser().catch(() => {});
        }
        removeCollabMe();
        showCollabLockScreen('signin');
    }

    root.CollabBootstrap = {
        initTeamUser,
        createTeam,
        handleUserAuth,
        start,
        signOut,
        showCollabLockScreen,
        updateSidebarLockToSignOut,
        renderCollabMe,
        removeCollabMe,
        loadCollabViewer,
        loadCollabWorkspaces,
        loadCollabActivity,
        loadCollabAssign,
        loadCollabComments,
        applyViewerRestrictions: () => root.CollabViewer?.applyViewerRestrictions?.(),
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

    loadCollabViewer(); loadCollabWorkspaces(); loadCollabActivity(); loadCollabAssign(); loadCollabComments();
})(typeof window !== 'undefined' ? window : globalThis);
