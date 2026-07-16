import { PersistenceError, translatePersistenceError } from '../persistence/repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ASSERT_PREVIOUS_CHANGE = `INSERT INTO users
    (id, provider, provider_subject, display_login, display_name, avatar_url,
     status, created_at, updated_at, deactivated_at)
    SELECT 'session-guard-failure', 'github', '0', 'guard', NULL, NULL, 'active', 0, 0, NULL
    WHERE changes() <> 1`;

export type SessionRevocationReason = 'logout' | 'pepper_rotation' | 'security_rotation' | 'fixation_risk';

export interface SessionRecord {
    readonly id: string;
    readonly tokenDigest: ArrayBuffer;
    readonly digestSlot: 0 | 1;
    readonly userId: string;
    readonly deviceHint: string | null;
    readonly createdAt: number;
    readonly lastSeenAt: number;
    readonly authenticatedAt: number;
    readonly idleExpiresAt: number;
    readonly absoluteExpiresAt: number;
    readonly revokedAt: number | null;
    readonly revokeReason: string | null;
    readonly userStatus: 'active' | 'deactivated';
    readonly providerSubject: string;
    readonly login: string;
}

export interface RotateSessionInput {
    readonly predecessor: SessionRecord;
    readonly successorId: string;
    readonly successorTokenDigest: ArrayBuffer;
    readonly serverTime: number;
    readonly successorIdleExpiresAt: number;
    readonly reason: Exclude<SessionRevocationReason, 'logout'>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeTime(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function nullableTime(value: unknown): value is number | null {
    return value === null || safeTime(value);
}

function mapSession(row: Record<string, unknown>, knownDigests: readonly ArrayBuffer[]): SessionRecord {
    if (typeof row.id !== 'string' || !UUID_V4.test(row.id)
        || typeof row.user_id !== 'string' || !UUID_V4.test(row.user_id)
        || !(row.device_hint === null || (typeof row.device_hint === 'string'
            && row.device_hint.length >= 1 && row.device_hint.length <= 200))
        || !safeTime(row.created_at) || !safeTime(row.last_seen_at) || !safeTime(row.authenticated_at)
        || !safeTime(row.idle_expires_at) || !safeTime(row.absolute_expires_at)
        || row.last_seen_at < row.created_at || row.authenticated_at < row.created_at
        || row.authenticated_at > row.last_seen_at || row.idle_expires_at <= row.last_seen_at
        || row.absolute_expires_at < row.idle_expires_at || !nullableTime(row.revoked_at)
        || !(row.revoke_reason === null || (typeof row.revoke_reason === 'string'
            && /^[a-z0-9_-]{1,64}$/.test(row.revoke_reason)))
        || ((row.revoked_at === null) !== (row.revoke_reason === null))
        || (row.user_status !== 'active' && row.user_status !== 'deactivated')
        || typeof row.provider_subject !== 'string' || !/^[1-9][0-9]{0,19}$/.test(row.provider_subject)
        || typeof row.display_login !== 'string' || row.display_login.length < 1
        || row.display_login.length > 100 || (row.digest_slot !== 0 && row.digest_slot !== 1)
        || !(knownDigests[row.digest_slot] instanceof ArrayBuffer)
        || knownDigests[row.digest_slot].byteLength !== 32) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return Object.freeze({
        id: row.id,
        tokenDigest: knownDigests[row.digest_slot],
        digestSlot: row.digest_slot,
        userId: row.user_id,
        deviceHint: row.device_hint,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        authenticatedAt: row.authenticated_at,
        idleExpiresAt: row.idle_expires_at,
        absoluteExpiresAt: row.absolute_expires_at,
        revokedAt: row.revoked_at,
        revokeReason: row.revoke_reason,
        userStatus: row.user_status,
        providerSubject: row.provider_subject,
        login: row.display_login
    });
}

function boundedChanges(result: D1Result<unknown>): number {
    const changes = result.meta?.changes;
    if (result.success !== true || !Number.isInteger(changes) || changes < 0 || changes > 1) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return changes;
}

export async function findSessionByDigests(database: Pick<D1DatabaseSession, 'prepare'>,
    candidates: readonly ArrayBuffer[]): Promise<SessionRecord | null> {
    if (candidates.length < 1 || candidates.length > 2
        || candidates.some(candidate => !(candidate instanceof ArrayBuffer) || candidate.byteLength !== 32)) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const first = candidates[0];
    const second = candidates[1] ?? first;
    try {
        const result = await database.prepare(
            `SELECT s.id,
                    CASE WHEN s.token_digest = ? THEN 0 WHEN s.token_digest = ? THEN 1 ELSE 2 END AS digest_slot,
                    s.user_id, s.device_hint, s.created_at, s.last_seen_at, s.authenticated_at,
                    s.idle_expires_at, s.absolute_expires_at, s.revoked_at, s.revoke_reason,
                    u.status AS user_status, u.provider_subject, u.display_login
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token_digest IN (?, ?) LIMIT 3`
        ).bind(first, second, first, second).all<Record<string, unknown>>();
        if (result.success !== true || !Array.isArray(result.results) || result.results.length > 1) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
        if (result.results.length === 0) return null;
        if (!isRecord(result.results[0])) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        return mapSession(result.results[0], [first, second]);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function touchSession(database: Pick<D1DatabaseSession, 'prepare'>, record: SessionRecord,
    serverTime: number, idleExpiresAt: number): Promise<boolean> {
    if (!safeTime(serverTime) || !safeTime(idleExpiresAt) || serverTime <= record.lastSeenAt
        || idleExpiresAt <= serverTime || idleExpiresAt > record.absoluteExpiresAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    try {
        const result = await database.prepare(
            `UPDATE sessions SET last_seen_at = ?, idle_expires_at = ?
             WHERE id = ? AND token_digest = ? AND user_id = ? AND revoked_at IS NULL
               AND last_seen_at = ? AND idle_expires_at > ? AND absolute_expires_at > ?`
        ).bind(serverTime, idleExpiresAt, record.id, record.tokenDigest, record.userId,
            record.lastSeenAt, serverTime, serverTime).run();
        return boundedChanges(result) === 1;
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

function validateRotation(input: RotateSessionInput): void {
    if (!UUID_V4.test(input.successorId) || input.successorId === input.predecessor.id
        || !(input.successorTokenDigest instanceof ArrayBuffer) || input.successorTokenDigest.byteLength !== 32
        || !safeTime(input.serverTime) || input.serverTime < input.predecessor.lastSeenAt
        || input.serverTime >= input.predecessor.idleExpiresAt
        || input.serverTime >= input.predecessor.absoluteExpiresAt
        || !safeTime(input.successorIdleExpiresAt) || input.successorIdleExpiresAt <= input.serverTime
        || input.successorIdleExpiresAt > input.predecessor.absoluteExpiresAt
        || !(['pepper_rotation', 'security_rotation', 'fixation_risk'] as const).includes(input.reason)) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

export async function rotateSessionAtomically(database: Pick<D1DatabaseSession, 'prepare' | 'batch'>,
    input: RotateSessionInput): Promise<SessionRecord> {
    validateRotation(input);
    const statements = [
        database.prepare(
            `UPDATE sessions SET revoked_at = ?, revoke_reason = ?
             WHERE id = ? AND token_digest = ? AND user_id = ? AND revoked_at IS NULL
               AND last_seen_at = ? AND idle_expires_at > ? AND absolute_expires_at > ?`
        ).bind(input.serverTime, input.reason, input.predecessor.id, input.predecessor.tokenDigest,
            input.predecessor.userId, input.predecessor.lastSeenAt, input.serverTime, input.serverTime),
        database.prepare(ASSERT_PREVIOUS_CHANGE),
        database.prepare(
            `INSERT INTO sessions
                (id, token_digest, user_id, device_hint, created_at, last_seen_at,
                 authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
        ).bind(input.successorId, input.successorTokenDigest, input.predecessor.userId,
            input.predecessor.deviceHint, input.predecessor.createdAt, input.serverTime,
            input.predecessor.authenticatedAt, input.successorIdleExpiresAt,
            input.predecessor.absoluteExpiresAt),
        database.prepare(ASSERT_PREVIOUS_CHANGE),
        database.prepare(
            `SELECT s.id, 0 AS digest_slot, s.user_id, s.device_hint,
                    s.created_at, s.last_seen_at, s.authenticated_at, s.idle_expires_at,
                    s.absolute_expires_at, s.revoked_at, s.revoke_reason,
                    u.status AS user_status, u.provider_subject, u.display_login
             FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.id = ? AND s.token_digest = ? AND s.revoked_at IS NULL LIMIT 1`
        ).bind(input.successorId, input.successorTokenDigest)
    ];
    try {
        const results = await database.batch<Record<string, unknown>>(statements);
        if (results.length !== statements.length || boundedChanges(results[0]) !== 1
            || boundedChanges(results[1]) !== 0 || boundedChanges(results[2]) !== 1
            || boundedChanges(results[3]) !== 0 || results[4].success !== true
            || !Array.isArray(results[4].results) || results[4].results.length !== 1
            || !isRecord(results[4].results[0])) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
        return mapSession(results[4].results[0], [input.successorTokenDigest]);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function revokeSession(database: Pick<D1DatabaseSession, 'prepare'>, record: SessionRecord,
    serverTime: number): Promise<boolean> {
    if (!safeTime(serverTime) || serverTime < record.lastSeenAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    try {
        const result = await database.prepare(
            `UPDATE sessions SET revoked_at = ?, revoke_reason = 'logout'
             WHERE id = ? AND token_digest = ? AND user_id = ? AND revoked_at IS NULL
               AND idle_expires_at > ? AND absolute_expires_at > ?`
        ).bind(serverTime, record.id, record.tokenDigest, record.userId, serverTime, serverTime).run();
        return boundedChanges(result) === 1;
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export const SESSION_REPOSITORY_CONSTANTS = Object.freeze({
    maximumDigestCandidates: 2,
    maximumLookupRows: 1,
    maximumRotationStatements: 5,
    assertionSql: ASSERT_PREVIOUS_CHANGE
});
