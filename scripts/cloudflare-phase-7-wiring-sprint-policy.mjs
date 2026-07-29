const assert = (condition, message) => { if (!condition) throw new Error(message); };
const SHA = /^[0-9a-f]{40}$/;
const ACTIVE = new Set(['READY', 'IN_PROGRESS', 'AWAITING_REVIEW', 'REVIEW_PASS']);
const ALLOWED = new Set([...ACTIVE, 'BLOCKED', 'PASS']);
const VERIFY_KEYS = ['targeted', 'composed_entry', 'browser_action_to_request',
    'relevant_phase_gates', 'full_cloudflare'];

export const TICKET_SPECS = Object.freeze([
    ['CF-P7R-001', 'Isolate self-device and member-device revocation actions',
        ['composed_entry', 'browser_action_to_request', 'phase7_device', 'phase7_members', 'phase7_dispatch']],
    ['CF-P7R-002', 'Wire the one-time invitation Copy link action',
        ['composed_entry', 'browser_action_to_request', 'phase7_invitations', 'phase7_dispatch']],
    ['CF-P7R-003', 'Wire invitation revocation end to end',
        ['composed_entry', 'browser_action_to_request', 'phase7_invitations', 'phase7_api', 'phase4_invitation_lifecycle']],
    ['CF-P7R-004', 'Reconcile and wire invitation acceptance end to end',
        ['composed_entry', 'browser_action_to_request', 'phase7_accept', 'phase7_api', 'preview_api_workers', 'phase4_invitation_lifecycle']],
    ['CF-P7R-005', 'Wire Sign out without touching device key material',
        ['composed_entry', 'browser_action_to_request', 'phase7_account', 'phase7_dispatch', 'identity_session_workers']],
    ['CF-P7R-006', 'Wire member administration, device targeting, and key provisioning',
        ['composed_entry', 'browser_action_to_request', 'phase7_members', 'phase7_api', 'phase4_memberships', 'phase5_device_services', 'phase5_workspace_keys', 'preview_key_workers']],
    ['CF-P7R-007', 'Wire Audit activity pagination',
        ['composed_entry', 'browser_action_to_request', 'phase7_audit', 'phase7_dispatch', 'phase4_audit']],
    ['CF-P7R-008', 'Close enabled-action debt and state the document-provider boundary truthfully',
        ['composed_entry', 'browser_action_to_request', 'phase7_create', 'phase7_sync', 'phase7_conflict', 'phase7_dispatch', 'phase7_preview']]
]);

export const ACTION_DEBT = Object.freeze([
    ['member-device:dispatch-collision', 'CF-P7R-001'],
    ['invitation-manage:copy-acceptance-link', 'CF-P7R-002'],
    ['invitation-manage:revoke-invitation', 'CF-P7R-003'],
    ['invitation-accept:accept-invitation', 'CF-P7R-004'],
    ['account-menu:sign-out', 'CF-P7R-005'],
    ['member-list:change-role', 'CF-P7R-006'],
    ['member-list:grant-admin', 'CF-P7R-006'],
    ['member-list:transfer-ownership', 'CF-P7R-006'],
    ['member-list:remove-member', 'CF-P7R-006'],
    ['member-list:revoke-member-device', 'CF-P7R-006'],
    ['member-list:provision-key', 'CF-P7R-006'],
    ['audit-activity:paginate', 'CF-P7R-007'],
    ['workspace-switcher:workspace-create-open', 'CF-P7R-008'],
    ['conflict-dialog:review-latest', 'CF-P7R-008'],
    ['conflict-dialog:reapply-to-latest', 'CF-P7R-008'],
    ['conflict-dialog:save-as-separate-copy', 'CF-P7R-008'],
    ['conflict-dialog:discard-with-confirmation', 'CF-P7R-008'],
    ['conflict-dialog:cancel-discard', 'CF-P7R-008'],
    ['conflict-dialog:dismiss-conflict', 'CF-P7R-008']
]);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const allPass = verification => VERIFY_KEYS.every(key => verification?.[key] === 'PASS');
const emptyDelivery = delivery => delivery?.commit === null && delivery.pushed === false
    && delivery.pipeline === 'NOT_RUN' && delivery.preview_smoke === 'NOT_RUN';

function validateLifecycle(ticket, evidenceSources) {
    const pending = ['BLOCKED', 'READY', 'IN_PROGRESS', 'AWAITING_REVIEW'].includes(ticket.status);
    if (pending) {
        assert(ticket.review.status === 'PENDING' && emptyDelivery(ticket.delivery),
            `${ticket.id} records review or delivery before review PASS`);
    }
    if (ticket.status === 'AWAITING_REVIEW') {
        assert(allPass(ticket.verification),
            `${ticket.id} awaits review before verification PASS`);
    }
    if (ticket.status === 'REVIEW_PASS') {
        assert(ticket.review.status === 'PASS' && allPass(ticket.verification),
            `${ticket.id} claims REVIEW_PASS without review and verification PASS`);
    }
    if (ticket.review.status === 'PASS') {
        assert(allPass(ticket.verification),
            `${ticket.id} review PASS lacks complete verification`);
        assert(ticket.status === 'REVIEW_PASS' || ticket.status === 'PASS',
            `${ticket.id} review PASS has an invalid lifecycle status`);
    }
    if (ticket.delivery.commit !== null) {
        assert(ticket.review.status === 'PASS' && SHA.test(ticket.delivery.commit),
            `${ticket.id} records a commit before review PASS`);
    }
    if (ticket.delivery.pushed) {
        assert(SHA.test(ticket.delivery.commit || ''), `${ticket.id} pushed without a commit`);
    }
    if (ticket.delivery.pipeline === 'PASS') {
        assert(ticket.delivery.pushed === true, `${ticket.id} pipeline passed before push`);
    }
    if (ticket.delivery.preview_smoke === 'PASS') {
        assert(ticket.delivery.pipeline === 'PASS',
            `${ticket.id} Preview smoke passed before the pipeline`);
    }
    if (ticket.status !== 'PASS') return;
    assert(ticket.review.status === 'PASS' && allPass(ticket.verification),
        `${ticket.id} is PASS without review and verification PASS`);
    assert(SHA.test(ticket.delivery.commit || '') && ticket.delivery.pushed === true
        && ticket.delivery.pipeline === 'PASS' && ticket.delivery.preview_smoke === 'PASS',
    `${ticket.id} is PASS without immutable delivery evidence`);
    const live = ticket.live_qualification || {};
    assert(live.required === false ? live.status === 'NOT_REQUIRED' : live.status === 'PASS',
        `${ticket.id} is PASS without required owner live qualification`);
    assert(ticket.evidence?.status === 'PASS', `${ticket.id} is PASS without evidence metadata`);
    const evidence = evidenceSources?.[ticket.evidence.id] || '';
    assert(/^Status:\s*\*{0,2}PASS/m.test(evidence) && evidence.includes(ticket.id)
        && evidence.includes(ticket.delivery.commit),
    `${ticket.id} PASS evidence is missing or does not bind the implementation commit`);
}

export function validatePhase7WiringSprint({ plan, sprintSource, evidenceSources = {} }) {
    assert(plan?.schema_version === 2 && plan.phase === 'CF-P7'
        && plan.sprint === 'CF-P7-S02', 'Unsupported Phase 7 wiring sprint');
    assert(['READY', 'ACTIVE', 'PASS'].includes(plan.status), 'Invalid sprint status');
    assert(plan.ticket_count === 8 && plan.concurrency_limit === 1
        && SHA.test(plan.baseline_commit || ''), 'Invalid sprint inventory or baseline');

    const tickets = plan.tickets || [];
    assert(same(tickets.map(ticket => [ticket.id, ticket.title, ticket.required_tests]),
        TICKET_SPECS), 'Ticket title, order, or required-test scope drifted');
    const active = tickets.filter(ticket => ACTIVE.has(ticket.status));
    if (plan.status === 'PASS') {
        assert(tickets.every(ticket => ticket.status === 'PASS')
            && active.length === 0 && plan.current_ticket === null,
        'Sprint claims PASS before every ticket closed');
    } else {
        assert(active.length === 1 && plan.current_ticket === active[0].id,
            'The current ticket is not the one active ticket');
    }

    const evidenceIds = new Set();
    for (let index = 0; index < tickets.length; index += 1) {
        const ticket = tickets[index];
        const predecessor = tickets[index - 1];
        assert(ALLOWED.has(ticket.status), `${ticket.id} has an invalid status`);
        assert(ticket.entry_gate === `P7R-G${index}`
            && ticket.exit_gate === `P7R-G${index + 1}`,
        `${ticket.id} breaks the gate chain`);
        assert(same(ticket.depends_on || [], predecessor ? [predecessor.id] : []),
            `${ticket.id} has the wrong predecessor`);
        if ((ACTIVE.has(ticket.status) || ticket.status === 'PASS') && predecessor) {
            assert(predecessor.status === 'PASS',
                `${ticket.id} opened or passed before ${predecessor.id}`);
        }
        if (ticket.status === 'BLOCKED') {
            assert(predecessor && predecessor.status !== 'PASS',
                `${ticket.id} stays blocked after its predecessor passed`);
        }
        assert(ticket.scope?.length >= 2 && ticket.acceptance_criteria?.length >= 4,
            `${ticket.id} has incomplete scope or acceptance criteria`);
        assert(ticket.review?.required === true && ticket.review.reviewer === 'AGY'
            && ticket.review.independent_review === false,
        `${ticket.id} review provenance drifted`);
        const evidence = ticket.evidence || {};
        assert(evidence.id === `CF-EV-P7-E2E-00${index + 1}`
            && evidence.path === `docs/collaboration-foundation/evidence/phase-7/${evidence.id}.md`
            && !evidenceIds.has(evidence.id),
        `${ticket.id} evidence ownership drifted`);
        evidenceIds.add(evidence.id);
        assert(sprintSource.includes(`\`${ticket.id}\``), `${ticket.id} is absent from the sprint`);
        validateLifecycle(ticket, evidenceSources);
    }

    const debt = plan.known_action_debt || [];
    assert(same(debt.map(item => [item.key, item.owner]), ACTION_DEBT),
        'Known action-debt inventory or ownership drifted');
    for (const item of debt) {
        assert(['OPEN', 'RESOLVED'].includes(item.status), `Invalid action-debt status: ${item.key}`);
        const owner = tickets.find(ticket => ticket.id === item.owner);
        assert(owner && (owner.status === 'PASS' ? item.status === 'RESOLVED' : true),
            `${item.key} remains open after its owner passed`);
    }

    const stateDebt = plan.known_state_debt || [];
    assert(stateDebt.length === 1
        && stateDebt[0].key === 'collaboration-document-provider:absent'
        && stateDebt[0].owner === 'CF-P7R-008'
        && stateDebt[0].required_disposition === 'RECORDED_DEFERRED'
        && typeof stateDebt[0].follow_up === 'string' && stateDebt[0].follow_up.length > 120,
    'Document-provider state debt is missing or vague');
    if (tickets[7].status === 'PASS') {
        assert(stateDebt[0].status === 'RECORDED_DEFERRED',
            'Ticket 8 passed without recording the provider deferral');
    }

    const workflow = plan.workflow || {};
    for (const rule of ['strict_ticket_order', 'one_ticket_in_progress',
        'verification_before_review', 'review_before_implementation_commit',
        'one_implementation_commit_per_ticket', 'push_immediately_after_implementation_commit',
        'implementation_pipeline_pass_before_closure', 'read_only_preview_smoke_before_closure',
        'owner_live_qualification_when_required', 'closure_evidence_commit_allowed',
        'closure_commit_must_be_metadata_only', 'closure_commit_pipeline_pass_before_next_ticket']) {
        assert(workflow[rule] === true, `Workflow rule drifted: ${rule}`);
    }
    assert(workflow.reviewer === 'AGY' && workflow.independent_review === false,
        'Sprint review provenance drifted');
    assert(plan.authorization?.agent_preview_mutation === false
        && plan.authorization.read_only_preview_smoke === true
        && plan.authorization.owner_live_qualification_requires_explicit_action === true
        && plan.authorization.production_mutation === false
        && plan.authorization.phase_8_entry_granted === false,
    'Planning granted remote or Phase 8 authority');
    assert(plan.privacy?.personal_vault_storage_untouched === true
        && plan.privacy.production_data_forbidden === true
        && plan.privacy.evidence_must_redact?.length >= 6,
    'Privacy boundary drifted');
    assert(plan.exit?.gate === 'P7R-G8'
        && plan.exit.requires_all_tickets_pass === true
        && plan.exit.requires_zero_enabled_unhandled_controls === true
        && plan.exit.requires_state_debt_recorded === true
        && plan.exit.grants_phase_8_entry === false,
    'Sprint exit boundary drifted');
    return true;
}
