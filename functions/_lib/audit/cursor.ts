import { hmacSign, hmacVerify } from '../identity/crypto';
import { decodeBase64Url, decodeUtf8, encodeBase64Url, utf8 } from '../identity/encoding';
import { isAuditEventType, type AuditEventType } from './event-registry';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR_CONTEXT = 'docvault:audit-cursor:v1:';
const CURSOR_TTL_MS = 15 * 60 * 1_000;
const CURSOR_MAXIMUM_LENGTH = 2_048;
const ENVIRONMENTS: readonly string[] = Object.freeze(['local', 'preview', 'production']);
const FIELDS = Object.freeze(['v', 'route', 'environment', 'workspaceId', 'eventType',
    'occurredFrom', 'occurredTo', 'occurredAt', 'order', 'issuedAt', 'expiresAt']);

export class AuditCursorError extends Error {
    constructor() {
        super('AUDIT_CURSOR_INVALID');
        this.name = 'AuditCursorError';
    }
}

export interface AuditCursorFilters {
    readonly eventType: AuditEventType | null;
    readonly occurredFrom: number;
    readonly occurredTo: number;
}

export interface AuditCursorPosition {
    readonly occurredAt: number;
    readonly order: number;
}

export interface AuditCursorBinding {
    readonly workspaceId: string;
    readonly filters: AuditCursorFilters;
}

export interface AuditCursorCodec {
    issue(binding: AuditCursorBinding, position: AuditCursorPosition, serverTime: number): Promise<string>;
    verify(token: string, binding: AuditCursorBinding, serverTime: number): Promise<AuditCursorPosition>;
}

interface CursorPayload {
    v: number;
    route: string;
    environment: string;
    workspaceId: string;
    eventType: string | null;
    occurredFrom: number;
    occurredTo: number;
    occurredAt: number;
    order: number;
    issuedAt: number;
    expiresAt: number;
}

function fail(): never {
    throw new AuditCursorError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function validTime(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validBinding(binding: AuditCursorBinding): boolean {
    return UUID_V4.test(binding.workspaceId)
        && (binding.filters.eventType === null || isAuditEventType(binding.filters.eventType))
        && validTime(binding.filters.occurredFrom) && validTime(binding.filters.occurredTo)
        && binding.filters.occurredFrom <= binding.filters.occurredTo;
}

function parsePayload(encoded: string): CursorPayload {
    let value: unknown;
    try {
        value = JSON.parse(decodeUtf8(decodeBase64Url(encoded)));
    } catch {
        return fail();
    }
    if (!isRecord(value) || Object.keys(value).sort().join('|') !== [...FIELDS].sort().join('|')
        || value.v !== 1 || value.route !== 'audit-events'
        || typeof value.environment !== 'string' || !ENVIRONMENTS.includes(value.environment)
        || typeof value.workspaceId !== 'string' || !UUID_V4.test(value.workspaceId)
        || (value.eventType !== null
            && (typeof value.eventType !== 'string' || !isAuditEventType(value.eventType)))
        || !validTime(value.occurredFrom) || !validTime(value.occurredTo)
        || !validTime(value.occurredAt) || !validTime(value.order)
        || !validTime(value.issuedAt) || !validTime(value.expiresAt)) return fail();
    return {
        v: 1,
        route: 'audit-events',
        environment: value.environment,
        workspaceId: value.workspaceId,
        eventType: value.eventType,
        occurredFrom: value.occurredFrom,
        occurredTo: value.occurredTo,
        occurredAt: value.occurredAt,
        order: value.order,
        issuedAt: value.issuedAt,
        expiresAt: value.expiresAt
    };
}

export function createAuditCursorCodec(key: Uint8Array, environment: string): AuditCursorCodec {
    if (key.byteLength !== 32 || !ENVIRONMENTS.includes(environment)) return fail();
    const signingKey = key.slice();
    return Object.freeze({
        async issue(binding: AuditCursorBinding, position: AuditCursorPosition,
            serverTime: number): Promise<string> {
            if (!validBinding(binding) || !validTime(position.occurredAt)
                || !validTime(position.order) || !validTime(serverTime)) return fail();
            const payload: CursorPayload = {
                v: 1,
                route: 'audit-events',
                environment,
                workspaceId: binding.workspaceId,
                eventType: binding.filters.eventType,
                occurredFrom: binding.filters.occurredFrom,
                occurredTo: binding.filters.occurredTo,
                occurredAt: position.occurredAt,
                order: position.order,
                issuedAt: serverTime,
                expiresAt: serverTime + CURSOR_TTL_MS
            };
            const encoded = encodeBase64Url(utf8(JSON.stringify(payload)));
            const signature = await hmacSign(signingKey, utf8(`${CURSOR_CONTEXT}${encoded}`));
            return `${encoded}.${encodeBase64Url(signature)}`;
        },
        async verify(token: string, binding: AuditCursorBinding,
            serverTime: number): Promise<AuditCursorPosition> {
            if (!validBinding(binding) || !validTime(serverTime)
                || token.length < 45 || token.length > CURSOR_MAXIMUM_LENGTH) return fail();
            const separator = token.indexOf('.');
            if (separator < 1 || separator !== token.lastIndexOf('.')) return fail();
            const encoded = token.slice(0, separator);
            let signature: Uint8Array;
            try {
                signature = decodeBase64Url(token.slice(separator + 1), 32);
            } catch {
                return fail();
            }
            if (!await hmacVerify(signingKey, utf8(`${CURSOR_CONTEXT}${encoded}`), signature)) return fail();
            const payload = parsePayload(encoded);
            if (payload.environment !== environment || payload.workspaceId !== binding.workspaceId
                || payload.eventType !== binding.filters.eventType
                || payload.occurredFrom !== binding.filters.occurredFrom
                || payload.occurredTo !== binding.filters.occurredTo
                || payload.issuedAt > serverTime || payload.expiresAt <= serverTime
                || payload.expiresAt - payload.issuedAt !== CURSOR_TTL_MS) return fail();
            return { occurredAt: payload.occurredAt, order: payload.order };
        }
    });
}
