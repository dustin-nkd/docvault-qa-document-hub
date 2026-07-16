import { executeGuardedBatch, type GuardedBatchRecipe } from './atomic-batch';
import { openAuthorizationSession } from './authorization-session';
import type { SecurityMutationOperation, StoredMutationResult } from './mutation-recipes';
import { PersistenceError } from './repository';

export interface ReplayScope {
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
    readonly operation: SecurityMutationOperation;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly serverTime: number;
}

interface ReplayRow {
    id: string;
    request_fingerprint: ArrayBuffer;
    http_status: number;
    result_json: string;
    expires_at: number;
}

function fingerprintsEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    if (a.length !== 32 || b.length !== 32) return false;
    let difference = 0;
    for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}

export async function resolveAuthorizedReplay(
    database: D1Database,
    scope: ReplayScope
): Promise<StoredMutationResult> {
    const session = openAuthorizationSession(database);
    const transition = scope.operation === 'workspace.create' || scope.operation === 'invitation.accept';
    const row = await session.prepare(transition
        ? `SELECT id, request_fingerprint, http_status, result_json, expires_at
           FROM transition_guards
           WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
             AND operation = ? AND client_mutation_id = ? LIMIT 1`
        : `SELECT id, request_fingerprint, http_status, result_json, expires_at
           FROM mutation_results
           WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
             AND operation = ? AND client_mutation_id = ? LIMIT 1`
    ).bind(scope.actorUserId, scope.actorDeviceId, scope.workspaceId, scope.operation,
        scope.clientMutationId).first<ReplayRow>();
    if (row === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const authorized = await session.prepare(
        `SELECT 1 AS authorized FROM memberships m
         JOIN devices d ON d.user_id = m.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? AND m.user_id = ? AND d.id = ?
           AND d.state = 'active' AND u.status = 'active'
           AND ((? = 'invitation.accept' AND m.state IN ('pending_key', 'active'))
             OR (? <> 'invitation.accept' AND m.state = 'active'))
         LIMIT 1`
    ).bind(scope.workspaceId, scope.actorUserId, scope.actorDeviceId,
        scope.operation, scope.operation).first<number>('authorized');
    if (authorized !== 1) throw new PersistenceError('AUTHORITY_REVOKED');
    if (!fingerprintsEqual(row.request_fingerprint, scope.requestFingerprint)) {
        throw new PersistenceError('IDEMPOTENCY_KEY_REUSED');
    }
    if (scope.serverTime >= row.expires_at) throw new PersistenceError('IDEMPOTENCY_EXPIRED');
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

export async function executeIdempotentRecipe(
    database: D1Database,
    recipe: GuardedBatchRecipe<StoredMutationResult>,
    scope: ReplayScope
): Promise<StoredMutationResult> {
    try {
        return await resolveAuthorizedReplay(database, scope);
    } catch (error) {
        if (!(error instanceof PersistenceError) || error.code !== 'PERSISTENCE_NOT_FOUND') throw error;
    }
    try {
        return await executeGuardedBatch(database, recipe);
    } catch (error) {
        if (!(error instanceof PersistenceError)
            || !['PERSISTENCE_CONFLICT', 'PERSISTENCE_CONSTRAINT'].includes(error.code)) throw error;
        try {
            return await resolveAuthorizedReplay(database, scope);
        } catch (replayError) {
            if (replayError instanceof PersistenceError
                && replayError.code === 'PERSISTENCE_NOT_FOUND') throw error;
            throw replayError;
        }
    }
}
