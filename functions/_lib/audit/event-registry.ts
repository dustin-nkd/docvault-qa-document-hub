const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLES: readonly string[] = Object.freeze(['owner', 'admin', 'editor', 'viewer']);

export const AUDIT_EVENT_TYPES = Object.freeze([
    'workspace.created',
    'invitation.created',
    'invitation.replaced',
    'invitation.revoked',
    'invitation.accepted',
    'membership.changed',
    'membership.role_changed',
    'membership.removed',
    'ownership.transferred',
    'envelope.provisioned',
    'document.updated',
    'rotation.committed',
    'audit.corrected'
] as const);

export type AuditEventType = typeof AUDIT_EVENT_TYPES[number];
export type AuditTargetType = 'workspace' | 'membership' | 'invitation' | 'device'
    | 'key_version' | 'key_envelope' | 'document' | 'session' | 'retention_hold' | 'system';
export type AuditStoredOutcome = 'success' | 'denied' | 'failure' | 'correction';
export type AuditViewOutcome = 'succeeded' | 'denied' | 'failed' | 'corrected';

export class AuditRegistryError extends Error {
    constructor() {
        super('AUDIT_REGISTRY_INVALID');
        this.name = 'AuditRegistryError';
    }
}

export interface AuditRegistryInput {
    readonly eventId: string;
    readonly schemaVersion: number;
    readonly eventType: string;
    readonly outcome: string;
    readonly reasonCode: string;
    readonly actorUserId: string | null;
    readonly actorDeviceId: string | null;
    readonly targetType: string;
    readonly targetId: string;
    readonly requestId: string;
    readonly metadataJson: string;
    readonly correctionOfEventId: string | null;
    readonly relatedEventId: string | null;
}

export interface AuditRegistryProjection {
    readonly eventType: AuditEventType;
    readonly outcome: AuditViewOutcome;
    readonly approvedBefore?: Readonly<Record<string, string | boolean | number>>;
    readonly approvedAfter?: Readonly<Record<string, string | boolean | number>>;
    readonly linkedEventId?: string;
}

const EMPTY_METADATA_EVENTS: readonly AuditEventType[] = Object.freeze([
    'workspace.created', 'invitation.created', 'invitation.replaced', 'invitation.revoked',
    'invitation.accepted', 'membership.changed', 'envelope.provisioned', 'document.updated',
    'rotation.committed', 'audit.corrected'
]);

const TARGETS: Readonly<Record<AuditEventType, AuditTargetType>> = Object.freeze({
    'workspace.created': 'workspace',
    'invitation.created': 'invitation',
    'invitation.replaced': 'invitation',
    'invitation.revoked': 'invitation',
    'invitation.accepted': 'invitation',
    'membership.changed': 'membership',
    'membership.role_changed': 'membership',
    'membership.removed': 'membership',
    'ownership.transferred': 'membership',
    'envelope.provisioned': 'key_envelope',
    'document.updated': 'document',
    'rotation.committed': 'key_version',
    'audit.corrected': 'system'
});

function fail(): never {
    throw new AuditRegistryError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    return actual.length === expected.length
        && actual.every((field, index) => field === [...expected].sort()[index]);
}

function isRole(value: unknown): value is string {
    return typeof value === 'string' && ROLES.includes(value);
}

export function isAuditEventType(value: string): value is AuditEventType {
    return AUDIT_EVENT_TYPES.some(eventType => eventType === value);
}

export function validateAuditEventRecord(input: AuditRegistryInput): AuditRegistryProjection {
    const expectedTarget = isAuditEventType(input.eventType) ? TARGETS[input.eventType] : null;
    const validTargetId = expectedTarget === 'key_version'
        ? /^[1-9][0-9]{0,9}$/.test(input.targetId)
        : UUID_V4.test(input.targetId);
    if (!UUID_V4.test(input.eventId) || !UUID_V4.test(input.requestId)
        || input.schemaVersion !== 8 || !isAuditEventType(input.eventType)
        || input.targetType !== expectedTarget || !validTargetId
        || (input.actorUserId !== null && !UUID_V4.test(input.actorUserId))
        || (input.actorDeviceId !== null && (!UUID_V4.test(input.actorDeviceId)
            || input.actorUserId === null))) fail();

    const isCorrection = input.eventType === 'audit.corrected';
    if (isCorrection) {
        if (input.outcome !== 'correction' || input.reasonCode !== 'corrected'
            || input.correctionOfEventId === null || !UUID_V4.test(input.correctionOfEventId)
            || input.relatedEventId !== null) fail();
    } else if (input.outcome !== 'success' || input.reasonCode !== 'committed'
        || input.correctionOfEventId !== null
        || (input.relatedEventId !== null && !UUID_V4.test(input.relatedEventId))) fail();

    let metadata: unknown;
    try {
        metadata = JSON.parse(input.metadataJson);
    } catch {
        fail();
    }
    if (!isRecord(metadata)) fail();

    let projection: AuditRegistryProjection;
    if (EMPTY_METADATA_EVENTS.includes(input.eventType)) {
        if (!exactKeys(metadata, [])) fail();
        projection = {
            eventType: input.eventType,
            outcome: isCorrection ? 'corrected' : 'succeeded'
        };
    } else if (input.eventType === 'membership.role_changed') {
        if (!exactKeys(metadata, ['fromRole', 'toRole'])
            || !isRole(metadata.fromRole) || !isRole(metadata.toRole)
            || metadata.fromRole === 'owner' || metadata.toRole === 'owner') fail();
        projection = {
            eventType: input.eventType,
            outcome: 'succeeded',
            approvedBefore: Object.freeze({ role: metadata.fromRole }),
            approvedAfter: Object.freeze({ role: metadata.toRole })
        };
    } else if (input.eventType === 'membership.removed') {
        if (!exactKeys(metadata, ['priorRole', 'rotationRequired'])
            || !isRole(metadata.priorRole) || metadata.priorRole === 'owner'
            || metadata.rotationRequired !== true) fail();
        projection = {
            eventType: input.eventType,
            outcome: 'succeeded',
            approvedBefore: Object.freeze({ role: metadata.priorRole, state: 'active' }),
            approvedAfter: Object.freeze({ state: 'removed', rotationRequired: true })
        };
    } else {
        if (input.eventType !== 'ownership.transferred'
            || !exactKeys(metadata, ['priorOwnerUserId', 'priorTargetRole'])
            || typeof metadata.priorOwnerUserId !== 'string'
            || !UUID_V4.test(metadata.priorOwnerUserId)
            || !isRole(metadata.priorTargetRole) || metadata.priorTargetRole === 'owner') fail();
        projection = {
            eventType: input.eventType,
            outcome: 'succeeded',
            approvedBefore: Object.freeze({ role: metadata.priorTargetRole }),
            approvedAfter: Object.freeze({ role: 'owner' })
        };
    }
    const linkedEventId = input.correctionOfEventId ?? input.relatedEventId;
    return linkedEventId === null ? projection : { ...projection, linkedEventId };
}

export function assertAuditWriteShape(eventType: AuditEventType, targetType: AuditTargetType,
    metadataJson: string): void {
    validateAuditEventRecord({
        eventId: '00000000-0000-4000-8000-000000000001',
        schemaVersion: 8,
        eventType,
        outcome: eventType === 'audit.corrected' ? 'correction' : 'success',
        reasonCode: eventType === 'audit.corrected' ? 'corrected' : 'committed',
        actorUserId: '00000000-0000-4000-8000-000000000002',
        actorDeviceId: '00000000-0000-4000-8000-000000000003',
        targetType,
        targetId: targetType === 'key_version'
            ? '1' : '00000000-0000-4000-8000-000000000006',
        requestId: '00000000-0000-4000-8000-000000000004',
        metadataJson,
        correctionOfEventId: eventType === 'audit.corrected'
            ? '00000000-0000-4000-8000-000000000005' : null,
        relatedEventId: null
    });
}
