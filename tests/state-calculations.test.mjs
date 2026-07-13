import test from 'node:test';
import assert from 'node:assert/strict';
import { loadState, toPlain } from './harness.mjs';

function fixture() {
    const checkout = {
        id: 'tc-checkout',
        category: 'testcases',
        status: 'published',
        tcData: { module: 'Checkout', steps: [{ action: 'Open' }, { action: 'Pay' }] }
    };
    const auth = {
        id: 'tc-auth',
        category: 'testcases',
        status: 'published',
        tcData: { module: 'Auth', steps: [{ action: 'Sign in' }] }
    };
    const run = {
        id: 'run-1',
        category: 'testrun',
        status: 'published',
        runData: {
            targetIds: ['tc-checkout'],
            snapshot: { 'tc-checkout': [{}, {}] },
            results: { 'tc-checkout': { 0: 'pass', 1: 'fail' } }
        }
    };
    const majorBug = {
        id: 'bug-major',
        category: 'bug',
        status: 'published',
        bugStatus: 'open',
        bugData: { severity: 'Major', foundInTc: 'tc-checkout' }
    };
    const closedCritical = {
        id: 'bug-closed',
        category: 'bug',
        status: 'published',
        bugStatus: 'closed',
        bugData: { severity: 'Critical', foundInTc: 'tc-checkout' }
    };
    const release = {
        id: 'release-1',
        category: 'release',
        releaseData: {
            linkedRuns: ['run-1'],
            linkedBugs: ['bug-major', 'bug-closed'],
            linkedEnvs: [],
            readinessPolicy: { minPassRate: 50 }
        }
    };
    return { checkout, auth, run, majorBug, closedCritical, release };
}

test('release policy normalization clamps thresholds and preserves safe defaults', () => {
    const { api } = loadState();
    assert.deepEqual(toPlain(api.normalizeReleasePolicy({ minPassRate: 123.6, blockCritical: false, blockMajor: true })), {
        minPassRate: 100,
        blockCritical: false,
        blockMajor: true,
        requireCompleteExecution: true,
        requireHealthyEnvironments: false
    });
    assert.equal(api.normalizeReleasePolicy({ minPassRate: -8 }).minPassRate, 0);
    assert.equal(api.normalizeReleasePolicy({ minPassRate: 'invalid' }).minPassRate, 80);
});

test('release readiness distinguishes missing evidence, passing evidence, blockers, and manual risk acceptance', () => {
    const { api } = loadState();
    const empty = api.evaluateReleaseReadiness({ releaseData: {} }, []);
    assert.equal(empty.outcome, 'insufficient');
    assert.equal(empty.metrics.passRate, null);

    const data = fixture();
    const docs = [data.checkout, data.auth, data.run, data.majorBug, data.closedCritical];
    const passing = api.evaluateReleaseReadiness(
        { releaseData: { linkedRuns: ['run-1'], linkedBugs: [], readinessPolicy: { minPassRate: 50 } } },
        docs
    );
    assert.equal(passing.outcome, 'go');
    assert.deepEqual(toPlain(passing.metrics), {
        totalSteps: 2,
        executedSteps: 2,
        passSteps: 1,
        passRate: 50,
        openBugs: 0,
        critical: 0,
        major: 0
    });

    data.majorBug.bugData.severity = 'Critical';
    const blockedRelease = {
        releaseData: {
            linkedRuns: ['run-1'],
            linkedBugs: ['bug-major'],
            readinessPolicy: { minPassRate: 50 }
        }
    };
    assert.equal(api.evaluateReleaseReadiness(blockedRelease, docs).outcome, 'no-go');

    blockedRelease.releaseData.manualDecision = 'go-with-risk';
    blockedRelease.releaseData.decisionReason = 'Accepted for controlled rollout';
    assert.equal(api.evaluateReleaseReadiness(blockedRelease, docs).outcome, 'go-with-risk');
});

test('release quality score remains stable across pass, execution, coverage, and defect weights', () => {
    const { api } = loadState();
    const data = fixture();
    const quality = api.calculateReleaseQuality(
        data.release,
        [data.checkout, data.auth, data.run, data.majorBug, data.closedCritical]
    );

    assert.deepEqual(toPlain({
        score: quality.score,
        passRate: quality.passRate,
        execution: quality.execution,
        coverage: quality.coverage,
        defectPoints: quality.defectPoints,
        openBugs: quality.openBugs,
        targetedCases: quality.targetedCases,
        totalCases: quality.totalCases,
        unmappedBugs: quality.unmappedBugs,
        hasEvidence: quality.hasEvidence
    }), {
        score: 64,
        passRate: 50,
        execution: 100,
        coverage: 50,
        defectPoints: 14,
        openBugs: 1,
        targetedCases: 1,
        totalCases: 2,
        unmappedBugs: 0,
        hasEvidence: true
    });
    assert.deepEqual(toPlain(quality.modules.map((item) => ({
        name: item.name,
        score: item.score,
        hasEvidence: item.hasEvidence
    }))), [
        { name: 'Auth', score: 20, hasEvidence: false },
        { name: 'Checkout', score: 72, hasEvidence: true }
    ]);
});

test('stored release quality snapshot wins over live recalculation', () => {
    const { api } = loadState();
    const snapshot = { score: 88, modules: [], capturedAt: 1234 };
    const result = api.getReleaseQuality({ releaseData: { qualitySnapshot: snapshot } }, []);
    assert.equal(result.source, 'snapshot');
    assert.equal(result.score, 88);
    assert.equal(result.capturedAt, 1234);
});

test('focus workflow status and due state honor resolved, snoozed, and date boundaries', () => {
    const { api } = loadState();
    const now = new Date(2026, 6, 13, 12, 0, 0);
    assert.equal(api.getFocusWorkflowStatus({ resolvedAt: 1, snoozedUntil: '2026-07-20' }, now.getTime()), 'done');
    assert.equal(api.getFocusWorkflowStatus({ snoozedUntil: '2026-07-13' }, now.getTime()), 'snoozed');
    assert.equal(api.getFocusWorkflowStatus({ snoozedUntil: '2026-07-12' }, now.getTime()), 'active');
    assert.deepEqual(toPlain(api.getFocusDueState({ dueDate: '2026-07-12' }, now)), { state: 'overdue', date: '2026-07-12' });
    assert.deepEqual(toPlain(api.getFocusDueState({ dueDate: '2026-07-13' }, now)), { state: 'today', date: '2026-07-13' });
    assert.deepEqual(toPlain(api.getFocusDueState({ dueDate: '2026-07-14' }, now)), { state: 'upcoming', date: '2026-07-14' });
});

test('bug lifecycle backfill normalizes aliases and records estimated history', () => {
    const { api } = loadState();
    const bug = {
        id: 'bug-legacy',
        category: 'bug',
        bugStatus: 'confirmed',
        createdAt: 100,
        updatedAt: 200
    };
    const events = api.ensureBugStatusEvents(bug);
    assert.deepEqual(toPlain(events), [
        { type: 'status_changed', from: null, to: 'new', ts: 100, estimated: true },
        { type: 'status_changed', from: 'new', to: 'open', ts: 200, estimated: true }
    ]);
    assert.equal(api.recordBugStatusChange(bug, 'testing', 300), true);
    assert.equal(bug.bugStatus, 'retest');
    assert.equal(bug.updatedAt, 300);
    assert.equal(api.recordBugStatusChange(bug, 'retest', 400), false);
});
