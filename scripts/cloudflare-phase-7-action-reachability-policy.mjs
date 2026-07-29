import { ACTION_DEBT } from './cloudflare-phase-7-wiring-sprint-policy.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sorted = values => [...values].sort();

/**
 * Literal actions rendered by Collaboration modules. This is intentionally
 * exact: adding a control is a delivery decision, not harmless markup.
 */
export const LITERAL_ACTIONS = Object.freeze([
    'accept-invitation',
    'account-menu-toggle',
    'announce-state',
    'await-provisioning',
    'cancel-discard',
    'copy-acceptance-link',
    'create-invitation',
    'device-setup-open',
    'dismiss-conflict',
    'list-audit-events',
    'list-members',
    'paginate',
    'register-device',
    'review-invitation',
    'revoke-invitation',
    'revoke-this-device',
    'show-fingerprint',
    'show-key-readiness',
    'show-role-badge',
    'workspace-create-open',
    'workspace-create-submit',
    'workspace-switch',
    'workspace-switcher-toggle'
]);

/**
 * The four reviewed dynamic renderers. Their value sets are frozen below, so a
 * new dynamic setter cannot bypass the literal-action inventory.
 */
export const DYNAMIC_SETTERS = Object.freeze([
    ['account-menu.js', 'item.id'],
    ['base-states.js', 'model.action.id'],
    ['conflict-dialog.js', 'item.option'],
    ['member-list.js', 'surfaceAction']
]);

/**
 * Every action that may be enabled today must either be handled, be a direct
 * view-only interaction, be passive semantics, or have an owned debt record.
 */
export const HANDLED_ACTIONS = Object.freeze([
    'copy-acceptance-link',
    'create-invitation',
    'device-setup-open',
    'register-device',
    'revoke-invitation',
    'revoke-this-device',
    'sign-in',
    'workspace-create-submit',
    'workspace-switch'
]);

export const DIRECT_OR_PASSIVE_ACTIONS = Object.freeze([
    'account-menu-toggle',
    'announce-state',
    'await-provisioning',
    'list-audit-events',
    'list-members',
    'review-invitation',
    'show-fingerprint',
    'show-key-readiness',
    'show-role-badge',
    'workspace-switcher-toggle'
]);

/**
 * All still-unhandled controls are tied to the exact sprint debt that owns
 * them. The collision debt is absent here because CF-P7R-001 resolves it; the
 * separately targeted member-device journey remains owned by CF-P7R-006.
 */
export const DEBT_ACTIONS = Object.freeze([
    ['invitation-accept:accept-invitation', 'accept-invitation'],
    ['account-menu:sign-out', 'sign-out'],
    ['member-list:change-role', 'change-role'],
    ['member-list:grant-admin', 'grant-admin'],
    ['member-list:transfer-ownership', 'transfer-ownership'],
    ['member-list:remove-member', 'remove-member'],
    ['member-list:revoke-member-device', 'revoke-member-device'],
    ['member-list:provision-key', 'provision-key'],
    ['audit-activity:paginate', 'paginate'],
    ['workspace-switcher:workspace-create-open', 'workspace-create-open'],
    ['conflict-dialog:review-latest', 'review-latest'],
    ['conflict-dialog:reapply-to-latest', 'reapply-to-latest'],
    ['conflict-dialog:save-as-separate-copy', 'save-as-separate-copy'],
    ['conflict-dialog:discard-with-confirmation', 'discard-with-confirmation'],
    ['conflict-dialog:cancel-discard', 'cancel-discard'],
    ['conflict-dialog:dismiss-conflict', 'dismiss-conflict']
]);

const DYNAMIC_ACTIONS = Object.freeze([
    'sign-in',
    'sign-out',
    'change-role',
    'grant-admin',
    'transfer-ownership',
    'remove-member',
    'revoke-member-device',
    'provision-key',
    'review-latest',
    'reapply-to-latest',
    'save-as-separate-copy',
    'discard-with-confirmation'
]);

function renderedSetters(sources) {
    const literal = new Set();
    const dynamic = [];
    const matcher = /setAttribute\('data-collab-action',\s*([^)]+)\)/g;
    for (const [file, source] of Object.entries(sources)) {
        let match;
        while ((match = matcher.exec(source)) !== null) {
            const expression = match[1].trim();
            const quoted = expression.match(/^'([^']+)'$/);
            if (quoted) literal.add(quoted[1]);
            else dynamic.push([file, expression]);
        }
    }
    return { literal: sorted(literal), dynamic: dynamic.sort((a, b) =>
        `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`)) };
}

export function validatePhase7ActionReachability({ plan, sources }) {
    assert(plan?.sprint === 'CF-P7-S02' && sources && typeof sources === 'object',
        'Action reachability requires the reviewed sprint and Collaboration sources');

    const debt = plan.known_action_debt || [];
    assert(same(debt.map(item => [item.key, item.owner]), ACTION_DEBT),
        'Action reachability is not backed by the exact sprint debt inventory');
    const collision = debt.find(item => item.key === 'member-device:dispatch-collision');
    assert(collision?.owner === 'CF-P7R-001' && collision.status === 'RESOLVED',
        'The member-device dispatch collision is not resolved by CF-P7R-001');
    const invitationCopy = debt.find(item =>
        item.key === 'invitation-manage:copy-acceptance-link');
    assert(invitationCopy?.owner === 'CF-P7R-002' && invitationCopy.status === 'RESOLVED',
        'The invitation copy action is not resolved by CF-P7R-002');
    const invitationRevoke = debt.find(item =>
        item.key === 'invitation-manage:revoke-invitation');
    assert(invitationRevoke?.owner === 'CF-P7R-003' && invitationRevoke.status === 'RESOLVED',
        'The invitation revoke action is not resolved by CF-P7R-003');

    const remainingDebt = ACTION_DEBT
        .filter(([key]) => ![
            'member-device:dispatch-collision',
            'invitation-manage:copy-acceptance-link',
            'invitation-manage:revoke-invitation'
        ].includes(key))
        .map(([key]) => key);
    assert(same(DEBT_ACTIONS.map(([key]) => key), remainingDebt),
        'A remaining action debt lacks an exact reachability owner');

    const inventory = renderedSetters(sources);
    assert(same(inventory.literal, sorted(LITERAL_ACTIONS)),
        'A literal Collaboration action was added, removed, or left unowned');
    assert(same(inventory.dynamic, [...DYNAMIC_SETTERS].sort((a, b) =>
        `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`))),
    'A dynamic Collaboration action setter bypasses the reviewed inventory');

    const owned = new Set([
        ...HANDLED_ACTIONS,
        ...DIRECT_OR_PASSIVE_ACTIONS,
        ...DEBT_ACTIONS.map(([, action]) => action)
    ]);
    for (const action of [...LITERAL_ACTIONS, ...DYNAMIC_ACTIONS]) {
        assert(owned.has(action), `Enabled action has no handler or debt owner: ${action}`);
    }

    const entry = sources['entry.js'] || '';
    const device = sources['device-initialization.js'] || '';
    const members = sources['member-list.js'] || '';
    assert(device.includes("'revoke-this-device'")
        && members.includes("'revoke-member-device'")
        && !entry.includes("action === 'revoke-device'"),
    'Self-device and member-device actions are not isolated');
    assert(entry.includes("control.closest('[data-collab-surface]')")
        && entry.includes("!== 'device-key-initialization'"),
    'Destructive current-device dispatch is not surface-aware');
    assert(members.includes('MEMBER_DEVICE_REVOCATION_DEFERRED_REASON')
        && /memberDeviceRevocation[\s\S]{0,900}?button\.disabled = true;/.test(members),
    'Member-device revocation is not visibly deferred and disabled');
    assert(/action === 'copy-acceptance-link'[\s\S]{0,450}?control\.closest\('\[data-collab-surface="invitation-manage"\]'\)/
        .test(entry)
        && entry.includes('copyAcceptanceUrl({ clipboard, held })'),
    'The one-time invitation copy action is not wired through its scoped clipboard boundary');
    assert(/action === 'revoke-invitation'[\s\S]{0,700}?control\.closest\('\[data-collab-surface="invitation-manage"\]'\)/
        .test(entry)
        && entry.includes("control.closest('[data-invitation-id]')")
        && entry.includes('revokeInvitation({')
        && entry.includes('invitationRevokePendingId !== null'),
    'Invitation revocation is not scoped to its row or guarded against duplicate dispatch');
    return true;
}
