const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export class IdentityPrimitiveError extends Error {
    readonly code: 'IDENTITY_CRYPTO_INVALID' | 'IDENTITY_CONFIGURATION_INVALID';

    constructor(code: IdentityPrimitiveError['code']) {
        super(code);
        this.name = 'IdentityPrimitiveError';
        this.code = code;
    }
}

export function utf8(value: string): Uint8Array {
    return encoder.encode(value);
}

export function decodeUtf8(value: BufferSource): string {
    try {
        return decoder.decode(value);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
}

export function encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(value: string, expectedBytes?: number): Uint8Array {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 5_464) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    let binary: string;
    try {
        binary = atob(padded);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if ((expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
        || encodeBase64Url(bytes) !== value) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    return bytes;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
    const length = parts.reduce((total, part) => total + part.byteLength, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

export function uint32(value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, false);
    return bytes;
}
