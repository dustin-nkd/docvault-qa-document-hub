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
    ghSyncFail: "GitHub sync failed"
};

function t(key, params = {}) {
    let text = STRINGS[key] || key;
    for (let k in params) text = text.replace('{' + k + '}', params[k]);
    return text;
}

// ========================
// CAT_META
// ========================
const CAT_META = {
    runbook: { get label() { return t('runbook'); }, icon: 'fa-book', color: 'var(--c-run)', cls: 'cat-runbook' },
    testcases: { get label() { return t('testcases'); }, icon: 'fa-flask-vial', color: 'var(--c-tc)', cls: 'cat-testcases' },
    knowledge: { get label() { return t('knowledge'); }, icon: 'fa-lightbulb', color: 'var(--c-kn)', cls: 'cat-knowledge' },
    task: { get label() { return t('task'); }, icon: 'fa-list-check', color: 'var(--c-task)', cls: 'cat-task' },
    bug: { get label() { return t('bug'); }, icon: 'fa-bug', color: 'var(--c-bug)', cls: 'cat-bug' },
    testplan: { get label() { return t('testplan'); }, icon: 'fa-clipboard-list', color: 'var(--c-tp)', cls: 'cat-testplan' },
    api: { label: 'API Specs', icon: 'fa-server', color: 'var(--c-api)', cls: 'cat-api' },
    credential: { label: 'Credentials', icon: 'fa-key', color: 'var(--c-cred)', cls: 'cat-credential' },
    environment: { label: 'Environments', icon: 'fa-network-wired', color: 'var(--c-env)', cls: 'cat-environment' },
    testrun: { get label() { return t('testrun'); }, icon: 'fa-play-circle', color: 'var(--c-testrun)', cls: 'cat-testrun' },
    release: { get label() { return t('release'); }, icon: 'fa-rocket', color: 'var(--c-rel)', cls: 'cat-release' }
};

// ========================
// TEMPLATES
// ========================
const TEMPLATES = {
    runbook: `# [Title]

## Purpose
Mô tả mục đích của runbook này.

## Prerequisites
- Điều kiện tiên quyết 1
- Điều kiện tiên quyết 2

## Steps

### Bước 1: [Tên bước]
1. Hành động cụ thể
2. Kiểm tra kết quả

### Bước 2: [Tên bước]
1. Hành động cụ thể
2. Kiểm tra kết quả

## Expected Results
Mô tả kết quả mong đợi.

## Troubleshooting
| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|-----------|
| Lỗi X  | Y           | Z         |

## References
- [Link tài liệu tham khảo](#)`,
    onboarding: `# [Title]

## Welcome
Giới thiệu tổng quan cho thành viên mới.

## Week 1: Setup & Orientation
- [ ] Cài đặt môi trường development
- [ ] Access các hệ thống cần thiết
- [ ] Review coding standards
- [ ] Setup testing tools

## Week 2: Learning & Practice
- [ ] Study architecture documents
- [ ] Pair testing với team member
- [ ] Thực hiện test cases mẫu
- [ ] Join daily standup

## Week 3: Hands-on
- [ ] Tự viết test cases
- [ ] Execute test suite
- [ ] Report bugs theo standard
- [ ] Review session với mentor

## Key Contacts
| Role | Name | Contact |
|------|------|---------|
| QA Lead | - | - |

## Resources
- Wiki nội bộ
- Training materials`,
    testcases: `# [Title]

## Module Information
- **Module**: Tên module
- **Version**: x.x.x
- **Last Updated**: YYYY-MM-DD

## Test Environment
- OS, Browser, Device info
- Test data requirements

## Test Cases

### TC-001: [Tên test case]
- **Priority**: High / Medium / Low
- **Type**: Functional / Regression / Smoke
- **Pre-condition**: Mô tả điều kiện trước test

**Steps:**
1. Bước 1
2. Bước 2
3. Bước 3

**Expected Result:** Mô tả kết quả mong đợi

**Actual Result:** (Điền khi execute)

**Status:** Pass / Fail / Blocked / Not Run

---

### TC-002: [Tên test case]
- **Priority**: Medium
- **Type**: Functional
- **Pre-condition**: ...

**Steps:**
1. ...
2. ...

**Expected Result:** ...

## Notes
Ghi chú thêm nếu có.`,
    knowledge: `# [Title]

## Context
Mô tả bối cảnh / vấn đề cần lưu trữ kiến thức.

## Problem
Mô tả chi tiết vấn đề đã gặp phải.

## Solution
Giải pháp đã áp dụng:

1. Bước giải quyết
2. Chi tiết implement
3. Cấu hình cần thiết

\`\`\`
// Code example nếu cần
\`\`\`

## Key Learnings
- Điểm học được 1
- Điểm học được 2

## Best Practices
- Practice 1
- Practice 2

## References
- [Tài liệu tham khảo](#)
- Related documents`,
    task: `# [Task Title]

## Description
Mô tả chi tiết công việc cần làm.

## Sub-tasks
- [ ] Việc 1
- [ ] Việc 2
- [ ] Việc 3

## Notes
Ghi chú thêm trong quá trình làm việc.`,
    bug: `# [Bug Title]

## Pre-conditions
Điều kiện trước khi test.

## Steps to Reproduce
1. Bước 1
2. Bước 2
3. Bước 3

## Expected Behavior
Mô tả kết quả mong đợi.

## Actual Behavior
Mô tả kết quả thực tế (lỗi).

## Logs / Payload / Data
\`\`\`json
{
  "example": "data"
}
\`\`\``,
    testplan: `# [Release / Feature] Test Plan

## Scope
Phạm vi test trong release/feature này.

## Test Strategy
Chiến lược test (Manual, Automation, Performance...).

## Environments
Môi trường cần test.

## Devices & Browsers
- Chrome/Edge
- iOS/Android

## Timeline
Thời gian dự kiến.`,
    meeting: `# [Meeting Topic]

## Date: YYYY-MM-DD
## Attendees:
-
-

## Discussion Points
- Vấn đề 1
- Vấn đề 2

## Action Items
- [ ] Action 1 (@nguoi_thuc_hien)
- [ ] Action 2 (@nguoi_thuc_hien)`,

    credential: `# [System / Tool Name]

## Environment Info
- **URL / Portal**:
- **Type**: Staging / Production / Internal

## Accounts
**Account 1 (Admin)**
- Username: \`admin\`
- Password: \`password123\`

**Account 2 (Test User)**
- Username: \`test_user\`
- Password: \`password123\`

## Database Access
- Host:
- User:
- Pass:

## Notes
- Ghi chú về cách đổi pass, VPN cần thiết...`,
    api: `# [API Endpoint]

## Method & URL
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

## Response (200 OK)
\`\`\`json
{
  "status": "success"
}
\`\`\``,
    testrun: ``
};

// ========================
// SAMPLE DOCS
// ========================
const SAMPLE_DOCS = [
    {
        id: 'doc_001', title: 'Regression Test Execution Runbook', category: 'runbook',
        tags: ['regression', 'sprint', 'automation'], status: 'published', favorite: true,
        content: `# Regression Test Execution Runbook\n\n## Purpose\nHướng dẫn chi tiết quy trình thực hiện regression test cho mỗi sprint cycle.\n\n## Prerequisites\n- Test environment đã được deploy bản build mới\n- Test data đã được chuẩn bị sẵn trong database\n- Automation test suite đã được update latest code\n\n## Steps\n\n### Bước 1: Verify Test Environment\n1. Kiểm tra version của build trên Staging\n2. Xác nhận database migration đã chạy thành công\n3. Verify các third-party services đang hoạt động\n\n### Bước 2: Execute Automated Regression\n1. Mở terminal và chạy lệnh:\n\`\`\`bash\nnpm run test:regression -- --env=staging\n\`\`\`\n2. Monitor test execution trên Dashboard\n3. Chờ kết quả và kiểm tra report\n\n### Bước 3: Manual Regression for Critical Paths\n1. Login flow (SSO + Local)\n2. Payment checkout flow\n3. Admin panel key functions\n\n## Expected Results\n- Tất cả automated tests PASS\n- Không có critical/high bugs mới\n- Test report được gửi đến Slack channel\n\n## Troubleshooting\n| Vấn đề | Nguyên nhân | Giải pháp |\n|--------|-------------|-----------|\n| Flaky tests | Timing issue | Re-run với retry |\n| DB connection fail | Migration lỗi | Rollback và re-deploy |`,
        createdAt: Date.now() - 86400000 * 15, updatedAt: Date.now() - 86400000 * 2
    },
    {
        id: 'doc_002', title: 'CI/CD Pipeline Troubleshooting Guide', category: 'runbook',
        tags: ['ci-cd', 'jenkins', 'troubleshooting'], status: 'published', favorite: false,
        content: `# CI/CD Pipeline Troubleshooting Guide\n\n## Purpose\nCung cấp các bước xử lý khi CI/CD pipeline bị lỗi.\n\n## Common Issues\n\n### Build Failed\n1. Kiểm tra Jenkins console output\n2. Xác nhận không có merge conflict\n3. Verify dependencies version\n\n### Test Stage Failed\n1. Download test report artifact\n2. Phân tích failed test cases\n3. Kiểm tra test data / environment\n\n### Deploy Failed\n1. Kiểm tra Kubernetes pod logs\n2. Verify health check endpoint\n3. Rollback nếu cần thiết\n\n## Escalation\n- Level 1: QA Engineer tự xử lý (15 phút)\n- Level 2: Escalate đến DevOps (30 phút)\n- Level 3: Escalate đến Tech Lead (1 giờ)`,
        createdAt: Date.now() - 86400000 * 30, updatedAt: Date.now() - 86400000 * 5
    },
    {
        id: 'doc_003', title: 'QA Team Onboarding Guide', category: 'onboarding',
        tags: ['onboarding', 'team', 'setup'], status: 'published', favorite: true,
        content: `# QA Team Onboarding Guide\n\n## Welcome to QA Team!\nChào mừng bạn gia nhập đội ngũ QA. Document này sẽ giúp bạn nhanh chóng hòa nhập.\n\n## Week 1: Setup\n- [ ] Cài đặt JDK 17, Node.js 18, Python 3.11\n- [ ] Setup IDE (IntelliJ / VS Code với extensions)\n- [ ] Cài đặt Docker Desktop\n- [ ] Request access: Jira, Confluence, GitHub, Slack, Figma\n- [ ] Clone repo test-automation và chạy được sample test\n\n## Week 2: Learning\n- [ ] Đọc Architecture Overview document\n- [ ] Study Testing Strategy document\n- [ ] Join 2 pairing sessions với senior QA\n- [ ] Thực hiện 5 test cases trên Staging\n\n## Week 3: Hands-on\n- [ ] Viết 10 test cases mới cho module được assign\n- [ ] Execute full test suite cho 1 feature\n- [ ] Log 3 bugs Jira theo format chuẩn\n- [ ] Present test result trong team meeting\n\n## Key Contacts\n| Role | Name | Slack |\n|------|------|-------|\n| QA Lead | Lan N. | @lan.n |\n| Senior QA | Minh T. | @minh.t |`,
        createdAt: Date.now() - 86400000 * 60, updatedAt: Date.now() - 86400000 * 10
    },
    {
        id: 'doc_004', title: 'Testing Tools Setup Manual', category: 'onboarding',
        tags: ['tools', 'setup', 'installation'], status: 'draft', favorite: false,
        content: `# Testing Tools Setup Manual\n\n## Selenium WebDriver\n\`\`\`bash\nnpm install selenium-webdriver\nnpm install @wdio/cli --save-dev\n\`\`\`\n\n## Playwright\n\`\`\`bash\nnpm init playwright@latest\n\`\`\`\n\n## Postman\n1. Download từ postman.com\n2. Import collection từ shared workspace\n3. Setup environment variables\n\n## JMeter\n1. Download từ jmeter.apache.org\n2. Cài đặt JDK 11+\n3. Configure JVM args cho performance testing`,
        createdAt: Date.now() - 86400000 * 20, updatedAt: Date.now() - 86400000 * 8
    },
    {
        id: 'doc_005', title: 'Login Module Test Cases', category: 'testcases',
        tags: ['login', 'auth', 'smoke'], status: 'published', favorite: false,
        content: `# Login Module Test Cases\n\n## Module: Authentication\n**Version**: 2.4.0 | **Updated**: 2024-01-15\n\n### TC-L001: Login with valid credentials\n- **Priority**: High | **Type**: Smoke\n- **Pre-condition**: User account đã tồn tại và active\n\n**Steps:**\n1. Navigate đến /login\n2. Nhập valid email vào trường Email\n3. Nhập valid password vào trường Password\n4. Click button "Sign In"\n\n**Expected Result:** User đăng nhập thành công, redirect đến dashboard, hiển thị user avatar.\n\n---\n\n### TC-L002: Login with invalid password\n- **Priority**: High | **Type**: Functional\n- **Pre-condition**: User account đã tồn tại\n\n**Steps:**\n1. Navigate đến /login\n2. Nhập valid email\n3. Nhập sai password 3 lần\n\n**Expected Result:** Hiển thị lỗi "Invalid credentials", sau 3 lần hiển thị CAPTCHA.\n\n---\n\n### TC-L003: Login with empty fields\n- **Priority**: Medium | **Type**: Validation\n\n**Steps:**\n1. Navigate đến /login\n2. Để trống cả 2 trường\n3. Click "Sign In"\n\n**Expected Result:** Hiển thị validation error cho cả 2 trường.`,
        createdAt: Date.now() - 86400000 * 45, updatedAt: Date.now() - 86400000 * 3
    },
    {
        id: 'doc_006', title: 'Payment Gateway Integration Tests', category: 'testcases',
        tags: ['payment', 'integration', 'critical'], status: 'draft', favorite: true,
        content: `# Payment Gateway Integration Tests\n\n## Module: Payment\n**Priority**: Critical\n\n### TC-P001: Successful card payment\n1. Add item to cart\n2. Proceed to checkout\n3. Select Credit Card payment\n4. Enter valid card details (test card: 4242 4242 4242 4242)\n5. Click "Pay Now"\n\n**Expected:** Payment success, order status = Confirmed, receipt email sent.\n\n### TC-P002: Payment decline handling\n1. Same flow với declined card (4000 0000 0000 0002)\n\n**Expected:** Hiển thị "Payment declined", order status = Pending, user có thể retry.\n\n### TC-P003: Payment timeout\n1. Simulate network timeout trong payment processing\n\n**Expected:** Hiển thị timeout message, order không bị duplicate khi retry.`,
        createdAt: Date.now() - 86400000 * 12, updatedAt: Date.now() - 86400000 * 1
    },
    {
        id: 'doc_007', title: 'API Testing Best Practices', category: 'knowledge',
        tags: ['api', 'best-practices', 'postman'], status: 'published', favorite: false,
        content: `# API Testing Best Practices\n\n## Context\nTổng hợp các best practices khi thực hiện API testing trong project.\n\n## Core Principles\n\n### 1. Test Independence\nMỗi test case phải độc lập, không phụ thuộc vào kết quả của test khác.\n\n### 2. Use Environment Variables\n\`\`\`json\n{\n  "base_url": "{{\$env.BASE_URL}}",\n  "auth_token": "{{\$env.AUTH_TOKEN}}"\n}\n\`\`\`\n\n### 3. Verify Status Code, Headers, and Body\n\`\`\`javascript\npm.test("Status is 200", () => pm.response.to.have.status(200));\npm.test("Content-Type is JSON", () => {\n  pm.expect(pm.response.headers.get('Content-Type')).to.include('application/json');\n});\npm.test("Response has id", () => {\n  pm.expect(pm.response.json()).to.have.property('id');\n});\n\`\`\`\n\n### 4. Negative Testing\n- Gửi invalid data types\n- Test missing required fields\n- Verify proper error messages\n- Check rate limiting behavior\n\n### 5. Use Assertions Effectively\n- Kiểm tra exact match cho status codes\n- Use contains/matches cho dynamic data\n- Validate schema cho response body`,
        createdAt: Date.now() - 86400000 * 90, updatedAt: Date.now() - 86400000 * 7
    },
    {
        id: 'doc_008', title: 'Performance Testing Metrics', category: 'knowledge',
        tags: ['performance', 'metrics', 'jmeter'], status: 'published', favorite: false,
        content: `# Performance Testing Metrics & Thresholds\n\n## Key Metrics\n\n| Metric | Threshold | Tool |\n|--------|-----------|------|\n| Response Time (p95) | < 2000ms | JMeter |\n| Throughput | > 100 req/s | JMeter |\n| Error Rate | < 1% | JMeter |\n| CPU Usage | < 80% | Grafana |\n| Memory Usage | < 85% | Grafana |\n| DB Connection Pool | < 80% max | APM |\n\n## Test Scenarios\n\n### Baseline Test\n- 10 concurrent users, 5 minutes\n- Mục đích: lấy baseline metrics\n\n### Load Test\n- 100 concurrent users, ramp-up 10 phút, steady 20 phút\n- Mục đích: verify system under normal load\n\n### Stress Test\n- Ramp lên 500 users cho đến khi hệ thống fail\n- Mục đích: tìm điểm break\n\n## Reporting\nTemplate report gồm: Executive Summary, Metrics Dashboard, Bottleneck Analysis, Recommendations.`,
        createdAt: Date.now() - 86400000 * 50, updatedAt: Date.now() - 86400000 * 15
    },
    {
        id: 'doc_009', title: 'Bug Report Template & Standards', category: 'knowledge',
        tags: ['bug-report', 'jira', 'standards'], status: 'published', favorite: true,
        content: `# Bug Report Template & Standards\n\n## Bug Report Format (Jira)\n\n### Title Format\n\`[Module] Brief description of the bug\`\n\nExample: \`[Login] Unable to login with special characters in password\`\n\n### Description Template\n\`\`\`\n**Environment:** Staging / Production\n**Browser:** Chrome 120 / Safari 17\n**Device:** Desktop / Mobile (iOS 17 / Android 14)\n\n**Steps to Reproduce:**\n1. Go to [URL]\n2. Click on [element]\n3. Enter [data]\n4. Observe [behavior]\n\n**Expected Result:**\nMô tả kết quả mong đợi.\n\n**Actual Result:**\nMô tả kết quả thực tế.\n\n**Attachments:**\n- Screenshot / Video\n- Console logs\n- Network har file (nếu cần)\n\`\`\`\n\n## Severity & Priority\n| Severity | Definition | Example |\n|----------|------------|--------|\n| Critical | System crash, data loss | Payment double-charge |\n| Major | Feature broken, no workaround | Cannot submit form |\n| Minor | Feature partially broken | UI misalignment |\n| Trivial | Cosmetic issue | Typos |`,
        createdAt: Date.now() - 86400000 * 70, updatedAt: Date.now() - 86400000 * 20
    },
    {
        id: 'doc_010', title: 'Database Migration Verification', category: 'runbook',
        tags: ['database', 'migration', 'verify'], status: 'draft', favorite: false,
        content: `# Database Migration Verification Runbook\n\n## Purpose\nĐảm bảo mỗi database migration được verify trước và sau khi apply trên Staging/Production.\n\n## Pre-Migration Checks\n1. Backup database hiện tại\n2. Review migration SQL script\n3. Estimate execution time trên staging\n4. Verify rollback script sẵn sàng\n\n## Post-Migration Verification\n1. Kiểm tra table structure: \`\\d table_name\`\n2. Verify data integrity: compare row counts\n3. Check indexes đã được tạo\n4. Verify foreign key constraints\n5. Run smoke tests trên affected modules\n\n## Rollback Procedure\n1. Stop application\n2. Apply rollback migration\n3. Verify data integrity\n4. Restart application\n5. Run smoke tests`,
        createdAt: Date.now() - 86400000 * 5, updatedAt: Date.now() - 86400000 * 1
    }
];
