import {
    PERSISTENCE_LIMITS,
    PersistenceError,
    mapExactlyOneResult,
    requireCheckedChanges,
    translatePersistenceError,
    type RowMapper
} from './repository';

export type GuardedBatchRole = 'guard' | 'domain' | 'audit' | 'result';

export interface GuardedBatchStatement {
    readonly role: GuardedBatchRole;
    readonly statement: D1PreparedStatement;
    readonly expectedChanges?: number;
}

export interface GuardedBatchRecipe<T> {
    readonly statements: readonly GuardedBatchStatement[];
    readonly mapResult: RowMapper<T>;
}

function validateTopology(statements: readonly GuardedBatchStatement[]): void {
    if (statements.length < 4 || statements.length > PERSISTENCE_LIMITS.maximumBatchStatements) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    if (statements[0].role !== 'guard' || statements.at(-1)?.role !== 'result') {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const auditPositions = statements
        .map((entry, index) => entry.role === 'audit' ? index : -1)
        .filter(index => index >= 0);
    if (auditPositions.length !== 1 || auditPositions[0] !== statements.length - 2) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    if (statements.slice(1, -2).length === 0
        || statements.slice(1, -2).some(entry => entry.role !== 'domain')) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    for (const entry of statements.slice(0, -1)) {
        if (!Number.isInteger(entry.expectedChanges) || (entry.expectedChanges ?? 0) < 1) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
    }
    if (statements.at(-1)?.expectedChanges !== undefined) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
}

export async function executeGuardedBatch<T>(
    database: Pick<D1Database, 'batch'>,
    recipe: GuardedBatchRecipe<T>
): Promise<T> {
    validateTopology(recipe.statements);
    try {
        const results = await database.batch<Record<string, unknown>>(
            recipe.statements.map(entry => entry.statement)
        );
        if (results.length !== recipe.statements.length) {
            throw new PersistenceError('PERSISTENCE_INTEGRITY');
        }
        for (let index = 0; index < results.length - 1; index += 1) {
            requireCheckedChanges(results[index], recipe.statements[index].expectedChanges ?? 0);
        }
        return mapExactlyOneResult(results.at(-1), recipe.mapResult);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}
