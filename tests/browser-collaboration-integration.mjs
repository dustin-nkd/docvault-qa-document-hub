// CF-P7-013 — the composed shell, driven end to end in a real browser.
//
// CF-P7-012 qualified each surface in isolation against the real stylesheet.
// This qualifies what a user actually gets: the entry, loaded the way the app
// loads it, resolving a session and filling every surface from its own
// authorized read — over a stubbed transport, so no deployment is touched.
//
// The transport is stubbed and nothing else is. The module graph, the CSS, the
// layout, and every model are the shipped ones, because the failure this story
// exists to remove was invisible to every part-wise check that came before it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox, webkit } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browsers = { chromium, firefox, webkit };
const required = (process.env.DOCVAULT_INTEGRATION_MATRIX || 'chromium').split(',');

const WIDTHS = Object.freeze([
    { name: '320', width: 320, height: 800 },
    { name: 'tablet-portrait', width: 768, height: 1024 },
    { name: 'tablet-landscape', width: 1024, height: 768 }
]);

/** Long enough to break a container that does not truncate. */
const LONG = 'Platform Quality Assurance and Release Engineering Working Group Alpha';

const OWNER = '11111111-1111-4111-8111-111111111111';
const WORKSPACE = '55555555-5555-4555-8555-555555555555';
const INVITATION = '66666666-6666-4666-8666-666666666666';
const EVENT = '99999999-9999-4999-8999-999999999999';

/** Only what the entry's module graph actually pulls, plus the stylesheet. */
const SERVED = new Set([
    'style.css',
    ...fs.readdirSync(path.join(root, 'js', 'collaboration'))
        .filter(name => name.endsWith('.js'))
        .map(name => `js/collaboration/${name}`)
]);

const PAGE = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/style.css">
<style>
:root{--bg:#070b14;--bg2:#0d1424;--card:#131c2e;--card-h:#1a2540;--brd:#1e2d4a;--brd-l:#2a3f66;
--tx:#e8edf5;--tx-m:#7a8ba8;--tx-d:#4a5d7a;--acc:#10b981;--acc-l:#34d399;--acc-d:#059669;
--c-tc:#f59e0b;--c-bug:#ef4444;--c-tp:#3b82f6;--c-rel:#a855f7;}
[data-theme="light"]{--bg:#f0f4f8;--bg2:#f8fafc;--card:#fff;--card-h:#f0f4f8;--brd:#dde3ec;
--brd-l:#c1cfe0;--tx:#0e1a2d;--tx-m:#3d5068;--tx-d:#6b7fa0;--acc-l:#10b981;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font-family:system-ui,sans-serif}
main{display:block}
</style></head><body><main>
<div id="collaboration-root" class="collab-root" hidden></div>
</main>
<script type="module" src="/drive.js"></script></body></html>`;

const SESSION = {
    data: {
        authenticated: true,
        user: { userId: OWNER, login: LONG },
        session: {},
        csrfToken: 'csrf'
    },
    meta: {}
};

const ROUTES = {
    '/api/v1/session': SESSION,
    '/api/v1/workspaces': {
        data: {
            items: [{
                workspaceId: WORKSPACE, displayName: LONG, role: 'owner',
                keyReadiness: 'key_ready'
            }]
        },
        meta: { page: { nextCursor: null } }
    },
    [`/api/v1/workspaces/${WORKSPACE}/members`]: {
        data: {
            items: [
                {
                    userId: OWNER, role: 'owner', state: 'active', keyReadiness: 'key_ready',
                    displayProfile: { login: LONG }
                },
                {
                    userId: '22222222-2222-4222-8222-222222222222', role: 'viewer',
                    state: 'active', keyReadiness: 'pending_key',
                    displayProfile: { login: 'octocat' }
                }
            ]
        },
        meta: { page: { nextCursor: null } }
    },
    [`/api/v1/workspaces/${WORKSPACE}/invitations`]: {
        data: {
            items: [{
                invitationId: INVITATION, targetDisplayLogin: LONG, role: 'admin',
                state: 'pending', expiresAt: '2026-07-29T00:00:00.000Z'
            }]
        },
        meta: { page: { nextCursor: null } }
    },
    [`/api/v1/workspaces/${WORKSPACE}/audit-events`]: {
        data: {
            items: [{
                eventId: EVENT, eventType: 'workspace.member.role_changed', outcome: 'success',
                occurredAt: '2026-07-26T00:00:00.000Z', reasonCode: 'owner_request'
            }]
        },
        meta: { page: { nextCursor: 'opaque-next' } }
    },
    [`/api/v1/workspaces/${WORKSPACE}/key-envelopes/current`]: {
        data: { readiness: 'pending_key', envelope: null },
        meta: {}
    }
};

const DRIVER = `
const ROUTES = ${JSON.stringify(ROUTES)};
const DENIED = new URLSearchParams(location.search).get('deny');

// The one thing stubbed. Everything below it is the shipped graph.
const calls = [];
globalThis.fetch = async (url) => {
    const pathname = String(url).split('?')[0];
    calls.push(pathname);
    const body = ROUTES[pathname];
    const fail = (status, code) => new Response(JSON.stringify({ error: { code }, meta: {} }),
        { status, headers: { 'content-type': 'application/json' } });
    if (DENIED && pathname.endsWith('/' + DENIED)) return fail(403, 'OPERATION_NOT_PERMITTED');
    if (body === undefined) return fail(404, 'RESOURCE_NOT_FOUND');
    return new Response(JSON.stringify(body),
        { status: 200, headers: { 'content-type': 'application/json' } });
};
globalThis.__collabCalls = calls;

// The ?pick query starts with nothing remembered, so the switcher must be used.
if (!new URLSearchParams(location.search).has('pick')) {
    localStorage.setItem('docvault:collab:preview:${OWNER}:active-workspace', '${WORKSPACE}');
} else {
    localStorage.removeItem('docvault:collab:preview:${OWNER}:active-workspace');
}

const module = await import('/js/collaboration/entry.js');
await module.startCollaboration({
    document,
    deployment: { available: true, reason: 'cloudflare-deployment' },
    storage: localStorage,
    environment: 'preview'
});
document.body.setAttribute('data-ready', 'true');
`;

function startServer() {
    const server = http.createServer((request, response) => {
        const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
        if (pathname === '/') {
            response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            response.end(PAGE);
            return;
        }
        if (pathname === '/drive.js') {
            response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
            response.end(DRIVER);
            return;
        }
        const relative = pathname.replace(/^\/+/, '');
        if (!SERVED.has(relative)) { response.writeHead(404).end(); return; }
        const type = relative.endsWith('.css') ? 'text/css' : 'text/javascript';
        response.writeHead(200,
            { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' });
        fs.createReadStream(path.join(root, ...relative.split('/'))).pipe(response);
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
        resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}` });
    }));
}

/* eslint-disable no-undef */
function measureInPage() {
    const de = document.documentElement;
    const nodes = [...document.querySelectorAll('#collaboration-root *')];
    const overflowing = nodes.filter(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.right > de.clientWidth + 0.5;
    }).map(node => node.className || node.tagName);
    const clipped = nodes.filter(node => {
        const style = getComputedStyle(node);
        if (style.overflow === 'auto' || style.overflow === 'scroll') return false;
        if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return false;
        return node.scrollWidth > node.clientWidth + 1 && node.clientWidth > 0
            && style.textOverflow !== 'ellipsis' && style.overflowWrap !== 'anywhere';
    }).map(node => node.className || node.tagName);
    const tooSmall = [...document.querySelectorAll('#collaboration-root button, '
        + '#collaboration-root input')].filter(node => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && (box.height < 24 || box.width < 24);
    }).map(node => node.className);
    return {
        horizontalPageScroll: de.scrollWidth > de.clientWidth,
        overflowing, clipped, tooSmall
    };
}

function inspectInPage() {
    const surfaces = [...document.querySelectorAll('[data-surface]')]
        .map(node => node.getAttribute('data-surface'));
    const states = Object.fromEntries([...document.querySelectorAll('[data-surface]')]
        .map(node => [node.getAttribute('data-surface'),
            node.firstElementChild?.getAttribute('data-collab-state') ?? 'rendered']));
    const disabledWithoutReason = [...document.querySelectorAll(
        '#collaboration-root button:disabled')].filter(node => {
        const id = node.getAttribute('aria-describedby');
        const described = id ? document.getElementById(id) : null;
        const title = node.getAttribute('title');
        return !(described && described.textContent.trim().length >= 10)
            && !(title && title.trim().length >= 10);
    }).map(node => node.className);
    return {
        surfaces,
        states,
        disabledWithoutReason,
        calls: globalThis.__collabCalls ?? [],
        text: document.getElementById('collaboration-root').textContent,
        liveRegions: [...document.querySelectorAll('#collaboration-root [aria-live]')]
            .map(node => node.getAttribute('aria-live'))
    };
}
/* eslint-enable no-undef */

async function drive(browserName, baseUrl, query = '') {
    const browser = await browsers[browserName].launch({ headless: true });
    try {
        const page = await (await browser.newContext()).newPage();
        const errors = [];
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${baseUrl}/${query}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('body[data-ready="true"]');

        const perWidth = [];
        for (const size of WIDTHS) {
            await page.setViewportSize({ width: size.width, height: size.height });
            for (const theme of ['dark', 'light']) {
                await page.evaluate(value =>
                    document.documentElement.setAttribute('data-theme', value), theme);
                perWidth.push({ width: size.name, theme, ...await page.evaluate(measureInPage) });
                // Off by default: a screenshot proves nothing an assertion does
                // not, and is only wanted when a person is going to look at it.
                if (process.env.DOCVAULT_INTEGRATION_SHOTS && query === '') {
                    await page.screenshot({
                        fullPage: true,
                        path: path.join(process.env.DOCVAULT_INTEGRATION_SHOTS,
                            `${browserName}-${size.name}-${theme}.png`)
                    });
                }
            }
        }
        return { browserName, perWidth, ...await page.evaluate(inspectInPage), errors };
    } finally {
        await browser.close();
    }
}

/** Open the switcher and choose the one workspace, the way a person would. */
async function pickWorkspace(browserName, baseUrl) {
    const browser = await browsers[browserName].launch({ headless: true });
    try {
        const page = await (await browser.newContext()).newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(`${baseUrl}/?pick`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('body[data-ready="true"]');
        const before = await page.evaluate(() => [...(globalThis.__collabCalls ?? [])]);

        await page.click('.collab-switcher__trigger');
        await page.click('[data-collab-action="workspace-switch"]');
        await page.waitForSelector('[data-collab-surface="member-list-role-badge"]');

        return {
            errors,
            before,
            after: await page.evaluate(() => [...(globalThis.__collabCalls ?? [])]),
            text: await page.evaluate(() =>
                document.getElementById('collaboration-root').textContent),
            remembered: await page.evaluate(() =>
                localStorage.getItem(
                    [...Array(localStorage.length).keys()]
                        .map(index => localStorage.key(index))
                        .find(key => key.endsWith(':active-workspace')) ?? ''))
        };
    } finally {
        await browser.close();
    }
}

const EXPECTED = Object.freeze(['create-workspace', 'device-key-initialization',
    'member-list-role-badge', 'invitation-manage', 'invitation-accept', 'sync-state',
    'conflict-dialog', 'audit-activity']);

const { server, baseUrl } = await startServer();
try {
    const summary = [];
    for (const browserName of required) {
        assert.ok(browsers[browserName], `Unknown browser: ${browserName}`);
        const result = await drive(browserName, baseUrl);
        assert.deepEqual(result.errors, [], `${browserName}: runtime errors`);

        // Every surface the panel owns is on the page, from the shipped graph.
        for (const surface of EXPECTED) {
            assert.ok(result.surfaces.includes(surface),
                `${browserName}: ${surface} never mounted`);
        }

        // The defect this story exists to remove: a surface that says it is
        // loading and never stops. Nothing may be left in that state once every
        // read has come back.
        const stuck = Object.entries(result.states)
            .filter(([, state]) => state === 'loading')
            .map(([surface]) => surface);
        assert.deepEqual(stuck, [], `${browserName}: surfaces left on loading`);

        // Filled from the deployment, not from defaults.
        assert.match(result.text, /octocat/, `${browserName}: the member read never rendered`);
        assert.match(result.text, /workspace\.member\.role_changed/,
            `${browserName}: the audit read never rendered`);
        assert.ok(result.calls.includes(`/api/v1/workspaces/${WORKSPACE}/members`),
            `${browserName}: the member route was never called`);
        assert.ok(result.calls.includes(`/api/v1/workspaces/${WORKSPACE}/audit-events`),
            `${browserName}: the audit route was never called`);

        assert.deepEqual(result.disabledWithoutReason, [],
            `${browserName}: disabled controls with no announced reason`);
        assert.ok(result.liveRegions.every(value => value === 'polite' || value === 'assertive'),
            `${browserName}: an unexpected aria-live value`);

        for (const measured of result.perWidth) {
            const where = `${browserName} ${measured.width} ${measured.theme}`;
            assert.deepEqual(measured.overflowing, [], `${where}: overflowing controls`);
            assert.equal(measured.horizontalPageScroll, false, `${where}: horizontal page scroll`);
            assert.deepEqual(measured.clipped, [], `${where}: clipped text`);
            assert.deepEqual(measured.tooSmall, [], `${where}: targets under 24 px`);
        }

        // A denied read must land as that surface's error, with its neighbours
        // still rendering — the property the unit tests assert, confirmed here
        // against the real DOM rather than a fake one.
        const denied = await drive(browserName, baseUrl, '?deny=members');
        assert.deepEqual(denied.errors, [], `${browserName}: runtime errors under denial`);
        assert.equal(denied.states['member-list-role-badge'], 'error',
            `${browserName}: a denied read did not become that surface's error`);
        assert.match(denied.text, /workspace\.member\.role_changed/,
            `${browserName}: one denied read took a neighbouring surface down with it`);

        // A first-time visitor has nothing remembered, so the switcher is the
        // only way into a workspace. Until this story nothing listened to it,
        // and every workspace-scoped surface stayed empty no matter what was
        // clicked — which looks exactly like an account with no workspaces.
        const picked = await pickWorkspace(browserName, baseUrl);
        assert.deepEqual(picked.errors, [], `${browserName}: runtime errors while switching`);
        assert.equal(picked.before.includes(`/api/v1/workspaces/${WORKSPACE}/members`), false,
            `${browserName}: a workspace was read before one was chosen`);
        assert.ok(picked.after.includes(`/api/v1/workspaces/${WORKSPACE}/members`),
            `${browserName}: choosing a workspace read nothing`);
        assert.match(picked.text, /octocat/,
            `${browserName}: the chosen workspace's members never rendered`);
        assert.equal(picked.remembered, WORKSPACE,
            `${browserName}: the choice was not remembered, so a reload would lose it`);

        summary.push({
            browser: browserName,
            surfaces: new Set(result.surfaces).size,
            widths: result.perWidth.length,
            routesCalled: new Set(result.calls).size,
            stuckOnLoading: stuck.length
        });
    }

    fs.writeFileSync(path.join(root, 'config/cloudflare/phase-7-integration-result.json'),
        `${JSON.stringify({
            generated_by: 'tests/browser-collaboration-integration.mjs', summary
        }, null, 2)}\n`);
    console.log(`CF-P7-013 composed-shell integration passed (${summary.length} browsers)`);
    for (const entry of summary) {
        console.log(`  ${entry.browser}: ${entry.surfaces} surfaces mounted, `
            + `${entry.routesCalled} routes called, ${entry.stuckOnLoading} left on loading, `
            + `measured at ${entry.widths} width/theme combinations`);
    }
} finally {
    server.close();
}
