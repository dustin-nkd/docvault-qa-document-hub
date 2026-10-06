import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadApiTestCase() {
    const context = vm.createContext({ console, window: {} });
    const source = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8') +
        '\n;globalThis.__apiTcTest = { buildApiTestSteps, apiTestCaseMarkdown };';
    vm.runInContext(source, context, { filename: 'js/utils.js' });
    return context.__apiTcTest;
}

test('an API test case becomes one runnable step', () => {
    const { buildApiTestSteps } = loadApiTestCase();
    const steps = buildApiTestSteps({
        method: 'POST',
        endpoint: '/api/v1/orders',
        pathParams: [{ key: 'id', value: 'ord_1' }],
        query: [{ key: 'verbose', value: '1' }],
        headers: [{ key: 'Authorization', value: 'Bearer x' }, { key: '', value: 'skip' }],
        body: '{ "sku": "A" }',
        expectedStatus: '201',
        expectedBody: '{ "status": "confirmed" }',
        checks: [
            { path: 'status', expected: 'confirmed' },
            { path: 'orderId', expected: '' },
            { path: '  ', expected: 'nope' }
        ]
    });
    assert.equal(steps.length, 1);
    assert.equal(
        steps[0].action,
        'Send POST /api/v1/orders with path id=ord_1; query verbose=1; headers Authorization; the saved request body.'
    );
    assert.equal(
        steps[0].expected,
        'Status 201. response body matches the expected sample. status = confirmed. orderId is present'
    );
    const empty = buildApiTestSteps(null)[0];
    assert.equal(empty.action, 'Send GET /.');
    assert.equal(empty.expected, 'Response matches this case.');
});

test('API test markdown keeps the request, the checks, and escapes table cells', () => {
    const { apiTestCaseMarkdown } = loadApiTestCase();
    const md = apiTestCaseMarkdown('Create order', {
        scenario: 'negative',
        priority: 'P1',
        module: 'Checkout',
        method: 'POST',
        endpoint: '/api/v1/orders',
        expectedStatus: '422',
        precond: 'Cart is empty',
        headers: [{ key: 'Authorization', value: 'Bearer x' }],
        checks: [{ path: 'error.code', expected: 'empty_cart' }, { path: 'a|b', expected: 'x\ny' }]
    });
    assert.match(md, /# Create order/);
    assert.match(md, /\*\*Scenario:\*\* negative \| \*\*Priority:\*\* P1/);
    assert.match(md, /\*\*Module:\*\* Checkout/);
    assert.match(md, /`POST \/api\/v1\/orders`/);
    assert.match(md, /`422`/);
    assert.match(md, /Cart is empty/);
    assert.match(md, /\| Authorization \| Bearer x \|/);
    assert.match(md, /\| error\.code \| empty_cart \|/);
    assert.match(md, /\| a\\\|b \| x y \|/);
});
