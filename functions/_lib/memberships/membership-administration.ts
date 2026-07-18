import {
    PersistenceError,
    executeGuardedBatch,
    openAuthorizationSession,
    readBounded,
    type GuardedBatchRecipe,
    type GuardedBatchStatement,
    type StoredMutationResult
} from '../persistence';
import { assertAuditWriteShape, type AuditEventType } from '../audit/event-registry';
import { authorizeWorkspaceAction, type MembershipState, type WorkspaceRole } from '../rbac';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ASSIGNABLE_ROLES: readonly string[] = Object.freeze(['admin', 'editor', 'viewer']);
const RECENT_AUTHENTICATION_MS = 15 * 60 * 1_000;
const MAXIMUM_PAGE_SIZE = 100;

type MembershipOperation = 'membership.change-role' | 'membership.remove' | 'ownership.transfer';
export type AssignableWorkspaceRole = 'admin' | 'editor' | 'viewer';

export class MembershipAdministrationError extends Error {
    readonly code: 'MEMBERSHIP_INPUT_INVALID' | 'MEMBERSHIP_UNAVAILABLE'
        | 'MEMBERSHIP_OPERATION_NOT_PERMITTED' | 'RECENT_AUTHENTICATION_REQUIRED';

    constructor(code: MembershipAdministrationError['code']) {
        super(code);
        this.name = 'MembershipAdministrationError';
        this.code = code;
    }
}

interface MutationBase {
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
    readonly targetUserId: string;
    readonly expectedRoleVersion: number;
    readonly mutationResultId: string;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly auditEventId: string;
    readonly requestId: string;
    readonly serverTime: number;
    readonly replayExpiresAt: number;
}

export interface ChangeMemberRoleInput extends MutationBase {
    readonly role: AssignableWorkspaceRole;
}

export interface RemoveMemberInput extends MutationBase {}

export interface TransferOwnershipInput extends MutationBase {
    readonly confirmation: 'TRANSFER_OWNERSHIP';
    readonly authenticatedAt: number;
}

export interface MembershipMutationResult {
    readonly targetUserId: string;
    readonly role?: WorkspaceRole;
    readonly state?: MembershipState;
    readonly workspaceState?: 'rotating';
    readonly replayed: boolean;
    readonly httpStatus: 200 | 204;
}

export interface ListMembersInput {
    readonly actorUserId: string;
    readonly actingDeviceId: string | null;
    readonly workspaceId: string;
    readonly limit?: number;
    readonly afterUserId?: string;
}

export interface WorkspaceMemberView {
    readonly userId: string;
    readonly displayLogin: string;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
    readonly role: WorkspaceRole;
    readonly state: MembershipState;
    readonly roleVersion: number;
    readonly activeDeviceCount: number;
    readonly keyReady: boolean;
}

export interface ListMembersResult {
    readonly items: readonly WorkspaceMemberView[];
    readonly nextCursor: { readonly userId: string } | null;
}

interface TargetRow {
    role: string;
    state: string;
    role_version: number;
    provider_subject: string;
    key_ready: number;
}

interface ReplayRow {
    id: string;
    request_fingerprint: ArrayBuffer;
    http_status: number;
    result_json: string;
    expires_at: number;
}

const invalid = (): never => { throw new MembershipAdministrationError('MEMBERSHIP_INPUT_INVALID'); };
const unavailable = (): never => { throw new MembershipAdministrationError('MEMBERSHIP_UNAVAILABLE'); };

function requireUuid(value: string): void {
    if (!UUID_V4.test(value)) invalid();
}

function requireTime(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) invalid();
}

function validateMutation(input: MutationBase): void {
    for (const value of [input.actorUserId, input.actorDeviceId, input.workspaceId,
        input.targetUserId, input.mutationResultId, input.clientMutationId,
        input.auditEventId, input.requestId]) requireUuid(value);
    if (!Number.isSafeInteger(input.expectedRoleVersion) || input.expectedRoleVersion < 1) invalid();
    if (!(input.requestFingerprint instanceof ArrayBuffer)
        || input.requestFingerprint.byteLength !== 32) invalid();
    requireTime(input.serverTime);
    requireTime(input.replayExpiresAt);
    if (input.replayExpiresAt <= input.serverTime) invalid();
}

function equalFingerprint(left: ArrayBuffer, right: ArrayBuffer): boolean {
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    if (a.length !== 32 || b.length !== 32) return false;
    let difference = 0;
    for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}

function mapStoredResult(row: Record<string, unknown>): StoredMutationResult {
    if (typeof row.id !== 'string' || typeof row.http_status !== 'number'
        || typeof row.result_json !== 'string') throw new PersistenceError('PERSISTENCE_INTEGRITY');
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

function parseResult(stored: StoredMutationResult, replayed: boolean): MembershipMutationResult {
    try {
        const value: unknown = JSON.parse(stored.resultJson);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) unavailable();
        const row = value as Record<string, unknown>;
        const targetUserId = row.targetUserId;
        if (typeof targetUserId !== 'string' || !UUID_V4.test(targetUserId)
            || ![200, 204].includes(stored.httpStatus)) {
            throw new MembershipAdministrationError('MEMBERSHIP_UNAVAILABLE');
        }
        const result: MembershipMutationResult = {
            targetUserId,
            replayed,
            httpStatus: stored.httpStatus as 200 | 204
        };
        if (typeof row.role === 'string') Object.assign(result, { role: row.role });
        if (typeof row.state === 'string') Object.assign(result, { state: row.state });
        if (row.workspaceState === 'rotating') Object.assign(result, { workspaceState: 'rotating' });
        return result;
    } catch (error) {
        if (error instanceof MembershipAdministrationError) throw error;
        return unavailable();
    }
}

async function resolveReplay(database: D1Database, input: MutationBase,
    operation: MembershipOperation): Promise<StoredMutationResult | null> {
    const session = openAuthorizationSession(database);
    const row = await session.prepare(
        `SELECT id, request_fingerprint, http_status, result_json, expires_at
         FROM mutation_results
         WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
           AND operation = ? AND client_mutation_id = ? LIMIT 1`
    ).bind(input.actorUserId, input.actorDeviceId, input.workspaceId, operation,
        input.clientMutationId).first<ReplayRow>();
    if (row === null) return null;
    const authorized = await session.prepare(
        `SELECT 1 AS authorized FROM memberships m
         JOIN devices d ON d.user_id = m.user_id
         JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
           AND d.id = ? AND d.state = 'active' AND u.status = 'active' LIMIT 1`
    ).bind(input.workspaceId, input.actorUserId, input.actorDeviceId).first<number>('authorized');
    if (authorized !== 1) throw new PersistenceError('AUTHORITY_REVOKED');
    if (!equalFingerprint(row.request_fingerprint, input.requestFingerprint)) {
        throw new PersistenceError('IDEMPOTENCY_KEY_REUSED');
    }
    if (input.serverTime >= row.expires_at) throw new PersistenceError('IDEMPOTENCY_EXPIRED');
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

async function loadTarget(database: D1Database, input: MutationBase): Promise<TargetRow> {
    const row = await openAuthorizationSession(database).prepare(
        `SELECT m.role, m.state, m.role_version, u.provider_subject,
                CASE WHEN EXISTS (
                    SELECT 1 FROM workspace_key_envelopes e
                    JOIN workspaces w ON w.id = e.workspace_id
                    JOIN devices d ON d.id = e.target_device_id AND d.user_id = e.target_user_id
                    WHERE e.workspace_id = m.workspace_id AND e.target_user_id = m.user_id
                      AND e.key_version = w.current_key_version AND e.revoked_at IS NULL
                      AND d.state = 'active'
                ) THEN 1 ELSE 0 END AS key_ready
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? AND m.user_id = ? LIMIT 1`
    ).bind(input.workspaceId, input.targetUserId).first<TargetRow>();
    if (row === null) throw new MembershipAdministrationError('MEMBERSHIP_UNAVAILABLE');
    if (!['owner', 'admin', 'editor', 'viewer'].includes(row.role)
        || !['active', 'pending_key', 'removed'].includes(row.state)
        || !Number.isInteger(row.role_version) || ![0, 1].includes(row.key_ready)) unavailable();
    return row;
}

async function authorize(database: D1Database, input: MutationBase, action: MembershipOperation,
    target: TargetRow, desiredRole?: AssignableWorkspaceRole, recentAuthentication?: boolean): Promise<void> {
    const decision = await authorizeWorkspaceAction(database, {
        actorUserId: input.actorUserId,
        actingDeviceId: input.actorDeviceId,
        workspaceId: input.workspaceId,
        action,
        context: {
            targetRole: target.role as WorkspaceRole,
            desiredRole,
            targetMembershipState: target.state as MembershipState,
            targetIsSelf: input.actorUserId === input.targetUserId,
            recentAuthentication
        }
    });
    if (!decision.allowed) {
        if (decision.code === 'RECENT_AUTHENTICATION_REQUIRED') {
            throw new MembershipAdministrationError('RECENT_AUTHENTICATION_REQUIRED');
        }
        throw new MembershipAdministrationError('MEMBERSHIP_OPERATION_NOT_PERMITTED');
    }
}

function resultRecipe(statements: GuardedBatchStatement[]): GuardedBatchRecipe<StoredMutationResult> {
    return { statements, mapResult: mapStoredResult };
}

function resultStatement(database: D1Database, mutationResultId: string): GuardedBatchStatement {
    return { role: 'result', statement: database.prepare(
        'SELECT id, http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1'
    ).bind(mutationResultId) };
}

function auditStatement(database: D1Database, input: MutationBase, eventType: Extract<AuditEventType,
    'membership.role_changed' | 'membership.removed' | 'ownership.transferred'>,
    metadata: string): GuardedBatchStatement {
    assertAuditWriteShape(eventType, 'membership', metadata);
    return {
        role: 'audit', expectedChanges: 1,
        statement: database.prepare(
            `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
              outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
              request_id, server_time, metadata_json, correction_of_event_id,
              related_event_id, hold_state)
             VALUES (?, 8, ?, ?, 'success', 'committed', ?, ?, 'membership', ?, ?, ?, ?,
               NULL, NULL, 'none')`
        ).bind(input.auditEventId, input.workspaceId, eventType, input.actorUserId,
            input.actorDeviceId, input.targetUserId, input.requestId, input.serverTime, metadata)
    };
}

async function executeMutation(database: D1Database, input: MutationBase,
    operation: MembershipOperation, recipe: GuardedBatchRecipe<StoredMutationResult>): Promise<MembershipMutationResult> {
    const replay = await resolveReplay(database, input, operation);
    if (replay !== null) return parseResult(replay, true);
    try {
        return parseResult(await executeGuardedBatch(database, recipe), false);
    } catch (error) {
        if (!(error instanceof PersistenceError)
            || !['PERSISTENCE_CONFLICT', 'PERSISTENCE_CONSTRAINT', 'PERSISTENCE_INTEGRITY'].includes(error.code)) {
            throw error;
        }
        const racedReplay = await resolveReplay(database, input, operation);
        if (racedReplay !== null) return parseResult(racedReplay, true);
        return unavailable();
    }
}

export async function listWorkspaceMembers(database: D1Database,
    input: ListMembersInput): Promise<ListMembersResult> {
    requireUuid(input.actorUserId);
    requireUuid(input.workspaceId);
    if (input.actingDeviceId !== null) requireUuid(input.actingDeviceId);
    const after = input.afterUserId ?? '00000000-0000-4000-8000-000000000000';
    requireUuid(after);
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_PAGE_SIZE) invalid();
    const decision = await authorizeWorkspaceAction(database, {
        actorUserId: input.actorUserId, actingDeviceId: input.actingDeviceId,
        workspaceId: input.workspaceId, action: 'member.list'
    });
    if (!decision.allowed) throw new MembershipAdministrationError('MEMBERSHIP_OPERATION_NOT_PERMITTED');
    const rows = await readBounded(openAuthorizationSession(database).prepare(
        `SELECT m.user_id, u.display_login, u.display_name, u.avatar_url, m.role, m.state,
                m.role_version,
                (SELECT COUNT(*) FROM devices d WHERE d.user_id = m.user_id AND d.state = 'active')
                  AS active_device_count,
                CASE WHEN EXISTS (
                    SELECT 1 FROM workspace_key_envelopes e
                    JOIN workspaces w ON w.id = e.workspace_id
                    JOIN devices d ON d.id = e.target_device_id
                    WHERE e.workspace_id = m.workspace_id AND e.target_user_id = m.user_id
                      AND e.key_version = w.current_key_version AND e.revoked_at IS NULL
                      AND d.state = 'active'
                ) THEN 1 ELSE 0 END AS key_ready
         FROM memberships m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? AND m.state <> 'removed' AND m.user_id > ?
         ORDER BY m.user_id ASC LIMIT ?`
    ).bind(input.workspaceId, after, limit), limit, row => {
        const role = row.role;
        const state = row.state;
        if (typeof row.user_id !== 'string' || typeof row.display_login !== 'string'
            || !['owner', 'admin', 'editor', 'viewer'].includes(String(role))
            || !['active', 'pending_key'].includes(String(state))
            || typeof row.role_version !== 'number' || typeof row.active_device_count !== 'number'
            || ![0, 1].includes(Number(row.key_ready))) throw new PersistenceError('PERSISTENCE_INTEGRITY');
        return {
            userId: row.user_id,
            displayLogin: row.display_login,
            displayName: typeof row.display_name === 'string' ? row.display_name : null,
            avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
            role: role as WorkspaceRole,
            state: state as MembershipState,
            roleVersion: row.role_version,
            activeDeviceCount: row.active_device_count,
            keyReady: row.key_ready === 1
        };
    });
    const hasMore = rows.length === limit;
    const items = rows;
    return { items, nextCursor: hasMore ? { userId: items.at(-1)?.userId ?? after } : null };
}

export async function changeMemberRole(database: D1Database,
    input: ChangeMemberRoleInput): Promise<MembershipMutationResult> {
    validateMutation(input);
    if (!ASSIGNABLE_ROLES.includes(input.role)) invalid();
    const replay = await resolveReplay(database, input, 'membership.change-role');
    if (replay !== null) return parseResult(replay, true);
    const target = await loadTarget(database, input);
    await authorize(database, input, 'membership.change-role', target, input.role);
    const resultJson = JSON.stringify({ targetUserId: input.targetUserId, role: input.role, state: 'active' });
    const statements: GuardedBatchStatement[] = [{
        role: 'guard', expectedChanges: 1,
        statement: database.prepare(
            `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
              operation, client_mutation_id, request_fingerprint, target_type, target_id,
              http_status, result_json, created_at, expires_at)
             SELECT ?, ?, ?, ?, 'membership.change-role', ?, ?, 'membership', ?, 200, ?, ?, ?
             FROM memberships actor JOIN devices d ON d.user_id = actor.user_id
             JOIN memberships target ON target.workspace_id = actor.workspace_id
             WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.state = 'active'
               AND d.id = ? AND d.state = 'active' AND target.user_id = ?
               AND target.state = 'active' AND target.role = ? AND target.role_version = ?
               AND target.role <> 'owner' AND ? <> 'owner' AND target.role <> ?
               AND (actor.role = 'owner' OR (actor.role = 'admin'
                 AND target.role IN ('editor', 'viewer') AND ? IN ('editor', 'viewer')))`
        ).bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
            input.clientMutationId, input.requestFingerprint, input.targetUserId, resultJson,
            input.serverTime, input.replayExpiresAt, input.workspaceId, input.actorUserId,
            input.actorDeviceId, input.targetUserId, target.role, input.expectedRoleVersion,
            input.role, input.role, input.role)
    }, {
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE memberships SET role = ?, role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ? AND state = 'active'
               AND role = ? AND role_version = ?`
        ).bind(input.role, input.workspaceId, input.targetUserId, target.role, input.expectedRoleVersion)
    }, auditStatement(database, input, 'membership.role_changed',
        JSON.stringify({ fromRole: target.role, toRole: input.role })),
    resultStatement(database, input.mutationResultId)];
    return executeMutation(database, input, 'membership.change-role', resultRecipe(statements));
}

export async function removeMember(database: D1Database,
    input: RemoveMemberInput): Promise<MembershipMutationResult> {
    validateMutation(input);
    const replay = await resolveReplay(database, input, 'membership.remove');
    if (replay !== null) return parseResult(replay, true);
    const target = await loadTarget(database, input);
    await authorize(database, input, 'membership.remove', target);
    const session = openAuthorizationSession(database);
    const invitationId = await session.prepare(
        `SELECT i.id FROM invitations i JOIN users u
           ON u.provider = i.target_provider AND u.provider_subject = i.target_provider_subject
         WHERE i.workspace_id = ? AND u.id = ? AND i.state = 'pending' LIMIT 1`
    ).bind(input.workspaceId, input.targetUserId).first<string>('id');
    const envelopeCount = (await session.prepare(
        `SELECT COUNT(*) AS count FROM workspace_key_envelopes
         WHERE workspace_id = ? AND target_user_id = ? AND revoked_at IS NULL`
    ).bind(input.workspaceId, input.targetUserId).first<number>('count')) ?? 0;
    const resultJson = JSON.stringify({ targetUserId: input.targetUserId, state: 'removed', workspaceState: 'rotating' });
    const statements: GuardedBatchStatement[] = [{
        role: 'guard', expectedChanges: 1,
        statement: database.prepare(
            `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
              operation, client_mutation_id, request_fingerprint, target_type, target_id,
              http_status, result_json, created_at, expires_at)
             SELECT ?, ?, ?, ?, 'membership.remove', ?, ?, 'membership', ?, 204, ?, ?, ?
             FROM memberships actor JOIN devices d ON d.user_id = actor.user_id
             JOIN memberships target ON target.workspace_id = actor.workspace_id
             WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.state = 'active'
               AND d.id = ? AND d.state = 'active' AND target.user_id = ?
               AND target.state IN ('active', 'pending_key') AND target.role = ?
               AND target.state = ? AND target.role_version = ? AND target.role <> 'owner'
               AND target.user_id <> actor.user_id
               AND (actor.role = 'owner' OR (actor.role = 'admin'
                 AND target.role IN ('editor', 'viewer')))
               AND (SELECT COUNT(*) FROM workspace_key_envelopes
                 WHERE workspace_id = actor.workspace_id AND target_user_id = target.user_id
                   AND revoked_at IS NULL) = ?
               AND ((? IS NULL AND NOT EXISTS (
                 SELECT 1 FROM invitations i JOIN users u
                   ON u.provider = i.target_provider AND u.provider_subject = i.target_provider_subject
                 WHERE i.workspace_id = actor.workspace_id AND u.id = target.user_id
                   AND i.state = 'pending')) OR EXISTS (
                 SELECT 1 FROM invitations i JOIN users u
                   ON u.provider = i.target_provider AND u.provider_subject = i.target_provider_subject
                 WHERE i.id = ? AND i.workspace_id = actor.workspace_id AND u.id = target.user_id
                   AND i.state = 'pending'))`
        ).bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
            input.clientMutationId, input.requestFingerprint, input.targetUserId, resultJson,
            input.serverTime, input.replayExpiresAt, input.workspaceId, input.actorUserId,
            input.actorDeviceId, input.targetUserId, target.role, target.state,
            input.expectedRoleVersion, envelopeCount, invitationId, invitationId)
    }, {
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE memberships SET state = 'removed', removed_by = ?, removed_at = ?,
              role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ? AND state IN ('active', 'pending_key')
               AND role = ? AND role_version = ?`
        ).bind(input.actorUserId, input.serverTime, input.workspaceId, input.targetUserId,
            target.role, input.expectedRoleVersion)
    }];
    if (invitationId !== null) statements.push({
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE invitations SET state = 'revoked', revoked_at = ?
             WHERE id = ? AND workspace_id = ? AND state = 'pending'`
        ).bind(input.serverTime, invitationId, input.workspaceId)
    });
    if (envelopeCount > 0) statements.push({
        role: 'domain', expectedChanges: envelopeCount,
        statement: database.prepare(
            `UPDATE workspace_key_envelopes SET revoked_at = ?
             WHERE workspace_id = ? AND target_user_id = ? AND revoked_at IS NULL`
        ).bind(input.serverTime, input.workspaceId, input.targetUserId)
    });
    statements.push({
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE workspaces SET state = 'rotating', updated_at = ?
             WHERE id = ? AND state IN ('active', 'rotating')`
        ).bind(input.serverTime, input.workspaceId)
    }, auditStatement(database, input, 'membership.removed',
        JSON.stringify({ priorRole: target.role, rotationRequired: true })),
    resultStatement(database, input.mutationResultId));
    return executeMutation(database, input, 'membership.remove', resultRecipe(statements));
}

export async function transferOwnership(database: D1Database,
    input: TransferOwnershipInput): Promise<MembershipMutationResult> {
    validateMutation(input);
    requireTime(input.authenticatedAt);
    if (input.confirmation !== 'TRANSFER_OWNERSHIP') invalid();
    const recent = input.authenticatedAt <= input.serverTime
        && input.serverTime - input.authenticatedAt <= RECENT_AUTHENTICATION_MS;
    if (!recent) throw new MembershipAdministrationError('RECENT_AUTHENTICATION_REQUIRED');
    const replay = await resolveReplay(database, input, 'ownership.transfer');
    if (replay !== null) return parseResult(replay, true);
    const target = await loadTarget(database, input);
    await authorize(database, input, 'ownership.transfer', target, undefined, recent);
    if (target.key_ready !== 1) {
        throw new MembershipAdministrationError('MEMBERSHIP_OPERATION_NOT_PERMITTED');
    }
    const actorVersion = await openAuthorizationSession(database).prepare(
        `SELECT role_version FROM memberships WHERE workspace_id = ? AND user_id = ?
         AND role = 'owner' AND state = 'active' LIMIT 1`
    ).bind(input.workspaceId, input.actorUserId).first<number>('role_version');
    if (!Number.isInteger(actorVersion)) unavailable();
    const resultJson = JSON.stringify({ targetUserId: input.targetUserId, role: 'owner', state: 'active' });
    const statements: GuardedBatchStatement[] = [{
        role: 'guard', expectedChanges: 1,
        statement: database.prepare(
            `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
              operation, client_mutation_id, request_fingerprint, target_type, target_id,
              http_status, result_json, created_at, expires_at)
             SELECT ?, ?, ?, ?, 'ownership.transfer', ?, ?, 'membership', ?, 200, ?, ?, ?
             FROM memberships actor JOIN devices ad ON ad.user_id = actor.user_id
             JOIN memberships target ON target.workspace_id = actor.workspace_id
             WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.role = 'owner'
               AND actor.state = 'active' AND actor.role_version = ?
               AND ad.id = ? AND ad.state = 'active' AND target.user_id = ?
               AND target.user_id <> actor.user_id AND target.role = ?
               AND target.role <> 'owner' AND target.state = 'active' AND target.role_version = ?
               AND EXISTS (SELECT 1 FROM workspace_key_envelopes e
                 JOIN workspaces w ON w.id = e.workspace_id
                 JOIN devices d ON d.id = e.target_device_id
                 WHERE e.workspace_id = actor.workspace_id AND e.target_user_id = target.user_id
                   AND e.key_version = w.current_key_version AND e.revoked_at IS NULL
                   AND d.state = 'active')`
        ).bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
            input.clientMutationId, input.requestFingerprint, input.targetUserId, resultJson,
            input.serverTime, input.replayExpiresAt, input.workspaceId, input.actorUserId,
            actorVersion, input.actorDeviceId, input.targetUserId, target.role,
            input.expectedRoleVersion)
    }, {
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE memberships SET role = 'owner', role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ? AND role = ? AND state = 'active'
               AND role_version = ?`
        ).bind(input.workspaceId, input.targetUserId, target.role, input.expectedRoleVersion)
    }, {
        role: 'domain', expectedChanges: 1,
        statement: database.prepare(
            `UPDATE memberships SET role = 'admin', role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ? AND role = 'owner' AND state = 'active'
               AND role_version = ?`
        ).bind(input.workspaceId, input.actorUserId, actorVersion)
    }, auditStatement(database, input, 'ownership.transferred',
        JSON.stringify({ priorOwnerUserId: input.actorUserId, priorTargetRole: target.role })),
    resultStatement(database, input.mutationResultId)];
    return executeMutation(database, input, 'ownership.transfer', resultRecipe(statements));
}
