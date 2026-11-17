import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function createCollabContext(options = {}) {
    const role = options.role || 'editor';
    const uid = options.uid || 'user-123';
    const displayName = options.displayName || 'Test User';
    const email = options.email || 'user@example.com';
    const photoURL = options.photoURL || '';
    const isCollab = options.collab !== false;
    const isGuest = Boolean(options.guest);

    const activityStore = options.activityStore || new Map();
    const historyStore = options.historyStore || new Map(); // key: `${docId}/${snapId}`
    const countersStore = options.countersStore || new Map(); // key: 'bugs' -> { next: number }

    const dbCalls = {
        activitySets: [],
        historySets: [],
        historyDeletes: [],
        transactionRuns: 0
    };

    const firestoreMock = {
        collection: (colName) => {
            if (colName === 'activity') {
                return {
                    doc: (actId) => ({
                        set: async (data) => {
                            if (options.failActivity) throw new Error('Activity write failed simulated');
                            dbCalls.activitySets.push({ id: actId, data: JSON.parse(JSON.stringify(data)) });
                            activityStore.set(actId, JSON.parse(JSON.stringify(data)));
                        }
                    })
                };
            }
            if (colName === 'documents') {
                return {
                    doc: (docId) => ({
                        collection: (subName) => {
                            if (subName === 'history') {
                                return {
                                    get: async () => {
                                        const snaps = [];
                                        for (const [key, val] of historyStore.entries()) {
                                            if (key.startsWith(`${docId}/`)) {
                                                const sId = key.slice(docId.length + 1);
                                                snaps.push({ id: sId, data: () => JSON.parse(JSON.stringify(val)) });
                                            }
                                        }
                                        return { forEach: (fn) => snaps.forEach(fn), docs: snaps };
                                    },
                                    doc: (snapId) => ({
                                        set: async (data) => {
                                            dbCalls.historySets.push({ docId, snapId, data: JSON.parse(JSON.stringify(data)) });
                                            historyStore.set(`${docId}/${snapId}`, JSON.parse(JSON.stringify(data)));
                                        },
                                        delete: async () => {
                                            dbCalls.historyDeletes.push({ docId, snapId });
                                            historyStore.delete(`${docId}/${snapId}`);
                                        }
                                    })
                                };
                            }
                            throw new Error(`Unexpected subcollection: ${subName}`);
                        }
                    })
                };
            }
            if (colName === 'counters') {
                return {
                    doc: (cId) => ({
                        id: cId,
                        _isRef: true
                    })
                };
            }
            throw new Error(`Unexpected collection: ${colName}`);
        },
        runTransaction: async (updateFunction) => {
            dbCalls.transactionRuns++;
            const tx = {
                get: async (ref) => {
                    const exists = countersStore.has(ref.id);
                    const data = exists ? JSON.parse(JSON.stringify(countersStore.get(ref.id))) : null;
                    return { exists, data: () => data };
                },
                set: (ref, data) => {
                    countersStore.set(ref.id, JSON.parse(JSON.stringify(data)));
                },
                update: (ref, data) => {
                    countersStore.set(ref.id, JSON.parse(JSON.stringify(data)));
                }
            };
            return await updateFunction(tx);
        }
    };

    const localStore = new Map();
    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        COLLAB_MODE: isCollab,
        GUEST_MODE: isGuest,
        location: { search: isGuest ? '?guest=1' : '', hostname: 'localhost' },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid, role, displayName, email, photoURL })
        },
        CollabAuth: {
            getCurrentUser: () => ({ uid, email, displayName, photoURL })
        },
        firebase: {
            firestore: () => firestoreMock,
            auth: () => ({ currentUser: { uid, email, displayName, photoURL } })
        },
        toast: () => {},
        documents: [],
        state: { view: 'documents', category: 'all' },
        localStorage: {
            getItem: (k) => localStore.get(k) || null,
            setItem: (k, v) => localStore.set(k, String(v)),
            removeItem: (k) => localStore.delete(k)
        },
        document: {
            createElement: () => ({ setAttribute: () => {}, appendChild: () => {}, remove: () => {} }),
            getElementById: () => null,
            querySelector: () => null
        }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);

    vm.runInContext(read('js/collab-store.js'), ctx);
    ctx.CollabStore.setDb(firestoreMock);
    ctx.CollabStore.setUser({ uid, email, displayName, photoURL });
    vm.runInContext(read('js/state.js') + '\n;globalThis.DocHistory = DocHistory; globalThis.ActivityLog = ActivityLog;', ctx);

    return { ctx, firestoreMock, activityStore, historyStore, countersStore, dbCalls, localStore };
}

// ---------------------------------------------------------------------------
// 1. Bug Number Counter Transaction Tests
// ---------------------------------------------------------------------------
test('allocateBugNumber: two consecutive calls return two different sequential numbers (Phase 8)', async () => {
    const { ctx, countersStore, dbCalls } = createCollabContext({ role: 'editor' });

    assert.equal(countersStore.has('bugs'), false, 'Counter doc initially absent');

    // First allocation: counter is created with next: 1, returns 1
    const num1 = await ctx.CollabStore.allocateBugNumber();
    assert.equal(num1, 1, 'First bug number allocated must be 1');
    assert.equal(countersStore.get('bugs')?.next, 1, 'Counter state next is 1');

    // Second allocation: counter exists with next: 1, increments to 2, returns 2
    const num2 = await ctx.CollabStore.allocateBugNumber();
    assert.equal(num2, 2, 'Second bug number allocated must be 2');
    assert.equal(countersStore.get('bugs')?.next, 2, 'Counter state next is 2');

    // Two consecutive calls MUST return two different numbers
    assert.notEqual(num1, num2, 'Two consecutive allocations must produce different numbers');
    assert.equal(dbCalls.transactionRuns, 2, 'Two transactions executed');
});

test('allocateBugNumber: ignores local max when COLLAB_MODE is enabled', async () => {
    const { ctx } = createCollabContext({ role: 'editor' });
    // Local documents have a bug with bugNumber: 999
    ctx.documents.push({ id: 'local-bug', category: 'bug', bugNumber: 999 });

    // In collab mode, allocation must come from Firestore counter (1), NOT local max + 1 (1000)
    const num = await ctx.CollabStore.allocateBugNumber();
    assert.equal(num, 1, 'Collab bug number must use Firestore counter and not local max + 1');
});

test('allocateBugNumber: in guest mode or COLLAB_MODE off, does not call Firestore and uses local max', async () => {
    const { ctx: ctxGuest, dbCalls: guestCalls } = createCollabContext({ guest: true });
    ctxGuest.documents.push({ id: 'b1', category: 'bug', bugNumber: 5 });
    const guestNum = await ctxGuest.CollabStore.allocateBugNumber();
    assert.equal(guestNum, 6, 'Guest mode must use local calculation max + 1');
    assert.equal(guestCalls.transactionRuns, 0, 'Guest mode must NOT call Firestore transactions');

    const { ctx: ctxOff, dbCalls: offCalls } = createCollabContext({ collab: false });
    ctxOff.documents.push({ id: 'b2', category: 'bug', bugNumber: 10 });
    const offNum = await ctxOff.CollabStore.allocateBugNumber();
    assert.equal(offNum, 11, 'Collab off must use local calculation max + 1');
    assert.equal(offCalls.transactionRuns, 0, 'Collab off must NOT call Firestore transactions');
});

// ---------------------------------------------------------------------------
// 2. Activity Log Tests
// ---------------------------------------------------------------------------
test('ActivityLog.record: editor/owner records to activity/{id} with auth.uid, name, and same local id', async () => {
    const { ctx, activityStore } = createCollabContext({
        role: 'editor',
        uid: 'ed-uid-456',
        displayName: 'Alice Editor'
    });

    const doc = { id: 'doc-1', title: 'Test Document', category: 'general' };
    await ctx.ActivityLog.record('created', doc, { note: 'initial' });

    assert.equal(activityStore.size, 1, 'One activity entry created in Firestore');
    const [actId, entry] = Array.from(activityStore.entries())[0];
    assert.match(actId, /^act_/, 'Uses same id format as local entry');
    assert.equal(entry.id, actId);
    assert.equal(entry.actorUid, 'ed-uid-456', 'actorUid must strictly match auth.uid');
    assert.equal(entry.actorName, 'Alice Editor', 'actorName must match member displayName');
    assert.equal(entry.actorEmail, 'user@example.com', 'actorEmail must match member email');
    assert.equal(entry.note, 'initial', 'note must be preserved in payload');
    assert.equal(entry.action, 'created');
    assert.equal(entry.docId, 'doc-1');
    assert.equal(entry.title, 'Test Document');
});

test('ActivityLog.record: failure to write activity does not cancel or throw', async () => {
    const { ctx } = createCollabContext({ role: 'editor', failActivity: true });

    const doc = { id: 'doc-1', title: 'Test Document', category: 'general' };
    // Must not throw despite Firestore failure
    await assert.doesNotReject(async () => {
        await ctx.ActivityLog.record('updated', doc);
    }, 'ActivityLog failure must not throw or abort document save');
});

test('ActivityLog.record: viewer and guest do NOT create Firestore activity', async () => {
    const { ctx: ctxViewer, activityStore: viewerStore } = createCollabContext({ role: 'viewer' });
    const doc = { id: 'doc-1', title: 'Viewer Doc', category: 'general' };
    await ctxViewer.ActivityLog.record('updated', doc);
    assert.equal(viewerStore.size, 0, 'Viewer must not write to Firestore activity');

    const { ctx: ctxGuest, activityStore: guestStore } = createCollabContext({ guest: true });
    await ctxGuest.ActivityLog.record('updated', doc);
    assert.equal(guestStore.size, 0, 'Guest must not write to Firestore activity');
});

// ---------------------------------------------------------------------------
// 3. Document Revision History Tests
// ---------------------------------------------------------------------------
test('DocHistory.save: skips credential documents completely (no password stored)', async () => {
    const { ctx, historyStore } = createCollabContext({ role: 'editor' });

    const credDoc = {
        id: 'cred-1',
        title: 'DB Password',
        category: 'credential',
        username: 'admin',
        password: 'super-secret-password-123'
    };

    await ctx.DocHistory.save(credDoc);
    assert.equal(historyStore.size, 0, 'Credential documents must be completely skipped from history');
});

test('DocHistory.save: editor adds snapshots up to 10 and stops at 10 without deleting', async () => {
    const { ctx, historyStore, dbCalls } = createCollabContext({
        role: 'editor',
        uid: 'editor-uid-99'
    });

    const doc = { id: 'doc-edit', title: 'Doc Version', content: 'v0', category: 'general' };

    // Editor saves 10 distinct revisions
    for (let i = 1; i <= 10; i++) {
        doc.content = `revision-${i}`;
        await ctx.DocHistory.save(doc);
    }

    assert.equal(historyStore.size, 10, 'Editor saved 10 snapshots');
    assert.equal(dbCalls.historyDeletes.length, 0, 'Editor must NEVER delete history snapshots');

    // 11th revision: editor must stop adding and must not delete
    doc.content = 'revision-11';
    await ctx.DocHistory.save(doc);

    assert.equal(historyStore.size, 10, 'Editor stops at 10 snapshots and does not add 11th');
    assert.equal(dbCalls.historyDeletes.length, 0, 'Editor branch must not delete any snapshots');

    // Verify all 10 saved snapshots have savedBy matching editor uid
    for (const snap of historyStore.values()) {
        assert.equal(snap.savedBy, 'editor-uid-99', 'savedBy must match editor auth.uid');
        assert.equal(snap.password, undefined, 'password must never be saved');
    }
});

test('DocHistory.save: owner adds snapshots beyond 10 and deletes oldest snapshots to keep max 10', async () => {
    const { ctx, historyStore, dbCalls } = createCollabContext({
        role: 'owner',
        uid: 'owner-uid-01'
    });

    const doc = { id: 'doc-owner', title: 'Owner Doc', content: 'init', category: 'general' };

    // Owner saves 10 snapshots
    for (let i = 1; i <= 10; i++) {
        doc.content = `v-${i}`;
        await ctx.DocHistory.save(doc);
    }
    assert.equal(historyStore.size, 10);
    assert.equal(dbCalls.historyDeletes.length, 0);

    // 11th revision: owner adds new snapshot and deletes oldest snapshot
    doc.content = 'v-11';
    await ctx.DocHistory.save(doc);

    assert.equal(historyStore.size, 10, 'Owner keeps exactly max 10 snapshots');
    assert.equal(dbCalls.historyDeletes.length, 1, 'Owner deleted the oldest snapshot to maintain max 10');

    // 12th revision
    doc.content = 'v-12';
    await ctx.DocHistory.save(doc);
    assert.equal(historyStore.size, 10, 'Owner keeps max 10 snapshots');
    assert.equal(dbCalls.historyDeletes.length, 2, 'Owner pruned another old snapshot');
});

// ---------------------------------------------------------------------------
// 4. Client actions-documents.js integration
// ---------------------------------------------------------------------------
test('actions-documents.js: saveDoc and duplicateDoc await _nextBugNumber and allocate sequentially', async () => {
    const { ctx } = createCollabContext({ role: 'editor' });
    vm.runInContext(read('js/actions-documents.js'), ctx);

    // Verify _nextBugNumber exists and is async
    assert.equal(typeof ctx._nextBugNumber, 'function');

    const numA = await ctx._nextBugNumber();
    assert.equal(numA, 1);

    const numB = await ctx._nextBugNumber();
    assert.equal(numB, 2);
    assert.notEqual(numA, numB, 'Consecutive bug numbers must be distinct');
});

// ---------------------------------------------------------------------------
// 5. Multi-Account History Sync & Diff View
// ---------------------------------------------------------------------------
test('CollabStore.loadHistory and DocHistory.load: snapshots saved by Account A are synced and loaded by Account B in Collab Mode', async () => {
    const historyStore = new Map();

    // Account A (Alice)
    const { ctx: ctxA } = createCollabContext({
        role: 'editor',
        uid: 'user-a-111',
        displayName: 'Alice Architect',
        email: 'alice@team.com',
        photoURL: 'https://cdn.example.com/alice.png',
        historyStore
    });

    // Account B (Bob)
    const { ctx: ctxB } = createCollabContext({
        role: 'editor',
        uid: 'user-b-222',
        displayName: 'Bob Builder',
        email: 'bob@team.com',
        photoURL: 'https://cdn.example.com/bob.png',
        historyStore
    });

    const docId = 'spec-doc-42';
    const docA = { id: docId, title: 'Auth Specification', content: 'v1 initial content by Alice', category: 'general', status: 'active' };

    // 1. Account A saves doc to history
    await ctxA.DocHistory.save(docA);

    // Verify snapshot in Firestore contains author metadata
    assert.equal(historyStore.size, 1);
    const [snapKey, snapData] = Array.from(historyStore.entries())[0];
    assert.ok(snapKey.startsWith(`${docId}/`));
    assert.equal(snapData.savedBy, 'user-a-111');
    assert.equal(snapData.savedByName, 'Alice Architect');
    assert.equal(snapData.savedByEmail, 'alice@team.com');
    assert.equal(snapData.savedByPhoto, 'https://cdn.example.com/alice.png');
    assert.equal(snapData.content, 'v1 initial content by Alice');

    // 2. Account B's local storage initially has NO history for this doc
    assert.equal(ctxB.DocHistory.get(docId).length, 0, 'Account B local storage empty initially');

    // 3. CollabStore.loadHistory loads the remote snapshots directly
    const directRemote = await ctxB.CollabStore.loadHistory(docId);
    assert.equal(directRemote.length, 1);
    assert.equal(directRemote[0].savedByName, 'Alice Architect');
    assert.equal(directRemote[0].content, 'v1 initial content by Alice');

    // 4. DocHistory.load loads from CollabStore, merges, updates Account B's localStorage cache, and returns
    const loadedForB = await ctxB.DocHistory.load(docId);
    assert.equal(loadedForB.length, 1);
    assert.equal(loadedForB[0].savedByName, 'Alice Architect');
    assert.equal(loadedForB[0].savedByPhoto, 'https://cdn.example.com/alice.png');

    // Verify Account B's local storage cache is now populated
    const cachedB = ctxB.DocHistory.get(docId);
    assert.equal(cachedB.length, 1);
    assert.equal(cachedB[0].savedByName, 'Alice Architect');
    assert.equal(cachedB[0].content, 'v1 initial content by Alice');

    // 5. Account B edits the document and saves a new revision
    await new Promise(r => setTimeout(r, 15));
    const docB = { id: docId, title: 'Auth Specification', content: 'v2 modified by Bob', category: 'general', status: 'published' };
    await ctxB.DocHistory.save(docB);

    assert.equal(historyStore.size, 2);

    // 6. Account A loads history: merges both revisions deduplicated, sorted newest first
    const loadedForA = await ctxA.DocHistory.load(docId);
    assert.equal(loadedForA.length, 2);
    assert.equal(loadedForA[0].savedByName, 'Bob Builder');
    assert.equal(loadedForA[0].content, 'v2 modified by Bob');
    assert.equal(loadedForA[1].savedByName, 'Alice Architect');
    assert.equal(loadedForA[1].content, 'v1 initial content by Alice');

    // Verify deduplication on repeated load
    const reloadedA = await ctxA.DocHistory.load(docId);
    assert.equal(reloadedA.length, 2, 'Deduplication prevents duplicate entries on repeated load');
});

test('GitHub-style diff rendering: _buildDiffHtml renders dual gutters, hunk headers, and word-level diff', () => {
    const ctx = {
        console,
        escHtml: (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        window: {}
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(read('js/actions-batch-history.js'), ctx);

    const oldText = 'function test() {\n    const a = 1;\n    return a;\n}';
    const newText = 'function test() {\n    const a = 2;\n    return a;\n}';
    const diff = ctx._diffLines(oldText, newText);
    const html = ctx._buildDiffHtml(diff);

    assert.match(html, /class="diff-skip"/, 'Renders hunk header with diff-skip');
    assert.match(html, /class="diff-hunk-tag">@@\s*-\d+,\d+\s*\+\d+,\d+\s*@@/, 'Renders @@ -old,count +new,count @@');
    assert.match(html, /class="diff-del"/, 'Renders diff-del line');
    assert.match(html, /class="diff-add"/, 'Renders diff-add line');
    assert.match(html, /class="diff-word-del"/, 'Renders word-level deletion highlight');
    assert.match(html, /class="diff-word-add"/, 'Renders word-level addition highlight');
    assert.match(html, /class="diff-num"/, 'Renders line number gutter');
    assert.match(html, /class="diff-sign"/, 'Renders sign column');
    assert.match(html, /class="diff-code"/, 'Renders code column');
});

test('DocHistory solo mode and photo validation: solo mode omits author metadata; insecure photo is stripped', async () => {
    // Solo mode context: COLLAB_MODE = false
    const lStore = new Map();
    const soloCtx = {
        console,
        COLLAB_MODE: false,
        _wsKey: (k) => k,
        localStorage: {
            getItem: (k) => lStore.get(k) || null,
            setItem: (k, v) => lStore.set(k, String(v))
        }
    };
    soloCtx.window = soloCtx;
    vm.createContext(soloCtx);
    vm.runInContext(read('js/state.js') + '\n;globalThis.DocHistory = DocHistory;', soloCtx);

    const doc = { id: 'solo-doc-1', title: 'Solo Doc', content: 'Solo content' };
    await soloCtx.DocHistory.save(doc);

    const snaps = soloCtx.DocHistory.get('solo-doc-1');
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].savedByName, undefined, 'Solo mode must NOT store savedByName');
    assert.equal(snaps[0].savedByEmail, undefined, 'Solo mode must NOT store savedByEmail');
    assert.equal(snaps[0].savedByPhoto, undefined, 'Solo mode must NOT store savedByPhoto');
    assert.ok(snaps[0].id && snaps[0].id.startsWith('snap_'), 'Snapshot has identity snapId');

    // Collab Mode with insecure http:// photo
    const { ctx: collabCtx, historyStore } = createCollabContext({
        role: 'editor',
        uid: 'user-insecure',
        displayName: 'Eve Editor',
        email: 'eve@team.com',
        photoURL: 'http://insecure.example.com/avatar.jpg' // http, not https
    });

    const doc2 = { id: 'collab-doc-2', title: 'Insecure Photo Doc', content: 'content' };
    await collabCtx.DocHistory.save(doc2);

    const collabSnaps = collabCtx.DocHistory.get('collab-doc-2');
    assert.equal(collabSnaps.length, 1);
    assert.equal(collabSnaps[0].savedByPhoto, undefined, 'Insecure http photo must be stripped from local snapshot');

    const remoteSnap = Array.from(historyStore.values())[0];
    assert.equal(remoteSnap.savedByPhoto, undefined, 'Insecure http photo must be stripped from remote Firestore snapshot');
});
