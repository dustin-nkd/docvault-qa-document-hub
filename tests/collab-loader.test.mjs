import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('index.html contains no references to vendor/firebase or static Firebase scripts', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /vendor\/firebase/, 'index.html must not reference vendor/firebase');
    assert.doesNotMatch(html, /firebase-app/, 'index.html must not contain static firebase-app reference');
    assert.doesNotMatch(html, /firebase-auth/, 'index.html must not contain static firebase-auth reference');
    assert.doesNotMatch(html, /firebase-firestore/, 'index.html must not contain static firebase-firestore reference');
    assert.doesNotMatch(html, /firebase\.js/, 'index.html must not contain static firebase bundle reference');
});

test('vendor/firebase contains only app, auth, and firestore compat scripts without Storage', () => {
    const vendorDir = path.join(root, 'vendor/firebase');
    assert.ok(fs.existsSync(vendorDir), 'vendor/firebase directory must exist');
    const files = fs.readdirSync(vendorDir).sort();

    assert.deepEqual(files, [
        'firebase-app-compat.js',
        'firebase-auth-compat.js',
        'firebase-firestore-compat.js'
    ], 'vendor/firebase must contain exactly the 3 compat bundles');

    for (const file of files) {
        assert.ok(!file.includes('storage'), 'Firebase Storage must not be vendored');
        const content = read(path.join('vendor/firebase', file));
        assert.ok(content.length > 10000, `${file} must be a valid non-empty bundle`);
    }
});

test('js/firebase-config.js defines valid public config and contains no secrets', () => {
    const source = read('js/firebase-config.js');
    assert.doesNotMatch(source, /private_key/i, 'firebase-config.js must not contain private keys');
    assert.doesNotMatch(source, /FIREBASE_TOKEN/i, 'firebase-config.js must not contain CI tokens');
    assert.doesNotMatch(source, /service_account/i, 'firebase-config.js must not contain service account credentials');

    const ctx = { window: {} };
    ctx.globalThis = ctx.window;
    vm.runInNewContext(source, ctx);

    const config = ctx.window.FIREBASE_CONFIG;
    assert.ok(config, 'FIREBASE_CONFIG must be defined on window');
    assert.equal(config.projectId, 'docvault-qa-team');
    assert.ok(config.apiKey && config.apiKey.startsWith('AIzaSy'), 'Must contain a valid Google API key');
    assert.equal(config.authDomain, 'docvault-qa-team.firebaseapp.com');
    assert.ok(config.appId, 'Must contain appId');
});

test('js/collab-config.js evaluates edition flags, guest mode, and hostname', () => {
    const source = read('js/collab-config.js');
    const ctx = {
        URLSearchParams,
        window: {
            FIREBASE_CONFIG: { projectId: 'docvault-qa-team' },
            location: { hostname: 'dustin-nkd.github.io', search: '' }
        }
    };
    ctx.globalThis = ctx.window;
    vm.runInNewContext(source, ctx);

    assert.ok(ctx.window.CollabConfig, 'CollabConfig must be exported on window');
    // On GitHub Pages without DOCVAULT_EDITION === 'team', collab mode is false
    assert.equal(ctx.window.COLLAB_MODE, false);
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // With ?guest=1, collab mode is false even on team hostname
    ctx.window.location = { hostname: 'docvault-qa-team.web.app', search: '?guest=1' };
    ctx.window.DOCVAULT_EDITION = 'team';
    assert.equal(ctx.window.CollabConfig.isGuestMode(), true);
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // On team hostname with edition 'team' and no guest flag, collab mode is true
    ctx.window.location = { hostname: 'docvault-qa-team.web.app', search: '' };
    assert.equal(ctx.window.CollabConfig.isCollabMode(), true);
});

test('ensureFirebase() creates same-origin script tags, memoizes shared promise, and rejects in guest mode', async () => {
    const loaderSource = read('js/collab-loader.js');

    // Test guest mode rejection
    const guestCtx = {
        window: {
            location: { search: '?guest=1' },
            CollabConfig: { isGuestMode: () => true }
        }
    };
    guestCtx.globalThis = guestCtx.window;
    vm.runInNewContext(loaderSource, guestCtx);

    await assert.rejects(
        () => guestCtx.window.ensureFirebase(),
        /guest mode/,
        'ensureFirebase must reject when in guest demo mode'
    );

    // Test DOM script injection and promise memoization
    const createdScripts = [];
    const headScripts = [];
    const mockDocument = {
        querySelector: (sel) => {
            const match = sel.match(/data-runtime-asset="([^"]+)"/);
            return headScripts.find(s => s.dataset.runtimeAsset === match?.[1]) || null;
        },
        createElement: (tag) => {
            const el = {
                tagName: tag,
                dataset: {},
                listeners: {},
                addEventListener(event, fn) {
                    this.listeners[event] = fn;
                },
                remove() {
                    const idx = headScripts.indexOf(this);
                    if (idx !== -1) headScripts.splice(idx, 1);
                }
            };
            createdScripts.push(el);
            return el;
        },
        head: {
            appendChild: (el) => {
                headScripts.push(el);
                // Simulate asynchronous successful script load
                setTimeout(() => {
                    if (el.listeners['load']) el.listeners['load']();
                }, 5);
            }
        }
    };

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        document: mockDocument,
        window: {
            location: { search: '' },
            CollabConfig: { isGuestMode: () => false },
            firebase: null
        }
    };
    ctx.globalThis = ctx.window;
    vm.runInNewContext(loaderSource, ctx);

    // Mock firebase becoming available once third script finishes
    const checkInterval = setInterval(() => {
        if (headScripts.length === 3) {
            ctx.window.firebase = {
                initializeApp: () => {},
                auth: () => {},
                firestore: () => {}
            };
            clearInterval(checkInterval);
        }
    }, 2);

    const promise1 = ctx.window.ensureFirebase();
    const promise2 = ctx.window.ensureFirebase();
    assert.strictEqual(promise1, promise2, 'Concurrent calls to ensureFirebase must return the exact same promise instance');

    const result = await promise1;
    assert.ok(result, 'ensureFirebase resolved with firebase');
    assert.equal(createdScripts.length, 3, 'Created exactly 3 same-origin script elements');
    assert.equal(createdScripts[0].src, 'vendor/firebase/firebase-app-compat.js');
    assert.equal(createdScripts[1].src, 'vendor/firebase/firebase-auth-compat.js');
    assert.equal(createdScripts[2].src, 'vendor/firebase/firebase-firestore-compat.js');
});

test('js/collab-auth.js complies with line budget and exports redirect-based Google auth methods', () => {
    const authSource = read('js/collab-auth.js');
    const lines = authSource.split(/\r?\n/).length;
    assert.ok(lines <= 400, `js/collab-auth.js must not exceed 400 lines (current: ${lines})`);

    assert.match(authSource, /signInWithRedirect/, 'Must use signInWithRedirect');
    assert.match(authSource, /getRedirectResult/, 'Must use getRedirectResult');
    assert.doesNotMatch(authSource, /signInWithPopup/, 'Must not use signInWithPopup');
});

test('collab-auth initializes with Auth emulator and calls getRedirectResult successfully', async () => {
    const storageMap = new Map();
    const mockStorage = {
        getItem: (k) => storageMap.get(k) || null,
        setItem: (k, v) => storageMap.set(k, String(v)),
        removeItem: (k) => storageMap.delete(k),
        clear: () => storageMap.clear()
    };

    const ctx = {
        console,
        setTimeout,
        clearTimeout,
        URLSearchParams,
        fetch: globalThis.fetch,
        Headers: globalThis.Headers,
        Request: globalThis.Request,
        Response: globalThis.Response
    };
    ctx.window = ctx;
    ctx.self = ctx;
    ctx.globalThis = ctx;
    ctx.location = {
        protocol: 'http:',
        host: 'localhost:8080',
        hostname: 'localhost',
        href: 'http://localhost:8080/',
        search: ''
    };
    ctx.localStorage = mockStorage;
    ctx.sessionStorage = mockStorage;
    ctx.indexedDB = null;

    // Run compat bundles and app configs in context
    vm.runInNewContext(read('vendor/firebase/firebase-app-compat.js'), ctx);
    vm.runInNewContext(read('vendor/firebase/firebase-auth-compat.js'), ctx);
    vm.runInNewContext(read('vendor/firebase/firebase-firestore-compat.js'), ctx);
    vm.runInNewContext(read('js/firebase-config.js'), ctx);
    vm.runInNewContext(read('js/collab-config.js'), ctx);
    vm.runInNewContext(read('js/collab-loader.js'), ctx);
    vm.runInNewContext(read('js/collab-auth.js'), ctx);

    assert.ok(ctx.CollabAuth, 'CollabAuth must be defined on window');
    assert.equal(typeof ctx.CollabAuth.signInWithGoogle, 'function');
    assert.equal(typeof ctx.CollabAuth.getRedirectResult, 'function');
    assert.equal(typeof ctx.CollabAuth.signOutUser, 'function');
    assert.equal(typeof ctx.CollabAuth.onAuthChanged, 'function');

    // Call getRedirectResult against the Auth emulator
    const redirectResult = await ctx.CollabAuth.getRedirectResult();
    assert.ok(redirectResult !== undefined, 'getRedirectResult must return a result object');
    assert.equal(redirectResult.user, null, 'No user signed in prior to redirect');
    assert.equal(redirectResult.credential, null, 'No credential returned prior to redirect');

    // Verify onAuthChanged listener returns an unsubscribe function
    let authStateCalled = false;
    const unsub = ctx.CollabAuth.onAuthChanged((user) => {
        authStateCalled = true;
    });
    assert.equal(typeof unsub, 'function', 'onAuthChanged must return an unsubscribe function');
    unsub();
});
