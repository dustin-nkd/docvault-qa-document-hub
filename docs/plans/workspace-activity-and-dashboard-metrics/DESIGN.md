# Design: Workspace Activity History Isolation & Dashboard Test Pass Rate Metrics

## 1. Context & Motivation

User reported two issues in DocVault QA Document Hub:
1. **Dashboard "Test Pass Rate" Widget Metric Discrepancy:**
   - The user observed that the test pass rate widget on the dashboard displayed confusing and inaccurate numbers, with no clarity on how the percentages and breakdown values were calculated.
   - *Root Cause Analysis:*
     In `js/render-core.js:396-411` (`_getDashboardMetrics`), the widget iterated through `Object.values(run.runData.results)` across all historical runs and counted every single individual *step* result (`k !== 'note'`).
     This led to severe flaws:
     a) It counted raw step clicks instead of Test Cases.
     b) Untested cases and untested steps were completely excluded from the denominator (`rTotal = rPass + rFail + rBlocked`), meaning that if 1 step was marked "pass" out of a 10-test-case run with 50 steps, it displayed **100% Pass Rate** (`rPass=1, rTotal=1`)!
     c) If a test case had 4 passing steps and 1 failing step, the old code added 4 to Pass and 1 to Fail (displaying 80% pass rate for that test case), whereas in QA methodology and elsewhere in DocVault (`js/render-viewer-categories.js:142` `_runCaseOutcome`), a test case with any failing step is a **FAILED** test case.
     d) The legend only showed Pass, Fail, and Blocked, omitting Untested and giving no indication of test cases vs steps.

2. **Cross-Workspace Activity History Leakage:**
   - The user observed that the Activity History timeline displayed the exact same data across different workspaces, failing to isolate activities to their respective workspace.
   - *Root Cause Analysis:*
     a) In Collab Mode (`js/collab-store.js:336`), `recordActivity` omitted `workspaceId` when publishing documents to the Firestore `activity` collection.
     b) In `js/collab-activity.js:149-165` & `190-195`, `ActivityLog.getAll()` returned all entries from `_store.remoteActivities` without filtering by the active workspace (`activeWs`).
     c) In `js/collab-activity.js:236-265`, `clearActivityLog()` deleted all documents across the entire Firestore `activity` collection rather than deleting only activities in the active workspace.
     d) In local mode (`js/state.js:530-538`), entries created via `ActivityLog.record` lacked an explicit `workspaceId` property.

---

## 2. Goals & Non-Goals

### Goals
1. **Accurate & Transparent Test Pass Rate Metrics:**
   - In `js/render-core.js:396-411`, calculate metrics based on **Test Cases** across active test runs in the active workspace.
   - Evaluate test case outcomes using QA standard logic (`pass`, `fail`, `blocked`, `untested`):
     - Pass: all steps executed and all passed.
     - Fail: any step failed.
     - Blocked: any step blocked (and none failed).
     - Untested: any step remaining unexecuted (and none failed or blocked), or no results yet recorded.
   - In `_renderInsightCards(m)`, calculate pass rate as `rPass / rTotal * 100` where `rTotal = rPass + rFail + rBlocked + rUntested`.
   - Update the legend and segment visualization to include Untested alongside Pass, Fail, and Blocked, and clarify the subtitle with test run and test case counts.
2. **Workspace-Isolated Activity History:**
   - In `js/collab-store.js:336`, include `workspaceId: doc?.workspaceId || entry?.workspaceId || getActiveWs()` in the Firestore activity payload.
   - In `js/collab-activity.js`, filter `targetLog.getAll()` to only return activity items matching `(a.workspaceId || 'default') === activeWs`.
   - In `js/collab-activity.js`, scope `clearActivityLog()` so the owner only deletes activity records belonging to the active workspace.
   - In `js/state.js:530-538`, ensure `ActivityLog.record` attaches `workspaceId: doc.workspaceId || currentWs || 'default'`.
3. **Maintainability & Quality Standards:**
   - Maintain all line maintainability budgets in `scripts/quality-check.mjs`:
     - Update budget for `js/render-core.js` to 1820 lines (with documented rationale).
     - Keep `js/collab-store.js <= 400` lines (per `tests/collab-activity.test.mjs:815`).
     - Keep `js/collab-activity.js <= 300` lines (per `tests/collab-activity.test.mjs:809`).
   - Add comprehensive automated unit tests covering both features in `tests/collab-activity.test.mjs` and `tests/dashboard-performance.test.mjs`.
   - Full pass on `npm test` (all 329+ tests) and `node scripts/quality-check.mjs`.
   - Conduct Refract multi-model review with `gemini-grok` and land approved changes.

### Non-Goals
- Changing the underlying Firestore collection schema or creating separate Firestore subcollections for activities.
- Altering the behavior of guest demo fixtures or demo activity logs.

---

## 3. Technical Design

### 3.1 Workspace Activity Isolation
1. **Recording (`js/collab-store.js`):**
   ```javascript
   const wsId = doc?.workspaceId || entry?.workspaceId || getActiveWs();
   const payload = {
       id: actId,
       ts: typeof entry.ts === 'number' ? entry.ts : Date.now(),
       action: entry.type || 'updated',
       type: entry.type || 'updated',
       docId: doc?.id || entry.docId || '',
       title: doc?.title || entry.title || '',
       category: doc?.category || entry.category || '',
       workspaceId: wsId,
       actorUid: user.uid,
       actorName,
       actorEmail,
       ...(typeof entry.note === 'string' ? { note: entry.note } : {}),
       ...(rawPhoto ? { actorPhotoUrl: rawPhoto } : {})
   };
   ```
2. **Retrieval (`js/collab-activity.js`):**
   ```javascript
   function getActiveWsId() {
       try {
           const id = root.localStorage?.getItem('docvault_active_workspace');
           if (id && /^[a-z0-9][a-z0-9-]{0,31}$/.test(id)) return id;
       } catch (_) {}
       return (typeof root.getActiveWorkspace === 'function' ? root.getActiveWorkspace()?.id : null) || 'default';
   }

   targetLog.getAll = function() {
       if (isCollabMode()) {
           const activeWs = getActiveWsId();
           return _store.remoteActivities.filter(a => (a.workspaceId || 'default') === activeWs);
       }
       return origGetAll ? origGetAll.call(this) : [];
   };
   ```
   *Backward Compatibility Note:* Existing Firestore activity records created before this change lack `workspaceId`. Treating `a.workspaceId || 'default'` ensures all legacy records remain accessible in the `'default'` workspace without being orphaned or lost.

3. **Clearing (`js/collab-activity.js`):**
   In `clearActivityLog()`, query or filter documents where `((d.data()?.workspaceId) || 'default') === activeWs`, deleting only those documents in batches.

4. **Local Mode (`js/state.js`):**
   In `ActivityLog.record`, assign `workspaceId: doc.workspaceId || (typeof localStorage !== 'undefined' && localStorage.getItem('docvault_active_workspace')) || 'default'`.

---

### 3.2 Dashboard Test Pass Rate Redesign
1. **Metrics Calculation (`js/render-core.js:396-411`):**
   For each test run `run` in `docs.filter(d => d.category === 'testrun')`:
   - Determine target test case IDs: `const targetIds = Array.isArray(run.runData?.targetIds) && run.runData.targetIds.length > 0 ? run.runData.targetIds : Object.keys(run.runData?.results || {});`
   - For each `tcId` in `targetIds`:
     - Look up snapshot steps: `const steps = run.runData?.snapshot?.[tcId] || (docMap.get(tcId)?.tcData?.steps || docMap.get(tcId)?.apiTcData?.steps || []);`
     - Evaluate outcome:
       - If `steps.length > 0`:
         `const values = steps.map((_, i) => run.runData?.results?.[tcId]?.[i] || 'untested');`
         `if (values.includes('fail')) rFail++; else if (values.includes('blocked')) rBlocked++; else if (values.every(v => v === 'pass')) rPass++; else rUntested++;`
       - Else (no explicit steps):
         Inspect entries in `run.runData?.results?.[tcId]` excluding `note`:
         `const res = Object.entries(run.runData?.results?.[tcId] || {}).filter(([k]) => k !== 'note').map(([, v]) => v);`
         `if (res.includes('fail')) rFail++; else if (res.includes('blocked')) rBlocked++; else if (res.length > 0 && res.every(v => v === 'pass')) rPass++; else rUntested++;`
     - Increment `rTotal++`.
2. **Dashboard Insight Card Rendering (`js/render-core.js:460-507`):**
   - `passRate = m.rTotal > 0 ? Math.round(m.rPass / m.rTotal * 100) : null;`
   - Include `rUntested` in `resultParts`:
     ```javascript
     const resultParts = [
         { label: t('pass'), count: m.rPass, color: '#34d399' },
         { label: t('fail'), count: m.rFail, color: '#f87171' },
         { label: t('blocked'), count: m.rBlocked, color: '#fb923c' },
         { label: t('untested'), count: m.rUntested, color: 'var(--tx-d)' }
     ];
     ```
   - Segment bar reflects true proportions of pass, fail, blocked, and untested test cases.
   - Legend displays counts for each status.
