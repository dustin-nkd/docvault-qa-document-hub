import { canonicalize, decodeBase64Url, encodeBase64Url, exactObject, sha256, type JsonValue, utf8 } from './canonical';
import { E2eePrimitiveError, formatError } from './errors';

export interface CanonicalPublicJwk {
    readonly crv: 'P-256'; readonly ext: true; readonly key_ops: readonly string[];
    readonly kty: 'EC'; readonly x: string; readonly y: string;
}

export async function parsePublicJwk(value: unknown): Promise<{ jwk: CanonicalPublicJwk; key: CryptoKey; fingerprint: string }> {
    const record = exactObject(value, ['crv', 'ext', 'key_ops', 'kty', 'x', 'y']);
    if (record.crv !== 'P-256' || record.ext !== true || record.kty !== 'EC'
        || !Array.isArray(record.key_ops) || record.key_ops.length !== 0
        || typeof record.x !== 'string' || typeof record.y !== 'string') formatError();
    decodeBase64Url(record.x, 32, 32); decodeBase64Url(record.y, 32, 32);
    const jwk: CanonicalPublicJwk = Object.freeze({
        crv: 'P-256', ext: true, key_ops: Object.freeze([]), kty: 'EC', x: record.x, y: record.y
    });
    let key: CryptoKey;
    try {
        key = await crypto.subtle.importKey('jwk', jwk as unknown as JsonWebKey, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
    } catch {
        throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
    }
    const canonical = canonicalize(jwk as unknown as JsonValue);
    return { jwk, key, fingerprint: encodeBase64Url(await sha256(utf8(canonical))) };
}
