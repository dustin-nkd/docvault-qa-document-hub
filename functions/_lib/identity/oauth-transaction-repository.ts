import { PersistenceError, requireCheckedChanges, translatePersistenceError } from '../persistence/repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_CLEANUP_ROWS = 100;
const TERMINAL_RETENTION_MS = 86_400_000;

export interface OAuthTransactionRecord {
    readonly id: string;
    readonly stateDigest: ArrayBuffer;
    readonly encryptedEnvelope: ArrayBuffer;
    readonly callbackOrigin: string;
    readonly callbackPath: string;
    readonly invitationId: string | null;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly consumedAt: number | null;
    readonly status: 'pending' | 'consumed' | 'expired';
}

export interface CreateOAuthTransactionRecord {
    readonly id: string;
    readonly stateDigest: ArrayBuffer;
    readonly encryptedEnvelope: ArrayBuffer;
    readonly callbackOrigin: string;
    readonly callbackPath: string;
    readonly invitationId: string | null;
    readonly createdAt: number;
    readonly expiresAt: number;
}

export interface OAuthTransactionCleanupResult {
    readonly expired: number;
    readonly deleted: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function inputBlob(value: unknown, minimum: number, maximum: number): value is ArrayBuffer {
    return value instanceof ArrayBuffer && value.byteLength >= minimum && value.byteLength <= maximum;
}

function readBlob(value: unknown, minimum: number, maximum: number): ArrayBuffer {
    let bytes: Uint8Array;
    if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
    } else if (Array.isArray(value)
        && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255)) {
        bytes = Uint8Array.from(value);
    } else {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    if (bytes.byteLength < minimum || bytes.byteLength > maximum) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return Uint8Array.from(bytes).buffer;
}

function mapRecord(row: unknown): OAuthTransactionRecord {
    if (!isRecord(row) || typeof row.id !== 'string' || !UUID_V4.test(row.id)
        || typeof row.callback_origin !== 'string' || typeof row.callback_path !== 'string'
        || !(row.invitation_id === null || typeof row.invitation_id === 'string')
        || !integer(row.created_at) || !integer(row.expires_at)
        || !(row.consumed_at === null || integer(row.consumed_at))
        || (row.status !== 'pending' && row.status !== 'consumed' && row.status !== 'expired')) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const stateDigest = readBlob(row.state_digest, 32, 32);
    const encryptedEnvelope = readBlob(row.pkce_verifier_envelope, 18, 4_096);
    return {
        id: row.id,
        stateDigest,
        encryptedEnvelope,
        callbackOrigin: row.callback_origin,
        callbackPath: row.callback_path,
        invitationId: row.invitation_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        consumedAt: row.consumed_at,
        status: row.status
    };
}

function validateCreate(input: CreateOAuthTransactionRecord): void {
    if (!UUID_V4.test(input.id) || !inputBlob(input.stateDigest, 32, 32)
        || !inputBlob(input.encryptedEnvelope, 18, 4_096)
        || input.callbackOrigin.length < 8 || input.callbackOrigin.length > 255
        || input.callbackPath.length < 1 || input.callbackPath.length > 512
        || !(input.invitationId === null || UUID_V4.test(input.invitationId))
        || !integer(input.createdAt) || !integer(input.expiresAt) || input.expiresAt <= input.createdAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

function boundedChanges(result: D1Result<unknown> | undefined, maximum: number): number {
    const changes = result?.meta?.changes;
    if (result?.success !== true || !Number.isInteger(changes) || (changes ?? -1) < 0
        || (changes ?? maximum + 1) > maximum) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return changes ?? 0;
}

export async function insertOAuthTransaction(database: Pick<D1DatabaseSession, 'prepare'>,
    input: CreateOAuthTransactionRecord): Promise<void> {
    validateCreate(input);
    try {
        const result = await database.prepare(
            `INSERT INTO oauth_transactions
              (id, state_digest, pkce_verifier_envelope, callback_origin, callback_path,
               invitation_id, created_at, expires_at, consumed_at, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending')`
        ).bind(input.id, input.stateDigest, input.encryptedEnvelope, input.callbackOrigin,
            input.callbackPath, input.invitationId, input.createdAt, input.expiresAt).run();
        requireCheckedChanges(result, 1);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function findPendingOAuthTransaction(database: Pick<D1DatabaseSession, 'prepare'>,
    digestCandidates: readonly ArrayBuffer[], serverTime: number): Promise<OAuthTransactionRecord> {
    if (digestCandidates.length < 1 || digestCandidates.length > 2
        || digestCandidates.some(candidate => !inputBlob(candidate, 32, 32)) || !integer(serverTime)) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    try {
        const statement = digestCandidates.length === 1
            ? database.prepare(
                `SELECT id, state_digest, pkce_verifier_envelope, callback_origin, callback_path,
                        invitation_id, created_at, expires_at, consumed_at, status
                 FROM oauth_transactions WHERE state_digest = ?
                 ORDER BY created_at DESC, id LIMIT 2`
            ).bind(digestCandidates[0])
            : database.prepare(
                `SELECT id, state_digest, pkce_verifier_envelope, callback_origin, callback_path,
                        invitation_id, created_at, expires_at, consumed_at, status
                 FROM oauth_transactions WHERE state_digest = ? OR state_digest = ?
                 ORDER BY created_at DESC, id LIMIT 2`
            ).bind(digestCandidates[0], digestCandidates[1]);
        const result = await statement.all<Record<string, unknown>>();
        if (result.success !== true || !Array.isArray(result.results) || result.results.length !== 1) {
            throw new PersistenceError(result.results?.length === 0
                ? 'PERSISTENCE_NOT_FOUND' : 'PERSISTENCE_INTEGRITY');
        }
        const record = mapRecord(result.results[0]);
        if (record.status !== 'pending' || record.consumedAt !== null) {
            throw new PersistenceError('PERSISTENCE_NOT_FOUND');
        }
        if (record.expiresAt <= serverTime) {
            const expired = await database.prepare(
                `UPDATE oauth_transactions SET status = 'expired'
                 WHERE id = ? AND status = 'pending' AND consumed_at IS NULL AND expires_at <= ?`
            ).bind(record.id, serverTime).run();
            requireCheckedChanges(expired, 1);
            throw new PersistenceError('PERSISTENCE_NOT_FOUND');
        }
        return record;
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function consumeOAuthTransaction(database: Pick<D1DatabaseSession, 'prepare' | 'batch'>,
    record: OAuthTransactionRecord, serverTime: number): Promise<void> {
    if (!UUID_V4.test(record.id) || !inputBlob(record.stateDigest, 32, 32)
        || !integer(serverTime) || serverTime < record.createdAt || serverTime >= record.expiresAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const statements = [
        database.prepare(
            `UPDATE oauth_transactions SET status = 'consumed', consumed_at = ?
             WHERE id = ? AND state_digest = ? AND status = 'pending'
               AND consumed_at IS NULL AND created_at <= ? AND expires_at > ?`
        ).bind(serverTime, record.id, record.stateDigest, serverTime, serverTime),
        database.prepare(
            `SELECT id, status, consumed_at FROM oauth_transactions
             WHERE id = ? AND state_digest = ? LIMIT 1`
        ).bind(record.id, record.stateDigest)
    ];
    try {
        const results = await database.batch<Record<string, unknown>>(statements);
        if (results.length !== 2) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        requireCheckedChanges(results[0], 1);
        const rows = results[1].results;
        if (results[1].success !== true || !Array.isArray(rows) || rows.length !== 1
            || !isRecord(rows[0]) || rows[0].id !== record.id || rows[0].status !== 'consumed'
            || rows[0].consumed_at !== serverTime) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function cleanupOAuthTransactions(database: Pick<D1DatabaseSession, 'prepare' | 'batch'>,
    serverTime: number, maximumRows: number): Promise<OAuthTransactionCleanupResult> {
    if (!integer(serverTime) || serverTime < TERMINAL_RETENTION_MS || !Number.isInteger(maximumRows)
        || maximumRows < 1 || maximumRows > MAXIMUM_CLEANUP_ROWS) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const terminalCutoff = serverTime - TERMINAL_RETENTION_MS;
    const statements = [
        database.prepare(
            `UPDATE oauth_transactions SET status = 'expired'
             WHERE id IN (
                SELECT id FROM oauth_transactions
                WHERE status = 'pending' AND consumed_at IS NULL AND expires_at <= ?
                ORDER BY expires_at, id LIMIT ?
             )`
        ).bind(serverTime, maximumRows),
        database.prepare(
            `DELETE FROM oauth_transactions WHERE id IN (
                SELECT id FROM oauth_transactions
                WHERE (status = 'consumed' AND consumed_at <= ?)
                   OR (status = 'expired' AND expires_at <= ?)
                ORDER BY expires_at, id LIMIT ?
             )`
        ).bind(terminalCutoff, terminalCutoff, maximumRows)
    ];
    try {
        const results = await database.batch(statements);
        if (results.length !== statements.length) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        return {
            expired: boundedChanges(results[0], maximumRows),
            deleted: boundedChanges(results[1], maximumRows)
        };
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export const OAUTH_TRANSACTION_REPOSITORY_LIMITS = Object.freeze({
    maximumCleanupRows: MAXIMUM_CLEANUP_ROWS,
    terminalRetentionMilliseconds: TERMINAL_RETENTION_MS
});
