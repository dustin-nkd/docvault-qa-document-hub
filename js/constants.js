// ========================
// GUEST DEMO MODE (?guest=1)
// ========================
// A completely isolated, no-auth demo path for showing the product to customers
// / in public groups without ever touching the real master password, the real
// encrypted vault, or the real GitHub token. See hydrate()/persist() in state.js
// and startApp() in events.js for the isolation boundary.
const GUEST_MODE = new URLSearchParams(location.search).get('guest') === '1';

// ========================
// API TRY-IT MOCK SERVER (demo/testing only)
// ========================
// A real fetch() to a made-up base URL would just fail on CORS or DNS, so the
// "Try it" feature (Sprint 20) would look broken for anyone testing it without
// a real backend of their own. This sentinel base URL is recognized by
// tryApiRequest() (js/actions-imports.js) and short-circuited into a fully local,
// in-browser mock response built from the doc's own saved apiData — no
// network call happens at all. Works in guest demo AND the real vault, so
// anyone can see "Try it" actually round-trip without standing up a server.
const API_TRYIT_MOCK_BASE = 'https://mock.docvault.dev';

// ========================
// STRINGS & t()
// ========================
const STRINGS = {
    runbook: "Runbook",
    onboarding: "Onboarding",
    testcases: "Test Cases",
    knowledge: "Knowledge",
    task: "Task",
    bug: "Bug Report",
    testplan: "Test Plan",
    api: "API Specs",
    meeting: "Meeting Notes",
    credential: "Credentials",
    viewAll: "View all",
    newest: "Newest",
    sortAZ: "Name A-Z",
    blankPage: "Blank Page",
    startFromScratch: "Start from scratch",
    template: "Template",
    justNow: "Just now",
    minsAgo: "{m} mins ago",
    hoursAgo: "{h} hours ago",
    daysAgo: "{d} days ago",
    noContent: "No content yet.",
    chooseTemplate: "Choose a template or start from scratch.",
    noFavorites: "No favorites yet.",
    enterTitle: "Enter title...",
    egCred: "e.g. Facebook, Database Prod",
    enterTag: "Enter tag, press Enter...",
    writeContent: "Write content in Markdown...",
    preview: "Preview",
    copyPassword: "Copy Password",
    copyUsername: "Copy Username",
    bugEnv: "Environment",
    bugEnvPl: "e.g. Staging, Production",
    bugDevice: "Browser / Device",
    bugDevicePl: "e.g. Chrome 120, iOS 17",
    bugSeverity: "Severity",
    bugPrecond: "Pre-conditions",
    bugPrecondPl: "e.g. User is logged in...",
    bugSteps: "Steps to Reproduce",
    bugStepsPl: "1. Open page...\n2. Click button...",
    bugExpected: "Expected Behavior",
    bugExpectedPl: "System should...",
    bugActual: "Actual Behavior",
    bugActualPl: "Error occurs...",
    tcModule: "Module / Feature",
    tcModulePl: "e.g. Login",
    tcPrecond: "Pre-conditions",
    tcPrecondPl: "e.g. User has an account",
    tcData: "Test Data",
    tcDataPl: "e.g. user: admin, pass: 123",
    tcSteps: "Test Steps",
    tcAction: "Action",
    tcActionPl: "Enter email...",
    tcExpected: "Expected Result",
    tcExpectedPl: "System displays...",
    apiMethod: "Method",
    apiEndpoint: "Endpoint / Path",
    apiHeaders: "Headers",
    apiParams: "Query Parameters",
    apiBody: "Request Body (JSON)",
    apiResponse: "Response (JSON)",
    apiKey: "Key",
    apiValue: "Value",
    apiRequired: "Required",
    dashboard: "Dashboard",
    categories: "Categories",
    documents: "Documents",
    favorites: "Favorites",
    newDoc: "New Document",
    editDoc: "Edit Document",
    save: "Save",
    cancel: "Cancel",
    back: "Back",
    edit: "Edit",
    duplicate: "Duplicate",
    delete: "Delete",
    trash: "Trash",
    restore: "Restore",
    deleteForever: "Delete Forever",
    delConfirm: "Are you sure you want to move this document to Trash?",
    delConfirmForever: "Are you sure you want to permanently delete this document? This action cannot be undone.",
    delTitle: "Delete Document",
    delTitleForever: "Delete Permanently",
    delConfirmBtn: "Delete",
    delConfirmBtnForever: "Delete Permanently",
    emptyTrash: "Empty Trash",
    emptyTrashTitle: "Empty Trash",
    emptyTrashConfirm: "Are you sure you want to empty the trash? All documents will be permanently deleted and cannot be recovered.",
    emptyTrashBtn: "Empty Trash",
    generatingLink: "Generating Secure Link...",
    pleaseWait: "Please wait while we encrypt your document.",
    linkReady: "Link Ready!",
    linkDesc: "Anyone with this link can view the document. It is encrypted with a unique key.",
    share: "Share Link",
    close: "Close",
    searchDocs: "Search documents...",
    searchTasks: "Search tasks...",
    noDocFound: "No documents found",
    noDocYet: "No documents yet",
    trashEmpty: "Trash is empty",
    tryDiffKey: "Try searching with a different keyword",
    createFirstDoc: "Start creating your first document",
    recentlyUpdated: "Recently Updated",
    allStatus: "All Statuses",
    titleRequired: "Title is required",
    docCreated: "Document created",
    docUpdated: "Document updated",
    docDuplicated: "Document duplicated",
    docDeleted: "Moved to Trash",
    docRestored: "Document restored",
    docDeletedForever: "Permanently deleted",
    trashEmptied: "Trash emptied",
    copied: "Copied to clipboard",
    testrun: "Test Runs",
    release: "Release",
    untested: "Untested",
    pass: "Pass",
    fail: "Fail",
    blocked: "Blocked",
    testRunProgress: "Progress",
    todo: "To Do",
    inProgress: "In Progress",
    review: "Review",
    done: "Done",
    dragTaskHere: "Drag tasks here",
    newTask: "New Task",
    dragBugHere: "Drag bugs here",
    newBug: "New Bug Report",
    bugNew: "New",
    bugOpen: "Open",
    bugInProgress: "In Progress",
    bugResolved: "Resolved",
    bugRetest: "Retest",
    bugVerified: "Verified",
    bugClosed: "Closed",
    bugWontFix: "Won't Fix",
    bugDuplicate: "Duplicate",
    bugRejected: "Rejected",
    bugDeferred: "Deferred",
    bugAssignee: "Assignee",
    bugAssigneePl: "Developer name...",
    bugReopen: "Reopen",
    allDocuments: "All Documents",
    status: "Status",
    tags: "Tags",
    category: "Category",
    usernameEmail: "Username / Email",
    passwordField: "Password",
    addStep: "Add Step",
    addHeader: "Add Header",
    addParam: "Add Param",
    addProperty: "Add Property",
    toggleSecret: "Toggle Secret",
    formatJson: "Format JSON",
    moreActions: "More actions",
    copy: "Copy",
    healthStatus: "Health Status",
    properties: "Properties",
    linkedCreds: "Linked Credentials",
    noCredFound: "No credentials found",
    notes: "Notes",
    envLabelPl: "e.g. Frontend URL",
    envValuePl: "e.g. https://app.com",
    envNotesPl: "Add any specific notes for this environment...",
    stepPl: "Step {idx}...",
    statusDraft: "Draft",
    statusPublished: "Published",
    statusArchived: "Archived",
    severityCritical: "Critical",
    severityMajor: "Major",
    severityMinor: "Minor",
    severityTrivial: "Trivial",
    triageTitle: "Defect triage", triageEditorSub: "Classify the defect and set who must make the decision before the SLA expires.",
    triageDecisionTarget: "Detection ? decision", triagePriority: "Priority", triageClassification: "Classification",
    triageUnclassified: "Unclassified", triageTypeFunctional: "Functional", triageTypeRegression: "Regression",
    triageTypePerformance: "Performance", triageTypeSecurity: "Security", triageTypeUsability: "Usability",
    triageTypeData: "Data integrity", triageTypeCompatibility: "Compatibility",
    triageSla: "Decision SLA", triageSlaHours: "{count} hours",
    triageReadyRule: "The decision is recorded when classification and owner are set. A duplicate can be decided directly from the bug view.",
    triageStatusPending: "Needs decision", triageStatusSoon: "SLA due soon", triageStatusBreached: "SLA breached",
    triageStatusDone: "Decision made", triageStatusMissed: "Decision made late", triageStatusDuplicate: "Duplicate",
    triageOwner: "Owner", triageDeadline: "SLA deadline", triageDecision: "Decision",
    triageNoOwner: "Unassigned", triageEdit: "Edit triage", triageMarkDuplicate: "Mark duplicate",
    triageDueIn: "{time} left", triageOverdueBy: "{time} overdue", triageDecidedAt: "Decided {time}",
    triageMetSla: "Within SLA", triageMissedSla: "Outside SLA", triageHoursShort: "{count}h", triageDaysShort: "{count}d",
    triageCardSub: "Move this defect from detection to an accountable decision.",
    triageDecisionFix: "Investigate / fix", triageDecisionDuplicate: "Linked to original",
    triageClassificationRequired: "Select a classification", triageOwnerRequired: "Assign an owner",
    scoreTitle: "Release quality scorecard", scoreSub: "A stable, explainable baseline across releases and modules.",
    scoreBaseline: "Baseline", scoreFirstRelease: "First measured release", scoreNoBaseline: "No previous release",
    scoreBandStrong: "Strong", scoreBandWatch: "Watch", scoreBandRisk: "At risk", scoreBandUnknown: "Insufficient evidence",
    scoreVsBaseline: "Overall change", scoreFrozen: "Frozen {time}", scoreLive: "Live from linked evidence",
    scoreDrivers: "Main drivers", scoreStable: "No material quality change", scoreNeedsBaseline: "Add another release to establish a trend.",
    scorePassRate: "Pass rate", scoreExecution: "Execution", scoreCoverage: "Coverage", scoreDefects: "Defect health",
    scoreWeight: "{value}% weight", scoreModules: "Quality by module", scoreModulesSub: "Weakest modules first",
    scoreOpenBugs: "Open bugs", scoreNoModules: "No module evidence is available for this release.",


    imgUploading: "Uploading image to GitHub...",
    imgUploadSuccess: "Image uploaded to GitHub successfully!",
    imgUploadFail: "GitHub upload failed. Falling back to inline image.",
    imgFallbackSize: "Fallback mode: Image should be under 800KB to fit in database.",
    imgFallbackProcessing: "Processing image inline (Base64 fallback)...",
    imgFallbackDone: "Image loaded inline. Connect GitHub for better sync performance!",
    imgReadFail: "Failed to read image file.",
    imgProcessFail: "Failed to process image. Please try again.",
    ghSaveSuccess: "GitHub Settings saved successfully!",
    ghCleared: "GitHub Settings cleared. Using Base64 fallback.",
    ghFillRequired: "Please fill in Owner, Repo and Token fields.",
    mpFillAll: "Please fill in all 3 fields.",
    mpMismatch: "New passwords do not match.",
    mpTooShort: "Password must be at least 8 characters.",
    mpChanged: "Master Password changed successfully!",
    mpChangeFail: "Failed to change password.",
    mpIncorrect: "Incorrect password.",
    vaultUnlocked: "Vault Unlocked",
    searchTypeHint: "Type to start searching...",
    searchNoResult: "No documents found.",
    matchTitle: "Title match",
    matchTag: "Tag match",
    matchContent: "Content match",
    invalidJson: "Invalid JSON format",
    copyFail: "Failed to copy",
    ghSyncOk: "Synced to GitHub",
    ghSyncFail: "GitHub sync failed",

    // Trends (B1)
    trTitle: "Trends", trSub: "over time",
    trAll: "All", trDays: "{n} days", trAllRange: "all",
    trPassTitle: "Pass rate by run", trBugTitle: "Bugs opened", trDocTitle: "Documents created (cumulative)",
    trPassEmpty: "Need ≥ 2 test runs<br>with results to trend",
    trBugEmpty: "No bugs in {range}", trDocEmpty: "Not enough docs in {range}",
    trPassCap: "{runs} runs · latest {pct} · {delta} vs start",
    trBugCap: "{n} bugs opened in {range}", trDocCap: "{n} documents created in {range}",
    trLifeTitle: "Bug lifecycle", trLifeSub: "Based on recorded status changes; legacy history may be estimated",
    trEstimate: "Legacy estimate", trVelocityTitle: "Opened vs resolved", trBacklogTitle: "Open bug backlog",
    trOpened: "Opened", trResolved: "Resolved", trLifeEmpty: "Not enough bug activity in {range}",
    trVelocityCap: "{opened} opened · {resolved} resolved in {range}",
    trBacklogCap: "Backlog now {n} · {delta} vs start",
    trDeltaUp: "▲ +{n}", trDeltaDown: "▼ {n}", trDeltaFlat: "— 0",

    // Traceability matrix (A)
    traceability: "Traceability",
    traceTitle: "Traceability matrix",
    traceSub: "Follow each test case from execution to defect, environment, and release.",
    traceAll: "All test cases", traceRisk: "At risk", traceMissing: "Missing coverage",
    traceCovered: "Covered", traceAtRisk: "At risk", traceMissingShort: "Missing",
    traceTestCase: "Test case", traceExecution: "Latest execution", traceBugs: "Linked bugs",
    traceEnvironment: "Environment / build", traceRelease: "Release",
    traceNoRun: "No test run", traceUntested: "Untested", traceNoBugs: "No linked bugs",
    traceNoRelease: "Not linked", traceEmpty: "No test cases match this filter.",
    impactTitle: "Coverage & Impact", impactSub: "Changed APIs mapped to the exact regression tests required after the change.",
    impactTracked: "Changed APIs", impactMissingTests: "Missing tests", impactRegressionDue: "Regression due",
    impactRisk: "At risk", impactCovered: "Covered", impactEmpty: "No API changes are currently being tracked.",
    impactModule: "Module", impactChanged: "Changed", impactTests: "Impacted tests",
    impactNoModule: "Module not mapped", impactNoTests: "No tests mapped to this module",
    impactMissingTestsAction: "Create test coverage for this module before release.",
    impactRegressionAction: "Run the listed tests in a regression run after this change.",
    impactRiskAction: "Fix or unblock the failed regression tests, then rerun them.",
    impactCoveredAction: "All mapped tests passed in regression after this change.",
    impactStatusMissing: "Missing tests", impactStatusDue: "Regression not run", impactStatusRisk: "Regression at risk", impactStatusCovered: "Regression covered",
    apiModule: "Affected module", apiModulePlaceholder: "e.g. Checkout",
    apiChangeImpact: "Change impact", apiImpactNone: "Not tracked", apiImpactLow: "Low", apiImpactMedium: "Medium", apiImpactHigh: "High",
    apiMarkChanged: "Record this save as a new contract change", apiImpactHint: "Only tracked changes appear in Coverage & Impact. Module names match test cases exactly, ignoring case.",

    // Focus / Today (C)
    focus: "Focus",
    focusTitle: "Today’s focus",
    focusSub: "A prioritized starting point for release risk, retest, active work, and stale reviews.",
    focusDoNow: "Do now", focusRetest: "Ready for retest",
    focusWork: "Active work", focusStale: "Review stale documents",
    focusRelease: "Release blockers",
    focusReleaseCount: "{n} release decisions at risk",
    focusClear: "Nothing needs attention right now.",
    focusCriticalCount: "{n} critical risk", focusRetestCount: "{n} waiting",
    focusWorkCount: "{n} in progress or review", focusStaleCount: "{n} stale",
    focusWorkflowSub: "Own, schedule, snooze, and close the QA work that needs attention.",
    focusActiveItems: "active items", focusQueueTabs: "Focus workflow states",
    focusTabActive: "Active", focusTabSnoozed: "Snoozed", focusTabDone: "Done",
    focusWorkflow: "Focus workflow", focusOwner: "Owner",
    focusOwnerPlaceholder: "e.g. QA Lead or team name", focusDueDate: "Due date",
    focusSnoozeUntil: "Snooze until",
    focusWorkflowHint: "Snoozed items leave Active until the selected day has passed.",
    focusSnoozeFuture: "Choose tomorrow or a later date to snooze this item.",
    focusWorkflowSaved: "Focus workflow saved.", focusMarkedDone: "Focus item marked done.",
    focusUnsnoozed: "Focus item returned to Active.", focusReopened: "Focus item reopened.",
    focusManualDecision: "manual decision", focusBlockerCount: "{n} blockers",
    focusOverdue: "Overdue · {date}", focusDueToday: "Due today", focusDueOn: "Due {date}",
    focusUnassigned: "Unassigned", focusSnoozedUntil: "Snoozed until {date}",
    focusDoneAt: "Done {date}", focusMarkDone: "Mark done", focusDone: "Done",
    focusUnsnooze: "Unsnooze", focusReopen: "Reopen", focusManage: "Manage",
    focusTabEmpty: "No items in this workflow state.",

    focusUpdated: "Updated {n}", focusOpen: "Open",

    // Dashboard command center
    dbEyebrow: 'Quality command center',
    dbIntro: 'Focus on release risk, execution health, and what needs action next.',
    dbActionRequired: 'Action required', dbAtRisk: 'At risk', dbOnTrack: 'On track',
    dbPassRate: 'Pass rate', dbOpenBugs: 'Open bugs', dbActiveWork: 'Active work', dbCoverage: 'Test coverage',
    dbAcrossRuns: 'Across {n} runs', dbNoRuns: 'No completed runs yet', dbCritical: '{n} critical',
    dbInProgressReview: 'In progress + review', dbCasesCovered: '{covered} of {total} cases covered',
    dbSnapshot: 'Release snapshot', dbSnapshotSub: 'One current-state card for each QA decision area.',
    dbDefectRisk: 'Defect risk', dbDeliveryFlow: 'Delivery flow', dbActiveBugs: 'Active',
    dbQualityHealth: 'Execution health', dbQualityHealthSub: 'Current delivery signals, without document-management noise.',
    dbBugSeverity: 'Bug severity', dbOpenClosed: '{open} open · {closed} closed', dbTestPassRate: 'Test pass rate',
    dbTaskBoard: 'Task board', dbTasksTotal: '{n} tasks total', dbCoverageModule: 'Coverage by module',
    dbAttention: 'Needs attention', dbAttentionSub: 'Prioritized items that can change quality today.',
    dbAllClear: 'No urgent items', dbAllClearSub: 'Critical SLA, retest queue, and stale reviews are clear.',
    dbCriticalOverdue: 'Critical bug over SLA', dbReadyRetest: 'Ready for retest', dbStaleDoc: 'Review stale document',
    dbAgeHours: 'Open for {n}h', dbAgeDays: 'Open for {n}d', dbStaleDays: 'Not updated for {n}d'
};

function t(key, params = {}) {
    let text = STRINGS[key] !== undefined ? STRINGS[key] : key;
    for (let k in params) text = text.replace('{' + k + '}', params[k]);
    return text;
}

// ========================
// CAT_META
// ========================
// labelPlural is explicit per category rather than derived by appending 's'
// to label — several labels (Test Cases, Credentials, Environments, Test
// Runs, API Specs) are already plural/uncountable, so blindly adding 's'
// produced things like "Credentialss" in the documents-list header.
const CAT_META = {
    runbook: { get label() { return t('runbook'); }, get labelPlural() { return t('runbook') + 's'; }, icon: 'fa-book', color: 'var(--c-run)', cls: 'cat-runbook' },
    testcases: { get label() { return t('testcases'); }, get labelPlural() { return t('testcases'); }, icon: 'fa-flask-vial', color: 'var(--c-tc)', cls: 'cat-testcases' },
    knowledge: { get label() { return t('knowledge'); }, get labelPlural() { return t('knowledge'); }, icon: 'fa-lightbulb', color: 'var(--c-kn)', cls: 'cat-knowledge' },
    task: { get label() { return t('task'); }, get labelPlural() { return t('task') + 's'; }, icon: 'fa-list-check', color: 'var(--c-task)', cls: 'cat-task' },
    bug: { get label() { return t('bug'); }, get labelPlural() { return t('bug') + 's'; }, icon: 'fa-bug', color: 'var(--c-bug)', cls: 'cat-bug' },
    testplan: { get label() { return t('testplan'); }, get labelPlural() { return t('testplan') + 's'; }, icon: 'fa-clipboard-list', color: 'var(--c-tp)', cls: 'cat-testplan' },
    api: { label: 'API Specs', labelPlural: 'API Specs', icon: 'fa-server', color: 'var(--c-api)', cls: 'cat-api' },
    credential: { label: 'Credentials', labelPlural: 'Credentials', icon: 'fa-key', color: 'var(--c-cred)', cls: 'cat-credential' },
    environment: { label: 'Environments', labelPlural: 'Environments', icon: 'fa-network-wired', color: 'var(--c-env)', cls: 'cat-environment' },
    testrun: { get label() { return t('testrun'); }, get labelPlural() { return t('testrun'); }, icon: 'fa-play-circle', color: 'var(--c-testrun)', cls: 'cat-testrun' },
    release: { get label() { return t('release'); }, get labelPlural() { return t('release') + 's'; }, icon: 'fa-rocket', color: 'var(--c-rel)', cls: 'cat-release' }
};

// Safe accessor for category metadata (US-405). Documents with an unknown or
// legacy category (e.g. from an import) would otherwise crash rendering when
// code reads CAT_META[cat].color/.icon/.cls/.label directly.
function getCatMeta(category) {
    return CAT_META[category] || { label: category || 'Unknown', labelPlural: (category || 'Unknown') + 's', icon: 'fa-file', color: '#7a8ba8', cls: 'cat-unknown' };
}

// ========================
// TEMPLATES
// ========================
const TEMPLATES = {
    runbook: `# [Title]

## Purpose
Describe what this runbook accomplishes and when to use it.

## Prerequisites
- Required access or environment
- Required data or tools

## Steps

### Step 1: [Step name]
1. Perform the action
2. Verify the result

### Step 2: [Step name]
1. Perform the action
2. Verify the result

## Expected Results
Describe the successful outcome.

## Troubleshooting
| Issue | Cause | Resolution |
|---|---|---|
| Example issue | Example cause | Example resolution |

## References
- [Reference document](#)`,
    onboarding: `# [Title]

## Welcome
Provide an overview for new team members.

## Week 1: Setup and Orientation
- [ ] Install the development toolchain
- [ ] Request access to required systems
- [ ] Review engineering and QA standards
- [ ] Configure testing tools

## Week 2: Learning and Practice
- [ ] Study architecture documents
- [ ] Pair with a team member
- [ ] Execute sample test cases
- [ ] Join team ceremonies

## Week 3: Hands-on
- [ ] Write new test cases
- [ ] Execute a test suite
- [ ] Report defects using the team standard
- [ ] Review progress with a mentor`,
    testcases: `# [Title]

## Module Information
- **Module**: [Module name]
- **Version**: x.x.x
- **Last Updated**: YYYY-MM-DD

## Test Environment
- OS, browser, and device
- Test data requirements

### TC-001: [Test case name]
- **Priority**: High / Medium / Low
- **Type**: Functional / Regression / Smoke
- **Pre-condition**: Describe the required starting state

**Steps:**
1. Step one
2. Step two
3. Step three

**Expected Result:** Describe the expected result.

**Actual Result:** Complete during execution.

**Status:** Pass / Fail / Blocked / Not Run`,
    knowledge: `# [Title]

## Context
Describe the context and why this knowledge matters.

## Problem
Describe the observed problem.

## Solution
1. Resolution step
2. Implementation detail
3. Required configuration

## Key Learnings
- Learning one
- Learning two

## References
- [Reference document](#)`,
    task: `# [Task Title]

## Description
Describe the work and its desired outcome.

## Sub-tasks
- [ ] Work item one
- [ ] Work item two
- [ ] Work item three

## Notes
Add implementation notes and decisions here.`,
    bug: `# [Bug Title]

## Pre-conditions
Describe the required starting state.

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
Describe the expected behavior.

## Actual Behavior
Describe the observed behavior.

## Logs / Payload / Data
\`\`\`json
{
  "example": "data"
}
\`\`\``,
    testplan: `# [Release / Feature] Test Plan

## Scope
Describe what is in and out of scope.

## Test Strategy
Describe the manual, automated, performance, and security approach.

## Environments
List the required test environments.

## Devices and Browsers
- Chrome / Edge / Safari
- iOS / Android

## Timeline
Document milestones and sign-off dates.`,
    meeting: `# [Meeting Topic]

## Date: YYYY-MM-DD
## Attendees
-
-

## Discussion Points
- Topic one
- Topic two

## Action Items
- [ ] Action one (@owner)
- [ ] Action two (@owner)`,
    credential: `# [System / Tool Name]

## Environment Info
- **URL / Portal**:
- **Type**: Staging / Production / Internal

## Accounts
Store account metadata in the protected credential fields above. Never place real secrets in document content.`,
    api: `# [API Operation]

## Endpoint
\`GET /api/v1/resource\`

## Headers
- Authorization: Bearer {token}
- Content-Type: application/json

## Request Payload
\`\`\`json
{
  "key": "value"
}
\`\`\`

## Response
\`\`\`json
{
  "status": "success"
}
\`\`\``,
    environment: `# [Environment Name]

## Purpose
Describe how this environment is used.

## Access
Document safe access instructions. Store secrets only in linked credentials.

## Operational Notes
- Reset schedule
- Deployment cadence
- Known limitations`,
    release: `# [Release Version]

## Highlights
- Highlight one
- Highlight two

## Risks
Describe open risks and accepted exceptions.

## Rollback
Describe the rollback trigger and owner.`,
    testrun: ``
};

// ========================// ========================
// SAMPLE DOCS
// ========================
const SAMPLE_DOCS = [
    {
        id: 'doc_001', title: 'Regression Test Execution Runbook', category: 'runbook',
        tags: ['regression', 'sprint', 'automation'], status: 'published', favorite: true,
        content: `# Regression Test Execution Runbook

## Purpose
Provide a repeatable regression workflow for every sprint.

## Prerequisites
- The target build is deployed to Staging
- Test data is prepared
- The automation suite is current

## Steps
1. Verify the build, database migration, and third-party services.
2. Run \`npm run test:regression -- --env=staging\`.
3. Execute manual checks for authentication, checkout, and administration.
4. Publish the report and escalate new Critical or Major defects.

## Expected Results
All required checks complete with no unaccepted release blocker.`,
        createdAt: Date.now() - 86400000 * 15, updatedAt: Date.now() - 86400000 * 2
    },
    {
        id: 'doc_002', title: 'CI/CD Pipeline Troubleshooting Guide', category: 'runbook',
        tags: ['ci-cd', 'troubleshooting'], status: 'published', favorite: false,
        content: `# CI/CD Pipeline Troubleshooting Guide

## Build Failure
1. Review the build log.
2. Confirm the branch has no unresolved conflicts.
3. Verify locked dependency versions.

## Test Failure
1. Download test artifacts.
2. Identify the first failing test.
3. Validate test data and environment health.

## Deploy Failure
Inspect deployment logs, verify health checks, and roll back when the release criteria require it.`,
        createdAt: Date.now() - 86400000 * 30, updatedAt: Date.now() - 86400000 * 5
    },
    {
        id: 'doc_003', title: 'QA Team Onboarding Guide', category: 'onboarding',
        tags: ['onboarding', 'team'], status: 'published', favorite: true,
        content: `# QA Team Onboarding Guide

## Week 1
Install the toolchain, request access, clone the automation repository, and run the smoke suite.

## Week 2
Review architecture and testing strategy, then pair with a senior QA engineer.

## Week 3
Write test cases, execute a feature suite, report defects, and present the results.`,
        createdAt: Date.now() - 86400000 * 60, updatedAt: Date.now() - 86400000 * 10
    },
    {
        id: 'doc_004', title: 'Testing Tools Setup Manual', category: 'onboarding',
        tags: ['tools', 'setup'], status: 'draft', favorite: false,
        content: `# Testing Tools Setup Manual

Install the supported Node.js and JDK versions, configure Playwright, import the shared API collection, and verify the local test command before requesting review.`,
        createdAt: Date.now() - 86400000 * 20, updatedAt: Date.now() - 86400000 * 8
    },
    {
        id: 'doc_005', title: 'Login Module Test Cases', category: 'testcases',
        tags: ['login', 'auth', 'smoke'], status: 'published', favorite: false,
        content: `# Login Module Test Cases

### Valid credentials
Enter an active account and verify the dashboard and avatar appear.

### Invalid password
Enter an incorrect password three times and verify the CAPTCHA challenge appears.

### Empty fields
Submit an empty form and verify both required-field messages.`,
        createdAt: Date.now() - 86400000 * 45, updatedAt: Date.now() - 86400000 * 3
    },
    {
        id: 'doc_006', title: 'Payment Gateway Integration Tests', category: 'testcases',
        tags: ['payment', 'integration'], status: 'draft', favorite: true,
        content: `# Payment Gateway Integration Tests

Validate successful card payment, declined-card handling, timeout recovery, idempotency, and receipt delivery using sandbox data only.`,
        createdAt: Date.now() - 86400000 * 12, updatedAt: Date.now() - 86400000
    },
    {
        id: 'doc_007', title: 'API Testing Best Practices', category: 'knowledge',
        tags: ['api', 'best-practices'], status: 'published', favorite: false,
        content: `# API Testing Best Practices

Keep tests independent, use environment variables, validate status, headers, schema and body, cover negative cases, and assert rate-limit behavior.`,
        createdAt: Date.now() - 86400000 * 90, updatedAt: Date.now() - 86400000 * 7
    },
    {
        id: 'doc_008', title: 'Performance Testing Metrics', category: 'knowledge',
        tags: ['performance', 'metrics'], status: 'published', favorite: false,
        content: `# Performance Testing Metrics

Track response-time percentiles, throughput, error rate, saturation, database pool usage, and the first breached threshold for baseline, load, and stress scenarios.`,
        createdAt: Date.now() - 86400000 * 50, updatedAt: Date.now() - 86400000 * 15
    },
    {
        id: 'doc_009', title: 'Bug Report Template and Standards', category: 'knowledge',
        tags: ['bug-report', 'standards'], status: 'published', favorite: true,
        content: `# Bug Report Standard

Include environment, browser, device, reproducible steps, expected and actual behavior, severity evidence, logs, screenshots, and the affected build.`,
        createdAt: Date.now() - 86400000 * 70, updatedAt: Date.now() - 86400000 * 20
    },
    {
        id: 'doc_010', title: 'Database Migration Verification', category: 'runbook',
        tags: ['database', 'migration'], status: 'draft', favorite: false,
        content: `# Database Migration Verification

Back up the database, review forward and rollback scripts, validate row counts and constraints after migration, then run smoke tests for affected modules.`,
        createdAt: Date.now() - 86400000 * 5, updatedAt: Date.now() - 86400000
    }
];

// ========================// ========================
// GUEST DEMO DATA — fully isolated sample set covering all 11 categories,
// cross-linked (bug found in a failed test-run step, environment linked to
// credentials, test plan linked to test cases + runs, release linked to
// runs/bugs/envs) so a visitor has something real to click through.
// Never mixed with SAMPLE_DOCS / the real vault — see hydrate() in state.js.
// ========================
const GUEST_DEMO_DOCS = (() => {
    const now = Date.now();
    const days = n => now - 86400000 * n;
    const statusEvent = (from, to, ts) => ({ type: 'status_changed', from, to, ts });

    // Mirrors the Markdown table saveDoc() generates for testcases, so the
    // document reads correctly when opened directly (the viewer has no
    // dedicated testcases block — it renders doc.content as Markdown).
    const tcContent = (title, tcData) => `# ${title}\n\n${tcData.module ? `**Module:** ${tcData.module}` : ''}\n\n${tcData.precond ? `## Pre-conditions\n${tcData.precond}\n` : ''}${tcData.data ? `## Test Data\n${tcData.data}\n` : ''}\n## Test Steps\n| Step | Action | Expected Result |\n|---|---|---|\n${tcData.steps.map((s, i) => `| ${i + 1} | ${s.action} | ${s.expected} |`).join('\n')}\n`;

    const tcLoginData = { module: 'Authentication', precond: 'An active user account exists', data: 'user: demo@shop.test / pass: Demo@1234',
        steps: [
            { action: 'Open /login, enter a valid email and password, then click "Sign In"', expected: 'Login succeeds and redirects to /dashboard' },
            { action: 'Sign out and enter an incorrect password three times', expected: 'Show "Invalid credentials" and display CAPTCHA after the third attempt' }
        ] };
    const tcLogin = {
        id: 'gd_tc_login', title: 'Login — Valid & Invalid Credentials', category: 'testcases',
        subfolder: 'Auth', tags: ['login', 'smoke'], status: 'published', favorite: true,
        tcData: tcLoginData, content: tcContent('Login — Valid & Invalid Credentials', tcLoginData),
        createdAt: days(20), updatedAt: days(2)
    };
    const tcCheckoutData = { module: 'Checkout', precond: 'The cart contains at least one product', data: 'card: 4242 4242 4242 4242',
        steps: [
            { action: 'Add a product to the cart and open Checkout', expected: 'Display the correct subtotal, shipping fee, and tax' },
            { action: 'Enter valid card details and click "Pay Now"', expected: 'Payment succeeds and order status is Confirmed' },
            { action: 'Attempt payment with the declined test card (4000 0000 0000 0002)', expected: 'Show "Payment declined", keep the order Pending, and allow retry' }
        ] };
    const tcCheckout = {
        id: 'gd_tc_checkout', title: 'Checkout — Credit Card Payment', category: 'testcases',
        subfolder: 'Checkout', tags: ['payment', 'critical'], status: 'published', favorite: true,
        tcData: tcCheckoutData, content: tcContent('Checkout — Credit Card Payment', tcCheckoutData),
        createdAt: days(18), updatedAt: days(1)
    };
    const tcSearchData = { module: 'Catalog', precond: 'The catalog contains at least 50 products', data: '',
        steps: [
            { action: 'Enter "t-shirt" in the search field', expected: 'Return relevant results in under one second' },
            { action: 'Apply Price: 100-300 and Size: M filters', expected: 'Filter the list using both selected conditions' }
        ] };
    const tcSearch = {
        id: 'gd_tc_search', title: 'Product Search & Filter', category: 'testcases',
        subfolder: '', tags: ['search'], status: 'draft', favorite: false,
        tcData: tcSearchData, content: tcContent('Product Search & Filter', tcSearchData),
        createdAt: days(9), updatedAt: days(3)
    };

    const runSprint = {
        id: 'gd_run_sprint24', title: 'Sprint 24 — Regression Run', category: 'testrun',
        tags: ['regression', 'sprint-24'], status: 'published', favorite: true,
        runData: {
            targetIds: [tcLogin.id, tcCheckout.id, tcSearch.id],
            environment: 'Staging · build #482',
            snapshot: {
                [tcLogin.id]: tcLogin.tcData.steps,
                [tcCheckout.id]: tcCheckout.tcData.steps,
                [tcSearch.id]: tcSearch.tcData.steps
            },
            results: {
                [tcLogin.id]: { 0: 'pass', 1: 'pass', note: 'CAPTCHA appears correctly after three failed attempts.' },
                [tcCheckout.id]: { 0: 'pass', 1: 'fail', 2: 'blocked', note: 'The declined-payment case returns HTTP 500 instead of a clear message.' },
                [tcSearch.id]: { 0: 'pass', 1: 'untested' }
            }
        },
        content: '', createdAt: days(4), updatedAt: days(1)
    };

    // Mirrors the Markdown saveDoc() generates for bugs, for the same reason as
    // tcContent above — the viewer falls back to doc.content for the bug body
    // (the dedicated bug block only renders the severity/priority/ref meta strip).
    const bugContent = (title, b) => `# ${title}\n\n## Environment\n- **Environment:** ${b.env || '-'}\n- **Device/Browser:** ${b.browser || '-'}\n- **Severity:** ${b.severity}\n\n${b.precond ? `## Pre-conditions\n${b.precond}\n\n` : ''}## Steps to Reproduce\n${b.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n## Expected Behavior\n${b.expected || '-'}\n\n## Actual Behavior\n${b.actual || '-'}`;

    const bug1Data = { env: 'Staging', browser: 'Chrome 120', severity: 'Critical', priority: 'P1', assignee: 'Minh T.',
        classification: 'unclassified', slaHours: 4, triagedAt: null,
        precond: 'The cart contains at least two products', steps: ['Add two products to the cart', 'Open the Checkout page', 'Press F5 to refresh the page'],
        expected: 'The cart retains all products', actual: 'The cart becomes empty and must be rebuilt',
        resolution: '', duplicateOf: '', reopenCount: 0 };
    const bug1 = {
        id: 'gd_bug_1', bugNumber: 1, title: 'Cart loses products after refreshing Checkout', category: 'bug',
        tags: ['checkout', 'cart'], status: 'published', favorite: true, bugStatus: 'open',
        bugStatusEvents: [statusEvent(null, 'new', days(6)), statusEvent('new', 'open', days(5))],
        bugData: bug1Data, content: bugContent('Cart loses products after refreshing Checkout', bug1Data),
        createdAt: days(6), updatedAt: days(1)
    };
    const bug2Data = { env: 'Staging · build #482', browser: 'Chrome 120', severity: 'Major', priority: 'P2', assignee: 'Lan N.',
        classification: 'functional', slaHours: 24, triagedAt: now - 22 * 3600000,
        precond: 'The user is at the payment step', steps: ['Add a product to the cart and open Checkout', 'Enter valid card details and click "Pay Now"', 'Attempt payment with the declined test card (4000 0000 0000 0002)'],
        expected: 'Show "Payment declined", keep the order Pending, and allow retry',
        actual: 'The server returns HTTP 500 without a user message and leaves the order in Processing',
        resolution: '', duplicateOf: '', reopenCount: 0,
        foundInRun: runSprint.id, foundInTc: tcCheckout.id, foundInStep: 1 };
    const bug2 = {
        id: 'gd_bug_2', bugNumber: 2, title: 'Checkout — Declined payment returns HTTP 500', category: 'bug',
        tags: ['payment', 'checkout'], status: 'published', favorite: false, bugStatus: 'in-progress',
        bugStatusEvents: [statusEvent(null, 'new', days(1)), statusEvent('new', 'in-progress', days(1))],
        bugData: bug2Data,
        content: bugContent('Checkout — Declined payment returns HTTP 500', bug2Data) + '\n\n> Reported from test run **Sprint 24 — Regression Run** — Checkout — Credit Card Payment, step 2.',
        createdAt: days(1), updatedAt: days(1)
    };
    const bug3Data = { env: 'Staging', browser: 'Safari 17', severity: 'Minor', priority: 'P3', assignee: 'Minh T.',
        classification: 'performance', slaHours: 72, triagedAt: days(24),
        precond: '', steps: ['Open the Catalog page', 'Type five or six characters quickly in the search field'],
        expected: 'Call the API once after typing stops for 300 ms', actual: 'Call the API after every character',
        resolution: 'fixed', duplicateOf: '', reopenCount: 0 };
    const bug3 = {
        id: 'gd_bug_3', bugNumber: 3, title: 'Search field sends requests without debounce', category: 'bug',
        tags: ['search', 'performance'], status: 'archived', favorite: false, bugStatus: 'closed',
        bugStatusEvents: [statusEvent(null, 'new', days(25)), statusEvent('new', 'resolved', days(10)), statusEvent('resolved', 'verified', days(9)), statusEvent('verified', 'closed', days(8))],
        bugData: bug3Data, content: bugContent('Search field sends requests without debounce', bug3Data),
        createdAt: days(25), updatedAt: days(8)
    };

    const testplan1 = {
        id: 'gd_testplan_1', title: 'Release v2.4.0 Test Plan', category: 'testplan',
        tags: ['release', 'v2.4.0'], status: 'published', favorite: true,
        tcPlanData: { linkedTCs: [tcLogin.id, tcCheckout.id, tcSearch.id], linkedRuns: [runSprint.id] },
        content: '## Scope\nRun full regression for Authentication, Checkout, and Catalog before v2.4.0.\n\n## Strategy\nUse the automated smoke suite plus manual exploratory testing for high-risk Checkout paths.\n\n## Timeline\n- Code freeze: T-3\n- Full regression: T-2\n- Sign-off: T-1',
        createdAt: days(7), updatedAt: days(1)
    };

    const apiUsers = {
        id: 'gd_api_users', title: 'GET /api/v1/users/{id}', category: 'api',
        subfolder: 'Users Service', tags: ['users', 'get'], status: 'published', favorite: false,
        apiData: { method: 'GET', endpoint: '/api/v1/users/{id}', module: 'Authentication', changeImpact: 'medium', changedAt: days(3),
            headers: [{ key: 'Authorization', value: 'Bearer {{token}}', req: true }, { key: 'Accept', value: 'application/json', req: false }],
            params: [{ key: 'include', value: 'profile,orders', req: false }],
            body: '', statusCode: '200',
            response: `{\n  "id": "usr_8821",\n  "email": "demo@shop.test",\n  "name": "Demo User",\n  "createdAt": "2024-01-15T09:00:00Z"\n}` },
        content: '', createdAt: days(40), updatedAt: days(10)
    };
    const apiOrders = {
        id: 'gd_api_orders', title: 'POST /api/v1/orders', category: 'api',
        subfolder: 'Orders Service', tags: ['orders', 'post'], status: 'draft', favorite: true,
        apiData: { method: 'POST', endpoint: '/api/v1/orders', module: 'Checkout', changeImpact: 'high', changedAt: now - 43200000,
            headers: [{ key: 'Authorization', value: 'Bearer {{token}}', req: true }, { key: 'Content-Type', value: 'application/json', req: true }],
            params: [],
            body: `{\n  "items": [{ "sku": "TSHIRT-M-BLK", "qty": 2 }],\n  "paymentMethod": "credit_card"\n}`,
            statusCode: '201',
            response: `{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}` },
        content: '', createdAt: days(35), updatedAt: days(6)
    };

    const credAdmin = {
        id: 'gd_cred_admin', title: 'staging-admin.shop.test', category: 'credential',
        tags: ['staging', 'admin'], status: 'published', favorite: true,
        username: 'qa.admin@shop.test', password: 'Demo-Only-Not-Real-Pw1!',
        content: '', createdAt: days(50), updatedAt: days(20)
    };
    const credPayment = {
        id: 'gd_cred_payment', title: 'sandbox.paymentgateway.test', category: 'credential',
        tags: ['payment', 'sandbox'], status: 'published', favorite: false,
        username: 'sandbox_merchant_882', password: 'Sandbox-Demo-Key-0000',
        content: '', createdAt: days(45), updatedAt: days(15)
    };

    const envStaging = {
        id: 'gd_env_staging', title: 'Staging', category: 'environment',
        tags: ['staging'], status: 'published', favorite: true,
        envData: { status: 'healthy',
            properties: [
                { label: 'Frontend URL', value: 'https://staging.shop.test', secret: false },
                { label: 'Backend API URL', value: 'https://api-staging.shop.test', secret: false },
                { label: 'Database Connection', value: 'postgres://staging-db.internal:5432/shop', secret: true }
            ],
            linkedCreds: [credAdmin.id], notes: 'Reset data every night at 02:00. Use this environment for the daily regression suite.' },
        content: '', createdAt: days(60), updatedAt: days(3)
    };
    const envProd = {
        id: 'gd_env_prod', title: 'Production', category: 'environment',
        tags: ['production'], status: 'published', favorite: false,
        envData: { status: 'degraded',
            properties: [
                { label: 'Frontend URL', value: 'https://shop.test', secret: false },
                { label: 'Backend API URL', value: 'https://api.shop.test', secret: false }
            ],
            linkedCreds: [credPayment.id], notes: 'Monitor the elevated payment-service error rate after the latest deployment.' },
        content: '', createdAt: days(90), updatedAt: days(1)
    };

    const release1 = {
        id: 'gd_release_1', title: 'v2.4.0 — Checkout Reliability', category: 'release',
        tags: ['release'], status: 'published', favorite: true,
        releaseData: { version: 'v2.4.0', releaseDate: new Date(now + 86400000 * 3).toISOString().slice(0, 10), status: 'in-progress',
            linkedRuns: [runSprint.id], linkedBugs: [bug1.id, bug2.id, bug3.id], linkedEnvs: [envStaging.id, envProd.id] },
        content: '## Highlights\n- Improve Checkout flow reliability\n- Add debounce to Search\n\n## Risk\nOne Critical cart-refresh defect remains open and blocks the release until resolved.',
        createdAt: days(3), updatedAt: days(1)
    };

    const tasks = [
        { id: 'gd_task_1', title: 'Write test cases for the Checkout retry flow', category: 'task', kanbanStatus: 'todo',
            tags: ['checkout'], status: 'draft', favorite: false, content: '', createdAt: days(2), updatedAt: days(2) },
        { id: 'gd_task_2', title: 'Investigate BUG-002 declined-payment HTTP 500', category: 'task', kanbanStatus: 'in-progress',
            tags: ['bug', 'payment'], status: 'draft', favorite: true, content: '', createdAt: days(1), updatedAt: days(1) },
        { id: 'gd_task_3', title: 'Review the v2.4.0 Test Plan with the QA Lead', category: 'task', kanbanStatus: 'review',
            tags: ['release'], status: 'draft', favorite: false, content: '', createdAt: days(3), updatedAt: days(1) },
        { id: 'gd_task_4', title: 'Add automation for Search debounce regression', category: 'task', kanbanStatus: 'done',
            tags: ['automation'], status: 'draft', favorite: false, content: '', createdAt: days(10), updatedAt: days(4) }
    ];

    const runbook1 = {
        id: 'gd_rb_1', title: 'Daily Regression Kickoff Runbook', category: 'runbook',
        tags: ['regression', 'daily'], status: 'published', favorite: false,
        content: '# Daily Regression Kickoff\n\n1. Verify Staging has the latest build\n2. Run the automated smoke suite\n3. If smoke passes, trigger the full regression run\n4. Record results in the corresponding Test Run\n5. Report new Critical or Major defects in #qa-daily',
        createdAt: days(30), updatedAt: days(5)
    };
    const knowledge1 = {
        id: 'gd_kn_1', title: 'When to mark a test step Blocked or Failed', category: 'knowledge',
        tags: ['best-practices'], status: 'published', favorite: false,
        content: '# Block vs Fail\n\n**Fail**: the step runs but the result differs from the expectation; always link a defect.\n\n**Blocked**: the step cannot run because a prerequisite is unavailable. Link the existing blocker instead of creating a duplicate defect.',
        createdAt: days(14), updatedAt: days(6)
    };

    // Extra test runs across prior sprints so the QA Trends pass-rate line has a
    // real trajectory on the demo (improving, then a dip from the Checkout 500).
    const runResults = (l, c, s) => ({
        targetIds: [tcLogin.id, tcCheckout.id, tcSearch.id],
        environment: 'Staging',
        snapshot: { [tcLogin.id]: tcLogin.tcData.steps, [tcCheckout.id]: tcCheckout.tcData.steps, [tcSearch.id]: tcSearch.tcData.steps },
        results: { [tcLogin.id]: l, [tcCheckout.id]: c, [tcSearch.id]: s }
    });
    const runS21 = { id: 'gd_run_sprint21', title: 'Sprint 21 — Smoke Run', category: 'testrun', tags: ['smoke', 'sprint-21'], status: 'archived', favorite: false,
        runData: runResults({ 0: 'pass', 1: 'fail' }, { 0: 'pass', 1: 'fail', 2: 'fail' }, { 0: 'fail', 1: 'untested' }), content: '', createdAt: days(30), updatedAt: days(29) };
    const runS22 = { id: 'gd_run_sprint22', title: 'Sprint 22 — Regression Run', category: 'testrun', tags: ['regression', 'sprint-22'], status: 'archived', favorite: false,
        runData: runResults({ 0: 'pass', 1: 'pass' }, { 0: 'pass', 1: 'fail', 2: 'blocked' }, { 0: 'fail', 1: 'untested' }), content: '', createdAt: days(18), updatedAt: days(17) };
    const runS23 = { id: 'gd_run_sprint23', title: 'Sprint 23 — Regression Run', category: 'testrun', tags: ['regression', 'sprint-23'], status: 'published', favorite: false,
        runData: runResults({ 0: 'pass', 1: 'pass' }, { 0: 'pass', 1: 'pass', 2: 'fail' }, { 0: 'pass', 1: 'pass' }), content: '', createdAt: days(11), updatedAt: days(10) };

    // Extra resolved bugs from earlier sprints — enrich the "bugs opened" trend
    // without inflating the current open-bug count (both already closed).
    const bug4Data = { env: 'Staging', browser: 'Firefox 121', severity: 'Major', priority: 'P2', assignee: 'Lan N.', precond: '', steps: ['Open the product page', 'Set quantity above available inventory'], expected: 'Block the action and show "exceeds inventory"', actual: 'Allow the order and fail later during payment', resolution: 'fixed', duplicateOf: '', reopenCount: 0 };
    const bug4 = { id: 'gd_bug_4', bugNumber: 4, title: 'Order quantity above inventory is not blocked', category: 'bug', tags: ['catalog'], status: 'archived', favorite: false, bugStatus: 'closed',
        bugStatusEvents: [statusEvent(null, 'new', days(22)), statusEvent('new', 'resolved', days(14)), statusEvent('resolved', 'closed', days(12))],
        bugData: bug4Data, content: bugContent('Order quantity above inventory is not blocked', bug4Data), createdAt: days(22), updatedAt: days(12) };
    const bug5Data = { env: 'Staging', browser: 'Chrome 119', severity: 'Minor', priority: 'P3', assignee: 'Minh T.', precond: '', steps: ['Open Login on a mobile viewport', 'Rotate the device to landscape'], expected: 'The layout remains usable', actual: 'The "Sign In" button moves outside the viewport', resolution: 'fixed', duplicateOf: '', reopenCount: 0 };
    const bug5 = { id: 'gd_bug_5', bugNumber: 5, title: 'Login layout breaks in mobile landscape', category: 'bug', tags: ['login', 'mobile'], status: 'archived', favorite: false, bugStatus: 'closed',
        bugStatusEvents: [statusEvent(null, 'new', days(15)), statusEvent('new', 'resolved', days(11)), statusEvent('resolved', 'closed', days(9))],
        bugData: bug5Data, content: bugContent('Login layout breaks in mobile landscape', bug5Data), createdAt: days(15), updatedAt: days(9) };

    // A retest-pending bug — dev has deployed a fix and QA needs to verify it.
    // Exercises the Focus page's "Ready for retest" group, which no bug in the
    // sample data reached otherwise.
    const bug6Data = { env: 'Staging · build #483', browser: 'Chrome 121', severity: 'Major', priority: 'P2', assignee: 'Lan N.',
        classification: 'functional', slaHours: 24, triagedAt: days(5) + 2 * 3600000,
        precond: 'The fix is deployed to Staging build #483', steps: ['Open the Catalog page', 'Apply Price and Size filters together', 'Check the returned results'],
        expected: 'Results match both filter conditions', actual: 'The fix is deployed and waiting for QA verification on Staging',
        resolution: '', duplicateOf: '', reopenCount: 0 };
    const bug6 = { id: 'gd_bug_6', bugNumber: 6, title: 'Combined Price and Size filters return incorrect results', category: 'bug', tags: ['search', 'catalog'], status: 'published', favorite: false, bugStatus: 'retest',
        bugStatusEvents: [statusEvent(null, 'new', days(5)), statusEvent('new', 'open', days(5)), statusEvent('open', 'in-progress', days(3)), statusEvent('in-progress', 'retest', days(1))],
        bugData: bug6Data, content: bugContent('Combined Price and Size filters return incorrect results', bug6Data), createdAt: days(5), updatedAt: days(1) };

    // A reference doc nobody has needed to touch in a while — exercises the
    // Focus page's "Stale reviews" group (>30 days since last update), which
    // no document in the sample data reached otherwise.
    const knowledge2 = {
        id: 'gd_kn_2', title: 'Pre-release Regression Checklist', category: 'knowledge',
        tags: ['checklist', 'release'], status: 'published', favorite: false,
        content: '# Checklist Regression\n\n- [ ] Smoke suite passes on Staging\n- [ ] No Critical defects remain open\n- [ ] Core module coverage is at least 80%\n- [ ] The Test Plan is reviewed with the QA Lead\n\n> Review this checklist quarterly and update it whenever the release process changes.',
        createdAt: days(95), updatedAt: days(38)
    };

    const release0 = {
        id: 'gd_release_0', title: 'v2.3.0 - Search Stability', category: 'release',
        tags: ['release', 'baseline'], status: 'archived', favorite: false,
        releaseData: {
            version: 'v2.3.0', releaseDate: new Date(now - 8 * 86400000).toISOString().slice(0, 10), status: 'released',
            linkedRuns: [runS23.id], linkedBugs: [bug3.id, bug4.id], linkedEnvs: [envStaging.id],
            qualitySnapshot: {
                score: 94, passRate: 86, execution: 100, coverage: 100, defectPoints: 20, openBugs: 0,
                hasEvidence: true, targetedCases: 3, totalCases: 3, unmappedBugs: 0, capturedAt: days(8),
                modules: [
                    { name: 'Checkout', score: 85, passRate: 67, execution: 100, coverage: 100, defectPoints: 20, openBugs: 0, hasEvidence: true },
                    { name: 'Authentication', score: 100, passRate: 100, execution: 100, coverage: 100, defectPoints: 20, openBugs: 0, hasEvidence: true },
                    { name: 'Catalog', score: 100, passRate: 100, execution: 100, coverage: 100, defectPoints: 20, openBugs: 0, hasEvidence: true }
                ]
            }
        },
        content: '## Baseline\nStable regression baseline before the Checkout reliability work.', createdAt: days(12), updatedAt: days(8)
    };

    return [
        runbook1, knowledge1, knowledge2,
        tcLogin, tcCheckout, tcSearch,
        ...tasks,
        bug1, bug2, bug3, bug4, bug5, bug6,
        testplan1,
        apiUsers, apiOrders,
        credAdmin, credPayment,
        envStaging, envProd,
        runS21, runS22, runS23, runSprint,
        release0, release1
    ];
})();
