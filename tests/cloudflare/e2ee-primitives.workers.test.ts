import { describe, expect, it } from 'vitest';
import vectors from '../fixtures/cloudflare/phase-5-crypto-vectors.json';
import { canonicalize, decodeBase64Url, E2eePrimitiveError, encodeBase64Url,
    parsePublicJwk, protectDevicePrivateKey, requireSafeInteger, requireUuidV4,
    sha256, unlockDevicePrivateKey, unwrapWorkspaceKey, utf8, wrapWorkspaceKey,
    type DevicePrivateAad, type EphemeralKeySource, type RandomBytesSource,
    type WorkspaceEnvelopeAad } from '../../functions/_lib/e2ee';

const material = vectors.materials;
const fromB64 = (value: string): Uint8Array => decodeBase64Url(value);
const hex = (value: Uint8Array): string => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const queuedRandom = (...values: Uint8Array[]): RandomBytesSource => ({
    bytes(length: number): Uint8Array {
        const value = values.shift();
        if (!value || value.byteLength !== length) throw new Error('TEST_RANDOM_EXHAUSTED');
        return value;
    }
});

async function importPrivate(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}

async function fixedEphemeral(): Promise<EphemeralKeySource> {
    const privateKey = await importPrivate(material.ephemeralPrivateJwk as JsonWebKey);
    const publicKey = await crypto.subtle.importKey('jwk', material.ephemeralPublicJwk as JsonWebKey,
        { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    return { async create(): Promise<CryptoKeyPair> { return { privateKey, publicKey }; } };
}

describe('CF-P5-002 canonical encodings and P-256 public identity', () => {
    it('matches immutable JCS UTF-8 and SHA-256 reference bytes', async () => {
        const canonical = canonicalize(material.canonicalInput);
        expect(canonical).toBe(material.canonicalUtf8);
        expect(hex(utf8(canonical))).toBe(material.canonicalUtf8Hex);
        expect(hex(await sha256(utf8(canonical)))).toBe(material.canonicalSha256Hex);
    });

    it('enforces canonical unpadded base64url, UUIDv4, and bounded safe integers', () => {
        expect(encodeBase64Url(Uint8Array.of(0, 1, 2, 3))).toBe('AAECAw');
        expect([...decodeBase64Url('AAECAw', 4)]).toEqual([0, 1, 2, 3]);
        for (const operation of [() => decodeBase64Url('AAECAw=='),
            () => requireUuidV4('11111111-1111-1111-8111-111111111111'),
            () => requireSafeInteger(1.5, 1, 10)]) {
            expect(operation).toThrowError(E2eePrimitiveError);
        }
    });

    it('validates the exact on-curve public JWK and reference fingerprint', async () => {
        const parsed = await parsePublicJwk(material.devicePublicJwk);
        expect(parsed.fingerprint).toBe(material.deviceFingerprint);
        expect(parsed.jwk).toEqual(material.devicePublicJwk);
    });

    it('rejects private, unknown, malformed, and off-curve public JWKs', async () => {
        const zero = encodeBase64Url(new Uint8Array(32));
        for (const value of [{ ...material.devicePublicJwk, d: 'private' },
            { ...material.devicePublicJwk, kid: 'unknown' }, { ...material.devicePublicJwk, x: 'AA' },
            { ...material.devicePublicJwk, y: zero }]) {
            await expect(parsePublicJwk(value)).rejects.toMatchObject({ code: 'CRYPTO_FORMAT_INVALID' });
        }
    });
});

describe('CF-P5-002 encrypted local PKCS8 envelope', () => {
    it('matches the independent PBKDF2/AES-GCM KAT and unlocks non-extractable deriveBits only', async () => {
        const envelope = await protectDevicePrivateKey(fromB64(material.devicePkcs8), material.privateAad as DevicePrivateAad,
            utf8(material.unlockSecretUtf8), queuedRandom(fromB64(material.localSalt), fromB64(material.localNonce)));
        expect(envelope.ciphertext).toBe(material.localCiphertext);
        expect(envelope.salt).toBe(material.localSalt);
        expect(envelope.nonce).toBe(material.localNonce);
        const key = await unlockDevicePrivateKey(envelope, utf8(material.unlockSecretUtf8));
        expect(key.extractable).toBe(false);
        expect(key.usages).toEqual(['deriveBits']);
    });

    it('fails closed for wrong secret, AAD substitution, tamper, and KDF downgrade', async () => {
        const envelope = { aad: material.privateAad, ciphertext: material.localCiphertext,
            salt: material.localSalt, nonce: material.localNonce };
        await expect(unlockDevicePrivateKey(envelope, utf8('synthetic-wrong-unlock-secret')))
            .rejects.toMatchObject({ code: 'LOCAL_UNLOCK_FAILED' });
        await expect(unlockDevicePrivateKey({ ...envelope, aad: { ...envelope.aad,
            deviceId: '77777777-7777-4777-8777-777777777777' } }, utf8(material.unlockSecretUtf8)))
            .rejects.toMatchObject({ code: 'LOCAL_UNLOCK_FAILED' });
        await expect(unlockDevicePrivateKey({ ...envelope, ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}` },
            utf8(material.unlockSecretUtf8))).rejects.toBeInstanceOf(E2eePrimitiveError);
        await expect(unlockDevicePrivateKey({ ...envelope, aad: { ...envelope.aad, kdfIterations: 599999 } },
            utf8(material.unlockSecretUtf8))).rejects.toMatchObject({ code: 'CRYPTO_FORMAT_INVALID' });
    });
});

describe('CF-P5-002 workspace DEK wrapping', () => {
    it('matches the independent ECDH/HKDF/AES-GCM KAT and unwraps exactly 32 bytes', async () => {
        const envelope = await wrapWorkspaceKey(fromB64(material.workspaceDek), material.targetPublicJwk,
            material.workspaceAad as WorkspaceEnvelopeAad,
            queuedRandom(fromB64(material.workspaceSalt), fromB64(material.workspaceNonce)), await fixedEphemeral());
        expect(envelope.ephemeralPublicJwk).toEqual(material.ephemeralPublicJwk);
        expect(envelope.ciphertext).toBe(material.workspaceCiphertext);
        const targetPrivate = await importPrivate(material.targetPrivateJwk as JsonWebKey);
        expect(encodeBase64Url(await unwrapWorkspaceKey(envelope, targetPrivate, material.targetPublicJwk,
            material.workspaceAad as WorkspaceEnvelopeAad))).toBe(material.workspaceDek);
    });

    it('uses the production CSPRNG and a non-extractable generated ephemeral private key', async () => {
        const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false,
            ['deriveBits']) as CryptoKeyPair;
        const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
        const publicJwk = { crv: exported.crv, ext: exported.ext, key_ops: exported.key_ops,
            kty: exported.kty, x: exported.x, y: exported.y };
        const parsed = await parsePublicJwk(publicJwk);
        const aad = { ...material.workspaceAad, targetFingerprint: parsed.fingerprint } as WorkspaceEnvelopeAad;
        const envelope = await wrapWorkspaceKey(fromB64(material.workspaceDek), publicJwk, aad);
        expect(envelope.ephemeralPublicJwk).not.toEqual(material.ephemeralPublicJwk);
        expect(encodeBase64Url(await unwrapWorkspaceKey(envelope, pair.privateKey, publicJwk, aad)))
            .toBe(material.workspaceDek);
    });

    it('rejects target fingerprint substitution before wrapping', async () => {
        await expect(wrapWorkspaceKey(fromB64(material.workspaceDek), material.targetPublicJwk,
            { ...material.workspaceAad, targetFingerprint: material.deviceFingerprint } as WorkspaceEnvelopeAad,
            queuedRandom(fromB64(material.workspaceSalt), fromB64(material.workspaceNonce)), await fixedEphemeral()))
            .rejects.toMatchObject({ code: 'CRYPTO_BINDING_MISMATCH' });
    });

    it('rejects every expected AAD binding substitution and authentication tag tamper', async () => {
        const envelope = { aad: material.workspaceAad, ciphertext: material.workspaceCiphertext,
            ephemeralPublicJwk: material.ephemeralPublicJwk, hkdfSalt: material.workspaceSalt,
            nonce: material.workspaceNonce };
        const targetPrivate = await importPrivate(material.targetPrivateJwk as JsonWebKey);
        for (const changed of [
            { workspaceId: '77777777-7777-4777-8777-777777777777' },
            { targetDeviceId: '77777777-7777-4777-8777-777777777777' },
            { wrapperDeviceId: '77777777-7777-4777-8777-777777777777' }, { keyVersion: 2 }
        ]) {
            await expect(unwrapWorkspaceKey(envelope, targetPrivate, material.targetPublicJwk,
                { ...material.workspaceAad, ...changed } as WorkspaceEnvelopeAad))
                .rejects.toMatchObject({ code: 'CRYPTO_BINDING_MISMATCH' });
        }
        const changed = `${envelope.ciphertext.slice(0, -1)}${envelope.ciphertext.endsWith('A') ? 'B' : 'A'}`;
        await expect(unwrapWorkspaceKey({ ...envelope, ciphertext: changed }, targetPrivate,
            material.targetPublicJwk, material.workspaceAad as WorkspaceEnvelopeAad))
            .rejects.toMatchObject({ code: 'CRYPTO_AUTH_FAILED' });
    });
});
