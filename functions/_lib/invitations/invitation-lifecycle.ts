import { PLATFORM_RANDOM, type RandomBytesSource } from '../identity/crypto';
import {
    PersistenceError,
    buildInvitationAcceptRecipe,
    executeGuardedBatch,
    executeIdempotentRecipe,
    openAuthorizationSession,
    type GuardedBatchRecipe,
    type GuardedBatchStatement,
    type RecipeBindings,
    type ReplayScope,
    type StoredMutationResult
} from '../persistence';
import { authorizeWorkspaceAction, type WorkspaceRole } from '../rbac';
import {
    normalizeGitHubLogin,
    type InvitationIdentityResolver,
    type ResolvedInvitationIdentity
} from './github-resolver';
import { issueInvitationToken, parseInvitationToken, verifyInvitationToken } from './token';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_SUBJECT = /^[1-9][0-9]{0,19}$/;
const INVITATION_ROLES: readonly string[] = Object.freeze(['admin', 'editor', 'viewer']);
const INVITATION_TTL_MS = 72 * 60 * 60 * 1_000;
const MAXIMUM_PAGE_SIZE = 50;

export type InvitationRole = 'admin' | 'editor' | 'viewer';

export class InvitationLifecycleError extends Error {
    readonly code: 'INVITATION_INPUT_INVALID' | 'INVITATION_UNAVAILABLE'
        | 'INVITATION_OPERATION_NOT_PERMITTED';

    constructor(code: InvitationLifecycleError['code']) {
        super(code);
        this.name = 'InvitationLifecycleError';
        this.code = code;
    }
}

interface InvitationMutationBase {
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly workspaceId: string;
    readonly mutationResultId: string;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly auditEventId: string;
    readonly requestId: string;
    readonly serverTime: number;
    readonly replayExpiresAt: number;
}

export interface CreateInvitationInput extends InvitationMutationBase {
    readonly invitationId: string;
    readonly targetLogin: string;
    readonly offeredRole: InvitationRole;
}

export interface CreateInvitationDependencies {
    readonly identityResolver: InvitationIdentityResolver;
    readonly random?: RandomBytesSource;
}

export interface CreateInvitationResult {
    readonly invitationId: string;
    readonly state: 'pending';
    readonly expiresAt: number;
    readonly token: string | null;
    readonly replayed: boolean;
    readonly httpStatus: 201;
}

export interface RevokeInvitationInput extends InvitationMutationBase {
    readonly invitationId: string;
}

export interface RevokeInvitationResult {
    readonly invitationId: string;
    readonly state: 'revoked';
    readonly replayed: boolean;
    readonly httpStatus: 204;
}

export interface ListInvitationsInput {
    readonly actorUserId: string;
    readonly actingDeviceId: string;
    readonly workspaceId: string;
    readonly serverTime: number;
    readonly limit?: number;
    readonly afterExpiresAt?: number;
    readonly afterInvitationId?: string;
}

export interface PendingInvitationView {
    readonly invitationId: string;
    readonly targetDisplayLogin: string;
    readonly role: InvitationRole;
    readonly state: 'pending';
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly inviterUserId: string;
}

export interface ListInvitationsResult {
    readonly items: readonly PendingInvitationView[];
    readonly nextCursor: { readonly expiresAt: number; readonly invitationId: string } | null;
}

export interface BootstrapInvitationInput {
    readonly token: string;
    readonly actorUserId?: string;
    readonly serverTime: number;
}

export interface BootstrapInvitationResult {
    readonly invitationId: string;
    readonly workspaceDisplayName: string;
    readonly targetDisplayLogin: string;
    readonly role: InvitationRole;
    readonly expiresAt: number;
    readonly state: 'pending';
    readonly identityMatch?: boolean;
}

export interface AcceptInvitationInput {
    readonly token: string;
    readonly actorUserId: string;
    readonly actorDeviceId: string;
    readonly transitionGuardId: string;
    readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer;
    readonly auditEventId: string;
    readonly requestId: string;
    readonly serverTime: number;
    readonly replayExpiresAt: number;
}

export interface AcceptInvitationResult {
    readonly invitationId: string;
    readonly workspaceId: string;
    readonly membershipState: 'pending_key';
    readonly httpStatus: 201;
}

interface InvitationRow {
    id: string;
    workspace_id: string;
    target_provider: string;
    target_provider_subject: string;
    target_login_snapshot: string;
    offered_role: string;
    token_digest: ArrayBuffer | number[];
    state: string;
    invited_by: string;
    accepted_by: string | null;
    created_at: number;
    expires_at: number;
    workspace_display_name?: string;
}

type VerifiedInvitationRow = Omit<InvitationRow, 'token_digest'> & { token_digest: ArrayBuffer };

interface MutationRow {
    id: string;
    request_fingerprint: ArrayBuffer;
    http_status: number;
    result_json: string;
    expires_at: number;
}

function invalid(): never {
    throw new InvitationLifecycleError('INVITATION_INPUT_INVALID');
}

function unavailable(): never {
    throw new InvitationLifecycleError('INVITATION_UNAVAILABLE');
}

function unavailableForTerminalConflict(error: unknown): never {
    if (error instanceof PersistenceError
        && ['PERSISTENCE_CONFLICT', 'PERSISTENCE_CONSTRAINT', 'PERSISTENCE_INTEGRITY',
            'PERSISTENCE_NOT_FOUND'].includes(error.code)) unavailable();
    throw error;
}

function requireUuid(value: string): void {
    if (!UUID_V4.test(value)) invalid();
}

function requireTime(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) invalid();
}

function requireFingerprint(value: ArrayBuffer): void {
    if (!(value instanceof ArrayBuffer) || value.byteLength !== 32) invalid();
}

function validateMutation(input: InvitationMutationBase): void {
    for (const id of [input.actorUserId, input.actorDeviceId, input.workspaceId,
        input.mutationResultId, input.clientMutationId, input.auditEventId, input.requestId]) {
        requireUuid(id);
    }
    requireFingerprint(input.requestFingerprint);
    requireTime(input.serverTime);
    requireTime(input.replayExpiresAt);
    if (input.replayExpiresAt <= input.serverTime) invalid();
}

function isRole(value: string): value is InvitationRole {
    return INVITATION_ROLES.includes(value);
}

function sameDigest(left: ArrayBuffer, right: ArrayBuffer): boolean {
    const a = new Uint8Array(left);
    const b = new Uint8Array(right);
    if (a.byteLength !== 32 || b.byteLength !== 32) return false;
    let difference = 0;
    for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}

function mapMutation(row: Record<string, unknown>): StoredMutationResult {
    if (typeof row.id !== 'string' || typeof row.http_status !== 'number'
        || typeof row.result_json !== 'string') invalid();
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

async function authorize(
    database: D1Database,
    action: 'invitation.list' | 'invitation.create' | 'invitation.revoke',
    actorUserId: string,
    actorDeviceId: string,
    workspaceId: string,
    targetRole?: WorkspaceRole
): Promise<void> {
    const decision = await authorizeWorkspaceAction(database, {
        actorUserId, actingDeviceId: actorDeviceId, workspaceId, action,
        context: targetRole ? { targetRole } : undefined
    });
    if (!decision.allowed) throw new InvitationLifecycleError('INVITATION_OPERATION_NOT_PERMITTED');
}

async function resolveReplay(
    database: D1Database,
    input: InvitationMutationBase,
    operation: 'invitation.create' | 'invitation.revoke'
): Promise<StoredMutationResult | null> {
    const row = await openAuthorizationSession(database).prepare(
        `SELECT id, request_fingerprint, http_status, result_json, expires_at
         FROM mutation_results
         WHERE actor_user_id = ? AND actor_device_id = ? AND workspace_id = ?
           AND operation = ? AND client_mutation_id = ? LIMIT 1`
    ).bind(input.actorUserId, input.actorDeviceId, input.workspaceId, operation,
        input.clientMutationId).first<MutationRow>();
    if (row === null) return null;
    if (!sameDigest(row.request_fingerprint, input.requestFingerprint)) {
        throw new PersistenceError('IDEMPOTENCY_KEY_REUSED');
    }
    if (input.serverTime >= row.expires_at) throw new PersistenceError('IDEMPOTENCY_EXPIRED');
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

function auditStatement(
    database: D1Database,
    input: InvitationMutationBase,
    eventType: 'invitation.created' | 'invitation.replaced' | 'invitation.revoked',
    invitationId: string
): D1PreparedStatement {
    return database.prepare(
        `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
          request_id, server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 8, ?, ?, 'success', 'committed', ?, ?, 'invitation', ?, ?, ?, '{}', NULL, NULL, 'none')`
    ).bind(input.auditEventId, input.workspaceId, eventType, input.actorUserId,
        input.actorDeviceId, invitationId, input.requestId, input.serverTime);
}

function invitationMutationRecipe(
    database: D1Database,
    input: InvitationMutationBase,
    guard: D1PreparedStatement,
    domain: readonly D1PreparedStatement[],
    eventType: 'invitation.created' | 'invitation.replaced' | 'invitation.revoked',
    invitationId: string
): GuardedBatchRecipe<StoredMutationResult> {
    const statements: GuardedBatchStatement[] = [
        { role: 'guard', statement: guard, expectedChanges: 1 },
        ...domain.map(statement => ({ role: 'domain' as const, statement, expectedChanges: 1 })),
        { role: 'audit', statement: auditStatement(database, input, eventType, invitationId), expectedChanges: 1 },
        { role: 'result', statement: database.prepare(
            'SELECT id, http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1'
        ).bind(input.mutationResultId) }
    ];
    return { statements, mapResult: mapMutation };
}

function createResultJson(invitationId: string, expiresAt: number): string {
    return JSON.stringify({ invitationId, state: 'pending', expiresAt });
}

function revokeResultJson(invitationId: string): string {
    return JSON.stringify({ invitationId, state: 'revoked' });
}

function parseCreateResult(stored: StoredMutationResult, replayed: boolean, token: string | null): CreateInvitationResult {
    let value: unknown;
    try {
        value = JSON.parse(stored.resultJson);
    } catch {
        invalid();
    }
    if (stored.httpStatus !== 201 || typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
    const row = value as Record<string, unknown>;
    if (typeof row.invitationId !== 'string' || !UUID_V4.test(row.invitationId)
        || row.state !== 'pending' || !Number.isSafeInteger(row.expiresAt)) invalid();
    return { invitationId: row.invitationId, state: 'pending', expiresAt: row.expiresAt as number,
        token, replayed, httpStatus: 201 };
}

async function existingPendingInvitation(
    database: D1Database,
    workspaceId: string,
    target: ResolvedInvitationIdentity
): Promise<string | null> {
    return (await openAuthorizationSession(database).prepare(
        `SELECT id FROM invitations
         WHERE workspace_id = ? AND target_provider = ? AND target_provider_subject = ?
           AND state = 'pending' LIMIT 1`
    ).bind(workspaceId, target.provider, target.providerSubject).first<string>('id')) ?? null;
}

function createRecipe(
    database: D1Database,
    input: CreateInvitationInput,
    target: ResolvedInvitationIdentity,
    digest: ArrayBuffer,
    expiresAt: number,
    priorInvitationId: string | null
): GuardedBatchRecipe<StoredMutationResult> {
    const result = createResultJson(input.invitationId, expiresAt);
    const priorPredicate = priorInvitationId === null
        ? `AND NOT EXISTS (SELECT 1 FROM invitations pending
               WHERE pending.workspace_id = actor.workspace_id AND pending.target_provider = 'github'
                 AND pending.target_provider_subject = ? AND pending.state = 'pending')`
        : `AND EXISTS (SELECT 1 FROM invitations pending
               WHERE pending.id = ? AND pending.workspace_id = actor.workspace_id
                 AND pending.target_provider = 'github' AND pending.target_provider_subject = ?
                 AND pending.state = 'pending')`;
    const priorBindings = priorInvitationId === null
        ? [target.providerSubject]
        : [priorInvitationId, target.providerSubject];
    const guard = database.prepare(
        `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id,
          http_status, result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'invitation.create', ?, ?, 'invitation', ?, 201,
           (SELECT ? FROM memberships actor
            JOIN devices device ON device.user_id = actor.user_id
            JOIN workspaces workspace ON workspace.id = actor.workspace_id
            WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.state = 'active'
              AND device.id = ? AND device.state = 'active' AND workspace.state = 'active'
              AND ((actor.role = 'owner' AND ? IN ('admin','editor','viewer'))
                OR (actor.role = 'admin' AND ? IN ('editor','viewer')))
              AND NOT EXISTS (
                SELECT 1 FROM memberships target_membership
                JOIN users target_user ON target_user.id = target_membership.user_id
                WHERE target_membership.workspace_id = actor.workspace_id
                  AND target_membership.state IN ('active','pending_key')
                  AND target_user.provider = 'github' AND target_user.provider_subject = ?)
              ${priorPredicate}), ?, ?)`
    ).bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
        input.clientMutationId, input.requestFingerprint, input.invitationId, result,
        input.workspaceId, input.actorUserId, input.actorDeviceId, input.offeredRole,
        input.offeredRole, target.providerSubject, ...priorBindings, input.serverTime,
        input.replayExpiresAt);
    const domain: D1PreparedStatement[] = [];
    if (priorInvitationId !== null) {
        domain.push(database.prepare(
            `UPDATE invitations
             SET state = CASE WHEN expires_at <= ? THEN 'expired' ELSE 'revoked' END,
                 revoked_at = CASE WHEN expires_at > ? THEN ? ELSE NULL END,
                 expired_at = CASE WHEN expires_at <= ? THEN expires_at ELSE NULL END
             WHERE id = ? AND workspace_id = ? AND state = 'pending'`
        ).bind(input.serverTime, input.serverTime, input.serverTime, input.serverTime,
            priorInvitationId, input.workspaceId));
    }
    domain.push(database.prepare(
        `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
          target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
          created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
         VALUES (?, ?, 'github', ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, NULL, NULL, NULL, ?)`
    ).bind(input.invitationId, input.workspaceId, target.providerSubject, target.login,
        input.offeredRole, digest, input.actorUserId, input.serverTime, expiresAt,
        priorInvitationId));
    return invitationMutationRecipe(database, input, guard, domain,
        priorInvitationId === null ? 'invitation.created' : 'invitation.replaced', input.invitationId);
}

export async function createInvitation(
    database: D1Database,
    input: CreateInvitationInput,
    dependencies: CreateInvitationDependencies
): Promise<CreateInvitationResult> {
    validateMutation(input);
    requireUuid(input.invitationId);
    if (!isRole(input.offeredRole) || !dependencies?.identityResolver) invalid();
    const targetLogin = normalizeGitHubLogin(input.targetLogin);
    await authorize(database, 'invitation.create', input.actorUserId, input.actorDeviceId,
        input.workspaceId, input.offeredRole);
    const replay = await resolveReplay(database, input, 'invitation.create');
    if (replay !== null) return parseCreateResult(replay, true, null);
    const target = await dependencies.identityResolver.resolveLogin(targetLogin);
    if (target.provider !== 'github' || !PROVIDER_SUBJECT.test(target.providerSubject)
        || normalizeGitHubLogin(target.login) !== targetLogin) unavailable();
    if (input.serverTime > Number.MAX_SAFE_INTEGER - INVITATION_TTL_MS) invalid();
    const expiresAt = input.serverTime + INVITATION_TTL_MS;
    const token = await issueInvitationToken(input.invitationId, dependencies.random ?? PLATFORM_RANDOM);
    let prior = await existingPendingInvitation(database, input.workspaceId, target);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const stored = await executeGuardedBatch(database,
                createRecipe(database, input, target, token.digest.buffer as ArrayBuffer, expiresAt, prior));
            return parseCreateResult(stored, false, token.token);
        } catch (error) {
            const winner = await resolveReplay(database, input, 'invitation.create');
            if (winner !== null) return parseCreateResult(winner, true, null);
            if (attempt === 1) unavailableForTerminalConflict(error);
            prior = await existingPendingInvitation(database, input.workspaceId, target);
        }
    }
    invalid();
}

interface InvitationListRow {
    id: string;
    target_login_snapshot: string;
    offered_role: string;
    created_at: number;
    expires_at: number;
    invited_by: string;
}

function mapListRow(row: InvitationListRow): PendingInvitationView {
    if (!UUID_V4.test(row.id) || !UUID_V4.test(row.invited_by) || !isRole(row.offered_role)
        || typeof row.target_login_snapshot !== 'string' || row.target_login_snapshot.length < 1
        || !Number.isSafeInteger(row.created_at) || !Number.isSafeInteger(row.expires_at)) invalid();
    return Object.freeze({ invitationId: row.id, targetDisplayLogin: row.target_login_snapshot,
        role: row.offered_role, state: 'pending', createdAt: row.created_at,
        expiresAt: row.expires_at, inviterUserId: row.invited_by });
}

export async function listPendingInvitations(
    database: D1Database,
    input: ListInvitationsInput
): Promise<ListInvitationsResult> {
    for (const id of [input.actorUserId, input.actingDeviceId, input.workspaceId]) requireUuid(id);
    requireTime(input.serverTime);
    const limit = input.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAXIMUM_PAGE_SIZE) invalid();
    const hasCursor = input.afterExpiresAt !== undefined || input.afterInvitationId !== undefined;
    if (hasCursor) {
        if (input.afterExpiresAt === undefined || input.afterInvitationId === undefined) invalid();
        requireTime(input.afterExpiresAt);
        requireUuid(input.afterInvitationId);
    }
    await authorize(database, 'invitation.list', input.actorUserId, input.actingDeviceId, input.workspaceId);
    const result = await openAuthorizationSession(database).prepare(
        `SELECT id, target_login_snapshot, offered_role, created_at, expires_at, invited_by
         FROM invitations
         WHERE workspace_id = ? AND state = 'pending' AND expires_at > ?
           AND (? = 0 OR expires_at > ? OR (expires_at = ? AND id > ?))
         ORDER BY expires_at ASC, id ASC LIMIT ?`
    ).bind(input.workspaceId, input.serverTime, hasCursor ? 1 : 0,
        input.afterExpiresAt ?? 0, input.afterExpiresAt ?? 0, input.afterInvitationId ?? '',
        limit + 1).all<InvitationListRow>();
    if (!result.success || !Array.isArray(result.results) || result.results.length > limit + 1) invalid();
    const mapped = result.results.map(mapListRow);
    const page = Object.freeze(mapped.slice(0, limit));
    const last = page.at(-1);
    return Object.freeze({ items: page, nextCursor: mapped.length > limit && last
        ? Object.freeze({ expiresAt: last.expiresAt, invitationId: last.invitationId }) : null });
}

async function loadInvitationById(database: D1Database, invitationId: string): Promise<InvitationRow | null> {
    return openAuthorizationSession(database).prepare(
        `SELECT i.id, i.workspace_id, i.target_provider, i.target_provider_subject,
                i.target_login_snapshot, i.offered_role, i.token_digest, i.state,
                i.invited_by, i.accepted_by, i.created_at, i.expires_at,
                w.display_name AS workspace_display_name
         FROM invitations i JOIN workspaces w ON w.id = i.workspace_id
         WHERE i.id = ? AND w.state <> 'deleted' LIMIT 1`
    ).bind(invitationId).first<InvitationRow>();
}

function validInvitationRow(row: InvitationRow): boolean {
    const digestLength = row.token_digest instanceof ArrayBuffer
        ? row.token_digest.byteLength
        : Array.isArray(row.token_digest) && row.token_digest.every(value => Number.isInteger(value)
            && value >= 0 && value <= 255) ? row.token_digest.length : -1;
    return UUID_V4.test(row.id) && UUID_V4.test(row.workspace_id)
        && UUID_V4.test(row.invited_by) && row.target_provider === 'github'
        && PROVIDER_SUBJECT.test(row.target_provider_subject)
        && typeof row.target_login_snapshot === 'string' && row.target_login_snapshot.length >= 1
        && isRole(row.offered_role) && digestLength === 32
        && ['pending', 'accepted', 'revoked', 'expired'].includes(row.state)
        && Number.isSafeInteger(row.created_at) && Number.isSafeInteger(row.expires_at);
}

async function verifiedInvitation(database: D1Database, token: string): Promise<VerifiedInvitationRow> {
    let invitationId: string;
    try {
        invitationId = parseInvitationToken(token).invitationId;
    } catch {
        unavailable();
    }
    const row = await loadInvitationById(database, invitationId);
    const dummy = new Uint8Array(32).buffer;
    const verification = await verifyInvitationToken(token, row?.token_digest ?? dummy);
    if (row === null || !validInvitationRow(row) || verification === null
        || verification.invitationId !== row.id) unavailable();
    return row.token_digest instanceof ArrayBuffer
        ? row as VerifiedInvitationRow
        : { ...row, token_digest: Uint8Array.from(row.token_digest).buffer };
}

export async function bootstrapInvitation(
    database: D1Database,
    input: BootstrapInvitationInput
): Promise<BootstrapInvitationResult> {
    requireTime(input.serverTime);
    if (input.actorUserId !== undefined) requireUuid(input.actorUserId);
    const row = await verifiedInvitation(database, input.token);
    if (row.state !== 'pending' || input.serverTime >= row.expires_at
        || typeof row.workspace_display_name !== 'string') unavailable();
    let identityMatch: boolean | undefined;
    if (input.actorUserId !== undefined) {
        const match = await openAuthorizationSession(database).prepare(
            `SELECT CASE WHEN status = 'active' AND provider = ? AND provider_subject = ?
                    THEN 1 ELSE 0 END AS identity_match
             FROM users WHERE id = ? LIMIT 1`
        ).bind(row.target_provider, row.target_provider_subject, input.actorUserId)
            .first<number>('identity_match');
        identityMatch = match === 1;
    }
    return Object.freeze({ invitationId: row.id, workspaceDisplayName: row.workspace_display_name,
        targetDisplayLogin: row.target_login_snapshot, role: row.offered_role as InvitationRole,
        expiresAt: row.expires_at, state: 'pending',
        ...(identityMatch === undefined ? {} : { identityMatch }) });
}

function parseRevokeResult(stored: StoredMutationResult, replayed: boolean): RevokeInvitationResult {
    let value: unknown;
    try {
        value = JSON.parse(stored.resultJson);
    } catch {
        invalid();
    }
    if (stored.httpStatus !== 204 || typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
    const row = value as Record<string, unknown>;
    if (typeof row.invitationId !== 'string' || !UUID_V4.test(row.invitationId)
        || row.state !== 'revoked') invalid();
    return { invitationId: row.invitationId, state: 'revoked', replayed, httpStatus: 204 };
}

export async function revokeInvitation(
    database: D1Database,
    input: RevokeInvitationInput
): Promise<RevokeInvitationResult> {
    validateMutation(input);
    requireUuid(input.invitationId);
    const row = await loadInvitationById(database, input.invitationId);
    if (row === null || !validInvitationRow(row) || row.workspace_id !== input.workspaceId
        || !isRole(row.offered_role)) unavailable();
    await authorize(database, 'invitation.revoke', input.actorUserId, input.actorDeviceId,
        input.workspaceId, row.offered_role);
    const replay = await resolveReplay(database, input, 'invitation.revoke');
    if (replay !== null) return parseRevokeResult(replay, true);
    const result = revokeResultJson(input.invitationId);
    const guard = database.prepare(
        `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id,
          http_status, result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'invitation.revoke', ?, ?, 'invitation', ?, 204,
           (SELECT ? FROM memberships actor JOIN devices device ON device.user_id = actor.user_id
            JOIN invitations invitation ON invitation.workspace_id = actor.workspace_id
            JOIN workspaces workspace ON workspace.id = actor.workspace_id
            WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.state = 'active'
              AND device.id = ? AND device.state = 'active' AND workspace.state = 'active'
              AND invitation.id = ? AND invitation.state = 'pending' AND invitation.expires_at > ?
              AND ((actor.role = 'owner' AND invitation.offered_role IN ('admin','editor','viewer'))
                OR (actor.role = 'admin' AND invitation.offered_role IN ('editor','viewer')))), ?, ?)`
    ).bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
        input.clientMutationId, input.requestFingerprint, input.invitationId, result,
        input.workspaceId, input.actorUserId, input.actorDeviceId, input.invitationId,
        input.serverTime, input.serverTime, input.replayExpiresAt);
    const domain = [database.prepare(
        `UPDATE invitations SET state = 'revoked', revoked_at = ?
         WHERE id = ? AND workspace_id = ? AND state = 'pending' AND expires_at > ?`
    ).bind(input.serverTime, input.invitationId, input.workspaceId, input.serverTime)];
    try {
        return parseRevokeResult(await executeGuardedBatch(database,
            invitationMutationRecipe(database, input, guard, domain, 'invitation.revoked',
                input.invitationId)), false);
    } catch (error) {
        const winner = await resolveReplay(database, input, 'invitation.revoke');
        if (winner !== null) return parseRevokeResult(winner, true);
        unavailableForTerminalConflict(error);
    }
}

function acceptanceResultJson(invitationId: string, workspaceId: string): string {
    return JSON.stringify({ invitationId, workspaceId, membershipState: 'pending_key' });
}

export async function acceptInvitation(
    database: D1Database,
    input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
    for (const id of [input.actorUserId, input.actorDeviceId, input.transitionGuardId,
        input.clientMutationId, input.auditEventId, input.requestId]) requireUuid(id);
    requireFingerprint(input.requestFingerprint);
    requireTime(input.serverTime);
    requireTime(input.replayExpiresAt);
    if (input.replayExpiresAt <= input.serverTime) invalid();
    const row = await verifiedInvitation(database, input.token);
    if (input.serverTime >= row.expires_at || (row.state !== 'pending'
        && !(row.state === 'accepted' && row.accepted_by === input.actorUserId))) unavailable();
    const identity = await openAuthorizationSession(database).prepare(
        `SELECT CASE WHEN u.status = 'active' AND u.provider = ? AND u.provider_subject = ?
                    AND d.state = 'active' THEN 1 ELSE 0 END AS authorized
         FROM users u JOIN devices d ON d.user_id = u.id
         WHERE u.id = ? AND d.id = ? LIMIT 1`
    ).bind(row.target_provider, row.target_provider_subject, input.actorUserId,
        input.actorDeviceId).first<number>('authorized');
    if (identity !== 1) unavailable();
    const resultJson = acceptanceResultJson(row.id, row.workspace_id);
    const bindings: RecipeBindings = {
        guard: [input.transitionGuardId, input.actorUserId, input.actorDeviceId,
            row.workspace_id, input.clientMutationId, input.requestFingerprint, row.id,
            row.token_digest, resultJson, input.serverTime, input.replayExpiresAt],
        domain: [
            [input.actorUserId, input.serverTime, row.id, row.workspace_id,
                input.actorUserId, row.token_digest, input.serverTime],
            [row.workspace_id, input.actorUserId, input.actorUserId, input.serverTime, row.id]
        ],
        audit: [input.auditEventId, row.workspace_id, input.actorUserId, input.actorDeviceId,
            row.id, input.requestId, input.serverTime],
        result: [input.transitionGuardId]
    };
    const scope: ReplayScope = { actorUserId: input.actorUserId, actorDeviceId: input.actorDeviceId,
        workspaceId: row.workspace_id, operation: 'invitation.accept',
        clientMutationId: input.clientMutationId, requestFingerprint: input.requestFingerprint,
        serverTime: input.serverTime };
    let stored: StoredMutationResult;
    try {
        stored = await executeIdempotentRecipe(database,
            buildInvitationAcceptRecipe(database, bindings), scope);
    } catch (error) {
        unavailableForTerminalConflict(error);
    }
    if (stored.httpStatus !== 201 || stored.resultJson !== resultJson) invalid();
    return Object.freeze({ invitationId: row.id, workspaceId: row.workspace_id,
        membershipState: 'pending_key', httpStatus: 201 });
}

export const INVITATION_LIFECYCLE_CONSTANTS = Object.freeze({
    tokenBits: 256,
    expiryMilliseconds: INVITATION_TTL_MS,
    maximumPageSize: MAXIMUM_PAGE_SIZE,
    tokenStorage: 'hash-only',
    acceptedMembershipState: 'pending_key'
});
