import { canonicalize, decodeBase64Url, type JsonValue } from '../e2ee/canonical';
import { parsePublicJwk } from '../e2ee/jwk';
import { PersistenceError, requirePageSize, translatePersistenceError } from '../persistence/repository';
import { executeDeviceMutation, listUserDevices, mapDevice, readDeviceMutation,
    type DeviceView } from './device-repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

interface MutationContext {
    readonly actorUserId: string;
    readonly actorSessionId: string;
    readonly mutationResultId: string;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly auditEventId: string;
    readonly requestId: string;
    readonly serverTime: number;
    readonly replayExpiresAt: number;
}

export interface RegisterDeviceInput extends MutationContext {
    readonly deviceId: string;
    readonly label: string;
    readonly publicJwk: unknown;
}

export interface RevokeDeviceInput extends MutationContext {
    readonly deviceId: string;
}

export interface DeviceMutationResult {
    readonly deviceId: string;
    readonly state: 'active' | 'revoked';
    readonly fingerprint: string;
    readonly httpStatus: 200 | 201;
}

function fail(code: 'PERSISTENCE_INTEGRITY' | 'IDEMPOTENCY_EXPIRED' | 'IDEMPOTENCY_KEY_REUSED' = 'PERSISTENCE_INTEGRITY'): never {
    throw new PersistenceError(code);
}

function requireUuid(value: string): void {
    if (!UUID_V4.test(value)) fail();
}

function validateContext(input: MutationContext): void {
    for (const id of [input.actorUserId, input.actorSessionId, input.mutationResultId,
        input.clientMutationId, input.auditEventId, input.requestId]) requireUuid(id);
    if (!(input.requestFingerprint instanceof ArrayBuffer) || input.requestFingerprint.byteLength !== 32
        || !Number.isSafeInteger(input.serverTime) || input.serverTime < 0
        || !Number.isSafeInteger(input.replayExpiresAt) || input.replayExpiresAt <= input.serverTime
        || input.replayExpiresAt > input.serverTime + 86_400_000) fail();
}

function validateLabel(label: string): void {
    if (typeof label !== 'string' || label !== label.trim() || CONTROL.test(label)
        || [...label].length < 1 || [...label].length > 80) fail();
}

function equal32(first: ArrayBuffer, second: ArrayBuffer): boolean {
    const a = new Uint8Array(first); const b = new Uint8Array(second);
    if (a.byteLength !== 32 || b.byteLength !== 32) return false;
    let difference = 0;
    for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}

async function replay(database: D1Database, input: MutationContext, operation: string): Promise<DeviceMutationResult | null> {
    const stored = await readDeviceMutation(database, { actorUserId: input.actorUserId,
        actorSessionId: input.actorSessionId, operation, clientMutationId: input.clientMutationId,
        serverTime: input.serverTime });
    if (stored === null) return null;
    if (!equal32(stored.requestFingerprint, input.requestFingerprint)) fail('IDEMPOTENCY_KEY_REUSED');
    if (input.serverTime >= stored.expiresAt) fail('IDEMPOTENCY_EXPIRED');
    let parsed: unknown;
    try { parsed = JSON.parse(stored.resultJson); } catch { return fail(); }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) fail();
    const value = parsed as Record<string, unknown>;
    if (typeof value.deviceId !== 'string' || typeof value.fingerprint !== 'string'
        || (value.state !== 'active' && value.state !== 'revoked')
        || (stored.httpStatus !== 200 && stored.httpStatus !== 201)) fail();
    return Object.freeze({ deviceId: value.deviceId, state: value.state,
        fingerprint: value.fingerprint, httpStatus: stored.httpStatus });
}

function resultJson(result: DeviceMutationResult): string {
    return JSON.stringify({ deviceId: result.deviceId, fingerprint: result.fingerprint, state: result.state });
}

function mapMutationResult(row: Record<string, unknown>): DeviceMutationResult {
    if (typeof row.result_json !== 'string' || (row.http_status !== 200 && row.http_status !== 201)) fail();
    const value = JSON.parse(row.result_json) as Record<string, unknown>;
    if (typeof value.deviceId !== 'string' || typeof value.fingerprint !== 'string'
        || (value.state !== 'active' && value.state !== 'revoked')) fail();
    return Object.freeze({ deviceId: value.deviceId, fingerprint: value.fingerprint,
        state: value.state, httpStatus: row.http_status });
}

export async function registerDevice(database: D1Database, input: RegisterDeviceInput): Promise<DeviceMutationResult> {
    validateContext(input); requireUuid(input.deviceId); validateLabel(input.label);
    const parsed = await parsePublicJwk(input.publicJwk);
    const fingerprint = decodeBase64Url(parsed.fingerprint, 32, 32).buffer;
    const result: DeviceMutationResult = Object.freeze({ deviceId: input.deviceId,
        state: 'active', fingerprint: parsed.fingerprint, httpStatus: 201 });
    const json = resultJson(result);
    const prior = await replay(database, input, 'device.register');
    if (prior) return prior;
    try {
        return await executeDeviceMutation(database, [
            database.prepare(
                `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
                  created_at, revoked_at, revoke_reason)
                 VALUES (?, ?, ?, ?, ?, 'P256-ECDH-v1', 'active', ?, NULL, NULL)`
            ).bind(input.deviceId, input.actorUserId, input.label,
                canonicalize(parsed.jwk), fingerprint, input.serverTime),
            database.prepare(
                `INSERT INTO device_audit_events (event_id, schema_version, user_id, event_type,
                  outcome, reason_code, actor_session_id, actor_device_id, target_device_id,
                  request_id, server_time, metadata_json)
                 VALUES (?, 11, ?, 'device.registered', 'success', 'registered', ?, NULL, ?, ?, ?, '{}')`
            ).bind(input.auditEventId, input.actorUserId, input.actorSessionId,
                input.deviceId, input.requestId, input.serverTime),
            database.prepare(
                `INSERT INTO device_mutation_results (id, actor_user_id, actor_session_id, operation,
                  client_mutation_id, request_fingerprint, target_device_id, http_status, result_json,
                  created_at, expires_at)
                 VALUES (?, ?, ?, 'device.register', ?, ?, ?, 201, ?, ?, ?)`
            ).bind(input.mutationResultId, input.actorUserId, input.actorSessionId,
                input.clientMutationId, input.requestFingerprint, input.deviceId, json,
                input.serverTime, input.replayExpiresAt),
            database.prepare(
                `SELECT http_status, result_json FROM device_mutation_results WHERE id = ? LIMIT 1`
            ).bind(input.mutationResultId)
        ], mapMutationResult);
    } catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT') {
            const concurrent = await replay(database, input, 'device.register');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function revokeDevice(database: D1Database, input: RevokeDeviceInput): Promise<DeviceMutationResult> {
    validateContext(input); requireUuid(input.deviceId);
    const prior = await replay(database, input, 'device.revoke');
    if (prior) return prior;
    const device = await database.prepare(
        `SELECT id, label, public_jwk, fingerprint, state, created_at, revoked_at
         FROM devices WHERE id = ? AND user_id = ? AND state = 'active' LIMIT 1`
    ).bind(input.deviceId, input.actorUserId).first<Record<string, unknown>>();
    if (device === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const view = mapDevice(device);
    const result: DeviceMutationResult = Object.freeze({ deviceId: input.deviceId,
        state: 'revoked', fingerprint: view.fingerprint, httpStatus: 200 });
    const json = resultJson(result);
    try {
        return await executeDeviceMutation(database, [
            database.prepare(
                `UPDATE devices SET state = 'revoked', revoked_at = ?, revoke_reason = 'user_requested'
                 WHERE id = ? AND user_id = ? AND state = 'active' AND EXISTS (
                   SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
                   WHERE s.id = ? AND s.user_id = ? AND s.revoked_at IS NULL
                     AND ? < s.idle_expires_at AND ? < s.absolute_expires_at AND u.status = 'active')`
            ).bind(input.serverTime, input.deviceId, input.actorUserId, input.actorSessionId,
                input.actorUserId, input.serverTime, input.serverTime),
            database.prepare(
                `INSERT INTO device_audit_events (event_id, schema_version, user_id, event_type,
                  outcome, reason_code, actor_session_id, actor_device_id, target_device_id,
                  request_id, server_time, metadata_json)
                 VALUES (?, 11, ?, 'device.revoked', 'success', 'user_requested', ?, ?, ?, ?, ?, '{}')`
            ).bind(input.auditEventId, input.actorUserId, input.actorSessionId, input.deviceId,
                input.deviceId, input.requestId, input.serverTime),
            database.prepare(
                `INSERT INTO device_mutation_results (id, actor_user_id, actor_session_id, operation,
                  client_mutation_id, request_fingerprint, target_device_id, http_status, result_json,
                  created_at, expires_at)
                 VALUES (?, ?, ?, 'device.revoke', ?, ?, ?, 200, ?, ?, ?)`
            ).bind(input.mutationResultId, input.actorUserId, input.actorSessionId,
                input.clientMutationId, input.requestFingerprint, input.deviceId, json,
                input.serverTime, input.replayExpiresAt),
            database.prepare(
                `SELECT http_status, result_json FROM device_mutation_results WHERE id = ? LIMIT 1`
            ).bind(input.mutationResultId)
        ], mapMutationResult);
    } catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT' || translated.code === 'PERSISTENCE_INTEGRITY') {
            const concurrent = await replay(database, input, 'device.revoke');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function inventoryDevices(database: D1Database, input: {
    actorUserId: string; limit: number; beforeCreatedAt?: number; beforeDeviceId?: string;
}): Promise<readonly DeviceView[]> {
    requireUuid(input.actorUserId); requirePageSize(input.limit);
    const hasTime = input.beforeCreatedAt !== undefined; const hasId = input.beforeDeviceId !== undefined;
    if (hasTime !== hasId || hasTime && (!Number.isSafeInteger(input.beforeCreatedAt)
        || (input.beforeCreatedAt ?? -1) < 0 || !UUID_V4.test(input.beforeDeviceId ?? ''))) fail();
    return listUserDevices(database, input);
}

export async function requireActiveOwnedDevice(database: D1Database, actorUserId: string,
    deviceId: string): Promise<DeviceView> {
    requireUuid(actorUserId); requireUuid(deviceId);
    const row = await database.prepare(
        `SELECT id, label, public_jwk, fingerprint, state, created_at, revoked_at
         FROM devices WHERE id = ? AND user_id = ? AND state = 'active' LIMIT 1`
    ).bind(deviceId, actorUserId).first<Record<string, unknown>>();
    if (row === null) throw new PersistenceError('AUTHORITY_REVOKED');
    return mapDevice(row);
}
