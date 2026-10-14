import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function createApiTestExampleContext(initialDocs = []) {
    let renderCount = 0;
    const formElements = {
        'ed-apitc-api': { value: 'api-orders' },
        'ed-apitc-module': { value: 'Checkout' },
        'ed-apitc-scenario': { value: 'positive' },
        'ed-apitc-priority': { value: 'P2' },
        'ed-apitc-precond': { value: '' },
        'ed-apitc-method': { value: 'POST' },
        'ed-apitc-endpoint': { value: '/api/v1/orders' },
        'ed-apitc-body': { value: '{"sku":"TSHIRT-M-BLK"}' },
        'ed-apitc-status': { value: '201' },
        'ed-apitc-expected-body': { value: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}' }
    };

    const mockDocument = {
        getElementById: (id) => formElements[id] || null,
        querySelectorAll: () => []
    };

    const sandbox = {
        console,
        state: {
            view: 'editor',
            editingDoc: {
                id: 'apitc-1',
                category: 'apitest',
                title: 'Orders API Test',
                apiTcData: {
                    module: 'Checkout',
                    scenario: 'positive',
                    linkedApiId: 'api-orders',
                    method: 'POST',
                    endpoint: '/api/v1/orders',
                    expectedStatus: '201',
                    expectedBody: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}'
                }
            }
        },
        document: mockDocument,
        documents: initialDocs,
        URLSearchParams,
        location: { search: '' }
    };
    sandbox.window = sandbox;

    const context = vm.createContext(sandbox);

    const scripts = [
        'js/constants.js',
        'js/utils.js',
        'js/state.js',
        'js/render-editor-categories.js',
        'js/actions-imports.js'
    ];
    for (const file of scripts) {
        const code = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(code, context, { filename: file });
    }

    context._currentDocs = initialDocs;
    vm.runInContext('documents = _currentDocs;', context);

    vm.runInContext(`
        state.view = 'editor';
        state.editingDoc = {
            id: 'apitc-1',
            category: 'apitest',
            title: 'Orders API Test',
            apiTcData: {
                module: 'Checkout',
                scenario: 'positive',
                linkedApiId: 'api-orders',
                method: 'POST',
                endpoint: '/api/v1/orders',
                expectedStatus: '201',
                expectedBody: '{\\n  "orderId": "ord_5521",\\n  "status": "confirmed",\\n  "total": 458000\\n}'
            }
        };
        render = function() {
            _renderCount++;
            const stored = state.editingDoc?.apiTcData || state._newApiTcData;
            if (stored) {
                if (document.getElementById('ed-apitc-status')) document.getElementById('ed-apitc-status').value = stored.expectedStatus;
                if (document.getElementById('ed-apitc-expected-body')) document.getElementById('ed-apitc-expected-body').value = stored.expectedBody;
                if (document.getElementById('ed-apitc-api')) document.getElementById('ed-apitc-api').value = stored.linkedApiId || '';
            }
        };
    `, context);
    context._renderCount = 0;

    return {
        context,
        formElements,
        getRenderCount: () => context._renderCount
    };
}

test('_linkedApiExampleBody helper resolves bodies from spec responses, handles legacy specs, and preserves empty bodies', () => {
    const ordersSpec = {
        id: 'api-orders',
        category: 'api',
        title: 'POST /api/v1/orders',
        status: 'published',
        apiData: {
            method: 'POST',
            endpoint: '/api/v1/orders',
            statusCode: '201',
            response: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}',
            responses: [
                { code: '201', body: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}' },
                { code: '400', body: '{\n  "error": "items is required"\n}' },
                { code: '401', body: '{\n  "error": "missing or invalid token"\n}' }
            ]
        }
    };

    const { context } = createApiTestExampleContext([ordersSpec]);

    // 1. Spec with responses 201, 400, 401
    const body400 = vm.runInContext(`_linkedApiExampleBody(documents[0], '400')`, context);
    assert.equal(body400, '{\n  "error": "items is required"\n}');

    const body401 = vm.runInContext(`_linkedApiExampleBody(documents[0], '401')`, context);
    assert.equal(body401, '{\n  "error": "missing or invalid token"\n}');

    const body201 = vm.runInContext(`_linkedApiExampleBody(documents[0], '201')`, context);
    assert.ok(body201.includes('ord_5521'));

    const body404 = vm.runInContext(`_linkedApiExampleBody(documents[0], '404')`, context);
    assert.equal(body404, null);

    // 2. Legacy spec { statusCode: '200', response: '{"ok":true}' } without responses
    const legacySpec = {
        statusCode: '200',
        response: '{"ok":true}'
    };
    context._legacySpec = legacySpec;
    const legacy200 = vm.runInContext(`_linkedApiExampleBody(_legacySpec, '200')`, context);
    assert.equal(legacy200, '{"ok":true}');

    const legacy400 = vm.runInContext(`_linkedApiExampleBody(_legacySpec, '400')`, context);
    assert.equal(legacy400, null);

    // 3. Row { code: '204', body: '' } returns '', not null
    const noContentSpec = {
        responses: [
            { code: '204', body: '' }
        ]
    };
    context._noContentSpec = noContentSpec;
    const body204 = vm.runInContext(`_linkedApiExampleBody(_noContentSpec, '204')`, context);
    assert.equal(body204, '');
    assert.notEqual(body204, null);
});

test('applyApiTestExample updates expectedStatus and expectedBody, preserves scenario, and sets state._apiTcFormAuthoritative', () => {
    const ordersSpec = {
        id: 'api-orders',
        category: 'api',
        title: 'POST /api/v1/orders',
        status: 'published',
        apiData: {
            method: 'POST',
            endpoint: '/api/v1/orders',
            statusCode: '201',
            response: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}',
            responses: [
                { code: '201', body: '{\n  "orderId": "ord_5521",\n  "status": "confirmed",\n  "total": 458000\n}' },
                { code: '400', body: '{\n  "error": "items is required"\n}' },
                { code: '401', body: '{\n  "error": "missing or invalid token"\n}' }
            ]
        }
    };

    const { context, formElements, getRenderCount } = createApiTestExampleContext([ordersSpec]);

    // 1. Initial form state: 201, positive
    assert.equal(formElements['ed-apitc-status'].value, '201');
    assert.equal(formElements['ed-apitc-scenario'].value, 'positive');

    // 2. Select 400
    vm.runInContext(`applyApiTestExample('400')`, context);
    let stored = vm.runInContext('state.editingDoc.apiTcData', context);
    assert.equal(stored.expectedStatus, '400');
    assert.equal(stored.expectedBody, '{\n  "error": "items is required"\n}');
    assert.equal(stored.scenario, 'positive');
    assert.equal(vm.runInContext('state._apiTcFormAuthoritative', context), true);
    assert.equal(getRenderCount(), 1);

    // 3. Select 404 on spec without 404: preserves existing body
    vm.runInContext(`applyApiTestExample('404')`, context);
    stored = vm.runInContext('state.editingDoc.apiTcData', context);
    assert.equal(stored.expectedStatus, '404');
    assert.equal(stored.expectedBody, '{\n  "error": "items is required"\n}');
    assert.equal(vm.runInContext('state._apiTcFormAuthoritative', context), true);
    assert.equal(getRenderCount(), 2);

    // 4. No linkedApiId: select 500 changes status and preserves body
    formElements['ed-apitc-api'].value = '';
    vm.runInContext(`applyApiTestExample('500')`, context);
    stored = vm.runInContext('state.editingDoc.apiTcData', context);
    assert.equal(stored.expectedStatus, '500');
    assert.equal(stored.expectedBody, '{\n  "error": "items is required"\n}');
    assert.equal(vm.runInContext('state._apiTcFormAuthoritative', context), true);
    assert.equal(getRenderCount(), 3);
});

test('render-editor-categories.js contracts: contains applyApiTestExample and retains applyLinkedApiSpec fallback', () => {
    const code = fs.readFileSync(path.join(root, 'js/render-editor-categories.js'), 'utf8');
    assert.ok(code.includes('applyApiTestExample(this.value)'), 'must wire applyApiTestExample(this.value) on ed-apitc-status');
    assert.ok(code.includes("expectedStatus: switching ? (api.statusCode || '200')"), 'applyLinkedApiSpec must retain primary statusCode fallback');
    assert.ok(code.includes("expectedBody: switching ? (api.response || '')"), 'applyLinkedApiSpec must retain primary response fallback');
});
