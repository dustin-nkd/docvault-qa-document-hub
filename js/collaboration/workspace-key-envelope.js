// Workspace key envelope wrapping, for the creator's own device (CF-P7-013 gap).
//
// `functions/_lib/e2ee/primitives.ts` already implements `wrapWorkspaceKey` and
// its counterpart `unwrapWorkspaceKey`, reviewed and tested against the exact
// format `functions/_lib/e2ee/workspace-envelope-parser.ts` requires on the way
// in. Nothing here is a new cipher choice or a new binding: this is that same
// algorithm, restated in plain JS because the browser bundle has no build step
// to compile the server's TypeScript through. The two must produce
// byte-for-byte the same canonical form, or a real server will reject a real
// envelope this module sealed.
//
// Suite: ECDH P-256 to derive a shared secret, HKDF-SHA256 over that secret to
// derive a wrapping key, AES-256-GCM to wrap the 32-byte workspace DEK. The AAD
// is bound into both the HKDF `info` and the AEAD `additionalData`, so an
// envelope sealed for one workspace, device, or key version fails closed against
// any other.
//
// This module only ever wraps to the *caller's own* device — the creator
// sealing a workspace's first key envelope to themselves. Provisioning a key to
// someone else's device is a different, not-yet-built journey and is out of
// scope here.

/**
 * @typedef {{version: 1, suite: 'P256-HKDF-SHA256-A256GCM-v1', workspaceId: string,
 *   targetUserId: string, targetDeviceId: string, targetFingerprint: string,
 *   wrapperDeviceId: string, keyVersion: number}} WorkspaceEnvelopeAad
 * @typedef {{crv: 'P-256', ext: true, key_ops: readonly string[], kty: 'EC',
 *   x: string, y: string}} CanonicalPublicJwk
 * @typedef {{aad: WorkspaceEnvelopeAad, ciphertext: string,
 *   ephemeralPublicJwk: CanonicalPublicJwk, hkdfSalt: string, nonce: string}} WorkspaceKeyEnvelope
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const WORKSPACE_SUITE = 'P256-HKDF-SHA256-A256GCM-v1';

export class WorkspaceKeyEnvelopeError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'WorkspaceKeyEnvelopeError';
        this.code = code;
    }
}

/** @returns {never} */
const fail = (code = 'CRYPTO_FORMAT_INVALID') => { throw new WorkspaceKeyEnvelopeError(code); };

// ── canonical JSON, byte-identical to functions/_lib/e2ee/canonical.ts ──────

/**
 * @param {unknown} value
 * @param {Set<unknown>} seen
 * @returns {string}
 */
function serialize(value, seen) {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) fail();
        return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value !== 'object' || value === null) return fail();
    if (seen.has(value)) fail();
    seen.add(value);
    try {
        if (Array.isArray(value)) return `[${value.map(item => serialize(item, seen)).join(',')}]`;
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail();
        const record = /** @type {Record<string, unknown>} */ (value);
        const keys = Object.keys(record).sort();
        return `{${keys.map(key => {
            if (!Object.hasOwn(record, key) || record[key] === undefined) fail();
            return `${JSON.stringify(key)}:${serialize(record[key], seen)}`;
        }).join(',')}}`;
    } finally {
        seen.delete(value);
    }
}

/** @param {unknown} value */
function canonicalize(value) {
    return serialize(value, new Set());
}

const encoder = new TextEncoder();
/** @param {string} value */
const utf8 = value => encoder.encode(value);

/** @param {Uint8Array} bytes */
function encodeBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * @param {unknown} value
 * @param {number} [expectedBytes]
 * @param {number} [maximumBytes]
 */
function decodeBase64Url(value, expectedBytes, maximumBytes = 4_096) {
    if (typeof value !== 'string') return fail();
    if (!BASE64URL.test(value) || value.length > Math.ceil(maximumBytes * 4 / 3)) fail();
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    let binary;
    try {
        binary = atob(padded);
    } catch {
        return fail();
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (bytes.byteLength > maximumBytes
        || (expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
        || encodeBase64Url(bytes) !== value) fail();
    return bytes;
}

/** @param {unknown} value */
function requireUuidV4(value) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail();
    return value;
}

/**
 * @param {unknown} value
 * @param {number} minimum
 * @param {number} maximum
 */
function requireSafeInteger(value, minimum, maximum) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) fail();
    return value;
}

/**
 * @param {unknown} value
 * @param {readonly string[]} fields
 * @returns {Record<string, unknown>}
 */
function exactObject(value, fields) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
    const record = /** @type {Record<string, unknown>} */ (value);
    if (Object.getPrototypeOf(record) !== Object.prototype
        || Object.keys(record).length !== fields.length
        || fields.some(field => !Object.hasOwn(record, field))) return fail();
    return record;
}

/**
 * Mirrors `functions/_lib/e2ee/jwk.ts`'s `parsePublicJwk`.
 *
 * @param {unknown} value
 * @param {Crypto} platformCrypto
 */
async function parsePublicJwk(value, platformCrypto) {
    const record = exactObject(value, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y']);
    if (record.crv !== 'P-256' || record.ext !== true || record.kty !== 'EC'
        || !Array.isArray(record.key_ops) || record.key_ops.length !== 0
        || typeof record.x !== 'string' || typeof record.y !== 'string') fail();
    decodeBase64Url(record.x, 32, 32);
    decodeBase64Url(record.y, 32, 32);
    /** @type {CanonicalPublicJwk} */
    const jwk = Object.freeze({
        crv: 'P-256', ext: true, key_ops: Object.freeze([]), kty: 'EC',
        x: /** @type {string} */ (record.x), y: /** @type {string} */ (record.y)
    });
    let key;
    try {
        key = await platformCrypto.subtle.importKey('jwk',
            { crv: jwk.crv, ext: jwk.ext, key_ops: [], kty: jwk.kty, x: jwk.x, y: jwk.y },
            { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    } catch {
        return fail();
    }
    const digest = await platformCrypto.subtle.digest('SHA-256', utf8(canonicalize(jwk)));
    return { jwk, key, fingerprint: encodeBase64Url(new Uint8Array(digest)) };
}

/**
 * Mirrors `functions/_lib/e2ee/primitives.ts`'s `workspaceAad`.
 *
 * @param {unknown} value
 * @returns {WorkspaceEnvelopeAad}
 */
function workspaceAad(value) {
    const item = exactObject(value, ['version', 'suite', 'workspaceId', 'targetUserId',
        'targetDeviceId', 'targetFingerprint', 'wrapperDeviceId', 'keyVersion']);
    if (item.version !== 1 || item.suite !== WORKSPACE_SUITE) fail();
    requireUuidV4(item.workspaceId);
    requireUuidV4(item.targetUserId);
    requireUuidV4(item.targetDeviceId);
    requireUuidV4(item.wrapperDeviceId);
    if (typeof item.targetFingerprint !== 'string') fail();
    decodeBase64Url(item.targetFingerprint, 32, 32);
    requireSafeInteger(item.keyVersion, 1, 2_147_483_647);
    return Object.freeze({
        version: /** @type {1} */ (1), suite: WORKSPACE_SUITE,
        workspaceId: /** @type {string} */ (item.workspaceId),
        targetUserId: /** @type {string} */ (item.targetUserId),
        targetDeviceId: /** @type {string} */ (item.targetDeviceId),
        targetFingerprint: /** @type {string} */ (item.targetFingerprint),
        wrapperDeviceId: /** @type {string} */ (item.wrapperDeviceId),
        keyVersion: /** @type {number} */ (item.keyVersion)
    });
}

/** @param {WorkspaceEnvelopeAad} aad */
function workspaceInfo(aad) {
    return utf8(canonicalize({
        purpose: 'docvault-workspace-dek-wrap', suite: WORKSPACE_SUITE, version: 1,
        workspaceId: aad.workspaceId, targetUserId: aad.targetUserId,
        targetDeviceId: aad.targetDeviceId, targetFingerprint: aad.targetFingerprint,
        wrapperDeviceId: aad.wrapperDeviceId, keyVersion: aad.keyVersion
    }));
}

/**
 * @param {Crypto} platformCrypto
 * @param {CryptoKey} privateKey
 * @param {CryptoKey} publicKey
 * @param {Uint8Array} salt
 * @param {WorkspaceEnvelopeAad} aad
 */
async function wrappingKey(platformCrypto, privateKey, publicKey, salt, aad) {
    // Workers' `SubtleCryptoDeriveKeyAlgorithm` type names this field `$public`;
    // the runtime API (and every browser's) takes `public`. Mirrors the same
    // cast `functions/_lib/e2ee/primitives.ts` uses for the same call.
    const algorithm = /** @type {*} */ ({ name: 'ECDH', public: publicKey });
    const shared = new Uint8Array(await platformCrypto.subtle.deriveBits(algorithm, privateKey, 256));
    let bits = null;
    try {
        const material = await platformCrypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
        bits = new Uint8Array(await platformCrypto.subtle.deriveBits(
            { name: 'HKDF', hash: 'SHA-256', salt, info: workspaceInfo(aad) }, material, 256));
        return await platformCrypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } finally {
        shared.fill(0);
        bits?.fill(0);
    }
}

/**
 * Wrap a 32-byte DEK to one device's public key.
 *
 * @param {{dek: Uint8Array, targetPublicJwk: unknown, aad: unknown,
 *          platformCrypto?: Crypto}} input
 * @returns {Promise<WorkspaceKeyEnvelope>}
 */
export async function wrapWorkspaceKey({ dek, targetPublicJwk, aad: aadInput, platformCrypto = crypto }) {
    if (!(dek instanceof Uint8Array) || dek.byteLength !== 32) fail();
    const aad = workspaceAad(aadInput);
    const target = await parsePublicJwk(targetPublicJwk, platformCrypto);
    if (target.fingerprint !== aad.targetFingerprint) fail('CRYPTO_BINDING_MISMATCH');

    const pair = /** @type {CryptoKeyPair} */ (await platformCrypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']));
    const exported = /** @type {JsonWebKey} */ (await platformCrypto.subtle.exportKey('jwk', pair.publicKey));
    const ephemeralPublicJwk = (await parsePublicJwk({
        crv: exported.crv, ext: exported.ext, key_ops: exported.key_ops ?? [],
        kty: exported.kty, x: exported.x, y: exported.y
    }, platformCrypto)).jwk;

    const salt = platformCrypto.getRandomValues(new Uint8Array(32));
    const nonce = platformCrypto.getRandomValues(new Uint8Array(12));
    const key = await wrappingKey(platformCrypto, pair.privateKey, target.key, salt, aad);
    const ciphertext = new Uint8Array(await platformCrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: utf8(canonicalize(aad)), tagLength: 128 },
        key, dek
    ));
    return Object.freeze({
        aad, ciphertext: encodeBase64Url(ciphertext), ephemeralPublicJwk,
        hkdfSalt: encodeBase64Url(salt), nonce: encodeBase64Url(nonce)
    });
}

/**
 * Seal the creator's own workspace key envelope (CF-P7-004's `keys` collaborator).
 *
 * The creator's device wraps the DEK to itself: `targetDeviceId`, `targetUserId`
 * and `targetFingerprint` all name the same device that generated the DEK, and
 * `wrapperDeviceId` names it again as the device performing the wrap. Nothing
 * here decides a role or a membership; that is the server's `POST /workspaces`.
 *
 * @param {{workspaceId: string, keyVersion: number, ownerDeviceId: string,
 *          ownerFingerprint: string, ownerUserId: string, ownerPublicJwk: unknown,
 *          platformCrypto?: Crypto}} input
 * @returns {Promise<{envelope: WorkspaceKeyEnvelope}>}
 */
export async function sealCreatorEnvelope({ workspaceId, keyVersion, ownerDeviceId,
    ownerFingerprint, ownerUserId, ownerPublicJwk, platformCrypto = crypto }) {
    if (!UUID_V4.test(ownerUserId ?? '')) fail();
    const dek = platformCrypto.getRandomValues(new Uint8Array(32));
    try {
        const envelope = await wrapWorkspaceKey({
            dek,
            targetPublicJwk: ownerPublicJwk,
            aad: {
                version: 1, suite: WORKSPACE_SUITE, workspaceId, targetUserId: ownerUserId,
                targetDeviceId: ownerDeviceId, targetFingerprint: ownerFingerprint,
                wrapperDeviceId: ownerDeviceId, keyVersion
            },
            platformCrypto
        });
        return Object.freeze({ envelope });
    } finally {
        dek.fill(0);
    }
}

export const WORKSPACE_KEY_SUITE = WORKSPACE_SUITE;
