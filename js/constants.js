// ========================
// GUEST DEMO MODE (?guest=1)
// ========================
// A completely isolated, no-auth demo path for showing the product to customers
// / in public groups without ever touching the real master password, the real
// encrypted vault, or the real GitHub token. See hydrate()/persist() in state.js
// and startApp() in events.js for the isolation boundary.
const GUEST_MODE = new URLSearchParams(location.search).get('guest') === '1';

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

// Vietnamese translation (Sprint 11). Category/domain nouns that Vietnamese QA
// teams commonly use as English loanwords (Runbook, Test Case, Bug, Sprint,
// API, Release...) are intentionally left untranslated, matching the existing
// mixed EN/VI convention already used in SAMPLE_DOCS/GUEST_DEMO_DOCS content.
// Scope: this dictionary covers every STRINGS key (persistent UI chrome — nav,
// buttons, labels, placeholders, status messages routed through t()). Ad-hoc
// toast strings written as raw literals elsewhere in the app are out of scope
// for this pass and remain in English.
const STRINGS_VI = {
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
    viewAll: "Xem tất cả",
    newest: "Mới nhất",
    sortAZ: "Tên A-Z",
    blankPage: "Trang trống",
    startFromScratch: "Bắt đầu từ đầu",
    template: "Mẫu",
    justNow: "Vừa xong",
    minsAgo: "{m} phút trước",
    hoursAgo: "{h} giờ trước",
    daysAgo: "{d} ngày trước",
    noContent: "Chưa có nội dung.",
    chooseTemplate: "Chọn một mẫu hoặc bắt đầu từ đầu.",
    noFavorites: "Chưa có mục yêu thích.",
    enterTitle: "Nhập tiêu đề...",
    egCred: "vd: Facebook, Database Prod",
    enterTag: "Nhập tag, nhấn Enter...",
    writeContent: "Viết nội dung bằng Markdown...",
    preview: "Xem trước",
    copyPassword: "Sao chép mật khẩu",
    copyUsername: "Sao chép tên đăng nhập",
    bugEnv: "Môi trường",
    bugEnvPl: "vd: Staging, Production",
    bugDevice: "Trình duyệt / Thiết bị",
    bugDevicePl: "vd: Chrome 120, iOS 17",
    bugSeverity: "Mức độ nghiêm trọng",
    bugPrecond: "Điều kiện tiên quyết",
    bugPrecondPl: "vd: Người dùng đã đăng nhập...",
    bugSteps: "Các bước tái hiện lỗi",
    bugStepsPl: "1. Mở trang...\n2. Nhấn nút...",
    bugExpected: "Kết quả mong đợi",
    bugExpectedPl: "Hệ thống sẽ...",
    bugActual: "Kết quả thực tế",
    bugActualPl: "Xảy ra lỗi...",
    tcModule: "Module / Chức năng",
    tcModulePl: "vd: Đăng nhập",
    tcPrecond: "Điều kiện tiên quyết",
    tcPrecondPl: "vd: Người dùng đã có tài khoản",
    tcData: "Dữ liệu kiểm thử",
    tcDataPl: "vd: user: admin, pass: 123",
    tcSteps: "Các bước kiểm thử",
    tcAction: "Hành động",
    tcActionPl: "Nhập email...",
    tcExpected: "Kết quả mong đợi",
    tcExpectedPl: "Hệ thống hiển thị...",
    apiMethod: "Phương thức",
    apiEndpoint: "Endpoint / Đường dẫn",
    apiHeaders: "Headers",
    apiParams: "Query Parameters",
    apiBody: "Request Body (JSON)",
    apiResponse: "Response (JSON)",
    apiKey: "Key",
    apiValue: "Value",
    apiRequired: "Bắt buộc",
    dashboard: "Bảng điều khiển",
    categories: "Danh mục",
    documents: "Tài liệu",
    favorites: "Yêu thích",
    newDoc: "Tài liệu mới",
    editDoc: "Sửa tài liệu",
    save: "Lưu",
    cancel: "Hủy",
    back: "Quay lại",
    edit: "Sửa",
    duplicate: "Nhân bản",
    delete: "Xóa",
    trash: "Thùng rác",
    restore: "Khôi phục",
    deleteForever: "Xóa vĩnh viễn",
    delConfirm: "Bạn có chắc muốn chuyển tài liệu này vào Thùng rác?",
    delConfirmForever: "Bạn có chắc muốn xóa vĩnh viễn tài liệu này? Hành động này không thể hoàn tác.",
    delTitle: "Xóa tài liệu",
    delTitleForever: "Xóa vĩnh viễn",
    delConfirmBtn: "Xóa",
    delConfirmBtnForever: "Xóa vĩnh viễn",
    emptyTrash: "Dọn sạch thùng rác",
    emptyTrashTitle: "Dọn sạch thùng rác",
    emptyTrashConfirm: "Bạn có chắc muốn dọn sạch thùng rác? Tất cả tài liệu sẽ bị xóa vĩnh viễn và không thể khôi phục.",
    emptyTrashBtn: "Dọn sạch thùng rác",
    generatingLink: "Đang tạo liên kết bảo mật...",
    pleaseWait: "Vui lòng chờ trong khi chúng tôi mã hóa tài liệu của bạn.",
    linkReady: "Liên kết đã sẵn sàng!",
    linkDesc: "Bất kỳ ai có liên kết này đều có thể xem tài liệu. Nội dung được mã hóa bằng một khóa riêng.",
    share: "Chia sẻ liên kết",
    close: "Đóng",
    searchDocs: "Tìm kiếm tài liệu...",
    searchTasks: "Tìm kiếm công việc...",
    noDocFound: "Không tìm thấy tài liệu",
    noDocYet: "Chưa có tài liệu nào",
    trashEmpty: "Thùng rác trống",
    tryDiffKey: "Thử tìm kiếm với từ khóa khác",
    createFirstDoc: "Bắt đầu tạo tài liệu đầu tiên của bạn",
    recentlyUpdated: "Cập nhật gần đây",
    allStatus: "Tất cả trạng thái",
    titleRequired: "Vui lòng nhập tiêu đề",
    docCreated: "Đã tạo tài liệu",
    docUpdated: "Đã cập nhật tài liệu",
    docDuplicated: "Đã nhân bản tài liệu",
    docDeleted: "Đã chuyển vào Thùng rác",
    docRestored: "Đã khôi phục tài liệu",
    docDeletedForever: "Đã xóa vĩnh viễn",
    trashEmptied: "Đã dọn sạch thùng rác",
    copied: "Đã sao chép",
    testrun: "Test Runs",
    release: "Release",
    untested: "Chưa kiểm thử",
    pass: "Đạt",
    fail: "Không đạt",
    blocked: "Bị chặn",
    testRunProgress: "Tiến độ",
    todo: "Cần làm",
    inProgress: "Đang làm",
    review: "Xem xét",
    done: "Hoàn thành",
    dragTaskHere: "Kéo công việc vào đây",
    newTask: "Công việc mới",
    dragBugHere: "Kéo bug vào đây",
    newBug: "Báo lỗi mới",
    bugNew: "Mới",
    bugOpen: "Đang mở",
    bugInProgress: "Đang xử lý",
    bugResolved: "Đã xử lý",
    bugRetest: "Kiểm thử lại",
    bugVerified: "Đã xác nhận",
    bugClosed: "Đã đóng",
    bugWontFix: "Sẽ không sửa",
    bugDuplicate: "Trùng lặp",
    bugRejected: "Từ chối",
    bugDeferred: "Hoãn lại",
    bugAssignee: "Người phụ trách",
    bugAssigneePl: "Tên developer...",
    bugReopen: "Mở lại",
    allDocuments: "Tất cả tài liệu",
    status: "Trạng thái",
    tags: "Tags",
    category: "Danh mục",
    usernameEmail: "Tên đăng nhập / Email",
    passwordField: "Mật khẩu",
    addStep: "Thêm bước",
    addHeader: "Thêm Header",
    addParam: "Thêm Param",
    addProperty: "Thêm thuộc tính",
    toggleSecret: "Ẩn/hiện bí mật",
    formatJson: "Định dạng JSON",
    moreActions: "Thêm hành động",
    copy: "Sao chép",
    healthStatus: "Tình trạng",
    properties: "Thuộc tính",
    linkedCreds: "Thông tin đăng nhập liên kết",
    noCredFound: "Không tìm thấy thông tin đăng nhập",
    notes: "Ghi chú",
    envLabelPl: "vd: Frontend URL",
    envValuePl: "vd: https://app.com",
    envNotesPl: "Thêm ghi chú riêng cho môi trường này...",
    stepPl: "Bước {idx}...",
    statusDraft: "Nháp",
    statusPublished: "Đã xuất bản",
    statusArchived: "Lưu trữ",
    severityCritical: "Nghiêm trọng",
    severityMajor: "Cao",
    severityMinor: "Thấp",
    severityTrivial: "Không đáng kể",
    imgUploading: "Đang tải ảnh lên GitHub...",
    imgUploadSuccess: "Tải ảnh lên GitHub thành công!",
    imgUploadFail: "Tải lên GitHub thất bại. Chuyển sang chế độ nhúng ảnh trực tiếp.",
    imgFallbackSize: "Chế độ dự phòng: Ảnh nên dưới 800KB để phù hợp với database.",
    imgFallbackProcessing: "Đang xử lý ảnh nhúng trực tiếp (Base64 dự phòng)...",
    imgFallbackDone: "Đã tải ảnh nhúng trực tiếp. Kết nối GitHub để đồng bộ tốt hơn!",
    imgReadFail: "Không thể đọc file ảnh.",
    imgProcessFail: "Xử lý ảnh thất bại. Vui lòng thử lại.",
    ghSaveSuccess: "Đã lưu cài đặt GitHub thành công!",
    ghCleared: "Đã xóa cài đặt GitHub. Dùng chế độ dự phòng Base64.",
    ghFillRequired: "Vui lòng điền đủ Owner, Repo và Token.",
    mpFillAll: "Vui lòng điền đủ cả 3 trường.",
    mpMismatch: "Mật khẩu mới không khớp.",
    mpTooShort: "Mật khẩu phải có ít nhất 8 ký tự.",
    mpChanged: "Đổi Master Password thành công!",
    mpChangeFail: "Đổi mật khẩu thất bại.",
    mpIncorrect: "Sai mật khẩu.",
    vaultUnlocked: "Đã mở khóa vault",
    searchTypeHint: "Gõ để bắt đầu tìm kiếm...",
    searchNoResult: "Không tìm thấy tài liệu nào.",
    matchTitle: "Khớp tiêu đề",
    matchTag: "Khớp tag",
    matchContent: "Khớp nội dung",
    invalidJson: "Định dạng JSON không hợp lệ",
    copyFail: "Sao chép thất bại",
    ghSyncOk: "Đã đồng bộ với GitHub",
    ghSyncFail: "Đồng bộ GitHub thất bại"
};

// Active UI language ('en' | 'vi'), persisted like the theme preference.
let CURRENT_LANG = (localStorage.getItem('docvault_lang') === 'vi') ? 'vi' : 'en';

function t(key, params = {}) {
    const dict = CURRENT_LANG === 'vi' ? STRINGS_VI : STRINGS;
    // Falls back EN -> raw key if a translation is ever missing, so a gap in
    // STRINGS_VI can never surface as a blank string in the UI.
    let text = (dict && dict[key] !== undefined) ? dict[key] : (STRINGS[key] !== undefined ? STRINGS[key] : key);
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

// Safe accessor for category metadata (US-405). Documents with an unknown or
// legacy category (e.g. from an import) would otherwise crash rendering when
// code reads CAT_META[cat].color/.icon/.cls/.label directly.
function getCatMeta(category) {
    return CAT_META[category] || { label: category || 'Unknown', icon: 'fa-file', color: '#7a8ba8', cls: 'cat-unknown' };
}

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

// ========================
// GUEST DEMO DATA — fully isolated sample set covering all 11 categories,
// cross-linked (bug found in a failed test-run step, environment linked to
// credentials, test plan linked to test cases + runs, release linked to
// runs/bugs/envs) so a visitor has something real to click through.
// Never mixed with SAMPLE_DOCS / the real vault — see hydrate() in state.js.
// ========================
const GUEST_DEMO_DOCS = (() => {
    const now = Date.now();
    const days = n => now - 86400000 * n;

    // Mirrors the Markdown table saveDoc() generates for testcases, so the
    // document reads correctly when opened directly (the viewer has no
    // dedicated testcases block — it renders doc.content as Markdown).
    const tcContent = (title, tcData) => `# ${title}\n\n${tcData.module ? `**Module:** ${tcData.module}` : ''}\n\n${tcData.precond ? `## Pre-conditions\n${tcData.precond}\n` : ''}${tcData.data ? `## Test Data\n${tcData.data}\n` : ''}\n## Test Steps\n| Step | Action | Expected Result |\n|---|---|---|\n${tcData.steps.map((s, i) => `| ${i + 1} | ${s.action} | ${s.expected} |`).join('\n')}\n`;

    const tcLoginData = { module: 'Authentication', precond: 'User account đã tồn tại và active', data: 'user: demo@shop.test / pass: Demo@1234',
        steps: [
            { action: 'Điều hướng đến /login, nhập email + password hợp lệ, click "Sign In"', expected: 'Đăng nhập thành công, redirect tới /dashboard' },
            { action: 'Đăng xuất, nhập sai password 3 lần liên tiếp', expected: 'Hiển thị lỗi "Invalid credentials", sau lần thứ 3 hiện CAPTCHA' }
        ] };
    const tcLogin = {
        id: 'gd_tc_login', title: 'Login — Valid & Invalid Credentials', category: 'testcases',
        subfolder: 'Auth', tags: ['login', 'smoke'], status: 'published', favorite: true,
        tcData: tcLoginData, content: tcContent('Login — Valid & Invalid Credentials', tcLoginData),
        createdAt: days(20), updatedAt: days(2)
    };
    const tcCheckoutData = { module: 'Checkout', precond: 'Giỏ hàng có ít nhất 1 sản phẩm', data: 'card: 4242 4242 4242 4242',
        steps: [
            { action: 'Thêm sản phẩm vào giỏ, vào trang Checkout', expected: 'Hiển thị đúng tổng tiền, phí ship, thuế' },
            { action: 'Nhập thông tin thẻ hợp lệ, click "Pay Now"', expected: 'Thanh toán thành công, order status = Confirmed' },
            { action: 'Thử thanh toán với thẻ bị từ chối (4000 0000 0000 0002)', expected: 'Hiển thị "Payment declined", order status = Pending, cho phép retry' }
        ] };
    const tcCheckout = {
        id: 'gd_tc_checkout', title: 'Checkout — Credit Card Payment', category: 'testcases',
        subfolder: 'Checkout', tags: ['payment', 'critical'], status: 'published', favorite: true,
        tcData: tcCheckoutData, content: tcContent('Checkout — Credit Card Payment', tcCheckoutData),
        createdAt: days(18), updatedAt: days(1)
    };
    const tcSearchData = { module: 'Catalog', precond: 'Catalog có tối thiểu 50 sản phẩm', data: '',
        steps: [
            { action: 'Nhập từ khóa "áo thun" vào ô search', expected: 'Trả về kết quả liên quan trong < 1s' },
            { action: 'Áp dụng filter Giá: 100k-300k + Size: M', expected: 'Danh sách được lọc đúng theo điều kiện' }
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
                [tcLogin.id]: { 0: 'pass', 1: 'pass', note: 'CAPTCHA hoạt động đúng sau 3 lần sai.' },
                [tcCheckout.id]: { 0: 'pass', 1: 'fail', 2: 'blocked', note: 'Payment declined case trả về lỗi 500 thay vì thông báo thân thiện.' },
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
        precond: 'Giỏ hàng có 2+ sản phẩm', steps: ['Thêm 2 sản phẩm vào giỏ', 'Vào trang Checkout', 'Nhấn F5 để refresh'],
        expected: 'Giỏ hàng giữ nguyên sản phẩm', actual: 'Giỏ hàng trống, phải thêm lại từ đầu',
        resolution: '', duplicateOf: '', reopenCount: 0 };
    const bug1 = {
        id: 'gd_bug_1', bugNumber: 1, title: 'Giỏ hàng mất sản phẩm khi refresh trang Checkout', category: 'bug',
        tags: ['checkout', 'cart'], status: 'published', favorite: true, bugStatus: 'open',
        bugData: bug1Data, content: bugContent('Giỏ hàng mất sản phẩm khi refresh trang Checkout', bug1Data),
        createdAt: days(6), updatedAt: days(1)
    };
    const bug2Data = { env: 'Staging · build #482', browser: 'Chrome 120', severity: 'Major', priority: 'P2', assignee: 'Lan N.',
        precond: 'Đang ở bước thanh toán', steps: ['Thêm sản phẩm vào giỏ, vào trang Checkout', 'Nhập thông tin thẻ hợp lệ, click "Pay Now"', 'Thử thanh toán với thẻ bị từ chối (4000 0000 0000 0002)'],
        expected: 'Hiển thị "Payment declined", order status = Pending, cho phép retry',
        actual: 'Server trả về HTTP 500, không có thông báo cho user, order kẹt ở trạng thái Processing',
        resolution: '', duplicateOf: '', reopenCount: 0,
        foundInRun: runSprint.id, foundInTc: tcCheckout.id, foundInStep: 1 };
    const bug2 = {
        id: 'gd_bug_2', bugNumber: 2, title: 'Checkout — Payment Declined trả về lỗi 500', category: 'bug',
        tags: ['payment', 'checkout'], status: 'published', favorite: false, bugStatus: 'in-progress',
        bugData: bug2Data,
        content: bugContent('Checkout — Payment Declined trả về lỗi 500', bug2Data) + '\n\n> Reported from test run **Sprint 24 — Regression Run** — Checkout — Credit Card Payment, step 2.',
        createdAt: days(1), updatedAt: days(1)
    };
    const bug3Data = { env: 'Staging', browser: 'Safari 17', severity: 'Minor', priority: 'P3', assignee: 'Minh T.',
        precond: '', steps: ['Vào trang Catalog', 'Gõ nhanh 5-6 ký tự liên tiếp vào ô search'],
        expected: 'Chỉ gọi API 1 lần sau khi ngừng gõ 300ms', actual: 'Gọi API mỗi lần gõ 1 ký tự',
        resolution: 'fixed', duplicateOf: '', reopenCount: 0 };
    const bug3 = {
        id: 'gd_bug_3', bugNumber: 3, title: 'Search box không debounce, gọi API liên tục khi gõ', category: 'bug',
        tags: ['search', 'performance'], status: 'archived', favorite: false, bugStatus: 'closed',
        bugData: bug3Data, content: bugContent('Search box không debounce, gọi API liên tục khi gõ', bug3Data),
        createdAt: days(25), updatedAt: days(8)
    };

    const testplan1 = {
        id: 'gd_testplan_1', title: 'Release v2.4.0 Test Plan', category: 'testplan',
        tags: ['release', 'v2.4.0'], status: 'published', favorite: true,
        tcPlanData: { linkedTCs: [tcLogin.id, tcCheckout.id, tcSearch.id], linkedRuns: [runSprint.id] },
        content: '## Scope\nRegression đầy đủ cho Auth, Checkout, Catalog trước khi release v2.4.0.\n\n## Strategy\nAutomated smoke suite + manual exploratory cho Checkout (module rủi ro cao nhất).\n\n## Timeline\n- Code freeze: T-3\n- Full regression: T-2\n- Sign-off: T-1',
        createdAt: days(7), updatedAt: days(1)
    };

    const apiUsers = {
        id: 'gd_api_users', title: 'GET /api/v1/users/{id}', category: 'api',
        subfolder: 'Users Service', tags: ['users', 'get'], status: 'published', favorite: false,
        apiData: { method: 'GET', endpoint: '/api/v1/users/{id}',
            headers: [{ key: 'Authorization', value: 'Bearer {{token}}', req: true }, { key: 'Accept', value: 'application/json', req: false }],
            params: [{ key: 'include', value: 'profile,orders', req: false }],
            body: '', statusCode: '200',
            response: `{\n  "id": "usr_8821",\n  "email": "demo@shop.test",\n  "name": "Demo User",\n  "createdAt": "2024-01-15T09:00:00Z"\n}` },
        content: '', createdAt: days(40), updatedAt: days(10)
    };
    const apiOrders = {
        id: 'gd_api_orders', title: 'POST /api/v1/orders', category: 'api',
        subfolder: 'Orders Service', tags: ['orders', 'post'], status: 'draft', favorite: true,
        apiData: { method: 'POST', endpoint: '/api/v1/orders',
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
            linkedCreds: [credAdmin.id], notes: 'Reset dữ liệu mỗi đêm 2h sáng. Dùng để chạy regression suite hàng ngày.' },
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
            linkedCreds: [credPayment.id], notes: 'Đang theo dõi tăng error rate trên payment service sau bản deploy sáng nay.' },
        content: '', createdAt: days(90), updatedAt: days(1)
    };

    const release1 = {
        id: 'gd_release_1', title: 'v2.4.0 — Checkout Reliability', category: 'release',
        tags: ['release'], status: 'published', favorite: true,
        releaseData: { version: 'v2.4.0', releaseDate: new Date(now + 86400000 * 3).toISOString().slice(0, 10), status: 'in-progress',
            linkedRuns: [runSprint.id], linkedBugs: [bug1.id, bug2.id, bug3.id], linkedEnvs: [envStaging.id, envProd.id] },
        content: '## Highlights\n- Cải thiện độ ổn định luồng Checkout\n- Debounce cho Search\n\n## Risk\nCòn 1 bug Critical (giỏ hàng mất khi refresh) chưa fix — chặn release cho tới khi resolve.',
        createdAt: days(3), updatedAt: days(1)
    };

    const tasks = [
        { id: 'gd_task_1', title: 'Viết test case cho Checkout Retry Flow', category: 'task', kanbanStatus: 'todo',
            tags: ['checkout'], status: 'draft', favorite: false, content: '', createdAt: days(2), updatedAt: days(2) },
        { id: 'gd_task_2', title: 'Điều tra BUG-002 payment declined 500', category: 'task', kanbanStatus: 'in-progress',
            tags: ['bug', 'payment'], status: 'draft', favorite: true, content: '', createdAt: days(1), updatedAt: days(1) },
        { id: 'gd_task_3', title: 'Review Test Plan v2.4.0 với QA Lead', category: 'task', kanbanStatus: 'review',
            tags: ['release'], status: 'draft', favorite: false, content: '', createdAt: days(3), updatedAt: days(1) },
        { id: 'gd_task_4', title: 'Setup automation cho Search debounce regression', category: 'task', kanbanStatus: 'done',
            tags: ['automation'], status: 'draft', favorite: false, content: '', createdAt: days(10), updatedAt: days(4) }
    ];

    const runbook1 = {
        id: 'gd_rb_1', title: 'Daily Regression Kickoff Runbook', category: 'runbook',
        tags: ['regression', 'daily'], status: 'published', favorite: false,
        content: '# Daily Regression Kickoff\n\n1. Verify Staging đã deploy build mới nhất\n2. Chạy automated smoke suite\n3. Nếu smoke pass, trigger full regression run\n4. Log kết quả vào Test Run tương ứng\n5. Báo cáo trên kênh #qa-daily nếu có Critical/Major bug mới',
        createdAt: days(30), updatedAt: days(5)
    };
    const knowledge1 = {
        id: 'gd_kn_1', title: 'Khi nào nên Block vs Fail một bước test', category: 'knowledge',
        tags: ['best-practices'], status: 'published', favorite: false,
        content: '# Block vs Fail\n\n**Fail**: bước thực thi được nhưng kết quả sai với expected — luôn kèm bug report.\n\n**Blocked**: không thể thực thi bước vì một điều kiện tiên quyết khác đang lỗi (vd bug ở bước trước). Không tự tạo bug mới cho bước Blocked — link về bug đang chặn.',
        createdAt: days(14), updatedAt: days(6)
    };

    return [
        runbook1, knowledge1,
        tcLogin, tcCheckout, tcSearch,
        ...tasks,
        bug1, bug2, bug3,
        testplan1,
        apiUsers, apiOrders,
        credAdmin, credPayment,
        envStaging, envProd,
        runSprint,
        release1
    ];
})();
