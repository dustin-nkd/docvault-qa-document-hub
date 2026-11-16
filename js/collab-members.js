/**
 * DocVault Team Members & Roles (Sprint 17 / Phase 7)
 * Manages team membership, invitations, and role-based permissions in COLLAB_MODE.
 */
(function(root) {
    'use strict';

    function isCollabMode() { return typeof root.COLLAB_MODE !== 'undefined' ? Boolean(root.COLLAB_MODE) : false; }
    function isGuestMode() { return typeof root.GUEST_MODE !== 'undefined' ? Boolean(root.GUEST_MODE) : false; }
    function getFirestoreDb() { return root.firebase && typeof root.firebase.firestore === 'function' ? root.firebase.firestore() : null; }

    function getCurrentMember() {
        return root.CollabBootstrap && typeof root.CollabBootstrap.getCurrentMember === 'function' ? root.CollabBootstrap.getCurrentMember() : null;
    }

    function getCurrentRole() {
        const m = getCurrentMember();
        return m && m.role ? m.role : (isCollabMode() ? null : 'owner');
    }

    function isOwner() { return getCurrentRole() === 'owner'; }
    function isEditor() { return getCurrentRole() === 'editor'; }
    function isViewer() { return getCurrentRole() === 'viewer'; }
    function canWrite() { return !isCollabMode() || isOwner() || isEditor(); }

    function hasUnimportedLocalVault() {
        if (typeof localStorage === 'undefined' || localStorage.getItem('docvault_collab_imported_at')) return false;
        const raw = localStorage.getItem('docvault_docs');
        return Boolean(raw && raw !== '[]' && raw !== '{}');
    }

    function esc(s) {
        if (typeof root.escHtml === 'function') return root.escHtml(s || '');
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function makeAction(name, ...args) {
        if (typeof root.actionAttr === 'function') return root.actionAttr(name, ...args);
        return esc(`${name}(${args.map(a => JSON.stringify(a === undefined ? null : String(a))).join(',')})`);
    }

    async function fetchMembers() {
        if (!isCollabMode() || isGuestMode()) return [];
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) return [];
        const snapshot = await db.collection('members').get(), list = [];
        snapshot.forEach(docSnap => {
            const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
            list.push({ uid: docSnap.id, ...data });
        });
        return list;
    }

    async function fetchInvites() {
        if (!isCollabMode() || isGuestMode()) return [];
        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) return [];
        try {
            const snapshot = await db.collection('invites').get(), list = [];
            snapshot.forEach(docSnap => {
                const data = typeof docSnap.data === 'function' ? docSnap.data() : docSnap;
                list.push({ ...data, id: docSnap.id, email: data?.email || docSnap.id });
            });
            return list;
        } catch (_) { return []; }
    }

    async function inviteMember(email, role) {
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can invite members.', 'error');
            return false;
        }
        const trimmedEmail = String(email || '').trim().toLowerCase();
        if (!trimmedEmail) {
            if (typeof root.toast === 'function') root.toast('Please enter a valid email.', 'error');
            return false;
        }
        if (role !== 'editor' && role !== 'viewer') {
            if (typeof root.toast === 'function') root.toast('Role must be editor or viewer.', 'error');
            return false;
        }

        const currentMembers = await fetchMembers();
        if (currentMembers.some(m => (m.email || '').trim().toLowerCase() === trimmedEmail)) {
            if (typeof root.toast === 'function') root.toast('This user is already a team member.', 'warning');
            return false;
        }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

        await db.collection('invites').doc(trimmedEmail).set({ email: trimmedEmail, role: role, createdAt: new Date().toISOString() });

        if (typeof root.toast === 'function') root.toast(`Invitation sent to ${trimmedEmail}`, 'success');
        await loadAndRenderTeam();
        return true;
    }

    async function updateMemberRole(uid, newRole) {
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can change member roles.', 'error');
            return false;
        }
        if (newRole !== 'editor' && newRole !== 'viewer') {
            if (typeof root.toast === 'function') root.toast('Role must be editor or viewer.', 'error');
            return false;
        }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

        const memberDoc = await db.collection('members').doc(uid).get();
        if (!memberDoc.exists) { if (typeof root.toast === 'function') root.toast('Member not found.', 'error'); return false; }
        const currentData = memberDoc.data();
        if (currentData.role === 'owner') { if (typeof root.toast === 'function') root.toast('Cannot change team owner role.', 'error'); return false; }

        await db.collection('members').doc(uid).update({ role: newRole, updatedAt: new Date().toISOString() });
        if (typeof root.toast === 'function') root.toast(`Updated role for ${currentData.email || uid}`, 'success');
        await loadAndRenderTeam();
        return true;
    }

    function restoreSettings() {
        if (typeof root !== 'undefined') root._modalOnClose = null;
        if (typeof root.showGitHubSettingsModal === 'function') {
            root._settingsTab = 'team';
            return root.showGitHubSettingsModal();
        }
        if (typeof root.showSettings === 'function') return root.showSettings();
        if (typeof root.closeModal === 'function') return root.closeModal();
        return loadAndRenderTeam();
    }

    function cancelRemoveMember() {
        restoreSettings();
    }

    function confirmRemoveMember(uid, name) {
        const targetName = name || 'this member';
        if (typeof root.showModal === 'function') {
            if (typeof root !== 'undefined') root._modalOnClose = () => restoreSettings();
            root.showModal(
                `<div class="p-1"><div class="flex items-center gap-2 mb-2 text-amber-500"><i class="fa-solid fa-triangle-exclamation"></i><h3 class="font-heading font-bold text-base" style="color:var(--tx);">Remove team member?</h3></div>` +
                `<p class="text-xs mb-4" style="color:var(--tx-m);">Are you sure you want to remove <b>${esc(targetName)}</b> from the team? They will immediately lose access to all documents in this workspace.</p>` +
                `<div class="flex justify-end gap-2"><button type="button" class="btn-s text-xs px-3 py-1.5" data-onclick="collabCancelRemoveMember()">Cancel</button>` +
                `<button type="button" class="btn-d text-xs px-3 py-1.5" data-onclick="${makeAction('collabExecuteRemoveMember', uid)}">Remove member</button></div></div>`
            );
            return;
        }
        if (typeof root.confirm === 'function' && root.confirm(`Remove ${targetName} from the team?`)) return executeRemoveMember(uid);
    }

    async function executeRemoveMember(uid) {
        if (typeof root !== 'undefined') root._modalOnClose = null;
        try {
            await removeMember(uid);
        } catch (err) {
            console.error('[CollabMembers] executeRemoveMember:', err);
            if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to remove member.', 'error');
        } finally {
            restoreSettings();
        }
    }

    async function removeMember(uid) {
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can remove members.', 'error');
            return false;
        }
        try {
            if (root.ensureFirebase) await root.ensureFirebase();
            const db = getFirestoreDb();
            if (!db) throw new Error('Firestore is not available');
            const memberDoc = await db.collection('members').doc(uid).get();
            if (memberDoc.exists && memberDoc.data()?.role === 'owner') {
                if (typeof root.toast === 'function') root.toast('Cannot remove the team owner.', 'error'); return false;
            }
            await db.collection('members').doc(uid).delete();
            if (typeof root.toast === 'function') root.toast('Member removed.', 'success');
            await loadAndRenderTeam();
            return true;
        } catch (err) {
            console.error('[CollabMembers] removeMember:', err);
            if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to remove member.', 'error');
            return false;
        }
    }

    async function revokeInvite(email) {
        if (!isOwner()) {
            if (typeof root.toast === 'function') root.toast('Only the team owner can revoke invitations.', 'error');
            return false;
        }

        if (root.ensureFirebase) await root.ensureFirebase();
        const db = getFirestoreDb();
        if (!db) throw new Error('Firestore is not available');

        const docId = String(email || '').trim(), lowerId = docId.toLowerCase();
        try {
            await db.collection('invites').doc(docId).delete();
            if (lowerId && lowerId !== docId) await db.collection('invites').doc(lowerId).delete();
            if (typeof root.toast === 'function') root.toast(`Revoked invite for ${lowerId || docId}`, 'success');
            await loadAndRenderTeam();
            return true;
        } catch (err) {
            if (typeof root.toast === 'function') root.toast(err?.message || 'Failed to revoke invite.', 'error');
            return false;
        }
    }

    function renderRoleBadge(role) {
        if (role === 'owner') return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" style="background:rgba(59,130,246,0.15);color:var(--acc);border:1px solid rgba(59,130,246,0.3);"><i class="fa-solid fa-crown text-[9px] mr-1"></i>Owner</span>`;
        if (role === 'editor') return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" style="background:rgba(16,185,129,0.15);color:#10b981;border:1px solid rgba(16,185,129,0.3);"><i class="fa-solid fa-pen text-[9px] mr-1"></i>Editor</span>`;
        return `<span class="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider" style="background:rgba(107,114,128,0.15);color:var(--tx-d);border:1px solid rgba(107,114,128,0.3);"><i class="fa-solid fa-eye text-[9px] mr-1"></i>Viewer</span>`;
    }

    function buildTeamMarkup(members, invites, currentIsOwner) {
        const renderSelect = root.renderSelect || (typeof window !== 'undefined' ? window.renderSelect : null);
        let inviteSectionHtml = '';
        if (currentIsOwner) {
            inviteSectionHtml = `
            <div class="p-3 rounded-lg mb-4" style="background:var(--bg);border:1px solid var(--brd);">
                <div class="text-xs font-bold mb-2 flex items-center gap-1.5" style="color:var(--tx);">
                    <i class="fa-solid fa-user-plus text-[var(--acc)]"></i> Invite Team Member
                </div>
                <input type="email" id="team-invite-email" class="form-input w-full py-1.5 px-3 text-xs mb-2" placeholder="colleague@example.com">
                <div class="flex items-center gap-2">
                    ${renderSelect ? renderSelect('team-invite-role', [{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }], 'editor', 'w-28 py-1.5 px-2.5 text-xs', '', 'Role') : ''}
                    <button type="button" id="team-invite-btn" class="btn-p py-1.5 px-4 text-xs shrink-0 flex items-center gap-1" data-onclick="collabInviteMember()">
                        <i class="fa-solid fa-paper-plane text-[10px]"></i> Invite
                    </button>
                </div>
                <p class="text-[11px] mt-1.5 flex items-center gap-1.5" style="color:var(--tx-d);"><i class="fa-solid fa-circle-info text-[10px]" style="color:var(--acc);"></i><span>They will automatically join the team vault next time they sign in with this Google account.</span></p>
            </div>`;
        }

        const memberEmails = new Set(members.map(m => (m.email || '').trim().toLowerCase()));
        const pendingInvites = invites.filter(inv => !memberEmails.has((inv.email || '').trim().toLowerCase()));

        let pendingInvitesHtml = '';
        if (currentIsOwner && pendingInvites.length > 0) {
            pendingInvitesHtml = `
            <div class="mb-4">
                <div class="text-[11px] font-bold mb-2" style="color:var(--tx-m);">Pending Invitations (${pendingInvites.length})</div>
                <div class="flex flex-col gap-1.5">
                    ${pendingInvites.map(inv => `
                        <div class="flex items-center justify-between p-2 rounded-lg text-xs" style="background:var(--card);border:1px solid var(--brd);">
                            <div class="flex items-center gap-2 min-w-0">
                                <i class="fa-regular fa-envelope text-[var(--tx-d)] text-xs"></i>
                                <span class="font-medium truncate" style="color:var(--tx);">${esc(inv.email)}</span>
                                ${renderRoleBadge(inv.role)}
                            </div>
                            <button type="button" class="btn-d h-7 px-2.5 flex items-center gap-1 text-[10px] shrink-0" data-onclick="${makeAction('collabRevokeInvite', inv.id || inv.email)}" title="Revoke invite">
                                <i class="fa-solid fa-xmark"></i> Revoke
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        }

        const currentMember = getCurrentMember();
        const currentUid = currentMember ? currentMember.uid : null;

        const memberRowsHtml = members.map(m => {
            const isTargetOwner = m.role === 'owner';
            const showControls = currentIsOwner && !isTargetOwner;
            const isYou = Boolean(currentUid && m.uid === currentUid);
            const photoRaw = m.photoURL || m.photoUrl;
            let avatarHtml;
            if (typeof photoRaw === 'string' && /^https:\/\//i.test(photoRaw)) {
                avatarHtml = `<img src="${esc(photoRaw)}" alt="${esc(m.displayName || m.email || 'Member')}" class="collab-member-avatar w-7 h-7 rounded-full object-cover shrink-0 select-none" style="border:1px solid var(--brd);">`;
            } else {
                const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
                let hash = 0, k = String(m.uid || m.email || m.displayName || '');
                for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) & 0xffffffff;
                const color = colors[(hash >>> 0) % colors.length];
                avatarHtml = `<div class="collab-member-avatar w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-bold text-xs text-white select-none" style="background-color:${color};">${esc((m.displayName || m.email || 'U')[0].toUpperCase())}</div>`;
            }
            return `
            <div class="flex items-center justify-between p-2.5 rounded-lg text-xs" style="background:var(--card);border:1px solid var(--brd);">
                <div class="flex items-center gap-2.5 min-w-0">
                    ${avatarHtml}
                    <div class="min-w-0">
                        <div class="font-medium truncate" style="color:var(--tx);">${esc(m.displayName || m.email)}${isYou ? ' <span class="text-[10px] font-normal" style="color:var(--tx-d);">(You)</span>' : ''}</div>
                        <div class="text-[10px] truncate" style="color:var(--tx-d);">${esc(m.email)}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    ${showControls ? `
                        <div class="member-role-select">
                            ${renderSelect ? renderSelect('team-member-role-' + m.uid, [{ value: 'editor', label: 'Editor' }, { value: 'viewer', label: 'Viewer' }], m.role, 'w-24 py-1 px-2 text-[11px]', `collabChangeMemberRole(${JSON.stringify(String(m.uid))}, this.value)`, 'Role') : ''}
                        </div>
                        <button type="button" class="btn-d w-7 h-7 flex items-center justify-center rounded text-xs" data-onclick="${makeAction('collabConfirmRemoveMember', m.uid, m.displayName || m.email || 'this member')}" title="Remove member"><i class="fa-solid fa-trash"></i></button>
                    ` : renderRoleBadge(m.role)}
                </div>
            </div>`;
        }).join('');

        let importSectionHtml = '';
        if (currentIsOwner && hasUnimportedLocalVault()) {
            importSectionHtml = `
            <div class="mt-4 pt-3" style="border-top:1px solid var(--brd);">
                <div class="text-xs font-bold mb-1 flex items-center gap-1.5" style="color:var(--tx);">
                    <i class="fa-solid fa-file-import text-[var(--acc)]"></i> Local Vault Migration
                </div>
                <p class="text-[11px] mb-2" style="color:var(--tx-m);">Import this browser's local default workspace vault into the team Firestore database.</p>
                <button type="button" class="btn-s py-1.5 px-3 text-xs flex items-center gap-1.5" data-onclick="collabStartImport()">
                    <i class="fa-solid fa-upload text-[10px]"></i> Import this browser's vault
                </button>
            </div>`;
        }

        return `
        <div class="text-left">
            <style>
                [data-ui-style="bauhaus"] #collab-team-tab-container .rounded-lg { background: #FFFFFF !important; border: 2px solid #121212 !important; border-radius: 0 !important; box-shadow: 2px 2px 0 0 #121212 !important; }
                [data-ui-style="bauhaus"] #collab-team-tab-container :is([style*="color:var(--tx)"],.font-medium,.text-xs.font-bold) { color: #121212 !important; }
                [data-ui-style="bauhaus"] #collab-team-tab-container :is([style*="color:var(--tx-m)"],[style*="color:var(--tx-d)"]) { color: #555555 !important; font-weight: 600 !important; }
                [data-ui-style="bauhaus"] #collab-team-tab-container .collab-member-avatar { border: 1.5px solid #121212 !important; border-radius: 0 !important; }
                [data-ui-style="bauhaus"] #collab-team-tab-container span.rounded[style*="uppercase"] { border: 1.5px solid #121212 !important; border-radius: 0 !important; box-shadow: 1px 1px 0 0 #121212 !important; }
                [data-ui-style="bauhaus"] #collab-team-tab-container div[style*="border-top"] { border-top: 2px solid #121212 !important; }
                #collab-team-tab-container .member-role-select .custom-select-list { top: auto !important; bottom: 100% !important; margin-top: 0 !important; margin-bottom: 4px !important; }
            </style>
            ${inviteSectionHtml}
            ${pendingInvitesHtml}
            <div>
                <div class="text-[11px] font-bold mb-2" style="color:var(--tx-m);">Team Members (${members.length})</div>
                <div class="flex flex-col gap-1.5 pr-1">
                    ${memberRowsHtml || '<p class="text-xs text-center py-4" style="color:var(--tx-d);">No members found.</p>'}
                </div>
            </div>
            ${importSectionHtml}
        </div>`;
    }

    async function loadAndRenderTeam() {
        const container = document.getElementById('collab-team-tab-container');
        if (!container) return;
        try {
            const [members, invites] = await Promise.all([fetchMembers(), fetchInvites()]);
            container.innerHTML = buildTeamMarkup(members, invites, isOwner());
            if (typeof root.enhanceInteractionSemantics === 'function') root.enhanceInteractionSemantics(container, false);
            if (isOwner() && invites.length > 0) {
                const memberEmails = new Set(members.map(m => (m.email || '').trim().toLowerCase()));
                const stale = invites.filter(inv => memberEmails.has((inv.email || '').trim().toLowerCase()));
                const db = getFirestoreDb();
                if (db && stale.length > 0) {
                    for (const inv of stale) db.collection('invites').doc(inv.id || inv.email).delete().catch(() => {});
                }
            }
        } catch (err) {
            console.error('[CollabMembers] Failed to load team data:', err);
            container.innerHTML = `<div class="p-3 text-xs text-center text-rose-400">Failed to load team data: ${esc(err.message)}</div>`;
        }
    }

    function renderTeamTab() {
        setTimeout(() => { loadAndRenderTeam(); }, 0);
        return `<div id="collab-team-tab-container"><div class="py-8 text-center text-xs" style="color:var(--tx-d);"><i class="fa-solid fa-circle-notch fa-spin text-sm mb-2" style="color:var(--acc);"></i><p>Loading team members…</p></div></div>`;
    }

    function getTeamTab() {
        return { id: 'team', label: 'Team', icon: 'fa-users', render: renderTeamTab };
    }

    // Global handlers for UI elements
    root.collabInviteMember = async function() {
        const emailInput = document.getElementById('team-invite-email'), roleSelect = document.getElementById('team-invite-role');
        const ok = await inviteMember(emailInput?.value || '', roleSelect?.value || 'editor');
        if (ok && emailInput) emailInput.value = '';
    };

    root.collabConfirmRemoveMember = (uid, name) => confirmRemoveMember(uid, name);
    root.collabCancelRemoveMember = () => cancelRemoveMember();
    root.collabExecuteRemoveMember = (uid) => executeRemoveMember(uid);
    root.collabRemoveMember = (uid, name) => confirmRemoveMember(uid, name);
    root.collabChangeMemberRole = (uid, newRole) => updateMemberRole(uid, newRole);
    root.collabRevokeInvite = (email) => revokeInvite(email);
    root.collabStartImport = () => root.CollabImport?.startImport?.();

    // Public API
    const CollabMembers = {
        getCurrentMember, getCurrentRole, isOwner, isEditor, isViewer, canWrite,
        fetchMembers, fetchInvites, inviteMember, updateMemberRole,
        confirmRemoveMember, cancelRemoveMember, executeRemoveMember, removeMember, revokeInvite,
        renderTeamTab, loadAndRenderTeam, getTeamTab, hasUnimportedLocalVault
    };

    root.CollabMembers = CollabMembers;
    if (typeof root.registerSettingsTab === 'function') root.registerSettingsTab(getTeamTab());

})(typeof window !== 'undefined' ? window : globalThis);
