import { IdentityPrimitiveError, utf8 } from './encoding';

const FORBIDDEN_QUERY_KEYS = new Set(['code', 'state', 'token', 'access_token', 'invite', 'invitation']);
const INVALID_PERCENT = /%(?![0-9a-fA-F]{2})/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function decodedLayers(value: string): string[] {
    const layers = [value];
    for (let index = 0; index < 3; index += 1) {
        let decoded: string;
        try {
            decoded = decodeURIComponent(layers[layers.length - 1]);
        } catch {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        if (decoded === layers[layers.length - 1]) break;
        layers.push(decoded);
    }
    return layers;
}

function assertLayerSafe(value: string): void {
    if (CONTROL.test(value) || value.includes('\\') || value.startsWith('//') || INVALID_PERCENT.test(value)) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
}

export function normalizeReturnPath(value: unknown, approvedOrigin: string): string {
    const candidate = value === undefined || value === null || value === '' ? '/' : value;
    if (typeof candidate !== 'string' || utf8(candidate).byteLength > 512 || !candidate.startsWith('/')
        || candidate.startsWith('//') || candidate.includes('#')) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    let origin: URL;
    try {
        origin = new URL(approvedOrigin);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    if (origin.origin !== approvedOrigin || origin.pathname !== '/' || origin.search || origin.hash) {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    for (const layer of decodedLayers(candidate)) assertLayerSafe(layer);

    let parsed: URL;
    try {
        parsed = new URL(candidate, origin);
    } catch {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    if (parsed.origin !== origin.origin || parsed.username || parsed.password || parsed.hash) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    for (const key of parsed.searchParams.keys()) {
        for (const layer of decodedLayers(key)) {
            if (FORBIDDEN_QUERY_KEYS.has(layer.toLowerCase())) {
                throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
            }
        }
    }
    const normalized = `${parsed.pathname}${parsed.search}`;
    if (utf8(normalized).byteLength > 512) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    return normalized;
}
