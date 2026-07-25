import { describe, expect, it } from 'vitest';
import {
    DOCUMENT_OPERATIONS,
    FINGERPRINT_INPUT_ORDER,
    FingerprintError,
    canonicalFingerprintPreimage,
    computeRequestFingerprint,
    type FingerprintInput
} from '../../functions/_lib/documents/request-fingerprint';
import vectors from '../fixtures/cloudflare/phase-6-document-vectors.json';

const F = vectors.fingerprint;

function fromBase64Url(value: string): Uint8Array {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

const baseInput = (): FingerprintInput => ({
    actorUserId: F.actorUserId,
    actorDeviceId: F.actorDeviceId,
    workspaceId: F.workspaceId,
    operation: 'update',
    documentId: F.documentId,
    baseRevision: F.baseRevision,
    keyVersion: F.keyVersion,
    envelopeVersion: F.envelopeVersion,
    ciphertextDigest: fromBase64Url(F.ciphertextDigestBase64Url),
    ciphertextBytes: F.ciphertextBytes
});

const codeOf = (run: () => unknown): string | null => {
    try { run(); return null; } catch (error) {
        expect(error).toBeInstanceOf(FingerprintError);
        return (error as FingerprintError).code;
    }
};

describe('CF-P6-003 canonical request fingerprint', () => {
    it('freezes the ten inputs in the CF-P6-001 order', () => {
        expect([...FINGERPRINT_INPUT_ORDER]).toEqual([
            'actorUserId', 'actorDeviceId', 'workspaceId', 'operation', 'documentId',
            'baseRevision', 'keyVersion', 'envelopeVersion', 'ciphertextDigest', 'ciphertextBytes'
        ]);
        expect([...DOCUMENT_OPERATIONS]).toEqual(['create', 'update', 'delete']);
    });

    it('reproduces the frozen CF-VEC-P6-FPR-001 preimage and digest', async () => {
        expect(canonicalFingerprintPreimage(baseInput())).toBe(F.canonicalPreimage);
        expect(toHex(await computeRequestFingerprint(baseInput()))).toBe(F.fingerprintHex);
    });

    it('returns exactly 32 bytes', async () => {
        expect((await computeRequestFingerprint(baseInput())).length).toBe(32);
    });

    it('never places plaintext or full ciphertext in the preimage', () => {
        const preimage = canonicalFingerprintPreimage(baseInput());
        expect(preimage).not.toContain(vectors.envelope.plaintextUtf8);
        expect(preimage).not.toContain(vectors.envelope.envelopeBase64Url);
        expect(preimage).toContain(F.ciphertextDigestBase64Url);
    });

    it('changes the digest when any single input changes', async () => {
        const base = toHex(await computeRequestFingerprint(baseInput()));
        const mutations: Partial<FingerprintInput>[] = [
            { actorUserId: '99999999-9999-4999-8999-999999999999' },
            { actorDeviceId: '99999999-9999-4999-8999-999999999999' },
            { workspaceId: '99999999-9999-4999-8999-999999999999' },
            { operation: 'delete' },
            { documentId: '99999999-9999-4999-8999-999999999999' },
            { baseRevision: F.baseRevision + 1 },
            { keyVersion: F.keyVersion + 1 },
            { ciphertextBytes: F.ciphertextBytes + 1 }
        ];
        const seen = new Set([base]);
        for (const mutation of mutations) {
            const digest = toHex(await computeRequestFingerprint({ ...baseInput(), ...mutation }));
            expect(seen.has(digest)).toBe(false);
            seen.add(digest);
        }
    });

    it('changes the digest when the ciphertext digest changes but the byte count does not', async () => {
        const other = fromBase64Url(F.ciphertextDigestBase64Url);
        other[0] ^= 0xff;
        const digest = toHex(await computeRequestFingerprint({ ...baseInput(), ciphertextDigest: other }));
        expect(digest).not.toBe(F.fingerprintHex);
    });

    it('enforces the create precondition exactly', () => {
        expect(codeOf(() => canonicalFingerprintPreimage({
            ...baseInput(), operation: 'create', baseRevision: 1
        }))).toBe('INVALID_CREATE_PRECONDITION');
        expect(codeOf(() => canonicalFingerprintPreimage({
            ...baseInput(), operation: 'update', baseRevision: 0
        }))).toBe('INVALID_UPDATE_PRECONDITION');
        expect(canonicalFingerprintPreimage({
            ...baseInput(), operation: 'create', baseRevision: 0
        })).toContain('"create"');
    });

    it('rejects malformed identifiers, versions, and bounds', () => {
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), actorUserId: 'x' }))).toBe('INVALID_ACTOR');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), actorDeviceId: 'x' }))).toBe('INVALID_DEVICE');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), workspaceId: 'x' }))).toBe('INVALID_WORKSPACE');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), documentId: 'x' }))).toBe('INVALID_DOCUMENT');
        expect(codeOf(() => canonicalFingerprintPreimage({
            ...baseInput(), operation: 'purge' as unknown as 'update'
        }))).toBe('INVALID_OPERATION');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), keyVersion: 0 }))).toBe('INVALID_KEY_VERSION');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), envelopeVersion: 2 })))
            .toBe('INVALID_ENVELOPE_VERSION');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), ciphertextBytes: 17 })))
            .toBe('INVALID_CIPHERTEXT_BYTES');
        expect(codeOf(() => canonicalFingerprintPreimage({ ...baseInput(), ciphertextBytes: 1_048_001 })))
            .toBe('INVALID_CIPHERTEXT_BYTES');
        expect(codeOf(() => canonicalFingerprintPreimage({
            ...baseInput(), ciphertextDigest: new Uint8Array(16)
        }))).toBe('INVALID_CIPHERTEXT_DIGEST');
    });
});
