import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createMembersContext(options = {}) {
    const memberStore = new Map(options.initialMembers ? Object.entries(options.initialMembers) : []);
    const inviteStore = new Map(options.initialInvites ? Object.entries(options.initialInvites) : []);

    const calls = {
        memberGets: 0,
        memberSets: [],
        memberUpdates: [],
        memberDeletes: [],
        inviteGets: 0,
        inviteSets: [],
        inviteDeletes: []
    };
    const toasts = [];

    const firestoreMock = {
        collection: (colName) => {
            if (colName === 'members') {
                return {
                    get: async () => {
                        calls.memberGets++;
                        const docs = [];
                        for (const [id, data] of memberStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    doc: (docId) => ({
                        get: async () => {
                            const exists = memberStore.has(docId);
                            const data = exists ? JSON.parse(JSON.stringify(memberStore.get(docId))) : null;
                            return { exists, data: () => data };
                        },
                        set: async (data) => {
                            calls.memberSets.push({ id: docId, data });
                            memberStore.set(docId, JSON.parse(JSON.stringify(data)));
                        },
                        update: async (data) => {
                            calls.memberUpdates.push({ id: docId, data });
                            const existing = memberStore.get(docId) || {};
                            memberStore.set(docId, { ...existing, ...data });
                        },
                        delete: async () => {
                            calls.memberDeletes.push(docId);
                            memberStore.delete(docId);
                        }
                    })
                };
            }
            if (colName === 'invites') {
                return {
                    get: async () => {
                        calls.inviteGets++;
                        const docs = [];
                        for (const [id, data] of inviteStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    doc: (docId) => ({
                        get: async () => {
                            const exists = inviteStore.has(docId);
                            const data = exists ? JSON.parse(JSON.stringify(inviteStore.get(docId))) : null;
                            return { exists, data: () => data };
                        },
                        set: async (data) => {
                            calls.inviteSets.push({ id: docId, data });
                            inviteStore.set(docId, JSON.parse(JSON.stringify(data)));
                        },
                        delete: async () => {
                            calls.inviteDeletes.push(docId);
                            inviteStore.delete(docId);
                        }
                    })
                };
            }
            throw new Error(`Unexpected collection in test: ${colName}`);
        }
    };

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        COLLAB_MODE: options.collabMode !== undefined ? options.collabMode : true,
        GUEST_MODE: options.guestMode !== undefined ? options.guestMode : false,
        firebase: {
            firestore: () => firestoreMock
        },
        ensureFirebase: async () => {},
        CollabBootstrap: {
            getCurrentMember: () => options.currentMember || { uid: 'owner-1', email: 'owner@example.com', role: 'owner' }
        },
        toast: (msg, type) => {
            toasts.push({ msg, type });
        },
        memberStore,
        inviteStore,
        calls,
        toasts,
        document: {
            getElementById: (id) => {
                return {
                    id,
                    value: '',
                    classList: { add() {}, remove() {}, contains() { return false; } },
                    setAttribute() {},
                    removeAttribute() {},
                    querySelectorAll() { return []; }
                };
            }
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    vm.createContext(ctx);
    vm.runInContext(read('js/utils.js'), ctx);
    vm.runInContext(read('js/render-editor.js'), ctx);
    vm.runInContext(read('js/collab-members.js'), ctx);
    return ctx;
}

test('role helpers accurately reflect current member role', () => {
    // 1. Owner
    const ctxOwner = createMembersContext({
        currentMember: { uid: 'u1', role: 'owner', email: 'o@example.com' }
    });
    assert.equal(ctxOwner.CollabMembers.getCurrentRole(), 'owner');
    assert.equal(ctxOwner.CollabMembers.isOwner(), true);
    assert.equal(ctxOwner.CollabMembers.isEditor(), false);
    assert.equal(ctxOwner.CollabMembers.isViewer(), false);
    assert.equal(ctxOwner.CollabMembers.canWrite(), true);

    // 2. Editor
    const ctxEditor = createMembersContext({
        currentMember: { uid: 'u2', role: 'editor', email: 'e@example.com' }
    });
    assert.equal(ctxEditor.CollabMembers.getCurrentRole(), 'editor');
    assert.equal(ctxEditor.CollabMembers.isOwner(), false);
    assert.equal(ctxEditor.CollabMembers.isEditor(), true);
    assert.equal(ctxEditor.CollabMembers.isViewer(), false);
    assert.equal(ctxEditor.CollabMembers.canWrite(), true);

    // 3. Viewer
    const ctxViewer = createMembersContext({
        currentMember: { uid: 'u3', role: 'viewer', email: 'v@example.com' }
    });
    assert.equal(ctxViewer.CollabMembers.getCurrentRole(), 'viewer');
    assert.equal(ctxViewer.CollabMembers.isOwner(), false);
    assert.equal(ctxViewer.CollabMembers.isEditor(), false);
    assert.equal(ctxViewer.CollabMembers.isViewer(), true);
    assert.equal(ctxViewer.CollabMembers.canWrite(), false);
});

test('Team tab registers in actions-settings.js via registerSettingsTab hook', () => {
    const ctx = {
        console,
        window: {},
        COLLAB_MODE: true,
        CollabBootstrap: { getCurrentMember: () => ({ role: 'owner' }) }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    vm.createContext(ctx);
    vm.runInContext(read('js/actions-settings.js'), ctx);
    assert.equal(typeof ctx.registerSettingsTab, 'function');

    vm.runInContext(read('js/collab-members.js'), ctx);
    assert.ok(ctx.CollabMembers);

    const teamTab = ctx.CollabMembers.getTeamTab();
    assert.equal(teamTab.id, 'team');
    assert.equal(teamTab.label, 'Team');
    assert.equal(teamTab.icon, 'fa-users');
});

test('Team tab markup: owner sees invite form & role select, editor does not', async () => {
    // 1. Owner
    const ctxOwner = createMembersContext({
        currentMember: { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
            'member-2': { uid: 'member-2', email: 'editor@example.com', role: 'editor' }
        },
        initialInvites: {
            'pending@example.com': { email: 'pending@example.com', role: 'viewer' }
        }
    });

    const members = await ctxOwner.CollabMembers.fetchMembers();
    const invites = await ctxOwner.CollabMembers.fetchInvites();
    assert.equal(members.length, 2);
    assert.equal(invites.length, 1);

    // Render team tab markup
    let containerHtml = '';
    const domNodes = new Map();
    ctxOwner.document.getElementById = (id) => {
        if (id === 'collab-team-tab-container') {
            return {
                set innerHTML(html) { containerHtml = html; },
                get innerHTML() { return containerHtml; }
            };
        }
        if (!domNodes.has(id)) {
            domNodes.set(id, {
                id,
                value: '',
                classList: { add() {}, remove() {}, contains() { return false; } },
                setAttribute() {},
                removeAttribute() {},
                querySelectorAll() { return []; }
            });
        }
        return domNodes.get(id);
    };

    await ctxOwner.CollabMembers.loadAndRenderTeam();
    assert.match(containerHtml, /id="team-invite-email"/);
    assert.match(containerHtml, /id="team-invite-role"/);
    assert.match(containerHtml, /id="team-invite-btn"/);
    assert.match(containerHtml, /data-onclick="collabInviteMember\(\)"/);
    assert.match(containerHtml, /Pending Invitations/);
    assert.match(containerHtml, /pending@example\.com/);
    assert.match(containerHtml, /custom-select-wrapper/);
    assert.match(containerHtml, /role="combobox"/);
    assert.doesNotMatch(containerHtml, /<select\b/i, 'Team tab HTML must not contain <select> tags');
    assert.match(containerHtml, /team-member-role-member-2/);
    assert.match(containerHtml, /collabChangeMemberRole/);
    // You assertion for owner fixture (owner-1 is current user)
    assert.equal((containerHtml.match(/\bYou\b/g) || []).length, 1, 'Owner markup must contain You for exactly one person');
    assert.match(containerHtml, /owner@example\.com\s*<span[^>]*>\(You\)/, 'owner-1 must have You');
    assert.doesNotMatch(containerHtml, /editor@example\.com\s*<span[^>]*>\(You\)/, 'member-2 must not have You in owner session');

    // Test selecting Viewer for member-2 calls collabChangeMemberRole with that uid and viewer
    ctxOwner.selectCustomOption(
        'team-member-role-member-2',
        'viewer',
        'Viewer',
        "collabChangeMemberRole('member-2', this.value)"
    );
    await new Promise(r => setTimeout(r, 20));
    assert.equal(ctxOwner.memberStore.get('member-2').role, 'viewer');
    assert.ok(ctxOwner.calls.memberUpdates.some(u => u.id === 'member-2' && u.data.role === 'viewer'));

    // 2. Editor
    const ctxEditor = createMembersContext({
        currentMember: { uid: 'member-2', email: 'editor@example.com', role: 'editor' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
            'member-2': { uid: 'member-2', email: 'editor@example.com', role: 'editor' }
        }
    });

    let editorContainerHtml = '';
    ctxEditor.document.getElementById = (id) => {
        if (id === 'collab-team-tab-container') {
            return {
                set innerHTML(html) { editorContainerHtml = html; },
                get innerHTML() { return editorContainerHtml; }
            };
        }
        return {
            id,
            value: '',
            classList: { add() {}, remove() {}, contains() { return false; } },
            setAttribute() {},
            removeAttribute() {},
            querySelectorAll() { return []; }
        };
    };

    await ctxEditor.CollabMembers.loadAndRenderTeam();
    assert.doesNotMatch(editorContainerHtml, /id="team-invite-email"/);
    assert.doesNotMatch(editorContainerHtml, /id="team-invite-btn"/);
    assert.doesNotMatch(editorContainerHtml, /Pending Invitations/);
    assert.doesNotMatch(editorContainerHtml, /team-member-role-/);
    assert.doesNotMatch(editorContainerHtml, /collabChangeMemberRole/);
    assert.doesNotMatch(editorContainerHtml, /<select\b/i, 'Editor markup must not contain <select> tags');
    // You assertion for editor fixture (member-2 is current user)
    assert.equal((editorContainerHtml.match(/\bYou\b/g) || []).length, 1, 'Editor markup must contain You for exactly one person');
    assert.match(editorContainerHtml, /editor@example\.com\s*<span[^>]*>\(You\)/, 'member-2 must have You');
    assert.doesNotMatch(editorContainerHtml, /owner@example\.com\s*<span[^>]*>\(You\)/, 'owner-1 must not have You in editor session');
});

test('inviteMember creates invites/{email} with normalized lowercase email and role editor/viewer', async () => {
    const ctx = createMembersContext({
        currentMember: { uid: 'owner-uid', email: 'owner@example.com', role: 'owner' }
    });

    // 1. Successful invite with mixed case email
    const mixedEmail = 'John.Doe@Company.COM';
    const normalizedEmail = 'john.doe@company.com';
    const ok = await ctx.CollabMembers.inviteMember(mixedEmail, 'editor');
    assert.equal(ok, true);
    assert.ok(ctx.inviteStore.has(normalizedEmail), 'Invite doc id must be normalized to lowercase for auth token match');
    assert.equal(ctx.inviteStore.get(normalizedEmail).email, normalizedEmail);
    assert.equal(ctx.inviteStore.get(normalizedEmail).role, 'editor');

    // 2. Attempt to invite with owner role is blocked
    const okOwner = await ctx.CollabMembers.inviteMember('hacker@example.com', 'owner');
    assert.equal(okOwner, false);
    assert.equal(ctx.inviteStore.has('hacker@example.com'), false);
    assert.ok(ctx.toasts.some(t => t.msg.includes('Role must be editor or viewer')));

    // 3. Non-owner attempting to invite is blocked
    const ctxNonOwner = createMembersContext({
        currentMember: { uid: 'editor-uid', email: 'editor@example.com', role: 'editor' }
    });
    const okNonOwner = await ctxNonOwner.CollabMembers.inviteMember('guest@example.com', 'viewer');
    assert.equal(okNonOwner, false);
    assert.equal(ctxNonOwner.inviteStore.has('guest@example.com'), false);
    assert.ok(ctxNonOwner.toasts.some(t => t.msg.includes('Only the team owner can invite members')));
});

test('updateMemberRole updates role between editor and viewer, forbids owner changes', async () => {
    const ctx = createMembersContext({
        currentMember: { uid: 'owner-uid', email: 'owner@example.com', role: 'owner' },
        initialMembers: {
            'owner-uid': { uid: 'owner-uid', email: 'owner@example.com', role: 'owner' },
            'member-uid': { uid: 'member-uid', email: 'member@example.com', role: 'editor' }
        }
    });

    // 1. Valid role update from editor to viewer
    const ok = await ctx.CollabMembers.updateMemberRole('member-uid', 'viewer');
    assert.equal(ok, true);
    assert.equal(ctx.memberStore.get('member-uid').role, 'viewer');

    // 2. Cannot promote member to owner (no second owner)
    const okOwner = await ctx.CollabMembers.updateMemberRole('member-uid', 'owner');
    assert.equal(okOwner, false);
    assert.equal(ctx.memberStore.get('member-uid').role, 'viewer');
    assert.ok(ctx.toasts.some(t => t.msg.includes('Role must be editor or viewer')));

    // 3. Cannot change role of the owner
    const okDemoteOwner = await ctx.CollabMembers.updateMemberRole('owner-uid', 'editor');
    assert.equal(okDemoteOwner, false);
    assert.equal(ctx.memberStore.get('owner-uid').role, 'owner');
    assert.ok(ctx.toasts.some(t => t.msg.includes('Cannot change team owner role')));

    // 4. Non-owner cannot update roles
    const ctxEditor = createMembersContext({
        currentMember: { uid: 'member-uid', email: 'member@example.com', role: 'editor' },
        initialMembers: {
            'member-uid': { uid: 'member-uid', email: 'member@example.com', role: 'editor' }
        }
    });
    const okEditor = await ctxEditor.CollabMembers.updateMemberRole('member-uid', 'viewer');
    assert.equal(okEditor, false);
    assert.ok(ctxEditor.toasts.some(t => t.msg.includes('Only the team owner can change member roles')));
});

test('removeMember and revokeInvite only allowed for owner, cannot remove owner', async () => {
    const ctx = createMembersContext({
        currentMember: { uid: 'owner-uid', email: 'owner@example.com', role: 'owner' },
        initialMembers: {
            'owner-uid': { uid: 'owner-uid', email: 'owner@example.com', role: 'owner' },
            'member-uid': { uid: 'member-uid', email: 'member@example.com', role: 'viewer' }
        },
        initialInvites: {
            'inv@example.com': { email: 'inv@example.com', role: 'editor' }
        }
    });

    // 1. Owner cannot remove owner
    const delOwner = await ctx.CollabMembers.removeMember('owner-uid');
    assert.equal(delOwner, false);
    assert.ok(ctx.memberStore.has('owner-uid'));

    // 2. Owner removes viewer member
    const delMember = await ctx.CollabMembers.removeMember('member-uid');
    assert.equal(delMember, true);
    assert.equal(ctx.memberStore.has('member-uid'), false);

    // 3. Owner revokes invite
    const revoke = await ctx.CollabMembers.revokeInvite('inv@example.com');
    assert.equal(revoke, true);
    assert.equal(ctx.inviteStore.has('inv@example.com'), false);
});

test('CLIENT VERIFICATION: viewer cannot write — local documents remain unchanged and Firestore write methods are never called', async () => {
    const initialDocuments = [
        { id: 'doc-1', title: 'Original Doc', category: 'general', status: 'draft', kanbanStatus: 'todo', updatedAt: 1000 },
        { id: 'doc-trash', title: 'Trashed Doc', category: 'general', status: 'deleted', updatedAt: 1000 }
    ];

    const firestoreCalls = {
        set: 0,
        update: 0,
        delete: 0
    };

    const toasts = [];

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        COLLAB_MODE: true,
        GUEST_MODE: false,
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'viewer-uid', email: 'viewer@example.com', role: 'viewer' })
        },
        toast: (msg, type) => {
            toasts.push({ msg, type });
        },
        t: (k) => k,
        state: { view: 'documents', category: 'all' },
        documents: JSON.parse(JSON.stringify(initialDocuments)),
        DocStorage: {
            addDeletedIds: async () => {},
            removeDeletedIds: async () => {},
            addResurrectedIds: async () => {},
            cleanOrphanedDocReferences: () => {}
        },
        ActivityLog: {
            record: () => {}
        },
        persist: async () => {
            throw new Error('persist() must NOT be called by viewer!');
        },
        render: () => {},
        renderContent: () => {},
        closeModal: () => {},
        _revokeSharesForDeleted: async () => {},
        getEditorMarkdown: () => '# Edited markdown content',
        addEventListener: () => {},
        removeEventListener: () => {},
        location: { search: '' },
        URLSearchParams,
        localStorage: {
            getItem: (k) => null,
            setItem: (k, v) => {},
            removeItem: (k) => {}
        },
        document: {
            addEventListener: () => {},
            removeEventListener: () => {},
            documentElement: {
                getAttribute: () => null,
                removeAttribute: () => {}
            },
            head: { appendChild: () => {} },
            body: { appendChild: () => {} },
            createElement: (tag) => ({
                tagName: tag.toUpperCase(),
                classList: { add: () => {}, remove: () => {} },
                setAttribute: () => {},
                style: {},
                appendChild: () => {},
                remove: () => {}
            }),
            getElementById: (id) => {
                if (id === 'toasts') return { appendChild: (el) => toasts.push({ el }) };
                if (id === 'ed-title') return { value: 'Hacked Title' };
                if (id === 'ed-subfolder') return { value: '' };
                if (id === 'ed-cat') return { value: 'general' };
                if (id === 'ed-status') return { value: 'draft' };
                return null;
            }
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    vm.createContext(ctx);

    // Load necessary application modules into context
    vm.runInContext(read('js/actions-documents.js'), ctx);
    vm.runInContext(read('js/events.js'), ctx);
    vm.runInContext(read('js/ui.js'), ctx);
    ctx.toast = (msg, type) => { toasts.push({ msg, type }); };
    vm.runInContext(read('js/actions-batch-history.js'), ctx);
    vm.runInContext(read('js/actions-imports.js'), ctx);
    vm.runInContext(read('js/workspaces.js'), ctx);
    vm.runInContext(read('js/collab-workspaces.js'), ctx);

    // 1. saveDoc() with viewer role
    toasts.length = 0;
    await ctx.saveDoc();
    assert.equal(ctx.documents[0].title, 'Original Doc', 'saveDoc: local document title must not be modified');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'saveDoc: must show exact toast');

    // 2. moveDocStatus() with viewer role
    toasts.length = 0;
    const moveRes = await ctx.moveDocStatus('doc-1', 'done');
    assert.equal(moveRes, false);
    assert.equal(ctx.documents[0].kanbanStatus, 'todo', 'moveDocStatus: status in local documents must not change');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'moveDocStatus: must show exact toast');

    // 3. restoreDoc() with viewer role
    toasts.length = 0;
    await ctx.restoreDoc('doc-trash');
    const trashedDoc = ctx.documents.find(d => d.id === 'doc-trash');
    assert.equal(trashedDoc.status, 'deleted', 'restoreDoc: document status must remain deleted');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'restoreDoc: must show exact toast');

    // 4. hardDeleteDoc() with viewer role
    toasts.length = 0;
    await ctx.hardDeleteDoc('doc-1');
    assert.ok(ctx.documents.some(d => d.id === 'doc-1'), 'hardDeleteDoc: document must not be removed from documents');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'hardDeleteDoc: must show exact toast');

    // 5. emptyTrash() with viewer role
    toasts.length = 0;
    await ctx.emptyTrash();
    assert.ok(ctx.documents.some(d => d.id === 'doc-trash'), 'emptyTrash: trashed document must not be removed from documents');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'emptyTrash: must show exact toast');

    // 6. uploadImageToCloud() with viewer role
    toasts.length = 0;
    let callbackCalled = false;
    await ctx.uploadImageToCloud({ name: 'test.png' }, () => { callbackCalled = true; });
    assert.equal(callbackCalled, false, 'uploadImageToCloud: callback must not be invoked');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'uploadImageToCloud: must show exact toast');

    // 7. confirmDelete() with viewer role
    toasts.length = 0;
    await ctx.confirmDelete('doc-1');
    assert.equal(ctx.documents[0].status, 'draft', 'confirmDelete: local document status must remain draft');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'confirmDelete: must show exact toast');

    // 8. confirmBatchDelete() with viewer role
    toasts.length = 0;
    ctx.state.selectedIds = new Set(['doc-1']);
    await ctx.confirmBatchDelete();
    assert.equal(ctx.documents[0].status, 'draft', 'confirmBatchDelete: local document status must remain draft');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'confirmBatchDelete: must show exact toast');

    // 9. Verification: Local array strictly equals initial data state
    assert.equal(ctx.documents.length, 2);
    assert.equal(ctx.documents[0].title, 'Original Doc');
    assert.equal(ctx.documents[0].status, 'draft');
    assert.equal(ctx.documents[0].kanbanStatus, 'todo');
    assert.equal(ctx.documents[1].status, 'deleted');

    // 10. Workspaces creation, rename, and delete disabled for viewer in COLLAB_MODE
    toasts.length = 0;
    await ctx.createWorkspace();
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'createWorkspace: viewer must show exact toast');

    toasts.length = 0;
    ctx.renameWorkspace('default');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'renameWorkspace: viewer must show exact toast');

    toasts.length = 0;
    await ctx.deleteWorkspace('some-ws');
    assert.ok(toasts.some(t => t.msg === 'You have view access'), 'deleteWorkspace: viewer must show exact toast');
});

test('Phase 14: Settings modal hides Account/Security tabs and defaults to Team on team edition, while personal edition keeps all tabs', async () => {
    // 1. Team edition (COLLAB_MODE: true)
    let teamModalHtml = '';
    const teamCtx = {
        console,
        setTimeout,
        clearTimeout,
        window: {},
        COLLAB_MODE: true,
        GUEST_MODE: false,
        GitHubSync: { getSettings: async () => ({ token: 'abc' }) },
        showModal: (html) => { teamModalHtml = html; },
        toast: () => {},
        document: {
            getElementById: (id) => null,
            querySelectorAll: () => []
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'owner-1', role: 'owner' })
        }
    };
    teamCtx.window = teamCtx;
    teamCtx.globalThis = teamCtx;
    vm.createContext(teamCtx);
    vm.runInContext(read('js/utils.js'), teamCtx);
    vm.runInContext(read('js/render-editor.js'), teamCtx);
    vm.runInContext(read('js/actions-settings.js'), teamCtx);
    vm.runInContext(read('js/collab-members.js'), teamCtx);

    await teamCtx.showGitHubSettingsModal();

    // Verify team edition HTML: no account tab, no security tab, no Current Password, has team tab, has Loading team members
    assert.doesNotMatch(teamModalHtml, /_switchSettingsTab\('account'\)/, 'Team edition must not contain Account tab button');
    assert.doesNotMatch(teamModalHtml, /_switchSettingsTab\('security'\)/, 'Team edition must not contain Security tab button');
    assert.doesNotMatch(teamModalHtml, /Current Password/, 'Team edition must not contain Current Password form');
    assert.match(teamModalHtml, /_switchSettingsTab\('team'\)/, 'Team edition must contain Team tab button');
    assert.match(teamModalHtml, /Loading team members/, 'Team edition must default to Team tab and show Loading team members');

    // Test that switching to account or security does nothing on team edition
    const bodyElem = { innerHTML: teamModalHtml };
    teamCtx.document.getElementById = (id) => (id === 'settings-modal-body' ? bodyElem : null);
    teamCtx._switchSettingsTab('account');
    assert.doesNotMatch(bodyElem.innerHTML, /Current Password/, '_switchSettingsTab("account") must do nothing on team edition');
    teamCtx._switchSettingsTab('security');
    assert.doesNotMatch(bodyElem.innerHTML, /Password Hint/, '_switchSettingsTab("security") must do nothing on team edition');

    // Test that if _settingsTab was remembering account or security, opening settings resets to team
    teamCtx._settingsTab = 'account';
    await teamCtx.showGitHubSettingsModal();
    assert.equal(teamCtx._settingsTab, 'team', '_settingsTab remembering account must reset to team');
    assert.match(teamModalHtml, /Loading team members/);

    teamCtx._settingsTab = 'security';
    await teamCtx.showGitHubSettingsModal();
    assert.equal(teamCtx._settingsTab, 'team', '_settingsTab remembering security must reset to team');
    assert.equal(typeof teamCtx.showSettings, 'function', 'showSettings alias must be defined on window');
    assert.equal(teamCtx.showSettings, teamCtx.showGitHubSettingsModal, 'showSettings must alias showGitHubSettingsModal');

    // 2. Personal edition (COLLAB_MODE: false)
    let personalModalHtml = '';
    const personalCtx = {
        console,
        window: {},
        COLLAB_MODE: false,
        GUEST_MODE: false,
        GitHubSync: { getSettings: async () => ({ token: '' }) },
        showModal: (html) => { personalModalHtml = html; },
        toast: () => {},
        document: {
            getElementById: (id) => null,
            querySelectorAll: () => []
        }
    };
    personalCtx.window = personalCtx;
    personalCtx.globalThis = personalCtx;
    vm.createContext(personalCtx);
    vm.runInContext(read('js/actions-settings.js'), personalCtx);

    await personalCtx.showGitHubSettingsModal();

    // Verify personal edition HTML: has account, security, and Current Password
    assert.match(personalModalHtml, /_switchSettingsTab\('account'\)/, 'Personal edition must have Account tab');
    assert.match(personalModalHtml, /_switchSettingsTab\('security'\)/, 'Personal edition must have Security tab');
    assert.match(personalModalHtml, /Current Password/, 'Personal edition must default to Account and show Current Password');
});

test('CollabMembers Stage B: line budget check for js/collab-members.js is <= 400 lines', () => {
    const code = read('js/collab-members.js');
    const lines = code.split('\n').length;
    assert.ok(lines <= 400, `js/collab-members.js must be <= 400 lines (got ${lines})`);
});

test('CollabMembers Stage B: team member avatar rendering (palette color and photoURL) and Bauhaus CSS', async () => {
    const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];
    function computeColor(str) {
        let hash = 0, k = String(str || '');
        for (let i = 0; i < k.length; i++) hash = (hash * 31 + k.charCodeAt(i)) & 0xffffffff;
        return palette[(hash >>> 0) % palette.length];
    }

    const ctx = createMembersContext({
        currentMember: { uid: 'owner-1', role: 'owner' },
        initialMembers: {
            'm-photo': { uid: 'm-photo', displayName: 'Alice Photo', email: 'alice@example.com', role: 'editor', photoURL: 'https://images.example.com/alice.jpg' },
            'm-palette': { uid: 'm-palette', displayName: 'Bob Initial', email: 'bob@example.com', role: 'viewer' },
            'm-insecure': { uid: 'm-insecure', displayName: 'Insecure Pic', email: 'insecure@example.com', role: 'viewer', photoURL: 'http://insecure.example.com/pic.jpg' },
            'm-photo2': { uid: 'm-photo2', displayName: 'Carol URL', email: 'carol@example.com', role: 'editor', photoUrl: 'https://images.example.com/carol.png' }
        }
    });

    let renderedHtml = '';
    ctx.document.getElementById = (id) => (id === 'collab-team-tab-container' ? {
        set innerHTML(h) { renderedHtml = h; },
        get innerHTML() { return renderedHtml; }
    } : { value: '', classList: { add() {}, remove() {}, contains() { return false; } } });

    await ctx.CollabMembers.loadAndRenderTeam();

    // 1. Check m-photo renders img with photoURL
    assert.match(renderedHtml, /<img src="https:\/\/images\.example\.com\/alice\.jpg" alt="Alice Photo" class="collab-member-avatar w-7 h-7 rounded-full object-cover shrink-0 select-none" style="border:1px solid var\(--brd\);"[^>]*>/);

    // 2. Check m-photo2 renders img with photoUrl
    assert.match(renderedHtml, /<img src="https:\/\/images\.example\.com\/carol\.png" alt="Carol URL" class="collab-member-avatar w-7 h-7 rounded-full object-cover shrink-0 select-none" style="border:1px solid var\(--brd\);"[^>]*>/);

    // 3. Check m-palette renders colored initial avatar
    const bobExpectedColor = computeColor('m-palette');
    assert.match(renderedHtml, new RegExp(`<div class="collab-member-avatar w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-bold text-xs text-white select-none" style="background-color:${bobExpectedColor};">B</div>`));

    // 4. Check m-insecure (non-https) falls back to colored initial avatar
    const insecureExpectedColor = computeColor('m-insecure');
    assert.match(renderedHtml, new RegExp(`<div class="collab-member-avatar w-7 h-7 rounded-full shrink-0 flex items-center justify-center font-bold text-xs text-white select-none" style="background-color:${insecureExpectedColor};">I</div>`));
    assert.doesNotMatch(renderedHtml, /http:\/\/insecure\.example\.com\/pic\.jpg/);

    // 5. Check Bauhaus CSS override inside buildTeamMarkup
    assert.match(renderedHtml, /\[data-ui-style="bauhaus"\] #collab-team-tab-container \.collab-member-avatar \{ border: 1\.5px solid #121212 !important; border-radius: 0 !important; \}/);
});

test('CollabMembers Stage B: safe confirmation modal for removing members', async () => {
    let modalHtml = null;
    let closeModalCalled = false;
    const ctx = createMembersContext({
        currentMember: { uid: 'owner-1', role: 'owner' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
            'member-2': { uid: 'member-2', displayName: 'Dev Dan', email: 'dan@example.com', role: 'editor' }
        }
    });
    ctx.showModal = (html) => { modalHtml = html; };
    ctx.closeModal = () => { closeModalCalled = true; };

    let teamHtml = '';
    ctx.document.getElementById = (id) => (id === 'collab-team-tab-container' ? {
        set innerHTML(h) { teamHtml = h; },
        get innerHTML() { return teamHtml; }
    } : { value: '', classList: { add() {}, remove() {}, contains() { return false; } } });

    await ctx.CollabMembers.loadAndRenderTeam();

    // 1. Verify remove button markup in member row
    assert.match(teamHtml, /data-onclick="collabConfirmRemoveMember\(&quot;member-2&quot;,&quot;Dev Dan&quot;\)"/);
    assert.match(teamHtml, /class="btn-d w-7 h-7 flex items-center justify-center rounded text-xs"/);

    // 2. Trigger collabConfirmRemoveMember
    ctx.collabConfirmRemoveMember('member-2', 'Dev Dan');
    assert.ok(modalHtml, 'showModal must have been called');
    assert.match(modalHtml, /fa-triangle-exclamation/);
    assert.match(modalHtml, /Remove team member\?/);
    assert.match(modalHtml, /Are you sure you want to remove <b>Dev Dan<\/b> from the team\? They will immediately lose access to all documents in this workspace\./);
    assert.match(modalHtml, /data-onclick="collabCancelRemoveMember\(\)"/);
    assert.match(modalHtml, /data-onclick="collabExecuteRemoveMember\(&quot;member-2&quot;\)"/);
    assert.match(modalHtml, />Remove member<\/button>/);

    // Verify member is NOT removed yet
    assert.equal(ctx.memberStore.has('member-2'), true, 'Member must still exist prior to execution');

    // Test cancel restores settings modal via showGitHubSettingsModal / showSettings
    let showSettingsCalled = false;
    ctx.showGitHubSettingsModal = () => { showSettingsCalled = true; };
    ctx.collabCancelRemoveMember();
    assert.equal(showSettingsCalled, true, 'cancelRemoveMember must call showGitHubSettingsModal when available');
    assert.equal(ctx._settingsTab, 'team', 'cancelRemoveMember must restore team tab in settings');

    // Test quote escaping in confirmation modal
    ctx.collabConfirmRemoveMember("m-o'brien", "O'Brien");
    assert.match(modalHtml, /<b>O&#39;Brien<\/b>/);
    assert.match(modalHtml, /collabExecuteRemoveMember\(&quot;m-o&#39;brien&quot;\)/);

    // Test dismiss hook (_modalOnClose) restores settings on backdrop / Escape
    showSettingsCalled = false;
    assert.equal(typeof ctx._modalOnClose, 'function', '_modalOnClose hook must be registered when confirm modal opens');
    ctx._modalOnClose();
    assert.equal(showSettingsCalled, true, '_modalOnClose must restore settings on dismiss');

    // 3. Trigger collabExecuteRemoveMember
    showSettingsCalled = false;
    closeModalCalled = false;
    await ctx.collabExecuteRemoveMember('member-2');
    assert.equal(showSettingsCalled, true, 'showGitHubSettingsModal must be called on execute to restore settings modal');
    assert.equal(ctx.memberStore.has('member-2'), false, 'Member must be deleted on execute');
    assert.ok(ctx.calls.memberDeletes.includes('member-2'));

    // Test execute failure still restores settings in finally block
    showSettingsCalled = false;
    let toastErrorMsg = null;
    ctx.toast = (msg, type) => { if (type === 'error') toastErrorMsg = msg; };
    ctx.firebase.firestore = () => ({
        collection: () => ({
            doc: () => ({
                get: async () => ({ exists: true, data: () => ({ role: 'editor' }) }),
                delete: async () => { throw new Error('Firestore network error'); }
            })
        })
    });
    await ctx.collabExecuteRemoveMember('error-member');
    assert.equal(showSettingsCalled, true, 'executeRemoveMember must restore settings even when deletion throws');
    assert.match(toastErrorMsg || '', /Firestore network error/);

    // 4. Test fallback to confirm() when showModal is unavailable
    const fallbackCtx = createMembersContext({
        currentMember: { uid: 'owner-1', role: 'owner' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
            'member-3': { uid: 'member-3', displayName: 'Dev Eva', email: 'eva@example.com', role: 'editor' }
        }
    });
    delete fallbackCtx.showModal;
    let confirmPrompt = null;
    let confirmResult = false;
    fallbackCtx.confirm = (msg) => { confirmPrompt = msg; return confirmResult; };

    // Trigger collabRemoveMember (which routes to confirmRemoveMember)
    await fallbackCtx.collabRemoveMember('member-3', 'Dev Eva');
    assert.equal(confirmPrompt, 'Remove Dev Eva from the team?');
    assert.equal(fallbackCtx.memberStore.has('member-3'), true, 'Must not delete if confirm returned false');

    confirmResult = true;
    await fallbackCtx.collabRemoveMember('member-3', 'Dev Eva');
    assert.equal(fallbackCtx.memberStore.has('member-3'), false, 'Must delete if confirm returned true');

    // 5. Test abort when neither showModal nor confirm is available
    const abortCtx = createMembersContext({
        currentMember: { uid: 'owner-1', role: 'owner' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' },
            'member-4': { uid: 'member-4', displayName: 'Dev Frank', email: 'frank@example.com', role: 'editor' }
        }
    });
    delete abortCtx.showModal;
    delete abortCtx.confirm;
    await abortCtx.collabRemoveMember('member-4', 'Dev Frank');
    assert.equal(abortCtx.memberStore.has('member-4'), true, 'Must abort if neither showModal nor confirm exists');
});

test('CollabMembers Stage B: invite helper note and revoke button style', async () => {
    const ctx = createMembersContext({
        currentMember: { uid: 'owner-1', role: 'owner' },
        initialMembers: {
            'owner-1': { uid: 'owner-1', email: 'owner@example.com', role: 'owner' }
        },
        initialInvites: {
            'pending@example.com': { email: 'pending@example.com', role: 'editor' }
        }
    });

    let html = '';
    ctx.document.getElementById = (id) => (id === 'collab-team-tab-container' ? {
        set innerHTML(h) { html = h; },
        get innerHTML() { return html; }
    } : { value: '', classList: { add() {}, remove() {}, contains() { return false; } } });

    await ctx.CollabMembers.loadAndRenderTeam();

    // 1. Invite helper note
    assert.match(html, /<p class="text-\[11px\] mt-1\.5 flex items-center gap-1\.5" style="color:var\(--tx-d\);"><i class="fa-solid fa-circle-info text-\[10px\]" style="color:var\(--acc\);"><\/i><span>They will automatically join the team vault next time they sign in with this Google account\.<\/span><\/p>/);

    // 2. Revoke button style
    assert.match(html, /class="btn-d h-7 px-2\.5 flex items-center gap-1 text-\[10px\] shrink-0"/);
    assert.match(html, /title="Revoke invite"/);
});

test('CollabMembers Stage B: Focus Queue owner chip rendering avatar badge and photoURL support', () => {
    const renderCoreSource = read('js/render-core.js');

    const ctx = vm.createContext({
        console,
        URLSearchParams,
        location: { search: '' },
        window: {
            CollabAssign: {
                getMembers: () => [
                    { uid: 'u-sam', displayName: 'Sam Smith', email: 'sam@example.com', photoURL: 'https://photos.example.com/sam.png' },
                    { uid: 'u-leo', displayName: 'Leo Lion', email: 'leo@example.com' }
                ]
            }
        },
        document: { getElementById: () => null },
        state: { focusQueueTab: 'active', view: 'focus' },
        t: (k, params) => {
            if (k === 'focusUnassigned') return 'Unassigned';
            return k;
        },
        escHtml: s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
        renderActionButton: () => '<button>act</button>',
        fmtDate: () => '2026-11-16',
        _normBugStatus: s => s || 'open',
        bugRef: () => 'BUG-101',
        bugTriageInfo: () => ({ stateName: 'pending', classificationLabel: 'Normal', slaHours: 24 })
    });
    ctx.window.window = ctx.window;
    vm.runInContext(read('js/constants.js'), ctx);
    vm.runInContext(read('js/utils.js'), ctx);
    vm.runInContext(read('js/state.js'), ctx);
    vm.runInContext(renderCoreSource, ctx);

    // 1. Test _renderAssigneeBadge directly with photoURL
    const photoBadge = vm.runInContext("_renderAssigneeBadge('Sam Smith', 'u-sam')", ctx);
    assert.match(photoBadge, /<img src="https:\/\/photos\.example\.com\/sam\.png" alt="Sam Smith" class="collab-assignee-avatar w-4 h-4 rounded-full object-cover shrink-0 select-none" style="border:1px solid var\(--brd\);">/);
    assert.match(photoBadge, /<span class="truncate">Sam Smith<\/span>/);

    // 2. Test _renderAssigneeBadge directly without photoURL (colored initial badge)
    const initialBadge = vm.runInContext("_renderAssigneeBadge('Leo Lion', 'u-leo')", ctx);
    assert.match(initialBadge, /<span class="collab-assignee-avatar w-4 h-4 rounded-full flex items-center justify-center font-bold text-\[9px\] text-white shrink-0 select-none" style="background-color:[^"]+;">L<\/span>/);
    assert.match(initialBadge, /<span class="truncate">Leo Lion<\/span>/);

    // 3. Test Focus Queue row with owner
    ctx._testDocs = [{
        id: 'task-owned',
        title: 'Owned Task',
        category: 'task',
        status: 'published',
        kanbanStatus: 'in-progress',
        focusWorkflow: {
            task: { owner: 'Sam Smith', ownerUid: 'u-sam' }
        }
    }];
    vm.runInContext('documents = _testDocs;', ctx);
    const focusHtmlOwned = vm.runInContext('renderFocus()', ctx);
    assert.match(focusHtmlOwned, /<span class="focus-chip focus-owner-chip">/);
    assert.match(focusHtmlOwned, /<img src="https:\/\/photos\.example\.com\/sam\.png" alt="Sam Smith"/);

    // 4. Test Focus Queue row unassigned
    ctx._testDocs = [{
        id: 'task-unassigned',
        title: 'Unassigned Task',
        category: 'task',
        status: 'published',
        kanbanStatus: 'in-progress'
    }];
    vm.runInContext('documents = _testDocs;', ctx);
    const focusHtmlUnassigned = vm.runInContext('renderFocus()', ctx);
    assert.match(focusHtmlUnassigned, /<span class="focus-chip is-unassigned"><i class="fa-regular fa-user"><\/i>Unassigned<\/span>/);
});

test('CollabMembers Stage B: ui.js showModal dedupes _modalTrapHandler keydown listener on consecutive opens', () => {
    const listeners = [];
    const ctx = vm.createContext({
        console,
        Element: class Element {},
        state: {},
        window: {
            addEventListener: () => {},
            removeEventListener: () => {},
            matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} })
        },
        document: {
            getElementById: () => ({
                classList: { contains: () => false },
                setAttribute: () => {},
                removeAttribute: () => {},
                toggleAttribute: () => {},
                querySelector: () => null,
                querySelectorAll: () => []
            }),
            activeElement: null,
            addEventListener: (type, fn) => { listeners.push({ type, fn }); },
            removeEventListener: (type, fn) => {
                const idx = listeners.findIndex(l => l.type === type && l.fn === fn);
                if (idx !== -1) listeners.splice(idx, 1);
            }
        },
        enhanceInteractionSemantics: () => {},
        updateUiStyleSwitcher: () => {}
    });
    ctx.window.window = ctx.window;
    vm.runInContext(read('js/ui.js'), ctx);

    // Call showModal first time (e.g. Settings modal)
    vm.runInContext('showModal("<div>Settings</div>")', ctx);
    const countAfterFirst = listeners.filter(l => l.type === 'keydown').length;
    assert.equal(countAfterFirst, 1, 'First showModal must register exactly 1 keydown listener');

    // Call showModal second time (e.g. Confirm remove dialog)
    vm.runInContext('showModal("<div>Confirm</div>")', ctx);
    const countAfterSecond = listeners.filter(l => l.type === 'keydown').length;
    assert.equal(countAfterSecond, 1, 'Second showModal must NOT stack keydown listener');

    // Call closeModal
    vm.runInContext('closeModal()', ctx);
    const countAfterClose = listeners.filter(l => l.type === 'keydown').length;
    assert.equal(countAfterClose, 0, 'closeModal must remove the keydown listener cleanly');
});



