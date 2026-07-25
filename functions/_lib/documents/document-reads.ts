// CF-P6-005 — Authorized document reads and revision history.
//
// Four read routes: list documents, read one document, list its revisions, and
// read one historical revision. Reads require an active member with an active
// device; unlike mutations they are open to Viewers, which is the point of the
// sprint's G2 scenario.
//
// Three properties this module has to hold:
//   * every query is workspace-scoped in SQL, so a document identifier from
//     another workspace simply matches nothing;
//   * every denial — non-member, removed member, revoked device, wrong
//     workspace, unknown document, hidden tombstone — returns one identical
//     RESOURCE_NOT_FOUND, so response shape cannot be used to probe existence;
//   * pagination cursors are HMAC-signed, TTL-bounded, and bound to the issuing
//     workspace and route, so a cursor cannot be forged or replayed across
//     workspaces.
//
// Responses carry no-store and a Service-Worker bypass, because a cached
// ciphertext page would outlive the authorization that produced it.

import { hmacSign, hmacVerify } from '../identity/crypto';
import { decodeBase64Url, decodeUtf8, encodeBase64Url, utf8 } from '../identity/encoding';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR_CONTEXT = 'docvault:document-cursor:v1:';
const CURSOR_TTL_MS = 15 * 60 * 1_000;
const CURSOR_MAX_LENGTH = 2_048;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_REVISION = 9_007_199_254_740_991;

export const DOCUMENT_READ_ROUTES = Object.freeze(['documents', 'document-revisions'] as const);
export type DocumentCursorRoute = (typeof DOCUMENT_READ_ROUTES)[number];

export class DocumentReadError extends Error {
    readonly code: 'RESOURCE_NOT_FOUND' | 'VALIDATION_FAILED' | 'INVALID_CURSOR';
    readonly httpStatus: number;
    constructor(code: 'RESOURCE_NOT_FOUND' | 'VALIDATION_FAILED' | 'INVALID_CURSOR') {
        super(code);
        this.name = 'DocumentReadError';
        this.code = code;
        this.httpStatus = code === 'RESOURCE_NOT_FOUND' ? 404 : 400;
    }
}

const notFound = (): never => { throw new DocumentReadError('RESOURCE_NOT_FOUND'); };
const invalid = (): never => { throw new DocumentReadError('VALIDATION_FAILED'); };
const badCursor = (): never => { throw new DocumentReadError('INVALID_CURSOR'); };

function requireUuid(value: unknown): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) invalid();
    return value as string;
}

interface CursorPayload {
    readonly v: 1;
    readonly route: DocumentCursorRoute;
    readonly workspaceId: string;
    readonly documentId: string | null;
    readonly position: number | string;
    readonly issuedAt: number;
    readonly expiresAt: number;
}

export interface DocumentCursorCodec {
    issue(payload: Omit<CursorPayload, 'v' | 'issuedAt' | 'expiresAt'>, now: number): Promise<string>;
    open(encoded: string, expected: { route: DocumentCursorRoute; workspaceId: string; documentId: string | null },
        now: number): Promise<CursorPayload>;
}

/**
 * Opaque cursor. The signature covers the route, workspace, and document, so a
 * cursor issued for one workspace fails verification when replayed against
 * another rather than silently paginating someone else's data.
 */
export function createDocumentCursorCodec(key: Uint8Array): DocumentCursorCodec {
    const codec: DocumentCursorCodec = {
        async issue(payload, now) {
            const body: CursorPayload = {
                v: 1,
                route: payload.route,
                workspaceId: payload.workspaceId,
                documentId: payload.documentId,
                position: payload.position,
                issuedAt: now,
                expiresAt: now + CURSOR_TTL_MS
            };
            const encoded = encodeBase64Url(utf8(JSON.stringify(body)));
            const signature = encodeBase64Url(await hmacSign(key, utf8(CURSOR_CONTEXT + encoded)));
            return `${encoded}.${signature}`;
        },
        async open(encoded, expected, now) {
            if (typeof encoded !== 'string' || encoded.length === 0
                || encoded.length > CURSOR_MAX_LENGTH) badCursor();
            const parts = encoded.split('.');
            if (parts.length !== 2) badCursor();
            const [body, signature] = parts;
            let verified = false;
            try {
                verified = await hmacVerify(key, utf8(CURSOR_CONTEXT + body), decodeBase64Url(signature));
            } catch { badCursor(); }
            if (!verified) badCursor();

            let value: unknown;
            try { value = JSON.parse(decodeUtf8(decodeBase64Url(body))); } catch { return badCursor(); }
            const payload = value as CursorPayload;
            if (payload?.v !== 1
                || !DOCUMENT_READ_ROUTES.includes(payload.route)
                || payload.route !== expected.route
                || payload.workspaceId !== expected.workspaceId
                || payload.documentId !== expected.documentId
                || !Number.isSafeInteger(payload.issuedAt) || !Number.isSafeInteger(payload.expiresAt)
                || payload.expiresAt <= payload.issuedAt) badCursor();
            if (now >= payload.expiresAt) badCursor();
            return payload;
        }
    };
    return Object.freeze(codec);
}

export interface ReaderIdentity {
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
}

export interface DocumentSummary {
    readonly documentId: string;
    readonly revision: number;
    readonly keyVersion: number;
    readonly envelopeVersion: number;
    readonly ciphertextByteLength: number;
    readonly state: 'active' | 'tombstoned';
    readonly createdAt: number;
    readonly updatedAt: number;
}

export interface RevisionView {
    readonly documentId: string;
    readonly revision: number;
    readonly baseRevision: number;
    readonly operation: 'create' | 'update' | 'delete';
    readonly keyVersion: number;
    readonly envelopeVersion: number;
    readonly ciphertextByteLength: number;
    readonly actorUserId: string;
    readonly deviceId: string;
    readonly clientMutationId: string;
    readonly occurredAt: number;
    readonly tombstone: boolean;
    readonly payload?: string;
}

export interface Page<T> {
    readonly items: readonly T[];
    readonly nextCursor: string | null;
}

/**
 * A read requires an active membership of any role plus an active device owned
 * by the same user, and an active workspace. Role is deliberately unconstrained
 * here: a Viewer must be able to read.
 */
async function requireReader(database: D1Database, identity: ReaderIdentity): Promise<void> {
    const ok = await database.prepare(
        `SELECT 1 AS ok FROM memberships m
         JOIN devices d ON d.user_id = m.user_id
         JOIN users u ON u.id = m.user_id
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
           AND d.id = ? AND d.state = 'active' AND d.user_id = m.user_id
           AND u.status = 'active' AND w.state = 'active' AND w.deleted_at IS NULL
         LIMIT 1`
    ).bind(identity.workspaceId, identity.actorUserId, identity.actorDeviceId).first<number>('ok');
    if (ok !== 1) notFound();
}

function pageSize(requested: number | undefined): number {
    if (requested === undefined) return DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(requested) || requested < 1 || requested > MAX_PAGE_SIZE) invalid();
    return requested;
}

function toBytes(value: unknown): number {
    return typeof value === 'number' ? value : 0;
}

export async function listDocuments(database: D1Database, identity: ReaderIdentity,
    options: { limit?: number; cursor?: string; codec: DocumentCursorCodec; now: number }
): Promise<Page<DocumentSummary>> {
    requireUuid(identity.workspaceId);
    requireUuid(identity.actorUserId);
    requireUuid(identity.actorDeviceId);
    await requireReader(database, identity);

    const limit = pageSize(options.limit);
    let after = '';
    if (options.cursor !== undefined) {
        const cursor = await options.codec.open(options.cursor,
            { route: 'documents', workspaceId: identity.workspaceId, documentId: null }, options.now);
        after = String(cursor.position);
    }

    const rows = await database.prepare(
        `SELECT id, current_revision AS revision, current_key_version AS keyVersion,
           envelope_version AS envelopeVersion, ciphertext_bytes AS bytes, state,
           created_at AS createdAt, updated_at AS updatedAt
         FROM documents
         WHERE workspace_id = ? AND (? = '' OR id > ?)
         ORDER BY id ASC LIMIT ?`
    ).bind(identity.workspaceId, after, after, limit + 1).all<Record<string, unknown>>();

    const results = rows.results.slice(0, limit);
    const items: DocumentSummary[] = results.map((row) => ({
        documentId: String(row.id),
        revision: Number(row.revision),
        keyVersion: Number(row.keyVersion),
        envelopeVersion: Number(row.envelopeVersion),
        ciphertextByteLength: toBytes(row.bytes),
        state: row.state === 'tombstoned' ? 'tombstoned' : 'active',
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt)
    }));

    const nextCursor = rows.results.length > limit && items.length > 0
        ? await options.codec.issue({
            route: 'documents', workspaceId: identity.workspaceId, documentId: null,
            position: items[items.length - 1].documentId
        }, options.now)
        : null;
    return { items, nextCursor };
}

export async function readDocument(database: D1Database, identity: ReaderIdentity,
    documentId: string): Promise<DocumentSummary & { payload: string | null }> {
    requireUuid(documentId);
    await requireReader(database, identity);

    const row = await database.prepare(
        `SELECT d.id, d.current_revision AS revision, d.current_key_version AS keyVersion,
           d.envelope_version AS envelopeVersion, d.ciphertext_bytes AS bytes, d.state,
           d.created_at AS createdAt, d.updated_at AS updatedAt, r.ciphertext_envelope AS envelope
         FROM documents d
         LEFT JOIN document_revisions r
           ON r.document_id = d.id AND r.workspace_id = d.workspace_id AND r.revision = d.current_revision
         WHERE d.id = ? AND d.workspace_id = ? LIMIT 1`
    ).bind(documentId, identity.workspaceId).first<Record<string, unknown>>();
    if (row === null) notFound();

    const tombstoned = row!.state === 'tombstoned';
    return {
        documentId: String(row!.id),
        revision: Number(row!.revision),
        keyVersion: Number(row!.keyVersion),
        envelopeVersion: Number(row!.envelopeVersion),
        ciphertextByteLength: toBytes(row!.bytes),
        state: tombstoned ? 'tombstoned' : 'active',
        createdAt: Number(row!.createdAt),
        updatedAt: Number(row!.updatedAt),
        // A tombstone returns metadata only. The ciphertext of a deleted document
        // is retained for audit but is not served back through the read route.
        payload: tombstoned || row!.envelope == null
            ? null
            : encodeBase64Url(new Uint8Array(row!.envelope as ArrayBuffer))
    };
}

export async function listRevisions(database: D1Database, identity: ReaderIdentity,
    documentId: string,
    options: { limit?: number; cursor?: string; codec: DocumentCursorCodec; now: number }
): Promise<Page<RevisionView>> {
    requireUuid(documentId);
    await requireReader(database, identity);

    const exists = await database.prepare(
        'SELECT 1 AS ok FROM documents WHERE id = ? AND workspace_id = ? LIMIT 1'
    ).bind(documentId, identity.workspaceId).first<number>('ok');
    if (exists !== 1) notFound();

    const limit = pageSize(options.limit);
    let after = 0;
    if (options.cursor !== undefined) {
        const cursor = await options.codec.open(options.cursor,
            { route: 'document-revisions', workspaceId: identity.workspaceId, documentId }, options.now);
        after = Number(cursor.position);
    }

    const rows = await database.prepare(
        `SELECT document_id AS documentId, revision, base_revision AS baseRevision, operation,
           key_version AS keyVersion, ciphertext_bytes AS bytes, actor_user_id AS actorUserId,
           actor_device_id AS deviceId, client_mutation_id AS clientMutationId, server_time AS occurredAt
         FROM document_revisions
         WHERE document_id = ? AND workspace_id = ? AND revision > ?
         ORDER BY revision ASC LIMIT ?`
    ).bind(documentId, identity.workspaceId, after, limit + 1).all<Record<string, unknown>>();

    const results = rows.results.slice(0, limit);
    const items: RevisionView[] = results.map((row) => ({
        documentId: String(row.documentId),
        revision: Number(row.revision),
        baseRevision: Number(row.baseRevision),
        operation: row.operation as 'create' | 'update' | 'delete',
        keyVersion: Number(row.keyVersion),
        envelopeVersion: 1,
        ciphertextByteLength: toBytes(row.bytes),
        actorUserId: String(row.actorUserId),
        deviceId: String(row.deviceId),
        clientMutationId: String(row.clientMutationId),
        occurredAt: Number(row.occurredAt),
        tombstone: row.operation === 'delete'
    }));

    const nextCursor = rows.results.length > limit && items.length > 0
        ? await options.codec.issue({
            route: 'document-revisions', workspaceId: identity.workspaceId, documentId,
            position: items[items.length - 1].revision
        }, options.now)
        : null;
    return { items, nextCursor };
}

export async function readRevision(database: D1Database, identity: ReaderIdentity,
    documentId: string, revision: number): Promise<RevisionView> {
    requireUuid(documentId);
    if (!Number.isInteger(revision) || revision < 1 || revision > MAX_REVISION) invalid();
    await requireReader(database, identity);

    const row = await database.prepare(
        `SELECT document_id AS documentId, revision, base_revision AS baseRevision, operation,
           key_version AS keyVersion, ciphertext_envelope AS envelope, ciphertext_bytes AS bytes,
           actor_user_id AS actorUserId, actor_device_id AS deviceId,
           client_mutation_id AS clientMutationId, server_time AS occurredAt
         FROM document_revisions
         WHERE document_id = ? AND workspace_id = ? AND revision = ? LIMIT 1`
    ).bind(documentId, identity.workspaceId, revision).first<Record<string, unknown>>();
    if (row === null) notFound();

    const isTombstone = row!.operation === 'delete';
    return {
        documentId: String(row!.documentId),
        revision: Number(row!.revision),
        baseRevision: Number(row!.baseRevision),
        operation: row!.operation as 'create' | 'update' | 'delete',
        keyVersion: Number(row!.keyVersion),
        envelopeVersion: 1,
        ciphertextByteLength: toBytes(row!.bytes),
        actorUserId: String(row!.actorUserId),
        deviceId: String(row!.deviceId),
        clientMutationId: String(row!.clientMutationId),
        occurredAt: Number(row!.occurredAt),
        tombstone: isTombstone,
        payload: isTombstone ? undefined : encodeBase64Url(new Uint8Array(row!.envelope as ArrayBuffer))
    };
}

/**
 * Headers for every document read response. A cached ciphertext page would
 * outlive the authorization that produced it, so nothing here is storable and
 * the Service Worker is told to stay out of the way.
 */
export function documentReadHeaders(requestId: string): Headers {
    return new Headers({
        'Cache-Control': 'no-store, private',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'Content-Type': 'application/json; charset=utf-8',
        'Expires': '0',
        'Pragma': 'no-cache',
        'Referrer-Policy': 'no-referrer',
        'Service-Worker-Allowed': 'none',
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Request-ID': requestId
    });
}

export const DOCUMENT_READ_LIMITS = Object.freeze({
    defaultPageSize: DEFAULT_PAGE_SIZE,
    maximumPageSize: MAX_PAGE_SIZE,
    cursorTtlMilliseconds: CURSOR_TTL_MS,
    cursorMaximumLength: CURSOR_MAX_LENGTH
});
