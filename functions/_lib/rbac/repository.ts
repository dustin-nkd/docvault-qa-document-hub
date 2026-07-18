import { openAuthorizationSession } from '../persistence';
import {
    evaluateRbacPolicy,
    type ActingDeviceState,
    type MembershipState,
    type RbacAction,
    type RbacContext,
    type RbacDecision,
    type RbacSubject,
    type WorkspaceRole
} from './policy';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROLES: readonly string[] = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
const MEMBERSHIP_STATES: readonly string[] = Object.freeze(['active', 'pending_key', 'removed']);
const DEVICE_STATES: readonly string[] = Object.freeze(['active', 'revoked']);

interface PrincipalRow {
    user_status: string;
    role: string | null;
    membership_state: string | null;
    device_state: string | null;
    workspace_state: string | null;
    key_ready: number;
}

export interface ResolvedWorkspacePrincipal {
    readonly subject: RbacSubject;
    readonly resourceScope: 'same-workspace' | 'deleted' | 'missing';
}

export interface WorkspaceAuthorizationInput {
    readonly actorUserId: string;
    readonly actingDeviceId: string | null;
    readonly workspaceId: string;
    readonly action: RbacAction;
    readonly context?: RbacContext;
}

function isWorkspaceRole(value: string | null): value is WorkspaceRole {
    return value !== null && ROLES.includes(value);
}

function isMembershipState(value: string | null): value is MembershipState {
    return value !== null && MEMBERSHIP_STATES.includes(value);
}

function isDeviceState(value: string | null): value is Exclude<ActingDeviceState, 'absent'> {
    return value !== null && DEVICE_STATES.includes(value);
}

function mappedPrincipal(row: PrincipalRow | null): ResolvedWorkspacePrincipal {
    if (row === null || row.user_status !== 'active') {
        return { subject: { kind: 'unauthenticated' }, resourceScope: 'missing' };
    }
    if (row.role === null || row.membership_state === null || row.workspace_state === null) {
        return { subject: { kind: 'non-member' }, resourceScope: 'missing' };
    }
    if (!isWorkspaceRole(row.role) || !isMembershipState(row.membership_state)
        || (row.device_state !== null && !isDeviceState(row.device_state))
        || !['active', 'rotating', 'deletion_pending', 'deleted'].includes(row.workspace_state)
        || ![0, 1].includes(row.key_ready)) {
        return { subject: { kind: 'non-member' }, resourceScope: 'missing' };
    }
    return {
        subject: {
            kind: 'member',
            role: row.role,
            membershipState: row.membership_state,
            actingDeviceState: row.device_state ?? 'absent',
            keyReady: row.key_ready === 1
        },
        resourceScope: row.workspace_state === 'deleted' ? 'deleted' : 'same-workspace'
    };
}

export async function loadWorkspaceRbacPrincipal(
    database: D1Database,
    actorUserId: string,
    workspaceId: string,
    actingDeviceId: string | null
): Promise<ResolvedWorkspacePrincipal> {
    if (!UUID_V4.test(actorUserId) || !UUID_V4.test(workspaceId)
        || (actingDeviceId !== null && !UUID_V4.test(actingDeviceId))) {
        return { subject: { kind: 'non-member' }, resourceScope: 'missing' };
    }
    const session = openAuthorizationSession(database);
    const row = await session.prepare(
        `SELECT u.status AS user_status, m.role AS role, m.state AS membership_state,
                d.state AS device_state, w.state AS workspace_state,
                CASE WHEN EXISTS (
                    SELECT 1 FROM workspace_key_envelopes e
                    JOIN workspaces w ON w.id = e.workspace_id
                    WHERE e.workspace_id = m.workspace_id AND e.target_user_id = m.user_id
                      AND e.target_device_id = d.id AND e.key_version = w.current_key_version
                      AND e.revoked_at IS NULL
                ) THEN 1 ELSE 0 END AS key_ready
         FROM users u
         LEFT JOIN memberships m ON m.user_id = u.id AND m.workspace_id = ?
         LEFT JOIN workspaces w ON w.id = m.workspace_id
         LEFT JOIN devices d ON d.user_id = u.id AND d.id = ?
         WHERE u.id = ?
         LIMIT 1`
    ).bind(workspaceId, actingDeviceId, actorUserId).first<PrincipalRow>();
    return mappedPrincipal(row);
}

export async function loadWorkspaceRbacSubject(
    database: D1Database,
    actorUserId: string,
    workspaceId: string,
    actingDeviceId: string | null
): Promise<RbacSubject> {
    return (await loadWorkspaceRbacPrincipal(database, actorUserId, workspaceId, actingDeviceId)).subject;
}

export async function authorizeWorkspaceAction(
    database: D1Database,
    input: WorkspaceAuthorizationInput
): Promise<RbacDecision> {
    const resolved = await loadWorkspaceRbacPrincipal(database, input.actorUserId,
        input.workspaceId, input.actingDeviceId);
    return evaluateRbacPolicy({
        action: input.action,
        subject: resolved.subject,
        context: { ...input.context, resourceScope: resolved.resourceScope }
    });
}
