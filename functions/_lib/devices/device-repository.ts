import { encodeBase64Url } from '../e2ee/canonical';
import {
    PersistenceError, mapExactlyOneResult, readBounded, requireCheckedChanges,
    translatePersistenceError
} from '../persistence/repository';

export const DEVICE_SERVICE_SCHEMA_VERSION = 11 as const;

export interface DeviceView {
    readonly deviceId: string;
    readonly label: string;
    readonly publicJwk: Readonly<Record<string, unknown>>;
    readonly fingerprint: string;
    readonly state: 'active' | 'revoked';
    readonly createdAt: number;
    readonly revokedAt: number | null;
}

export interface StoredDeviceMutation {
    readonly requestFingerprint: ArrayBuffer;
    readonly httpStatus: number;
    readonly resultJson: string;
    readonly expiresAt: number;
}

function blob(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer && value.byteLength === 32) return value;
    if (Array.isArray(value) && value.length === 32
        && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
        return Uint8Array.from(value).buffer;
    }
    if (ArrayBuffer.isView(value) && value.byteLength === 32) {
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    }
    throw new PersistenceError('PERSISTENCE_INTEGRITY');
}

function number(value: unknown): number {
    if (!Number.isSafeInteger(value) || typeof value !== 'number' || value < 0) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return value;
}

function nullableNumber(value: unknown): number | null {
    return value === null ? null : number(value);
}

function text(value: unknown): string {
    if (typeof value !== 'string') throw new PersistenceError('PERSISTENCE_INTEGRITY');
    return value;
}

export function mapDevice(row: Record<string, unknown>): DeviceView {
    const state = row.state;
    if (state !== 'active' && state !== 'revoked') throw new PersistenceError('PERSISTENCE_INTEGRITY');
    let publicJwk: Readonly<Record<string, unknown>>;
    try {
        const parsed = JSON.parse(text(row.public_jwk));
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
        publicJwk = Object.freeze(parsed as Record<string, unknown>);
    } catch {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return Object.freeze({
        deviceId: text(row.id), label: text(row.label), publicJwk,
        fingerprint: encodeBase64Url(new Uint8Array(blob(row.fingerprint))), state,
        createdAt: number(row.created_at), revokedAt: nullableNumber(row.revoked_at)
    });
}

export async function readDeviceMutation(
    database: D1Database,
    scope: { actorUserId: string; actorSessionId: string; operation: string; clientMutationId: string; serverTime: number }
): Promise<StoredDeviceMutation | null> {
    try {
        const row = await database.prepare(
            `SELECT m.request_fingerprint, m.http_status, m.result_json, m.expires_at
             FROM device_mutation_results m
             JOIN sessions s ON s.id = m.actor_session_id AND s.user_id = m.actor_user_id
             JOIN users u ON u.id = m.actor_user_id
             WHERE m.actor_user_id = ? AND m.actor_session_id = ? AND m.operation = ?
               AND m.client_mutation_id = ? AND s.revoked_at IS NULL
               AND ? < s.idle_expires_at AND ? < s.absolute_expires_at AND u.status = 'active' LIMIT 1`
        ).bind(scope.actorUserId, scope.actorSessionId, scope.operation, scope.clientMutationId,
            scope.serverTime, scope.serverTime)
            .first<Record<string, unknown>>();
        if (row === null) return null;
        return Object.freeze({ requestFingerprint: blob(row.request_fingerprint),
            httpStatus: number(row.http_status), resultJson: text(row.result_json),
            expiresAt: number(row.expires_at) });
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function executeDeviceMutation<T>(
    database: D1Database,
    statements: readonly D1PreparedStatement[],
    mapper: (row: Record<string, unknown>) => T
): Promise<T> {
    if (statements.length !== 4) throw new PersistenceError('PERSISTENCE_INTEGRITY');
    try {
        const results = await database.batch<Record<string, unknown>>([...statements]);
        if (results.length !== 4) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        for (let index = 0; index < 3; index += 1) requireCheckedChanges(results[index], 1);
        return mapExactlyOneResult(results[3], mapper);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function listUserDevices(database: D1Database, input: {
    actorUserId: string; limit: number; beforeCreatedAt?: number; beforeDeviceId?: string;
}): Promise<readonly DeviceView[]> {
    const cursor = input.beforeCreatedAt !== undefined && input.beforeDeviceId !== undefined;
    const statement = cursor
        ? database.prepare(
            `SELECT id, label, public_jwk, fingerprint, state, created_at, revoked_at
             FROM devices WHERE user_id = ? AND (created_at < ? OR (created_at = ? AND id < ?))
             ORDER BY created_at DESC, id DESC LIMIT ?`
        ).bind(input.actorUserId, input.beforeCreatedAt, input.beforeCreatedAt, input.beforeDeviceId, input.limit)
        : database.prepare(
            `SELECT id, label, public_jwk, fingerprint, state, created_at, revoked_at
             FROM devices WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`
        ).bind(input.actorUserId, input.limit);
    return readBounded(statement, input.limit, mapDevice);
}
