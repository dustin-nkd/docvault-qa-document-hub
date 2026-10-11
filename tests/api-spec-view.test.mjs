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
        location: { search: '' },
        localStorage: { getItem: () => null, setItem: () => {} }
    });
    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-core.js',
        'js/render-editor-categories.js',
        'js/render-editor.js',
        'js/render-viewer-categories.js',
        'js/actions-imports.js',
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
        context,
        render: (doc, isShared) => {
            if (isShared !== undefined) {
                vm.runInContext(`state.sharedView = ${Boolean(isShared)};`, context);
            }
            context._doc = doc;
            return vm.runInContext('renderViewerCategory(_doc)', context);
        }
    };
}

test('API Spec view: orders renders multiple response examples (201, 400, 401), active 201 body, and no Try it remnants', () => {
    const ordersDoc = {
        id: 'api-orders',
        title: 'POST /api/v1/orders',
        category: 'api',
        status: 'published',
        apiData: {
            method: 'POST',
            endpoint: '/api/v1/orders',
            module: 'Checkout',
            changeImpact: 'high',
            headers: [{ key: 'Authorization', value: 'Bearer token', req: true }],
            params: [],
            body: '{"sku":"TSHIRT-M-BLK"}',
            statusCode: '201',
            response: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}',
            responses: [
                { code: '201', body: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}' },
                { code: '400', body: '{\n  "error": "items is required"\n}' },
                { code: '401', body: '{\n  "error": "missing or invalid token"\n}' }
            ]
        }
    };

    const { render, context } = createViewerCategoryRenderer([ordersDoc]);
    const html = render(ordersDoc);

    // Assert chips
    assert.ok(html.includes('201'), 'Should contain 201 response code chip');
    assert.ok(html.includes('400'), 'Should contain 400 response code chip');
    assert.ok(html.includes('401'), 'Should contain 401 response code chip');

    // Assert bodies
    assert.ok(html.includes('ord_5521'), 'Should contain active 201 response body ord_5521');
    assert.ok(html.includes('items is required'), 'Should contain 400 response body string items is required');

    // Assert Try it is completely gone
    assert.ok(!html.includes('Try it'), 'Should not contain "Try it" button or label');
    assert.ok(!html.includes('api-tryit'), 'Should not contain api-tryit class or id');
    assert.ok(!html.includes('mock.docvault.dev'), 'Should not contain mock.docvault.dev');
    assert.ok(!html.includes('tryApiRequest'), 'Should not contain tryApiRequest');

    // Primary example of orders
    const primaryOrders = vm.runInContext('_primaryApiExample(_normalizeApiResponses(_doc.apiData))', context);
    assert.equal(primaryOrders.code, '201', 'Primary API example of orders should be 201');
});

test('API Spec view: spec with only statusCode 200 and response renders 200 chip and body', () => {
    const singleSpec = {
        id: 'api-users',
        title: 'GET /api/v1/users',
        category: 'api',
        status: 'published',
        apiData: {
            method: 'GET',
            endpoint: '/api/v1/users',
            module: 'Authentication',
            statusCode: '200',
            response: '{"ok":true}'
        }
    };

    const { render } = createViewerCategoryRenderer([singleSpec]);
    const html = render(singleSpec);

    assert.ok(html.includes('200'), 'Should contain 200 chip');
    assert.ok(html.includes('{&quot;ok&quot;:true}') || html.includes('{"ok":true}'), 'Should contain response body');
});

test('API Spec view: empty body renders "No response body defined."', () => {
    const emptySpec = {
        id: 'api-empty',
        title: 'DELETE /api/v1/items/{id}',
        category: 'api',
        status: 'published',
        apiData: {
            method: 'DELETE',
            endpoint: '/api/v1/items/{id}',
            statusCode: '204',
            response: ''
        }
    };

    const { render } = createViewerCategoryRenderer([emptySpec]);
    const html = render(emptySpec);

    assert.ok(html.includes('No response body defined.'), 'Should render "No response body defined." for empty body');
});

test('API helpers: _normalizeApiResponses drops duplicates and invalid codes, _primaryApiExample picks first 2xx or first item', () => {
    const { context } = createViewerCategoryRenderer();

    // Deduplication and code filtering
    const normalized = vm.runInContext(`_normalizeApiResponses({
        responses: [
            { code: '200', body: 'first' },
            { code: '200', body: 'second' },
            { code: '999', body: 'invalid' },
            { code: 'default', body: 'skip' },
            { code: '400', body: 'bad' }
        ]
    })`, context);

    assert.equal(normalized.length, 2, 'Should only keep valid unique codes');
    assert.equal(normalized[0].code, '200');
    assert.equal(normalized[0].body, 'first');
    assert.equal(normalized[1].code, '400');
    assert.equal(normalized[1].body, 'bad');

    // _primaryApiExample on 400 and 500 list
    const primaryNon2xx = vm.runInContext(`_primaryApiExample([
        { code: '400', body: 'bad' },
        { code: '500', body: 'err' }
    ])`, context);
    assert.equal(primaryNon2xx.code, '400', 'Should pick first item when no 2xx exists');
});

test('Source hygiene: codebase contains no API_TRYIT_MOCK_BASE and no function tryApiRequest', () => {
    const files = [
        'js/constants.js',
        'js/actions-imports.js',
        'js/render-viewer-categories.js'
    ];
    for (const rel of files) {
        const content = fs.readFileSync(path.join(root, rel), 'utf8');
        assert.ok(!content.includes('API_TRYIT_MOCK_BASE'), `${rel} must not contain API_TRYIT_MOCK_BASE`);
        assert.ok(!content.includes('function tryApiRequest'), `${rel} must not contain function tryApiRequest`);
        assert.ok(!content.includes('tryApiRequest ='), `${rel} must not contain tryApiRequest =`);
    }
});
