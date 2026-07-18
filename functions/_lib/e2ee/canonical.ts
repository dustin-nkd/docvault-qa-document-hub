import { E2eePrimitiveError, formatError } from './errors';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type JsonValue = null | boolean | number | string | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

function assertUnicode(value: string): void {
    for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit >= 0xd800 && unit <= 0xdbff) {
            const next = value.charCodeAt(index + 1);
            if (next < 0xdc00 || next > 0xdfff) formatError();
            index += 1;
        } else if (unit >= 0xdc00 && unit <= 0xdfff) formatError();
    }
}

function serialize(value: JsonValue, seen: Set<object>): string {
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) formatError();
        return JSON.stringify(value);
    }
    if (typeof value === 'string') {
        assertUnicode(value);
        return JSON.stringify(value);
    }
    if (typeof value !== 'object') formatError();
    if (seen.has(value)) formatError();
    seen.add(value);
    try {
        if (Array.isArray(value)) return `[${value.map(item => serialize(item, seen)).join(',')}]`;
        if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) formatError();
        const record = value as { readonly [key: string]: JsonValue };
        const keys = Object.keys(record).sort();
        return `{${keys.map(key => {
            assertUnicode(key);
            if (!Object.hasOwn(record, key) || record[key] === undefined) formatError();
            return `${JSON.stringify(key)}:${serialize(record[key] as JsonValue, seen)}`;
        }).join(',')}}`;
    } finally {
        seen.delete(value);
    }
}

export function canonicalize(value: JsonValue): string {
    return serialize(value, new Set<object>());
}

export function utf8(value: string): Uint8Array {
    assertUnicode(value);
    return encoder.encode(value);
}

export function decodeUtf8(value: BufferSource): string {
    try {
        return decoder.decode(value);
    } catch {
        return formatError();
    }
}

export function encodeBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64Url(value: string, expectedBytes?: number, maximumBytes = 4_096): Uint8Array {
    if (!BASE64URL.test(value) || value.length > Math.ceil(maximumBytes * 4 / 3)) formatError();
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    let binary: string;
    try {
        binary = atob(padded);
    } catch {
        return formatError();
    }
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    if (bytes.byteLength > maximumBytes || expectedBytes !== undefined && bytes.byteLength !== expectedBytes
        || encodeBase64Url(bytes) !== value) formatError();
    return bytes;
}

export function requireUuidV4(value: unknown): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) formatError();
    return value;
}

export function requireSafeInteger(value: unknown, minimum: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < minimum || value > maximum) formatError();
    return value;
}

export function exactObject(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || Object.getPrototypeOf(value) !== Object.prototype
        || Object.keys(value).length !== fields.length
        || fields.some(field => !Object.hasOwn(value, field))) formatError();
    return value as Record<string, unknown>;
}

export async function sha256(bytes: BufferSource): Promise<Uint8Array> {
    try {
        return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    } catch {
        throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
    }
}
