import { hmacSign, hmacVerify } from '../identity/crypto';
import { decodeBase64Url, decodeUtf8, encodeBase64Url, utf8 } from '../identity/encoding';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTEXT = 'docvault:control-plane-cursor:v1:';
const TTL_MS = 15 * 60 * 1_000;
const MAXIMUM_LENGTH = 2_048;
const ROUTES = Object.freeze(['members', 'invitations', 'devices', 'workspace-devices'] as const);
type CursorRoute = typeof ROUTES[number];

interface CursorPayload {
    readonly v: 1;
    readonly route: CursorRoute;
    readonly environment: 'preview';
    readonly workspaceId: string;
    readonly position: Readonly<Record<string, string | number>>;
    readonly issuedAt: number;
    readonly expiresAt: number;
}

export class ControlPlaneCursorError extends Error {
    constructor() {
        super('CONTROL_PLANE_CURSOR_INVALID');
        this.name = 'ControlPlaneCursorError';
    }
}

const fail = (): never => { throw new ControlPlaneCursorError(); };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function time(value: unknown): value is number {
    return Number.isSafeInteger(value) && Number(value) >= 0;
}

function validPosition(route: CursorRoute, value: unknown): value is Record<string, string | number> {
    if (!isRecord(value)) return false;
    if (route === 'members') {
        return Object.keys(value).length === 1 && typeof value.userId === 'string'
            && UUID_V4.test(value.userId);
    }
    if (route === 'devices') {
        return Object.keys(value).sort().join('|') === 'createdAt|deviceId'
            && time(value.createdAt) && typeof value.deviceId === 'string' && UUID_V4.test(value.deviceId);
    }
    if (route === 'workspace-devices') {
        return Object.keys(value).length === 1 && typeof value.deviceId === 'string'
            && UUID_V4.test(value.deviceId);
    }
    return Object.keys(value).sort().join('|') === 'expiresAt|invitationId'
        && time(value.expiresAt) && typeof value.invitationId === 'string'
        && UUID_V4.test(value.invitationId);
}

function parse(encoded: string): CursorPayload {
    let value: unknown;
    try { value = JSON.parse(decodeUtf8(decodeBase64Url(encoded))); } catch { return fail(); }
    if (!isRecord(value)
        || Object.keys(value).sort().join('|') !== 'environment|expiresAt|issuedAt|position|route|v|workspaceId'
        || value.v !== 1 || value.environment !== 'preview'
        || typeof value.route !== 'string' || !ROUTES.includes(value.route as CursorRoute)
        || typeof value.workspaceId !== 'string' || !UUID_V4.test(value.workspaceId)
        || !validPosition(value.route as CursorRoute, value.position)
        || !time(value.issuedAt) || !time(value.expiresAt)) return fail();
    return {
        v: 1,
        route: value.route as CursorRoute,
        environment: 'preview',
        workspaceId: value.workspaceId as string,
        position: value.position as Record<string, string | number>,
        issuedAt: value.issuedAt as number,
        expiresAt: value.expiresAt as number
    };
}

export interface ControlPlaneCursorCodec {
    issue(route: CursorRoute, workspaceId: string,
        position: Readonly<Record<string, string | number>>, serverTime: number): Promise<string>;
    verify(route: CursorRoute, workspaceId: string, token: string,
        serverTime: number): Promise<Readonly<Record<string, string | number>>>;
}

export function createControlPlaneCursorCodec(key: Uint8Array): ControlPlaneCursorCodec {
    if (key.byteLength !== 32) return fail();
    const signingKey = key.slice();
    return Object.freeze({
        async issue(route: CursorRoute, workspaceId: string,
            position: Readonly<Record<string, string | number>>, serverTime: number) {
            if (!ROUTES.includes(route) || !UUID_V4.test(workspaceId)
                || !validPosition(route, position) || !time(serverTime)) return fail();
            const payload: CursorPayload = { v: 1, route, environment: 'preview', workspaceId,
                position, issuedAt: serverTime, expiresAt: serverTime + TTL_MS };
            const encoded = encodeBase64Url(utf8(JSON.stringify(payload)));
            const signature = await hmacSign(signingKey, utf8(`${CONTEXT}${encoded}`));
            return `${encoded}.${encodeBase64Url(signature)}`;
        },
        async verify(route: CursorRoute, workspaceId: string, token: string, serverTime: number) {
            if (!ROUTES.includes(route) || !UUID_V4.test(workspaceId) || !time(serverTime)
                || token.length < 45 || token.length > MAXIMUM_LENGTH) return fail();
            const separator = token.indexOf('.');
            if (separator < 1 || separator !== token.lastIndexOf('.')) return fail();
            const encoded = token.slice(0, separator);
            let signature: Uint8Array;
            try { signature = decodeBase64Url(token.slice(separator + 1), 32); } catch { return fail(); }
            if (!await hmacVerify(signingKey, utf8(`${CONTEXT}${encoded}`), signature)) return fail();
            const payload = parse(encoded);
            if (payload.route !== route || payload.workspaceId !== workspaceId
                || payload.issuedAt > serverTime || payload.expiresAt <= serverTime
                || payload.expiresAt - payload.issuedAt !== TTL_MS) return fail();
            return payload.position;
        }
    });
}

export const CONTROL_PLANE_CURSOR_CONSTANTS = Object.freeze({ ttlMilliseconds: TTL_MS });
