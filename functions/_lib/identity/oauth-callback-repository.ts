import { PersistenceError, translatePersistenceError } from '../persistence/repository';
import type { GitHubIdentity } from './github-oauth-adapter';
import type { OAuthTransactionRecord } from './oauth-transaction-repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ASSERT_PREVIOUS_CHANGE = `INSERT INTO users
    (id, provider, provider_subject, display_login, display_name, avatar_url,
     status, created_at, updated_at, deactivated_at)
    SELECT 'oauth-guard-failure', 'github', '0', 'guard', NULL, NULL, 'active', 0, 0, NULL
    WHERE changes() <> 1`;

export interface OAuthCallbackCommitInput {
    readonly transaction: OAuthTransactionRecord;
    readonly purpose: 'sign_in' | 'reauthenticate';
    readonly identity: GitHubIdentity;
    readonly candidateUserId: string;
    readonly sessionId: string;
    readonly sessionTokenDigest: ArrayBuffer;
    readonly initiatingSessionId: string | null;
    readonly initiatingUserId: string | null;
    readonly serverTime: number;
    readonly idleExpiresAt: number;
    readonly absoluteExpiresAt: number;
}

export interface OAuthCallbackCommitResult {
    readonly userId: string;
    readonly sessionId: string;
    readonly providerSubject: string;
    readonly login: string;
    readonly createdAt: number;
    readonly authenticatedAt: number;
    readonly idleExpiresAt: number;
    readonly absoluteExpiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validateInput(input: OAuthCallbackCommitInput): void {
    const transaction = input.transaction;
    const identity = input.identity;
    if (!UUID_V4.test(transaction.id) || !(transaction.stateDigest instanceof ArrayBuffer)
        || transaction.stateDigest.byteLength !== 32 || transaction.status !== 'pending'
        || transaction.consumedAt !== null || !UUID_V4.test(input.candidateUserId)
        || !UUID_V4.test(input.sessionId) || !(input.sessionTokenDigest instanceof ArrayBuffer)
        || input.sessionTokenDigest.byteLength !== 32 || identity.provider !== 'github'
        || !/^[1-9][0-9]{0,19}$/.test(identity.providerSubject)
        || identity.login.length < 1 || identity.login.length > 100
        || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/.test(identity.login)
        || !(identity.displayName === null || (identity.displayName.length >= 1 && identity.displayName.length <= 255
            && !/[\u0000-\u001f\u007f]/.test(identity.displayName)))
        || !(identity.avatarUrl === null || (identity.avatarUrl.length >= 1 && identity.avatarUrl.length <= 2_048))
        || !validInteger(input.serverTime) || input.serverTime < transaction.createdAt
        || input.serverTime >= transaction.expiresAt || !validInteger(input.idleExpiresAt)
        || !validInteger(input.absoluteExpiresAt) || input.idleExpiresAt <= input.serverTime
        || input.absoluteExpiresAt < input.idleExpiresAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    if (identity.avatarUrl !== null) {
        let avatar: URL;
        try {
            avatar = new URL(identity.avatarUrl);
        } catch {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
        if (avatar.protocol !== 'https:' || avatar.username || avatar.password || avatar.href !== identity.avatarUrl) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
    }
    const signInBindingsValid = input.purpose === 'sign_in'
        && input.initiatingSessionId === null && input.initiatingUserId === null;
    const reauthenticationBindingsValid = input.purpose === 'reauthenticate'
        && typeof input.initiatingSessionId === 'string' && UUID_V4.test(input.initiatingSessionId)
        && typeof input.initiatingUserId === 'string' && UUID_V4.test(input.initiatingUserId);
    if (!signInBindingsValid && !reauthenticationBindingsValid) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

function requireChanges(result: D1Result<unknown> | undefined, expected: number): void {
    const changes = result?.meta?.changes;
    if (result?.success !== true || !Number.isInteger(changes) || changes !== expected) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

function mapResult(result: D1Result<Record<string, unknown>> | undefined,
    input: OAuthCallbackCommitInput): OAuthCallbackCommitResult {
    const rows = result?.results;
    if (result?.success !== true || !Array.isArray(rows) || rows.length !== 1 || !isRecord(rows[0])) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const row = rows[0];
    if (typeof row.user_id !== 'string' || !UUID_V4.test(row.user_id)
        || row.session_id !== input.sessionId || row.provider_subject !== input.identity.providerSubject
        || row.display_login !== input.identity.login || row.created_at !== input.serverTime
        || row.authenticated_at !== input.serverTime || row.idle_expires_at !== input.idleExpiresAt
        || row.absolute_expires_at !== input.absoluteExpiresAt) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return Object.freeze({
        userId: row.user_id,
        sessionId: row.session_id,
        providerSubject: row.provider_subject,
        login: row.display_login,
        createdAt: row.created_at,
        authenticatedAt: row.authenticated_at,
        idleExpiresAt: row.idle_expires_at,
        absoluteExpiresAt: row.absolute_expires_at
    });
}

function transactionGuard(database: Pick<D1DatabaseSession, 'prepare'>,
    input: OAuthCallbackCommitInput): D1PreparedStatement[] {
    return [
        database.prepare(
            `UPDATE oauth_transactions SET status = 'consumed', consumed_at = ?
             WHERE id = ? AND state_digest = ? AND status = 'pending' AND consumed_at IS NULL
               AND created_at <= ? AND expires_at > ?`
        ).bind(input.serverTime, input.transaction.id, input.transaction.stateDigest,
            input.serverTime, input.serverTime),
        database.prepare(ASSERT_PREVIOUS_CHANGE)
    ];
}

function signInStatements(database: Pick<D1DatabaseSession, 'prepare'>,
    input: OAuthCallbackCommitInput): D1PreparedStatement[] {
    return [
        database.prepare(
            `INSERT INTO users
                (id, provider, provider_subject, display_login, display_name, avatar_url,
                 status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, ?, ?, 'active', ?, ?, NULL)
             ON CONFLICT(provider, provider_subject) DO UPDATE SET
                display_login = excluded.display_login,
                display_name = excluded.display_name,
                avatar_url = excluded.avatar_url,
                status = 'active', updated_at = excluded.updated_at, deactivated_at = NULL`
        ).bind(input.candidateUserId, input.identity.providerSubject, input.identity.login,
            input.identity.displayName, input.identity.avatarUrl, input.serverTime, input.serverTime),
        database.prepare(ASSERT_PREVIOUS_CHANGE),
        database.prepare(
            `INSERT INTO sessions
                (id, token_digest, user_id, device_hint, created_at, last_seen_at,
                 authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
             SELECT ?, ?, id, NULL, ?, ?, ?, ?, ?, NULL, NULL
             FROM users WHERE provider = 'github' AND provider_subject = ? AND status = 'active'`
        ).bind(input.sessionId, input.sessionTokenDigest, input.serverTime, input.serverTime,
            input.serverTime, input.idleExpiresAt, input.absoluteExpiresAt, input.identity.providerSubject),
        database.prepare(ASSERT_PREVIOUS_CHANGE)
    ];
}

function reauthenticationStatements(database: Pick<D1DatabaseSession, 'prepare'>,
    input: OAuthCallbackCommitInput): D1PreparedStatement[] {
    return [
        database.prepare(
            `UPDATE users SET display_login = ?, display_name = ?, avatar_url = ?, updated_at = ?
             WHERE id = ? AND provider = 'github' AND provider_subject = ? AND status = 'active'`
        ).bind(input.identity.login, input.identity.displayName, input.identity.avatarUrl,
            input.serverTime, input.initiatingUserId, input.identity.providerSubject),
        database.prepare(ASSERT_PREVIOUS_CHANGE),
        database.prepare(
            `UPDATE sessions SET revoked_at = ?, revoke_reason = 'reauthenticated'
             WHERE id = ? AND user_id = ? AND revoked_at IS NULL
               AND idle_expires_at > ? AND absolute_expires_at > ?`
        ).bind(input.serverTime, input.initiatingSessionId, input.initiatingUserId,
            input.serverTime, input.serverTime),
        database.prepare(ASSERT_PREVIOUS_CHANGE),
        database.prepare(
            `INSERT INTO sessions
                (id, token_digest, user_id, device_hint, created_at, last_seen_at,
                 authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL)`
        ).bind(input.sessionId, input.sessionTokenDigest, input.initiatingUserId,
            input.serverTime, input.serverTime, input.serverTime,
            input.idleExpiresAt, input.absoluteExpiresAt),
        database.prepare(ASSERT_PREVIOUS_CHANGE)
    ];
}

function resultStatement(database: Pick<D1DatabaseSession, 'prepare'>,
    input: OAuthCallbackCommitInput): D1PreparedStatement {
    return database.prepare(
        `SELECT u.id AS user_id, s.id AS session_id, u.provider_subject, u.display_login,
                s.created_at, s.authenticated_at, s.idle_expires_at, s.absolute_expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.token_digest = ? AND s.revoked_at IS NULL LIMIT 1`
    ).bind(input.sessionId, input.sessionTokenDigest);
}

export async function commitOAuthCallback(database: Pick<D1DatabaseSession, 'prepare' | 'batch'>,
    input: OAuthCallbackCommitInput): Promise<OAuthCallbackCommitResult> {
    validateInput(input);
    const guarded = transactionGuard(database, input);
    const domain = input.purpose === 'sign_in'
        ? signInStatements(database, input)
        : reauthenticationStatements(database, input);
    const statements = [...guarded, ...domain, resultStatement(database, input)];
    try {
        const results = await database.batch<Record<string, unknown>>(statements);
        if (results.length !== statements.length) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        for (let index = 0; index < results.length - 1; index += 1) {
            requireChanges(results[index], index % 2 === 0 ? 1 : 0);
        }
        return mapResult(results.at(-1), input);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export const OAUTH_CALLBACK_REPOSITORY_CONSTANTS = Object.freeze({
    maximumBatchStatements: 9,
    assertionSql: ASSERT_PREVIOUS_CHANGE
});
