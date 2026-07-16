export const PERSISTENCE_LIMITS = Object.freeze({
    maximumPageSize: 100,
    maximumBatchStatements: 32
});

export type PersistenceErrorCode =
    | 'AUTHORITY_REVOKED'
    | 'DOCUMENT_REVISION_CONFLICT'
    | 'IDEMPOTENCY_EXPIRED'
    | 'IDEMPOTENCY_KEY_REUSED'
    | 'PERSISTENCE_CONFLICT'
    | 'PERSISTENCE_CONSTRAINT'
    | 'PERSISTENCE_INTEGRITY'
    | 'PERSISTENCE_NOT_FOUND'
    | 'PERSISTENCE_UNAVAILABLE';

export class PersistenceError extends Error {
    readonly code: PersistenceErrorCode;

    constructor(code: PersistenceErrorCode) {
        super(code);
        this.name = 'PersistenceError';
        this.code = code;
    }
}

export type RowMapper<T> = (row: Record<string, unknown>) => T;

function fail(code: PersistenceErrorCode): never {
    throw new PersistenceError(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function translatePersistenceError(error: unknown): PersistenceError {
    if (error instanceof PersistenceError) return error;
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('unique') || message.includes('conflict')) {
            return new PersistenceError('PERSISTENCE_CONFLICT');
        }
        if (message.includes('constraint') || message.includes('foreign key')) {
            return new PersistenceError('PERSISTENCE_CONSTRAINT');
        }
    }
    return new PersistenceError('PERSISTENCE_UNAVAILABLE');
}

export function requirePageSize(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > PERSISTENCE_LIMITS.maximumPageSize) {
        return fail('PERSISTENCE_INTEGRITY');
    }
    return value;
}

export function requireCheckedChanges(
    result: unknown,
    expectedChanges: number
): void {
    if (!Number.isInteger(expectedChanges) || expectedChanges < 1) {
        fail('PERSISTENCE_INTEGRITY');
    }
    if (!isObject(result) || result.success !== true || !isObject(result.meta)) {
        fail('PERSISTENCE_INTEGRITY');
    }
    const changes = result.meta.changes;
    if (!Number.isInteger(changes) || changes !== expectedChanges) {
        fail('PERSISTENCE_INTEGRITY');
    }
}

export function mapExactlyOneResult<T>(result: unknown, mapper: RowMapper<T>): T {
    if (!isObject(result) || result.success !== true || !Array.isArray(result.results)) {
        return fail('PERSISTENCE_INTEGRITY');
    }
    if (result.results.length !== 1 || !isObject(result.results[0])) {
        return fail(result.results.length === 0
            ? 'PERSISTENCE_NOT_FOUND'
            : 'PERSISTENCE_INTEGRITY');
    }
    try {
        return mapper(result.results[0]);
    } catch {
        return fail('PERSISTENCE_INTEGRITY');
    }
}

export async function readBounded<T>(
    statement: D1PreparedStatement,
    limit: number,
    mapper: RowMapper<T>
): Promise<readonly T[]> {
    requirePageSize(limit);
    try {
        const result = await statement.all<Record<string, unknown>>();
        if (result.success !== true || !Array.isArray(result.results)
            || result.results.length > limit) {
            return fail('PERSISTENCE_INTEGRITY');
        }
        return result.results.map(row => mapper(row));
    } catch (error) {
        throw translatePersistenceError(error);
    }
}

export async function runCheckedWrite(
    statement: D1PreparedStatement,
    expectedChanges = 1
): Promise<void> {
    try {
        const result = await statement.run();
        requireCheckedChanges(result, expectedChanges);
    } catch (error) {
        throw translatePersistenceError(error);
    }
}
