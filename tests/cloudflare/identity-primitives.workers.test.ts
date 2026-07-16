import { describe, expect, it } from 'vitest';
import {
    createPkcePair,
    decodeBase64Url,
    decryptOAuthEnvelope,
    deriveCsrfToken,
    deriveIdentityKey,
    digestOAuthState,
    digestSessionToken,
    encodeBase64Url,
    encryptOAuthEnvelope,
    expireSessionCookie,
    generateOAuthState,
    generateOpaqueToken,
    IDENTITY_ENVIRONMENT_CONSTANTS,
    IDENTITY_KEY_LABELS,
    IdentityPrimitiveError,
    matchSessionTokenDigest,
    normalizeReturnPath,
    parseIdentityKeyring,
    readSessionCookie,
    resolveIdentityRuntime,
    serializeSessionCookie,
    verifyCsrfToken,
    type IdentityEnvironmentInput,
    type OAuthEnvelopeAad,
    type OAuthTransactionPayload,
    type RandomBytesSource
} from '../../functions/_lib/identity';

const bytes = (start: number, length = 32): Uint8Array =>
    Uint8Array.from({ length }, (_, index) => (start + index) % 256);
const key = (start: number): string => encodeBase64Url(bytes(start));
const KEYRING = JSON.stringify({
    version: 1,
    activeKeyId: 'active-1',
    keys: { 'active-1': key(1), 'previous-1': key(101) }
});
const ROTATED_KEYRING = JSON.stringify({
    version: 1,
    activeKeyId: 'next-1',
    keys: { 'next-1': key(201), 'active-1': key(1) }
});
const deterministic = (start: number): RandomBytesSource => ({
    bytes(length: number): Uint8Array {
        return bytes(start, length);
    }
});

const AAD: OAuthEnvelopeAad = Object.freeze({
    transactionId: '11111111-1111-4111-8111-111111111111',
    callbackOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin,
    callbackPath: '/api/v1/oauth/github/callback',
    createdAt: 1_800_000_000_000,
    expiresAt: 1_800_000_600_000
});
const PAYLOAD: OAuthTransactionPayload = Object.freeze({
    verifier: encodeBase64Url(bytes(50, 64)),
    purpose: 'sign_in',
    returnPath: '/dashboard?range=90d',
    initiatingSessionId: null,
    initiatingUserId: null
});

function previewEnvironment(overrides: Partial<IdentityEnvironmentInput> = {}): IdentityEnvironmentInput {
    return {
        APP_ENV: 'preview',
        IDENTITY_RUNTIME_MODE: 'preview-only',
        COLLABORATION_ENABLED: 'false',
        GITHUB_OAUTH_CLIENT_ID: 'synthetic-client-id',
        GITHUB_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
        OAUTH_TRANSACTION_KEY: KEYRING,
        SESSION_TOKEN_PEPPER: KEYRING,
        CSRF_TOKEN_KEY: ROTATED_KEYRING,
        RATE_LIMIT_KEY: KEYRING,
        ...overrides
    };
}

describe('CF-P3-002 strict keyrings and domain-separated Web Crypto', () => {
    it('parses one-active/one-previous keys and rejects malformed or ambiguous rings', () => {
        const ring = parseIdentityKeyring(KEYRING);
        expect(ring.activeKeyId).toBe('active-1');
        expect([...ring.keys]).toHaveLength(2);

        for (const invalid of [
            '{}',
            JSON.stringify({ version: 2, activeKeyId: 'active-1', keys: { 'active-1': key(1) } }),
            JSON.stringify({ version: 1, activeKeyId: 'absent', keys: { 'active-1': key(1) } }),
            JSON.stringify({ version: 1, activeKeyId: 'UPPER', keys: { UPPER: key(1) } }),
            JSON.stringify({ version: 1, activeKeyId: 'a', keys: { a: 'not-base64url' } }),
            JSON.stringify({ version: 1, activeKeyId: 'a', keys: { a: key(1), b: key(2), c: key(3) } }),
            JSON.stringify({ version: 1, activeKeyId: 'a', keys: { a: key(1) }, extra: true })
        ]) expect(() => parseIdentityKeyring(invalid)).toThrowError(IdentityPrimitiveError);
    });

    it('derives different fixed-size subkeys for every approved domain', async () => {
        const raw = bytes(1);
        const derived = await Promise.all(Object.values(IDENTITY_KEY_LABELS)
            .map(label => deriveIdentityKey(raw, label)));
        expect(derived.every(value => value.byteLength === 32)).toBe(true);
        expect(new Set(derived.map(encodeBase64Url)).size).toBe(derived.length);
        await expect(deriveIdentityKey(raw, 'docvault:unapproved:v1')).rejects
            .toThrowError(IdentityPrimitiveError);
    });
});

describe('CF-P3-002 OAuth, session, and CSRF tokens', () => {
    it('generates deterministic 256-bit state/session tokens and PKCE S256 vectors', async () => {
        expect(generateOAuthState(deterministic(0))).toBe('AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8');
        expect(generateOpaqueToken(32, deterministic(0))).toHaveLength(43);
        const pair = await createPkcePair(deterministic(0));
        expect(pair.verifier).toHaveLength(86);
        expect(pair.challenge).toBe('wsNdZaf3VpLTsEDmR5gPk2C6xYVWxKb0xcaG3O6kX10');
        expect(pair.method).toBe('S256');
    });

    it('stores digest-only values, supports previous-key lookup, and binds CSRF to one session', async () => {
        const session = generateOpaqueToken(32, deterministic(20));
        const current = parseIdentityKeyring(KEYRING);
        const rotated = parseIdentityKeyring(ROTATED_KEYRING);
        const sessionDigest = await digestSessionToken(current, session);
        expect(sessionDigest.digest).toHaveLength(32);
        expect(await matchSessionTokenDigest(rotated, session, sessionDigest.digest)).toBe('active-1');
        expect(await matchSessionTokenDigest(rotated, generateOpaqueToken(32, deterministic(21)),
            sessionDigest.digest)).toBeNull();

        const csrf = await deriveCsrfToken(current, session);
        expect(csrf).toHaveLength(43);
        expect(await verifyCsrfToken(current, session, csrf)).toBe(true);
        expect(await verifyCsrfToken(current, generateOpaqueToken(32, deterministic(22)), csrf)).toBe(false);
        const state = generateOAuthState(deterministic(40));
        expect((await digestOAuthState(current, state)).digest).toHaveLength(32);
    });
});

describe('CF-P3-002 versioned OAuth transaction envelope', () => {
    it('round-trips a deterministic AES-256-GCM envelope and rotates through an explicit previous key', async () => {
        const initial = parseIdentityKeyring(KEYRING);
        const encrypted = await encryptOAuthEnvelope(initial, PAYLOAD, AAD, deterministic(220));
        expect(encrypted[0]).toBe(1);
        expect(encrypted.byteLength).toBeLessThanOrEqual(4_096);
        expect(encodeBase64Url(encrypted)).toBe(
            'AQhhY3RpdmUtMdzd3t_g4eLj5OXm51ERa6DTKNpRwsHmvVz0PGm897G7VEvOQ02ShjqC9Wyko7xeAeLIMUMwTzbS-cVBIud0J4T_MxPAsIMxi3cMGG-8BtAeA9Y-r39-PLPmA87u_SuVq1Y0wekWbrwyU9-W_Bx5L1Z7hd72HebNbroaTcuRGHj7bIDWnWE2nmCikexBZGk6EOMiBppYfF1oaZ-76QncnmBO31WSg4_zZeb8WE0WnrIVw78YJgdubcZPute9eqBrvUcWsDJ7SX7TPGbA276RqqHZ2oeLcklpfY9H_yUUIcMORZf8U8D5H4UbbwZP'
        );
        await expect(decryptOAuthEnvelope(initial, encrypted, AAD)).resolves.toEqual(PAYLOAD);
        await expect(decryptOAuthEnvelope(parseIdentityKeyring(ROTATED_KEYRING), encrypted, AAD))
            .resolves.toEqual(PAYLOAD);
    });

    it('fails generically without plaintext on tamper, AAD substitution, unknown key, or malformed payload', async () => {
        const encrypted = await encryptOAuthEnvelope(parseIdentityKeyring(KEYRING), PAYLOAD, AAD, deterministic(220));
        const cases: Array<Promise<unknown>> = [];
        const tampered = encrypted.slice();
        tampered[tampered.length - 1] ^= 1;
        cases.push(decryptOAuthEnvelope(parseIdentityKeyring(KEYRING), tampered, AAD));
        cases.push(decryptOAuthEnvelope(parseIdentityKeyring(KEYRING), encrypted,
            { ...AAD, transactionId: '22222222-2222-4222-8222-222222222222' }));
        const unknown = encrypted.slice();
        unknown.set(new TextEncoder().encode('absent-1'), 2);
        cases.push(decryptOAuthEnvelope(parseIdentityKeyring(KEYRING), unknown, AAD));
        cases.push(encryptOAuthEnvelope(parseIdentityKeyring(KEYRING), {
            ...PAYLOAD, verifier: 'raw-verifier-canary'
        }, AAD, deterministic(220)));
        for (const attempt of cases) {
            await expect(attempt).rejects.toMatchObject({ message: 'IDENTITY_CRYPTO_INVALID' });
            await expect(attempt).rejects.not.toThrow('raw-verifier-canary');
        }
    });
});

describe('CF-P3-002 redirect, cookie, and environment boundaries', () => {
    it('normalizes safe same-origin return paths and rejects open redirects or auth material', () => {
        const origin = IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin;
        expect(normalizeReturnPath(undefined, origin)).toBe('/');
        expect(normalizeReturnPath('/docs/../dashboard?range=90d', origin)).toBe('/dashboard?range=90d');
        for (const invalid of [
            'https://evil.example/', '//evil.example/', '/\\evil', '/%5cevil', '/%255cevil',
            '/path#fragment', '/path?STATE=value', '/path?%2573tate=value', '/%0dheader', '/bad%'
        ]) expect(() => normalizeReturnPath(invalid, origin)).toThrowError(IdentityPrimitiveError);
    });

    it('serializes only host cookies and rejects malformed, duplicated, or oversized cookie input', () => {
        const token = generateOpaqueToken(32, deterministic(10));
        const name = '__Host-docvault-preview-session';
        const serialized = serializeSessionCookie(name, token, 1_900_000_000_000);
        expect(serialized).toBe(`${name}=${token}; Path=/; Expires=Sun, 17 Mar 2030 17:46:40 GMT; Secure; HttpOnly; SameSite=Lax`);
        expect(serialized).not.toContain('Domain=');
        expect(readSessionCookie(`other=x; ${name}=${token}`, name)).toBe(token);
        expect(readSessionCookie(`${name}=${token}; ${name}=${token}`, name)).toBeNull();
        expect(readSessionCookie(`${name}=malformed`, name)).toBeNull();
        expect(readSessionCookie('x'.repeat(8_193), name)).toBeNull();
        expect(expireSessionCookie(name)).toContain('Max-Age=0');
    });

    it('enables only an exact complete preview or harness configuration and never production', () => {
        const exact = resolveIdentityRuntime(previewEnvironment(), {
            requestOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin,
            hasCollaborationDatabase: true
        });
        expect(exact).toMatchObject({ enabled: true, mode: 'preview-only' });
        for (const [input, options] of [
            [previewEnvironment({ APP_ENV: 'production' }), { requestOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin, hasCollaborationDatabase: true }],
            [previewEnvironment({ OAUTH_TRANSACTION_KEY: undefined }), { requestOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin, hasCollaborationDatabase: true }],
            [previewEnvironment(), { requestOrigin: 'https://other-preview.example', hasCollaborationDatabase: true }],
            [previewEnvironment(), { requestOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin, hasCollaborationDatabase: false }]
        ] as const) expect(resolveIdentityRuntime(input, options)).toEqual({ enabled: false, mode: 'disabled' });

        const local = resolveIdentityRuntime({ ...previewEnvironment(), APP_ENV: 'local',
            IDENTITY_RUNTIME_MODE: 'local-test-only' }, {
            requestOrigin: 'http://localhost', hasCollaborationDatabase: true, allowLocalTestMode: true
        });
        expect(local.enabled).toBe(true);
        expect(resolveIdentityRuntime({ ...previewEnvironment(), APP_ENV: 'local',
            IDENTITY_RUNTIME_MODE: 'local-test-only' }, {
            requestOrigin: 'http://localhost', hasCollaborationDatabase: true
        }).enabled).toBe(false);
    });

    it('returns stable errors that never echo malformed secret or token canaries', () => {
        const canaries = [
            'raw-state-canary', 'pkce-verifier-canary', 'provider-token-canary',
            'session-token-canary', 'csrf-token-canary', 'secret-canary-do-not-echo'
        ];
        for (const [canary, operation] of canaries.map(value => [value,
            value === 'secret-canary-do-not-echo'
                ? () => parseIdentityKeyring(value)
                : value === 'provider-token-canary'
                    ? () => normalizeReturnPath(`/path?token=${value}`, IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin)
                    : () => decodeBase64Url(value, 32)] as const)) {
            try {
                operation();
                throw new Error('expected rejection');
            } catch (error) {
                expect(error).toBeInstanceOf(IdentityPrimitiveError);
                expect(String(error)).not.toContain(canary);
            }
        }
    });
});
