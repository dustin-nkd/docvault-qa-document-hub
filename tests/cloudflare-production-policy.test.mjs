import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validateProductionMetafile,
    validateProductionHandlerWiring,
    validateProductionSourceGraph,
    validateProductionSourceText
} from '../scripts/cloudflare-production-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('production import graph contains only reviewed Function runtime modules', () => {
    assert.deepEqual(validateProductionSourceGraph(root), [
        'functions/_lib/api-shell.mjs',
        'functions/_lib/audit/audit-reader.ts',
        'functions/_lib/audit/cursor.ts',
        'functions/_lib/audit/event-registry.ts',
        'functions/_lib/audit/index.ts',
        'functions/_lib/collaboration/control-plane-cursor.ts',
        'functions/_lib/collaboration/runtime-handler.ts',
        'functions/_lib/identity/abuse-control.ts',
        'functions/_lib/identity/cookies.ts',
        'functions/_lib/identity/crypto.ts',
        'functions/_lib/identity/encoding.ts',
        'functions/_lib/identity/environment.ts',
        'functions/_lib/identity/github-oauth-adapter.ts',
        'functions/_lib/identity/index.ts',
        'functions/_lib/identity/oauth-callback-repository.ts',
        'functions/_lib/identity/oauth-callback-service.ts',
        'functions/_lib/identity/oauth-envelope.ts',
        'functions/_lib/identity/oauth-transaction-repository.ts',
        'functions/_lib/identity/oauth-transaction-service.ts',
        'functions/_lib/identity/observability.ts',
        'functions/_lib/identity/provider-resilience.ts',
        'functions/_lib/identity/request-policy.ts',
        'functions/_lib/identity/return-path.ts',
        'functions/_lib/identity/runtime-handler.ts',
        'functions/_lib/identity/session-repository.ts',
        'functions/_lib/identity/session-service.ts',
        'functions/_lib/invitations/github-resolver.ts',
        'functions/_lib/invitations/index.ts',
        'functions/_lib/invitations/invitation-lifecycle.ts',
        'functions/_lib/invitations/token.ts',
        'functions/_lib/memberships/index.ts',
        'functions/_lib/memberships/membership-administration.ts',
        'functions/_lib/persistence/atomic-batch.ts',
        'functions/_lib/persistence/authorization-session.ts',
        'functions/_lib/persistence/idempotency.ts',
        'functions/_lib/persistence/index.ts',
        'functions/_lib/persistence/mutation-recipes.ts',
        'functions/_lib/persistence/repository.ts',
        'functions/_lib/persistence/retention.ts',
        'functions/_lib/rbac/index.ts',
        'functions/_lib/rbac/policy.ts',
        'functions/_lib/rbac/repository.ts',
        'functions/_lib/runtime-dependencies.mjs',
        'functions/_lib/workspaces/index.ts',
        'functions/_lib/workspaces/workspace-bootstrap.ts',
        'functions/api/v1/[[path]].ts'
    ]);
});

test('source policy rejects bypass selectors, unsafe typing, secret comparison, and mutable globals', () => {
    for (const source of [
        'const TEST_MODE = true;',
        'const binding = value as unknown as RuntimeDependencies;',
        '/** @type {any} */ const env = {};',
        'const accepted = sessionSecret === providedSecret;',
        'let currentRequest = null;'
    ]) {
        assert.throws(() => validateProductionSourceText('functions/unsafe.ts', source));
    }
});

test('production handler wiring cannot select dependencies from request or environment state', () => {
    const approved = `
        import { handleApiRequest } from '../../_lib/api-shell.mjs';
        import { PLATFORM_DEPENDENCIES } from '../../_lib/runtime-dependencies.mjs';
        export const onRequest = context => handleApiRequest(context.request, context.env, PLATFORM_DEPENDENCIES);
    `;
    assert.equal(validateProductionHandlerWiring(approved), true);
    assert.throws(() => validateProductionHandlerWiring(approved.replace(
        'PLATFORM_DEPENDENCIES);',
        'context.env.TEST_MODE ? injected : PLATFORM_DEPENDENCIES);'
    )));
});

test('compiled artifact policy rejects test imports and deterministic fixture markers', () => {
    assert.equal(validateProductionMetafile({ inputs: {
        '_lib/api-shell.mjs': {},
        '_lib/runtime-dependencies.mjs': {}
    } }, 'production bundle'), true);
    assert.throws(() => validateProductionMetafile({
        inputs: { '../tests/helpers/runtime-dependencies.mjs': {} }
    }, 'production bundle'), /imports test code/);
    assert.throws(() => validateProductionMetafile({ inputs: {} },
        'createDeterministicRuntimeDependencies()'), /test artifact marker/);
});
