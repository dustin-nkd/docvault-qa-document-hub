import { decodeBase64Url, encodeBase64Url, requireSafeInteger, requireUuidV4 } from '../e2ee/canonical';
import type { CanonicalPublicJwk } from '../e2ee/jwk';
import { E2EE, type WorkspaceKeyEnvelope } from '../e2ee/primitives';
import { PersistenceError, requirePageSize } from '../persistence/repository';
import { readWorkspaceKeyReadiness, type ProvisioningTarget, type WorkspaceKeyReadiness } from './workspace-key-service';
import { readWorkspaceKeyRotation } from './rotation-service';

interface LiveContext {
    readonly actorUserId: string;
    readonly actorSessionId: string;
    readonly actorDeviceId: string;
    readonly serverTime: number;
}

export interface CurrentWorkspaceEnvelope {
    readonly readiness: WorkspaceKeyReadiness;
    readonly envelope: WorkspaceKeyEnvelope | null;
}

function validateLive(input: LiveContext): void {
    requireUuidV4(input.actorUserId);
    requireUuidV4(input.actorSessionId);
    requireUuidV4(input.actorDeviceId);
    if (!Number.isSafeInteger(input.serverTime) || input.serverTime < 0) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

function bytes(value: unknown, length: number): Uint8Array {
    if (value instanceof ArrayBuffer && value.byteLength === length) return new Uint8Array(value);
    if (ArrayBuffer.isView(value) && value.byteLength === length) {
        return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    }
    if (Array.isArray(value) && value.length === length
        && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
        return Uint8Array.from(value);
    }
    throw new PersistenceError('PERSISTENCE_INTEGRITY');
}

function publicJwk(value: unknown): CanonicalPublicJwk {
    if (typeof value !== 'string') throw new PersistenceError('PERSISTENCE_INTEGRITY');
    try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
        const item = parsed as Record<string, unknown>;
        if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(['crv', 'ext', 'key_ops', 'kty', 'x', 'y'])
            || item.crv !== 'P-256' || item.ext !== true || item.kty !== 'EC'
            || !Array.isArray(item.key_ops) || item.key_ops.length !== 0
            || typeof item.x !== 'string' || typeof item.y !== 'string') throw new Error();
        decodeBase64Url(item.x, 32, 32); decodeBase64Url(item.y, 32, 32);
        return Object.freeze({ crv: 'P-256', ext: true, key_ops: Object.freeze([]),
            kty: 'EC', x: item.x, y: item.y });
    } catch {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

export async function listWorkspaceProvisioningDevices(database: D1Database, input: LiveContext & {
    readonly workspaceId: string;
    readonly limit: number;
    readonly afterDeviceId?: string;
}): Promise<readonly ProvisioningTarget[]> {
    validateLive(input);
    requireUuidV4(input.workspaceId);
    requirePageSize(input.limit);
    if (input.afterDeviceId !== undefined) requireUuidV4(input.afterDeviceId);
    const rows = await database.prepare(
        `SELECT target.user_id, td.id AS device_id, td.public_jwk, td.fingerprint, w.current_key_version
         FROM workspaces w
         JOIN memberships caller ON caller.workspace_id = w.id
         JOIN users caller_user ON caller_user.id = caller.user_id AND caller_user.status = 'active'
         JOIN sessions s ON s.id = ? AND s.user_id = caller.user_id
         JOIN devices caller_device ON caller_device.id = ? AND caller_device.user_id = caller.user_id
         JOIN memberships target ON target.workspace_id = w.id
         JOIN users target_user ON target_user.id = target.user_id AND target_user.status = 'active'
         JOIN devices td ON td.user_id = target.user_id AND td.state = 'active'
         WHERE w.id = ? AND w.state IN ('active','rotating') AND caller.user_id = ?
           AND caller.state IN ('active','pending_key') AND caller_device.state = 'active'
           AND s.revoked_at IS NULL AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
           AND target.state IN ('active','pending_key') AND td.id > ?
           AND ((caller.state = 'active' AND caller.role IN ('owner','admin') AND EXISTS (
             SELECT 1 FROM workspace_key_envelopes current
             WHERE current.workspace_id = w.id AND current.key_version = w.current_key_version
               AND current.target_user_id = caller.user_id AND current.target_device_id = caller_device.id
               AND current.target_fingerprint = caller_device.fingerprint AND current.revoked_at IS NULL
           )) OR (caller.state = 'pending_key' AND target.user_id = caller.user_id))
         ORDER BY td.id LIMIT ?`
    ).bind(input.actorSessionId, input.actorDeviceId, input.workspaceId, input.actorUserId,
        input.serverTime, input.serverTime, input.afterDeviceId ?? '', input.limit)
        .all<Record<string, unknown>>();
    return Object.freeze(rows.results.map(row => Object.freeze({
        userId: requireUuidV4(row.user_id),
        deviceId: requireUuidV4(row.device_id),
        fingerprint: encodeBase64Url(bytes(row.fingerprint, 32)),
        publicJwk: publicJwk(row.public_jwk),
        keyVersion: requireSafeInteger(row.current_key_version, 1, 2_147_483_647)
    })));
}

export async function readCurrentWorkspaceEnvelope(database: D1Database, input: LiveContext & {
    readonly workspaceId: string;
}): Promise<CurrentWorkspaceEnvelope> {
    validateLive(input);
    requireUuidV4(input.workspaceId);
    const readiness = await readWorkspaceKeyReadiness(database, {
        actorUserId: input.actorUserId,
        workspaceId: input.workspaceId,
        deviceId: input.actorDeviceId
    });
    if (readiness !== 'key_ready') return Object.freeze({ readiness, envelope: null });
    const row = await database.prepare(
        `SELECT e.key_version, e.target_user_id, e.target_device_id, e.target_fingerprint,
          e.wrapper_device_id, e.ephemeral_public_jwk, e.hkdf_salt, e.nonce, e.ciphertext
         FROM workspace_key_envelopes e
         JOIN workspaces w ON w.id = e.workspace_id AND w.current_key_version = e.key_version
         JOIN memberships m ON m.workspace_id = w.id AND m.user_id = e.target_user_id
         JOIN users u ON u.id = m.user_id AND u.status = 'active'
         JOIN devices d ON d.id = e.target_device_id AND d.user_id = m.user_id
         JOIN sessions s ON s.id = ? AND s.user_id = m.user_id
         WHERE e.workspace_id = ? AND e.target_user_id = ? AND e.target_device_id = ?
           AND e.target_fingerprint = d.fingerprint AND e.revoked_at IS NULL
           AND m.state = 'active' AND d.state = 'active' AND s.revoked_at IS NULL
           AND ? < s.idle_expires_at AND ? < s.absolute_expires_at LIMIT 1`
    ).bind(input.actorSessionId, input.workspaceId, input.actorUserId, input.actorDeviceId,
        input.serverTime, input.serverTime).first<Record<string, unknown>>();
    if (row === null || typeof row.ephemeral_public_jwk !== 'string') {
        throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    }
    const fingerprint = encodeBase64Url(bytes(row.target_fingerprint, 32));
    const keyVersion = requireSafeInteger(row.key_version, 1, 2_147_483_647);
    const targetUserId = requireUuidV4(row.target_user_id);
    const targetDeviceId = requireUuidV4(row.target_device_id);
    const wrapperDeviceId = requireUuidV4(row.wrapper_device_id);
    const envelope: WorkspaceKeyEnvelope = Object.freeze({
        aad: Object.freeze({ version: 1, suite: E2EE.workspaceSuite,
            workspaceId: input.workspaceId, targetUserId, targetDeviceId,
            targetFingerprint: fingerprint, wrapperDeviceId, keyVersion }),
        ephemeralPublicJwk: publicJwk(row.ephemeral_public_jwk),
        hkdfSalt: encodeBase64Url(bytes(row.hkdf_salt, 32)),
        nonce: encodeBase64Url(bytes(row.nonce, 12)),
        ciphertext: encodeBase64Url(bytes(row.ciphertext, 48))
    });
    return Object.freeze({ readiness, envelope });
}

export async function readRotationCommitBinding(database: D1Database, input: LiveContext & {
    readonly workspaceId: string;
    readonly rotationId: string;
}): Promise<{ readonly expectedCurrentKeyVersion: number; readonly eligibleSetDigest: string }> {
    await readWorkspaceKeyRotation(database, input);
    const row = await database.prepare(
        `SELECT from_key_version, eligibility_digest FROM workspace_key_rotations
         WHERE id = ? AND workspace_id = ? LIMIT 1`
    ).bind(input.rotationId, input.workspaceId).first<Record<string, unknown>>();
    if (row === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    return Object.freeze({
        expectedCurrentKeyVersion: requireSafeInteger(row.from_key_version, 1, 2_147_483_646),
        eligibleSetDigest: encodeBase64Url(bytes(row.eligibility_digest, 32))
    });
}
