import { decodeBase64Url, IdentityPrimitiveError } from './encoding';

export type SessionCookieName = '__Host-docvault-preview-session' | '__Host-docvault-session';
const COOKIE_NAMES = new Set<SessionCookieName>([
    '__Host-docvault-preview-session', '__Host-docvault-session'
]);

function validateCookie(name: SessionCookieName, token: string): void {
    if (!COOKIE_NAMES.has(name)) throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    decodeBase64Url(token, 32);
}

export function serializeSessionCookie(name: SessionCookieName, token: string, expiresAt: number): string {
    validateCookie(name, token);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0 || expiresAt > 8_640_000_000_000_000) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    return `${name}=${token}; Path=/; Expires=${new Date(expiresAt).toUTCString()}; Secure; HttpOnly; SameSite=Lax`;
}

export function expireSessionCookie(name: SessionCookieName): string {
    if (!COOKIE_NAMES.has(name)) throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    return `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Secure; HttpOnly; SameSite=Lax`;
}

export function readSessionCookie(header: string | null, name: SessionCookieName): string | null {
    if (!COOKIE_NAMES.has(name) || header === null) return null;
    if (header.length > 8_192 || /[\r\n\u0000]/.test(header)) return null;
    const matches: string[] = [];
    for (const part of header.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
        matches.push(part.slice(separator + 1).trim());
    }
    if (matches.length !== 1) return null;
    try {
        decodeBase64Url(matches[0], 32);
        return matches[0];
    } catch {
        return null;
    }
}
