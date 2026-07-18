import { decodeBase64Url, encodeBase64Url, utf8 } from '../identity/encoding';
import { PLATFORM_RANDOM, type RandomBytesSource } from '../identity/crypto';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOKEN_CONTEXT = 'docvault:invitation-token:v1:';

export interface InvitationTokenMaterial {
    readonly token: string;
    readonly invitationId: string;
    readonly digest: Uint8Array;
}

export class InvitationTokenError extends Error {
    readonly code = 'INVITATION_TOKEN_INVALID' as const;

    constructor() {
        super('INVITATION_TOKEN_INVALID');
        this.name = 'InvitationTokenError';
    }
}

function requireInvitationId(value: string): void {
    if (!UUID_V4.test(value)) throw new InvitationTokenError();
}

async function tokenMac(invitationId: string, secret: Uint8Array): Promise<Uint8Array> {
    requireInvitationId(invitationId);
    if (secret.byteLength !== 32) throw new InvitationTokenError();
    const key = await crypto.subtle.importKey(
        'raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    );
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, utf8(`${TOKEN_CONTEXT}${invitationId}`)));
}

export async function issueInvitationToken(
    invitationId: string,
    random: RandomBytesSource = PLATFORM_RANDOM
): Promise<InvitationTokenMaterial> {
    requireInvitationId(invitationId);
    const secret = random.bytes(32);
    if (secret.byteLength !== 32) throw new InvitationTokenError();
    const token = `${invitationId}.${encodeBase64Url(secret)}`;
    return Object.freeze({ token, invitationId, digest: await tokenMac(invitationId, secret) });
}

export function parseInvitationToken(token: string): { invitationId: string; secret: Uint8Array } {
    if (typeof token !== 'string' || token.length !== 80) throw new InvitationTokenError();
    const separator = token.indexOf('.');
    if (separator !== 36 || token.indexOf('.', separator + 1) !== -1) throw new InvitationTokenError();
    const invitationId = token.slice(0, separator);
    requireInvitationId(invitationId);
    try {
        return { invitationId, secret: decodeBase64Url(token.slice(separator + 1), 32) };
    } catch {
        throw new InvitationTokenError();
    }
}

export async function verifyInvitationToken(
    token: string,
    storedDigest: BufferSource | readonly number[]
): Promise<{ invitationId: string; digest: Uint8Array } | null> {
    let parsed: { invitationId: string; secret: Uint8Array };
    try {
        parsed = parseInvitationToken(token);
    } catch {
        return null;
    }
    let digest: Uint8Array;
    if (storedDigest instanceof ArrayBuffer) {
        digest = new Uint8Array(storedDigest);
    } else if (ArrayBuffer.isView(storedDigest)) {
        digest = new Uint8Array(storedDigest.buffer.slice(
            storedDigest.byteOffset, storedDigest.byteOffset + storedDigest.byteLength
        ) as ArrayBuffer);
    } else if (Array.isArray(storedDigest)
        && storedDigest.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) {
        digest = Uint8Array.from(storedDigest);
    } else {
        return null;
    }
    if (digest.byteLength !== 32) return null;
    const key = await crypto.subtle.importKey(
        'raw', parsed.secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const valid = await crypto.subtle.verify(
        'HMAC', key, digest, utf8(`${TOKEN_CONTEXT}${parsed.invitationId}`)
    );
    return valid ? { invitationId: parsed.invitationId, digest } : null;
}
