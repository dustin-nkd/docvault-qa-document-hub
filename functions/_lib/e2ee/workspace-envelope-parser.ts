import { decodeBase64Url, requireSafeInteger, requireUuidV4 } from './canonical';
import { E2eePrimitiveError } from './errors';
import { parsePublicJwk } from './jwk';
import { E2EE, type WorkspaceEnvelopeAad, type WorkspaceKeyEnvelope } from './primitives';

function record(value: unknown): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
    }
    return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) {
        throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
    }
}

export async function parseWorkspaceKeyEnvelope(value: unknown): Promise<WorkspaceKeyEnvelope> {
    const item = record(value);
    exactKeys(item, ['aad', 'ciphertext', 'ephemeralPublicJwk', 'hkdfSalt', 'nonce']);
    const sourceAad = record(item.aad);
    exactKeys(sourceAad, ['version', 'suite', 'workspaceId', 'targetUserId', 'targetDeviceId',
        'targetFingerprint', 'wrapperDeviceId', 'keyVersion']);
    if (sourceAad.version !== 1 || sourceAad.suite !== E2EE.workspaceSuite
        || typeof sourceAad.targetFingerprint !== 'string') {
        throw new E2eePrimitiveError(sourceAad.suite !== E2EE.workspaceSuite
            ? 'CRYPTO_SUITE_UNSUPPORTED' : 'CRYPTO_FORMAT_INVALID');
    }
    const aad: WorkspaceEnvelopeAad = Object.freeze({
        version: 1,
        suite: E2EE.workspaceSuite,
        workspaceId: requireUuidV4(sourceAad.workspaceId),
        targetUserId: requireUuidV4(sourceAad.targetUserId),
        targetDeviceId: requireUuidV4(sourceAad.targetDeviceId),
        targetFingerprint: sourceAad.targetFingerprint,
        wrapperDeviceId: requireUuidV4(sourceAad.wrapperDeviceId),
        keyVersion: requireSafeInteger(sourceAad.keyVersion, 1, 2_147_483_647)
    });
    if (typeof item.ciphertext !== 'string' || typeof item.hkdfSalt !== 'string'
        || typeof item.nonce !== 'string') throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
    decodeBase64Url(aad.targetFingerprint, 32, 32);
    decodeBase64Url(item.ciphertext, 48, 48);
    decodeBase64Url(item.hkdfSalt, 32, 32);
    decodeBase64Url(item.nonce, 12, 12);
    return Object.freeze({
        aad,
        ciphertext: item.ciphertext,
        ephemeralPublicJwk: (await parsePublicJwk(item.ephemeralPublicJwk)).jwk,
        hkdfSalt: item.hkdfSalt,
        nonce: item.nonce
    });
}
