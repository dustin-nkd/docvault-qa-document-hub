import test from 'node:test';
import assert from 'node:assert/strict';
import { handleApiRequest } from '../functions/_lib/api-shell.mjs';
import {
    PLATFORM_DEPENDENCIES,
    PlatformCapabilityUnavailableError,
    RUNTIME_DEPENDENCY_LIMITS
} from '../functions/_lib/runtime-dependencies.mjs';
import { createDeterministicRuntimeDependencies } from './helpers/runtime-dependencies.mjs';

const productionEnv = Object.freeze({
    APP_ENV: 'production',
    ORIGIN_POLICY_MODE: 'production',
    CANONICAL_PRODUCTION_ORIGIN: 'https://docvault-qa-document-hub.pages.dev',
    COLLABORATION_ENABLED: 'false'
});

test('deterministic dependencies control clock, IDs, random values, OAuth, and checkpoints', async () => {
    const harness = createDeterministicRuntimeDependencies({
        now: 1_750_000_000_000,
        uuidSequence: 41,
        byteSeed: 32
    });
    assert.equal(harness.dependencies.clock.now(), 1_750_000_000_000);
    harness.advance(250);
    assert.equal(harness.dependencies.clock.now(), 1_750_000_000_250);
    assert.equal(harness.dependencies.ids.uuid(), '00000000-0000-4000-8000-000000000041');
    assert.deepEqual([...harness.dependencies.random.bytes(4)], [32, 33, 34, 35]);
    assert.equal(harness.dependencies.random.token(4), 'ICEiIw');

    const token = await harness.dependencies.oauth.exchangeAuthorizationCode({
        code: 'unit-code',
        redirectUri: 'https://preview.example/callback',
        pkceVerifier: 'unit-verifier'
    });
    assert.equal(token.accessToken, 'unit-provider-token');
    const identity = await harness.dependencies.oauth.fetchIdentity(token.accessToken);
    assert.equal(identity.providerSubject, 'provider-subject-1001');
    assert.equal(harness.calls.oauthExchanges.length, 1);
    assert.deepEqual(harness.calls.oauthIdentityTokens, ['unit-provider-token']);
});

test('injected request IDs and failures are deterministic without request or environment selectors', async () => {
    const harness = createDeterministicRuntimeDependencies({
        uuidSequence: 91,
        failAt: ['api.before-disabled-boundary']
    });
    const response = await handleApiRequest(new Request(
        'https://docvault-qa-document-hub.pages.dev/api/v1/session'
    ), productionEnv, harness.dependencies);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(body.meta.requestId, 'req_00000000-0000-4000-8000-000000000091');
    assert.deepEqual(harness.calls.checkpoints, ['api.before-disabled-boundary']);
    assert.doesNotMatch(JSON.stringify(body), /Injected failure/);
});

test('production dependencies use platform time and Web Crypto while OAuth stays unavailable', async () => {
    const before = Date.now();
    const now = PLATFORM_DEPENDENCIES.clock.now();
    const after = Date.now();
    assert.ok(now >= before && now <= after);

    const firstId = PLATFORM_DEPENDENCIES.ids.uuid();
    const secondId = PLATFORM_DEPENDENCIES.ids.uuid();
    assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.notEqual(firstId, secondId);
    assert.equal(PLATFORM_DEPENDENCIES.random.bytes(24).byteLength, 24);
    assert.match(PLATFORM_DEPENDENCIES.random.token(), /^[A-Za-z0-9_-]{43}$/);
    assert.throws(() => PLATFORM_DEPENDENCIES.random.bytes(0), RangeError);
    assert.throws(() => PLATFORM_DEPENDENCIES.random.bytes(RUNTIME_DEPENDENCY_LIMITS.maxRandomBytes + 1), RangeError);
    await assert.rejects(
        PLATFORM_DEPENDENCIES.oauth.exchangeAuthorizationCode({
            code: 'unused', redirectUri: 'https://example.invalid', pkceVerifier: 'unused'
        }),
        PlatformCapabilityUnavailableError
    );
    await PLATFORM_DEPENDENCIES.failures.checkpoint('production-no-op');
});
