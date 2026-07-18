const PROFILE = Object.freeze({
    version: 1,
    curve: 'P-256',
    kdf: 'PBKDF2-HMAC-SHA256-v1',
    iterations: 600_000,
    suite: 'A256GCM-v1'
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const ENVIRONMENTS = new Set(['local-browser-test', 'preview', 'production']);
const encoder = new TextEncoder();

export class DeviceKeyLifecycleError extends Error {
    constructor(code) {
        super(code);
        this.name = 'DeviceKeyLifecycleError';
        this.code = code;
    }
}

function fail(code = 'LOCAL_UNLOCK_FAILED') {
    throw new DeviceKeyLifecycleError(code);
}

function exactObject(value, fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) fail();
    return value;
}

function uuid(value) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail();
    return value;
}

function canonicalize(value) {
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail();
        return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
    if (!value || typeof value !== 'object'
        || Object.getPrototypeOf(value) !== Object.prototype) fail();
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

function encodeBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value, minimum, maximum) {
    if (typeof value !== 'string' || !BASE64URL.test(value)
        || value.length > Math.ceil(maximum * 4 / 3)) fail();
    let binary;
    try {
        binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
    } catch {
        return fail();
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (bytes.byteLength < minimum || bytes.byteLength > maximum || encodeBase64Url(bytes) !== value) fail();
    return bytes;
}

function copySecret(value) {
    if (!(value instanceof Uint8Array) || value.byteLength < 16 || value.byteLength > 1_024) fail();
    return value.slice();
}

function canonicalPublicJwk(value) {
    const item = exactObject(value, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y']);
    if (item.crv !== PROFILE.curve || item.ext !== true || item.kty !== 'EC'
        || !Array.isArray(item.key_ops) || item.key_ops.length !== 0) fail();
    decodeBase64Url(item.x, 32, 32);
    decodeBase64Url(item.y, 32, 32);
    return Object.freeze({ crv: PROFILE.curve, ext: true, key_ops: Object.freeze([]), kty: 'EC', x: item.x, y: item.y });
}

async function fingerprintJwk(subtle, value) {
    const jwk = canonicalPublicJwk(value);
    try {
        await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: PROFILE.curve }, true, []);
        const digest = await subtle.digest('SHA-256', encoder.encode(canonicalize(jwk)));
        return { jwk, fingerprint: encodeBase64Url(new Uint8Array(digest)) };
    } catch {
        return fail();
    }
}

function privateAad(value) {
    const item = exactObject(value, ['version', 'kdf', 'kdfIterations', 'suite', 'curve', 'userId', 'deviceId', 'fingerprint']);
    if (item.version !== PROFILE.version || item.kdf !== PROFILE.kdf
        || item.kdfIterations !== PROFILE.iterations || item.suite !== PROFILE.suite
        || item.curve !== PROFILE.curve) fail();
    uuid(item.userId);
    uuid(item.deviceId);
    decodeBase64Url(item.fingerprint, 32, 32);
    return Object.freeze({
        version: 1, kdf: PROFILE.kdf, kdfIterations: PROFILE.iterations,
        suite: PROFILE.suite, curve: PROFILE.curve, userId: item.userId,
        deviceId: item.deviceId, fingerprint: item.fingerprint
    });
}

function privateEnvelope(value) {
    const item = exactObject(value, ['aad', 'ciphertext', 'nonce', 'salt']);
    const aad = privateAad(item.aad);
    decodeBase64Url(item.ciphertext, 17, 528);
    decodeBase64Url(item.nonce, 12, 12);
    decodeBase64Url(item.salt, 16, 32);
    return Object.freeze({ aad, ciphertext: item.ciphertext, nonce: item.nonce, salt: item.salt });
}

async function deriveKek(subtle, secret, salt) {
    const material = await subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await subtle.deriveBits({
        name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PROFILE.iterations
    }, material, 256));
    try {
        return await subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } finally {
        bits.fill(0);
    }
}

async function protectPrivateKey(platformCrypto, pkcs8, aad, unlockSecret) {
    const secret = copySecret(unlockSecret);
    const salt = platformCrypto.getRandomValues(new Uint8Array(16));
    const nonce = platformCrypto.getRandomValues(new Uint8Array(12));
    try {
        const key = await deriveKek(platformCrypto.subtle, secret, salt);
        const ciphertext = await platformCrypto.subtle.encrypt({
            name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(canonicalize(aad)), tagLength: 128
        }, key, pkcs8);
        return privateEnvelope({
            aad,
            ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
            nonce: encodeBase64Url(nonce),
            salt: encodeBase64Url(salt)
        });
    } finally {
        secret.fill(0);
    }
}

async function importProtectedPrivateKey(platformCrypto, value, unlockSecret) {
    const secret = copySecret(unlockSecret);
    let plaintext;
    try {
        const envelope = privateEnvelope(value);
        const salt = decodeBase64Url(envelope.salt, 16, 32);
        const nonce = decodeBase64Url(envelope.nonce, 12, 12);
        const ciphertext = decodeBase64Url(envelope.ciphertext, 17, 528);
        const key = await deriveKek(platformCrypto.subtle, secret, salt);
        plaintext = new Uint8Array(await platformCrypto.subtle.decrypt({
            name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(canonicalize(envelope.aad)), tagLength: 128
        }, key, ciphertext));
        if (plaintext.byteLength < 1 || plaintext.byteLength > 512) fail();
        return await platformCrypto.subtle.importKey('pkcs8', plaintext,
            { name: 'ECDH', namedCurve: PROFILE.curve }, false, ['deriveBits']);
    } catch {
        return fail();
    } finally {
        secret.fill(0);
        plaintext?.fill(0);
    }
}

async function proveKeyPair(platformCrypto, privateKey, publicJwk) {
    let first;
    let second;
    try {
        const publicKey = await platformCrypto.subtle.importKey('jwk', publicJwk,
            { name: 'ECDH', namedCurve: PROFILE.curve }, true, []);
        const ephemeral = await platformCrypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: PROFILE.curve }, false, ['deriveBits']);
        first = new Uint8Array(await platformCrypto.subtle.deriveBits(
            { name: 'ECDH', public: ephemeral.publicKey }, privateKey, 256));
        second = new Uint8Array(await platformCrypto.subtle.deriveBits(
            { name: 'ECDH', public: publicKey }, ephemeral.privateKey, 256));
        let difference = first.byteLength ^ second.byteLength;
        for (let index = 0; index < Math.min(first.byteLength, second.byteLength); index += 1) {
            difference |= first[index] ^ second[index];
        }
        if (difference !== 0) fail();
    } catch {
        return fail();
    } finally {
        first?.fill(0);
        second?.fill(0);
    }
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
        request.onblocked = () => reject(new Error('IndexedDB request blocked'));
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    });
}

export class EncryptedDeviceKeyStore {
    constructor({ environment, indexedDB }) {
        if (!ENVIRONMENTS.has(environment) || !indexedDB?.open) fail('CRYPTO_UNSUPPORTED_BROWSER');
        this.environment = environment;
        this.indexedDB = indexedDB;
        this.databaseName = `docvault-collaboration-device-keys-v1-${environment}`;
        this.storeName = 'encrypted-private-key-envelopes';
        this.database = null;
    }

    async open() {
        if (this.database) return this.database;
        try {
            const request = this.indexedDB.open(this.databaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(this.storeName);
            this.database = await requestResult(request);
            this.database.onversionchange = () => {
                this.database?.close();
                this.database = null;
            };
            return this.database;
        } catch {
            return fail('CRYPTO_UNSUPPORTED_BROWSER');
        }
    }

    key(userId, deviceId) {
        return `${uuid(userId)}:${uuid(deviceId)}`;
    }

    async put(userId, deviceId, envelope) {
        const exactEnvelope = privateEnvelope(envelope);
        if (exactEnvelope.aad.userId !== userId || exactEnvelope.aad.deviceId !== deviceId) fail();
        try {
            const database = await this.open();
            const transaction = database.transaction(this.storeName, 'readwrite');
            transaction.objectStore(this.storeName).add(exactEnvelope, this.key(userId, deviceId));
            await transactionDone(transaction);
        } catch (error) {
            if (error instanceof DeviceKeyLifecycleError) throw error;
            return fail('LOCAL_STORAGE_FAILED');
        }
    }

    async get(userId, deviceId) {
        try {
            const database = await this.open();
            const transaction = database.transaction(this.storeName, 'readonly');
            const value = await requestResult(transaction.objectStore(this.storeName).get(this.key(userId, deviceId)));
            await transactionDone(transaction);
            if (value === undefined) fail();
            return privateEnvelope(value);
        } catch (error) {
            if (error instanceof DeviceKeyLifecycleError) throw error;
            return fail('LOCAL_UNLOCK_FAILED');
        }
    }

    async delete(userId, deviceId) {
        try {
            const database = await this.open();
            const transaction = database.transaction(this.storeName, 'readwrite');
            transaction.objectStore(this.storeName).delete(this.key(userId, deviceId));
            await transactionDone(transaction);
        } catch {
            return fail('LOCAL_STORAGE_FAILED');
        }
    }

    close() {
        this.database?.close();
        this.database = null;
    }
}

function validateContext(value) {
    const item = exactObject(value, ['userId', 'deviceId', 'workspaceId']);
    return Object.freeze({ userId: uuid(item.userId), deviceId: uuid(item.deviceId), workspaceId: uuid(item.workspaceId) });
}

export class DeviceKeyLifecycle {
    constructor({ environment, context, platformCrypto = globalThis.crypto,
        indexedDB = globalThis.indexedDB, secureContext = globalThis.isSecureContext }) {
        if (!ENVIRONMENTS.has(environment)) fail('CRYPTO_UNSUPPORTED_BROWSER');
        this.environment = environment;
        this.context = validateContext(context);
        this.platformCrypto = platformCrypto;
        this.secureContext = secureContext;
        this.store = new EncryptedDeviceKeyStore({ environment, indexedDB });
        this.unlocked = null;
        this.epoch = 0;
        this.unbind = null;
    }

    async assertSupported() {
        if (this.secureContext !== true || !this.platformCrypto?.subtle
            || typeof this.platformCrypto.getRandomValues !== 'function') fail('CRYPTO_UNSUPPORTED_BROWSER');
        await this.store.open();
        return true;
    }

    get state() {
        return this.unlocked ? 'unlocked' : 'locked';
    }

    get key() {
        if (!this.unlocked) fail('LOCAL_KEY_LOCKED');
        return this.unlocked.privateKey;
    }

    get metadata() {
        if (!this.unlocked) return null;
        return Object.freeze({
            userId: this.unlocked.userId,
            deviceId: this.unlocked.deviceId,
            fingerprint: this.unlocked.fingerprint
        });
    }

    async enroll(unlockSecret) {
        await this.assertSupported();
        this.lock('enroll');
        const operationEpoch = this.epoch;
        let pair;
        let pkcs8;
        let persisted = false;
        try {
            pair = await this.platformCrypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: PROFILE.curve }, true, ['deriveBits']);
            const publicResult = await fingerprintJwk(this.platformCrypto.subtle,
                await this.platformCrypto.subtle.exportKey('jwk', pair.publicKey));
            pkcs8 = new Uint8Array(await this.platformCrypto.subtle.exportKey('pkcs8', pair.privateKey));
            const aad = privateAad({
                version: 1, kdf: PROFILE.kdf, kdfIterations: PROFILE.iterations,
                suite: PROFILE.suite, curve: PROFILE.curve, userId: this.context.userId,
                deviceId: this.context.deviceId, fingerprint: publicResult.fingerprint
            });
            const envelope = await protectPrivateKey(this.platformCrypto, pkcs8, aad, unlockSecret);
            await this.store.put(this.context.userId, this.context.deviceId, envelope);
            persisted = true;
            const privateKey = await this.platformCrypto.subtle.importKey('pkcs8', pkcs8,
                { name: 'ECDH', namedCurve: PROFILE.curve }, false, ['deriveBits']);
            await proveKeyPair(this.platformCrypto, privateKey, publicResult.jwk);
            if (operationEpoch !== this.epoch) fail();
            this.unlocked = Object.freeze({
                userId: this.context.userId, deviceId: this.context.deviceId,
                fingerprint: publicResult.fingerprint, privateKey
            });
            return Object.freeze({ publicJwk: publicResult.jwk, fingerprint: publicResult.fingerprint });
        } catch (error) {
            this.lock('enroll-failed');
            if (persisted) await this.store.delete(this.context.userId, this.context.deviceId).catch(() => {});
            if (error instanceof DeviceKeyLifecycleError) throw error;
            return fail('CRYPTO_UNSUPPORTED_BROWSER');
        } finally {
            pkcs8?.fill(0);
            pair = null;
        }
    }

    async unlock(unlockSecret, expectedPublicJwk) {
        await this.assertSupported();
        this.lock('unlock');
        const operationEpoch = this.epoch;
        try {
            const expected = await fingerprintJwk(this.platformCrypto.subtle, expectedPublicJwk);
            const envelope = await this.store.get(this.context.userId, this.context.deviceId);
            if (envelope.aad.userId !== this.context.userId
                || envelope.aad.deviceId !== this.context.deviceId
                || envelope.aad.fingerprint !== expected.fingerprint) fail();
            const privateKey = await importProtectedPrivateKey(this.platformCrypto, envelope, unlockSecret);
            await proveKeyPair(this.platformCrypto, privateKey, expected.jwk);
            if (operationEpoch !== this.epoch) fail();
            this.unlocked = Object.freeze({
                userId: this.context.userId, deviceId: this.context.deviceId,
                fingerprint: expected.fingerprint, privateKey
            });
            return Object.freeze({ fingerprint: expected.fingerprint });
        } catch {
            this.lock('unlock-failed');
            return fail('LOCAL_UNLOCK_FAILED');
        }
    }

    lock() {
        this.epoch += 1;
        this.unlocked = null;
    }

    changeContext(nextContext) {
        const validated = validateContext(nextContext);
        if (Object.keys(validated).some(key => validated[key] !== this.context[key])) this.lock('context-change');
        this.context = validated;
    }

    async revokeLocalDevice() {
        this.lock('revocation');
        await this.store.delete(this.context.userId, this.context.deviceId);
    }

    bindAutoLock({ windowTarget = globalThis.window, documentTarget = globalThis.document } = {}) {
        this.unbind?.();
        const lock = () => this.lock('page-lifecycle');
        const hide = () => { if (documentTarget?.visibilityState === 'hidden') lock(); };
        windowTarget?.addEventListener?.('pagehide', lock);
        windowTarget?.addEventListener?.('beforeunload', lock);
        documentTarget?.addEventListener?.('freeze', lock);
        documentTarget?.addEventListener?.('visibilitychange', hide);
        this.unbind = () => {
            windowTarget?.removeEventListener?.('pagehide', lock);
            windowTarget?.removeEventListener?.('beforeunload', lock);
            documentTarget?.removeEventListener?.('freeze', lock);
            documentTarget?.removeEventListener?.('visibilitychange', hide);
            this.unbind = null;
        };
        return this.unbind;
    }

    dispose() {
        this.lock('dispose');
        this.unbind?.();
        this.store.close();
    }
}

export const DEVICE_KEY_PROFILE = PROFILE;

export function unsupportedBrowserGuidance(error) {
    const code = error instanceof DeviceKeyLifecycleError ? error.code : 'CRYPTO_UNSUPPORTED_BROWSER';
    if (code === 'LOCAL_UNLOCK_FAILED') {
        return Object.freeze({ code, title: 'Unable to unlock this device',
            action: 'Check the unlock secret or provision a new device from an active key-ready device.' });
    }
    if (code === 'LOCAL_STORAGE_FAILED') {
        return Object.freeze({ code, title: 'Protected storage is unavailable',
            action: 'Free browser storage or use a supported non-private browser profile, then try again.' });
    }
    return Object.freeze({ code: 'CRYPTO_UNSUPPORTED_BROWSER', title: 'This browser cannot protect a device key',
        action: 'Use a supported current browser in a secure context. No private key was saved.' });
}
