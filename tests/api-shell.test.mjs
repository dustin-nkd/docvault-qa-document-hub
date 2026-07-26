import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { API_SHELL_LIMITS, handleApiRequest as executeApiRequest } from '../functions/_lib/api-shell.mjs';
import { createDeterministicRuntimeDependencies } from './helpers/runtime-dependencies.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const testRuntime = createDeterministicRuntimeDependencies();
const handleApiRequest = (request, env, dependencies = testRuntime.dependencies) => (
    executeApiRequest(request, env, dependencies)
);
const productionEnv = Object.freeze({
    APP_ENV: 'production',
    ORIGIN_POLICY_MODE: 'production',
    CANONICAL_PRODUCTION_ORIGIN: 'https://docvault-qa-document-hub.pages.dev',
    COLLABORATION_ENABLED: 'false'
});
// D-P7-01 (owner-approved 2026-07-26, docs/collaboration-foundation/decision-log.md @ 0d5f3a2)
// activates collaboration for the PREVIEW environment ONLY. The preview fixture therefore has
// to carry COLLABORATION_ENABLED 'true': inheriting 'false' from productionEnv would be a
// stale stub that no longer models what Cloudflare hands the Worker on a preview deployment.
// The NO-OP CONTROL at the bottom of this file pins all three fixtures to the real
// wrangler.jsonc so they cannot silently drift back into stubs.
const previewEnv = Object.freeze({
    ...productionEnv,
    APP_ENV: 'preview',
    ORIGIN_POLICY_MODE: 'preview',
    COLLABORATION_ENABLED: 'true'
});
// The top-level `vars` default. D-P7-01 leaves this switched OFF, exactly like production.
const defaultVarsEnv = Object.freeze({
    APP_ENV: 'local',
    ORIGIN_POLICY_MODE: 'local',
    CANONICAL_PRODUCTION_ORIGIN: 'https://docvault-qa-document-hub.pages.dev',
    COLLABORATION_ENABLED: 'false'
});

const request = (pathName, init = {}) => new Request(
    `https://docvault-qa-document-hub.pages.dev${pathName}`,
    init
);
const requestAt = (origin, pathName, init = {}) => new Request(`${origin}${pathName}`, init);

const readError = async response => {
    const body = await response.json();
    assert.equal(body.meta.apiVersion, 'v1');
    assert.match(body.meta.requestId, /^req_[0-9a-f-]{36}$/);
    assert.equal(response.headers.get('X-Request-ID'), body.meta.requestId);
    assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
    assert.equal(response.headers.get('Pragma'), 'no-cache');
    assert.equal(response.headers.get('Expires'), '0');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    return body.error;
};

test('disabled API shell returns a versioned no-store 503 without business dispatch', async () => {
    const response = await handleApiRequest(request('/api/v1/session'), productionEnv);
    assert.equal(response.status, 503);
    assert.equal((await readError(response)).code, 'COLLABORATION_UNAVAILABLE');
    assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
    assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
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

test('mutation origin matrix rejects hostile variants before body parsing or dispatch', async () => {
    const pathName = '/api/v1/session/logout';
    const baseInit = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: '{broken-json'
    };
    const rejectedOrigins = [
        undefined,
        'null',
        'https://attacker.example',
        'http://docvault-qa-document-hub.pages.dev',
        'https://docvault-qa-document-hub.pages.dev:8443',
        'https://docvault-qa-document-hub.pages.dev.attacker.example'
    ];

    for (const origin of rejectedOrigins) {
        const headers = { ...baseInit.headers };
        if (origin !== undefined) headers.Origin = origin;
        const response = await handleApiRequest(request(pathName, { ...baseInit, headers }), productionEnv);
        assert.equal(response.status, 403, `origin ${String(origin)} must be rejected`);
        assert.equal((await readError(response)).code, 'CSRF_REJECTED');
        assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    }
});

test('exact production and dynamic preview origins are isolated by environment', async () => {
    const productionOrigin = productionEnv.CANONICAL_PRODUCTION_ORIGIN;
    const previewOrigin = 'https://feature-auth.docvault-qa-document-hub.pages.dev';
    const mutation = origin => ({
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: origin
        },
        body: '{}'
    });

    const production = await handleApiRequest(requestAt(productionOrigin, '/api/v1/session/logout', mutation(productionOrigin)), productionEnv);
    assert.equal(production.status, 503);
    assert.equal((await readError(production)).code, 'COLLABORATION_UNAVAILABLE');

    const preview = await handleApiRequest(requestAt(previewOrigin, '/api/v1/session/logout', mutation(previewOrigin)), previewEnv);
    assert.equal(preview.status, 503);
    assert.equal((await readError(preview)).code, 'COLLABORATION_UNAVAILABLE');

    const previewUsingProduction = await handleApiRequest(requestAt(previewOrigin, '/api/v1/session/logout', mutation(productionOrigin)), previewEnv);
    assert.equal(previewUsingProduction.status, 403);
    assert.equal((await readError(previewUsingProduction)).code, 'CSRF_REJECTED');

    const productionUsingPreview = await handleApiRequest(requestAt(previewOrigin, '/api/v1/session/logout', mutation(previewOrigin)), productionEnv);
    assert.equal(productionUsingPreview.status, 403);
    assert.equal((await readError(productionUsingPreview)).code, 'CSRF_REJECTED');

    const canonicalUnderPreviewPolicy = await handleApiRequest(requestAt(productionOrigin, '/api/v1/session/logout', mutation(productionOrigin)), previewEnv);
    assert.equal(canonicalUnderPreviewPolicy.status, 403);
    assert.equal((await readError(canonicalUnderPreviewPolicy)).code, 'CSRF_REJECTED');
});

test('origin comparison follows URL origin normalization without accepting path confusion', async () => {
    const response = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: 'HTTPS://DOCVAULT-QA-DOCUMENT-HUB.PAGES.DEV:443'
        },
        body: '{}'
    }), productionEnv);
    assert.equal(response.status, 503);

    const pathConfusion = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: 'https://docvault-qa-document-hub.pages.dev/attacker'
        },
        body: '{}'
    }), productionEnv);
    assert.equal(pathConfusion.status, 403);
    assert.equal((await readError(pathConfusion)).code, 'CSRF_REJECTED');
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
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
            },
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
            'Content-Type': 'application/json; charset=utf-8',
            Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
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

// D-P7-01 activates collaboration for PREVIEW ONLY; the `production` environment stays
// 'false'. This case already targets PRODUCTION, so the decision does not move it — it is the
// production half of the boundary that must never shift, kept exactly as it was.
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

// The other half of the boundary D-P7-01 leaves switched off. The suite proved the
// production case only; the decision names the top-level `vars` default too, so the
// rejection proof is extended to cover it rather than assumed.
test('valid JSON remains unavailable even when the default vars runtime flag is tampered', async () => {
    const tamperedEnv = { ...defaultVarsEnv, COLLABORATION_ENABLED: 'true' };
    const response = await handleApiRequest(new Request('http://localhost:8788/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: 'http://localhost:8788'
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
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: productionEnv.CANONICAL_PRODUCTION_ORIGIN
        },
        body: failingBody,
        duplex: 'half'
    });
    const response = await handleApiRequest(failingRequest, productionEnv);
    const copy = response.clone();
    assert.equal(response.status, 500);
    assert.equal((await readError(response)).code, 'INTERNAL_ERROR');
    assert.doesNotMatch(await copy.text(), new RegExp(canary));
});

// ---------------------------------------------------------------------------
// NO-OP CONTROL (D-P7-01)
// ---------------------------------------------------------------------------
// Every rejection assertion in this file is only worth something if the REAL, UNMUTATED
// deployment input is ACCEPTED by the REAL gate. If the unmutated input already produced the
// outcome the tamper cases assert, a no-op mutation would produce it identically and the suite
// would be vacuous — green while proving nothing.
//
// This shell has no throw/return duality to test: handleApiRequest converts everything into a
// Response. The equivalent of "does not throw" here is that the unmutated request traverses
// every gate — route, method, Accept, origin, media type, byte limit, JSON syntax — and reaches
// the feature boundary as 503 COLLABORATION_UNAVAILABLE, instead of being short-circuited by a
// gate (403/404/405/406/413/415/400) or collapsing into 500 INTERNAL_ERROR.
//
// D-P7-01 (owner-approved 2026-07-26) put COLLABORATION_ENABLED = 'true' into the real preview
// vars, so this control is what distinguishes "the gate was migrated" from "the tests were bent
// around it".
test('NO-OP CONTROL: the real unmutated wrangler environments reach the shell boundary intact', async () => {
    const wrangler = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
    const shellVars = vars => ({
        APP_ENV: vars.APP_ENV,
        ORIGIN_POLICY_MODE: vars.ORIGIN_POLICY_MODE,
        CANONICAL_PRODUCTION_ORIGIN: vars.CANONICAL_PRODUCTION_ORIGIN,
        COLLABORATION_ENABLED: vars.COLLABORATION_ENABLED
    });

    // The fixtures this suite runs on are the real deployment inputs, not stubs.
    assert.deepEqual(shellVars(wrangler.env.production.vars), { ...productionEnv });
    assert.deepEqual(shellVars(wrangler.env.preview.vars), { ...previewEnv });
    assert.deepEqual(shellVars(wrangler.vars), { ...defaultVarsEnv });

    // The D-P7-01 boundary itself, asserted against the real config rather than a fixture:
    // preview is authorized, production and the default vars must never activate.
    assert.equal(wrangler.env.preview.vars.COLLABORATION_ENABLED, 'true');
    assert.equal(wrangler.env.production.vars.COLLABORATION_ENABLED, 'false');
    assert.equal(wrangler.vars.COLLABORATION_ENABLED, 'false');

    const unmutated = [
        ['production', productionEnv, () => request('/api/v1/session')],
        ['preview', previewEnv, () => requestAt('https://feature-auth.docvault-qa-document-hub.pages.dev', '/api/v1/session')],
        ['default vars', defaultVarsEnv, () => new Request('http://localhost:8788/api/v1/session')]
    ];
    for (const [label, env, buildRequest] of unmutated) {
        let response;
        await assert.doesNotReject(
            async () => { response = await handleApiRequest(buildRequest(), env); },
            `unmutated ${label} input must not make the shell throw`
        );
        assert.notEqual(response.status, 500, `unmutated ${label} input must not collapse into INTERNAL_ERROR`);
        assert.equal(response.status, 503, `unmutated ${label} input must clear every gate and reach the feature boundary`);
        assert.equal((await readError(response)).code, 'COLLABORATION_UNAVAILABLE');
    }

    // Discrimination check: the pipeline's outcomes are actually distinguishable, so the 503
    // above is a cleared-every-gate result and not a blanket answer the shell gives everyone.
    const mutated = await handleApiRequest(request('/api/v1/session/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Origin: 'https://attacker.example'
        },
        body: '{}'
    }), productionEnv);
    assert.equal(mutated.status, 403);
    assert.equal((await readError(mutated)).code, 'CSRF_REJECTED');
});

test('Pages routing invokes Functions only for the versioned API namespace', () => {
    const routes = JSON.parse(fs.readFileSync(path.join(root, '_routes.json'), 'utf8'));
    assert.deepEqual(routes, { version: 1, include: ['/api/v1/*'], exclude: [] });
    const source = fs.readFileSync(path.join(root, 'functions/api/v1/[[path]].ts'), 'utf8');
    assert.doesNotMatch(source, /\bnext\s*\(|passThroughOnException|\bfetch\s*\(/);
    assert.match(source, /PagesFunction<Env, 'path'>/);
});
