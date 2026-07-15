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
        'functions/_lib/runtime-dependencies.mjs',
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
