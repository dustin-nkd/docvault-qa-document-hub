export const RBAC_ACTIONS = Object.freeze([
    'workspace.read-status',
    'workspace.read',
    'document.read',
    'document.write',
    'document.copy-in',
    'member.list',
    'invitation.list',
    'invitation.create',
    'invitation.revoke',
    'membership.change-role',
    'membership.remove',
    'ownership.transfer',
    'device.manage-own',
    'device.revoke-other',
    'envelope.provision',
    'audit.read',
    'workspace.export',
    'workspace.delete'
] as const);

export type RbacAction = typeof RBAC_ACTIONS[number];
export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type MembershipState = 'active' | 'pending_key' | 'removed';
export type ActingDeviceState = 'active' | 'revoked' | 'absent';
export type ResourceScope = 'same-workspace' | 'other-workspace' | 'missing' | 'deleted' | 'malformed';
export type RbacDecisionCode =
    | 'ALLOWED'
    | 'UNAUTHENTICATED'
    | 'RESOURCE_NOT_FOUND'
    | 'KEY_PROVISIONING_REQUIRED'
    | 'DEVICE_NOT_AUTHORIZED'
    | 'OPERATION_NOT_PERMITTED'
    | 'RECENT_AUTHENTICATION_REQUIRED'
    | 'LAST_OWNER_REQUIRED'
    | 'LIFECYCLE_POLICY_UNAVAILABLE';

export type RbacSubject =
    | { readonly kind: 'unauthenticated' }
    | { readonly kind: 'guest' }
    | { readonly kind: 'non-member' }
    | {
        readonly kind: 'member';
        readonly role: WorkspaceRole;
        readonly membershipState: MembershipState;
        readonly actingDeviceState: ActingDeviceState;
        readonly keyReady: boolean;
    };

export interface RbacContext {
    readonly resourceScope?: ResourceScope;
    readonly targetRole?: WorkspaceRole;
    readonly desiredRole?: WorkspaceRole;
    readonly targetMembershipState?: MembershipState;
    readonly targetIsSelf?: boolean;
    readonly recentAuthentication?: boolean;
    readonly wouldRemoveLastOwner?: boolean;
}

export interface RbacPolicyInput {
    readonly action: RbacAction;
    readonly subject: RbacSubject;
    readonly context?: RbacContext;
}

export interface RbacDecision {
    readonly allowed: boolean;
    readonly code: RbacDecisionCode;
}

const actions = (...values: RbacAction[]): readonly RbacAction[] => Object.freeze(values);

const ROLE_ACTIONS: Readonly<Record<WorkspaceRole, readonly RbacAction[]>> = Object.freeze({
    owner: actions(
        'workspace.read-status', 'workspace.read', 'document.read', 'document.write',
        'document.copy-in', 'member.list', 'invitation.list', 'invitation.create',
        'invitation.revoke', 'membership.change-role', 'membership.remove',
        'ownership.transfer', 'device.manage-own', 'device.revoke-other',
        'envelope.provision', 'audit.read'
    ),
    admin: actions(
        'workspace.read-status', 'workspace.read', 'document.read', 'document.write',
        'document.copy-in', 'member.list', 'invitation.list', 'invitation.create',
        'invitation.revoke', 'membership.change-role', 'membership.remove',
        'device.manage-own', 'device.revoke-other', 'envelope.provision', 'audit.read'
    ),
    editor: actions(
        'workspace.read-status', 'workspace.read', 'document.read', 'document.write',
        'document.copy-in', 'member.list', 'device.manage-own'
    ),
    viewer: actions(
        'workspace.read-status', 'workspace.read', 'document.read', 'member.list',
        'device.manage-own'
    )
});

const DEVICE_BOUND_ACTIONS = actions(
    'document.read', 'document.write', 'document.copy-in', 'device.revoke-other',
    'envelope.provision'
);
const KEY_READY_ACTIONS = actions(
    'document.read', 'document.write', 'document.copy-in', 'envelope.provision'
);
const PENDING_KEY_ACTIONS = actions('workspace.read-status', 'device.manage-own');
const LIFECYCLE_ACTIONS = actions('workspace.export', 'workspace.delete');
const ROLES: readonly string[] = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
const MEMBERSHIP_STATES: readonly string[] = Object.freeze(['active', 'pending_key', 'removed']);
const DEVICE_STATES: readonly string[] = Object.freeze(['active', 'revoked', 'absent']);

const decision = (allowed: boolean, code: RbacDecisionCode): RbacDecision => ({ allowed, code });
const deny = (code: Exclude<RbacDecisionCode, 'ALLOWED'>): RbacDecision => decision(false, code);

function validMember(subject: Extract<RbacSubject, { kind: 'member' }>): boolean {
    return ROLES.includes(subject.role) && MEMBERSHIP_STATES.includes(subject.membershipState)
        && DEVICE_STATES.includes(subject.actingDeviceState) && typeof subject.keyReady === 'boolean';
}

function targetCeiling(input: RbacPolicyInput): RbacDecision | null {
    const { action, subject, context = {} } = input;
    if (subject.kind !== 'member') return deny('OPERATION_NOT_PERMITTED');
    if (action === 'invitation.create' || action === 'invitation.revoke') {
        if (!context.targetRole || context.targetRole === 'owner') return deny('OPERATION_NOT_PERMITTED');
        if (subject.role === 'admin' && !['editor', 'viewer'].includes(context.targetRole)) {
            return deny('OPERATION_NOT_PERMITTED');
        }
    }
    if (action === 'membership.change-role') {
        if (context.wouldRemoveLastOwner === true) return deny('LAST_OWNER_REQUIRED');
        if (!context.targetRole || !context.desiredRole || context.targetRole === 'owner'
            || context.desiredRole === 'owner') return deny('OPERATION_NOT_PERMITTED');
        if (subject.role === 'admin'
            && (!['editor', 'viewer'].includes(context.targetRole)
                || !['editor', 'viewer'].includes(context.desiredRole))) {
            return deny('OPERATION_NOT_PERMITTED');
        }
    }
    if (action === 'membership.remove') {
        if (context.wouldRemoveLastOwner === true) return deny('LAST_OWNER_REQUIRED');
        if (!context.targetRole || context.targetRole === 'owner') return deny('OPERATION_NOT_PERMITTED');
        if (subject.role === 'admin' && !['editor', 'viewer'].includes(context.targetRole)) {
            return deny('OPERATION_NOT_PERMITTED');
        }
    }
    if (action === 'ownership.transfer') {
        if (context.recentAuthentication !== true) return deny('RECENT_AUTHENTICATION_REQUIRED');
        if (!context.targetRole || context.targetRole === 'owner'
            || context.targetMembershipState !== 'active' || context.targetIsSelf !== false) {
            return deny('OPERATION_NOT_PERMITTED');
        }
    }
    if (action === 'device.revoke-other') {
        if (context.recentAuthentication !== true) return deny('RECENT_AUTHENTICATION_REQUIRED');
        if (!context.targetRole || (subject.role === 'admin'
            && !['editor', 'viewer'].includes(context.targetRole))) {
            return deny('OPERATION_NOT_PERMITTED');
        }
    }
    return null;
}

export function evaluateRbacPolicy(input: RbacPolicyInput): RbacDecision {
    if (!RBAC_ACTIONS.some(action => action === input.action)) return deny('OPERATION_NOT_PERMITTED');
    if (input.subject.kind === 'unauthenticated') return deny('UNAUTHENTICATED');
    if (input.subject.kind === 'guest' || input.subject.kind === 'non-member') {
        return deny('RESOURCE_NOT_FOUND');
    }
    if (!validMember(input.subject) || input.subject.membershipState === 'removed') {
        return deny('RESOURCE_NOT_FOUND');
    }
    const scope = input.context?.resourceScope ?? 'same-workspace';
    if (scope !== 'same-workspace') return deny('RESOURCE_NOT_FOUND');
    if (input.subject.membershipState === 'pending_key') {
        return PENDING_KEY_ACTIONS.includes(input.action)
            ? decision(true, 'ALLOWED')
            : deny('KEY_PROVISIONING_REQUIRED');
    }
    if (!ROLE_ACTIONS[input.subject.role].includes(input.action)) {
        return LIFECYCLE_ACTIONS.includes(input.action) && input.subject.role === 'owner'
            ? deny('LIFECYCLE_POLICY_UNAVAILABLE')
            : deny('OPERATION_NOT_PERMITTED');
    }
    if (DEVICE_BOUND_ACTIONS.includes(input.action) && input.subject.actingDeviceState !== 'active') {
        return deny('DEVICE_NOT_AUTHORIZED');
    }
    if (KEY_READY_ACTIONS.includes(input.action) && !input.subject.keyReady) {
        return deny('KEY_PROVISIONING_REQUIRED');
    }
    return targetCeiling(input) ?? decision(true, 'ALLOWED');
}
