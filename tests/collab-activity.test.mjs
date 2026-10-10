import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createActivityContext(options = {}) {
    const role = options.role || 'editor';
    const uid = options.uid || 'user-123';
    const displayName = options.displayName || 'Khanh Duy Nguyen';
    const email = options.email || 'nguyenkhanhduy.sgd@gmail.com';
    const isCollab = options.collab !== false;
    const isGuest = Boolean(options.guest);

    const activityStore = new Map();
    const membersStore = new Map(options.initialMembers || [
        ['user-123', { uid: 'user-123', email, displayName, role }]
    ]);

    const activityListeners = [];
    const membersListeners = [];

    const firestoreMock = {
        collection: (colName) => {
            if (colName === 'activity') {
                return {
                    doc: (actId) => ({
                        set: async (data) => {
                            activityStore.set(actId, JSON.parse(JSON.stringify(data)));
                            fireActivitySnap();
                        },
                        delete: async () => {
                            activityStore.delete(actId);
                            fireActivitySnap();
                        }
                    }),
                    get: async () => {
                        const docs = [];
                        for (const [id, data] of activityStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs, size: docs.length };
                    },
                    onSnapshot: (cb) => {
                        activityListeners.push(cb);
                        const docs = [];
                        for (const [id, data] of activityStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        cb({ forEach: (fn) => docs.forEach(fn), docs });
                        return () => {
                            const idx = activityListeners.indexOf(cb);
                            if (idx !== -1) activityListeners.splice(idx, 1);
                        };
                    }
                };
            }
            if (colName === 'members') {
                return {
                    doc: (mUid) => ({
                        get: async () => {
                            const exists = membersStore.has(mUid);
                            return { exists, data: () => exists ? membersStore.get(mUid) : null };
                        }
                    }),
                    get: async () => {
                        const docs = [];
                        for (const [id, data] of membersStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        return { forEach: (fn) => docs.forEach(fn), docs };
                    },
                    onSnapshot: (cb) => {
                        membersListeners.push(cb);
                        const docs = [];
                        for (const [id, data] of membersStore.entries()) {
                            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
                        }
                        cb({ forEach: (fn) => docs.forEach(fn), docs });
                        return () => {
                            const idx = membersListeners.indexOf(cb);
                            if (idx !== -1) membersListeners.splice(idx, 1);
                        };
                    }
                };
            }
            if (colName === 'meta') {
                return {
                    doc: () => ({
                        get: async () => ({ exists: true, data: () => ({ initialized: true, ownerUid: 'owner-1' }) })
                    })
                };
            }
            throw new Error(`Unexpected collection in test: ${colName}`);
        }
    };

    function fireActivitySnap() {
        const docs = [];
        for (const [id, data] of activityStore.entries()) {
            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
        }
        for (const cb of [...activityListeners]) {
            cb({ forEach: (fn) => docs.forEach(fn), docs });
        }
    }

    function fireMembersSnap() {
        const docs = [];
        for (const [id, data] of membersStore.entries()) {
            docs.push({ id, data: () => JSON.parse(JSON.stringify(data)) });
        }
        for (const cb of [...membersListeners]) {
            cb({ forEach: (fn) => docs.forEach(fn), docs });
        }
    }

    const localStore = new Map();
    const modals = [];
    const toasts = [];

    const contentEl = {
        id: 'content',
        className: '',
        innerHTML: '',
        classList: { contains: () => false, add: () => {}, remove: () => {} },
        scrollTo: () => {},
        querySelectorAll: () => []
    };

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        COLLAB_MODE: isCollab,
        GUEST_MODE: isGuest,
        location: { search: isGuest ? '?guest=1' : '', hostname: 'localhost' },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid, role, displayName, email })
        },
        CollabAuth: {
            getCurrentUser: () => ({ uid, email, displayName })
        },
        firebase: {
            firestore: () => firestoreMock,
            auth: () => ({ currentUser: { uid, email, displayName } })
        },
        documents: [],
        state: { view: 'activity', category: 'all', activityFilter: 'all' },
        toast: (msg, type = 'info') => { toasts.push({ msg, type }); },
        showModal: (html) => { modals.push(html); },
        closeModal: () => {},
        enhanceInteractionSemantics: () => {},
        localStorage: {
            getItem: (k) => localStore.get(k) || null,
            setItem: (k, v) => localStore.set(k, String(v)),
            removeItem: (k) => localStore.delete(k)
        },
        document: {
            createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
            getElementById: (id) => (id === 'content' ? contentEl : null),
            querySelector: () => null
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    vm.createContext(ctx);
    vm.runInContext(read('js/constants.js'), ctx);
    vm.runInContext(read('js/utils.js'), ctx);
    ctx.state.view = 'activity';
    ctx._renderTrends = () => '';
    vm.runInContext(read('js/render-core.js'), ctx);

    // Load state.js and collab-activity.js together in ONE script VM execution:
    // ActivityLog is a lexical const from state.js without placing it on globalThis or window.
    vm.runInContext(read('js/state.js') + '\n;' + read('js/collab-activity.js'), ctx);
    vm.runInContext(read('js/collab-store.js'), ctx);
    ctx.CollabStore.setDb(firestoreMock);
    ctx.CollabStore.setUser({ uid, email, displayName });
    ctx.CollabActivity.setDb(firestoreMock);

    return {
        ctx,
        firestoreMock,
        activityStore,
        membersStore,
        fireActivitySnap,
        fireMembersSnap,
        localStore,
        toasts,
        modals
    };
}

// ---------------------------------------------------------------------------
// 1. ActivityLog lexical binding and remote list resolution
// ---------------------------------------------------------------------------
test('Tab team reads lexical ActivityLog from state.js without globalThis.ActivityLog property', () => {
    const { ctx, activityStore, fireActivitySnap } = createActivityContext({ role: 'editor' });

    // Prove ActivityLog is NOT on globalThis or window
    assert.equal(ctx.ActivityLog, undefined, 'ActivityLog must not be on globalThis');
    assert.equal(ctx.window.ActivityLog, undefined, 'ActivityLog must not be on window');

    ctx.CollabActivity.startListening();
    activityStore.set('act-lexical-1', {
        id: 'act-lexical-1',
        ts: Date.now(),
        type: 'created',
        title: 'Lexical Audit',
        actorEmail: 'lexical@example.com'
    });
    fireActivitySnap();

    // In the VM where state.js and collab-activity.js were evaluated together:
    const fromGetAll = vm.runInContext('ActivityLog.getAll()', ctx);
    assert.equal(fromGetAll.length, 1);
    assert.equal(fromGetAll[0].id, 'act-lexical-1');
    assert.equal(fromGetAll[0].title, 'Lexical Audit');

    // Rendered team activity HTML displays the item
    const html = ctx.renderActivityLog();
    assert.match(html, /Lexical Audit/);
    assert.match(html, /by lexical@example\.com/);
});

// ---------------------------------------------------------------------------
// 2. Activity payload in CollabStore.recordActivity
// ---------------------------------------------------------------------------
test('CollabStore.recordActivity: editor payload has actorEmail preserving exact case, actorName as display name, and note', async () => {
    const { ctx, activityStore } = createActivityContext({
        role: 'editor',
        uid: 'user-case',
        displayName: 'Khanh Duy Nguyen',
        email: 'NguyenKhanhDuy.SGD@Gmail.COM'
    });

    const doc = { id: 'doc-note', title: 'Test Document', category: 'general' };
    await vm.runInContext("ActivityLog.record('updated', doc, { note: 'Sprint 25 review' })", Object.assign(ctx, { doc }));

    assert.equal(activityStore.size, 1);
    const entry = Array.from(activityStore.values())[0];

    assert.equal(entry.actorEmail, 'NguyenKhanhDuy.SGD@Gmail.COM', 'actorEmail must preserve exact case and not be lowercased');
    assert.equal(entry.actorName, 'Khanh Duy Nguyen', 'actorName must match member displayName');
    assert.equal(entry.note, 'Sprint 25 review', 'Payload must preserve string note');
    assert.equal(entry.actorUid, 'user-case');
    assert.equal(entry.action, 'updated');
    assert.equal(entry.title, 'Test Document');
});

// ---------------------------------------------------------------------------
// 3. Timeline formatting with actor display in .act-sub
// ---------------------------------------------------------------------------
test('Timeline rows: two accounts with same displayName but different emails render both emails in HTML', () => {
    const { ctx } = createActivityContext({ role: 'editor' });

    const row1 = ctx._renderActivityRow({
        id: 'act-1',
        ts: Date.now() - 1000,
        type: 'updated',
        title: 'Doc A',
        actorUid: 'u1',
        actorName: 'Khanh Duy Nguyen',
        actorEmail: 'nguyenkhanhduy.sgd@gmail.com'
    });

    const row2 = ctx._renderActivityRow({
        id: 'act-2',
        ts: Date.now() - 500,
        type: 'updated',
        title: 'Doc B',
        actorUid: 'u2',
        actorName: 'Khanh Duy Nguyen',
        actorEmail: 'nguyenkhanhduy.contact@gmail.com'
    });

    assert.match(row1, /by Khanh Duy Nguyen \(nguyenkhanhduy\.sgd@gmail\.com\)/);
    assert.match(row2, /by Khanh Duy Nguyen \(nguyenkhanhduy\.contact@gmail\.com\)/);
    assert.match(row1, /class="act-sub"[^>]*>[\s\S]*?nguyenkhanhduy\.sgd@gmail\.com[\s\S]*?<\/span>/, 'Account must be inside .act-sub');
    assert.match(row2, /class="act-sub"[^>]*>[\s\S]*?nguyenkhanhduy\.contact@gmail\.com[\s\S]*?<\/span>/, 'Account must be inside .act-sub');
});

test('Timeline rows: old document without actorEmail resolves email from members/{uid}', () => {
    const { ctx } = createActivityContext({
        role: 'editor',
        initialMembers: [
            ['old-uid', { uid: 'old-uid', email: 'legacy@example.com', displayName: 'Legacy Member' }]
        ]
    });
    ctx.CollabActivity.startListening();

    const row = ctx._renderActivityRow({
        id: 'act-old',
        ts: Date.now(),
        type: 'created',
        title: 'Legacy Document',
        actorUid: 'old-uid',
        actorName: 'Legacy Member' // document does not have actorEmail
    });

    assert.match(row, /by Legacy Member \(legacy@example\.com\)/, 'Must resolve email from active members/{uid}');
});

test('Timeline rows: member who left uses saved actorEmail, then actorName', () => {
    const { ctx } = createActivityContext({
        role: 'editor',
        initialMembers: [] // member is no longer in members collection
    });
    ctx.CollabActivity.startListening();

    const rowWithEmail = ctx._renderActivityRow({
        id: 'act-left',
        ts: Date.now(),
        type: 'deleted',
        title: 'Old Task',
        actorUid: 'former-uid',
        actorName: 'Former Colleague',
        actorEmail: 'former@example.com'
    });
    assert.match(rowWithEmail, /by Former Colleague \(former@example\.com\)/);

    const rowNameOnly = ctx._renderActivityRow({
        id: 'act-name-only',
        ts: Date.now(),
        type: 'deleted',
        title: 'Old Task',
        actorUid: 'former-uid-2',
        actorName: 'Name Only'
    });
    assert.match(rowNameOnly, /by Name Only/);
});

test('Timeline rows: entry without name and email renders "Unknown account"', () => {
    const { ctx } = createActivityContext({ role: 'editor', initialMembers: [] });
    ctx.CollabActivity.startListening();

    const row = ctx._renderActivityRow({
        id: 'act-anon',
        ts: Date.now(),
        type: 'moved',
        title: 'Anonymous Action'
    });

    assert.match(row, /by Unknown account/);
});

test('Timeline rows: entry with only email renders "by <email>"', () => {
    const { ctx } = createActivityContext({ role: 'editor', initialMembers: [] });
    ctx.CollabActivity.startListening();

    const row = ctx._renderActivityRow({
        id: 'act-only-email',
        ts: Date.now(),
        type: 'updated',
        title: 'Doc',
        actorEmail: 'nguyenkhanhduy.sgd@gmail.com'
    });

    assert.match(row, /by nguyenkhanhduy\.sgd@gmail\.com/);
    assert.doesNotMatch(row, /\(nguyenkhanhduy\.sgd@gmail\.com\)/, 'Should not duplicate email in parens when only email exists');
});

test('Timeline rows: hostile characters in name and email are HTML-escaped', () => {
    const { ctx } = createActivityContext({ role: 'editor', initialMembers: [] });
    ctx.CollabActivity.startListening();

    const row = ctx._renderActivityRow({
        id: 'act-xss',
        ts: Date.now(),
        type: 'updated',
        title: 'XSS Test',
        actorName: 'Evil <script>alert(1)</script>',
        actorEmail: 'bad<img onerror=1>@example.com'
    });

    assert.doesNotMatch(row, /<script>/i);
    assert.doesNotMatch(row, /<img/i);
    assert.match(row, /&lt;script&gt;/);
    assert.match(row, /&lt;img/);
});

// ---------------------------------------------------------------------------
// 4. Snapshot deduplication, client sorting, and replacement
// ---------------------------------------------------------------------------
test('Snapshot deduplication: repeated entries with the same id result in exactly one row', () => {
    const { ctx, activityStore, fireActivitySnap } = createActivityContext({ role: 'editor' });
    ctx.CollabActivity.startListening();

    // Populate activityStore with duplicate ID
    activityStore.set('dup-id', {
        id: 'dup-id',
        ts: 1000,
        type: 'created',
        title: 'Unique Document',
        actorEmail: 'khanh@example.com'
    });
    fireActivitySnap();

    const activities = ctx.CollabActivity.getRemoteActivities();
    assert.equal(activities.length, 1, 'Only one item for dup-id');

    const html = ctx.renderActivityLog();
    const count = (html.match(/Unique Document/g) || []).length;
    assert.equal(count, 1, 'Modal/HTML must render exactly one row for dup-id');
});

test('Snapshot behavior: newest first, capped at ActivityLog.MAX (200), does not read localStorage', () => {
    const { ctx, activityStore, fireActivitySnap, localStore } = createActivityContext({ role: 'editor' });
    localStore.set('docvault_activity_log', JSON.stringify([{ id: 'local-only', title: 'Should Not Appear' }]));
    ctx.CollabActivity.startListening();

    for (let i = 1; i <= 250; i++) {
        activityStore.set(`act-${i}`, {
            id: `act-${i}`,
            ts: i * 10,
            type: 'updated',
            title: `Action ${i}`,
            actorEmail: 'member@example.com'
        });
    }
    fireActivitySnap();

    const activities = vm.runInContext('ActivityLog.getAll()', ctx);
    assert.equal(activities.length, 200, 'Must be capped at ActivityLog.MAX (200)');
    assert.equal(activities[0].id, 'act-250', 'Newest item must be first');
    assert.equal(activities[199].id, 'act-51');
    assert.ok(!activities.some(a => a.id === 'local-only'), 'Must NOT read from localStorage in collab mode');

    // Personal mode reads localStorage
    ctx.COLLAB_MODE = false;
    const personalAll = vm.runInContext('ActivityLog.getAll()', ctx);
    assert.equal(personalAll.length, 1);
    assert.equal(personalAll[0].id, 'local-only');
});

// ---------------------------------------------------------------------------
// 5. Repeated execution idempotence & loadCollabActivity concurrent deduplication
// ---------------------------------------------------------------------------
test('collab-activity.js running twice does not detach store from listener or duplicate state', () => {
    const { ctx, activityStore, fireActivitySnap } = createActivityContext({ role: 'editor' });

    // Run collab-activity.js a second time in the same context
    vm.runInContext(read('js/collab-activity.js'), ctx);
    ctx.CollabActivity.startListening();

    activityStore.set('act-twice', {
        id: 'act-twice',
        ts: Date.now(),
        type: 'updated',
        title: 'Twice Tested',
        actorEmail: 'twice@example.com'
    });
    fireActivitySnap();

    const fromGetAll = vm.runInContext('ActivityLog.getAll()', ctx);
    assert.equal(fromGetAll.length, 1);
    assert.equal(fromGetAll[0].id, 'act-twice');
    assert.equal(ctx.CollabActivity.getRemoteActivities().length, 1);
});

test('loadCollabActivity() called twice concurrently does not insert a second script tag, and snapshot delivers to getAll()', async () => {
    const appendedScripts = [];
    const domMock = {
        createElement: (tag) => ({
            tagName: tag.toUpperCase(),
            onload: null,
            onerror: null,
            _src: '',
            get src() { return this._src; },
            set src(v) { this._src = v; }
        }),
        head: {
            appendChild: (el) => {
                appendedScripts.push(el);
                return el;
            }
        }
    };

    const testCtx = {
        console,
        document: domMock,
        URLSearchParams
    };
    testCtx.window = testCtx;
    testCtx.globalThis = testCtx;
    vm.createContext(testCtx);
    vm.runInContext(read('js/collab-bootstrap.js'), testCtx);

    // Call loadCollabActivity() twice in rapid succession before script loads
    const p1 = testCtx.CollabBootstrap.loadCollabActivity();
    const p2 = testCtx.CollabBootstrap.loadCollabActivity();

    const actScripts = appendedScripts.filter(s => s.src === 'js/collab-activity.js');
    assert.equal(actScripts.length, 1, 'Must insert only ONE script tag for collab-activity even when called multiple times');
    assert.equal(p1, p2, 'Both calls must return the same in-flight Promise');

    // Simulate script loading by evaluating state.js + collab-activity.js in testCtx
    vm.runInContext(read('js/state.js') + '\n;' + read('js/collab-activity.js'), testCtx);
    actScripts[0].onload();
    await Promise.all([p1, p2]);

    // Set up collab mode and Firestore mock
    testCtx.COLLAB_MODE = true;
    const actStore = new Map([
        ['act-after-load', { id: 'act-after-load', ts: 12345, type: 'created', title: 'After Load Doc', actorEmail: 'after@load.com' }]
    ]);
    const mockDb = {
        collection: (col) => ({
            onSnapshot: (cb) => {
                const docs = [];
                for (const [id, data] of actStore.entries()) docs.push({ id, data: () => data });
                cb({ forEach: (fn) => docs.forEach(fn), docs });
                return () => {};
            }
        })
    };
    testCtx.CollabActivity.setDb(mockDb);
    testCtx.CollabActivity.startListening();

    const all = vm.runInContext('ActivityLog.getAll()', testCtx);
    assert.equal(all.length, 1);
    assert.equal(all[0].id, 'act-after-load');
});

// ---------------------------------------------------------------------------
// 6. Subtitle and Clear button permissions
// ---------------------------------------------------------------------------
test('Header subtitle: team edition renders team copy, personal edition renders personal copy', () => {
    const { ctx, activityStore, fireActivitySnap } = createActivityContext({ role: 'editor' });
    ctx.CollabActivity.startListening();
    activityStore.set('act-1', { id: 'act-1', ts: Date.now(), type: 'updated', title: 'Doc' });
    fireActivitySnap();

    // Team edition
    const teamHtml = ctx.renderActivityLog();
    assert.match(teamHtml, /Changes in this team vault — last 200 actions, with the account that made each one\./);
    assert.doesNotMatch(teamHtml, /A personal timeline of changes/);

    // Personal edition
    ctx.COLLAB_MODE = false;
    const personalHtml = ctx.renderActivityLog();
    assert.match(personalHtml, /A personal timeline of changes across this vault — last 200 actions, synced across your devices\./);
    assert.doesNotMatch(personalHtml, /Changes in this team vault/);
});

test('Clear button permissions: editor and viewer do NOT see Clear button, owner sees Clear button and can clear', async () => {
    // 1. Editor
    const { ctx: ctxEditor, activityStore: editorStore, fireActivitySnap: fireEditor } = createActivityContext({ role: 'editor' });
    ctxEditor.CollabActivity.startListening();
    editorStore.set('act-1', { id: 'act-1', ts: Date.now(), type: 'created', title: 'Doc 1' });
    fireEditor();

    const editorHtml = ctxEditor.renderActivityLog();
    assert.doesNotMatch(editorHtml, /confirmClearActivityLog/, 'Editor HTML must NOT contain confirmClearActivityLog');

    // Attempting clearActivityLog as editor must NOT delete from Firestore
    await ctxEditor.clearActivityLog();
    assert.equal(editorStore.size, 1, 'Editor clearActivityLog must not delete Firestore documents');

    // 2. Viewer
    const { ctx: ctxViewer, activityStore: viewerStore, fireActivitySnap: fireViewer } = createActivityContext({ role: 'viewer' });
    ctxViewer.CollabActivity.startListening();
    viewerStore.set('act-1', { id: 'act-1', ts: Date.now(), type: 'created', title: 'Doc 1' });
    fireViewer();

    const viewerHtml = ctxViewer.renderActivityLog();
    assert.doesNotMatch(viewerHtml, /confirmClearActivityLog/, 'Viewer HTML must NOT contain confirmClearActivityLog');

    await ctxViewer.clearActivityLog();
    assert.equal(viewerStore.size, 1, 'Viewer clearActivityLog must not delete Firestore documents');

    // 3. Owner
    const { ctx: ctxOwner, activityStore: ownerStore, fireActivitySnap: fireOwner } = createActivityContext({ role: 'owner' });
    ctxOwner.CollabActivity.startListening();
    ownerStore.set('act-1', { id: 'act-1', ts: Date.now(), type: 'created', title: 'Doc 1' });
    ownerStore.set('act-2', { id: 'act-2', ts: Date.now(), type: 'updated', title: 'Doc 2' });
    fireOwner();

    const ownerHtml = ctxOwner.renderActivityLog();
    assert.match(ownerHtml, /confirmClearActivityLog/, 'Owner HTML MUST contain confirmClearActivityLog');

    // Owner clearActivityLog deletes all documents from Firestore
    await ctxOwner.clearActivityLog();
    assert.equal(ownerStore.size, 0, 'Owner clearActivityLog must delete all activity documents');
});

// ---------------------------------------------------------------------------
// 7. Lifecycle and maintainability contracts
// ---------------------------------------------------------------------------
test('Lifecycle: CollabBootstrap.signOut calls CollabActivity.stopListening', async () => {
    let stopped = false;
    const ctx = {
        CollabActivity: {
            stopListening: () => { stopped = true; }
        },
        CollabAuth: {
            signOutUser: async () => {}
        },
        document: {
            getElementById: () => null,
            querySelector: () => null
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/collab-bootstrap.js'), ctx);

    await ctx.CollabBootstrap.signOut();
    assert.equal(stopped, true, 'signOut must invoke CollabActivity.stopListening()');
});

test('Maintainability: line budgets and js/render-core.js integrity hold', () => {
    const actLines = read('js/collab-activity.js').split(/\r?\n/).length;
    assert.ok(actLines <= 400, `js/collab-activity.js exceeds 400 lines (got ${actLines})`);

    const bootLines = read('js/collab-bootstrap.js').split(/\r?\n/).length;
    assert.ok(bootLines <= 400, `js/collab-bootstrap.js exceeds 400 lines (got ${bootLines})`);

    const storeLines = read('js/collab-store.js').split(/\r?\n/).length;
    assert.ok(storeLines <= 400, `js/collab-store.js exceeds 400 lines (got ${storeLines})`);

    const renderCore = read('js/render-core.js');
    assert.doesNotMatch(renderCore, /actorEmail/, 'js/render-core.js must NOT contain actorEmail');
});
