import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_SHELL_LIMITS, handleApiRequest } from '../functions/_lib/api-shell.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionEnv = Object.freeze({
    APP_ENV: 'production',
    ORIGIN_POLICY_MODE: 'production',
    CANONICAL_PRODUCTION_ORIGIN: 'https://docvault-qa-document-hub.pages.dev',
    COLLABORATION_ENABLED: 'false'
});

const request = (pathName, init = {}) => new Request(
    `https://docvault-qa-document-hub.pages.dev${pathName}`,
    init
);

const readError = async response => {
    const body = await response.json();
    assert.equal(body.meta.apiVersion, 'v1');
    assert.match(body.meta.requestId, /^req_[0-9a-f-]{36}$/);
    assert.equal(response.headers.get('X-Request-ID'), body.meta.requestId);
    return body.error;
};

test('disabled API shell returns a versioned no-store 503 without business dispatch', async () => {
    const response = await handleApiRequest(request('/api/v1/session'), productionEnv);
    assert.equal(response.status, 503);
    assert.equal((await readError(response)).code, 'COLLABORATION_UNAVAILABLE');
    assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
    assert.equal(response.headers.get('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
});

test('server request IDs are unique and never trust an incoming correlation ID', async () => {
    const first = await handleApiRequest(request('/api/v1/session', { headers: { 'X-Request-ID': 'attacker-value' } }), productionEnv);
    const second = await handleApiRequest(request('/api/v1/session'), productionEnv);
    const firstId = first.headers.get('X-Request-ID');
    const secondId = second.headers.get('X-Request-ID');
    assert.notEqual(firstId, 'attacker-value');
    assert.notEqual(firstId, secondId);
});

test('route and method gates run before the disabled feature response', async () => {
    const missing = await handleApiRequest(request('/api/v1/not-a-route?secret=must-not-echo'), productionEnv);
    const missingCopy = missing.clone();
    assert.equal(missing.status, 404);
    assert.equal((await readError(missing)).code, 'RESOURCE_NOT_FOUND');
    assert.doesNotMatch(await missingCopy.text(), /must-not-echo/);

    const method = await handleApiRequest(request('/api/v1/session', { method: 'DELETE' }), productionEnv);
    assert.equal(method.status, 405);
    assert.equal(method.headers.get('Allow'), 'GET');
    assert.equal((await readError(method)).code, 'METHOD_NOT_ALLOWED');
});

test('Accept gate rejects an incompatible response media type', async () => {
    const unacceptable = await handleApiRequest(request('/api/v1/session', { headers: { Accept: 'text/html' } }), productionEnv);
    assert.equal(unacceptable.status, 406);
    assert.equal((await readError(unacceptable)).code, 'NOT_ACCEPTABLE');
});

test('mutation media type, byte limit, and JSON syntax fail before feature handling', async () => {
    const noMedia = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: { Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN },
        body: '{}'
    }), productionEnv);
    assert.equal(noMedia.status, 415);
    assert.equal((await readError(noMedia)).code, 'UNSUPPORTED_MEDIA_TYPE');

    const oversized = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Length': String(API_SHELL_LIMITS.maxBodyBytes + 1),
            'Content-Type': 'application/json; charset=utf-8',
            Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
        },
        body: '{}'
    }), productionEnv);
    assert.equal(oversized.status, 413);
    assert.equal((await readError(oversized)).code, 'PAYLOAD_TOO_LARGE');

    const streamedBody = new ReadableStream({
        start(controller) {
            controller.enqueue(new Uint8Array(API_SHELL_LIMITS.maxBodyBytes + 1));
            controller.close();
        }
    });
    const streamedOversized = await handleApiRequest(new Request(
        'https://docvault-qa-document-hub.pages.dev/api/v1/session/logout',
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: streamedBody,
            duplex: 'half'
        }
    ), productionEnv);
    assert.equal(streamedOversized.status, 413);
    assert.equal((await readError(streamedOversized)).code, 'PAYLOAD_TOO_LARGE');

    const invalidLength = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Length': 'not-a-number',
            'Content-Type': 'application/json; charset=utf-8'
        },
        body: '{}'
    }), productionEnv);
    assert.equal(invalidLength.status, 400);
    assert.equal((await readError(invalidLength)).code, 'VALIDATION_FAILED');

    const oversizedQuery = await handleApiRequest(request(`/api/v1/session?q=${'x'.repeat(API_SHELL_LIMITS.maxQueryBytes + 1)}`), productionEnv);
    assert.equal(oversizedQuery.status, 400);
    assert.equal((await readError(oversizedQuery)).code, 'VALIDATION_FAILED');

    const malformed = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
        },
        body: '{"token":"must-not-echo"'
    }), productionEnv);
    assert.equal(malformed.status, 400);
    assert.equal((await readError(malformed)).code, 'INVALID_JSON');
});

test('valid JSON remains unavailable even when a runtime flag is tampered', async () => {
    const tamperedEnv = { ...productionEnv, COLLABORATION_ENABLED: 'true' };
    const response = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
        },
        body: '{}'
    }), tamperedEnv);
    assert.equal(response.status, 503);
    assert.equal((await readError(response)).code, 'COLLABORATION_UNAVAILABLE');
});

test('unexpected body-stream failures return sanitized JSON without an exception page', async () => {
    const canary = 'PROHIBITED_INTERNAL_STACK_CANARY';
    const failingBody = new ReadableStream({
        start(controller) {
            controller.error(new Error(canary));
        }
    });
    const failingRequest = new Request('https://docvault-qa-document-hub.pages.dev/api/v1/session/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: failingBody,
        duplex: 'half'
    });
    const response = await handleApiRequest(failingRequest, productionEnv);
    const copy = response.clone();
    assert.equal(response.status, 500);
    assert.equal((await readError(response)).code, 'INTERNAL_ERROR');
    assert.doesNotMatch(await copy.text(), new RegExp(canary));
});

test('Pages routing invokes Functions only for the versioned API namespace', () => {
    const routes = JSON.parse(fs.readFileSync(path.join(root, '_routes.json'), 'utf8'));
    assert.deepEqual(routes, { version: 1, include: ['/api/v1/*'], exclude: [] });
    const source = fs.readFileSync(path.join(root, 'functions/api/v1/[[path]].ts'), 'utf8');
    assert.doesNotMatch(source, /\bnext\s*\(|passThroughOnException|\bfetch\s*\(/);
    assert.match(source, /PagesFunction<Env, 'path'>/);
});
