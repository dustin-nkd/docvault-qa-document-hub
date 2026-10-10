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

test('js/collab-config.js evaluates edition flags, guest mode, and hostname dynamically', () => {
    const source = read('js/collab-config.js');
    const ctx = {
        URLSearchParams,
        window: {
            FIREBASE_CONFIG: { projectId: 'docvault-qa-team' },
            location: { hostname: 'docvault-qa-team.firebaseapp.com', search: '' }
        }
    };
    ctx.globalThis = ctx.window;
    vm.runInNewContext(source, ctx);

    assert.ok(ctx.window.CollabConfig, 'CollabConfig must be exported on window');

    // If js/edition.js has not loaded yet (DOCVAULT_EDITION not set), COLLAB_MODE is false
    assert.equal(ctx.window.COLLAB_MODE, false);
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // When js/edition.js loads later, reading COLLAB_MODE recalculates dynamically to true
    ctx.window.DOCVAULT_EDITION = 'team';
    assert.equal(ctx.window.COLLAB_MODE, true, 'docvault-qa-team.firebaseapp.com + team edition + no guest is true');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), true);

    // 1. github.io + DOCVAULT_EDITION = "team" is still false
    ctx.window.location = { hostname: 'dustin-nkd.github.io', search: '' };
    assert.equal(ctx.window.COLLAB_MODE, false, 'github.io + edition team must be false');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // 2. localhost + edition team is still false
    ctx.window.location = { hostname: 'localhost', search: '' };
    assert.equal(ctx.window.COLLAB_MODE, false, 'localhost + edition team must be false');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // 2b. 127.0.0.1 + edition team is still false
    ctx.window.location = { hostname: '127.0.0.1', search: '' };
    assert.equal(ctx.window.COLLAB_MODE, false, '127.0.0.1 + edition team must be false');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // 3. docvault-qa-team.firebaseapp.com + edition team + ?guest=1 is false
    ctx.window.location = { hostname: 'docvault-qa-team.firebaseapp.com', search: '?guest=1' };
    assert.equal(ctx.window.CollabConfig.isGuestMode(), true);
    assert.equal(ctx.window.COLLAB_MODE, false, 'team hostname with ?guest=1 must be false');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), false);

    // 4. docvault-qa-team.firebaseapp.com + edition team, no guest, is true
    ctx.window.location = { hostname: 'docvault-qa-team.firebaseapp.com', search: '' };
    assert.equal(ctx.window.COLLAB_MODE, true, 'docvault-qa-team.firebaseapp.com + edition team without guest must be true');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), true);

    // 5. docvault-qa-team.web.app + edition team, no guest, is true
    ctx.window.location = { hostname: 'docvault-qa-team.web.app', search: '' };
    assert.equal(ctx.window.COLLAB_MODE, true, 'docvault-qa-team.web.app + edition team without guest must be true');
    assert.equal(ctx.window.CollabConfig.isCollabMode(), true);
});

test('Phase 12 two-edition activation contract: COLLAB_MODE activates strictly on team hosting with edition and turns off on github.io, guest mode, or localhost without edition', () => {
    const source = read('js/collab-config.js');

    function createCollabEnv(opts = {}) {
        const ctx = {
            URLSearchParams,
            window: {
                DOCVAULT_EDITION: opts.edition,
                location: {
                    hostname: opts.hostname || 'localhost',
                    search: opts.search || ''
                }
            }
        };
        ctx.globalThis = ctx.window;
        vm.runInNewContext(source, ctx);
        return ctx.window;
    }

    // 1. Turns on for docvault-qa-team.web.app with DOCVAULT_EDITION = "team"
    const teamWebApp = createCollabEnv({ hostname: 'docvault-qa-team.web.app', edition: 'team' });
    assert.equal(teamWebApp.COLLAB_MODE, true, 'docvault-qa-team.web.app with edition team must be true');
    assert.equal(teamWebApp.CollabConfig.isCollabMode(), true);

    // 2. Turns on for docvault-qa-team.firebaseapp.com with DOCVAULT_EDITION = "team"
    const teamFirebaseApp = createCollabEnv({ hostname: 'docvault-qa-team.firebaseapp.com', edition: 'team' });
    assert.equal(teamFirebaseApp.COLLAB_MODE, true, 'docvault-qa-team.firebaseapp.com with edition team must be true');
    assert.equal(teamFirebaseApp.CollabConfig.isCollabMode(), true);

    // 3. Turns off on dustin-nkd.github.io even if edition is "team"
    const githubPages = createCollabEnv({ hostname: 'dustin-nkd.github.io', edition: 'team' });
    assert.equal(githubPages.COLLAB_MODE, false, 'dustin-nkd.github.io must always have COLLAB_MODE = false');
    assert.equal(githubPages.CollabConfig.isCollabMode(), false);

    // 4. Turns off with ?guest=1 query even on team hostname and edition
    const guestTeam = createCollabEnv({ hostname: 'docvault-qa-team.web.app', edition: 'team', search: '?guest=1' });
    assert.equal(guestTeam.COLLAB_MODE, false, 'team hostname with ?guest=1 must have COLLAB_MODE = false');
    assert.equal(guestTeam.CollabConfig.isCollabMode(), false);
    assert.equal(guestTeam.CollabConfig.isGuestMode(), true);

    // 5. Turns off on localhost without DOCVAULT_EDITION
    const localhostNoEdition = createCollabEnv({ hostname: 'localhost' });
    assert.equal(localhostNoEdition.COLLAB_MODE, false, 'localhost without DOCVAULT_EDITION must be false');
    assert.equal(localhostNoEdition.CollabConfig.isCollabMode(), false);

    // 6. Turns off on localhost even with DOCVAULT_EDITION = "team"
    const localhostWithEdition = createCollabEnv({ hostname: 'localhost', edition: 'team' });
    assert.equal(localhostWithEdition.COLLAB_MODE, false, 'localhost with edition team must be false (not on team hosting)');
    assert.equal(localhostWithEdition.CollabConfig.isCollabMode(), false);
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

test('onAuthChanged() early cancellation prevents listener attachment when getAuthInstance resolves', async () => {
    let resolveFirebase;
    const fakeFirebasePromise = new Promise(resolve => {
        resolveFirebase = resolve;
    });

    let listenerAttached = false;
    let authCallbackReceived = false;

    const mockAuth = {
        onAuthStateChanged: (cb) => {
            listenerAttached = true;
            cb({ uid: 'test-user' });
            return () => { listenerAttached = false; };
        }
    };

    const ctx = {
        console,
        ensureFirebase: () => fakeFirebasePromise,
        CollabConfig: { getFirebaseConfig: () => ({ projectId: 'docvault-qa-team' }) },
        location: { hostname: 'localhost' }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    const authSource = read('js/collab-auth.js');
    vm.runInNewContext(authSource, ctx);

    // Call onAuthChanged while getAuthInstance() is still pending
    const unsub = ctx.CollabAuth.onAuthChanged(() => {
        authCallbackReceived = true;
    });
    assert.equal(typeof unsub, 'function', 'Must return an unsubscribe function synchronously');

    // Cancel early before getAuthInstance() resolves
    unsub();

    // Now resolve Firebase SDK loading
    resolveFirebase({
        apps: [{ name: '[DEFAULT]' }],
        auth: () => mockAuth
    });

    // Wait for promise chain / microtasks to settle
    await new Promise(resolve => setTimeout(resolve, 20));

    // Assert that the listener was never attached and callback was never called
    assert.equal(listenerAttached, false, 'Listener must NOT be attached to auth instance when cancelled early');
    assert.equal(authCallbackReceived, false, 'Callback must NOT be called when cancelled early');
});

test('onAuthChanged() unsubscribe after resolution properly detaches listener', async () => {
    let listenerAttached = false;
    let unsubCalled = false;

    const mockAuth = {
        onAuthStateChanged: (cb) => {
            listenerAttached = true;
            return () => {
                unsubCalled = true;
                listenerAttached = false;
            };
        }
    };

    const ctx = {
        console,
        ensureFirebase: () => Promise.resolve({
            apps: [{ name: '[DEFAULT]' }],
            auth: () => mockAuth
        }),
        CollabConfig: { getFirebaseConfig: () => ({ projectId: 'docvault-qa-team' }) },
        location: { hostname: 'localhost' }
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;

    const authSource = read('js/collab-auth.js');
    vm.runInNewContext(authSource, ctx);

    const unsub = ctx.CollabAuth.onAuthChanged(() => {});
    await new Promise(resolve => setTimeout(resolve, 20));

    assert.equal(listenerAttached, true, 'Listener was attached after resolution');
    unsub();
    assert.equal(unsubCalled, true, 'Underlying unsubscribe was called');
    assert.equal(listenerAttached, false, 'Listener was detached');
});
