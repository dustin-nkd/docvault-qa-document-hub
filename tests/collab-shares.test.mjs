import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function uint8ToBase64(bytes) {
    return Buffer.from(bytes).toString('base64');
}

function base64ToUint8(str) {
    return new Uint8Array(Buffer.from(str, 'base64'));
}

function createCollabSharesContext(customGlobals = {}) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        crypto: globalThis.crypto,
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        uint8ToBase64,
        COLLAB_MODE: true,
        GUEST_MODE: false,
        toast: (msg, type) => {
            sandbox._toasts.push({ msg, type });
        },
        _toasts: [],
        showModal: (html) => {
            sandbox._modals.push(html);
        },
        _modals: [],
        closeModal: () => {
            sandbox._closedModal = true;
        },
        _closedModal: false,
        escHtml: (str) => String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
        documents: [],
        state: { view: 'dashboard', editingDoc: null, sharedView: false },
        render: () => { sandbox._renderCalled = true; },
        _renderCalled: false,
        location: { origin: 'https://docvault-qa-team.web.app', pathname: '/' },
        localStorage: {
            _data: {},
            getItem(k) { return this._data[k] ?? null; },
            setItem(k, v) { this._data[k] = String(v); },
            removeItem(k) { delete this._data[k]; },
            clear() { this._data = {}; }
        },
        CollabBootstrap: {
            getCurrentMember: () => ({ role: 'editor', uid: 'editor-uid-1' })
        },
        CollabImages: {
            inlineCollabImagesForShare: async (content) => content
        },
        ...customGlobals
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;

    const actionsSharingCode = read('js/actions-sharing.js');
    const collabSharesCode = read('js/collab-shares.js');

    vm.createContext(sandbox);
    vm.runInContext(actionsSharingCode, sandbox);
    vm.runInContext(collabSharesCode, sandbox);
    return sandbox;
}

test('Shell contracts: events.js loads collab-shares, sw.js caches it in v68, and budgets hold', () => {
    const events = read('js/events.js');
    assert.match(events, /'collab-shares'/);
    assert.ok(events.indexOf("'collab-shares'") < events.indexOf('CollabBootstrap?.start'));

    const sw = read('sw.js');
    assert.match(sw, /const SW_VERSION = 'v68'/);
    assert.match(sw, /'\.\/js\/collab-shares\.js'/);

    const sharesLines = read('js/collab-shares.js').split('\n').length;
    assert.ok(sharesLines <= 400, `js/collab-shares.js must be <= 400 lines (got ${sharesLines})`);

    const actionsSharingLines = read('js/actions-sharing.js').split('\n').length;
    assert.ok(actionsSharingLines <= 420, `js/actions-sharing.js must be <= 420 lines (got ${actionsSharingLines})`);

    const actionsSharing = read('js/actions-sharing.js');
    assert.match(actionsSharing, /Cache-Control: max-age=600/, 'actions-sharing.js must keep the 10-minute cache explanation comment');
    assert.match(actionsSharing, /_encryptSharePayload is not defined/);

    const html = read('index.html');
    const refs = [...html.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/g)]
        .map(match => match[1])
        .filter(value => !/^(?:[a-z]+:|\/\/|data:)/i.test(value));
    const bytes = [...new Set(refs)].reduce((total, relativePath) => {
        const absolutePath = path.join(rootDir, relativePath);
        return total + (fs.existsSync(absolutePath) ? fs.statSync(absolutePath).size : 0);
    }, 0);
    assert.ok(bytes <= 1_070_000, `Direct startup assets must be <= 1,070,000 bytes (got ${bytes})`);
});

test('Firestore shares payload contains exact fields and NEVER contains key, password, PAT, or token', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => {
            assert.equal(col, 'shares');
            return {
                doc: (id) => ({
                    set: async (data) => {
                        firestoreSets.push({ id, data });
                    }
                })
            };
        }
    };

    const ctx = createCollabSharesContext({
        documents: [
            { id: 'doc-101', title: 'Test Document', category: 'general', content: 'Secret Content', tags: ['qa'], updatedAt: 1000 }
        ]
    });
    ctx.CollabShares.setCustomDb(mockDb);
    ctx.CollabShares.setCustomUser({ uid: 'test-editor-uid' });

    await ctx.shareDoc('doc-101');

    assert.equal(firestoreSets.length, 1, 'Exactly one Firestore share document was created');
    const { id, data } = firestoreSets[0];
    assert.ok(id.startsWith('sh_'), 'Share ID has prefix sh_');

    assert.equal(data.docId, 'doc-101');
    assert.ok(typeof data.ciphertext === 'string' && data.ciphertext.length > 20, 'Ciphertext is non-empty base64 string');
    assert.equal(data.createdBy, 'test-editor-uid');
    assert.ok(typeof data.createdAt === 'number', 'createdAt is numeric timestamp');
    assert.ok(typeof data.updatedAt === 'number', 'updatedAt is numeric timestamp');

    // Strict security assertions: NO sensitive credentials in Firestore payload
    assert.equal('key' in data, false, 'Payload must not contain "key"');
    assert.equal('keyBase64' in data, false, 'Payload must not contain "keyBase64"');
    assert.equal('password' in data, false, 'Payload must not contain "password"');
    assert.equal('PAT' in data, false, 'Payload must not contain "PAT"');
    assert.equal('token' in data, false, 'Payload must not contain "token"');

    const expectedKeys = ['docId', 'ciphertext', 'createdBy', 'createdAt', 'updatedAt'];
    assert.deepEqual(Object.keys(data).sort(), expectedKeys.sort(), 'Payload contains only the exact required schema fields');

    // Verify modal contains share URL with key in fragment
    assert.equal(ctx._modals.length, 2, 'Showed loading spinner then Link Ready modal');
    const readyModal = ctx._modals[1];
    assert.match(readyModal, /Link Ready!/);
    assert.match(readyModal, /#key=/);
});

test('Viewer role cannot share or revoke: displays "You have view access" toast and aborts without Firestore writes', async () => {
    let firestoreWritten = false;
    let firestoreDeleted = false;
    const mockDb = {
        collection: (col) => ({
            doc: () => ({
                set: async () => { firestoreWritten = true; },
                delete: async () => { firestoreDeleted = true; }
            })
        })
    };

    const ctx = createCollabSharesContext({
        CollabBootstrap: {
            getCurrentMember: () => ({ role: 'viewer', uid: 'viewer-uid-1' })
        },
        documents: [
            { id: 'doc-v1', title: 'Viewer Doc', category: 'general', content: 'Doc content' }
        ]
    });
    ctx.CollabShares.setCustomDb(mockDb);

    // 1. shareDoc as viewer
    await ctx.shareDoc('doc-v1');
    assert.equal(firestoreWritten, false, 'Viewer cannot write share to Firestore');
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'), 'Viewer gets "You have view access" toast');

    // 2. revokeShare as viewer
    ctx._toasts.length = 0;
    await ctx.revokeShare('sh_123');
    assert.equal(firestoreDeleted, false, 'Viewer cannot delete share from Firestore');
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'), 'Viewer gets "You have view access" toast on revoke');

    // 3. revokeSharesForDocs as viewer
    ctx._toasts.length = 0;
    const res = await ctx.revokeSharesForDocs(['doc-v1']);
    assert.equal(res.revoked, 0);
    assert.equal(res.failed, 0);
    assert.equal(firestoreDeleted, false);
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'));
});

test('COLLAB_MODE shareDoc and revokeShare do not call api.github.com or GitHubSync', async () => {
    let githubCalled = false;
    const fakeFetch = async (url) => {
        if (String(url).includes('github.com')) {
            githubCalled = true;
            throw new Error('api.github.com should never be called in COLLAB_MODE');
        }
        return { ok: true, json: async () => ({}) };
    };

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async () => {},
                delete: async () => {}
            })
        })
    };

    const ctx = createCollabSharesContext({
        fetch: fakeFetch,
        GitHubSync: {
            getSettings: async () => {
                githubCalled = true;
                return { token: 'pat-123', owner: 'owner', repo: 'repo' };
            }
        },
        documents: [
            { id: 'doc-ng', title: 'No GitHub Doc', category: 'general', content: 'Content' }
        ]
    });
    ctx.CollabShares.setCustomDb(mockDb);
    ctx.CollabShares.setCustomUser({ uid: 'editor-uid' });

    await ctx.shareDoc('doc-ng');
    assert.equal(githubCalled, false, 'shareDoc in COLLAB_MODE never called GitHub');

    await ctx.revokeShare('sh_xyz');
    assert.equal(githubCalled, false, 'revokeShare in COLLAB_MODE never called GitHub');
});

test('Inlining images: embeds data URLs before encryption and aborts share if docvault-img tokens remain', async () => {
    let savedCiphertext = null;
    const mockDb = {
        collection: (col) => ({
            doc: () => ({
                set: async (data) => {
                    savedCiphertext = data.ciphertext;
                }
            })
        })
    };

    // Case A: Image successfully resolved to data URL
    const ctx = createCollabSharesContext({
        documents: [
            { id: 'doc-img', title: 'Image Doc', category: 'general', content: 'Look at this: docvault-img:img-ok' }
        ],
        CollabImages: {
            inlineCollabImagesForShare: async (content) => content.replace('docvault-img:img-ok', 'data:image/png;base64,iVBORw0KGgo=')
        }
    });
    ctx.CollabShares.setCustomDb(mockDb);
    ctx.CollabShares.setCustomUser({ uid: 'editor-uid' });

    await ctx.shareDoc('doc-img');
    assert.ok(savedCiphertext, 'Share saved when images resolved');

    // Decrypt ciphertext to verify it contains the inlined data URL
    const localShares = ctx._getShares();
    assert.equal(localShares.length, 1);
    const keyBytes = base64ToUint8(localShares[0].keyBase64);
    const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']);
    const packed = base64ToUint8(savedCiphertext);
    const iv = packed.slice(0, 12);
    const cipher = packed.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, rawKey, cipher);
    const decryptedPayload = JSON.parse(new TextDecoder().decode(plain));
    assert.match(decryptedPayload.content, /data:image\/png;base64/);
    assert.doesNotMatch(decryptedPayload.content, /docvault-img:/);

    // Case B: Image unresolved (token remains) -> aborts share and shows English toast
    savedCiphertext = null;
    ctx._toasts.length = 0;
    ctx.documents[0].content = 'Unresolved: docvault-img:img-missing';
    ctx.CollabImages.inlineCollabImagesForShare = async (c) => c; // Fails to resolve

    await ctx.shareDoc('doc-img');
    assert.equal(savedCiphertext, null, 'Must NOT write share to Firestore when images remain unresolved');
    assert.ok(ctx._toasts.some(t => t.msg.includes('unresolved images') && t.type === 'error'), 'Displays English error toast');
});

test('Document edit updates share snapshot via syncActiveShares() in Firestore without GitHub calls', async () => {
    let updatedData = null;
    let githubCalled = false;
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                update: async (data) => {
                    updatedData = { id, data };
                }
            })
        })
    };

    const ctx = createCollabSharesContext({
        fetch: async () => { githubCalled = true; },
        GitHubSync: { getSettings: async () => { githubCalled = true; } },
        documents: [
            { id: 'doc-sync', title: 'Synced Doc', category: 'general', content: 'Updated Content V2', updatedAt: 2000 }
        ]
    });
    ctx.CollabShares.setCustomDb(mockDb);

    // Simulate an existing share in local registry
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const keyBase64 = uint8ToBase64(keyBytes);
    ctx._recordShare({
        shareId: 'sh_sync_1',
        docId: 'doc-sync',
        title: 'Synced Doc',
        category: 'general',
        createdAt: 1000,
        keyBase64,
        docUpdatedAt: 1000 // Stale! doc.updatedAt is 2000
    });

    await ctx.syncActiveShares();

    assert.equal(githubCalled, false, 'No GitHub calls during syncActiveShares');
    assert.ok(updatedData, 'Firestore share document was updated');
    assert.equal(updatedData.id, 'sh_sync_1');
    assert.ok(typeof updatedData.data.ciphertext === 'string');
    assert.ok(typeof updatedData.data.updatedAt === 'number');

    // Local registry updated
    const sharesAfter = ctx._getShares();
    assert.equal(sharesAfter[0].docUpdatedAt, 2000);
});

test('loadSharedDoc: loads and decrypts unauthenticated without signInWithRedirect or CollabBootstrap.start', async () => {
    let redirectCalled = false;
    let bootstrapStartCalled = false;

    // Prepare encrypted payload
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const keyBase64 = uint8ToBase64(keyBytes);

    const docPayload = {
        title: 'Shared Confidential Doc',
        category: 'qa',
        content: '# Top Secret Findings',
        tags: ['audit'],
        createdAt: 1500,
        status: 'published'
    };

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const rawKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
    const plain = new TextEncoder().encode(JSON.stringify(docPayload));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, rawKey, plain);
    const packed = new Uint8Array(12 + cipher.byteLength);
    packed.set(iv);
    packed.set(new Uint8Array(cipher), 12);
    const encContent = uint8ToBase64(packed);

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({
                        docId: 'doc-orig-1',
                        ciphertext: encContent,
                        createdBy: 'owner-uid',
                        createdAt: 1500,
                        updatedAt: 1600
                    })
                })
            })
        })
    };

    const ctx = createCollabSharesContext({
        CollabAuth: {
            signInWithRedirect: () => { redirectCalled = true; }
        },
        CollabBootstrap: {
            start: () => { bootstrapStartCalled = true; }
        },
        document: {
            getElementById: () => null,
            querySelector: () => null,
            body: { innerHTML: '' }
        }
    });
    ctx.CollabShares.setCustomDb(mockDb);

    await ctx.CollabShares.loadSharedDoc('sh_shared_123', keyBase64);

    assert.equal(redirectCalled, false, 'Must NOT trigger redirect login on share view');
    assert.equal(bootstrapStartCalled, false, 'Must NOT start CollabBootstrap team sequence on share view');

    assert.equal(ctx.documents.length, 1);
    assert.equal(ctx.documents[0].id, 'sh_shared_123');
    assert.equal(ctx.documents[0].title, 'Shared Confidential Doc');
    assert.equal(ctx.documents[0].content, '# Top Secret Findings');
    assert.equal(ctx.state.view, 'viewer');
    assert.equal(ctx.state.sharedView, true);
    assert.equal(ctx._renderCalled, true);
});

test('loadSharedDoc: displays "Link Invalid or Expired" on missing doc or incorrect key', async () => {
    let htmlRendered = '';
    const ctx = createCollabSharesContext({
        document: {
            getElementById: () => null,
            querySelector: () => null,
            body: {
                set innerHTML(val) { htmlRendered = val; },
                get innerHTML() { return htmlRendered; }
            }
        }
    });

    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({ exists: false })
            })
        })
    };
    ctx.CollabShares.setCustomDb(mockDb);

    await ctx.CollabShares.loadSharedDoc('sh_expired', 'invalidKeyBase64==');

    assert.match(htmlRendered, /Link Invalid or Expired/);
    assert.match(htmlRendered, /Go to DocVault/);
});

test('Legacy mode (COLLAB_MODE = false): uses GitHub path for shareDoc and loadSharedDoc', async () => {
    let githubPutCalled = false;
    let githubGetCalled = false;

    const fakeFetch = async (url, opts) => {
        if (opts?.method === 'PUT') {
            githubPutCalled = true;
            return { ok: true, json: async () => ({ content: { sha: 'sha-blob-1' } }) };
        }
        githubGetCalled = true;
        const fakeEnc = Buffer.from('dummy').toString('base64');
        return { ok: true, json: async () => ({ content: fakeEnc }) };
    };

    const ctx = createCollabSharesContext({
        COLLAB_MODE: false,
        fetch: fakeFetch,
        GitHubSync: {
            DEFAULTS: { owner: 'gh-owner', repo: 'gh-repo', branch: 'main' },
            getSettings: async () => ({ token: 'gh-token-1', owner: 'gh-owner', repo: 'gh-repo', branch: 'main' })
        },
        documents: [
            { id: 'doc-legacy', title: 'Legacy Doc', category: 'general', content: 'Legacy content' }
        ]
    });

    await ctx.shareDoc('doc-legacy');
    assert.equal(githubPutCalled, true, 'Legacy mode calls GitHub PUT');
});

test('COLLAB_MODE: state.js persist() invokes CollabStore.persist first, then syncActiveShares fire-and-forget; aborts sync if persist throws', async () => {
    const callOrder = [];

    const ctx = {
        console,
        window: {
            COLLAB_MODE: true,
            CollabStore: {
                persist: async (docs) => {
                    callOrder.push('CollabStore.persist');
                    if (docs[0]?.id === 'error-doc') {
                        throw new Error('Firestore write simulated failure');
                    }
                }
            }
        },
        DocStorage: {
            save: async () => { callOrder.push('DocStorage.save'); }
        },
        syncActiveShares: async () => {
            callOrder.push('syncActiveShares');
            if (ctx.documents[0]?.id === 'sync-error-doc') {
                throw new Error('Sync share failure');
            }
        },
        documents: [{ id: 'doc-ok', title: 'Doc OK' }],
        GUEST_MODE: false
    };
    ctx.window.window = ctx.window;

    vm.createContext(ctx);
    vm.runInContext(read('js/state.js'), ctx);

    vm.runInContext("documents = [{ id: 'doc-ok', title: 'Doc OK' }];", ctx);

    // 1. Success case: CollabStore.persist runs first, then syncActiveShares fire-and-forget
    await ctx.persist();
    assert.deepEqual(callOrder, ['CollabStore.persist', 'syncActiveShares'], 'Calls CollabStore.persist first, then syncActiveShares');

    // 2. Failure case: CollabStore.persist throws -> error bubbles up and syncActiveShares is NOT called
    callOrder.length = 0;
    vm.runInContext("documents = [{ id: 'error-doc', title: 'Error Doc' }];", ctx);
    await assert.rejects(async () => {
        await ctx.persist();
    }, /Firestore write simulated failure/);
    assert.deepEqual(callOrder, ['CollabStore.persist'], 'syncActiveShares must not be called when CollabStore.persist fails');

    // 3. Fire-and-forget case: syncActiveShares error does NOT fail persist()
    callOrder.length = 0;
    vm.runInContext("documents = [{ id: 'sync-error-doc', title: 'Sync Error Doc' }];", ctx);
    await assert.doesNotReject(async () => {
        await ctx.persist();
    });
    assert.deepEqual(callOrder, ['CollabStore.persist', 'syncActiveShares'], 'syncActiveShares failure does not break persist()');
});

