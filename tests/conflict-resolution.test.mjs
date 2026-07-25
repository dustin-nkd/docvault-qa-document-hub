// CF-P6-007 — Conflict resolution and Copy to workspace.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CONFLICT_CONTRACT,
    COPY_INELIGIBLE_CATEGORIES,
    ConflictError,
    RESOLUTION_OPTIONS,
    RESOLUTION_STATUS,
    assessCopyEligibility,
    mergeConflict,
    openConflict,
    prepareWorkspaceCopy,
    resolveConflict,
    resolveCopyReplay
} from '../js/collaboration/conflict-resolution.js';

const DOC = '11111111-1111-4111-8111-111111111111';
const NEW_DOC = '22222222-2222-4222-8222-222222222222';
const WORKSPACE = '33333333-3333-4333-8333-333333333333';
const CONFLICT = '44444444-4444-4444-8444-444444444444';
const MUTATION = '55555555-5555-4555-8555-555555555555';

const draft = () => new Uint8Array([1, 2, 3, 4]);

const conflict = (overrides = {}) => openConflict({
    conflictId: CONFLICT,
    documentId: DOC,
    submittedBaseRevision: 4,
    currentRevision: 5,
    draft: draft(),
    now: 1_900_000_000_000,
    ...overrides
});

const codeOf = (fn) => {
    try { fn(); return null; } catch (error) {
        assert.ok(error instanceof ConflictError, `expected ConflictError, got ${error}`);
        return error.code;
    }
};

test('a conflict retains the encrypted draft the moment it opens', () => {
    const opened = conflict();
    assert.equal(opened.state, 'unresolved');
    assert.equal(opened.draftRetained, true);
    assert.ok(opened.draft instanceof Uint8Array);
    assert.equal(opened.submittedBaseRevision, 4);
    assert.equal(opened.currentRevision, 5);
});

test('a non-advancing revision pair is not a conflict', () => {
    assert.equal(codeOf(() => conflict({ currentRevision: 4 })), 'NOT_A_CONFLICT');
    assert.equal(codeOf(() => conflict({ currentRevision: 3 })), 'NOT_A_CONFLICT');
});

test('exactly the four contracted resolutions exist', () => {
    assert.deepEqual([...RESOLUTION_OPTIONS], [
        'review-latest', 'reapply-to-latest', 'save-as-separate-copy', 'discard-with-confirmation'
    ]);
    assert.equal(CONFLICT_CONTRACT.automaticMerge, false);
    assert.equal(codeOf(() => resolveConflict(conflict(), 'auto-merge')), 'UNKNOWN_RESOLUTION');
});

test('automatic merge is prohibited outright', () => {
    assert.equal(codeOf(() => mergeConflict()), 'AUTOMATIC_MERGE_PROHIBITED');
});

test('review-latest keeps the draft and leaves every other option open', () => {
    const reviewing = resolveConflict(conflict(), 'review-latest');
    assert.equal(reviewing.state, 'reviewing');
    assert.equal(reviewing.draftRetained, true);
    assert.equal(reviewing.intent, null);

    // Still resolvable afterwards.
    const reapplied = resolveConflict(reviewing, 'reapply-to-latest', { clientMutationId: MUTATION });
    assert.equal(reapplied.state, 'resolved');
});

test('reapply-to-latest rebases onto the revision the server actually holds', () => {
    const resolved = resolveConflict(conflict(), 'reapply-to-latest', { clientMutationId: MUTATION });
    assert.equal(resolved.state, 'resolved');
    assert.equal(resolved.draftRetained, true);
    assert.equal(resolved.intent.kind, 'reapply');
    assert.equal(resolved.intent.operation, 'update');
    // Not the stale base the user submitted.
    assert.equal(resolved.intent.baseRevision, 5);
    assert.equal(resolved.intent.expectedRevision, 6);
    assert.equal(resolved.intent.documentId, DOC);
});

test('save-as-separate-copy produces a new document at revision 1', () => {
    const resolved = resolveConflict(conflict(), 'save-as-separate-copy',
        { newDocumentId: NEW_DOC, clientMutationId: MUTATION });
    assert.equal(resolved.intent.kind, 'separate-copy');
    assert.equal(resolved.intent.documentId, NEW_DOC);
    assert.notEqual(resolved.intent.documentId, DOC);
    assert.equal(resolved.intent.operation, 'create');
    assert.equal(resolved.intent.baseRevision, 0);
    assert.equal(resolved.intent.expectedRevision, 1);
    assert.equal(resolved.draftRetained, true);
});

test('discard is the only losing path and it refuses without confirmation', () => {
    assert.equal(codeOf(() => resolveConflict(conflict(), 'discard-with-confirmation')),
        'CONFIRMATION_REQUIRED');
    assert.equal(codeOf(() => resolveConflict(conflict(), 'discard-with-confirmation', { confirmed: false })),
        'CONFIRMATION_REQUIRED');

    const discarded = resolveConflict(conflict(), 'discard-with-confirmation', { confirmed: true });
    assert.equal(discarded.state, 'discarded');
    assert.equal(discarded.draftRetained, false);
});

test('no resolution other than a confirmed discard drops the draft', () => {
    for (const option of RESOLUTION_OPTIONS.filter((value) => value !== 'discard-with-confirmation')) {
        const resolved = resolveConflict(conflict(), option,
            { newDocumentId: NEW_DOC, clientMutationId: MUTATION });
        assert.equal(resolved.draftRetained, true, `${option} lost the draft`);
    }
});

test('a resolved or discarded conflict cannot be resolved a second time', () => {
    const resolved = resolveConflict(conflict(), 'reapply-to-latest', { clientMutationId: MUTATION });
    assert.equal(codeOf(() => resolveConflict(resolved, 'discard-with-confirmation', { confirmed: true })),
        'CONFLICT_ALREADY_RESOLVED');

    const discarded = resolveConflict(conflict(), 'discard-with-confirmation', { confirmed: true });
    assert.equal(codeOf(() => resolveConflict(discarded, 'reapply-to-latest', { clientMutationId: MUTATION })),
        'CONFLICT_ALREADY_RESOLVED');
});

test('every status carries a text label and a shape, never colour alone', () => {
    for (const [state, status] of Object.entries(RESOLUTION_STATUS)) {
        assert.ok(status.label.length > 0, `${state} lacks a text label`);
        assert.ok(status.shape.length > 0, `${state} lacks a non-colour shape token`);
        // Tone exists for styling but must never be the only signal.
        assert.notEqual(status.label, status.tone);
    }
    assert.equal(CONFLICT_CONTRACT.statusConveyedByColourAlone, false);
});

// ------------------------------------------------------------ copy ---------

test('a stored Credential document is neither selectable nor copyable', () => {
    const assessment = assessCopyEligibility({ id: DOC, category: 'credential' });
    assert.equal(assessment.eligible, false);
    assert.equal(assessment.selectable, false);
    assert.equal(assessment.reason, 'CREDENTIAL_NOT_COPYABLE');
    assert.deepEqual([...COPY_INELIGIBLE_CATEGORIES], ['credential']);
});

test('other categories are eligible and selectable', () => {
    for (const category of ['testcase', 'bug', 'runbook', 'release', 'api']) {
        const assessment = assessCopyEligibility({ id: DOC, category });
        assert.equal(assessment.eligible, true, `${category} should be copyable`);
        assert.equal(assessment.selectable, true);
    }
    assert.equal(assessCopyEligibility({ id: DOC }).eligible, false);
});

test('a Credential is refused before any destination encryption happens', () => {
    const code = codeOf(() => prepareWorkspaceCopy({
        source: { id: DOC, category: 'credential' },
        destinationWorkspaceId: WORKSPACE,
        destinationRole: 'editor',
        keyReady: true,
        newDocumentId: NEW_DOC,
        clientMutationId: MUTATION,
        confirmedClassification: true
    }));
    // The category check fires first, so nothing reached an encrypt step.
    assert.equal(code, 'CREDENTIAL_NOT_COPYABLE');
});

test('a copy creates an unlinked destination at revision 1 and never mutates the source', () => {
    const intent = prepareWorkspaceCopy({
        source: { id: DOC, category: 'testcase' },
        destinationWorkspaceId: WORKSPACE,
        destinationRole: 'editor',
        keyReady: true,
        newDocumentId: NEW_DOC,
        clientMutationId: MUTATION,
        confirmedClassification: true
    });
    assert.equal(intent.sourceMutated, false);
    assert.equal(intent.linked, false);
    assert.equal(intent.sourceDocumentId, DOC);
    assert.equal(intent.destinationDocumentId, NEW_DOC);
    assert.notEqual(intent.destinationDocumentId, intent.sourceDocumentId);
    assert.equal(intent.operation, 'create');
    assert.equal(intent.baseRevision, 0);
    assert.equal(intent.expectedRevision, 1);
    assert.equal(intent.encryptForDestination, true);
});

test('a copy requires a permitted role, a key-ready destination, and an explicit confirmation', () => {
    const base = {
        source: { id: DOC, category: 'testcase' },
        destinationWorkspaceId: WORKSPACE,
        destinationRole: 'editor',
        keyReady: true,
        newDocumentId: NEW_DOC,
        clientMutationId: MUTATION,
        confirmedClassification: true
    };
    assert.equal(codeOf(() => prepareWorkspaceCopy({ ...base, destinationRole: 'viewer' })),
        'DESTINATION_ROLE_NOT_PERMITTED');
    assert.equal(codeOf(() => prepareWorkspaceCopy({ ...base, keyReady: false })),
        'DESTINATION_NOT_KEY_READY');
    assert.equal(codeOf(() => prepareWorkspaceCopy({ ...base, confirmedClassification: false })),
        'CLASSIFICATION_CONFIRMATION_REQUIRED');
    for (const role of ['owner', 'admin', 'editor']) {
        assert.ok(prepareWorkspaceCopy({ ...base, destinationRole: role }));
    }
});

test('repeating a completed copy returns the original result instead of duplicating it', () => {
    const completed = new Map([[MUTATION, { destinationDocumentId: NEW_DOC, revision: 1 }]]);
    const first = resolveCopyReplay(completed, { clientMutationId: MUTATION });
    assert.equal(first.replayed, true);
    assert.deepEqual(first.result, { destinationDocumentId: NEW_DOC, revision: 1 });

    const fresh = resolveCopyReplay(completed, { clientMutationId: CONFLICT });
    assert.equal(fresh.replayed, false);
    assert.equal(fresh.result, null);
});

test('copy status carries a label and shape, never colour alone', () => {
    const eligible = assessCopyEligibility({ id: DOC, category: 'testcase' }).status;
    const blocked = assessCopyEligibility({ id: DOC, category: 'credential' }).status;
    for (const status of [eligible, blocked]) {
        assert.ok(status.label.length > 0);
        assert.ok(status.shape.length > 0);
    }
    assert.notEqual(eligible.shape, blocked.shape);
});
