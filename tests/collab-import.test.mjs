import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function createCollabImportContext(customGlobals = {}) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        COLLAB_MODE: true,
        GUEST_MODE: false,
        toast: (msg, type) => { sandbox._toasts.push({ msg, type }); },
        _toasts: [],
        documents: [],
        state: { editingDoc: null },
        localStorage: {
            _store: new Map(),
            getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
            setItem(k, v) { this._store.set(k, String(v)); },
            removeItem(k) { this._store.delete(k); },
            clear() { this._store.clear(); }
        },
        sessionStorage: {
            _store: new Map(),
            getItem(k) { return this._store.has(k) ? this._store.get(k) : null; },
            setItem(k, v) { this._store.set(k, String(v)); },
            removeItem(k) { this._store.delete(k); }
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'owner-uid', role: 'owner' })
        },
        CollabStore: {
            toFirestoreDoc: (doc, meta) => ({
                id: doc.id,
                title: doc.title || '',
                category: doc.category || 'general',
                content: doc.content || '',
                username: doc.username || '',
                password: doc.password || '',
                bugNumber: doc.bugNumber || null,
                version: meta.version || 1,
                createdBy: meta.createdBy || 'owner-uid',
                updatedBy: meta.updatedBy || 'owner-uid',
                createdAt: meta.createdAt || 1000,
                updatedAt: meta.updatedAt || 1000
            })
        },
        ...customGlobals
    };

    sandbox.window = sandbox;

    const importCode = read('js/collab-import.js');
    vm.createContext(sandbox);
    vm.runInContext(importCode, sandbox);
    return sandbox;
}

test('Shell contracts: events.js loads collab-import, sw.js caches it in v70, and line budgets hold', () => {
    const events = read('js/events.js');
    assert.match(events, /'collab-import'/);
    assert.ok(events.indexOf("'collab-import'") < events.indexOf('CollabBootstrap?.start'));

    const sw = read('sw.js');
    assert.match(sw, /const SW_VERSION = 'v70'/);
    assert.match(sw, /'\.\/js\/collab-import\.js'/);

    const importLines = read('js/collab-import.js').split('\n').length;
    assert.ok(importLines <= 400, `js/collab-import.js must be <= 400 lines (got ${importLines})`);

    const membersLines = read('js/collab-members.js').split('\n').length;
    assert.ok(membersLines <= 400, `js/collab-members.js must be <= 400 lines (got ${membersLines})`);
});

test('Fixture with 2 documents (1 normal, 1 oversize > 900KB): 1 document written, 1 id reported', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => { firestoreSets.push({ col, id, data }); }
            }),
            get: async () => ({
                forEach: () => {} // No existing documents
            })
        }),
        batch: () => {
            const batchOps = [];
            return {
                set: (docRef, data) => { batchOps.push({ docRef, data }); },
                commit: async () => {
                    batchOps.forEach(op => {
                        firestoreSets.push({ col: 'documents', data: op.data, id: op.data.id });
                    });
                }
            };
        }
    };

    const normalDoc = {
        id: 'doc-normal-1',
        title: 'Normal QA Document',
        category: 'testplan',
        content: 'Normal content under 900,000 bytes',
        createdAt: 1000,
        updatedAt: 1000
    };

    const oversizeDoc = {
        id: 'doc-oversize-2',
        title: 'Huge Oversize Document',
        category: 'testplan',
        content: 'Z'.repeat(950000), // > 900KB
        createdAt: 1000,
        updatedAt: 1000
    };

    const ctx = createCollabImportContext();
    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    // Store in localStorage default workspace
    ctx.localStorage.setItem('docvault_docs', JSON.stringify([normalDoc, oversizeDoc]));

    const result = await ctx.CollabImport.importLocalVault();

    assert.equal(result.imported, 1, 'Exactly 1 normal document must be imported');
    assert.equal(result.skipped, 1, 'Exactly 1 oversize document must be skipped');
    assert.deepEqual([...result.skippedIds], ['doc-oversize-2'], 'Skipped id must be doc-oversize-2');

    const savedDocIds = firestoreSets.filter(s => s.col === 'documents').map(s => s.id);
    assert.deepEqual([...savedDocIds], ['doc-normal-1'], 'Only normal document must be written to Firestore');

    // Verify toast warned about skipped oversize document
    assert.ok(
        ctx._toasts.some(t => t.type === 'warning' && t.msg.includes('doc-oversize-2')),
        'Must display warning toast mentioning skipped id'
    );

    // Verify completion marker set and localStorage preserved
    assert.ok(ctx.localStorage.getItem('docvault_collab_imported_at'), 'Must set docvault_collab_imported_at');
    assert.ok(ctx.localStorage.getItem('docvault_docs'), 'Must NOT delete docvault_docs from localStorage');
});

test('Owner-only: non-owner (editor/viewer) is rejected with error toast and no documents imported', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({ set: async (data) => firestoreSets.push({ col, id, data }) }),
            get: async () => ({ forEach: () => {} })
        })
    };

    const ctx = createCollabImportContext({
        CollabBootstrap: {
            getCurrentMember: () => ({ uid: 'editor-uid', role: 'editor' })
        }
    });
    ctx.CollabImport.setDb(mockDb);

    ctx.localStorage.setItem('docvault_docs', JSON.stringify([{ id: 'doc-1', title: 'Test' }]));

    const result = await ctx.CollabImport.importLocalVault();

    assert.equal(result, null, 'Non-owner must return null');
    assert.equal(firestoreSets.length, 0, 'No Firestore writes for non-owner');
    assert.ok(ctx._toasts.some(t => t.type === 'error' && t.msg.includes('owner')), 'Toast must state only owner can import');
});

test('Encrypted vault: prompts for master password, decrypts, and preserves credential fields', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({ set: async (data) => firestoreSets.push({ col, id, data }) }),
            get: async () => ({ forEach: () => {} })
        }),
        batch: () => ({
            set: (ref, data) => { firestoreSets.push({ col: 'documents', id: data.id, data }); },
            commit: async () => {}
        })
    };

    const rawEncrypted = 'ENC:v2:mockEncryptedPayload';
    const plainDocs = [
        { id: 'doc-enc-1', title: 'Secret Doc', category: 'general', content: 'Secret Content' },
        { id: 'doc-cred-2', title: 'DB Credentials', category: 'credential', username: 'admin', password: 'ENC:v2:mockPassword' }
    ];

    let decryptCalls = 0;
    const mockVault = {
        isEncrypted: (val) => typeof val === 'string' && val.startsWith('ENC:'),
        decrypt: async (ciphertext, pwd) => {
            decryptCalls++;
            if (pwd !== 'correct-password') throw new Error('Bad password');
            if (ciphertext === rawEncrypted) return plainDocs;
            if (ciphertext === 'ENC:v2:mockPassword') return 'decrypted-db-password';
            return ciphertext;
        }
    };

    const ctx = createCollabImportContext({ Vault: mockVault });
    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    ctx.localStorage.setItem('docvault_docs', rawEncrypted);

    // 1. Wrong password fails
    await assert.rejects(
        async () => { await ctx.CollabImport.importLocalVault({ password: 'wrong-password' }); },
        /Bad password/
    );

    // 2. Correct password decrypts and imports
    const res = await ctx.CollabImport.importLocalVault({ password: 'correct-password' });
    assert.equal(res.imported, 2);
    assert.equal(firestoreSets.length, 2);

    const credDoc = firestoreSets.find(s => s.id === 'doc-cred-2');
    assert.ok(credDoc);
    assert.equal(credDoc.data.password, 'decrypted-db-password', 'Credential password must be decrypted before import');
});

test('Existing documents on Firestore are skipped and not overwritten', async () => {
    const firestoreSets = [];
    const existingDocIds = new Set(['doc-already-exists']);

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({ set: async (data) => firestoreSets.push({ col, id, data }) }),
            get: async () => ({
                forEach: (fn) => {
                    for (const id of existingDocIds) fn({ id });
                }
            })
        }),
        batch: () => ({
            set: (ref, data) => { firestoreSets.push({ col: 'documents', id: data.id, data }); },
            commit: async () => {}
        })
    };

    const ctx = createCollabImportContext();
    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    ctx.localStorage.setItem('docvault_docs', JSON.stringify([
        { id: 'doc-already-exists', title: 'Old version that must not overwrite' },
        { id: 'doc-fresh-new', title: 'Brand new document' }
    ]));

    const res = await ctx.CollabImport.importLocalVault();

    assert.equal(res.imported, 1);
    assert.equal(firestoreSets.length, 1);
    assert.equal(firestoreSets[0].id, 'doc-fresh-new');
});

test('Inline data:image/... URLs go through Phase 9 conversion to images/{imageId}', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => firestoreSets.push({ col, id, data })
            }),
            get: async () => ({ forEach: () => {} })
        }),
        batch: () => ({
            set: (ref, data) => { firestoreSets.push({ col: 'documents', id: data.id, data }); },
            commit: async () => {}
        })
    };

    const rawB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const inlineDataUrl = `data:image/png;base64,${rawB64}`;

    const docWithImage = {
        id: 'doc-img-test',
        title: 'Doc with Inline Image',
        category: 'testcase',
        content: `Screenshot: ![Alt](${inlineDataUrl})`
    };

    const ctx = createCollabImportContext({
        CollabImages: {
            _cache: new Map(),
            getImageCache() { return this._cache; }
        }
    });
    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    ctx.localStorage.setItem('docvault_docs', JSON.stringify([docWithImage]));

    const res = await ctx.CollabImport.importLocalVault();
    assert.equal(res.imported, 1);

    const imageWrites = firestoreSets.filter(s => s.col === 'images');
    assert.equal(imageWrites.length, 1, 'Image must be written to images collection');
    assert.equal(imageWrites[0].data.contentType, 'image/png');
    assert.equal(imageWrites[0].data.data, rawB64);
    assert.equal(imageWrites[0].data.createdBy, 'owner-uid');

    const savedDoc = firestoreSets.find(s => s.col === 'documents' && s.id === 'doc-img-test');
    assert.ok(savedDoc);
    assert.ok(savedDoc.data.content.includes(`![Alt](docvault-img:${imageWrites[0].id})`), 'Doc must use docvault-img token');
    assert.ok(!savedDoc.data.content.includes(inlineDataUrl), 'Doc must not contain inline base64');
});

test('counters/bugs: sets next = maxBugNumber when counter does not exist', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => firestoreSets.push({ col, id, data }),
                get: async () => ({ exists: false }) // Counter does not exist yet
            }),
            get: async () => ({ forEach: () => {} })
        }),
        batch: () => ({
            set: (ref, data) => { firestoreSets.push({ col: 'documents', id: data.id, data }); },
            commit: async () => {}
        })
    };

    const ctx = createCollabImportContext();
    ctx.CollabImport.setDb(mockDb);
    ctx.CollabImport.setUser({ uid: 'owner-uid' });

    ctx.localStorage.setItem('docvault_docs', JSON.stringify([
        { id: 'bug-1', category: 'bug', bugNumber: 5 },
        { id: 'bug-2', category: 'bug', bugNumber: 12 },
        { id: 'bug-3', category: 'bug', bugNumber: 3 }
    ]));

    await ctx.CollabImport.importLocalVault();

    const counterWrite = firestoreSets.find(s => s.col === 'counters');
    assert.ok(counterWrite, 'counters/bugs must be set');
    assert.equal(counterWrite.id, 'bugs');
    assert.equal(counterWrite.data.next, 12, 'next must equal exactly maxBugNumber');
});

test('Team tab button: hasUnimportedLocalVault returns true only when unimported default docs exist', () => {
    const ctx = createCollabImportContext();
    const membersCode = read('js/collab-members.js');
    vm.runInContext(membersCode, ctx);

    // 1. Empty localStorage -> false
    ctx.localStorage.clear();
    assert.equal(ctx.CollabMembers.hasUnimportedLocalVault(), false);

    // 2. Has docs and not imported -> true
    ctx.localStorage.setItem('docvault_docs', JSON.stringify([{ id: 'd1' }]));
    assert.equal(ctx.CollabMembers.hasUnimportedLocalVault(), true);

    // 3. Marked imported -> false
    ctx.localStorage.setItem('docvault_collab_imported_at', String(Date.now()));
    assert.equal(ctx.CollabMembers.hasUnimportedLocalVault(), false);

    // 4. Other workspaces ignored
    ctx.localStorage.removeItem('docvault_collab_imported_at');
    ctx.localStorage.removeItem('docvault_docs');
    ctx.localStorage.setItem('ws_other__docvault_docs', JSON.stringify([{ id: 'd2' }]));
    assert.equal(ctx.CollabMembers.hasUnimportedLocalVault(), false);
});
