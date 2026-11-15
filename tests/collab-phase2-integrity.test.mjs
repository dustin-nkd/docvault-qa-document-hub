import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Phase 2: generateSecureShareId produces 128-bit cryptographically secure IDs', () => {
    const ctx = {
        crypto: globalThis.crypto,
        Uint8Array: globalThis.Uint8Array,
        Array: globalThis.Array,
        Date: globalThis.Date,
        Math: globalThis.Math
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/utils.js'), ctx);

    assert.equal(typeof ctx.generateSecureShareId, 'function');
    const ids = new Set();
    for (let i = 0; i < 50; i++) {
        const id = ctx.generateSecureShareId();
        assert.match(id, /^sh_[a-f0-9]{32}$/, 'Must have sh_ prefix followed by 32 hex chars');
        ids.add(id);
    }
    assert.equal(ids.size, 50, 'All generated IDs must be unique');
});

test('Phase 2: canHardDeleteDocs restricts permanent deletion to Team Owner in collab mode', () => {
    const createCtx = (collabMode, guestMode, role) => {
        const ctx = {
            COLLAB_MODE: collabMode,
            GUEST_MODE: guestMode,
            CollabBootstrap: {
                getCurrentMember: () => ({ uid: 'user-1', email: 'user@test.com', role })
            }
        };
        ctx.window = ctx;
        ctx.globalThis = ctx;
        vm.createContext(ctx);
        vm.runInContext(read('js/utils.js'), ctx);
        return ctx;
    };

    // 1. Personal / Local mode -> Allowed
    const ctxPersonal = createCtx(false, false, null);
    assert.equal(ctxPersonal.canHardDeleteDocs(), true);

    // 2. Guest mode -> Allowed
    const ctxGuest = createCtx(true, true, null);
    assert.equal(ctxGuest.canHardDeleteDocs(), true);

    // 3. Collab Viewer -> Denied
    const ctxViewer = createCtx(true, false, 'viewer');
    assert.equal(ctxViewer.canHardDeleteDocs(), false);

    // 4. Collab Editor -> Denied
    const ctxEditor = createCtx(true, false, 'editor');
    assert.equal(ctxEditor.canHardDeleteDocs(), false);

    // 5. Collab Owner -> Allowed
    const ctxOwner = createCtx(true, false, 'owner');
    assert.equal(ctxOwner.canHardDeleteDocs(), true);
});

test('Phase 2: Category transition cleans up orphaned category payloads while preserving matching categories', async () => {
    const apitcDoc = {
        id: 'doc-apitc',
        title: 'API Test Doc',
        category: 'apitest',
        apiTcData: { method: 'POST', endpoint: '/api/v1/test' },
        status: 'draft',
        updatedAt: 1000
    };
    const envDoc = {
        id: 'doc-env',
        title: 'Env Doc',
        category: 'environment',
        envData: { status: 'healthy', properties: [], linkedCreds: [], notes: 'all good' },
        status: 'draft',
        updatedAt: 1000
    };
    const tcplanDoc = {
        id: 'doc-tcplan',
        title: 'Test Plan Doc',
        category: 'testplan',
        tcPlanData: { scope: 'full regression' },
        status: 'draft',
        updatedAt: 1000
    };

    const ctx = {
        documents: [apitcDoc, envDoc, tcplanDoc],
        state: { editingDoc: apitcDoc, category: 'apitest', editorTags: [] },
        t: (k) => k,
        toast: () => {},
        persist: async () => {},
        navigate: () => {},
        render: () => {},
        getEditorMarkdown: () => '# Content',
        ActivityLog: { record: () => {} },
        readApiTestCaseForm: () => ({ method: 'POST', endpoint: '/api/v1/test' }),
        buildApiTestSteps: () => [],
        apiTestCaseMarkdown: () => '# Content',
        setTimeout: globalThis.setTimeout,
        clearTimeout: globalThis.clearTimeout,
        requestAnimationFrame: (cb) => cb(),
        _appUrl: () => '',
        history: { pushState: () => {}, replaceState: () => {} },
        DocHistory: { save: () => {}, push: () => {} },
        document: {
            getElementById: (id) => {
                if (id === 'ed-title') return { value: ctx.state.editingDoc.title };
                if (id === 'ed-subfolder') return { value: '' };
                if (id === 'ed-cat') return { value: ctx.state.category };
                if (id === 'ed-status') return { value: 'draft' };
                if (id === 'ed-env-notes') return { value: 'all good' };
                return null;
            },
            querySelectorAll: () => []
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/actions-documents.js'), ctx);

    // 1. Save apitest without category change -> apiTcData must be PRESERVED
    await ctx.saveDoc();
    assert.deepEqual(ctx.documents[0].apiTcData, { method: 'POST', endpoint: '/api/v1/test', steps: [] }, 'apiTcData must be preserved when category is apitest');

    // 2. Save environment without category change -> envData must be PRESERVED
    ctx.state.editingDoc = envDoc;
    ctx.state.category = 'environment';
    await ctx.saveDoc();
    assert.equal(ctx.documents[1].envData?.status, 'healthy', 'envData status must be preserved');
    assert.equal(ctx.documents[1].envData?.notes, 'all good', 'envData notes must be preserved');

    // 3. Save testplan without category change -> tcPlanData must be retained
    ctx.state.editingDoc = tcplanDoc;
    ctx.state.category = 'testplan';
    await ctx.saveDoc();
    assert.ok(ctx.documents[2].tcPlanData !== undefined, 'tcPlanData must be retained when category is testplan');

    // 4. Change category from apitest to runbook -> apiTcData must be CLEANED UP
    ctx.state.editingDoc = apitcDoc;
    ctx.state.category = 'runbook';
    await ctx.saveDoc();
    assert.equal(ctx.documents[0].category, 'runbook');
    assert.equal(ctx.documents[0].apiTcData, undefined, 'apiTcData must be deleted when transitioning to runbook');
});

test('Phase 2: CollabStore persist() synchronously snapshots workspace and prevents foreign workspace deletions on race', async () => {
    let activeWs = 'ws-a';
    const storeData = new Map([
        ['doc-a-1', { id: 'doc-a-1', version: 1, workspaceId: 'ws-a', updatedAt: 100 }],
        ['doc-a-2', { id: 'doc-a-2', version: 1, workspaceId: 'ws-a', updatedAt: 100 }],
        ['doc-b-1', { id: 'doc-b-1', version: 1, workspaceId: 'ws-b', updatedAt: 100 }],
        ['doc-b-2', { id: 'doc-b-2', version: 1, workspaceId: 'ws-b', updatedAt: 100 }]
    ]);
    const deletedInFirestore = [];

    const firestoreDb = {
        collection: (col) => {
            if (col === 'documents') {
                return {
                    get: async () => {
                        const docs = [];
                        for (const [id, data] of storeData.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)), metadata: { hasPendingWrites: false } });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    doc: (docId) => ({
                        get: async () => {
                            const exists = storeData.has(docId);
                            const data = exists ? JSON.parse(JSON.stringify(storeData.get(docId))) : null;
                            return { exists, data: () => data };
                        },
                        set: async (data) => {
                            storeData.set(docId, JSON.parse(JSON.stringify(data)));
                        },
                        delete: async () => {
                            deletedInFirestore.push(docId);
                            storeData.delete(docId);
                        }
                    })
                };
            }
            throw new Error(`Unexpected collection ${col}`);
        }
    };

    let simulateSwitchDuringEnsure = false;

    const ctx = {
        COLLAB_MODE: true,
        GUEST_MODE: false,
        localStorage: {
            getItem: (key) => {
                if (key === 'docvault_active_workspace') return activeWs;
                return null;
            },
            setItem: () => {}
        },
        getActiveWorkspace: () => ({ id: activeWs, name: activeWs }),
        CollabAuth: {
            getCurrentUser: () => ({ uid: 'owner-uid', email: 'owner@test.com' })
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'owner-uid', role: 'owner' }),
            getDb: () => firestoreDb
        },
        ensureFirebase: async () => {
            if (simulateSwitchDuringEnsure) {
                // Workspace switches to ws-b right during async init!
                activeWs = 'ws-b';
            }
        },
        firebase: {
            firestore: () => firestoreDb
        },
        ActivityLog: { record: () => {} },
        toast: () => {},
        t: (k) => k
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/collab-store.js'), ctx);

    // 1. Initial load populates _knownDocs with all documents across ws-a and ws-b
    const loadedDocs = await ctx.CollabStore.loadDocuments();
    assert.equal(loadedDocs.length, 2, 'Only ws-a documents returned for active workspace');

    // 2. Simulate race: User was in ws-a, persists doc-a-1 (meaning doc-a-2 is missing).
    // During async persistence (ensureFirebase), user switches to ws-b!
    simulateSwitchDuringEnsure = true;
    deletedInFirestore.length = 0;

    await ctx.CollabStore.persist([loadedDocs[0]]); // passing doc-a-1 from ws-a

    // Step 3 MUST abort because getActiveWs() ('ws-b') !== activeWs ('ws-a')
    assert.equal(deletedInFirestore.length, 0, 'No documents should be deleted when workspace switch raced');
    assert.ok(storeData.has('doc-b-1'), 'ws-b documents must not be deleted');
    assert.ok(storeData.has('doc-b-2'), 'ws-b documents must not be deleted');

    // 3. Normal persist without race in ws-b:
    // User deletes doc-b-2 (only doc-b-1 is in targetDocs)
    simulateSwitchDuringEnsure = false;
    activeWs = 'ws-b';
    deletedInFirestore.length = 0;
    await ctx.CollabStore.persist([{ id: 'doc-b-1', version: 1, workspaceId: 'ws-b', updatedAt: 200 }]);
    assert.deepEqual(deletedInFirestore, ['doc-b-2'], 'doc-b-2 correctly deleted in ws-b without foreign impact');
});

test('Phase 2: CollabMembers inviteMember normalizes lowercase and revokeInvite succeeds', async () => {
    const inviteStore = new Map();
    const calls = { sets: [], deletes: [] };
    const firestoreMock = {
        collection: (col) => {
            if (col === 'invites') {
                return {
                    doc: (docId) => ({
                        set: async (data) => {
                            calls.sets.push({ id: docId, data });
                            inviteStore.set(docId, data);
                        },
                        delete: async () => {
                            calls.deletes.push(docId);
                            inviteStore.delete(docId);
                        }
                    })
                };
            }
            if (col === 'members') {
                return {
                    get: async () => ({ docs: [], forEach: () => {} })
                };
            }
            throw new Error(`Unexpected collection ${col}`);
        }
    };

    const ctx = {
        COLLAB_MODE: true,
        GUEST_MODE: false,
        firebase: { firestore: () => firestoreMock },
        ensureFirebase: async () => {},
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'owner-uid', email: 'owner@test.com', role: 'owner' })
        },
        document: {
            getElementById: () => null,
            querySelectorAll: () => []
        },
        toast: () => {},
        t: (k) => k
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/collab-members.js'), ctx);

    // 1. Invite mixed-case email -> must be normalized to lowercase
    const ok = await ctx.CollabMembers.inviteMember('  Test.User@EXAMPLE.com  ', 'editor');
    assert.equal(ok, true);
    assert.ok(inviteStore.has('test.user@example.com'), 'Doc ID in invites collection must be trimmed and lowercased');
    assert.equal(inviteStore.get('test.user@example.com').email, 'test.user@example.com');

    // 2. Revoke invite using mixed-case email -> must delete the lowercased document ID
    const revoked = await ctx.CollabMembers.revokeInvite('  Test.User@EXAMPLE.COM  ');
    assert.equal(revoked, true);
    assert.equal(inviteStore.has('test.user@example.com'), false, 'Invite must be deleted from store');
    assert.ok(calls.deletes.includes('test.user@example.com'), 'Delete call must target lowercased document ID');
});

test('Phase 2 fix: inviteMember rejects existing members, UI filters them, and loadAndRenderTeam purges stale invites', async () => {
    const memberStore = new Map([
        ['user-1', { uid: 'user-1', email: 'existing@company.com', displayName: 'Existing User', role: 'editor' }]
    ]);
    const inviteStore = new Map([
        ['existing@company.com', { email: 'existing@company.com', role: 'editor' }],
        ['newbie@company.com', { email: 'newbie@company.com', role: 'viewer' }]
    ]);
    const toasts = [];

    const firestoreMock = {
        collection: (col) => ({
            get: async () => {
                const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : new Map());
                const docs = Array.from(store.entries()).map(([id, d]) => ({ id, data: () => ({ ...d }) }));
                return { docs, forEach: (fn) => docs.forEach(fn) };
            },
            doc: (docId) => ({
                get: async () => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : new Map());
                    const exists = store.has(docId);
                    return { exists, data: () => exists ? { ...store.get(docId) } : null };
                },
                set: async (data) => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : new Map());
                    store.set(docId, data);
                },
                delete: async () => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : new Map());
                    store.delete(docId);
                }
            })
        })
    };

    let containerHtml = '';
    const ctx = {
        COLLAB_MODE: true,
        GUEST_MODE: false,
        firebase: { firestore: () => firestoreMock },
        ensureFirebase: async () => {},
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'owner-uid', email: 'owner@test.com', role: 'owner' })
        },
        document: {
            getElementById: (id) => {
                if (id === 'collab-team-tab-container') {
                    return {
                        set innerHTML(val) { containerHtml = val; },
                        get innerHTML() { return containerHtml; }
                    };
                }
                return null;
            },
            querySelectorAll: () => []
        },
        toast: (msg, type) => { toasts.push({ msg, type }); },
        t: (k) => k
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/collab-members.js'), ctx);

    // 1. Inviting an existing member is blocked with a warning
    toasts.length = 0;
    const ok = await ctx.CollabMembers.inviteMember('  Existing@Company.COM  ', 'editor');
    assert.equal(ok, false, 'inviteMember must return false for existing member');
    assert.ok(toasts.some(t => t.msg === 'This user is already a team member.'), 'Must show already a member warning toast');

    // 2. loadAndRenderTeam filters out existing@company.com from Pending Invitations
    await ctx.CollabMembers.loadAndRenderTeam();
    assert.match(containerHtml, /Pending Invitations \(1\)/, 'Only genuinely pending invite counted');
    assert.match(containerHtml, /newbie@company\.com/, 'Newbie must appear in pending');
    assert.doesNotMatch(containerHtml, /existing@company\.com.*Revoke/, 'Existing member must NOT appear in pending invitations list');

    // 3. Stale invite for existing member is automatically purged from Firestore
    assert.equal(inviteStore.has('existing@company.com'), false, 'Stale invite must be automatically deleted from Firestore');
    assert.equal(inviteStore.has('newbie@company.com'), true, 'Genuinely pending invite remains in Firestore');
});

test('Phase 2 fix: initTeamUser cleans up leftover invites when member logs in', async () => {
    const inviteStore = new Map([
        ['collab@example.com', { email: 'collab@example.com', role: 'editor' }]
    ]);
    const memberStore = new Map([
        ['user-uid', { uid: 'user-uid', email: 'collab@example.com', role: 'editor' }]
    ]);
    const metaStore = new Map([
        ['team', { ownerUid: 'some-owner-uid', initialized: true }]
    ]);

    const firestoreDb = {
        collection: (col) => ({
            doc: (docId) => ({
                get: async () => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : (col === 'meta' ? metaStore : new Map()));
                    const exists = store.has(docId);
                    return { exists, data: () => exists ? { ...store.get(docId) } : null };
                },
                set: async (data) => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : (col === 'meta' ? metaStore : new Map()));
                    store.set(docId, data);
                },
                delete: async () => {
                    const store = col === 'members' ? memberStore : (col === 'invites' ? inviteStore : (col === 'meta' ? metaStore : new Map()));
                    store.delete(docId);
                }
            })
        })
    };

    const ctx = {
        COLLAB_MODE: true,
        GUEST_MODE: false,
        firebase: { firestore: () => firestoreDb },
        ensureFirebase: async () => {},
        CollabStore: { enableOfflinePersistence: async () => {} },
        document: {
            getElementById: () => null,
            querySelector: () => null
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/collab-bootstrap.js'), ctx);

    // Existing member logs in
    const res = await ctx.CollabBootstrap.initTeamUser({ uid: 'user-uid', email: 'Collab@Example.COM' });
    assert.equal(res.status, 'member');
    assert.equal(inviteStore.has('collab@example.com'), false, 'Leftover invite must be deleted when member logs in');
});
