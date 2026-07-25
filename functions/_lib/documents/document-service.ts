// CF-P6-004 — Atomic document mutations, append-only revisions, and idempotency.
//
// One create/update/tombstone is one atomic D1 boundary. The guard statement of
// each recipe carries the whole authorization and precondition check inside the
// SELECT that supplies the ledger's NOT NULL result_json, so a Viewer, a removed
// member, a revoked device, a deactivated user, a stale base revision, a
// non-current key version, a cross-workspace identifier, or a tombstoned target
// all fail as a constraint violation that rolls the batch back. There is no code
// path where a denial writes a partial row.
//
// Ordering is fixed by ADR-006 and CF-P6-001 §3.2: authenticate, authorize,
// validate and fingerprint, look up the idempotency binding, then commit. The
// lookup happens through resolveAuthorizedReplay, which re-authorizes against
// current membership/device/user state before returning a stored result — so a
// previously successful mutation grants nothing after revocation.

import {
    executeIdempotentRecipe,
    type ReplayScope
} from '../persistence/idempotency';
import {
    buildDocumentCreateRecipe,
    buildDocumentMutationRecipe,
    buildDocumentTombstoneRecipe,
    type RecipeBindings,
    type SecurityMutationOperation,
    type StoredMutationResult
} from '../persistence/mutation-recipes';
import { PersistenceError } from '../persistence/repository';
import {
    computeRequestFingerprint,
    type DocumentOperation
} from './request-fingerprint';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MIN_CIPHERTEXT_BYTES = 18;
const MAX_CIPHERTEXT_BYTES = 1_048_000;
const MAX_ENVELOPE_BYTES = 1_048_576;
const MAX_REVISION = 9_007_199_254_740_991;
const MAX_KEY_VERSION = 2_147_483_647;
const IDEMPOTENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;

/** Stable, non-disclosing error taxonomy frozen by CF-P6-001 §4. */
export const DOCUMENT_ERRORS = Object.freeze({
    validation: 'VALIDATION_FAILED',
    notFound: 'RESOURCE_NOT_FOUND',
    conflict: 'DOCUMENT_REVISION_CONFLICT',
    idempotencyReuse: 'IDEMPOTENCY_KEY_REUSED',
    idempotencyExpired: 'IDEMPOTENCY_WINDOW_EXPIRED',
    keyVersion: 'KEY_VERSION_MISMATCH'
} as const);

export type DocumentErrorCode = (typeof DOCUMENT_ERRORS)[keyof typeof DOCUMENT_ERRORS];

export class DocumentMutationError extends Error {
    readonly code: DocumentErrorCode;
    readonly httpStatus: number;
    readonly details?: Readonly<Record<string, number>>;
    constructor(code: DocumentErrorCode, httpStatus: number, details?: Record<string, number>) {
        super(code);
        this.name = 'DocumentMutationError';
        this.code = code;
        this.httpStatus = httpStatus;
        if (details) this.details = Object.freeze({ ...details });
    }
}

export interface DocumentMutationRequest {
    readonly operation: DocumentOperation;
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
    readonly documentId: string;
    /** Last observed revision; exactly 0 for a create. */
    readonly baseRevision: number;
    readonly keyVersion: number;
    readonly envelopeVersion: number;
    readonly ciphertextEnvelope: Uint8Array;
    readonly ciphertextDigest: Uint8Array;
    readonly ciphertextBytes: number;
    readonly clientMutationId: string;
    /** Server-derived. A client-supplied value must never reach this field. */
    readonly serverTime: number;
    readonly requestId: string;
    readonly auditEventId: string;
    readonly mutationResultId: string;
}

export interface DocumentMutationOutcome {
    readonly documentId: string;
    readonly revision: number;
    readonly operation: DocumentOperation;
    readonly occurredAt: number;
    readonly clientMutationId: string;
    readonly replayed: boolean;
    readonly httpStatus: number;
}

const invalid = (): never => { throw new DocumentMutationError(DOCUMENT_ERRORS.validation, 400); };

function requireUuid(value: unknown): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) invalid();
    return value as string;
}

function requireInteger(value: unknown, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) invalid();
    return value as number;
}

const RECIPE_OPERATION: Readonly<Record<DocumentOperation, SecurityMutationOperation>> = Object.freeze({
    create: 'document.create',
    update: 'document.update',
    delete: 'document.tombstone'
});

/**
 * Validate every bound before any database or crypto work. An oversize or
 * malformed request must cost nothing.
 */
function validate(request: DocumentMutationRequest): void {
    if (!['create', 'update', 'delete'].includes(request?.operation)) invalid();
    requireUuid(request.actorUserId);
    requireUuid(request.actorDeviceId);
    requireUuid(request.workspaceId);
    requireUuid(request.documentId);
    requireUuid(request.clientMutationId);
    requireUuid(request.requestId);
    requireUuid(request.auditEventId);
    requireUuid(request.mutationResultId);
    requireInteger(request.keyVersion, 1, MAX_KEY_VERSION);
    requireInteger(request.envelopeVersion, 1, 1);
    requireInteger(request.serverTime, 0, Number.MAX_SAFE_INTEGER);
    requireInteger(request.ciphertextBytes, MIN_CIPHERTEXT_BYTES, MAX_CIPHERTEXT_BYTES);

    const baseRevision = requireInteger(request.baseRevision, 0, MAX_REVISION - 1);
    if (request.operation === 'create' && baseRevision !== 0) invalid();
    if (request.operation !== 'create' && baseRevision < 1) invalid();

    if (!(request.ciphertextEnvelope instanceof Uint8Array)
        || request.ciphertextEnvelope.length < MIN_CIPHERTEXT_BYTES
        || request.ciphertextEnvelope.length > MAX_ENVELOPE_BYTES) invalid();
    if (!(request.ciphertextDigest instanceof Uint8Array) || request.ciphertextDigest.length !== 32) invalid();
    if (request.ciphertextEnvelope.length !== request.ciphertextBytes) invalid();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(bytes.length);
    new Uint8Array(copy).set(bytes);
    return copy;
}

function buildBindings(request: DocumentMutationRequest, fingerprint: ArrayBuffer,
    revision: number, resultJson: string): RecipeBindings {
    const envelope = toArrayBuffer(request.ciphertextEnvelope);
    const digest = toArrayBuffer(request.ciphertextDigest);
    const expiresAt = request.serverTime + IDEMPOTENCY_WINDOW_MS;

    const guardHead = [request.mutationResultId, request.actorUserId, request.actorDeviceId,
        request.workspaceId, request.clientMutationId, fingerprint, request.documentId, resultJson];
    const guardTail = [request.serverTime, expiresAt];
    const audit = [request.auditEventId, request.workspaceId, request.actorUserId,
        request.actorDeviceId, request.documentId, request.requestId, request.serverTime];
    const result = [request.mutationResultId];

    if (request.operation === 'create') {
        return {
            guard: [...guardHead, request.workspaceId, request.actorUserId, request.actorDeviceId,
                request.keyVersion, request.documentId, ...guardTail],
            domain: [
                [request.documentId, request.workspaceId, request.keyVersion, digest,
                    request.ciphertextBytes, request.actorUserId, request.serverTime, request.serverTime],
                [request.documentId, request.workspaceId, request.keyVersion, envelope, digest,
                    request.ciphertextBytes, request.actorUserId, request.actorDeviceId,
                    request.clientMutationId, request.serverTime]
            ],
            audit, result
        };
    }

    const guard = [...guardHead, request.workspaceId, request.actorUserId, request.actorDeviceId,
        request.documentId, request.baseRevision, request.keyVersion, ...guardTail];

    if (request.operation === 'update') {
        return {
            guard,
            domain: [
                [request.documentId, request.workspaceId, revision, request.baseRevision,
                    request.keyVersion, envelope, digest, request.ciphertextBytes,
                    request.actorUserId, request.actorDeviceId, request.clientMutationId, request.serverTime],
                [revision, request.keyVersion, digest, request.ciphertextBytes, request.serverTime,
                    request.documentId, request.workspaceId, request.baseRevision]
            ],
            audit, result
        };
    }

    return {
        guard,
        domain: [
            [request.documentId, request.workspaceId, revision, request.baseRevision,
                request.keyVersion, envelope, digest, request.ciphertextBytes,
                request.actorUserId, request.actorDeviceId, request.clientMutationId, request.serverTime],
            [revision, request.keyVersion, digest, request.ciphertextBytes, request.serverTime,
                request.serverTime, request.documentId, request.workspaceId, request.baseRevision]
        ],
        audit, result
    };
}

/**
 * A guard failure is indistinguishable at the database level between "you are not
 * allowed" and "your base revision is stale", because both make the same SELECT
 * return no row. Only a caller that has already been authorized elsewhere may be
 * told it was a revision conflict; everyone else must receive the shared
 * not-found mapping so the response discloses no resource existence.
 */
async function classifyGuardFailure(database: D1Database,
    request: DocumentMutationRequest): Promise<never> {
    const authorized = await database.prepare(
        `SELECT 1 AS ok FROM memberships m
         JOIN devices d ON d.user_id = m.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
           AND m.role IN ('owner', 'admin', 'editor')
           AND d.id = ? AND d.state = 'active' AND u.status = 'active'
         LIMIT 1`
    ).bind(request.workspaceId, request.actorUserId, request.actorDeviceId).first<number>('ok');
    if (authorized !== 1) throw new DocumentMutationError(DOCUMENT_ERRORS.notFound, 404);

    if (request.operation !== 'create') {
        const row = await database.prepare(
            `SELECT current_revision AS revision, state FROM documents
             WHERE id = ? AND workspace_id = ? LIMIT 1`
        ).bind(request.documentId, request.workspaceId)
            .first<{ revision: number; state: string }>();
        if (row === null || row.state !== 'active') {
            throw new DocumentMutationError(DOCUMENT_ERRORS.notFound, 404);
        }
        if (row.revision !== request.baseRevision) {
            throw new DocumentMutationError(DOCUMENT_ERRORS.conflict, 409, {
                submittedBaseRevision: request.baseRevision,
                currentRevision: row.revision
            });
        }
    }

    const keyVersion = await database.prepare(
        `SELECT key_version AS version FROM workspace_key_versions
         WHERE workspace_id = ? AND state = 'current' LIMIT 1`
    ).bind(request.workspaceId).first<number>('version');
    if (typeof keyVersion === 'number' && keyVersion !== request.keyVersion) {
        throw new DocumentMutationError(DOCUMENT_ERRORS.keyVersion, 409, {
            expectedKeyVersion: keyVersion,
            submittedKeyVersion: request.keyVersion
        });
    }
    throw new DocumentMutationError(DOCUMENT_ERRORS.notFound, 404);
}

export async function executeDocumentMutation(
    database: D1Database,
    request: DocumentMutationRequest
): Promise<DocumentMutationOutcome> {
    validate(request);

    const revision = request.operation === 'create' ? 1 : request.baseRevision + 1;
    const fingerprintBytes = await computeRequestFingerprint({
        actorUserId: request.actorUserId,
        actorDeviceId: request.actorDeviceId,
        workspaceId: request.workspaceId,
        operation: request.operation,
        documentId: request.documentId,
        baseRevision: request.baseRevision,
        keyVersion: request.keyVersion,
        envelopeVersion: request.envelopeVersion,
        ciphertextDigest: request.ciphertextDigest,
        ciphertextBytes: request.ciphertextBytes
    });
    const fingerprint = toArrayBuffer(fingerprintBytes);

    const httpStatus = request.operation === 'create' ? 201 : 200;
    const resultJson = JSON.stringify({
        documentId: request.documentId,
        revision,
        operation: request.operation,
        occurredAt: request.serverTime,
        clientMutationId: request.clientMutationId
    });

    const recipeOperation = RECIPE_OPERATION[request.operation];
    const bindings = buildBindings(request, fingerprint, revision, resultJson);
    const build = request.operation === 'create'
        ? buildDocumentCreateRecipe
        : request.operation === 'update' ? buildDocumentMutationRecipe : buildDocumentTombstoneRecipe;

    const scope: ReplayScope = {
        actorUserId: request.actorUserId,
        actorDeviceId: request.actorDeviceId,
        workspaceId: request.workspaceId,
        operation: recipeOperation,
        clientMutationId: request.clientMutationId,
        requestFingerprint: fingerprint,
        serverTime: request.serverTime
    };

    let stored: StoredMutationResult;
    let replayed = false;
    try {
        // resolveAuthorizedReplay runs first inside executeIdempotentRecipe, so a
        // stored result is only returned after current authority is re-checked.
        const before = await database.prepare(
            `SELECT 1 AS ok FROM mutation_results
             WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
               AND operation = ? AND client_mutation_id = ? LIMIT 1`
        ).bind(request.actorUserId, request.actorDeviceId, request.workspaceId,
            recipeOperation, request.clientMutationId).first<number>('ok');
        replayed = before === 1;
        stored = await executeIdempotentRecipe(database, build(database, bindings), scope);
    } catch (error) {
        if (error instanceof PersistenceError) {
            if (error.code === 'IDEMPOTENCY_KEY_REUSED') {
                throw new DocumentMutationError(DOCUMENT_ERRORS.idempotencyReuse, 409);
            }
            if (error.code === 'IDEMPOTENCY_EXPIRED') {
                throw new DocumentMutationError(DOCUMENT_ERRORS.idempotencyExpired, 409);
            }
            if (error.code === 'AUTHORITY_REVOKED') {
                throw new DocumentMutationError(DOCUMENT_ERRORS.notFound, 404);
            }
            await classifyGuardFailure(database, request);
        }
        throw error;
    }

    const parsed = JSON.parse(stored.resultJson) as {
        documentId: string; revision: number; operation: DocumentOperation;
        occurredAt: number; clientMutationId: string;
    };
    return {
        documentId: parsed.documentId,
        revision: parsed.revision,
        operation: parsed.operation,
        occurredAt: parsed.occurredAt,
        clientMutationId: parsed.clientMutationId,
        replayed,
        httpStatus: replayed ? stored.httpStatus : httpStatus
    };
}
