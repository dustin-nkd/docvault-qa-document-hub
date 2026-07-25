const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const RESOLUTION_OPTIONS = Object.freeze(['review-latest', 'reapply-to-latest',
    'save-as-separate-copy', 'discard-with-confirmation']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Conflict({ manifest, moduleSource, nodeTestSource, workersTestSource,
    browserTestSource, contractFreeze, packageJson, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-007' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G3' && manifest.next_gate === 'P6-G3A'
        && manifest.authorizes_on_approval === 'CF-P6-008', 'Unsupported Phase 6 conflict manifest');

    const conflict = manifest.conflict || {};
    assert(sameSet(conflict.options || [], RESOLUTION_OPTIONS), 'Resolution option inventory drifted');
    assert(sameSet(contractFreeze.conflict_resolution_options || [], RESOLUTION_OPTIONS),
        'Implementation and CF-P6-001 freeze disagree on resolution options');

    // Automatic merge must be impossible, not merely absent.
    assert(conflict.automatic_merge === false && conflict.merge_function_throws === true
        && contractFreeze.automatic_merge === false, 'Automatic merge prohibition drifted');
    assert(/AUTOMATIC_MERGE_PROHIBITED/.test(moduleSource), 'The merge prohibition was removed');

    // Exactly one path may drop a draft, and it must ask first.
    assert(sameSet(conflict.options_that_drop_the_draft || [], ['discard-with-confirmation'])
        && conflict.draft_retained_on_open === true
        && conflict.discard_requires_confirmation === true, 'Draft-retention contract drifted');
    assert(/CONFIRMATION_REQUIRED/.test(moduleSource), 'Discard confirmation was removed');
    assert(/no resolution other than a confirmed discard drops the draft/.test(nodeTestSource),
        'The draft-retention sweep test disappeared');

    assert(conflict.review_is_not_resolution === true
        && conflict.double_resolution_rejected === true
        && conflict.reapply_rebases_to_current_revision === true
        && conflict.separate_copy_revision === 1, 'Conflict behaviour contract drifted');
    assert(/CONFLICT_ALREADY_RESOLVED/.test(moduleSource), 'Double-resolution guard removed');

    // Status must never be colour alone.
    const accessibility = manifest.accessibility || {};
    assert(accessibility.status_conveyed_by_colour_alone === false
        && accessibility.every_state_has_text_label === true
        && accessibility.every_state_has_shape_token === true
        && accessibility.verified_in_browsers === true, 'Accessibility contract drifted');
    assert(/shape:/.test(moduleSource) && /label:/.test(moduleSource),
        'Status descriptors lost their label or shape token');

    const copy = manifest.copy || {};
    assert(copy.mode === 'manual-one-time-unlinked'
        && copy.credential_selectable === false
        && copy.credential_rejected_before_encryption === true
        && copy.enforcement === 'client-side-only'
        && copy.residual_risk_restated === true
        && copy.source_mutated === false && copy.linked === false
        && copy.destination_revision === 1
        && sameSet(copy.requires_destination_role || [], ['owner', 'admin', 'editor'])
        && copy.requires_key_ready_destination === true
        && copy.requires_classification_confirmation === true
        && copy.idempotent_replay === true, 'Copy contract drifted');
    assert(contractFreeze.copy_eligibility?.enforcement === 'client-side-only',
        'Implementation and CF-P6-001 freeze disagree on copy enforcement');
    assert(/CREDENTIAL_NOT_COPYABLE/.test(moduleSource), 'Credential rejection removed');
    // The category check must run before anything that encrypts for the destination.
    const prepare = moduleSource.slice(moduleSource.indexOf('export function prepareWorkspaceCopy'));
    assert(prepare.indexOf('assessCopyEligibility') < prepare.indexOf('DESTINATION_ROLE_NOT_PERMITTED'),
        'The Credential check no longer runs first');

    // Revision outcomes must be proven against the database, not asserted.
    const outcomes = manifest.revision_outcomes_verified_against_d1 || [];
    assert(outcomes.length >= 5 && outcomes.every(entry =>
        typeof entry.path === 'string' && typeof entry.outcome === 'string' && entry.outcome.length > 20),
    'Revision-outcome evidence drifted');
    assert(/executeDocumentMutation/.test(workersTestSource)
        && /COLLAB_DB/.test(workersTestSource), 'Revision outcomes are no longer proven against real D1');
    for (const marker of ['reapply-to-latest', 'save-as-separate-copy', 'discard-with-confirmation']) {
        assert(workersTestSource.includes(marker), `Workers coverage missing: ${marker}`);
    }

    const browser = manifest.browser_evidence || {};
    assert(sameSet(manifest.browser_matrix || [], ['chromium', 'firefox', 'webkit'])
        && browser.all_options_reachable === true
        && browser.only_confirmed_discard_drops_draft === true
        && browser.credential_not_selectable === true
        && browser.credential_refused_before_encryption === true
        && browser.status_labels_and_shapes_present === true
        && browser.console_errors === 0 && browser.registered_in_e2e === true,
    'Browser evidence drifted');
    assert(/CREDENTIAL_NOT_COPYABLE/.test(browserTestSource)
        && /CONFIRMATION_REQUIRED/.test(browserTestSource), 'Browser negative coverage drifted');
    assert(/test:conflict:e2e/.test(packageJson.scripts?.['test:e2e'] ?? ''),
        'The browser conflict test is not wired into the e2e gate');

    assert(manifest.tests?.skips === 0 && manifest.tests.result === 'PASS'
        && manifest.tests.browser_engines === 3, 'Test inventory drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-007'), `${id} is not PASS evidence for CF-P6-007`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-E2E-002', 'CF-EV-P6-QA-003', 'CF-EV-P6-SEC-007', 'CF-EV-P6-UX-001']),
    'Conflict evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_registered === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.personal_vault_diff_lines === 0
        && boundary.collaboration_activation === 'NO-GO',
    'Phase 6 conflict authorization boundary drifted');
    return true;
}
