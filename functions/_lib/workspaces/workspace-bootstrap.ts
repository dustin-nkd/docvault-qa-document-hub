import {
    PersistenceError,
    buildWorkspaceCreateRecipe,
    executeIdempotentRecipe,
    type RecipeBindings,
    type ReplayScope
} from '../persistence';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

export interface WorkspaceBootstrapInput {
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
    readonly displayName: string;
    readonly descriptionEnvelope: ArrayBuffer | null;
    readonly transitionGuardId: string;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly auditEventId: string;
    readonly requestId: string;
    readonly serverTime: number;
    readonly replayExpiresAt: number;
}

export interface WorkspaceBootstrapResult {
    readonly workspaceId: string;
    readonly httpStatus: 201;
}

function fail(): never {
    throw new PersistenceError('PERSISTENCE_INTEGRITY');
}

function requireUuid(value: string): void {
    if (!UUID_V4.test(value)) fail();
}

function validateInput(input: WorkspaceBootstrapInput): void {
    for (const id of [input.actorUserId, input.actorDeviceId, input.workspaceId,
        input.transitionGuardId, input.clientMutationId, input.auditEventId, input.requestId]) {
        requireUuid(id);
    }
    const displayLength = [...input.displayName].length;
    if (displayLength < 1 || displayLength > 80 || input.displayName !== input.displayName.trim()
        || CONTROL_CHARACTER.test(input.displayName)) fail();
    if (input.descriptionEnvelope !== null
        && (input.descriptionEnvelope.byteLength < 18 || input.descriptionEnvelope.byteLength > 8192)) fail();
    if (input.requestFingerprint.byteLength !== 32
        || !Number.isSafeInteger(input.serverTime) || input.serverTime < 0
        || !Number.isSafeInteger(input.replayExpiresAt)
        || input.replayExpiresAt <= input.serverTime) fail();
}

function resultJson(workspaceId: string): string {
    return JSON.stringify({ workspaceId });
}

function bindings(input: WorkspaceBootstrapInput): RecipeBindings {
    return {
        guard: [input.transitionGuardId, input.actorUserId, input.actorDeviceId,
            input.workspaceId, input.clientMutationId, input.requestFingerprint,
            resultJson(input.workspaceId), input.serverTime, input.replayExpiresAt],
        domain: [
            [input.workspaceId, input.displayName, input.descriptionEnvelope,
                input.actorUserId, input.serverTime, input.serverTime],
            [input.workspaceId, input.actorUserId, input.actorUserId,
                input.serverTime, input.serverTime]
        ],
        audit: [input.auditEventId, input.workspaceId, input.actorUserId,
            input.actorDeviceId, input.workspaceId, input.requestId, input.serverTime],
        result: [input.transitionGuardId]
    };
}

function replayScope(input: WorkspaceBootstrapInput): ReplayScope {
    return {
        actorUserId: input.actorUserId,
        actorDeviceId: input.actorDeviceId,
        workspaceId: input.workspaceId,
        operation: 'workspace.create',
        clientMutationId: input.clientMutationId,
        requestFingerprint: input.requestFingerprint,
        serverTime: input.serverTime
    };
}

export async function bootstrapWorkspace(
    database: D1Database,
    input: WorkspaceBootstrapInput
): Promise<WorkspaceBootstrapResult> {
    validateInput(input);
    const stored = await executeIdempotentRecipe(database,
        buildWorkspaceCreateRecipe(database, bindings(input)), replayScope(input));
    if (stored.httpStatus !== 201 || stored.resultJson !== resultJson(input.workspaceId)) fail();
    return { workspaceId: input.workspaceId, httpStatus: 201 };
}
