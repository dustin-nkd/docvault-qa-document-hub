import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createViewerCategoryRenderer(initialDocs = [], sharedView = false) {
    const context = vm.createContext({
        console,
        window: {},
        state: { sharedView },
        URLSearchParams,
        location: { search: '' }
    });
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-viewer-categories.js',
        'js/render-viewer.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }
    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);
    vm.runInContext(`state.sharedView = ${Boolean(sharedView)};`, context);

    return {
        render: (doc, isShared) => {
            if (isShared !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
            }
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        }
    };
}

test('Environment view: Staging guest fixture renders Healthy chip, notes in card, no viewer-container, and normal view credentials', () => {
    const credAdmin = {
        id: 'gd_cred_admin',
        title: 'Staging Admin Credentials',
        category: 'credential',
        status: 'published'
    };
    const envStaging = {
        id: 'gd_env_staging',
        title: 'Staging',
        category: 'environment',
        tags: ['staging'],
        status: 'published',
        envData: {
            status: 'healthy',
            properties: [
                { label: 'Frontend URL', value: 'https://staging.shop.test', secret: false },
                { label: 'Backend API URL', value: 'https://api-staging.shop.test', secret: false },
                { label: 'Database Connection', value: 'postgres://staging-db.internal:5432/shop', secret: true }
            ],
            linkedCreds: ['gd_cred_admin'],
            notes: 'Reset data every night at 02:00. Use this environment for the daily regression suite.'
        },
        content: ''
    };

    const renderer = createViewerCategoryRenderer([credAdmin, envStaging], false);
    const html = renderer.render(envStaging, false);

    assert.ok(html.includes('Healthy'), 'renders Healthy chip');
    assert.ok(html.includes('#10b981'), 'renders healthy color #10b981');
    assert.ok(!html.match(/env-viewer-status[^"]*uppercase/), 'status chip does not have uppercase class');
    assert.ok(html.includes('Notes'), 'renders Notes heading');
    assert.ok(html.includes('Reset data every night at 02:00. Use this environment for the daily regression suite.'), 'renders staging notes text');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container');
    assert.ok(html.includes('Staging Admin Credentials'), 'renders linked credential title');
    assert.ok(html.includes('data-onclick="viewDoc(\'gd_cred_admin\')"'), 'renders clickable link to credential on normal view');
    assert.ok(html.includes('cursor-pointer'), 'renders cursor-pointer on normal view');
});

test('Environment view: Production guest fixture renders Degraded chip, notes in card, and no viewer-container', () => {
    const credPayment = {
        id: 'gd_cred_payment',
        title: 'Payment Gateway Sandbox Key',
        category: 'credential',
        status: 'published'
    };
    const envProd = {
        id: 'gd_env_prod',
        title: 'Production',
        category: 'environment',
        tags: ['production'],
        status: 'published',
        envData: {
            status: 'degraded',
            properties: [
                { label: 'Frontend URL', value: 'https://shop.test', secret: false },
                { label: 'Backend API URL', value: 'https://api.shop.test', secret: false }
            ],
            linkedCreds: ['gd_cred_payment'],
            notes: 'Monitor the elevated payment-service error rate after the latest deployment.'
        },
        content: ''
    };

    const renderer = createViewerCategoryRenderer([credPayment, envProd], false);
    const html = renderer.render(envProd, false);

    assert.ok(html.includes('Degraded'), 'renders Degraded chip');
    assert.ok(html.includes('#f59e0b'), 'renders degraded color #f59e0b');
    assert.ok(!html.match(/env-viewer-status[^"]*uppercase/), 'status chip does not have uppercase class');
    assert.ok(html.includes('Notes'), 'renders Notes heading');
    assert.ok(html.includes('Monitor the elevated payment-service error rate after the latest deployment.'), 'renders production notes text');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container');
});

test('Environment view: status variants maintenance, down, and missing/unknown render correct labels and colors', () => {
    const renderer = createViewerCategoryRenderer([]);

    const envMaintenance = {
        id: 'env-maint',
        title: 'Maintenance Env',
        category: 'environment',
        status: 'published',
        envData: { status: 'maintenance' },
        content: ''
    };
    const htmlMaint = renderer.render(envMaintenance, false);
    assert.ok(htmlMaint.includes('Maintenance'), 'renders Maintenance chip');
    assert.ok(htmlMaint.includes('#f59e0b'), 'renders maintenance color #f59e0b');

    const envDown = {
        id: 'env-down',
        title: 'Down Env',
        category: 'environment',
        status: 'published',
        envData: { status: 'down' },
        content: ''
    };
    const htmlDown = renderer.render(envDown, false);
    assert.ok(htmlDown.includes('Down'), 'renders Down chip');
    assert.ok(htmlDown.includes('#ef4444'), 'renders down color #ef4444');

    const envMissing = {
        id: 'env-missing',
        title: 'Missing Status Env',
        category: 'environment',
        status: 'published',
        envData: {},
        content: ''
    };
    const htmlMissing = renderer.render(envMissing, false);
    assert.ok(htmlMissing.includes('Unknown'), 'renders Unknown chip when status is missing');
    assert.ok(htmlMissing.includes('var(--tx-d)'), 'renders Unknown color var(--tx-d)');
});

test('Environment view: whitespace-only notes and content do not render Notes heading, viewer-container, or hidden content', () => {
    const envBlankNotes = {
        id: 'env-blank',
        title: 'Blank Notes Env',
        category: 'environment',
        status: 'published',
        envData: {
            status: 'healthy',
            notes: '   '
        },
        content: '# Environment Notes\nstill hidden'
    };

    const renderer = createViewerCategoryRenderer([envBlankNotes], false);
    const html = renderer.render(envBlankNotes, false);

    assert.ok(!html.includes('>Notes<'), 'does not render Notes heading');
    assert.ok(!html.includes('id="viewer-container"'), 'does not render viewer-container');
    assert.ok(!html.includes('still hidden'), 'does not render content text still hidden');
});

test('Environment view: sharedView displays credential title without data-onclick="viewDoc" or cursor-pointer', () => {
    const cred = {
        id: 'cred-1',
        title: 'API Gateway Token',
        category: 'credential',
        status: 'published'
    };
    const env = {
        id: 'env-shared',
        title: 'Shared Env',
        category: 'environment',
        status: 'published',
        envData: {
            status: 'healthy',
            linkedCreds: ['cred-1'],
            notes: 'Shared environment notes.'
        },
        content: ''
    };

    const renderer = createViewerCategoryRenderer([cred, env], true);
    const htmlShared = renderer.render(env, true);

    assert.ok(htmlShared.includes('API Gateway Token'), 'displays linked credential title in sharedView');
    assert.ok(!htmlShared.includes('data-onclick="viewDoc"'), 'no data-onclick="viewDoc" in sharedView');
    assert.ok(!htmlShared.includes('cursor-pointer'), 'no cursor-pointer in sharedView for credential item');
    assert.ok(htmlShared.includes('Shared environment notes.'), 'displays notes in sharedView');
    assert.ok(!htmlShared.includes('id="viewer-container"'), 'does not render viewer-container in sharedView');
});
