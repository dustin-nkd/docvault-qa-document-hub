import { decodeBase64Url, encodeBase64Url, IdentityPrimitiveError, utf8 } from './encoding';

const KEY_ID_PATTERN = /^[a-z0-9_-]{1,32}$/;
const KEYRING_FIELDS = new Set(['version', 'activeKeyId', 'keys']);
const DERIVATION_SALT_CONTEXT = 'docvault:key-derivation-salt:v1';

export const IDENTITY_KEY_LABELS = Object.freeze({
    oauthState: 'docvault:oauth-state-hmac:v1',
    oauthEnvelope: 'docvault:oauth-envelope-aead:v1',
    sessionToken: 'docvault:session-token-hmac:v1',
    csrfToken: 'docvault:csrf-token-hmac:v1',
    rateLimit: 'docvault:rate-limit-hmac:v1'
} as const);

export interface IdentityKeyring {
    readonly version: 1;
    readonly activeKeyId: string;
    readonly keys: ReadonlyMap<string, Uint8Array>;
}

export interface RandomBytesSource {
    bytes(length: number): Uint8Array;
}

export const PLATFORM_RANDOM: RandomBytesSource = Object.freeze({
    bytes(length: number): Uint8Array {
        if (!Number.isInteger(length) || length < 1 || length > 65_536) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        return crypto.getRandomValues(new Uint8Array(length));
    }
});

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

export function parseIdentityKeyring(serialized: string): IdentityKeyring {
    let parsed: unknown;
    try {
        parsed = JSON.parse(serialized);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    if (!isRecord(parsed) || Object.keys(parsed).some(field => !KEYRING_FIELDS.has(field))
        || Object.keys(parsed).length !== KEYRING_FIELDS.size || parsed.version !== 1
        || typeof parsed.activeKeyId !== 'string' || !KEY_ID_PATTERN.test(parsed.activeKeyId)
        || !isRecord(parsed.keys)) {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    const entries = Object.entries(parsed.keys);
    if (entries.length < 1 || entries.length > 2 || !Object.hasOwn(parsed.keys, parsed.activeKeyId)) {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    const keys = new Map<string, Uint8Array>();
    try {
        for (const [keyId, value] of entries) {
            if (!KEY_ID_PATTERN.test(keyId) || typeof value !== 'string' || value.length !== 43) {
                throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
            }
            keys.set(keyId, decodeBase64Url(value, 32));
        }
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    return Object.freeze({ version: 1, activeKeyId: parsed.activeKeyId, keys });
}

async function derivationSalt(): Promise<ArrayBuffer> {
    return crypto.subtle.digest('SHA-256', utf8(DERIVATION_SALT_CONTEXT));
}

export async function deriveIdentityKey(rawKey: Uint8Array, label: string): Promise<Uint8Array> {
    if (!Object.values(IDENTITY_KEY_LABELS).includes(label as typeof IDENTITY_KEY_LABELS[keyof typeof IDENTITY_KEY_LABELS])) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const material = await crypto.subtle.importKey('raw', rawKey, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'HKDF', hash: 'SHA-256', salt: await derivationSalt(), info: utf8(label)
    }, material, 256);
    return new Uint8Array(bits);
}

export async function hmacSign(rawKey: Uint8Array, value: BufferSource): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, value));
}

export async function hmacVerify(rawKey: Uint8Array, value: BufferSource, signature: Uint8Array): Promise<boolean> {
    if (signature.byteLength !== 32) return false;
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, signature, value);
}

export async function signWithKeyring(keyring: IdentityKeyring, label: string, value: BufferSource): Promise<{
    keyId: string; digest: Uint8Array;
}> {
    const rawKey = keyring.keys.get(keyring.activeKeyId);
    if (!rawKey) throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    return {
        keyId: keyring.activeKeyId,
        digest: await hmacSign(await deriveIdentityKey(rawKey, label), value)
    };
}

export async function matchKeyringDigest(keyring: IdentityKeyring, label: string, value: BufferSource,
    digest: Uint8Array): Promise<string | null> {
    for (const [keyId, rawKey] of keyring.keys) {
        if (await hmacVerify(await deriveIdentityKey(rawKey, label), value, digest)) return keyId;
    }
    return null;
}

export function generateOpaqueToken(byteLength = 32, random: RandomBytesSource = PLATFORM_RANDOM): string {
    const bytes = random.bytes(byteLength);
    if (bytes.byteLength !== byteLength) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    return encodeBase64Url(bytes);
}

export async function createPkcePair(random: RandomBytesSource = PLATFORM_RANDOM): Promise<{
    verifier: string; challenge: string; method: 'S256';
}> {
    const verifier = generateOpaqueToken(64, random);
    const digest = await crypto.subtle.digest('SHA-256', utf8(verifier));
    return { verifier, challenge: encodeBase64Url(new Uint8Array(digest)), method: 'S256' };
}

export async function digestSessionToken(keyring: IdentityKeyring, token: string): Promise<{
    keyId: string; digest: Uint8Array;
}> {
    return signWithKeyring(keyring, IDENTITY_KEY_LABELS.sessionToken, decodeBase64Url(token, 32));
}

export async function matchSessionTokenDigest(keyring: IdentityKeyring, token: string,
    digest: Uint8Array): Promise<string | null> {
    return matchKeyringDigest(keyring, IDENTITY_KEY_LABELS.sessionToken, decodeBase64Url(token, 32), digest);
}

export async function deriveCsrfToken(keyring: IdentityKeyring, sessionToken: string): Promise<string> {
    const { digest } = await signWithKeyring(keyring, IDENTITY_KEY_LABELS.csrfToken,
        decodeBase64Url(sessionToken, 32));
    return encodeBase64Url(digest);
}

export async function verifyCsrfToken(keyring: IdentityKeyring, sessionToken: string,
    csrfToken: string): Promise<boolean> {
    const signature = decodeBase64Url(csrfToken, 32);
    return (await matchKeyringDigest(keyring, IDENTITY_KEY_LABELS.csrfToken,
        decodeBase64Url(sessionToken, 32), signature)) !== null;
}
