import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteRoot = path.join(root, '_site');
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2'
};

function readProductionHeaders() {
    const source = fs.readFileSync(path.join(siteRoot, '_headers'), 'utf8');
    const headers = {};
    for (const line of source.split(/\r?\n/).slice(1)) {
        const match = line.match(/^\s+([^:]+):\s*(.+)$/);
        if (match) headers[match[1]] = match[2];
    }
    return headers;
}

function startServer() {
    const productionHeaders = readProductionHeaders();
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const candidate = path.resolve(siteRoot, requested);
        const safeCandidate = candidate.startsWith(siteRoot + path.sep) ? candidate : path.join(siteRoot, 'index.html');
        const filePath = fs.existsSync(safeCandidate) && fs.statSync(safeCandidate).isFile()
            ? safeCandidate
            : path.join(siteRoot, 'index.html');
        response.writeHead(200, {
            ...productionHeaders,
            'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream'
        });
        fs.createReadStream(filePath).pipe(response);
    });
    return new Promise(resolve => {
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

function trackRuntimeErrors(page) {
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') {
            const location = message.location();
            // Credential favicons are best-effort third-party decoration; a missing icon uses the local fallback.
            if (location.url?.startsWith('https://icons.duckduckgo.com/')) return;
            errors.push('console: ' + message.text() + (location.url ? ' @ ' + location.url : ''));
        }
    });
    page.on('pageerror', error => errors.push('page: ' + error.message));
    return errors;
}

async function run() {
    assert.ok(fs.existsSync(path.join(siteRoot, 'index.html')), 'Run npm run build:pages before browser smoke tests');
    const { server, baseUrl } = await startServer();
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        const runtimeErrors = trackRuntimeErrors(page);
        const requestedAssets = [];
        page.on('request', request => requestedAssets.push(new URL(request.url()).pathname));

        const initialResponse = await page.goto(baseUrl + '/?guest=1', { waitUntil: 'networkidle' });
        assert.match(initialResponse.headers()['content-security-policy'] || '', /script-src 'self'/);
        assert.equal(initialResponse.headers()['x-content-type-options'], 'nosniff');
        assert.equal(initialResponse.headers()['x-frame-options'], 'DENY');
        await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();

        const submittedPassword = await page.evaluate(async () => {
            window.__cspSubmitPassword = null;
            window.LocalAuth.unlock = password => { window.__cspSubmitPassword = password; };
            document.getElementById('master-password').value = 'csp-regression';
            document.querySelector('#lock-screen form[data-onsubmit]').dispatchEvent(new SubmitEvent('submit', {
                bubbles: true,
                cancelable: true
            }));
            return window.__cspSubmitPassword;
        });
        assert.equal(submittedPassword, 'csp-regression', 'Unlock form must submit through CSP-safe delegation');

        assert.equal(await page.locator('.trend-card svg').count(), 5, 'Dashboard must render all five trend charts');
        assert.equal(requestedAssets.some(pathname => pathname.includes('/vendor/toastui/')), false, 'Dashboard must not load the editor runtime');

        await page.getByRole('button', { name: 'All', exact: true }).click();
        await page.getByText('6 bugs opened in all', { exact: true }).waitFor();

        const semanticViolations = await page.evaluate(() => [...document.querySelectorAll('[data-onclick]')]
            .filter(element => !['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName))
            .filter(element => element.getAttribute('aria-hidden') !== 'true')
            .filter(element => !element.hasAttribute('role') || element.getAttribute('tabindex') !== '0')
            .map(element => element.outerHTML.slice(0, 160)));
        assert.deepEqual(semanticViolations, [], 'Delegated controls must expose keyboard semantics');

        await page.getByRole('button', { name: 'New Document', exact: true }).click();
        await page.locator('button[data-onclick="createDoc(null)"]').click();
        await page.locator('#app-header').getByRole('heading', { name: 'New Document', exact: true }).waitFor();
        await page.locator('#editor-container .toastui-editor-defaultUI').waitFor();
        assert.equal(new Set(requestedAssets.filter(pathname => pathname.includes('/vendor/toastui/'))).size, 3, 'Editor runtime assets must load once on demand');
        await page.locator('#ed-title').fill('Wave 5A browser regression');
        await page.locator('#app-header').getByRole('button', { name: 'Save', exact: true }).click();
        await page.getByRole('heading', { name: 'Wave 5A browser regression', exact: true, level: 1 }).waitFor();

        await page.goto(baseUrl + '/?view=gd_release_1&guest=1', { waitUntil: 'networkidle' });
        const runRow = page.locator('.ui-hover-card').filter({ hasText: 'Sprint 24' });
        await runRow.waitFor();
        const backgroundBefore = await runRow.evaluate(element => getComputedStyle(element).backgroundColor);
        await runRow.hover();
        await page.waitForTimeout(200);
        const backgroundHover = await runRow.evaluate(element => getComputedStyle(element).backgroundColor);
        assert.notEqual(backgroundHover, backgroundBefore, 'Release linked row must visibly highlight on hover');
        await page.mouse.move(1, 1);
        await page.waitForTimeout(200);
        const backgroundAfter = await runRow.evaluate(element => getComputedStyle(element).backgroundColor);
        assert.equal(backgroundAfter, backgroundBefore, 'Release linked row must restore its base background after hover');
        assert.ok(await page.locator('.ui-hover-card').count() >= 6, 'Release linked evidence must use the shared CSS hover state');

        const categoryDocuments = [
            ['gd_rb_1', 'Daily Regression Kickoff Runbook'],
            ['gd_kn_1', 'When to mark a test step Blocked or Failed'],
            ['gd_tc_login', 'Login — Valid & Invalid Credentials'],
            ['gd_task_1', 'Write test cases for the Checkout retry flow'],
            ['gd_bug_1', 'Cart loses products after refreshing Checkout'],
            ['gd_testplan_1', 'Release v2.4.0 Test Plan'],
            ['gd_api_users', 'GET /api/v1/users/{id}'],
            ['gd_cred_admin', 'staging-admin.shop.test'],
            ['gd_env_staging', 'Staging'],
            ['gd_run_sprint24', 'Sprint 24 — Regression Run'],
            ['gd_release_1', 'v2.4.0 — Checkout Reliability']
        ];
        for (const [id, title] of categoryDocuments) {
            await page.goto(baseUrl + `/?view=${id}&guest=1`, { waitUntil: 'networkidle' });
            const viewerTitle = page.locator('#content > .fade-up > h1').first();
            await viewerTitle.waitFor();
            assert.equal((await viewerTitle.textContent()).trim(), title, `Viewer must render ${id}`);
            await page.evaluate(documentId => {
                const source = documents.find(doc => doc.id === documentId);
                state.editingDoc = JSON.parse(JSON.stringify(source));
                state.view = 'editor';
                render();
            }, id);
            await page.locator('#ed-title').waitFor();
            assert.equal(await page.locator('#ed-title').inputValue(), title, `Editor must render ${id}`);
        }

        await page.goto(baseUrl + '/?guest=1', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: 'Focus', exact: true }).click();
        const manageButtons = page.getByRole('button', { name: 'Manage', exact: true });
        assert.ok(await manageButtons.count() > 0, 'Focus queue must expose workflow management');
        await manageButtons.first().click();
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        assert.equal(await page.getByRole('dialog').count(), 0, 'Focus dialog must close cleanly');

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(baseUrl + '/?guest=1', { waitUntil: 'networkidle' });
        const mobileDocs = page.locator('#bottom-nav [data-view="documents"]');
        await mobileDocs.click();
        await page.getByRole('heading', { name: 'All Documents', exact: true }).waitFor();

        assert.deepEqual(runtimeErrors, [], 'Browser smoke tests must not emit runtime errors');
        await context.close();
        process.stdout.write('Browser regression suite passed: dashboard, all category renderers, release hover, focus, mobile, semantics\n');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
