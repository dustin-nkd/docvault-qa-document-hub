
window.addEventListener('error', function(e) {
    const el = document.getElementById('debug-err');
    if (el) { el.style.display = 'block'; el.innerText += '\n' + e.message + ' at ' + e.filename + ':' + e.lineno; }
});
window.addEventListener('unhandledrejection', function(e) {
    const el = document.getElementById('debug-err');
    if (el) { el.style.display = 'block'; el.innerText += '\nPromise Error: ' + (e.reason && e.reason.message ? e.reason.message : e.reason); }
});

// ========================
// CONSTANTS
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
    testrun: { get label() { return t('testrun'); }, icon: 'fa-play-circle', color: 'var(--c-testrun)', cls: 'cat-testrun' }
};

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
// STATE
// ========================
let state = {
    view: 'dashboard', // dashboard | documents | favorites | editor | viewer
    category: 'all',
    search: '',
    statusFilter: 'all',
    sortBy: 'updated',
    editingDoc: null, // null = new, object = editing
    editorTags: [],
    editorMode: 'edit', // edit | preview
    sidebarOpen: false,
    history: []
};

let documents = [];

// ========================
// PERSISTENCE
// ========================
async function persist() {
    await DocStorage.save(documents);
    if (window.SyncService && window.SyncService.isUnlocked()) {
        window.SyncService.pushData(); // async background push
    }
}
async function hydrate() {
    const settings = await DocStorage.getSettings();
    if (settings && settings.lang) state.lang = settings.lang;
    const saved = await DocStorage.getAll();
    if (saved && Array.isArray(saved) && saved.length > 0) {
        documents = saved;
    } else {
        documents = [...SAMPLE_DOCS];
    }
    
    let migrated = false;
    documents.forEach(d => {
        if (d.category === 'onboarding') {
            d.category = 'knowledge';
            d.subfolder = d.subfolder || 'Onboarding';
            migrated = true;
        } else if (d.category === 'meeting') {
            d.category = 'knowledge';
            d.subfolder = d.subfolder || 'Meeting Notes';
            migrated = true;
        }
    });
    if (migrated) await persist();
}

// ========================
// UTILS
// ========================
function uid() { return 'doc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6); }
function fmtDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return t('justNow');
    if (diff < 3600000) return t('minsAgo', {m: Math.floor(diff/60000)});
    if (diff < 86400000) return t('hoursAgo', {h: Math.floor(diff/3600000)});
    if (diff < 604800000) return t('daysAgo', {d: Math.floor(diff/86400000)});
    return d.toLocaleDateString(state.lang === 'vi' ? 'vi-VN' : 'en-US', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function excerpt(text, len = 120) {
    if (!text) return '';
    const clean = text.replace(/[#*`\[\]()>|-]/g, '').replace(/\n+/g, ' ').trim();
    return clean.length > len ? clean.substring(0, len) + '...' : clean;
}
function escHtml(s) {
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ========================
// MARKDOWN RENDERER
// ========================
function renderMd(text) {
    if (!text) return `<p style="color:var(--tx-d)">${t('noContent')}</p>`;
    let h = text;
    
    // Extract code blocks and inline code
    const codeBlocks = [];
    h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
        const rawCodeB64 = btoa(unescape(encodeURIComponent(code.trim())));
        codeBlocks.push(`
<pre><button class="code-copy-btn" data-onclick="copyCodeBlock(this, '${rawCodeB64}')" title="Copy"><i class="fa-regular fa-copy"></i></button><code>${escHtml(code.trim())}</code></pre>`);
        return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    const inlineCodes = [];
    h = h.replace(/`([^`]+)`/g, (_, code) => {
        inlineCodes.push(`<code>${escHtml(code)}</code>`);
        return `__INLINE_CODE_${inlineCodes.length - 1}__`;
    });

    // Headers
    h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // Bold + Italic
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
    // Strikethrough
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    // Blockquote
    h = h.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
    // HR
    h = h.replace(/^---+$/gm, '<hr>');
    // Checkbox
    h = h.replace(/^- \[x\] (.+)$/gm, '<li class="chk-li" style="list-style:none;"><input type="checkbox" checked disabled> $1</li>');
    h = h.replace(/^- \[ \] (.+)$/gm, '<li class="chk-li" style="list-style:none;"><input type="checkbox" disabled> $1</li>');
    // Unordered list
    h = h.replace(/^- (.+)$/gm, '<li class="ul-li">$1</li>');
    // Ordered list
    h = h.replace(/^\d+\. (.+)$/gm, '<li class="ol-li">$1</li>');
    
    // Group lists
    h = h.replace(/((?:<li class="chk-li".*?>.*<\/li>\n?)+)/g, '<ul style="list-style:none;padding-left:4px;">$1</ul>');
    h = h.replace(/((?:<li class="ul-li".*?>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    h = h.replace(/((?:<li class="ol-li".*?>.*<\/li>\n?)+)/g, '<ol style="list-style-type:decimal;padding-left:24px;">$1</ol>');
    // Simple table support
    h = h.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_, headerRow, sep, bodyRows) => {
        const headers = headerRow.split('|').filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join('');
        const rows = bodyRows.trim().split('\n').map(row => {
            const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
            return `<tr>${cells}</tr>`;
        }).join('');
        return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
    });
    // Links
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // Paragraphs - wrap loose lines
    h = h.replace(/^(?!<[houblptd]|<\/|<li|<input|<tr|<table|__CODE_BLOCK_|__INLINE_CODE_)([^\n]+)$/gm, '<p>$1</p>');
    h = h.replace(/<p><\/p>/g, '');

    // Restore inline codes and code blocks
    h = h.replace(/__INLINE_CODE_(\d+)__/g, (_, idx) => inlineCodes[idx]);
    h = h.replace(/__CODE_BLOCK_(\d+)__/g, (_, idx) => codeBlocks[idx]);

    return h;
}

// ========================
// TOAST
// ========================
function toast(msg, type = 'success') {
    const el = document.createElement('div');
    const colors = { success: 'border-l-4 border-emerald-500', error: 'border-l-4 border-rose-500', info: 'border-l-4 border-cyan-500' };
    const icons = { success: 'fa-check-circle text-emerald-400', error: 'fa-exclamation-circle text-rose-400', info: 'fa-info-circle text-cyan-400' };
    el.className = `toast flex items-center gap-3 px-4 py-3 rounded-lg ${colors[type] || colors.info}`;
    el.style.cssText = 'background:var(--card);pointer-events:auto;min-width:280px;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
    el.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span class="text-sm" style="color:var(--tx);">${msg}</span>`;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3000);
}

// ========================
// MODAL
// ========================
function showModal(html) {
    const m = document.getElementById('modal');
    m.className = 'fixed inset-0 z-[90] flex items-center justify-center modal-bg';
    m.innerHTML = `<div class="fade-up rounded-xl p-6 w-full max-w-lg mx-4" style="background:var(--bg2);border:1px solid var(--brd);max-height:90vh;overflow-y:auto;">${html}</div>`;
    m.onclick = (e) => { if (e.target === m) closeModal(); };
}
function closeModal() { document.getElementById('modal').className = 'fixed inset-0 z-[90] hidden'; }

function showDeleteModal(id, isPermanent = false) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    
    const actionStr = isPermanent ? `hardDeleteDoc('${id}')` : `confirmDelete('${id}')`;
    const titleStr = isPermanent ? (t('delTitleForever') || 'Delete Permanently') : t('delTitle');
    const warningStr = isPermanent ? (t('delConfirmForever') || 'Are you sure you want to permanently delete this? It cannot be recovered.') : t('delConfirm');
    const btnStr = isPermanent ? (t('delConfirmBtnForever') || 'Permanently Delete') : t('delConfirmBtn');

    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);">
                <i class="fa-solid fa-trash text-rose-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">${titleStr}</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">${warningStr} "<strong style="color:var(--tx);">${escHtml(doc.title)}</strong>"?</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">${t('cancel')}</button>
                <button class="btn-d" data-onclick="${actionStr}">${btnStr}</button>
            </div>
        </div>
    `);
}

async function confirmDelete(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.status = 'deleted';
        doc.deletedAt = Date.now();
        doc.updatedAt = Date.now();
    }
    await persist();
    closeModal();
    toast(t('docDeleted'), 'success');
    if (state.view === 'viewer' || state.view === 'editor') navigate('documents', state.category);
    else render();
}

async function restoreDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.status = 'draft';
        delete doc.deletedAt;
        doc.updatedAt = Date.now();
    }
    await persist();
    toast(t('docRestored') || "Document Restored", 'success');
    render();
}

async function hardDeleteDoc(id) {
    documents = documents.filter(d => d.id !== id);
    await persist();
    closeModal();
    toast(t('docDeletedForever') || "Permanently Deleted", 'success');
    render();
}

function showEmptyTrashModal() {
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(244,63,94,0.1);">
                <i class="fa-solid fa-dumpster-fire text-rose-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">${t('emptyTrashTitle') || 'Empty Trash'}</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">${t('emptyTrashConfirm') || 'Are you sure you want to permanently delete all items in the Trash? This action cannot be undone.'}</p>
            <div class="flex gap-3 justify-center">
                <button class="btn-s" data-onclick="closeModal()">${t('cancel')}</button>
                <button class="btn-d" data-onclick="emptyTrash()">${t('emptyTrashBtn') || 'Empty Trash'}</button>
            </div>
        </div>
    `);
}

async function emptyTrash() {
    documents = documents.filter(d => d.status !== 'deleted');
    await persist();
    closeModal();
    toast(t('trashEmptied') || "Trash Emptied", 'success');
    render();
}

// ========================
// TEMPLATE MODAL
// ========================
function showTemplateModal() {
    const cats = Object.entries(CAT_META);
    showModal(`
        <div>
            <h3 class="font-heading font-semibold text-lg mb-1">${t('newDoc')}</h3>
            <p class="text-sm mb-5" style="color:var(--tx-m);">${t('chooseTemplate')}</p>
            <button class="tpl-card w-full mb-4 flex items-center gap-4 text-left" data-onclick="createDoc(null)">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style="background:rgba(16,185,129,0.1);">
                    <i class="fa-solid fa-file-circle-plus" style="color:var(--acc);"></i>
                </div>
                <div>
                    <p class="text-sm font-semibold" style="color:var(--tx);">${t('blankPage')}</p>
                    <p class="text-xs" style="color:var(--tx-d);">${t('startFromScratch')}</p>
                </div>
            </button>
            <div class="grid grid-cols-2 gap-3">
                ${cats.map(([key, meta]) => `
                    <button class="tpl-card text-left" data-onclick="createDoc('${key}')">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style="background:${meta.color}15;">
                            <i class="fa-solid ${meta.icon} text-xs" style="color:${meta.color};"></i>
                        </div>
                        <p class="text-sm font-semibold" style="color:var(--tx);">${meta.label}</p>
                        <p class="text-[11px] mt-0.5" style="color:var(--tx-d);">${t('template')} ${meta.label}</p>
                    </button>
                `).join('')}
            </div>
        </div>
    `);
}

// ========================
// SIDEBAR
// ========================
window.showSyncModal = function() {
    const s = window.SyncService.getSettings();
    showModal(`
        <div>
            <h3 class="font-heading font-bold text-lg mb-4 flex items-center gap-2"><i class="fa-solid fa-cloud text-[var(--acc)]"></i> Cloud Sync Settings</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m)">Configure your JSONBin.io backend for Real-time E2EE Synchronization.</p>
            
            <form onsubmit="event.preventDefault(); saveSyncSettings();" class="flex flex-col gap-4">
                <div>
                    <label class="block text-xs font-bold mb-1" style="color:var(--tx-m)">JSONBin X-Master-Key</label>
                    <input type="password" id="sync-api-key" class="form-input w-full" placeholder="Enter X-Master-Key" value="${s.apiKey}">
                </div>
                <div>
                    <label class="block text-xs font-bold mb-1" style="color:var(--tx-m)">JSONBin Bin ID</label>
                    <input type="text" id="sync-bin-id" class="form-input w-full" placeholder="Enter Bin ID" value="${s.binId}">
                </div>
                <div class="mt-2 pt-4 border-t border-[var(--brd)]">
                    <label class="block text-xs font-bold mb-1" style="color:var(--tx-m)">Change Master Password (Optional)</label>
                    <input type="password" id="sync-new-password" class="form-input w-full" placeholder="Enter new password to change it">
                    <p class="text-[10px] mt-1 text-[var(--tx-d)]">Leave blank if you don't want to change your current password.</p>
                </div>
                
                <div class="pt-4 border-t border-[var(--brd)]">
                    <button type="submit" class="btn-p w-full py-2.5 flex items-center justify-center gap-2">
                        <i class="fa-solid fa-save"></i> Save Settings & Sync
                    </button>
                </div>
            </form>
        </div>
    `);
}

window.saveSyncSettings = async function() {
    const apiKey = document.getElementById('sync-api-key').value.trim();
    const binId = document.getElementById('sync-bin-id').value.trim();
    const newPassword = document.getElementById('sync-new-password').value;
    
    if (!apiKey || !binId) {
        toast("API Key and Bin ID are required", "warning");
        return;
    }
    
    const btn = document.querySelector('#sync-modal button[type="submit"]');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
    
    let masterPassword = window.SyncService.getSettings().masterPassword || 'skipped';
    if (newPassword) {
        masterPassword = newPassword;
    }
    
    window.SyncService.saveSettings(apiKey, binId, masterPassword);
    
    try {
        if (masterPassword !== 'skipped') {
            // Try to pull first
            const hasData = await window.SyncService.pullAndUnlock(masterPassword);
            if (hasData) {
                toast("Data pulled from Cloud!", "success");
                setTimeout(() => window.location.reload(), 1000);
                return;
            } else {
                // Bin is empty, push local data
                await window.SyncService.pushData();
                toast("Local data pushed to Cloud!", "success");
            }
        }
        closeModal();
    } catch (err) {
        console.error(err);
        toast("Error: " + (err.message || "Failed to sync"), "error");
        if (btn) btn.innerHTML = '<i class="fa-solid fa-save"></i> Save Settings & Sync';
    }
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('mob-overlay');
    state.sidebarOpen = !state.sidebarOpen;
    sb.classList.toggle('open', state.sidebarOpen);
    ov.classList.toggle('hidden', !state.sidebarOpen);
}

function updateSidebar() {

    const lblDash = document.getElementById('lbl-dashboard'); if (lblDash) lblDash.textContent = t('dashboard');
    const lblDocs = document.getElementById('lbl-documents'); if (lblDocs) lblDocs.textContent = t('documents');
    const lblFavs = document.getElementById('lbl-favorites'); if (lblFavs) lblFavs.textContent = t('favorites');
    const lblTrash = document.getElementById('lbl-trash'); if (lblTrash) lblTrash.textContent = t('trash') || 'Trash';
    const lblCats = document.getElementById('lbl-categories'); if (lblCats) lblCats.textContent = t('categories') || 'Categories';
    
    const activeDocs = documents.filter(d => d.status !== 'deleted');
    document.getElementById('cnt-all').textContent = activeDocs.length;
    document.getElementById('cnt-fav').textContent = activeDocs.filter(d => d.favorite).length;

    // Render categories dynamically
    const catNav = document.getElementById('cat-nav');
    if (catNav) {
        let catHtml = '';
        Object.entries(CAT_META).forEach(([k, m]) => {
            const catDocs = activeDocs.filter(d => d.category === k);
            const isActiveCat = state.view === 'documents' && state.category === k && !state.subfolder;
            const cls = isActiveCat ? 'nav-item active flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm' : 'nav-item flex items-center gap-3 px-3 py-2 rounded-r-lg text-sm';
            
            catHtml += `
                <div class="${cls}" style="color:var(--tx-m); cursor:pointer;" data-onclick="navigate('documents','${k}')">
                    <span class="w-2 h-2 rounded-full shrink-0" style="background:${m.color};"></span>
                    <span class="truncate">${m.label}</span>
                    <span class="count ml-auto">${catDocs.length}</span>
                </div>
            `;
            
            // Subfolders
            const subfolders = [...new Set(catDocs.filter(d => d.subfolder).map(d => d.subfolder))];
            if (subfolders.length > 0) {
                subfolders.sort().forEach(sf => {
                    const sfCount = catDocs.filter(d => d.subfolder === sf).length;
                    const isActiveSf = state.view === 'documents' && state.category === k && state.subfolder === sf;
                    const sfCls = isActiveSf ? 'nav-item active flex items-center gap-2 px-3 py-1.5 rounded-r-lg text-xs ml-4 border-l-2' : 'nav-item flex items-center gap-2 px-3 py-1.5 rounded-r-lg text-xs ml-4 border-l-2';
                    
                    catHtml += `
                        <div class="${sfCls}" style="color:var(--tx-m); cursor:pointer; border-color:${isActiveSf ? m.color : 'transparent'}; transition:all 0.2s;" data-onclick="navigate('documents','${k}','${sf.replace(/'/g, "\\'")}')">
                            <i class="fa-regular fa-folder w-3 text-center opacity-50"></i>
                            <span class="truncate">${escHtml(sf)}</span>
                            <span class="count ml-auto" style="font-size:10px;">${sfCount}</span>
                        </div>
                    `;
                });
            }
        });
        
        if (typeof morphdom !== 'undefined') {
            morphdom(catNav, `<nav class="px-3 flex flex-col gap-0.5" id="cat-nav">${catHtml}</nav>`);
        } else {
            catNav.innerHTML = catHtml;
        }
    }

    const trashCount = documents.filter(d => d.status === 'deleted').length;
    const cntTrash = document.getElementById('cnt-trash');
    if (cntTrash) cntTrash.textContent = trashCount;
    
    document.getElementById('storage-info').textContent = activeDocs.length + ' documents saved locally';

    // Active state
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
        const v = n.dataset.view;
        const c = n.dataset.cat;
        if (v === state.view && (v === 'dashboard' || v === 'favorites' || c === state.category)) {
            n.classList.add('active');
        }
    });
}

// ========================
// HEADER
// ========================
function updateHeader() {
    const h = document.getElementById('app-header');
    let title = '', actions = '';

    if (state.view === 'dashboard') {
        title = `<h2 class="font-heading font-bold text-lg">${t('dashboard')}</h2>`;
        actions = `<button class="btn-s flex items-center justify-center h-[38px] gap-2" data-onclick="showSyncModal()"><i class="fa-solid fa-cloud-arrow-up text-xs"></i> Cloud Sync</button>
        <button class="btn-p flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> New Document</button>`;
    } else if (state.view === 'documents' || state.view === 'favorites') {
        const catLabel = state.category === 'all' ? 'All Documents' : (state.view === 'favorites' ? 'Favorites' : CAT_META[state.category]?.label + 's');
        title = `<h2 class="font-heading font-bold text-lg">${catLabel}</h2>`;
        actions = `<button class="btn-s flex items-center justify-center h-[38px] gap-2" data-onclick="showSyncModal()"><i class="fa-solid fa-cloud-arrow-up text-xs"></i> Cloud Sync</button>
        <button class="btn-p flex items-center justify-center h-[38px] gap-2" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus text-xs"></i> New Document</button>`;
    } else if (state.view === 'editor') {
        title = `<h2 class="font-heading font-bold text-lg">${state.editingDoc ? t('editDoc') : t('newDoc')}</h2>`;
        actions = `
            <button class="btn-s" data-onclick="cancelEdit()"><i class="fa-solid fa-xmark mr-1.5"></i>${t('cancel')}</button>
            <button class="btn-p" data-onclick="saveDoc()"><i class="fa-solid fa-check mr-1.5"></i>${t('save')}</button>
        `;
    } else if (state.view === 'viewer') {
        const doc = documents.find(d => d.id === state.editingDoc?.id);
        title = `<h2 class="font-heading font-bold text-lg truncate max-w-md" title="${doc ? escHtml(doc.title) : ''}">${doc ? escHtml(doc.title) : ''}</h2>`;
        actions = `
            <button class="btn-s" data-onclick="shareDoc('${doc ? doc.id : ''}')"><i class="fa-solid fa-share-nodes mr-1.5"></i>${t('share') || 'Share'}</button>
            <button class="btn-s" data-onclick="navigateBack()"><i class="fa-solid fa-arrow-left mr-1.5"></i>${t('back')}</button>
            <button class="btn-p" data-onclick="editDoc('${doc ? doc.id : ''}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
        `;
    }

    const isSearchView = state.view === 'documents' || state.view === 'favorites';
    h.innerHTML = `
        <button class="md:hidden mr-1 p-2 rounded-lg" style="color:var(--tx-m);" data-onclick="toggleSidebar()"><i class="fa-solid fa-bars"></i></button>
        ${title}
        <div class="flex-1"></div>
        ${isSearchView ? `
            <div class="search-w hidden sm:block" style="width:280px;">
                <i class="fa-solid fa-search"></i>
                <input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();">
            </div>
        ` : ''}
        <div class="flex items-center gap-2">
        <button class="btn-s flex items-center justify-center h-[38px] gap-1.5" data-onclick="openSearch()" title="Global Search (Ctrl+K)">
            <i class="fa-solid fa-magnifying-glass"></i> <span class="hidden sm:inline">Ctrl+K</span>
        </button>
        <button class="btn-s flex items-center justify-center h-[38px] gap-1.5" data-onclick="toggleLang()">
    <img src="${state.lang === 'vi' ? 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5MDAgNjAwIj48cmVjdCB3aWR0aD0iOTAwIiBoZWlnaHQ9IjYwMCIgZmlsbD0iI2RhMjUxZCIvPjxwb2x5Z29uIHBvaW50cz0iNDUwLDEyMCA1NDAsNDAwIDMwMCwyMjUgNjAwLDIyNSAzNjAsNDAwIiBmaWxsPSIjZmZjZDAwIi8+PC9zdmc+' : 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2MDAgNDAwIj48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjQwMCIgZmlsbD0iI2ZmZiIvPjxnIGZpbGw9IiNiZjBhMzAiPjxyZWN0IHk9IjAiIHdpZHRoPSI2MDAiIGhlaWdodD0iMzAuNyIvPjxyZWN0IHk9IjYxLjUiIHdpZHRoPSI2MDAiIGhlaWdodD0iMzAuNyIvPjxyZWN0IHk9IjEyMyIgd2lkdGg9IjYwMCIgaGVpZ2h0PSIzMC43Ii8+PHJlY3QgeT0iMTg0LjYiIHdpZHRoPSI2MDAiIGhlaWdodD0iMzAuNyIvPjxyZWN0IHk9IjI0NiIgd2lkdGg9IjYwMCIgaGVpZ2h0PSIzMC43Ii8+PHJlY3QgeT0iMzA3LjYiIHdpZHRoPSI2MDAiIGhlaWdodD0iMzAuNyIvPjxyZWN0IHk9IjM2OS4yIiB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwLjciLz48L2c+PHJlY3Qgd2lkdGg9IjI0MCIgaGVpZ2h0PSIyMTUiIGZpbGw9IiMwMDI4NjgiLz48L3N2Zz4='}" style="width:18px;height:14px;object-fit:cover;border-radius:2px;">
    <span>${state.lang === 'vi' ? 'VN' : 'EN'}</span>
</button>
        ${actions}
</div>
    `;
}

// ========================
// NAVIGATION
// ========================
window.pushHistory = function() {
    if (!state.history) state.history = [];
    const last = state.history[state.history.length - 1];
    const current = {
        view: state.view,
        category: state.category,
        subfolder: state.subfolder || '',
        docId: state.editingDoc?.id || null
    };
    
    // Only push if something actually changed
    if (!last || last.view !== current.view || last.category !== current.category || last.subfolder !== current.subfolder || last.docId !== current.docId) {
        state.history.push(current);
        if (state.history.length > 20) state.history.shift(); // Keep max 20 history items
    }
};

window.navigateBack = function() {
    if (state.history && state.history.length > 0) {
        const prev = state.history.pop();
        state.view = prev.view;
        state.category = prev.category;
        state.subfolder = prev.subfolder;
        state.search = '';
        state.statusFilter = 'all';
        
        if (prev.docId) {
            const doc = documents.find(d => d.id === prev.docId);
            if (doc) {
                state.editingDoc = { ...doc };
                state.editorTags = [...doc.tags];
            } else {
                state.editingDoc = null;
            }
        } else {
            state.editingDoc = null;
        }
        render();
    } else {
        // Fallback
        if (state.view === 'editor' || state.view === 'viewer') {
            navigate('documents', state.category);
        } else {
            navigate('dashboard');
        }
    }
};

window.navigate = function(view, cat, subfolder = '') {
    if (state.view === 'editor') syncEditorState();
    pushHistory();
    state.view = view;
    if (cat !== undefined) state.category = cat;
    if (view === 'favorites') state.category = 'all';
    state.subfolder = subfolder;
    state.search = '';
    state.statusFilter = 'all';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    if (state.sidebarOpen) toggleSidebar();
    render();
}

// ========================
// GET FILTERED DOCS
// ========================
function getFiltered() {
    let docs = [...documents];
    if (state.view === 'trash') {
        docs = docs.filter(d => d.status === 'deleted');
    } else {
        docs = docs.filter(d => d.status !== 'deleted');
        if (state.view === 'favorites') docs = docs.filter(d => d.favorite);
        else if (state.category !== 'all') {
            docs = docs.filter(d => d.category === state.category);
            if (state.subfolder) docs = docs.filter(d => d.subfolder === state.subfolder);
        }
    }
    if (state.search) {
        const q = state.search.toLowerCase();
        docs = docs.filter(d => d.title.toLowerCase().includes(q) || (d.content && d.content.toLowerCase().includes(q)) || d.tags.some(t => t.toLowerCase().includes(q)));
    }
    if (state.statusFilter !== 'all') docs = docs.filter(d => d.status === state.statusFilter);
    docs.sort((a, b) => {
        if (state.sortBy === 'updated') return b.updatedAt - a.updatedAt;
        if (state.sortBy === 'created') return b.createdAt - a.createdAt;
        if (state.sortBy === 'title') return a.title.localeCompare(b.title);
        return 0;
    });
    return docs;
}

// ========================
// RENDER CONTENT
// ========================
window.syncEditorState = function() {
    if (state.view !== 'editor') return;
    
    // Do not sync if the editor DOM is not actually loaded yet (prevents wiping state on initial render)
    const titleEl = document.getElementById('ed-title');
    if (!titleEl) return;
    
    const title = titleEl.value || '';
    const cat = document.getElementById('ed-cat')?.value || 'runbook';
    const subfolder = document.getElementById('ed-subfolder')?.value || '';
    const status = document.getElementById('ed-status')?.value || 'draft';
    const content = window.tuiEditor ? window.tuiEditor.getMarkdown() : '';
    
    let bugData = null;
    let tcData = null;
    let apiData = null;
    if (cat === 'bug') {
        bugData = {
            env: document.getElementById('ed-bug-env')?.value || '',
            browser: document.getElementById('ed-bug-browser')?.value || '',
            severity: document.getElementById('ed-bug-severity')?.value || 'Minor',
            precond: document.getElementById('ed-bug-precond')?.value || '',
            steps: Array.from(document.querySelectorAll('.bug-step-input')).map(inp => inp.value),
            expected: document.getElementById('ed-bug-expected')?.value || '',
            actual: document.getElementById('ed-bug-actual')?.value || ''
        };
    } else if (cat === 'testcases') {
        tcData = {
            module: document.getElementById('ed-tc-module')?.value || '',
            precond: document.getElementById('ed-tc-precond')?.value || '',
            data: document.getElementById('ed-tc-data')?.value || '',
            steps: Array.from(document.querySelectorAll('.tc-step-row')).map(row => ({
                action: row.querySelector('.tc-step-action')?.value || '',
                expected: row.querySelector('.tc-step-expected')?.value || ''
            }))
        };
    } else if (cat === 'api') {
        apiData = {
            method: document.getElementById('ed-api-method')?.value || 'GET',
            endpoint: document.getElementById('ed-api-endpoint')?.value || '',
            headers: Array.from(document.querySelectorAll('.api-header-row')).map(row => ({
                key: row.querySelector('.api-key')?.value || '',
                value: row.querySelector('.api-value')?.value || '',
                req: row.querySelector('.api-req')?.checked || false
            })),
            params: Array.from(document.querySelectorAll('.api-param-row')).map(row => ({
                key: row.querySelector('.api-key')?.value || '',
                value: row.querySelector('.api-value')?.value || '',
                req: row.querySelector('.api-req')?.checked || false
            })),
            body: document.getElementById('ed-api-body')?.value || '',
            response: document.getElementById('ed-api-response')?.value || ''
        };
    }

    if (state.editingDoc) {
        state.editingDoc.title = title;
        state.editingDoc.subfolder = subfolder;
        state.editingDoc.category = cat;
        state.editingDoc.status = status;
        if (window.tuiEditor || document.getElementById('ed-content-hidden')) state.editingDoc.content = content;
        if (cat === 'bug') state.editingDoc.bugData = bugData;
        if (cat === 'testcases') state.editingDoc.tcData = tcData;
        if (cat === 'api') state.editingDoc.apiData = apiData;
    } else {
        state._newTitle = title;
        state._newSubfolder = subfolder;
        state._newCat = cat;
        state._newStatus = status;
        if (window.tuiEditor || document.getElementById('ed-content-hidden')) state._newContent = content;
        state._newBugData = bugData;
        state._newTcData = tcData;
        state._newApiData = apiData;
    }
}

function updateDOM(el, htmlStr) {
    if (typeof morphdom !== 'undefined') {
        morphdom(el, `<div id="${el.id}" class="${el.className}">${htmlStr}</div>`, {
            onBeforeElUpdated: function(fromEl, toEl) {
                if (fromEl.id === 'editor-container' || fromEl.id === 'viewer-container') {
                    return false;
                }
                return true;
            }
        });
    } else {
        el.innerHTML = htmlStr;
    }
}

function renderContent() {
    if (state.view === 'editor') syncEditorState();
    
    const c = document.getElementById('content');
    if (state.view === 'dashboard') updateDOM(c, renderDashboard());
    else if (state.view === 'documents' || state.view === 'favorites' || state.view === 'trash') updateDOM(c, renderDocList());
    else if (state.view === 'editor') {
        // Always recreate editor completely to avoid state issues
        c.innerHTML = renderEditor();
        window.tuiEditor = null;
        const container = document.getElementById('editor-container');
        if (container) {
            const hiddenTa = document.getElementById('ed-content-hidden');
            const initialVal = hiddenTa ? hiddenTa.value : '';
            window.tuiEditor = new toastui.Editor({
                el: container,
                height: 'calc(100vh - 300px)',
                initialEditType: 'markdown',
                previewStyle: 'vertical',
                initialValue: initialVal,
                theme: 'dark',
                hooks: {
                    addImageBlobHook: uploadImageToCloud
                }
            });
        }
    }
    else if (state.view === 'viewer') {
        const isSameDoc = window.currentViewerDocId === state.editingDoc?.id;
        if (isSameDoc) {
            updateDOM(c, renderViewer());
        } else {
            c.innerHTML = renderViewer();
            window.currentViewerDocId = state.editingDoc?.id;
            
            const container = document.getElementById('viewer-container');
            if (container) {
                const hiddenTa = document.getElementById('vw-content-hidden');
                const initialVal = hiddenTa ? hiddenTa.value : '';
                window.tuiViewer = toastui.Editor.factory({
                    el: container,
                    viewer: true,
                    initialValue: initialVal,
                    theme: 'dark'
                });
                
                // Inject copy buttons into code blocks
                setTimeout(() => {
                    container.querySelectorAll('pre').forEach(pre => {
                        pre.style.position = 'relative';
                        const codeEl = pre.querySelector('code');
                        const textToCopy = codeEl ? codeEl.innerText : pre.innerText;
                        
                        const btn = document.createElement('button');
                        btn.className = 'code-copy-btn';
                        btn.title = 'Copy';
                        btn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                        btn.onclick = function(e) {
                            e.stopPropagation();
                            navigator.clipboard.writeText(textToCopy).then(() => {
                                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
                                setTimeout(() => btn.innerHTML = '<i class="fa-regular fa-copy"></i>', 2000);
                            });
                        };
                        pre.appendChild(btn);
                    });
                }, 100);
            }
        }
    }
}

function render() {
    updateSidebar();
    updateHeader();
    renderContent();
}

// ========================
// DASHBOARD
// ========================
function renderDashboard() {
    const total = documents.length;
    const favs = documents.filter(d => d.favorite).length;
    const recent = [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);
    const catCounts = {};
    Object.keys(CAT_META).forEach(k => catCounts[k] = documents.filter(d => d.category === k).length);

    return `<div class="fade-up max-w-6xl mx-auto">
        <!-- Stats -->
        <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div class="stat-card sc-total p-4">
                <p class="text-xs font-medium mb-1" style="color:var(--tx-d);">Total</p>
                <p class="font-heading font-bold text-2xl" style="color:var(--acc);">${total}</p>
                <p class="text-[11px] mt-1" style="color:var(--tx-d);">documents</p>
            </div>
            ${Object.entries(CAT_META).map(([k, m]) => `
                <div class="stat-card sc-${{runbook:'run',testcases:'tc',knowledge:'kn',task:'task',bug:'bug',testplan:'tp',api:'api',credential:'cred',environment:'env',testrun:'testrun'}[k]} p-4">
                    <p class="text-xs font-medium mb-1" style="color:var(--tx-d);">${m.label}</p>
                    <p class="font-heading font-bold text-2xl" style="color:${m.color};">${catCounts[k]}</p>
                    <p class="text-[11px] mt-1" style="color:var(--tx-d);">documents</p>
                </div>
            `).join('')}
        </div>

        <div class="grid lg:grid-cols-3 gap-6">
            <!-- Recent -->
            <div class="lg:col-span-2">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="font-heading font-semibold text-base">${t('recentlyUpdated')}</h3>
                    <button class="text-xs font-medium" style="color:var(--acc);" data-onclick="navigate('documents','all')">${t('viewAll')} <i class="fa-solid fa-arrow-right ml-1 text-[10px]"></i></button>
                </div>
                <div class="flex flex-col gap-2.5">
                    ${recent.length === 0 ? `<div class="text-center py-10" style="color:var(--tx-d);"><i class="fa-solid fa-inbox text-3xl mb-3 pulse-s block"></i><p class="text-sm">${t('noDocYet')}</p></div>` :
                    recent.map(d => `
                        <div class="doc-card p-4 flex items-start gap-3" data-onclick="viewDoc('${d.id}')">
                            <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style="background:${CAT_META[d.category].color}12;">
                                <i class="fa-solid ${CAT_META[d.category].icon} text-xs" style="color:${CAT_META[d.category].color};"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <p class="text-sm font-semibold truncate" style="color:var(--tx);">${escHtml(d.title)}</p>
                                <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <span class="cat-badge ${CAT_META[d.category].cls}">${CAT_META[d.category].label}</span>
                                    <span class="st-badge st-${d.status}">${d.status}</span>
                                    <span class="text-[11px]" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                                </div>
                            </div>
                            <button class="fav-btn ${d.favorite ? 'on' : ''} text-sm p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Quick Actions + Favorites -->
            <div class="flex flex-col gap-6">
                <div>
                    <h3 class="font-heading font-semibold text-base mb-4">Quick Actions</h3>
                    <div class="grid grid-cols-2 gap-2.5">
                        ${Object.entries(CAT_META).map(([k, m]) => `
                            <button class="tpl-card text-center py-4" data-onclick="createDoc('${k}')">
                                <i class="fa-solid ${m.icon} text-lg mb-2 block" style="color:${m.color};"></i>
                                <p class="text-xs font-semibold" style="color:var(--tx);">${m.label}</p>
                            </button>
                        `).join('')}
                    </div>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="font-heading font-semibold text-base">${t('favorites')}</h3>
                        <button class="text-xs font-medium" style="color:var(--acc);" data-onclick="navigate('favorites')">${t('viewAll')}</button>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${favs === 0 ? `<p class="text-xs text-center py-4" style="color:var(--tx-d);">${t('noFavorites')}</p>` :
                        documents.filter(d => d.favorite).slice(0, 4).map(d => `
                            <div class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg cursor-pointer" style="transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="viewDoc('${d.id}')">
                                <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:${CAT_META[d.category].color};"></span>
                                <span class="text-xs truncate" style="color:var(--tx-m);">${escHtml(d.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// ========================
// DOCUMENT LIST
// ========================
function renderDocList() {
    const docs = getFiltered();
    const isMobileSearch = state.view === 'documents' || state.view === 'favorites';

    if (state.category === 'task') {
        return renderKanbanBoard(docs, isMobileSearch);
    }

    return `<div class="fade-up max-w-6xl mx-auto">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchDocs')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();"></div>` : ''}

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-5">
            <select class="form-select text-sm" style="width:auto;min-width:130px;" data-onchange="state.statusFilter=this.value;renderContent();">
                <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>${t('allStatus')}</option>
                <option value="published" ${state.statusFilter === 'published' ? 'selected' : ''}>Published</option>
                <option value="draft" ${state.statusFilter === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="archived" ${state.statusFilter === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
            <select class="form-select text-sm" style="width:auto;min-width:140px;" data-onchange="state.sortBy=this.value;renderContent();">
                <option value="updated" ${state.sortBy === 'updated' ? 'selected' : ''}>${t('recentlyUpdated')}</option>
                <option value="created" ${state.sortBy === 'created' ? 'selected' : ''}>${t('newest')}</option>
                <option value="title" ${state.sortBy === 'title' ? 'selected' : ''}>${t('sortAZ')}</option>
            </select>
            <span class="text-xs ml-auto" style="color:var(--tx-d);">${docs.length} documents</span>
            ${state.view === 'trash' && docs.length > 0 ? `<button class="btn-d text-xs py-1 px-2.5 ml-3" data-onclick="showEmptyTrashModal()"><i class="fa-solid fa-trash-can mr-1.5"></i>${t('emptyTrash') || 'Empty Trash'}</button>` : ''}
        </div>

        <!-- Grid -->
        ${docs.length === 0 ? `
            <div class="text-center py-20">
                <i class="fa-solid ${state.view === 'trash' ? 'fa-trash' : 'fa-folder-open'} text-4xl mb-4 pulse-s block" style="color:var(--tx-d);"></i>
                <p class="text-sm font-medium mb-1" style="color:var(--tx-m);">${state.search ? t('noDocFound') : (state.view === 'trash' ? (t('trashEmpty') || 'Trash is empty') : t('noDocYet'))}</p>
                <p class="text-xs mb-5" style="color:var(--tx-d);">${state.search ? t('tryDiffKey') : (state.view === 'trash' ? '' : t('createFirstDoc'))}</p>
                ${!state.search && state.view !== 'trash' ? `<button class="btn-p text-sm" data-onclick="showTemplateModal()"><i class="fa-solid fa-plus mr-1.5"></i>${t('newDoc')}</button>` : ''}
            </div>
        ` : `
            <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                ${docs.map(d => {
                    if (d.category === 'credential') {
                        const domain = guessDomain(d.title);
                        const favUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;
                        return `
                        <div class="doc-card p-4 flex flex-col" data-onclick="viewDoc('${d.id}')">
                            <div class="flex items-start justify-between mb-3">
                                <div class="flex items-center gap-3">
                                    <div class="cred-avatar ${credAvatarColor(d.title)}">
                                        <img class="cred-favicon" src="${favUrl}" alt="" onload="this.classList.add('loaded'); this.nextElementSibling.style.display='none'; this.parentElement.classList.add('has-favicon');" onerror="this.remove()">
                                        <span>${escHtml(d.title.charAt(0).toUpperCase())}</span>
                                    </div>
                                    <div class="min-w-0">
                                        <h4 class="text-sm font-semibold leading-snug truncate" style="color:var(--tx);">${escHtml(d.title)}</h4>
                                        ${d.username ? `<p class="text-[11px] truncate mt-0.5" style="color:var(--tx-m);">${escHtml(d.username)}</p>` : ''}
                                    </div>
                                </div>
                                <div class="flex items-center gap-1 shrink-0 ml-2">
                                    <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                        <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                    </button>
                                    <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                        <i class="fa-solid fa-ellipsis-vertical"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-auto flex items-center justify-between border-t" style="border-color:var(--brd); padding-top: 16px;">
                                <span class="cat-badge cat-credential">${t('credential')}</span>
                                <button class="text-xs p-1.5 rounded flex items-center gap-1.5" style="color:var(--tx-m);transition:all .15s;" data-onmouseenter="this.style.color='var(--tx)';this.style.background='var(--card-h)'" data-onmouseleave="this.style.color='var(--tx-m)';this.style.background='transparent'" data-onclick="event.stopPropagation();copyPassword('${d.id}', this)"><i class="fa-solid fa-copy"></i> ${t('copyPassword')}</button>
                            </div>
                        </div>`;
                    }
                    return `
                    <div class="doc-card p-4 flex flex-col" data-onclick="viewDoc('${d.id}')">
                        <div class="flex items-start justify-between mb-2.5">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="cat-badge ${CAT_META[d.category].cls}">${CAT_META[d.category].label}</span>
                                ${d.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(d.subfolder)}</span>` : ''}
                                <span class="st-badge st-${d.status}">${d.status}</span>
                            </div>
                            <div class="flex items-center gap-1 shrink-0 ml-2">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>
                        <h4 class="text-sm font-semibold mb-1.5 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>
                        <p class="text-xs leading-relaxed flex-1 mb-3" style="color:var(--tx-d);">${excerpt(d.content, 100)}</p>
                        <div class="flex items-center gap-1.5 flex-wrap mb-3">
                            ${d.tags.slice(0, 3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
                            ${d.tags.length > 3 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 3}</span>` : ''}
                        </div>
                        <p class="text-[11px]" style="color:var(--tx-d);"><i class="fa-regular fa-clock mr-1"></i>${fmtDate(d.updatedAt)}</p>
                    </div>
                `;}).join('')}
            </div>
        `}
    </div>`;
}

async function shareDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    
    showModal(`
        <div class="text-center">
            <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.1);">
                <i class="fa-solid fa-spinner fa-spin text-emerald-400"></i>
            </div>
            <h3 class="font-heading font-semibold text-lg mb-2">${t('generatingLink') || 'Generating Secure Link...'}</h3>
            <p class="text-sm mb-6" style="color:var(--tx-m);">${t('pleaseWait') || 'Please wait while we encrypt your document.'}</p>
        </div>
    `);

    try {
        const apiKey = localStorage.getItem('e2ee_api_key') || '$2a$10$taCC8A46/1HYhSkqCEPyJejJ8iJrKyCRBy7xfzBECpMLJWshJ5P9u';
        
        // 1. Generate random key
        const randomKey = CryptoJS.lib.WordArray.random(16).toString();
        
        // 2. Encrypt document
        const encryptedData = CryptoJS.AES.encrypt(JSON.stringify(doc), randomKey).toString();
        
        // 3. Post to JSONBin
        const response = await fetch('https://api.jsonbin.io/v3/b', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': apiKey,
                'X-Bin-Private': 'false'
            },
            body: JSON.stringify({ data: encryptedData })
        });
        
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Failed to create bin');
        
        const binId = result.metadata.id;
        
        // 4. Generate URL
        const url = new URL(window.location.href);
        url.search = '?shareId=' + binId;
        url.hash = 'key=' + randomKey;
        
        showModal(`
            <div class="text-center">
                <div class="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style="background:rgba(16,185,129,0.1);">
                    <i class="fa-solid fa-check text-emerald-400"></i>
                </div>
                <h3 class="font-heading font-semibold text-lg mb-2">${t('linkReady') || 'Link Ready!'}</h3>
                <p class="text-sm mb-4" style="color:var(--tx-m);">${t('linkDesc') || 'Anyone with this link can view the document. It is encrypted with a unique key.'}</p>
                <div class="bg-black/20 p-3 rounded border mb-6 flex items-center gap-2" style="border-color:var(--brd);">
                    <input type="text" readonly value="${url.href}" class="w-full bg-transparent text-sm" style="color:var(--tx);outline:none;" id="share-link-input">
                    <button class="shrink-0 p-2 rounded hover:bg-white/5" onclick="navigator.clipboard.writeText(document.getElementById('share-link-input').value);toast('${t('copied') || 'Copied'}', 'success')">
                        <i class="fa-regular fa-copy"></i>
                    </button>
                </div>
                <button class="btn-d" style="background:var(--card);color:var(--tx);" data-onclick="closeModal()">${t('close') || 'Close'}</button>
            </div>
        `);
    } catch (e) {
        console.error(e);
        toast('Failed to share: ' + e.message, 'error');
        closeModal();
    }
}

// Document context menu (dropdown)
function showDocMenu(id, btn) {
    // Xóa menu cũ nếu có
    const old = document.getElementById('doc-menu');
    if (old) old.remove();

    const rect = btn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'doc-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom + 4}px;right:${window.innerWidth - rect.right}px;background:var(--bg2);border:1px solid var(--brd);border-radius:8px;padding:4px;z-index:80;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,0.4);`;
    let menuHtml = '';
    if (state.view === 'trash') {
        menuHtml = `
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--acc);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();restoreDoc('${id}')">
                <i class="fa-solid fa-rotate-left w-4 text-center"></i> ${t('restore') || 'Restore'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#f43f5e;transition:background .15s;" data-onmouseenter="this.style.background='rgba(244,63,94,0.06)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}', true)">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('deleteForever') || 'Delete Forever'} </button>
        `;
    } else {
        menuHtml = `
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--c-run);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();shareDoc('${id}')">
                <i class="fa-solid fa-share-nodes w-4 text-center"></i> ${t('share') || 'Share Link'} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();editDoc('${id}')">
                <i class="fa-solid fa-pen w-4 text-center"></i> ${t('edit')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:var(--tx-m);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();duplicateDoc('${id}')">
                <i class="fa-solid fa-copy w-4 text-center"></i> ${t('duplicate')} </button>
            <button class="w-full text-left text-xs px-3 py-2 rounded-md flex items-center gap-2" style="color:#f43f5e;transition:background .15s;" data-onmouseenter="this.style.background='rgba(244,63,94,0.06)'" data-onmouseleave="this.style.background='transparent'" data-onclick="document.getElementById('doc-menu').remove();showDeleteModal('${id}')">
                <i class="fa-solid fa-trash w-4 text-center"></i> ${t('delete')} </button>
        `;
    }
    menu.innerHTML = menuHtml;
    document.body.appendChild(menu);
    // Đóng khi click ngoài
    setTimeout(() => {
        const close = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); } };
        document.addEventListener('click', close);
    }, 10);
}

// ========================
// IMAGE UPLOAD (FreeImage.host)
// ========================
async function uploadImageToCloud(blob, callback) {
    toast("Uploading image to Cloud...", "info");
    const formData = new FormData();
    // Public API Key for FreeImage.host
    formData.append("key", "6d207e02198a847aa98d0a2a901485a5");
    formData.append("source", blob);
    formData.append("format", "json");

    try {
        const res = await fetch("https://freeimage.host/api/1/upload", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (data && data.status_code === 200) {
            callback(data.image.url, data.image.name || 'image');
            toast("Image uploaded successfully!", "success");
        } else {
            throw new Error(data?.error?.message || "Upload failed");
        }
    } catch (err) {
        console.error("Image Upload Error:", err);
        toast("Failed to upload image. Please try again.", "error");
    }
}

// ========================
// EDITOR
// ========================
function renderEditor() {
    const doc = state.editingDoc;
    const isEdit = !!doc;
    const title = isEdit ? doc.title : (state._newTitle || '');
    const category = isEdit ? doc.category : (state._newCat || 'runbook');
    const status = isEdit ? doc.status : (state._newStatus || 'draft');
    const content = isEdit ? doc.content : (state._newContent || '');
    const tags = isEdit ? doc.tags : state.editorTags;
    const bugData = isEdit ? doc.bugData : state._newBugData;
    const tcData = isEdit ? doc.tcData : state._newTcData;
    const apiData = isEdit ? doc.apiData : state._newApiData;

    const subfolder = isEdit ? (doc.subfolder || '') : (state._newSubfolder || '');
    const existingFolders = [...new Set(documents.filter(d => d.subfolder).map(d => d.subfolder))];

    return `<div class="fade-up max-w-4xl mx-auto">
        
        <div class="grid md:grid-cols-3 gap-4 mb-4">
            <div class="md:col-span-2 grid sm:grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${category === 'credential' ? 'Service Name' : 'Title'}</label>
                    <input id="ed-title" class="form-input" placeholder="${category === 'credential' ? t('egCred') : t('enterTitle')}" value="${escHtml(title)}">
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Sub-folder <span style="color:var(--tx-d)">(Optional)</span></label>
                    <input id="ed-subfolder" list="folder-list" class="form-input" placeholder="e.g. ProjectA/Backend" value="${escHtml(subfolder)}">
                    <datalist id="folder-list">
                        ${existingFolders.map(f => `<option value="${escHtml(f)}"></option>`).join('')}
                    </datalist>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Category</label>
                    <select id="ed-cat" class="form-select w-full" data-onchange="changeEditorCat(this.value)">
                        ${Object.entries(CAT_META).map(([k, m]) => `<option value="${k}" ${category === k ? 'selected' : ''}>${m.label}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Status</label>
                    <select id="ed-status" class="form-select w-full">
                        <option value="draft" ${status === 'draft' ? 'selected' : ''}>Draft</option>
                        <option value="published" ${status === 'published' ? 'selected' : ''}>Published</option>
                        <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archived</option>
                    </select>
                </div>
            </div>
        </div>

        <!-- Tags -->
        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Tags</label>
            <div class="flex flex-wrap items-center gap-2 p-2.5 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);min-height:42px;" id="tag-container" data-onclick="document.getElementById('tag-input').focus()">
                ${tags.map((t, i) => `<span class="tag">${escHtml(t)}<span class="rm" data-onclick="event.stopPropagation();removeTag(${i})">&times;</span></span>`).join('')}
                <input id="tag-input" class="bg-transparent border-none outline-none text-sm flex-1 min-w-[100px]" style="color:var(--tx);" placeholder="${tags.length === 0 ? t('enterTag') : ''}" data-onkeydown="handleTagInput(event)">
            </div>
        </div>

        ${category === 'credential' ? `
        <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Username / Email</label>
                <input id="ed-username" class="form-input" placeholder="e.g. admin" value="${escHtml(doc?.username || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Password</label>
                <div class="flex items-center gap-2">
                    <input type="password" id="ed-password" class="form-input" placeholder="••••••••" value="${escHtml(doc?.password || '')}">
                    <button id="ed-password-btn" class="btn-s px-3 py-2" data-onclick="togglePasswordVisibility('ed-password')"><i class="fa-solid fa-eye"></i></button>
                </div>
            </div>
        </div>
        ` : category === 'bug' ? `
        <div class="grid sm:grid-cols-3 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugEnv')}</label>
                <input id="ed-bug-env" class="form-input" placeholder="${t('bugEnvPl')}" value="${escHtml(bugData?.env || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugDevice')}</label>
                <input id="ed-bug-browser" class="form-input" placeholder="${t('bugDevicePl')}" value="${escHtml(bugData?.browser || '')}">
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugSeverity')}</label>
                <select id="ed-bug-severity" class="form-select w-full">
                    <option value="Critical" ${bugData?.severity === 'Critical' ? 'selected' : ''}>Critical</option>
                    <option value="Major" ${bugData?.severity === 'Major' ? 'selected' : ''}>Major</option>
                    <option value="Minor" ${bugData?.severity === 'Minor' ? 'selected' : (!bugData ? 'selected' : '')}>Minor</option>
                    <option value="Trivial" ${bugData?.severity === 'Trivial' ? 'selected' : ''}>Trivial</option>
                </select>
            </div>
        </div>
        
        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugPrecond')}</label>
            <textarea id="ed-bug-precond" class="form-input" style="height:60px;" placeholder="${t('bugPrecondPl')}">${escHtml(bugData?.precond || '')}</textarea>
        </div>
        
        <div class="mb-4">
            <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugSteps')}</label>
            <div id="bug-steps-container">
                ${(Array.isArray(bugData?.steps) ? bugData.steps : (bugData?.steps ? [bugData.steps] : [''])).map((step, idx) => `
                    <div class="flex items-center gap-2 mb-2 bug-step-row">
                        <span class="text-xs font-semibold step-idx" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
                        <input class="form-input flex-1 bug-step-input" placeholder="Step ${idx + 1}..." value="${escHtml(step)}">
                        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)"><i class="fa-solid fa-trash"></i></button>
                    </div>
                `).join('')}
            </div>
            <button class="btn-s text-xs mt-1" data-onclick="addBugStep()"><i class="fa-solid fa-plus mr-1"></i> Add Step</button>
        </div>
        
        <div class="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugExpected')}</label>
                <textarea id="ed-bug-expected" class="form-input" style="height:100px;" placeholder="${t('bugExpectedPl')}">${escHtml(bugData?.expected || '')}</textarea>
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('bugActual')}</label>
                <textarea id="ed-bug-actual" class="form-input" style="height:100px;" placeholder="${t('bugActualPl')}">${escHtml(bugData?.actual || '')}</textarea>
            </div>
        </div>
        ` : category === 'testcases' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-3 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcModule')}</label>
                    <input id="ed-tc-module" class="form-input" placeholder="${t('tcModulePl')}" value="${escHtml(tcData?.module || '')}">
                </div>
                <div class="sm:col-span-2">
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcData')}</label>
                    <input id="ed-tc-data" class="form-input" placeholder="${t('tcDataPl')}" value="${escHtml(tcData?.data || '')}">
                </div>
            </div>
            
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('tcPrecond')}</label>
                <textarea id="ed-tc-precond" class="form-input" style="height:60px;" placeholder="${t('tcPrecondPl')}">${escHtml(tcData?.precond || '')}</textarea>
            </div>
            
            <div class="mb-4">
                <div class="flex items-center justify-between mb-2">
                    <label class="text-xs font-medium block" style="color:var(--tx-m);">${t('tcSteps')}</label>
                    <div class="flex items-center gap-2" style="width: calc(100% - 30px);">
                        <span class="text-xs font-medium flex-1 text-center" style="color:var(--tx-d);">${t('tcAction')}</span>
                        <span class="text-xs font-medium flex-1 text-center" style="color:var(--tx-d);">${t('tcExpected')}</span>
                    </div>
                </div>
                <div id="tc-steps-container">
                    ${(tcData?.steps?.length ? tcData.steps : [{action: '', expected: ''}]).map((step, idx) => `
                        <div class="flex items-start gap-2 mb-2 tc-step-row">
                            <span class="text-xs font-semibold step-idx mt-2" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
                            <textarea class="form-input flex-1 tc-step-action" style="height:60px;" placeholder="${t('tcActionPl')}">${escHtml(step.action || '')}</textarea>
                            <textarea class="form-input flex-1 tc-step-expected" style="height:60px;" placeholder="${t('tcExpectedPl')}">${escHtml(step.expected || '')}</textarea>
                            <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-s text-sm mt-2" data-onclick="addTcStep()"><i class="fa-solid fa-plus mr-1"></i> Add Step</button>
            </div>
        </div>
        ` : category === 'environment' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Health Status</label>
                    <select id="ed-env-status" class="form-select w-full text-sm">
                        <option value="healthy" ${envData?.status === 'healthy' ? 'selected' : ''}>🟢 Healthy (Up & Running)</option>
                        <option value="maintenance" ${envData?.status === 'maintenance' ? 'selected' : ''}>🟡 Maintenance</option>
                        <option value="down" ${envData?.status === 'down' ? 'selected' : ''}>🔴 Down (Offline)</option>
                    </select>
                </div>
            </div>
            <div class="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Frontend URL</label>
                    <input id="ed-env-fe" class="form-input text-sm w-full font-mono" placeholder="https://stg.app.com" value="${escHtml(envData?.frontendUrl || '')}">
                </div>
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Backend API URL</label>
                    <input id="ed-env-be" class="form-input text-sm w-full font-mono" placeholder="https://api-stg.app.com" value="${escHtml(envData?.backendUrl || '')}">
                </div>
            </div>
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Database Connection String</label>
                <input id="ed-env-db" class="form-input text-sm w-full font-mono" placeholder="mongodb://user:pass@host:27017/db" value="${escHtml(envData?.dbInfo || '')}">
            </div>
            <div class="mb-4">
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Linked Credentials</label>
                <div class="p-3 rounded-lg flex flex-col gap-2 max-h-40 overflow-y-auto custom-scrollbar" style="background:var(--card); border:1px solid var(--brd);">
                    ${documents.filter(d => d.category === 'credential').map(c => `
                        <label class="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" class="ed-env-cred rounded border-gray-600 text-emerald-500 focus:ring-emerald-500 bg-transparent" value="${c.id}" ${(envData?.linkedCreds || []).includes(c.id) ? 'checked' : ''}>
                            <span class="text-sm font-medium" style="color:var(--tx);">${escHtml(c.title)}</span>
                        </label>
                    `).join('') || `<div class="text-xs text-center py-2" style="color:var(--tx-d);">No credentials found</div>`}
                </div>
            </div>
            <div>
                <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">Notes</label>
                <textarea id="ed-env-notes" class="form-input text-sm w-full" style="height:80px;" placeholder="Add any specific notes for this environment...">${escHtml(envData?.notes || '')}</textarea>
            </div>
        </div>
        ` : category === 'api' ? `
        <div class="p-4 rounded-xl mb-4" style="background:var(--bg2); border:1px solid var(--brd);">
            <div class="grid sm:grid-cols-4 gap-4 mb-4">
                <div>
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('apiMethod')}</label>
                    <select id="ed-api-method" class="form-select w-full font-mono text-sm">
                        ${['GET','POST','PUT','PATCH','DELETE'].map(m => `<option value="${m}" ${apiData?.method===m ? 'selected' : ''}>${m}</option>`).join('')}
                    </select>
                </div>
                <div class="sm:col-span-3">
                    <label class="text-xs font-medium block mb-1.5" style="color:var(--tx-m);">${t('apiEndpoint')}</label>
                    <input id="ed-api-endpoint" class="form-input font-mono text-sm w-full" placeholder="/api/v1/users" value="${escHtml(apiData?.endpoint || '')}">
                </div>
            </div>

            <div class="grid sm:grid-cols-2 gap-6 mb-4">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-medium block" style="color:var(--tx-m);">${t('apiHeaders')}</label>
                    </div>
                    <div id="api-headers-container">
                        ${(apiData?.headers?.length ? apiData.headers : []).map(h => `
                            <div class="flex items-center gap-2 mb-2 api-header-row">
                                <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}" value="${escHtml(h.key)}">
                                <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}" value="${escHtml(h.value)}">
                                <div class="flex items-center gap-1">
                                    <input type="checkbox" class="api-req" title="${t('apiRequired')}" ${h.req ? 'checked' : ''}>
                                    <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)"><i class="fa-solid fa-xmark"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-s text-xs mt-1" data-onclick="addApiHeader()"><i class="fa-solid fa-plus mr-1"></i> Add Header</button>
                </div>
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <label class="text-xs font-medium block" style="color:var(--tx-m);">${t('apiParams')}</label>
                    </div>
                    <div id="api-params-container">
                        ${(apiData?.params?.length ? apiData.params : []).map(p => `
                            <div class="flex items-center gap-2 mb-2 api-param-row">
                                <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}" value="${escHtml(p.key)}">
                                <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}" value="${escHtml(p.value)}">
                                <div class="flex items-center gap-1">
                                    <input type="checkbox" class="api-req" title="${t('apiRequired')}" ${p.req ? 'checked' : ''}>
                                    <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)"><i class="fa-solid fa-xmark"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <button class="btn-s text-xs mt-1" data-onclick="addApiParam()"><i class="fa-solid fa-plus mr-1"></i> Add Param</button>
                </div>
            </div>

            <div class="grid sm:grid-cols-2 gap-6 mb-2">
                <div>
                    <label class="text-xs font-medium flex items-center justify-between mb-1.5" style="color:var(--tx-m);">
                        <span>${t('apiBody')}</span>
                        <button class="text-[10px] opacity-70 hover:opacity-100 transition-opacity" data-onclick="formatJson('ed-api-body')" title="Format JSON"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Format</button>
                    </label>
                    <textarea id="ed-api-body" class="form-input font-mono text-xs w-full" style="height:120px;" placeholder="{\n  &quot;key&quot;: &quot;value&quot;\n}">${escHtml(apiData?.body || '')}</textarea>
                </div>
                <div>
                    <label class="text-xs font-medium flex items-center justify-between mb-1.5" style="color:var(--tx-m);">
                        <span>${t('apiResponse')}</span>
                        <button class="text-[10px] opacity-70 hover:opacity-100 transition-opacity" data-onclick="formatJson('ed-api-response')" title="Format JSON"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>Format</button>
                    </label>
                    <textarea id="ed-api-response" class="form-input font-mono text-xs w-full" style="height:120px;" placeholder="{\n  &quot;status&quot;: &quot;success&quot;\n}">${escHtml(apiData?.response || '')}</textarea>
                </div>
            </div>
        </div>
        ` : category === 'testrun' ? `
        <div class="mb-4">
            <label class="text-xs font-medium block mb-2" style="color:var(--tx-m);">Select Test Cases for Execution</label>
            <div class="p-3 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: 300px; overflow-y: auto;">
                ${documents.filter(d => d.category === 'testcases').length === 0 ? `<div class="text-center text-sm py-4" style="color:var(--tx-d);">No test cases available. Please create some Test Cases first.</div>` : documents.filter(d => d.category === 'testcases').map(tc => {
                    const isChecked = (doc?.runData?.targetIds || state._newRunData?.targetIds || []).includes(tc.id);
                    return `
                    <label class="flex items-center gap-3 p-2 rounded cursor-pointer transition-colors" style="border-bottom: 1px solid var(--brd); transition: background .15s;" onmouseenter="this.style.background='var(--card)'" onmouseleave="this.style.background='transparent'">
                        <input type="checkbox" class="testrun-tc-cb w-4 h-4" value="${tc.id}" ${isChecked ? 'checked' : ''}>
                        <div class="flex-1">
                            <div class="text-sm font-medium" style="color:var(--tx);">${escHtml(tc.title)}</div>
                            <div class="text-[11px]" style="color:var(--tx-d);">${tc.tcData?.steps?.length || 0} steps</div>
                        </div>
                    </label>
                    `;
                }).join('')}
            </div>
        </div>
        ` : `
        <!-- Content area -->
        <div id="editor-container" class="mt-4 text-left"></div>
        <textarea id="ed-content-hidden" style="display:none;">${escHtml(content)}</textarea>
        `}

        <div class="flex items-center gap-3 mt-5">
            <button class="btn-s" data-onclick="cancelEdit()">${t('cancel')}</button>
            <button class="btn-p ml-auto" data-onclick="saveDoc()">${t('save')}</button>
        </div>
    </div>`;
}


function handleTagInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const inp = e.target;
        const val = inp.value.trim().toLowerCase().replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF_-]/g, '');
        if (val && !state.editorTags.includes(val)) {
            state.editorTags.push(val);
            inp.value = '';
            renderContent();
            setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
        }
    } else if (e.key === 'Backspace' && !e.target.value && state.editorTags.length > 0) {
        state.editorTags.pop();
        renderContent();
        setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
    }
}

function removeTag(i) {
    state.editorTags.splice(i, 1);
    renderContent();
    setTimeout(() => document.getElementById('tag-input')?.focus(), 50);
}

// ========================
// VIEWER
// ========================
function renderViewer() {
    const doc = documents.find(d => d.id === state.editingDoc?.id);
    if (!doc) return `<div class="text-center py-20" style="color:var(--tx-d);">Document not found.</div>`;

    return `<div class="fade-up max-w-4xl mx-auto">
        <!-- Meta -->
        <div class="flex flex-wrap items-center gap-2.5 mb-4">
            <span class="cat-badge ${CAT_META[doc.category].cls}">${CAT_META[doc.category].label}</span>
            ${doc.subfolder ? `<span class="cat-badge" style="background:var(--bg);border:1px solid var(--brd);color:var(--tx-m);"><i class="fa-regular fa-folder mr-1"></i>${escHtml(doc.subfolder)}</span>` : ''}
            <span class="st-badge st-${doc.status}">${doc.status}</span>
            ${doc.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
            <button class="fav-btn ${doc.favorite ? 'on' : ''} text-sm ml-auto" style="color:${doc.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="toggleFav('${doc.id}')">
                <i class="fa-${doc.favorite ? 'solid' : 'regular'} fa-star"></i>
            </button>
        </div>
        <!-- Title -->
        <h1 class="font-heading font-bold text-2xl mb-2" style="color:var(--tx);">${escHtml(doc.title)}</h1>
        
        <p class="text-xs mb-6" style="color:var(--tx-d);">
            Created ${fmtDate(doc.createdAt)} &middot; Updated ${fmtDate(doc.updatedAt)}
        </p>

        ${doc.category === 'credential' ? `
        <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
            <div class="flex items-center gap-4 mb-5">
                <div class="cred-avatar ${credAvatarColor(doc.title)}">
                    <img class="cred-favicon" src="https://icons.duckduckgo.com/ip3/${guessDomain(doc.title)}.ico" onload="this.classList.add('loaded'); this.nextElementSibling.style.display='none'; this.parentElement.classList.add('has-favicon');" onerror="this.remove()">
                    <span>${escHtml(doc.title.charAt(0).toUpperCase())}</span>
                </div>
                <div>
                    <p class="text-[11px] font-medium tracking-wide uppercase mb-0.5" style="color:var(--tx-d);">Username / Email</p>
                    <p class="text-sm font-semibold" style="color:var(--tx);">${escHtml(doc.username || 'N/A')}</p>
                </div>
            </div>
            <div>
                <p class="text-[11px] font-medium tracking-wide uppercase mb-1.5" style="color:var(--tx-d);">Password</p>
                <div class="flex items-center gap-2">
                    <div class="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg" style="background:var(--bg);border:1px solid var(--brd);">
                        <input type="password" id="view-pw" value="${escHtml(doc.password || '')}" class="bg-transparent border-none outline-none text-sm w-full font-mono tracking-wider" style="color:var(--tx);" readonly>
                        <button id="view-pw-btn" class="text-xs p-1" style="color:var(--tx-m);transition:color .2s;" data-onmouseenter="this.style.color='var(--tx)'" data-onmouseleave="this.style.color='var(--tx-m)'" data-onclick="togglePasswordVisibility('view-pw')"><i class="fa-solid fa-eye"></i></button>
                    </div>
                    <button class="btn-p py-2 px-4" data-onclick="copyPassword('${doc.id}', this)"><i class="fa-solid fa-copy mr-1.5"></i>Copy</button>
                </div>
            </div>
        </div>
        ` : ''}

        ${doc.category === 'environment' ? `
        <div class="mb-6 p-5 rounded-xl" style="background:var(--bg2);border:1px solid var(--brd);">
            <div class="flex items-center justify-between mb-5">
                <h3 class="font-heading font-semibold text-lg" style="color:var(--tx);">Environment Details</h3>
                <span class="px-3 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase" style="background:${doc.envData?.status === 'healthy' ? '#10b98122' : doc.envData?.status === 'down' ? '#ef444422' : '#f59e0b22'}; color:${doc.envData?.status === 'healthy' ? '#10b981' : doc.envData?.status === 'down' ? '#ef4444' : '#f59e0b'}; border:1px solid ${doc.envData?.status === 'healthy' ? '#10b98155' : doc.envData?.status === 'down' ? '#ef444455' : '#f59e0b55'};">
                    <i class="fa-solid fa-circle text-[8px] mr-1.5"></i>${doc.envData?.status || 'Unknown'}
                </span>
            </div>
            
            <div class="grid sm:grid-cols-2 gap-4 mb-5">
                ${doc.envData?.frontendUrl ? `
                <div class="p-4 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                    <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Frontend URL</p>
                    <div class="flex items-center gap-2">
                        <a href="${escHtml(doc.envData.frontendUrl)}" target="_blank" class="text-sm font-mono text-emerald-400 hover:underline truncate flex-1">${escHtml(doc.envData.frontendUrl)}</a>
                        <button class="btn-s px-2 py-1 text-xs" data-onclick="navigator.clipboard.writeText('${escHtml(doc.envData.frontendUrl)}');toast('Copied!','success')"><i class="fa-solid fa-copy"></i></button>
                    </div>
                </div>` : ''}
                ${doc.envData?.backendUrl ? `
                <div class="p-4 rounded-lg" style="background:var(--card);border:1px solid var(--brd);">
                    <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Backend API URL</p>
                    <div class="flex items-center gap-2">
                        <a href="${escHtml(doc.envData.backendUrl)}" target="_blank" class="text-sm font-mono text-blue-400 hover:underline truncate flex-1">${escHtml(doc.envData.backendUrl)}</a>
                        <button class="btn-s px-2 py-1 text-xs" data-onclick="navigator.clipboard.writeText('${escHtml(doc.envData.backendUrl)}');toast('Copied!','success')"><i class="fa-solid fa-copy"></i></button>
                    </div>
                </div>` : ''}
            </div>

            ${doc.envData?.dbInfo ? `
            <div class="p-4 rounded-lg mb-5" style="background:var(--card);border:1px solid var(--brd);">
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Database Connection</p>
                <div class="flex items-center gap-2">
                    <input type="password" id="view-env-db" value="${escHtml(doc.envData.dbInfo)}" class="bg-transparent border-none outline-none text-sm w-full font-mono tracking-wider flex-1" style="color:var(--tx);" readonly>
                    <button class="btn-s px-2 py-1 text-xs" data-onclick="togglePasswordVisibility('view-env-db')"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-s px-2 py-1 text-xs" data-onclick="navigator.clipboard.writeText('${escHtml(doc.envData.dbInfo)}');toast('Copied!','success')"><i class="fa-solid fa-copy"></i></button>
                </div>
            </div>` : ''}

            ${doc.envData?.linkedCreds?.length ? `
            <div>
                <p class="text-[11px] font-medium tracking-wide uppercase mb-2" style="color:var(--tx-d);">Linked Credentials</p>
                <div class="flex flex-wrap gap-2">
                    ${doc.envData.linkedCreds.map(id => {
                        const cred = documents.find(d => d.id === id);
                        if (!cred) return '';
                        return `
                        <div class="flex items-center gap-2 py-1.5 px-3 rounded-lg cursor-pointer border" style="background:var(--bg);border-color:var(--brd);transition:background .15s;" data-onmouseenter="this.style.background='var(--card)'" data-onmouseleave="this.style.background='var(--bg)'" data-onclick="viewDoc('${cred.id}')">
                            <i class="fa-solid fa-key text-xs" style="color:var(--c-cred);"></i>
                            <span class="text-xs font-medium" style="color:var(--tx);">${escHtml(cred.title)}</span>
                        </div>`;
                    }).join('')}
                </div>
            </div>` : ''}
        </div>
        ` : ''}

        ${doc.category === 'testrun' ? `
        <!-- Test Run Execution UI -->
        ${(() => {
            const results = doc.runData?.results || {};
            const targetIds = doc.runData?.targetIds || [];
            const targets = documents.filter(d => targetIds.includes(d.id));
            
            let totalSteps = 0;
            let passCount = 0;
            let failCount = 0;
            let blockedCount = 0;
            
            targets.forEach(tc => {
                const steps = tc.tcData?.steps || [];
                totalSteps += steps.length;
                steps.forEach((_, i) => {
                    const st = results[tc.id]?.[i];
                    if (st === 'pass') passCount++;
                    if (st === 'fail') failCount++;
                    if (st === 'blocked') blockedCount++;
                });
            });
            
            const untestedCount = totalSteps - (passCount + failCount + blockedCount);
            const passPct = totalSteps ? (passCount / totalSteps * 100) : 0;
            const failPct = totalSteps ? (failCount / totalSteps * 100) : 0;
            const blockedPct = totalSteps ? (blockedCount / totalSteps * 100) : 0;
            const untestedPct = totalSteps ? (untestedCount / totalSteps * 100) : 100;
            
            let html = `
            <div class="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('pass')}</div>
                    <div class="text-3xl font-bold" style="color:#10b981;">${passCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('fail')}</div>
                    <div class="text-3xl font-bold" style="color:#ef4444;">${failCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('blocked')}</div>
                    <div class="text-3xl font-bold" style="color:#f59e0b;">${blockedCount}</div>
                </div>
                <div class="p-4 rounded-xl flex flex-col justify-center items-center" style="background:var(--bg2); border:1px solid var(--brd); box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                    <div class="text-[11px] uppercase tracking-wider font-semibold mb-1" style="color:var(--tx-m);">${t('untested')}</div>
                    <div class="text-3xl font-bold" style="color:var(--tx-m);">${untestedCount}</div>
                </div>
            </div>
            
            <div class="mb-8">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs font-semibold uppercase tracking-wider" style="color:var(--tx-m);">${t('testRunProgress')} (${totalSteps} steps)</span>
                    <span class="text-xs font-medium" style="color:var(--tx);">${Math.round(passPct)}% Passed</span>
                </div>
                <div class="w-full h-1.5 rounded-full overflow-hidden flex" style="background:var(--bg2); border:1px solid var(--brd);">
                    <div style="width:${passPct}%;background:#10b981;transition:width .4s ease;"></div>
                    <div style="width:${failPct}%;background:#ef4444;transition:width .4s ease;"></div>
                    <div style="width:${blockedPct}%;background:#f59e0b;transition:width .4s ease;"></div>
                    <div style="width:${untestedPct}%;background:transparent;"></div>
                </div>
            </div>
            <div class="space-y-4">
            `;
            
            if (targets.length === 0) {
                html += `<div class="text-center text-sm py-4" style="color:var(--tx-d);">No test cases selected.</div>`;
            } else {
                targets.forEach(tc => {
                    const steps = tc.tcData?.steps || [];
                    html += `
                    <div class="rounded-xl overflow-hidden" style="border:1px solid var(--brd);">
                        <div class="px-4 py-3 flex items-center gap-3" style="background:var(--bg2); border-bottom:1px solid var(--brd);">
                            <span class="w-2 h-2 rounded-full shrink-0" style="background:var(--c-tc);"></span>
                            <span class="font-medium text-sm" style="color:var(--tx);">${escHtml(tc.title)}</span>
                            <button class="btn-s text-xs ml-auto" data-onclick="viewDoc('${tc.id}')" title="View Test Case"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                        </div>
                        <div class="bg-transparent p-4">
                            ${steps.length === 0 ? `<div class="text-xs" style="color:var(--tx-m);">No steps defined.</div>` : 
                            steps.map((step, idx) => {
                                const status = results[tc.id]?.[idx] || 'untested';
                                return `
                                <div class="py-4 ${idx !== steps.length - 1 ? 'border-b' : ''}" style="border-color:var(--brd);">
                                    <div class="flex items-center gap-2 mb-2">
                                        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5" style="color:var(--tx-m);">Step ${idx + 1}</span>
                                    </div>
                                    <div class="flex flex-col md:flex-row gap-4">
                                        <div class="flex-1 space-y-2">
                                            <div class="text-sm leading-relaxed" style="color:var(--tx);">${escHtml(step.action).replace(/\n/g, '<br>')}</div>
                                            ${step.expected ? `<div class="text-[13px] leading-relaxed" style="color:var(--tx-m);"><span class="font-semibold opacity-60 uppercase text-[10px] tracking-wider mr-1">Expected:</span> ${escHtml(step.expected).replace(/\n/g, '<br>')}</div>` : ''}
                                        </div>
                                        <div class="shrink-0 flex items-start">
                                            <div class="flex rounded-lg overflow-hidden border" style="border-color:var(--brd); background:var(--bg2); box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'pass' ? 'bg-emerald-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'pass' ? 'color:var(--tx-m);' : ''} border-right:1px solid var(--brd);" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'pass')" title="${t('pass')}"><i class="fa-solid fa-check mr-1.5"></i>Pass</button>
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'fail' ? 'bg-rose-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'fail' ? 'color:var(--tx-m);' : ''} border-right:1px solid var(--brd);" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'fail')" title="${t('fail')}"><i class="fa-solid fa-xmark mr-1.5"></i>Fail</button>
                                                <button class="px-3 py-1.5 text-[11px] font-medium transition-colors ${status === 'blocked' ? 'bg-amber-500 text-white' : 'hover:bg-white/5'}" style="${status !== 'blocked' ? 'color:var(--tx-m);' : ''}" data-onclick="updateTestRunStep('${doc.id}', '${tc.id}', ${idx}, 'blocked')" title="${t('blocked')}"><i class="fa-solid fa-ban mr-1.5"></i>Block</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    `;
                });
            }
            html += `</div>`;
            return html;
        })()}
        ` : (!doc.content || doc.content.trim() === '' || (doc.category === 'credential' && doc.content.trim() === (TEMPLATES['credential'] || '').trim())) ? '' : `
        <!-- Content -->
        <div id="viewer-container" class="p-6 rounded-xl toastui-editor-dark" style="background:var(--card);border:1px solid var(--brd);min-height:300px;">
        </div>
        `}
        <textarea id="vw-content-hidden" style="display:none;">${escHtml(doc.content)}</textarea>
        
        <!-- Actions bottom -->
        ${window.location.search.includes('shareId') ? '' : `
        <div class="flex items-center gap-3 mt-5">
            <button class="btn-p" data-onclick="editDoc('${doc.id}')"><i class="fa-solid fa-pen mr-1.5"></i>${t('edit')}</button>
            <button class="btn-s" data-onclick="duplicateDoc('${doc.id}')"><i class="fa-solid fa-copy mr-1.5"></i>${t('duplicate')}</button>
            <button class="btn-d ml-auto" data-onclick="showDeleteModal('${doc.id}')"><i class="fa-solid fa-trash mr-1.5"></i>${t('delete')}</button>
        </div>
        `}
    </div>`;
}

// ========================
// ACTIONS
// ========================
window.updateTestRunStep = async function(runDocId, tcId, stepIdx, status) {
    const doc = documents.find(d => d.id === runDocId);
    if (!doc || !doc.runData) return;
    
    if (!doc.runData.results) doc.runData.results = {};
    if (!doc.runData.results[tcId]) doc.runData.results[tcId] = {};
    
    doc.runData.results[tcId][stepIdx] = status;
    doc.updatedAt = Date.now();
    
    if (state.editingDoc?.id === runDocId) {
        state.editingDoc = { ...doc };
    }
    
    await persist();
    render();
};

function createDoc(cat) {
    closeModal();
    pushHistory();
    state.view = 'editor';
    state.editingDoc = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    state._newCat = cat || 'runbook';
    state._newTitle = '';
    state._newSubfolder = '';
    state._newStatus = 'draft';
    state._newBugData = null;
    state._newTcData = null;
    state._newApiData = null;
    state._newRunData = null;
    state._newContent = cat && TEMPLATES[cat] ? TEMPLATES[cat] : '# New Document\n\nStart writing here...';
    render();
    setTimeout(() => document.getElementById('ed-title')?.focus(), 100);
}

function editDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'editor';
    state.editingDoc = { ...doc };
    state.editorTags = [...doc.tags];
    state.editorMode = 'edit';
    render();
}

function viewDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    pushHistory();
    state.view = 'viewer';
    state.editingDoc = { ...doc };
    render();
}

window.cancelEdit = function() {
    window.tuiEditor = null;
    state.editorTags = [];
    state.editorMode = 'edit';
    navigateBack();
}

async function saveDoc() {
    const title = document.getElementById('ed-title')?.value.trim();
    const subfolder = document.getElementById('ed-subfolder')?.value.trim() || '';
    const cat = document.getElementById('ed-cat')?.value;
    const status = document.getElementById('ed-status')?.value;
    
    const content = window.tuiEditor ? window.tuiEditor.getMarkdown() : '';
    let finalContent = content;
    let bugData = null;
    let tcData = null;
    let apiData = null;
    let runData = null;
    
    if (cat === 'bug') {
        const env = document.getElementById('ed-bug-env')?.value || '';
        const browser = document.getElementById('ed-bug-browser')?.value || '';
        const severity = document.getElementById('ed-bug-severity')?.value || 'Minor';
        const precond = document.getElementById('ed-bug-precond')?.value || '';
        const stepInputs = document.querySelectorAll('.bug-step-input');
        const steps = Array.from(stepInputs).map(inp => inp.value.trim()).filter(v => v);
        const expected = document.getElementById('ed-bug-expected')?.value || '';
        const actual = document.getElementById('ed-bug-actual')?.value || '';
        
        bugData = { env, browser, severity, precond, steps, expected, actual };
        
        finalContent = `# ${title}

## ${t('bugEnv')}
- **Environment:** ${env || '-'}
- **Device/Browser:** ${browser || '-'}
- **Severity:** ${severity}

${precond ? `## ${t('bugPrecond')}\n${precond}\n` : ''}
## ${t('bugSteps')}\n${steps.length ? steps.map((s, i) => (i + 1) + '. ' + s).join('\n') : '-'}

## ${t('bugExpected')}
${expected || '-'}

## ${t('bugActual')}
${actual || '-'}`;
    } else if (cat === 'testcases') {
        const module = document.getElementById('ed-tc-module')?.value || '';
        const precond = document.getElementById('ed-tc-precond')?.value || '';
        const testData = document.getElementById('ed-tc-data')?.value || '';
        const stepRows = document.querySelectorAll('.tc-step-row');
        const steps = Array.from(stepRows).map(row => ({
            action: row.querySelector('.tc-step-action')?.value.trim() || '',
            expected: row.querySelector('.tc-step-expected')?.value.trim() || ''
        })).filter(s => s.action || s.expected);
        
        tcData = { module, precond, data: testData, steps };
        
        finalContent = `# ${title}

${module ? `**Module:** ${module}` : ''}

${precond ? `## ${t('tcPrecond')}\n${precond}\n` : ''}
${testData ? `## ${t('tcData')}\n${testData}\n` : ''}

## ${t('tcSteps')}
| Step | ${t('tcAction')} | ${t('tcExpected')} |
|---|---|---|
${steps.length ? steps.map((s, i) => `| ${i+1} | ${s.action.replace(/\n/g, '<br>')} | ${s.expected.replace(/\n/g, '<br>')} |`).join('\n') : '| - | - | - |'}
`;
    } else if (cat === 'api') {
        const method = document.getElementById('ed-api-method')?.value || 'GET';
        const endpoint = document.getElementById('ed-api-endpoint')?.value || '';
        
        const hRows = document.querySelectorAll('.api-header-row');
        const headers = Array.from(hRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);
        
        const pRows = document.querySelectorAll('.api-param-row');
        const params = Array.from(pRows).map(row => ({
            key: row.querySelector('.api-key')?.value.trim() || '',
            value: row.querySelector('.api-value')?.value.trim() || '',
            req: row.querySelector('.api-req')?.checked || false
        })).filter(s => s.key || s.value);

        const body = document.getElementById('ed-api-body')?.value || '';
        const response = document.getElementById('ed-api-response')?.value || '';
        
        apiData = { method, endpoint, headers, params, body, response };
        
        finalContent = `# ${title}

**Method:** \`${method}\` | **Endpoint:** \`${endpoint}\`

${headers.length ? `## ${t('apiHeaders')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${headers.map(h => `| ${h.key || '-'} | ${h.value || '-'} | ${h.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${params.length ? `## ${t('apiParams')}\n| ${t('apiKey')} | ${t('apiValue')} | ${t('apiRequired')} |\n|---|---|---|\n${params.map(p => `| ${p.key || '-'} | ${p.value || '-'} | ${p.req ? 'Yes' : 'No'} |`).join('\n')}\n` : ''}
${body ? `## ${t('apiBody')}\n\`\`\`json\n${body}\n\`\`\`\n` : ''}
${response ? `## ${t('apiResponse')}\n\`\`\`json\n${response}\n\`\`\`\n` : ''}`;
    } else if (cat === 'testrun') {
        const checkboxes = document.querySelectorAll('.testrun-tc-cb:checked');
        const targetIds = Array.from(checkboxes).map(cb => cb.value);
        const existingResults = (state.editingDoc && state.editingDoc.runData && state.editingDoc.runData.results) ? state.editingDoc.runData.results : {};
        runData = { targetIds, results: existingResults };
    }

    const tags = [...state.editorTags];
    const username = document.getElementById('ed-username')?.value || '';
    const password = document.getElementById('ed-password')?.value || '';

    if (!title) { toast(t('titleRequired'), 'error'); document.getElementById('ed-title')?.focus(); return; }

    if (state.editingDoc && state.editingDoc.id) {
        // Update
        const idx = documents.findIndex(d => d.id === state.editingDoc.id);
        if (idx !== -1) {
            documents[idx] = { ...documents[idx], title, category: cat, subfolder, status, content: finalContent, tags, username, password, bugData: bugData !== null ? bugData : documents[idx].bugData, tcData: tcData !== null ? tcData : documents[idx].tcData, apiData: apiData !== null ? apiData : documents[idx].apiData, runData: runData !== null ? runData : documents[idx].runData, updatedAt: Date.now() };
        }
        toast(t('docUpdated'), 'success');
        state.editingDoc = { ...documents[idx] };
        state.view = 'viewer';
    } else {
        // Create
        const newDoc = { id: uid(), title, category: cat, subfolder, status, content: finalContent, tags, username, password, bugData, tcData, apiData, runData, favorite: false, createdAt: Date.now(), updatedAt: Date.now() };
        documents.unshift(newDoc);
        toast(t('docCreated'), 'success');
        state.editingDoc = { ...newDoc };
        state.view = 'viewer';
        state.category = cat;
    }
    await persist();
    render();
}

async function toggleFav(id) {
    const doc = documents.find(d => d.id === id);
    if (doc) {
        doc.favorite = !doc.favorite;
        await persist();
        render();
    }
}

async function duplicateDoc(id) {
    const doc = documents.find(d => d.id === id);
    if (!doc) return;
    const dup = { ...doc, id: uid(), title: doc.title + ' (Copy)', favorite: false, createdAt: Date.now(), updatedAt: Date.now(), tags: [...doc.tags] };
    documents.unshift(dup);
    await persist();
    toast(t('docDuplicated'), 'success');
    render();
}

// ========================
// KEYBOARD SHORTCUTS
// ========================
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + S để save khi đang ở editor
    if ((e.ctrlKey || e.metaKey) && e.key === 's' && state.view === 'editor') {
        e.preventDefault();
        saveDoc();
    }
    // Escape để đóng modal hoặc thoát editor
    if (e.key === 'Escape') {
        const modal = document.getElementById('modal');
        if (modal && !modal.classList.contains('hidden')) { closeModal(); return; }
        const menu = document.getElementById('doc-menu');
        if (menu) { menu.remove(); return; }
        if (state.view === 'editor') {
            navigate(state.editingDoc?.id ? 'viewer' : 'documents', state.category);
        }
    }
    // Ctrl/Cmd + K để focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k' && (state.view === 'documents' || state.view === 'favorites')) {
        e.preventDefault();
        const inp = document.querySelector('.search-w input');
        if (inp) inp.focus();
    }
});

// Đóng menu khi scroll
document.getElementById('content')?.addEventListener('scroll', () => {
    const menu = document.getElementById('doc-menu');
    if (menu) menu.remove();
});

// ========================
// INIT
// ========================
async function init() {
    await hydrate();
    render();
}

window.initAppAfterUnlock = async function(skipSync = false) {
    if (!skipSync && window.SyncService && window.SyncService.isUnlocked()) {
        try {
            const pwd = sessionStorage.getItem('e2ee_master_password');
            const resObj = await window.SyncService.pullAndUnlock(pwd);
            if (resObj && resObj.needPush) {
                await window.SyncService.pushData();
            }
        } catch (e) {
            console.error("Initial sync failed", e);
        }
    }
    await init();
    handleUrlParams();
}

const urlParams = new URLSearchParams(window.location.search);
const shareId = urlParams.get('shareId');

if (shareId) {
    const ls = document.getElementById('lock-screen');
    if (ls) ls.classList.add('hidden');
    loadSharedDoc(shareId, window.location.hash.replace('#key=', ''));
} else if (window.SyncService && !window.SyncService.isUnlocked()) {
    const ls = document.getElementById('lock-screen');
    if (ls) ls.classList.remove('hidden');
} else {
    window.initAppAfterUnlock();
}

async function loadSharedDoc(binId, key) {
    try {
        toast("Loading shared document...", "info");
        const res = await fetch('https://api.jsonbin.io/v3/b/' + binId);
        const payload = await res.json();
        
        if (payload.record && payload.record.data) {
            const bytes = CryptoJS.AES.decrypt(payload.record.data, key);
            const decStr = bytes.toString(CryptoJS.enc.Utf8);
            if (!decStr) throw new Error("Invalid share key");
            const doc = JSON.parse(decStr);
            
            state.view = 'viewer';
            state.editingDoc = doc;
            documents = [doc];
            
            updateHeader();
            renderContent();
            
            // Hide sidebar and toggle
            document.getElementById('sidebar').style.display = 'none';
            const sbToggle = document.querySelector('button[data-onclick="toggleSidebar()"]');
            if (sbToggle) sbToggle.style.display = 'none';
            
            // Modify header actions
            const header = document.getElementById('app-header');
            const actionsDiv = header.querySelector('.flex.items-center.gap-2');
            if (actionsDiv) {
                actionsDiv.innerHTML = `<button class="btn-p text-sm" onclick="window.location.href=window.location.pathname">Open QA Hub</button>`;
            }
            
            toast("Document loaded securely", "success");
        } else {
            throw new Error("Invalid document data");
        }
    } catch (e) {
        console.error(e);
        document.body.innerHTML = `<div class="flex items-center justify-center h-screen bg-grid"><div class="p-10 text-center max-w-md"><div class="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center" style="background:rgba(244,63,94,0.1);"><i class="fa-solid fa-lock text-rose-400 text-2xl"></i></div><h1 class="font-heading text-2xl font-bold mb-4" style="color:var(--tx)">Access Denied</h1><p class="text-sm mb-8" style="color:var(--tx-m)">${e.message || 'Unable to decrypt this document. The link may be invalid or expired.'}</p><button class="btn-p" onclick="window.location.href=window.location.pathname">Go to QA Hub</button></div></div>`;
    }
}

// ========================
// URL PARAMETER HANDLING
// ========================
function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const viewId = params.get('view');

    if (action === 'new') {
        showTemplateModal();
    } else if (viewId) {
        const doc = documents.find(d => d.id === viewId);
        if (doc) {
            viewDoc(viewId);
        }
    }
}

// ========================
// CSP EVENT DELEGATOR
// ========================
function executeAction(code, event, element) {
    if (!code) return;
    
    if (code.includes('event.stopPropagation()')) {
        event.stopPropagation();
    }
    
    const calls = code.split(';').map(s => s.trim()).filter(Boolean);
    for (const call of calls) {
        if (call === 'event.stopPropagation()') continue;
        
        // Special inline code evaluations
        if (call === "document.getElementById('import-input').click()") {
            document.getElementById('import-input').click();
            continue;
        }
        if (call.startsWith("document.getElementById('doc-menu').remove()")) {
            const menu = document.getElementById('doc-menu');
            if (menu) menu.remove();
            continue;
        }
        if (call === "state.search=this.value") {
            state.search = element.value;
            continue;
        }
        if (call === "state.statusFilter=this.value") {
            state.statusFilter = element.value;
            continue;
        }
        if (call === "state.sortBy=this.value") {
            state.sortBy = element.value;
            continue;
        }
        if (call === "state.editorMode='edit'") {
            state.editorMode = 'edit';
            continue;
        }
        if (call === "state.editorMode='preview'") {
            state.editorMode = 'preview';
            continue;
        }
        if (call === "document.getElementById('ed-content').focus()") {
            setTimeout(() => document.getElementById('ed-content')?.focus(), 0);
            continue;
        }
        if (call === "this.style.background='var(--card)'") {
            element.style.background = 'var(--card)';
            continue;
        }
        if (call === "this.style.background='transparent'") {
            element.style.background = 'transparent';
            continue;
        }
        if (call === "this.style.background='rgba(244,63,94,0.06)'") {
            element.style.background = 'rgba(244,63,94,0.06)';
            continue;
        }
        if (call === "this.style.color='var(--tx-m)'") {
            element.style.color = 'var(--tx-m)';
            continue;
        }
        if (call === "this.style.color='var(--tx-d)'") {
            element.style.color = 'var(--tx-d)';
            continue;
        }
        
        // Function calls
        const match = call.match(/^([a-zA-Z0-9_]+)\((.*)\)$/);
        if (match) {
            const funcName = match[1];
            const argsStr = match[2];
            
            let args = [];
            if (argsStr.trim() !== '') {
                // simple argument parsing
                args = argsStr.split(',').map(s => {
                    s = s.trim();
                    if (s === 'this') return element;
                    if (s === 'this.value') return element.value;
                    if (s === 'event') return event;
                    if (s === 'null') return null;
                    if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
                        return s.slice(1, -1);
                    }
                    if (!isNaN(s)) return Number(s);
                    return s;
                });
            }
            
            if (typeof window[funcName] === 'function') {
                window[funcName](...args);
            }
        }
    }
}

document.addEventListener('click', (e) => {
    let target = e.target.closest('[data-onclick]');
    if (target) {
        executeAction(target.getAttribute('data-onclick'), e, target);
    }
});

document.addEventListener('input', (e) => {
    let target = e.target.closest('[data-oninput]');
    if (target) {
        executeAction(target.getAttribute('data-oninput'), e, target);
    }
});

document.addEventListener('change', (e) => {
    let target = e.target.closest('[data-onchange]');
    if (target) {
        executeAction(target.getAttribute('data-onchange'), e, target);
    }
});

document.addEventListener('keydown', (e) => {
    let target = e.target.closest('[data-onkeydown]');
    if (target) {
        executeAction(target.getAttribute('data-onkeydown'), e, target);
    }
});

document.addEventListener('mouseover', (e) => {
    let target = e.target.closest('[data-onmouseenter]');
    if (target) {
        executeAction(target.getAttribute('data-onmouseenter'), e, target);
    }
});

document.addEventListener('mouseout', (e) => {
    let target = e.target.closest('[data-onmouseleave]');
    if (target) {
        executeAction(target.getAttribute('data-onmouseleave'), e, target);
    }
});

// ========================
// CREDENTIAL HELPERS
// ========================

window.credAvatarColor = function(site) {
    const s = site || '';
    if (!s) return 'avatar-0';
    return `avatar-${s.charCodeAt(0) % 8}`;
};

window.guessDomain = function(site) {
    const s = (site || '').trim().toLowerCase();
    if (s.includes('.')) {
        try {
            const url = s.startsWith('http') ? s : `https://${s}`;
            return new URL(url).hostname;
        } catch(e) {
            return s;
        }
    }
    return s.replace(/\s+/g, '') + '.com';
};

window.copyPassword = function(id, btn) {
    const doc = documents.find(d => d.id === id);
    if (!doc || !doc.password) return;
    
    navigator.clipboard.writeText(doc.password).then(() => {
        if (btn) {
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="fa-solid fa-check mr-1.5"></i>Copied';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
    });
};

window.togglePasswordVisibility = function(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
};


// ========================


// ========================
// KANBAN HELPERS & DELEGATORS
// ========================

window.handleDragStart = function(event, id, element) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    // Add visual feedback
    setTimeout(() => { element.classList.add('opacity-50'); }, 0);
};

window.handleDragEnd = function(event, element) {
    element.classList.remove('opacity-50');
};

window.handleDragOver = function(event) {
    event.preventDefault(); // Necessary to allow dropping
    event.dataTransfer.dropEffect = 'move';
};

window.handleDrop = async function(event, newStatus) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    if (!id) return;
    
    const idx = documents.findIndex(d => d.id === id);
    if (idx !== -1) {
        if (documents[idx].kanbanStatus !== newStatus) {
            documents[idx].kanbanStatus = newStatus;
            documents[idx].updatedAt = Date.now();
            await persist();
            renderContent();
        }
    }
};

document.addEventListener('dragstart', (e) => {
    let target = e.target.closest('[data-ondragstart]');
    if (target) {
        const action = target.getAttribute('data-ondragstart');
        if (action.startsWith('handleDragStart')) {
            const id = action.match(/'([^']+)'/)[1];
            window.handleDragStart(e, id, target);
        }
    }
});

document.addEventListener('dragend', (e) => {
    let target = e.target.closest('[data-ondragend]');
    if (target) {
        window.handleDragEnd(e, target);
    }
});

document.addEventListener('dragover', (e) => {
    let target = e.target.closest('[data-ondragover]');
    if (target) {
        window.handleDragOver(e);
    }
});

document.addEventListener('drop', (e) => {
    let target = e.target.closest('[data-ondrop]');
    if (target) {
        const action = target.getAttribute('data-ondrop');
        if (action.startsWith('handleDrop')) {
            const status = action.match(/'([^']+)'/)[1];
            window.handleDrop(e, status);
        }
    }
});



// ========================
// KANBAN BOARD
// ========================
function renderKanbanBoard(docs, isMobileSearch) {
    const cols = [
        { id: 'todo', get label() { return t('todo'); }, color: '#64748b' },
        { id: 'in-progress', get label() { return t('inProgress'); }, color: '#3b82f6' },
        { id: 'review', get label() { return t('review'); }, color: '#f59e0b' },
        { id: 'done', get label() { return t('done'); }, color: '#10b981' }
    ];

    const kanbanHtml = cols.map(col => {
        const colDocs = docs.filter(d => (d.kanbanStatus || 'todo') === col.id);
        
        return `
        <div class="flex flex-col shrink-0 rounded-xl" style="background:var(--bg2); border:1px solid var(--brd); max-height: calc(100vh - 180px); width: 300px; min-width: 300px;"
             data-ondragover="handleDragOver" 
             data-ondrop="handleDrop('${col.id}')">
            
            <div class="p-4 flex items-center justify-between border-b sticky top-0" style="border-color:var(--brd); background:var(--bg2); border-top-left-radius: 0.75rem; border-top-right-radius: 0.75rem; z-index: 10;">
                <h3 class="font-heading font-semibold text-sm flex items-center gap-2" style="color:${col.color};">
                    <i class="fa-solid fa-circle" style="font-size: 8px;"></i> ${col.label}
                </h3>
                <span class="text-xs font-medium py-0.5 px-2 rounded-full" style="background:var(--card); color:var(--tx-m);">${colDocs.length}</span>
            </div>
            
            <div class="flex-1 overflow-y-auto flex flex-col custom-scrollbar" style="padding: 12px; gap: 12px;">
                ${colDocs.map(d => `
                    <div class="doc-card flex flex-col cursor-grab active:cursor-grabbing" 
                         draggable="true" 
                         data-ondragstart="handleDragStart('${d.id}')"
                         data-ondragend="handleDragEnd"
                         data-onclick="viewDoc('${d.id}')"
                         style="background:var(--card); padding: 14px; margin-bottom: 0px; border-radius: 8px;">
                        
                        <div class="flex items-start justify-between mb-2">
                            <span class="st-badge st-${d.status}">${d.status}</span>
                            <div class="flex items-center gap-1 shrink-0 ml-2">
                                <button class="fav-btn ${d.favorite ? 'on' : ''} text-xs p-1" style="color:${d.favorite ? '#f59e0b' : 'var(--tx-d)'};" data-onclick="event.stopPropagation();toggleFav('${d.id}')">
                                    <i class="fa-${d.favorite ? 'solid' : 'regular'} fa-star"></i>
                                </button>
                                <button class="text-xs p-1 rounded" style="color:var(--tx-d);transition:color .15s;" data-onmouseenter="this.style.background='var(--bg2)'" data-onmouseleave="this.style.background='transparent'" data-onclick="event.stopPropagation();showDocMenu('${d.id}', this)" title="More actions">
                                    <i class="fa-solid fa-ellipsis-vertical"></i>
                                </button>
                            </div>
                        </div>
                        
                        <h4 class="text-sm font-semibold mb-2 leading-snug" style="color:var(--tx);">${escHtml(d.title)}</h4>
                        
                        <div class="flex items-center gap-1.5 flex-wrap mt-auto pt-2 border-t" style="border-color:var(--brd);">
                            ${d.tags.slice(0, 2).map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}
                            ${d.tags.length > 2 ? `<span class="text-[10px]" style="color:var(--tx-d);">+${d.tags.length - 2}</span>` : ''}
                            <span class="text-[10px] ml-auto" style="color:var(--tx-d);">${fmtDate(d.updatedAt)}</span>
                        </div>
                    </div>
                `).join('')}
                
                ${colDocs.length === 0 ? `
                    <div class="py-6 text-center border-2 border-dashed rounded-lg" style="border-color:var(--brd); color:var(--tx-d);">
                        <p class="text-[11px] font-medium">${t('dragTaskHere')}</p>
                    </div>
                ` : ''}
            </div>
        </div>
        `;
    }).join('');

    return `<div class="fade-up max-w-full">
        <!-- Mobile search -->
        ${isMobileSearch ? `<div class="search-w sm:hidden mb-4"><i class="fa-solid fa-search"></i><input class="form-input text-sm" placeholder="${t('searchTasks')}" value="${escHtml(state.search)}" data-oninput="state.search=this.value;renderContent();"></div>` : ''}

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-3 mb-5">
            <select class="form-select text-sm" style="width:auto;min-width:130px;" data-onchange="state.statusFilter=this.value;renderContent();">
                <option value="all" ${state.statusFilter === 'all' ? 'selected' : ''}>${t('allStatus')}</option>
                <option value="published" ${state.statusFilter === 'published' ? 'selected' : ''}>Published</option>
                <option value="draft" ${state.statusFilter === 'draft' ? 'selected' : ''}>Draft</option>
                <option value="archived" ${state.statusFilter === 'archived' ? 'selected' : ''}>Archived</option>
            </select>
            <div class="flex-1"></div>
            <button class="btn-p text-sm" data-onclick="createDoc('task')"><i class="fa-solid fa-plus mr-1.5"></i>${t('newTask')}</button>
        </div>

        <!-- Kanban Board Container -->
        <div class="overflow-x-auto pb-4 custom-scrollbar">
            <div class="flex items-start mx-auto w-max" style="min-height: 400px; gap: 1.25rem;">
                ${kanbanHtml}
            </div>
        </div>
    </div>`;
}



const i18n = {
    vi: {
        runbook: "Runbook",
        onboarding: "Onboarding",
        testcases: "Test Cases",
        knowledge: "Kiến thức",
        task: "Task",
        bug: "Bug Report",
        testplan: "Test Plan",
        meeting: "Meeting Notes",
        api: "API Specs",
        credential: "Credentials",
        
        viewAll: "Xem tất cả",
        newest: "Mới tạo",
        sortAZ: "Theo tên A-Z",
        blankPage: "Trang trắng",
        startFromScratch: "Bắt đầu viết từ đầu",
        template: "Mẫu",
        justNow: "Vừa xong",
        minsAgo: "{m} phút trước",
        hoursAgo: "{h} giờ trước",
        daysAgo: "{d} ngày trước",

        noContent: "Chưa có nội dung.",
        chooseTemplate: "Chọn template hoặc bắt đầu với trang trắng.",
        noFavorites: "Chưa có favorite nào.",
        enterTitle: "Nhập tiêu đề...",
        egCred: "VD: Facebook, Database Prod",
        enterTag: "Nhập tag, nhấn Enter...",
        writeContent: "Viết nội dung bằng Markdown...",
        
                preview: "Xem trước",
                copyPassword: "Copy Password",
        
        bugEnv: "Môi trường",
        bugEnvPl: "VD: Staging, Production",
        bugDevice: "Trình duyệt / Thiết bị",
        bugDevicePl: "VD: Chrome 120, iOS 17",
        bugSeverity: "Mức độ nghiêm trọng",
        bugPrecond: "Điều kiện tiên quyết",
        bugPrecondPl: "VD: User đã đăng nhập...",
        bugSteps: "Các bước tái hiện",
        bugStepsPl: "1. Mở trang...\n2. Bấm nút...",
        bugExpected: "Kết quả mong đợi",
        bugExpectedPl: "Hệ thống nên...",
        bugActual: "Kết quả thực tế",
        bugActualPl: "Lỗi hiển thị...",

        tcModule: "Module / Tính năng",
        tcModulePl: "VD: Đăng nhập",
        tcPrecond: "Tiền điều kiện",
        tcPrecondPl: "VD: User đã có tài khoản",
        tcData: "Test Data",
        tcDataPl: "VD: user: admin, pass: 123",
        tcSteps: "Các bước thực hiện",
        tcAction: "Hành động (Action)",
        tcActionPl: "Nhập email...",
        tcExpected: "Kết quả mong đợi (Expected)",
        tcExpectedPl: "Hệ thống hiển thị...",

        apiMethod: "Method",
        apiEndpoint: "Endpoint / Path",
        apiHeaders: "Headers",
        apiParams: "Query Parameters",
        apiBody: "Request Body (JSON)",
        apiResponse: "Response (JSON)",
        apiKey: "Key",
        apiValue: "Value",
        apiRequired: "Required",

        dashboard: "Trang chủ",
        categories: "Danh mục",
        documents: "Tài liệu",
        favorites: "Yêu thích",
        
        newDoc: "Tạo Document",
        editDoc: "Chỉnh sửa",
        save: "Lưu",
        cancel: "Hủy",
        back: "Quay lại",
        edit: "Sửa",
        duplicate: "Nhân bản",
        delete: "Xóa",
        trash: "Thùng rác",
        restore: "Khôi phục",
        deleteForever: "Xóa vĩnh viễn",
        
        delConfirm: "Bạn có chắc chắn muốn xóa document này không?",
        delConfirmForever: "Bạn có chắc chắn muốn xóa vĩnh viễn tài liệu này không? Hành động này không thể hoàn tác.",
        delTitle: "Xóa Document",
        delTitleForever: "Xóa Vĩnh Viễn",
        delConfirmBtn: "Xóa",
        delConfirmBtnForever: "Xóa Vĩnh Viễn",
        emptyTrash: "Dọn rác",
        emptyTrashTitle: "Dọn Sạch Thùng Rác",
        emptyTrashConfirm: "Bạn có chắc chắn muốn dọn sạch thùng rác không? Toàn bộ tài liệu sẽ bị xóa vĩnh viễn và không thể khôi phục.",
        emptyTrashBtn: "Dọn Sạch",
        
        generatingLink: "Đang tạo Link bảo mật...",
        pleaseWait: "Vui lòng đợi trong khi chúng tôi mã hóa tài liệu.",
        linkReady: "Link đã sẵn sàng!",
        linkDesc: "Bất kỳ ai có link này đều có thể xem tài liệu. Dữ liệu đã được mã hóa an toàn.",
        share: "Chia sẻ",
        close: "Đóng",
        
        searchDocs: "Tìm kiếm tài liệu...",
        searchTasks: "Tìm kiếm tasks...",
        noDocFound: "Không tìm thấy tài liệu phù hợp",
        noDocYet: "Chưa có tài liệu nào",
        trashEmpty: "Thùng rác trống",
        tryDiffKey: "Thử tìm kiếm với từ khóa khác",
        createFirstDoc: "Bắt đầu tạo tài liệu đầu tiên của bạn",
        recentlyUpdated: "Cập nhật gần đây",
        allStatus: "Tất cả trạng thái",
        
        titleRequired: "Vui lòng nhập tiêu đề",
        docCreated: "Đã tạo document mới",
        docUpdated: "Đã cập nhật document",
        docDuplicated: "Đã nhân bản document",
        docDeleted: "Đã chuyển vào Thùng rác",
        docRestored: "Đã khôi phục tài liệu",
        docDeletedForever: "Đã xóa vĩnh viễn",
        trashEmptied: "Đã dọn sạch thùng rác",
        copied: "Đã copy vào clipboard",
        testrun: "Chạy Kiểm Thử",
        untested: "Chưa test",
        pass: "Pass",
        fail: "Fail",
        blocked: "Blocked",
        testRunProgress: "Tiến độ",
        
        todo: "To Do",
        inProgress: "In Progress",
        review: "Review",
        done: "Done",
        dragTaskHere: "Kéo thả task vào đây",
        newTask: "Task Mới"
    },
    en: {
        runbook: "Runbook",
        onboarding: "Onboarding",
        testcases: "Test Cases",
        knowledge: "Knowledge",
        task: "Task",
        bug: "Bug Report",
        testplan: "Test Plan",
        meeting: "Meeting Notes",
        api: "API Specs",
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
        newTask: "New Task"
    }
};

function t(key, params = {}) {
    let text = i18n[state.lang] && i18n[state.lang][key] ? i18n[state.lang][key] : key;
    for (let k in params) {
        text = text.replace('{' + k + '}', params[k]);
    }
    return text;
};


window.changeEditorCat = function(cat) {
    if (state.editingDoc) {
        state.editingDoc.category = cat;
        state.editingDoc.title = document.getElementById('ed-title')?.value || '';
        state.editingDoc.subfolder = document.getElementById('ed-subfolder')?.value || '';
        if (cat === 'bug' && !state.editingDoc.bugData) state.editingDoc.bugData = {};
        if (cat === 'testcases' && !state.editingDoc.tcData) state.editingDoc.tcData = {};
        if (cat === 'api' && !state.editingDoc.apiData) state.editingDoc.apiData = {};
    } else {
        state._newCat = cat;
        state._newTitle = document.getElementById('ed-title')?.value || '';
        state._newSubfolder = document.getElementById('ed-subfolder')?.value || '';
        if (cat === 'testcases' && !state._newTcData) state._newTcData = {};
        if (cat === 'api' && !state._newApiData) state._newApiData = {};
    }
    render();
    setTimeout(() => {
        const titleInput = document.getElementById('ed-title');
        if (titleInput) {
            titleInput.focus();
            titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
        }
    }, 0);
};


window.addBugStep = function() {
    const container = document.getElementById('bug-steps-container');
    if (!container) return;
    const idx = container.querySelectorAll('.bug-step-row').length;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 bug-step-row';
    div.innerHTML = `
        <span class="text-xs font-semibold step-idx" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
        <input class="form-input flex-1 bug-step-input" placeholder="Step ${idx + 1}...">
        <button class="btn-s px-2 py-1.5" style="color:var(--tx-m);" data-onclick="removeBugStep(this)"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
};

window.removeBugStep = function(btn) {
    const row = btn.closest('.bug-step-row');
    row.remove();
    const container = document.getElementById('bug-steps-container');
    container.querySelectorAll('.bug-step-row').forEach((r, i) => {
        r.querySelector('.step-idx').textContent = (i + 1) + '.';
        r.querySelector('.bug-step-input').placeholder = 'Step ' + (i + 1) + '...';
    });
};

window.addTcStep = function() {
    const container = document.getElementById('tc-steps-container');
    if (!container) return;
    const idx = container.querySelectorAll('.tc-step-row').length;
    const div = document.createElement('div');
    div.className = 'flex items-start gap-2 mb-2 tc-step-row';
    div.innerHTML = `
        <span class="text-xs font-semibold step-idx mt-2" style="color:var(--tx-m);width:20px;">${idx + 1}.</span>
        <textarea class="form-input flex-1 tc-step-action" style="height:60px;" placeholder="${t('tcActionPl')}"></textarea>
        <textarea class="form-input flex-1 tc-step-expected" style="height:60px;" placeholder="${t('tcExpectedPl')}"></textarea>
        <button class="btn-s px-2 py-1.5 mt-1" style="color:var(--tx-m);" data-onclick="removeTcStep(this)"><i class="fa-solid fa-trash"></i></button>
    `;
    container.appendChild(div);
};

window.removeTcStep = function(btn) {
    const row = btn.closest('.tc-step-row');
    const container = row.parentElement;
    row.remove();
    container.querySelectorAll('.tc-step-row').forEach((r, i) => {
        r.querySelector('.step-idx').textContent = (i + 1) + '.';
    });
};

window.addApiHeader = function() {
    const container = document.getElementById('api-headers-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 api-header-row';
    div.innerHTML = `
        <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}">
        <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}">
        <div class="flex items-center gap-1">
            <input type="checkbox" class="api-req" title="${t('apiRequired')}">
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiHeader(this)"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
    container.appendChild(div);
};
window.removeApiHeader = function(btn) { btn.closest('.api-header-row').remove(); };

window.addApiParam = function() {
    const container = document.getElementById('api-params-container');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'flex items-center gap-2 mb-2 api-param-row';
    div.innerHTML = `
        <input class="form-input flex-1 api-key text-xs font-mono" placeholder="${t('apiKey')}">
        <input class="form-input flex-1 api-value text-xs font-mono" placeholder="${t('apiValue')}">
        <div class="flex items-center gap-1">
            <input type="checkbox" class="api-req" title="${t('apiRequired')}">
            <button class="btn-s px-2 py-1" style="color:var(--tx-m);" data-onclick="removeApiParam(this)"><i class="fa-solid fa-xmark"></i></button>
        </div>
    `;
    container.appendChild(div);
};
window.removeApiParam = function(btn) { btn.closest('.api-param-row').remove(); };

window.formatJson = function(id) {
    const el = document.getElementById(id);
    if (!el || !el.value.trim()) return;
    try {
        const obj = JSON.parse(el.value);
        el.value = JSON.stringify(obj, null, 2);
    } catch (e) {
        toast('Invalid JSON format', 'error');
    }
};

window.copyCodeBlock = function(btn, b64) {
    try {
        const text = decodeURIComponent(escape(atob(b64)));
        navigator.clipboard.writeText(text);
        const icon = btn.querySelector('i');
        if (icon) {
            icon.className = 'fa-solid fa-check text-green-500';
            setTimeout(() => { icon.className = 'fa-regular fa-copy'; }, 2000);
        }
    } catch (e) {
        toast('Failed to copy', 'error');
    }
};

window.toggleLang = async function() {
    state.lang = state.lang === 'vi' ? 'en' : 'vi';
    await DocStorage.saveSettings({ lang: state.lang });
    render();
};

// ========================
// GLOBAL SEARCH (Ctrl+K)
// ========================
let searchSelectedIndex = -1;
let currentSearchResults = [];

window.openSearch = function() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    if (!modal || !input) return;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    input.value = '';
    searchSelectedIndex = -1;
    currentSearchResults = [];
    renderSearchResults('');
    setTimeout(() => input.focus(), 50);
};

window.closeSearch = function() {
    const modal = document.getElementById('search-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

function renderSearchResults(query) {
    const container = document.getElementById('search-results');
    if (!container) return;
    
    if (!query.trim()) {
        container.innerHTML = '<div class="px-5 py-8 text-center text-sm text-[var(--tx-m)]">Type to start searching...</div>';
        return;
    }
    
    const lowerQuery = query.toLowerCase();
    currentSearchResults = documents.filter(doc => {
        return doc.title.toLowerCase().includes(lowerQuery) || 
               doc.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
               (doc.content && doc.content.toLowerCase().includes(lowerQuery));
    }).slice(0, 15); // Limit to 15 results
    
    if (currentSearchResults.length === 0) {
        container.innerHTML = '<div class="px-5 py-8 text-center text-sm text-[var(--tx-m)]">No documents found.</div>';
        return;
    }
    
    container.innerHTML = currentSearchResults.map((doc, idx) => {
        let matchHint = '';
        if (doc.title.toLowerCase().includes(lowerQuery)) matchHint = 'Title match';
        else if (doc.tags.some(t => t.toLowerCase().includes(lowerQuery))) matchHint = 'Tag match';
        else matchHint = 'Content match';
        
        return `
            <div class="search-item ${idx === searchSelectedIndex ? 'active' : ''}" data-idx="${idx}" data-onclick="selectSearchResult(${idx})">
                <div class="search-item-title">${escHtml(doc.title)}</div>
                <div class="search-item-meta">
                    <span class="cat-badge ${CAT_META[doc.category]?.cls}">${CAT_META[doc.category]?.label}</span>
                    <span class="search-item-match">${matchHint}</span>
                </div>
            </div>
        `;
    }).join('');
}

window.selectSearchResult = function(idx) {
    if (idx < 0 || idx >= currentSearchResults.length) return;
    const doc = currentSearchResults[idx];
    closeSearch();
    navigate('documents', doc.category);
    setTimeout(() => viewDoc(doc.id), 50);
};

// Global Keydown Listener
window.addEventListener('keydown', function(e) {
    // Ctrl+K or Cmd+K
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
    }
    
    const searchModal = document.getElementById('search-modal');
    if (searchModal && !searchModal.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeSearch();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (searchSelectedIndex < currentSearchResults.length - 1) {
                searchSelectedIndex++;
                renderSearchResults(document.getElementById('search-input').value);
                const activeEl = document.querySelector('.search-item.active');
                if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (searchSelectedIndex > 0) {
                searchSelectedIndex--;
                renderSearchResults(document.getElementById('search-input').value);
                const activeEl = document.querySelector('.search-item.active');
                if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (searchSelectedIndex >= 0) {
                selectSearchResult(searchSelectedIndex);
            } else if (currentSearchResults.length > 0) {
                selectSearchResult(0);
            }
        }
    }
});

// Search input listener
document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'search-input') {
        searchSelectedIndex = -1;
        renderSearchResults(e.target.value);
    }
});
