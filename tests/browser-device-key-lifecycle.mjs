import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modulePath = 'js/collaboration/device-key-lifecycle.js';
const browsers = { chromium, firefox, webkit };
const required = (process.env.DOCVAULT_BROWSER_MATRIX || 'chromium,firefox,webkit').split(',');

function startServer() {
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (pathname === '/') {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end('<!doctype html><html><body><main>Device lifecycle test origin</main></body></html>');
            return;
        }
        const candidate = path.resolve(root, pathname.replace(/^\/+/, ''));
        if (!candidate.startsWith(root + path.sep) || candidate !== path.join(root, ...modulePath.split('/'))) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        fs.createReadStream(candidate).pipe(response);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    }));
}

async function runBrowser(browserName, baseUrl) {
    const browser = await browsers[browserName].launch({ headless: true });
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        const errors = [];
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        const result = await page.evaluate(async moduleUrl => {
            const {
                DeviceKeyLifecycle, DeviceKeyLifecycleError, unsupportedBrowserGuidance
            } = await import(moduleUrl);
            const userId = '11111111-1111-4111-8111-111111111111';
            const deviceId = '22222222-2222-4222-8222-222222222222';
            const workspaceId = '33333333-3333-4333-8333-333333333333';
            const otherWorkspaceId = '44444444-4444-4444-8444-444444444444';
            const context = { userId, deviceId, workspaceId };
            const databaseName = 'docvault-collaboration-device-keys-v1-local-browser-test';
            await new Promise(resolve => {
                const request = indexedDB.deleteDatabase(databaseName);
                request.onsuccess = request.onerror = request.onblocked = () => resolve();
            });
            const secret = new TextEncoder().encode('synthetic-browser-unlock-secret-v1');
            const wrongSecret = new TextEncoder().encode('synthetic-browser-unlock-secret-v2');
            const lifecycle = new DeviceKeyLifecycle({ environment: 'local-browser-test', context });
            lifecycle.bindAutoLock();
            const supported = await lifecycle.assertSupported();
            const enrollStarted = performance.now();
            const enrollment = await lifecycle.enroll(secret);
            const protectMs = performance.now() - enrollStarted;
            const enrolledKey = lifecycle.key;
            const enrolledState = {
                extractable: enrolledKey.extractable,
                usages: [...enrolledKey.usages],
                type: enrolledKey.type,
                state: lifecycle.state
            };

            const readRaw = async () => {
                const database = lifecycle.store.database;
                const transaction = database.transaction(lifecycle.store.storeName, 'readonly');
                return await new Promise((resolve, reject) => {
                    const request = transaction.objectStore(lifecycle.store.storeName).get(`${userId}:${deviceId}`);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            };
            const writeRaw = async value => {
                const transaction = lifecycle.store.database.transaction(lifecycle.store.storeName, 'readwrite');
                await new Promise((resolve, reject) => {
                    const request = transaction.objectStore(lifecycle.store.storeName).put(value, `${userId}:${deviceId}`);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            };
            const stored = await readRaw();
            const storedText = JSON.stringify(stored);
            lifecycle.lock();
            const explicitLock = lifecycle.state;

            const wrongCodes = [];
            try { await lifecycle.unlock(wrongSecret, enrollment.publicJwk); } catch (error) { wrongCodes.push(error.code); }
            const otherUserId = '55555555-5555-4555-8555-555555555555';
            const otherDeviceId = '66666666-6666-4666-8666-666666666666';
            const mutateBase64 = value => `${value.startsWith('A') ? 'B' : 'A'}${value.slice(1)}`;
            const mutations = [
                value => { value.aad.userId = otherUserId; },
                value => { value.aad.deviceId = otherDeviceId; },
                value => { value.aad.fingerprint = mutateBase64(value.aad.fingerprint); },
                value => { value.aad.version = 2; },
                value => { value.aad.kdf = 'PBKDF2-HMAC-SHA256-v0'; },
                value => { value.aad.kdfIterations = 599999; },
                value => { value.aad.suite = 'A256GCM-v0'; },
                value => { value.aad.curve = 'P-384'; },
                value => { value.ciphertext = mutateBase64(value.ciphertext); },
                value => { value.nonce = mutateBase64(value.nonce); },
                value => { value.salt = mutateBase64(value.salt); }
            ];
            for (const mutate of mutations) {
                const altered = structuredClone(stored);
                mutate(altered);
                await writeRaw(altered);
                try { await lifecycle.unlock(secret, enrollment.publicJwk); } catch (error) { wrongCodes.push(error.code); }
            }
            await writeRaw(stored);
            const alteredPublicJwk = structuredClone(enrollment.publicJwk);
            alteredPublicJwk.x = mutateBase64(alteredPublicJwk.x);
            try { await lifecycle.unlock(secret, alteredPublicJwk); } catch (error) { wrongCodes.push(error.code); }

            const epochBeforeInterruptedUnlock = lifecycle.epoch;
            const interruptedUnlock = lifecycle.unlock(secret, enrollment.publicJwk);
            while (lifecycle.epoch === epochBeforeInterruptedUnlock) await Promise.resolve();
            lifecycle.lock();
            let interruptedCode;
            try { await interruptedUnlock; } catch (error) { interruptedCode = error.code; }

            const unlockStarted = performance.now();
            await lifecycle.unlock(secret, enrollment.publicJwk);
            const unlockMs = performance.now() - unlockStarted;
            const unlockedKey = lifecycle.key;
            const unlockedState = {
                extractable: unlockedKey.extractable,
                usages: [...unlockedKey.usages],
                state: lifecycle.state
            };

            lifecycle.changeContext({ userId, deviceId, workspaceId: otherWorkspaceId });
            const contextSwitchState = lifecycle.state;
            lifecycle.changeContext(context);
            await lifecycle.unlock(secret, enrollment.publicJwk);
            dispatchEvent(new PageTransitionEvent('pagehide'));
            const pagehideState = lifecycle.state;

            lifecycle.dispose();
            const reloaded = new DeviceKeyLifecycle({ environment: 'local-browser-test', context });
            await reloaded.unlock(secret, enrollment.publicJwk);
            const reloadState = reloaded.state;
            await reloaded.revokeLocalDevice();
            let revokedCode;
            try { await reloaded.unlock(secret, enrollment.publicJwk); } catch (error) { revokedCode = error.code; }
            reloaded.dispose();

            let unsupportedCode;
            let storageUnavailableCode;
            let guidance;
            try {
                const unsupported = new DeviceKeyLifecycle({
                    environment: 'local-browser-test', context, secureContext: false
                });
                await unsupported.assertSupported();
            } catch (error) {
                unsupportedCode = error.code;
                guidance = unsupportedBrowserGuidance(error);
            }
            try {
                const unavailableIndexedDB = {
                    open() {
                        const request = {};
                        queueMicrotask(() => {
                            request.error = new DOMException('Synthetic quota denial', 'QuotaExceededError');
                            request.onerror?.();
                        });
                        return request;
                    }
                };
                const unavailable = new DeviceKeyLifecycle({
                    environment: 'local-browser-test', context, indexedDB: unavailableIndexedDB
                });
                await unavailable.assertSupported();
            } catch (error) {
                storageUnavailableCode = error.code;
            }
            // CF-P7-005: re-binding an enrolled key onto the device id the
            // server assigns. Registration cannot be reordered to avoid this --
            // the public key must exist before it can be registered, and the
            // server derives the id -- so the same key has to move. The
            // fingerprint must survive: a rebind that changed it would leave
            // every workspace envelope provisioned to this device unopenable.
            const assignedDeviceId = '55555555-5555-4555-8555-555555555555';
            const rebindLifecycle = new DeviceKeyLifecycle({
                environment: 'local-browser-test',
                context: { userId, deviceId: '66666666-6666-4666-8666-666666666666', workspaceId }
            });
            const rebindEnrolled = await rebindLifecycle.enroll(secret);
            const rebindResult = await rebindLifecycle.rebindDeviceId(assignedDeviceId, secret);
            const rebindStore = await new Promise((resolve, reject) => {
                const open = indexedDB.open(databaseName);
                open.onerror = () => reject(open.error);
                open.onsuccess = () => {
                    const database = open.result;
                    const transaction = database.transaction(rebindLifecycle.store.storeName, 'readonly');
                    const store = transaction.objectStore(rebindLifecycle.store.storeName);
                    const moved = store.get(`${userId}:${assignedDeviceId}`);
                    const original = store.get(`${userId}:66666666-6666-4666-8666-666666666666`);
                    transaction.oncomplete = () => {
                        database.close();
                        resolve({ moved: moved.result, original: original.result });
                    };
                    transaction.onerror = () => reject(transaction.error);
                };
            });
            // The re-bound key must still open: prove it by unlocking against
            // the public key registered before the move.
            const rebindUnlock = await rebindLifecycle.unlock(secret, rebindEnrolled.publicJwk);
            let rebindOldIdCode;
            try {
                rebindLifecycle.changeContext({
                    userId, deviceId: '66666666-6666-4666-8666-666666666666', workspaceId
                });
                await rebindLifecycle.unlock(secret, rebindEnrolled.publicJwk);
            } catch (error) {
                rebindOldIdCode = error.code;
            }

            return {
                supported, protectMs, unlockMs, enrolledState, explicitLock, wrongCodes,
                unlockedState, contextSwitchState, pagehideState, reloadState, revokedCode,
                unsupportedCode, storageUnavailableCode, guidance, interruptedCode, stored, storedText,
                domText: document.documentElement.outerHTML,
                errorClassStable: new DeviceKeyLifecycleError('LOCAL_UNLOCK_FAILED').code,
                rebind: {
                    rebound: rebindResult.rebound,
                    fingerprintUnchanged: rebindResult.fingerprint === rebindEnrolled.fingerprint,
                    unlockedFingerprint: rebindUnlock.fingerprint,
                    aadDeviceId: rebindStore.moved?.aad?.deviceId ?? null,
                    aadFingerprint: rebindStore.moved?.aad?.fingerprint ?? null,
                    originalRecordRemoved: rebindStore.original === undefined,
                    oldIdCode: rebindOldIdCode
                }
            };
        }, `${baseUrl}/${modulePath}`);

        assert.equal(result.supported, true, `${browserName}: required capabilities`);
        assert.deepEqual(result.enrolledState, { extractable: false, usages: ['deriveBits'], type: 'private', state: 'unlocked' });
        assert.equal(result.explicitLock, 'locked');
        assert.equal(result.wrongCodes.length, 13, `${browserName}: complete tamper matrix`);
        assert.ok(result.wrongCodes.every(code => code === 'LOCAL_UNLOCK_FAILED'), `${browserName}: uniform unlock failure`);
        assert.equal(result.interruptedCode, 'LOCAL_UNLOCK_FAILED', `${browserName}: interrupted unlock must not resurrect key`);
        assert.deepEqual(result.unlockedState, { extractable: false, usages: ['deriveBits'], state: 'unlocked' });
        assert.equal(result.contextSwitchState, 'locked');
        assert.equal(result.pagehideState, 'locked');
        assert.equal(result.reloadState, 'unlocked');
        assert.equal(result.revokedCode, 'LOCAL_UNLOCK_FAILED');
        assert.equal(result.unsupportedCode, 'CRYPTO_UNSUPPORTED_BROWSER');
        assert.equal(result.storageUnavailableCode, 'CRYPTO_UNSUPPORTED_BROWSER');
        assert.equal(result.guidance.code, 'CRYPTO_UNSUPPORTED_BROWSER');
        assert.equal(result.errorClassStable, 'LOCAL_UNLOCK_FAILED');
        assert.deepEqual(Object.keys(result.stored).sort(), ['aad', 'ciphertext', 'nonce', 'salt']);
        assert.deepEqual(Object.keys(result.stored.aad).sort(),
            ['curve', 'deviceId', 'fingerprint', 'kdf', 'kdfIterations', 'suite', 'userId', 'version']);
        for (const prohibited of ['synthetic-browser-unlock-secret', 'privateKey', 'pkcs8', '"d"', 'workspaceId']) {
            assert.equal(result.storedText.includes(prohibited), false, `${browserName}: IndexedDB leaked ${prohibited}`);
            assert.equal(result.domText.includes(prohibited), false, `${browserName}: DOM leaked ${prohibited}`);
        }
        // CF-P7-005 re-bind: same key, new device id, nothing left behind.
        assert.equal(result.rebind.rebound, true, `${browserName}: rebind did not run`);
        assert.equal(result.rebind.fingerprintUnchanged, true,
            `${browserName}: rebind changed the fingerprint, orphaning any provisioned envelope`);
        assert.equal(result.rebind.aadDeviceId, '55555555-5555-4555-8555-555555555555',
            `${browserName}: the stored AAD still binds the old device id`);
        assert.equal(result.rebind.aadFingerprint, result.rebind.unlockedFingerprint,
            `${browserName}: the re-protected AAD disagrees with the key it protects`);
        assert.equal(result.rebind.originalRecordRemoved, true,
            `${browserName}: the key is still readable under the abandoned device id`);
        assert.equal(result.rebind.oldIdCode, 'LOCAL_UNLOCK_FAILED',
            `${browserName}: the old device id must no longer unlock anything`);
        assert.ok(result.protectMs <= 2_500, `${browserName}: protect ${result.protectMs.toFixed(1)}ms exceeds max`);
        assert.ok(result.unlockMs <= 2_500, `${browserName}: unlock ${result.unlockMs.toFixed(1)}ms exceeds max`);
        assert.deepEqual(errors, [], `${browserName}: browser runtime errors`);
        return { browserName, protectMs: result.protectMs, unlockMs: result.unlockMs };
    } finally {
        await browser.close();
    }
}

assert.ok(fs.existsSync(path.join(root, ...modulePath.split('/'))), 'Device lifecycle module is missing');
const { server, baseUrl } = await startServer();
try {
    const results = [];
    for (const browserName of required) {
        assert.ok(browsers[browserName], `Unknown required browser: ${browserName}`);
        results.push(await runBrowser(browserName, baseUrl));
    }
    for (const result of results) {
        console.log(`${result.browserName}: protect ${result.protectMs.toFixed(1)}ms; unlock ${result.unlockMs.toFixed(1)}ms`);
    }
    console.log(`CF-P5-003 browser device-key lifecycle passed (${results.length} browsers)`);
} finally {
    await new Promise(resolve => server.close(resolve));
}
