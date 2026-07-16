import { PERSISTENCE_LIMITS, PersistenceError, translatePersistenceError } from './repository';

const THIRTY_DAYS_MS = 2_592_000_000;
const THREE_HUNDRED_SIXTY_FIVE_DAYS_MS = 31_536_000_000;

export interface RetentionPurgeInput {
    readonly auditRunId: string;
    readonly transitionRunId: string;
    readonly serverTime: number;
    readonly maximumRowsPerType: number;
}

export interface RetentionPurgeResult {
    readonly transitionGuards: number;
    readonly mutationResults: number;
    readonly oauthTransactions: number;
    readonly sessions: number;
    readonly invitations: number;
    readonly auditEvents: number;
}

const DELETE_RESULT_INDEXES = Object.freeze({
    transitionGuards: 2,
    mutationResults: 3,
    oauthTransactions: 4,
    sessions: 5,
    invitations: 6,
    auditEvents: 7
} satisfies Record<keyof RetentionPurgeResult, number>);

function validateInput(input: RetentionPurgeInput): void {
    if (!Number.isSafeInteger(input.serverTime) || input.serverTime < THREE_HUNDRED_SIXTY_FIVE_DAYS_MS
        || !Number.isInteger(input.maximumRowsPerType) || input.maximumRowsPerType < 1
        || input.maximumRowsPerType > PERSISTENCE_LIMITS.maximumPageSize) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

export function buildRetentionPurgeStatements(
    database: Pick<D1Database, 'prepare'>,
    input: RetentionPurgeInput
): D1PreparedStatement[] {
    validateInput(input);
    const operationalCutoff = input.serverTime - THIRTY_DAYS_MS;
    const auditCutoff = input.serverTime - THREE_HUNDRED_SIXTY_FIVE_DAYS_MS;
    const limit = input.maximumRowsPerType;
    return [
        database.prepare(
            `INSERT INTO retention_purge_runs
              (id, target, cutoff_at, started_at, max_rows, status, completed_at)
             VALUES (?, 'audit_events', ?, ?, ?, 'running', NULL)`
        ).bind(input.auditRunId, auditCutoff, input.serverTime, limit),
        database.prepare(
            `INSERT INTO retention_purge_runs
              (id, target, cutoff_at, started_at, max_rows, status, completed_at)
             VALUES (?, 'transition_guards', ?, ?, ?, 'running', NULL)`
        ).bind(input.transitionRunId, input.serverTime, input.serverTime, limit),
        database.prepare(
            `DELETE FROM transition_guards WHERE id IN (
                SELECT id FROM transition_guards
                WHERE expires_at <= ? ORDER BY expires_at, id LIMIT ?
             )`
        ).bind(input.serverTime, limit),
        database.prepare(
            `DELETE FROM mutation_results WHERE id IN (
                SELECT id FROM mutation_results
                WHERE expires_at <= ? ORDER BY expires_at, id LIMIT ?
             )`
        ).bind(input.serverTime, limit),
        database.prepare(
            `DELETE FROM oauth_transactions WHERE id IN (
                SELECT id FROM oauth_transactions
                WHERE (status = 'consumed' AND consumed_at <= ?)
                   OR (status = 'expired' AND expires_at <= ?)
                ORDER BY expires_at, id LIMIT ?
             )`
        ).bind(operationalCutoff, operationalCutoff, limit),
        database.prepare(
            `DELETE FROM sessions WHERE id IN (
                SELECT id FROM sessions
                WHERE absolute_expires_at <= ? OR (revoked_at IS NOT NULL AND revoked_at <= ?)
                ORDER BY absolute_expires_at, id LIMIT ?
             )`
        ).bind(operationalCutoff, operationalCutoff, limit),
        database.prepare(
            `DELETE FROM invitations WHERE id IN (
                SELECT candidate.id FROM invitations candidate
                WHERE ((candidate.state = 'accepted' AND candidate.accepted_at <= ?)
                    OR (candidate.state = 'revoked' AND candidate.revoked_at <= ?)
                    OR (candidate.state = 'expired' AND candidate.expired_at <= ?))
                  AND NOT EXISTS (SELECT 1 FROM invitations child
                                  WHERE child.replacement_of = candidate.id)
                  AND NOT EXISTS (SELECT 1 FROM transition_guards guard
                                  WHERE guard.invitation_id = candidate.id)
                ORDER BY candidate.expires_at, candidate.id LIMIT ?
             )`
        ).bind(operationalCutoff, operationalCutoff, operationalCutoff, limit),
        database.prepare(
            `DELETE FROM audit_events WHERE sequence IN (
                SELECT candidate.sequence FROM audit_events candidate
                WHERE candidate.server_time < ?
                  AND NOT EXISTS (SELECT 1 FROM retention_holds hold
                                  WHERE hold.workspace_id = candidate.workspace_id
                                    AND hold.status = 'active'
                                    AND (hold.expires_at IS NULL OR hold.expires_at > ?))
                  AND NOT EXISTS (SELECT 1 FROM audit_events linked
                                  WHERE linked.correction_of_event_id = candidate.event_id
                                     OR linked.related_event_id = candidate.event_id)
                ORDER BY candidate.server_time, candidate.sequence LIMIT ?
             )`
        ).bind(auditCutoff, input.serverTime, limit),
        database.prepare(
            `UPDATE retention_purge_runs SET status = 'completed', completed_at = ?
             WHERE id = ? AND target = 'transition_guards' AND status = 'running'`
        ).bind(input.serverTime, input.transitionRunId),
        database.prepare(
            `UPDATE retention_purge_runs SET status = 'completed', completed_at = ?
             WHERE id = ? AND target = 'audit_events' AND status = 'running'`
        ).bind(input.serverTime, input.auditRunId)
    ];
}

function boundedChanges(result: D1Result<unknown> | undefined, limit: number): number {
    const changes = result?.meta?.changes;
    if (result?.success !== true || !Number.isInteger(changes) || (changes ?? -1) < 0
        || (changes ?? limit + 1) > limit) throw new PersistenceError('PERSISTENCE_INTEGRITY');
    return changes ?? 0;
}

export async function runRetentionPurge(
    database: Pick<D1Database, 'prepare' | 'batch'>,
    input: RetentionPurgeInput
): Promise<RetentionPurgeResult> {
    const statements = buildRetentionPurgeStatements(database, input);
    try {
        const results = await database.batch(statements);
        if (results.length !== statements.length
            || results[0].meta.changes !== 1 || results[1].meta.changes !== 1
            || results[8].meta.changes !== 1 || results[9].meta.changes !== 1) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
        return {
            transitionGuards: boundedChanges(results[DELETE_RESULT_INDEXES.transitionGuards], input.maximumRowsPerType),
            mutationResults: boundedChanges(results[DELETE_RESULT_INDEXES.mutationResults], input.maximumRowsPerType),
            oauthTransactions: boundedChanges(results[DELETE_RESULT_INDEXES.oauthTransactions], input.maximumRowsPerType),
            sessions: boundedChanges(results[DELETE_RESULT_INDEXES.sessions], input.maximumRowsPerType),
            invitations: boundedChanges(results[DELETE_RESULT_INDEXES.invitations], input.maximumRowsPerType),
            auditEvents: boundedChanges(results[DELETE_RESULT_INDEXES.auditEvents], input.maximumRowsPerType)
        };
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export const RETENTION_BASELINES = Object.freeze({
    operationalMilliseconds: THIRTY_DAYS_MS,
    auditMilliseconds: THREE_HUNDRED_SIXTY_FIVE_DAYS_MS,
    maximumRowsPerType: PERSISTENCE_LIMITS.maximumPageSize
});
