# Workspace Activity Isolation & Dashboard Test Pass Rate Plan

**Design:** [DESIGN.md](DESIGN.md)
**Context key:** `workspace-activity-and-dashboard-metrics`
**Base:** `refs/plans/workspace-activity-and-dashboard-metrics/base` (`b3eb9e400b3c151a65b1ef362f9ddba871fa0773`)
**Commit:** `fix(dashboard,activity): isolate activity history per-workspace and calculate dashboard test pass rate by test cases`

## Outcome & Scope
1. **Workspace Activity Isolation:**
   - Tag all activity records with `workspaceId` in `js/collab-store.js` and `js/state.js`.
   - Filter `ActivityLog.getAll()` in `js/collab-activity.js` to strictly return activities of the active workspace.
   - Restrict `clearActivityLog()` in `js/collab-activity.js` to only delete activities of the active workspace.
2. **Dashboard Test Pass Rate Calculation Redesign:**
   - In `js/render-core.js`, compute test pass rate and breakdown metrics based on **Test Cases** (`_runCaseOutcome` semantics), including untested test cases in the total denominator.
   - Display Pass, Fail, Blocked, and Untested segments and legend counts.
3. **Verification & Quality Gate:**
   - Add unit tests in `tests/collab-activity.test.mjs` verifying multi-workspace activity isolation and scoped clearing.
   - Add unit tests in `tests/dashboard-performance.test.mjs` verifying case-level pass rate calculation and untested case inclusion.
   - Maintain all line budgets in `scripts/quality-check.mjs` and hardcoded limits in test files (`collab-activity.js <= 300`, `collab-store.js <= 400`, `render-core.js <= 1820`).
   - Run `npm test` and `node scripts/quality-check.mjs`.
   - Review and verify via Refract multi-model engine (`gemini-grok`).

## Baseline Evidence
- `node tests/run.mjs`: 329 pass, 0 fail, 0 skipped at plan base `b3eb9e400b3c151a65b1ef362f9ddba871fa0773`.
- `node scripts/quality-check.mjs`: Clean pass.

---

### Phase 1: Workspace Activity Isolation
**Files:**
- `js/collab-store.js`
- `js/collab-activity.js`
- `js/state.js`

**Acceptance Criteria:**
- `recordActivity` in `js/collab-store.js` writes `workspaceId` in Firestore document payload.
- `ActivityLog.getAll()` in `js/collab-activity.js` filters `_store.remoteActivities` so only entries matching active workspace are returned (treating missing as `'default'`).
- `clearActivityLog()` only deletes Firestore documents belonging to the active workspace.
- `ActivityLog.record` in `js/state.js` records `workspaceId`.
- `js/collab-store.js` line count <= 400 lines.
- `js/collab-activity.js` line count <= 300 lines.

---

### Phase 2: Dashboard Test Pass Rate Redesign
**Files:**
- `js/render-core.js`
- `scripts/quality-check.mjs`

**Acceptance Criteria:**
- `_getDashboardMetrics` in `js/render-core.js` evaluates outcomes per test case (`pass`, `fail`, `blocked`, `untested`) rather than summing individual step results.
- `rUntested` is returned in metrics and included in `resultParts` and `rTotal`.
- `passRate` reflects `rPass / rTotal * 100` based on test cases.
- `maintainabilityBudgets` for `js/render-core.js` adjusted to 1820 with clear explanation.
- `js/render-core.js` does NOT contain `actorEmail`.

---

### Phase 3: Unit Tests, Verification & Refract Review
**Files:**
- `tests/collab-activity.test.mjs`
- `tests/dashboard-performance.test.mjs`

**Acceptance Criteria:**
- Unit test in `tests/collab-activity.test.mjs` confirms workspace A activity is not visible in workspace B, and clearing activity in workspace B leaves workspace A intact.
- Unit test in `tests/dashboard-performance.test.mjs` verifies that a test run with 10 test cases where 1 step in 1 case is passed does not report 100% pass rate, but reports 1 pass and 9 untested.
- `npm test` passes 100% (329+ tests).
- `node scripts/quality-check.mjs` passes 100%.
- Refract review job submitted and approved.
