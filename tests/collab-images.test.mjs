import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(rootDir, rel), 'utf8');

function createCollabImagesContext(customGlobals = {}) {
    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        TextEncoder,
        TextDecoder,
        COLLAB_MODE: true,
        GUEST_MODE: false,
        toast: (msg, type) => {
            sandbox._toasts.push({ msg, type });
        },
        _toasts: [],
        documents: [],
        state: { editingDoc: null },
        persist: async () => { sandbox._persistCalled = true; },
        render: () => { sandbox._renderCalled = true; },
        _persistCalled: false,
        _renderCalled: false,
        ...customGlobals
    };

    const scriptCode = read('js/collab-images.js');
    vm.createContext(sandbox);
    vm.runInContext(scriptCode, sandbox);
    return sandbox;
}

test('Shell contracts: events.js loads collab-images, sw.js caches it in v66, and line budget is <= 400', () => {
    const events = read('js/events.js');
    assert.match(events, /'collab-images'/);
    assert.ok(events.indexOf("'collab-images'") < events.indexOf('CollabBootstrap?.start'));

    const sw = read('sw.js');
    assert.match(sw, /const SW_VERSION = 'v66'/);
    assert.match(sw, /'\.\/js\/collab-images\.js'/);

    const imagesLines = read('js/collab-images.js').split('\n').length;
    assert.ok(imagesLines <= 400, `js/collab-images.js must be <= 400 lines (got ${imagesLines})`);

    const storeLines = read('js/collab-store.js').split('\n').length;
    assert.ok(storeLines <= 400, `js/collab-store.js must be <= 400 lines (got ${storeLines})`);

    const importsLines = read('js/actions-imports.js').split('\n').length;
    assert.ok(importsLines <= 650, `js/actions-imports.js must be <= 650 lines (got ${importsLines})`);
});

test('uploadImage: rejects images whose compressed size > 700,000 bytes with English toast and no Firestore write', async () => {
    const firestoreWrites = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => {
                    firestoreWrites.push({ col, id, data });
                }
            })
        })
    };

    const ctx = createCollabImagesContext({
        CollabBootstrap: { getCurrentMember: () => ({ uid: 'editor-1', role: 'editor' }) }
    });
    ctx.CollabImages.setDb(mockDb);
    ctx.CollabImages.setUser({ uid: 'editor-1' });

    // Mock compressImage returning ~750,000 bytes of base64
    // 1,000,000 base64 chars = ~750,000 bytes
    const hugeB64 = 'A'.repeat(1000000);
    ctx.compressImage = async () => `data:image/jpeg;base64,${hugeB64}`;

    let callbackCalled = false;
    const result = await ctx.CollabImages.uploadImage({ name: 'huge.jpg' }, (token) => {
        callbackCalled = true;
    });

    assert.equal(result, null, 'uploadImage must return null on oversize image');
    assert.equal(callbackCalled, false, 'Callback must NOT be called on oversize image (no base64 inserted)');
    assert.equal(firestoreWrites.length, 0, 'No Firestore document must be created for oversize image');
    assert.ok(
        ctx._toasts.some(t => t.msg.includes('700,000') && t.type === 'error'),
        'Must display error toast mentioning 700,000 bytes limit'
    );
});

test('uploadImage: saves valid image <= 700,000 bytes to images/{imageId} with exact schema and returns docvault-img token', async () => {
    const firestoreWrites = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => {
                    firestoreWrites.push({ col, id, data });
                }
            })
        })
    };

    const ctx = createCollabImagesContext({
        CollabBootstrap: { getCurrentMember: () => ({ uid: 'editor-1', role: 'editor' }) }
    });
    ctx.CollabImages.setDb(mockDb);
    ctx.CollabImages.setUser({ uid: 'editor-1' });

    // 40,000 base64 chars = 30,000 bytes
    const smallB64 = 'B'.repeat(40000);
    ctx.compressImage = async () => `data:image/png;base64,${smallB64}`;

    let callbackToken = null;
    let callbackAlt = null;
    const result = await ctx.CollabImages.uploadImage({ name: 'screenshot.png' }, (token, alt) => {
        callbackToken = token;
        callbackAlt = alt;
    });

    assert.ok(result, 'uploadImage should succeed for valid image');
    assert.match(result.token, /^docvault-img:img_/);
    assert.equal(callbackToken, result.token);
    assert.equal(callbackAlt, 'screenshot.png');

    assert.equal(firestoreWrites.length, 1);
    const write = firestoreWrites[0];
    assert.equal(write.col, 'images');
    assert.equal(write.id, result.imageId);
    assert.equal(write.data.contentType, 'image/png');
    assert.equal(write.data.data, smallB64, 'data must be raw base64 without prefix');
    assert.equal(write.data.byteSize, 30000);
    assert.ok(write.data.byteSize <= 700000);
    assert.equal(write.data.createdBy, 'editor-1');
    assert.ok(typeof write.data.createdAt === 'string');

    // Verify cached in memory
    const cached = ctx.CollabImages.getImageCache().get(result.imageId);
    assert.equal(cached, `data:image/png;base64,${smallB64}`);
});

test('Viewer role cannot upload or compact images', async () => {
    const ctx = createCollabImagesContext({
        CollabBootstrap: { getCurrentMember: () => ({ uid: 'viewer-1', role: 'viewer' }) }
    });

    ctx.compressImage = async () => 'data:image/jpeg;base64,AAAA';
    let cbCalled = false;
    const uploadRes = await ctx.CollabImages.uploadImage({ name: 'test.jpg' }, () => { cbCalled = true; });

    assert.equal(uploadRes, null);
    assert.equal(cbCalled, false);
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'));

    ctx._toasts = [];
    ctx.documents = [{ id: 'doc1', content: '![img](data:image/jpeg;base64,AAAA)' }];
    await ctx.CollabImages.compactImages({ skipModal: true });
    assert.ok(ctx._toasts.some(t => t.msg === 'You have view access' && t.type === 'error'));
});

test('uploadImageToCloud in actions-imports.js delegates to CollabImages and calls neither api.github.com nor Storage', async () => {
    let githubApiCalled = false;
    let storageCalled = false;

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
        CollabBootstrap: { getCurrentMember: () => ({ uid: 'ed-1', role: 'editor' }) },
        CollabImages: {
            uploadImage: async (blob, cb) => {
                sandbox._collabUploadCalled = true;
                cb('docvault-img:mock_123', blob.name);
            }
        },
        GitHubSync: {
            getSettings: async () => ({ token: 'secret-token', owner: 'org', repo: 'repo' })
        },
        fetch: async (url) => {
            if (url.includes('api.github.com')) githubApiCalled = true;
            if (url.includes('storage.googleapis.com')) storageCalled = true;
            return { ok: true, json: async () => ({}) };
        },
        _collabUploadCalled: false,
        localStorage: {
            getItem: () => '1'
        }
    };
    sandbox.window = sandbox;

    const importsCode = read('js/actions-imports.js');
    vm.createContext(sandbox);
    vm.runInContext(importsCode, sandbox);

    let resultingUrl = null;
    await sandbox.uploadImageToCloud({ name: 'diagram.png' }, (url) => {
        resultingUrl = url;
    });

    assert.equal(sandbox._collabUploadCalled, true, 'CollabImages.uploadImage must be called');
    assert.equal(resultingUrl, 'docvault-img:mock_123', 'Must receive token docvault-img:mock_123');
    assert.equal(githubApiCalled, false, 'api.github.com must NOT be called in COLLAB_MODE');
    assert.equal(storageCalled, false, 'Firebase Storage must NOT be called in COLLAB_MODE');
});

test('CollabStore.persist: blocks document exceeding 900,000 bytes with toast and saves normal document', async () => {
    const firestoreSets = [];
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => {
                    firestoreSets.push({ col, id, data });
                },
                get: async () => ({ exists: false })
            })
        })
    };

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
        normalizeDocTags: () => {}
    };

    const storeCode = read('js/collab-store.js');
    vm.createContext(sandbox);
    vm.runInContext(storeCode, sandbox);

    sandbox.CollabStore.setDb(mockDb);
    sandbox.CollabStore.setUser({ uid: 'editor-uid' });

    // Document 1: normal (under 900KB)
    const normalDoc = {
        id: 'doc-normal',
        title: 'Normal Document',
        category: 'testplan',
        content: 'Short content',
        createdAt: 1000,
        updatedAt: 1000
    };

    // Document 2: oversize (over 900KB)
    const oversizeDoc = {
        id: 'doc-oversize',
        title: 'Huge Document',
        category: 'testplan',
        content: 'X'.repeat(950000),
        createdAt: 1000,
        updatedAt: 1000
    };

    await sandbox.CollabStore.persist([normalDoc, oversizeDoc]);

    // Normal doc should be persisted
    const savedIds = firestoreSets.map(s => s.id);
    assert.ok(savedIds.includes('doc-normal'), 'Normal document must be persisted');
    assert.ok(!savedIds.includes('doc-oversize'), 'Oversize document must NOT be persisted');

    // Toast error should mention 900,000 bytes
    assert.ok(
        sandbox._toasts.some(t => t.msg.includes('900,000') && t.type === 'error'),
        'Toast error must be shown for document exceeding 900,000 bytes'
    );
});

test('compactImages: converts inline data URLs to images/{imageId} tokens without GitHub API calls', async () => {
    const firestoreImages = new Map();
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                set: async (data) => {
                    firestoreImages.set(id, data);
                }
            })
        })
    };

    let githubCalled = false;
    const rawB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const inlineDataUrl = `data:image/png;base64,${rawB64}`;

    const doc = {
        id: 'doc-with-img',
        title: 'Doc with Inline Image',
        category: 'testcase',
        content: `Here is a screenshot: ![Test](${inlineDataUrl}) and more text.`,
        updatedAt: 1000
    };

    const ctx = createCollabImagesContext({
        documents: [doc],
        CollabBootstrap: { getCurrentMember: () => ({ uid: 'ed-1', role: 'editor' }) },
        fetch: async (url) => {
            if (url.includes('api.github.com')) githubCalled = true;
            return { ok: true };
        }
    });

    ctx.CollabImages.setDb(mockDb);
    ctx.CollabImages.setUser({ uid: 'ed-1' });

    const result = await ctx.CollabImages.compactImages({ skipModal: true });

    assert.equal(result.uploaded, 1, 'Should have compacted 1 image');
    assert.equal(result.failed, 0, 'No failed images');
    assert.equal(firestoreImages.size, 1, 'Firestore images collection should receive 1 image');
    assert.equal(githubCalled, false, 'api.github.com must NOT be called');

    const [imgId, imgData] = Array.from(firestoreImages.entries())[0];
    assert.equal(imgData.contentType, 'image/png');
    assert.equal(imgData.data, rawB64);
    assert.equal(imgData.createdBy, 'ed-1');

    assert.ok(doc.content.includes(`![Test](docvault-img:${imgId})`), 'Doc content must contain docvault-img token');
    assert.ok(!doc.content.includes(inlineDataUrl), 'Doc content must no longer contain base64');
    assert.equal(ctx._persistCalled, true, 'persist() must be called to save document changes');
});

test('inlineCollabImagesForShare: replaces tokens with data URLs for share publishing', async () => {
    const rawB64 = 'ABCDEF123456';
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({ contentType: 'image/jpeg', data: rawB64 })
                })
            })
        })
    };

    const ctx = createCollabImagesContext();
    ctx.CollabImages.setDb(mockDb);

    const markdown = `# Architecture
![Diagram](docvault-img:img_diagram_1)
Some notes here.
![Chart](docvault-img:img_chart_2)
`;

    const resolved = await ctx.CollabImages.inlineCollabImagesForShare(markdown);

    assert.ok(!resolved.includes('docvault-img:img_diagram_1'), 'Token img_diagram_1 must be replaced');
    assert.ok(!resolved.includes('docvault-img:img_chart_2'), 'Token img_chart_2 must be replaced');
    assert.ok(resolved.includes(`![Diagram](data:image/jpeg;base64,${rawB64})`), 'Should contain data URL');
    assert.ok(resolved.includes(`![Chart](data:image/jpeg;base64,${rawB64})`), 'Should contain data URL');
});

test('DOM image resolution: resolveContainerImages updates img src from token to data URL', async () => {
    const rawB64 = 'PNGDATA123';
    const mockDb = {
        collection: (col) => ({
            doc: (id) => ({
                get: async () => ({
                    exists: true,
                    data: () => ({ contentType: 'image/png', data: rawB64 })
                })
            })
        })
    };

    const ctx = createCollabImagesContext();
    ctx.CollabImages.setDb(mockDb);

    // Mock DOM elements
    const mockImgs = [
        {
            _src: 'docvault-img:img_dom_1',
            getAttribute: function(attr) { return attr === 'src' ? this._src : null; },
            setAttribute: function(attr, val) { if (attr === 'src') this._src = val; }
        }
    ];

    const mockContainer = {
        querySelectorAll: (selector) => {
            if (selector.includes('docvault-img:')) return mockImgs;
            return [];
        }
    };

    ctx.CollabImages.resolveContainerImages(mockContainer);

    // Allow promise tick to resolve
    await new Promise(r => setTimeout(r, 10));

    assert.equal(mockImgs[0]._src, `data:image/png;base64,${rawB64}`);
});
