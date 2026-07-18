import { canonicalize, decodeBase64Url, encodeBase64Url, exactObject, requireSafeInteger,
    requireUuidV4, type JsonValue, utf8 } from './canonical';
import { E2eePrimitiveError, formatError } from './errors';
import { parsePublicJwk, type CanonicalPublicJwk } from './jwk';

export const E2EE = Object.freeze({
    privateKdf: 'PBKDF2-HMAC-SHA256-v1', privateSuite: 'A256GCM-v1', iterations: 600_000,
    workspaceSuite: 'P256-HKDF-SHA256-A256GCM-v1', curve: 'P-256', version: 1
} as const);

export interface RandomBytesSource { bytes(length: number): Uint8Array; }
export interface EphemeralKeySource { create(): Promise<CryptoKeyPair>; }

export const PLATFORM_RANDOM: RandomBytesSource = Object.freeze({
    bytes(length: number): Uint8Array {
        if (!Number.isInteger(length) || length < 1 || length > 65_536) formatError();
        return crypto.getRandomValues(new Uint8Array(length));
    }
});

export const PLATFORM_EPHEMERAL: EphemeralKeySource = Object.freeze({
    async create(): Promise<CryptoKeyPair> {
        return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as Promise<CryptoKeyPair>;
    }
});

export interface DevicePrivateAad {
    readonly version: 1; readonly kdf: 'PBKDF2-HMAC-SHA256-v1'; readonly kdfIterations: 600000;
    readonly suite: 'A256GCM-v1'; readonly curve: 'P-256'; readonly userId: string;
    readonly deviceId: string; readonly fingerprint: string;
}
export interface DevicePrivateEnvelope {
    readonly aad: DevicePrivateAad; readonly ciphertext: string; readonly nonce: string; readonly salt: string;
}

function privateAad(value: unknown): DevicePrivateAad {
    const item = exactObject(value, ['version', 'kdf', 'kdfIterations', 'suite', 'curve', 'userId', 'deviceId', 'fingerprint']);
    if (item.version !== 1 || item.kdf !== E2EE.privateKdf || item.kdfIterations !== E2EE.iterations
        || item.suite !== E2EE.privateSuite || item.curve !== E2EE.curve || typeof item.fingerprint !== 'string') {
        throw new E2eePrimitiveError(item.kdf !== E2EE.privateKdf || item.suite !== E2EE.privateSuite
            ? 'CRYPTO_SUITE_UNSUPPORTED' : 'CRYPTO_FORMAT_INVALID');
    }
    requireUuidV4(item.userId); requireUuidV4(item.deviceId); decodeBase64Url(item.fingerprint, 32, 32);
    return Object.freeze({ version: 1, kdf: E2EE.privateKdf, kdfIterations: E2EE.iterations,
        suite: E2EE.privateSuite, curve: E2EE.curve, userId: item.userId as string,
        deviceId: item.deviceId as string, fingerprint: item.fingerprint });
}

async function deriveKek(secret: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
    if (secret.byteLength < 16 || secret.byteLength > 1_024 || salt.byteLength < 16 || salt.byteLength > 32) formatError();
    const material = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt,
        iterations: E2EE.iterations }, material, 256));
    try {
        return await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } finally {
        bits.fill(0);
    }
}

export async function protectDevicePrivateKey(pkcs8: Uint8Array, aadInput: DevicePrivateAad,
    unlockSecret: Uint8Array, random: RandomBytesSource = PLATFORM_RANDOM): Promise<DevicePrivateEnvelope> {
    if (pkcs8.byteLength < 1 || pkcs8.byteLength > 512) formatError();
    const aad = privateAad(aadInput);
    const salt = random.bytes(16); const nonce = random.bytes(12);
    if (salt.byteLength !== 16 || nonce.byteLength !== 12) formatError();
    const key = await deriveKek(unlockSecret, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
        additionalData: utf8(canonicalize(aad as unknown as JsonValue)), tagLength: 128 }, key, pkcs8);
    return Object.freeze({ aad, ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
        nonce: encodeBase64Url(nonce), salt: encodeBase64Url(salt) });
}

export async function unlockDevicePrivateKey(value: unknown, unlockSecret: Uint8Array): Promise<CryptoKey> {
    try {
        const item = exactObject(value, ['aad', 'ciphertext', 'nonce', 'salt']);
        const aad = privateAad(item.aad); const nonce = decodeBase64Url(String(item.nonce), 12, 12);
        const salt = decodeBase64Url(String(item.salt), undefined, 32);
        if (salt.byteLength < 16) formatError();
        const ciphertext = decodeBase64Url(String(item.ciphertext), undefined, 528);
        if (ciphertext.byteLength < 17) formatError();
        const key = await deriveKek(unlockSecret, salt);
        const pkcs8 = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce,
            additionalData: utf8(canonicalize(aad as unknown as JsonValue)), tagLength: 128 }, key, ciphertext));
        if (pkcs8.byteLength < 1 || pkcs8.byteLength > 512) formatError();
        try {
            return await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
        } finally {
            pkcs8.fill(0);
        }
    } catch (error) {
        if (error instanceof E2eePrimitiveError && ['CRYPTO_FORMAT_INVALID', 'CRYPTO_SUITE_UNSUPPORTED'].includes(error.code)) throw error;
        throw new E2eePrimitiveError('LOCAL_UNLOCK_FAILED');
    }
}

export interface WorkspaceEnvelopeAad {
    readonly version: 1; readonly suite: 'P256-HKDF-SHA256-A256GCM-v1'; readonly workspaceId: string;
    readonly targetUserId: string; readonly targetDeviceId: string; readonly targetFingerprint: string;
    readonly wrapperDeviceId: string; readonly keyVersion: number;
}
export interface WorkspaceKeyEnvelope {
    readonly aad: WorkspaceEnvelopeAad; readonly ciphertext: string; readonly ephemeralPublicJwk: CanonicalPublicJwk;
    readonly hkdfSalt: string; readonly nonce: string;
}

function workspaceAad(value: unknown): WorkspaceEnvelopeAad {
    const item = exactObject(value, ['version', 'suite', 'workspaceId', 'targetUserId', 'targetDeviceId', 'targetFingerprint', 'wrapperDeviceId', 'keyVersion']);
    if (item.version !== 1 || item.suite !== E2EE.workspaceSuite) {
        throw new E2eePrimitiveError(item.suite !== E2EE.workspaceSuite ? 'CRYPTO_SUITE_UNSUPPORTED' : 'CRYPTO_FORMAT_INVALID');
    }
    for (const field of ['workspaceId', 'targetUserId', 'targetDeviceId', 'wrapperDeviceId'] as const) requireUuidV4(item[field]);
    if (typeof item.targetFingerprint !== 'string') formatError();
    decodeBase64Url(item.targetFingerprint, 32, 32); requireSafeInteger(item.keyVersion, 1, 2_147_483_647);
    return Object.freeze({ version: 1, suite: E2EE.workspaceSuite, workspaceId: item.workspaceId as string,
        targetUserId: item.targetUserId as string, targetDeviceId: item.targetDeviceId as string,
        targetFingerprint: item.targetFingerprint, wrapperDeviceId: item.wrapperDeviceId as string,
        keyVersion: item.keyVersion as number });
}

function workspaceInfo(aad: WorkspaceEnvelopeAad): Uint8Array {
    return utf8(canonicalize({ purpose: 'docvault-workspace-dek-wrap', suite: E2EE.workspaceSuite,
        version: 1, workspaceId: aad.workspaceId, targetUserId: aad.targetUserId,
        targetDeviceId: aad.targetDeviceId, targetFingerprint: aad.targetFingerprint,
        wrapperDeviceId: aad.wrapperDeviceId, keyVersion: aad.keyVersion }));
}

async function wrappingKey(privateKey: CryptoKey, publicKey: CryptoKey, salt: Uint8Array,
    aad: WorkspaceEnvelopeAad): Promise<CryptoKey> {
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
        privateKey, 256));
    let bits: Uint8Array | null = null;
    try {
        const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
        bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt,
            info: workspaceInfo(aad) }, material, 256));
        return await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
    } finally {
        shared.fill(0); bits?.fill(0);
    }
}

export async function wrapWorkspaceKey(dek: Uint8Array, targetPublicJwk: unknown, aadInput: WorkspaceEnvelopeAad,
    random: RandomBytesSource = PLATFORM_RANDOM, ephemeral: EphemeralKeySource = PLATFORM_EPHEMERAL): Promise<WorkspaceKeyEnvelope> {
    if (dek.byteLength !== 32) formatError();
    const aad = workspaceAad(aadInput); const target = await parsePublicJwk(targetPublicJwk);
    if (target.fingerprint !== aad.targetFingerprint) throw new E2eePrimitiveError('CRYPTO_BINDING_MISMATCH');
    const pair = await ephemeral.create();
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    const ephemeralPublicJwk = (await parsePublicJwk({ crv: exported.crv, ext: exported.ext,
        key_ops: exported.key_ops, kty: exported.kty, x: exported.x, y: exported.y })).jwk;
    const salt = random.bytes(32); const nonce = random.bytes(12);
    if (salt.byteLength !== 32 || nonce.byteLength !== 12) formatError();
    const key = await wrappingKey(pair.privateKey, target.key, salt, aad);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce,
        additionalData: utf8(canonicalize(aad as unknown as JsonValue)), tagLength: 128 }, key, dek);
    return Object.freeze({ aad, ciphertext: encodeBase64Url(new Uint8Array(ciphertext)), ephemeralPublicJwk,
        hkdfSalt: encodeBase64Url(salt), nonce: encodeBase64Url(nonce) });
}

export async function unwrapWorkspaceKey(value: unknown, targetPrivateKey: CryptoKey,
    targetPublicJwk: unknown, expectedAad: WorkspaceEnvelopeAad): Promise<Uint8Array> {
    try {
        const item = exactObject(value, ['aad', 'ciphertext', 'ephemeralPublicJwk', 'hkdfSalt', 'nonce']);
        const aad = workspaceAad(item.aad); const expected = workspaceAad(expectedAad);
        if (canonicalize(aad as unknown as JsonValue) !== canonicalize(expected as unknown as JsonValue)) {
            throw new E2eePrimitiveError('CRYPTO_BINDING_MISMATCH');
        }
        const target = await parsePublicJwk(targetPublicJwk);
        if (target.fingerprint !== aad.targetFingerprint) throw new E2eePrimitiveError('CRYPTO_BINDING_MISMATCH');
        const peer = await parsePublicJwk(item.ephemeralPublicJwk);
        const salt = decodeBase64Url(String(item.hkdfSalt), 32, 32);
        const nonce = decodeBase64Url(String(item.nonce), 12, 12);
        const ciphertext = decodeBase64Url(String(item.ciphertext), 48, 48);
        const key = await wrappingKey(targetPrivateKey, peer.key, salt, aad);
        const dek = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce,
            additionalData: utf8(canonicalize(aad as unknown as JsonValue)), tagLength: 128 }, key, ciphertext));
        if (dek.byteLength !== 32) formatError();
        return dek;
    } catch (error) {
        if (error instanceof E2eePrimitiveError) throw error;
        throw new E2eePrimitiveError('CRYPTO_AUTH_FAILED');
    }
}
