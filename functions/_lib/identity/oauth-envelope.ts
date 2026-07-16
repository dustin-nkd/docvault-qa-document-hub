import {
    concatBytes, decodeBase64Url, decodeUtf8, encodeBase64Url, IdentityPrimitiveError, uint32, utf8
} from './encoding';
import {
    deriveIdentityKey, generateOpaqueToken, IDENTITY_KEY_LABELS, type IdentityKeyring,
    type RandomBytesSource, PLATFORM_RANDOM, signWithKeyring
} from './crypto';
import { normalizeReturnPath } from './return-path';

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_ENVELOPE_BYTES = 4_096;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface OAuthTransactionPayload {
    readonly verifier: string;
    readonly purpose: 'sign_in' | 'reauthenticate';
    readonly returnPath: string;
    readonly initiatingSessionId: string | null;
    readonly initiatingUserId: string | null;
}

export interface OAuthEnvelopeAad {
    readonly transactionId: string;
    readonly callbackOrigin: string;
    readonly callbackPath: string;
    readonly createdAt: number;
    readonly expiresAt: number;
}

function validateAad(aad: OAuthEnvelopeAad): void {
    if (!UUID_V4.test(aad.transactionId) || !Number.isSafeInteger(aad.createdAt)
        || !Number.isSafeInteger(aad.expiresAt) || aad.createdAt < 0 || aad.expiresAt <= aad.createdAt
        || aad.expiresAt - aad.createdAt > 600_000 || aad.callbackPath !== '/api/v1/oauth/github/callback') {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    let callback: URL;
    try {
        callback = new URL(aad.callbackOrigin);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    if (callback.origin !== aad.callbackOrigin || callback.pathname !== '/' || callback.search || callback.hash) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
}

function validatePayload(payload: OAuthTransactionPayload, callbackOrigin: string): OAuthTransactionPayload {
    decodeBase64Url(payload.verifier, 64);
    if (payload.purpose !== 'sign_in' && payload.purpose !== 'reauthenticate') {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const session = payload.initiatingSessionId;
    const user = payload.initiatingUserId;
    if (payload.purpose === 'sign_in' ? session !== null || user !== null
        : session === null || user === null || !UUID_V4.test(session) || !UUID_V4.test(user)) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    return {
        verifier: payload.verifier,
        purpose: payload.purpose,
        returnPath: normalizeReturnPath(payload.returnPath, callbackOrigin),
        initiatingSessionId: session,
        initiatingUserId: user
    };
}

export function encodeOAuthEnvelopeAad(aad: OAuthEnvelopeAad): Uint8Array {
    validateAad(aad);
    const fields = [aad.transactionId, aad.callbackOrigin, aad.callbackPath,
        String(aad.createdAt), String(aad.expiresAt)].map(utf8);
    return concatBytes(Uint8Array.of(ENVELOPE_VERSION),
        ...fields.flatMap(field => [uint32(field.byteLength), field]));
}

async function aesKey(keyring: IdentityKeyring, keyId: string): Promise<CryptoKey> {
    const raw = keyring.keys.get(keyId);
    if (!raw) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    const derived = await deriveIdentityKey(raw, IDENTITY_KEY_LABELS.oauthEnvelope);
    return crypto.subtle.importKey('raw', derived, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptOAuthEnvelope(keyring: IdentityKeyring, payload: OAuthTransactionPayload,
    aad: OAuthEnvelopeAad, random: RandomBytesSource = PLATFORM_RANDOM): Promise<Uint8Array> {
    validateAad(aad);
    const exact = validatePayload(payload, aad.callbackOrigin);
    const plaintext = utf8(JSON.stringify({
        verifier: exact.verifier,
        purpose: exact.purpose,
        returnPath: exact.returnPath,
        initiatingSessionId: exact.initiatingSessionId,
        initiatingUserId: exact.initiatingUserId
    }));
    const keyId = utf8(keyring.activeKeyId);
    const iv = random.bytes(IV_BYTES);
    if (iv.byteLength !== IV_BYTES || keyId.byteLength < 1 || keyId.byteLength > 32) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt({
        name: 'AES-GCM', iv, additionalData: encodeOAuthEnvelopeAad(aad), tagLength: 128
    }, await aesKey(keyring, keyring.activeKeyId), plaintext));
    const envelope = concatBytes(Uint8Array.of(ENVELOPE_VERSION, keyId.byteLength), keyId, iv, ciphertext);
    if (envelope.byteLength > MAX_ENVELOPE_BYTES) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    return envelope;
}

export async function decryptOAuthEnvelope(keyring: IdentityKeyring, envelope: Uint8Array,
    aad: OAuthEnvelopeAad): Promise<OAuthTransactionPayload> {
    try {
        validateAad(aad);
        if (envelope.byteLength < 2 + 1 + IV_BYTES + TAG_BYTES || envelope.byteLength > MAX_ENVELOPE_BYTES
            || envelope[0] !== ENVELOPE_VERSION || envelope[1] < 1 || envelope[1] > 32) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const keyEnd = 2 + envelope[1];
        const ivEnd = keyEnd + IV_BYTES;
        if (envelope.byteLength < ivEnd + TAG_BYTES) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        const keyId = decodeUtf8(envelope.slice(2, keyEnd));
        if (!/^[a-z0-9_-]{1,32}$/.test(keyId)) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        const plaintext = await crypto.subtle.decrypt({
            name: 'AES-GCM', iv: envelope.slice(keyEnd, ivEnd),
            additionalData: encodeOAuthEnvelopeAad(aad), tagLength: 128
        }, await aesKey(keyring, keyId), envelope.slice(ivEnd));
        const serialized = decodeUtf8(plaintext);
        const parsed: unknown = JSON.parse(serialized);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const record = parsed as Record<string, unknown>;
        const fields = ['verifier', 'purpose', 'returnPath', 'initiatingSessionId', 'initiatingUserId'];
        if (Object.keys(record).length !== fields.length
            || Object.keys(record).some((field, index) => field !== fields[index])
            || typeof record.verifier !== 'string' || typeof record.purpose !== 'string'
            || typeof record.returnPath !== 'string'
            || !(record.initiatingSessionId === null || typeof record.initiatingSessionId === 'string')
            || !(record.initiatingUserId === null || typeof record.initiatingUserId === 'string')) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const payload = validatePayload({
            verifier: record.verifier,
            purpose: record.purpose as OAuthTransactionPayload['purpose'],
            returnPath: record.returnPath,
            initiatingSessionId: record.initiatingSessionId,
            initiatingUserId: record.initiatingUserId
        }, aad.callbackOrigin);
        if (serialized !== JSON.stringify(payload)) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        return payload;
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
}

export function generateOAuthState(random: RandomBytesSource = PLATFORM_RANDOM): string {
    return generateOpaqueToken(32, random);
}

export async function digestOAuthState(keyring: IdentityKeyring, state: string): Promise<{
    keyId: string; digest: Uint8Array;
}> {
    return signWithKeyring(keyring, IDENTITY_KEY_LABELS.oauthState, decodeBase64Url(state, 32));
}
