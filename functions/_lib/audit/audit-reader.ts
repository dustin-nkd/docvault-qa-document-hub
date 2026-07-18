import { openAuthorizationSession, readBounded } from '../persistence';
import { authorizeWorkspaceAction } from '../rbac';
import { type AuditCursorCodec, type AuditCursorFilters } from './cursor';
import {
    isAuditEventType,
    validateAuditEventRecord,
    type AuditEventType,
    type AuditViewOutcome
} from './event-registry';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAXIMUM_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;

export class AuditReadError extends Error {
    readonly code: 'AUDIT_INPUT_INVALID' | 'AUDIT_CURSOR_INVALID'
        | 'AUDIT_OPERATION_NOT_PERMITTED' | 'AUDIT_UNAVAILABLE';

    constructor(code: AuditReadError['code']) {
        super(code);
        this.name = 'AuditReadError';
        this.code = code;
    }
}

export interface ListAuditEventsInput {
    readonly actorUserId: string;
    readonly actingDeviceId: string | null;
    readonly workspaceId: string;
    readonly serverTime: number;
    readonly eventType?: string;
    readonly occurredFrom?: string;
    readonly occurredTo?: string;
    readonly limit?: number;
    readonly cursor?: string;
}

export interface AuditEventView {
    readonly eventId: string;
    readonly workspaceId: string;
    readonly schemaVersion: number;
    readonly eventType: AuditEventType;
    readonly occurredAt: string;
    readonly order: number;
    readonly requestId: string;
    readonly actorUserId?: string;
    readonly deviceId?: string;
    readonly targetType: string;
    readonly targetId: string;
    readonly outcome: AuditViewOutcome;
    readonly reasonCode: string;
    readonly approvedBefore?: Readonly<Record<string, string | boolean | number>>;
    readonly approvedAfter?: Readonly<Record<string, string | boolean | number>>;
    readonly linkedEventId?: string;
}

export interface ListAuditEventsResult {
    readonly items: readonly AuditEventView[];
    readonly nextCursor: string | null;
}

interface AuditRow {
    sequence: number;
    event_id: string;
    schema_version: number;
    workspace_id: string;
    event_type: string;
    outcome: string;
    reason_code: string;
    actor_user_id: string | null;
    actor_device_id: string | null;
    target_type: string;
    target_id: string;
    request_id: string;
    server_time: number;
    metadata_json: string;
    correction_of_event_id: string | null;
    related_event_id: string | null;
}

const invalid = (): never => { throw new AuditReadError('AUDIT_INPUT_INVALID'); };

function parseTimestamp(value: string | undefined, fallback: number): number {
    if (value === undefined) return fallback;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return invalid();
    const parsed = Date.parse(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || new Date(parsed).toISOString() !== value) return invalid();
    return parsed;
}

function mapAuditRow(row: Record<string, unknown>): AuditEventView {
    const value = row as Partial<AuditRow>;
    const { sequence, server_time: serverTime, event_id: eventId, schema_version: schemaVersion,
        workspace_id: workspaceId, event_type: eventType, outcome, reason_code: reasonCode,
        actor_user_id: actorUserId, actor_device_id: actorDeviceId, target_type: targetType,
        target_id: targetId, request_id: requestId, metadata_json: metadataJson,
        correction_of_event_id: correctionOfEventId, related_event_id: relatedEventId } = value;
    if (!Number.isSafeInteger(sequence) || typeof sequence !== 'number'
        || !Number.isSafeInteger(serverTime) || typeof serverTime !== 'number'
        || typeof eventId !== 'string' || typeof schemaVersion !== 'number'
        || typeof workspaceId !== 'string' || typeof eventType !== 'string'
        || typeof outcome !== 'string' || typeof reasonCode !== 'string'
        || (actorUserId !== null && typeof actorUserId !== 'string')
        || (actorDeviceId !== null && typeof actorDeviceId !== 'string')
        || typeof targetType !== 'string' || typeof targetId !== 'string'
        || typeof requestId !== 'string' || typeof metadataJson !== 'string'
        || (correctionOfEventId !== null && typeof correctionOfEventId !== 'string')
        || (relatedEventId !== null && typeof relatedEventId !== 'string')) {
        throw new AuditReadError('AUDIT_UNAVAILABLE');
    }
    let projection;
    try {
        projection = validateAuditEventRecord({
            eventId,
            schemaVersion,
            eventType,
            outcome,
            reasonCode,
            actorUserId,
            actorDeviceId,
            targetType,
            targetId,
            requestId,
            metadataJson,
            correctionOfEventId,
            relatedEventId
        });
    } catch {
        throw new AuditReadError('AUDIT_UNAVAILABLE');
    }
    const result: AuditEventView = {
        eventId,
        workspaceId,
        schemaVersion,
        eventType: projection.eventType,
        occurredAt: new Date(serverTime).toISOString(),
        order: sequence,
        requestId,
        targetType,
        targetId,
        outcome: projection.outcome,
        reasonCode
    };
    if (actorUserId !== null) Object.assign(result, { actorUserId });
    if (actorDeviceId !== null) Object.assign(result, { deviceId: actorDeviceId });
    if (projection.approvedBefore !== undefined) {
        Object.assign(result, { approvedBefore: projection.approvedBefore });
    }
    if (projection.approvedAfter !== undefined) {
        Object.assign(result, { approvedAfter: projection.approvedAfter });
    }
    if (projection.linkedEventId !== undefined) {
        Object.assign(result, { linkedEventId: projection.linkedEventId });
    }
    return Object.freeze(result);
}

export async function listAuditEvents(database: D1Database, input: ListAuditEventsInput,
    cursorCodec: AuditCursorCodec): Promise<ListAuditEventsResult> {
    if (!UUID_V4.test(input.actorUserId) || !UUID_V4.test(input.workspaceId)
        || (input.actingDeviceId !== null && !UUID_V4.test(input.actingDeviceId))
        || !Number.isSafeInteger(input.serverTime) || input.serverTime < 0) invalid();
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_PAGE_SIZE) invalid();
    const eventType = input.eventType;
    if (eventType !== undefined && !isAuditEventType(eventType)) {
        throw new AuditReadError('AUDIT_INPUT_INVALID');
    }
    const filters: AuditCursorFilters = {
        eventType: eventType ?? null,
        occurredFrom: parseTimestamp(input.occurredFrom, 0),
        occurredTo: parseTimestamp(input.occurredTo, input.serverTime)
    };
    if (filters.occurredFrom > filters.occurredTo || filters.occurredTo > input.serverTime) invalid();

    const decision = await authorizeWorkspaceAction(database, {
        actorUserId: input.actorUserId,
        actingDeviceId: input.actingDeviceId,
        workspaceId: input.workspaceId,
        action: 'audit.read'
    });
    if (!decision.allowed) {
        throw new AuditReadError(['RESOURCE_NOT_FOUND', 'UNAUTHENTICATED'].includes(decision.code)
            ? 'AUDIT_UNAVAILABLE' : 'AUDIT_OPERATION_NOT_PERMITTED');
    }

    let occurredAt = input.serverTime;
    let order = Number.MAX_SAFE_INTEGER;
    if (input.cursor !== undefined) {
        try {
            const position = await cursorCodec.verify(input.cursor, {
                workspaceId: input.workspaceId, filters
            }, input.serverTime);
            occurredAt = position.occurredAt;
            order = position.order;
        } catch {
            throw new AuditReadError('AUDIT_CURSOR_INVALID');
        }
    }

    const bindings: unknown[] = [input.workspaceId, filters.occurredFrom, filters.occurredTo,
        occurredAt, occurredAt, order];
    const eventClause = filters.eventType === null ? '' : ' AND event_type = ?';
    if (filters.eventType !== null) bindings.push(filters.eventType);
    const session = openAuthorizationSession(database);
    const baseSql = `FROM audit_events
         WHERE workspace_id = ? AND server_time >= ? AND server_time <= ?
           AND (server_time < ? OR (server_time = ? AND sequence < ?))${eventClause}`;
    let items: readonly AuditEventView[];
    try {
        items = await readBounded(session.prepare(
            `SELECT sequence, event_id, schema_version, workspace_id, event_type, outcome, reason_code,
                    actor_user_id, actor_device_id, target_type, target_id, request_id, server_time,
                    metadata_json, correction_of_event_id, related_event_id
             ${baseSql}
             ORDER BY server_time DESC, sequence DESC LIMIT ?`
        ).bind(...bindings, limit), limit, mapAuditRow);
    } catch {
        throw new AuditReadError('AUDIT_UNAVAILABLE');
    }

    let nextCursor: string | null = null;
    const last = items.at(-1);
    if (last !== undefined) {
        try {
            const lastTime = Date.parse(last.occurredAt);
            const moreBindings: unknown[] = [input.workspaceId, filters.occurredFrom, filters.occurredTo,
                lastTime, lastTime, last.order];
            if (filters.eventType !== null) moreBindings.push(filters.eventType);
            const hasMore = await session.prepare(`SELECT 1 AS present ${baseSql} LIMIT 1`)
                .bind(...moreBindings).first<number>('present');
            if (hasMore === 1) {
                nextCursor = await cursorCodec.issue({ workspaceId: input.workspaceId, filters }, {
                    occurredAt: lastTime, order: last.order
                }, input.serverTime);
            }
        } catch {
            throw new AuditReadError('AUDIT_UNAVAILABLE');
        }
    }
    return { items, nextCursor };
}
