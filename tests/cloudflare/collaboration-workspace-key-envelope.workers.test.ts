// The browser bundle has no build step to compile functions/_lib/e2ee/primitives.ts
// through, so js/collaboration/workspace-key-envelope.js restates `wrapWorkspaceKey`
// in plain JS to seal a workspace's creator envelope (CF-P7-013's `keys` gap — see
// docs/collaboration-foundation/decision-log.md). A restatement is only as good as
// its agreement with the original: this proves the port's ciphertext, AAD, and
// canonical encodings are byte-for-byte what the server's own, already-reviewed
// `unwrapWorkspaceKey` accepts, by unwrapping a real port-sealed envelope with it.
import { describe, expect, it } from 'vitest';
import { unwrapWorkspaceKey, type WorkspaceEnvelopeAad } from '../../functions/_lib/e2ee';
// eslint-disable-next-line import/extensions
import { sealCreatorEnvelope } from '../../js/collaboration/workspace-key-envelope.js';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_DEVICE_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_USER_ID = '33333333-3333-4333-8333-333333333333';

async function ownDevice() {
    const pair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
    const publicJwk = {
        crv: exported.crv, ext: true, key_ops: [] as string[], kty: exported.kty,
        x: exported.x, y: exported.y
    };
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(
        `{"crv":${JSON.stringify(publicJwk.crv)},"ext":true,"key_ops":[],"kty":${JSON.stringify(publicJwk.kty)},`
        + `"x":${JSON.stringify(publicJwk.x)},"y":${JSON.stringify(publicJwk.y)}}`
    ));
    let binary = '';
    for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
    const fingerprint = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return { privateKey: pair.privateKey, publicJwk, fingerprint };
}

describe('CF-P7-013 workspace-key-envelope.js against the real unwrap', () => {
    it('a creator envelope this port seals is accepted by the server-side unwrap', async () => {
        const device = await ownDevice();
        const { envelope } = await sealCreatorEnvelope({
            workspaceId: WORKSPACE_ID, keyVersion: 1, ownerDeviceId: OWNER_DEVICE_ID,
            ownerFingerprint: device.fingerprint, ownerUserId: OWNER_USER_ID,
            ownerPublicJwk: device.publicJwk
        });

        const expectedAad: WorkspaceEnvelopeAad = {
            version: 1, suite: 'P256-HKDF-SHA256-A256GCM-v1', workspaceId: WORKSPACE_ID,
            targetUserId: OWNER_USER_ID, targetDeviceId: OWNER_DEVICE_ID,
            targetFingerprint: device.fingerprint, wrapperDeviceId: OWNER_DEVICE_ID, keyVersion: 1
        };
        const dek = await unwrapWorkspaceKey(envelope, device.privateKey, device.publicJwk, expectedAad);
        expect(dek.byteLength).toBe(32);
    });

    it('refuses to seal to a fingerprint that does not match the supplied public key', async () => {
        const device = await ownDevice();
        const other = await ownDevice();
        await expect(sealCreatorEnvelope({
            workspaceId: WORKSPACE_ID, keyVersion: 1, ownerDeviceId: OWNER_DEVICE_ID,
            ownerFingerprint: other.fingerprint, ownerUserId: OWNER_USER_ID,
            ownerPublicJwk: device.publicJwk
        })).rejects.toMatchObject({ code: 'CRYPTO_BINDING_MISMATCH' });
    });
});
