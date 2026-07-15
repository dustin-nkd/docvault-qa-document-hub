import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { handleApiRequest } from '../../functions/_lib/api-shell.mjs';
import { createDeterministicRuntimeDependencies } from '../helpers/runtime-dependencies.mjs';
import {
    createApiRequest,
    createConsoleCapture,
    snapshotHarnessDatabase
} from './helpers/harness';

describe('CF-P1-007 API integration seams', () => {
    const captures: ReturnType<typeof createConsoleCapture>[] = [];

    afterEach(() => {
        captures.splice(0).forEach(capture => capture.restore());
    });

    it('keeps disabled requests deterministic and free of D1 or log side effects', async () => {
        const before = await snapshotHarnessDatabase(env.COLLAB_DB);
        const runtime = createDeterministicRuntimeDependencies();
        const capture = createConsoleCapture();
        captures.push(capture);

        const response = await handleApiRequest(
            createApiRequest({ session: 'privacy-canary' }),
            env,
            runtime.dependencies
        );

        expect(response.status).toBe(503);
        expect(response.headers.get('X-Request-ID')).toBe(
            'req_00000000-0000-4000-8000-000000000001'
        );
        expect(await response.json()).toMatchObject({
            error: { code: 'COLLABORATION_UNAVAILABLE' }
        });
        expect(await snapshotHarnessDatabase(env.COLLAB_DB)).toEqual(before);
        expect(runtime.calls.checkpoints).toEqual(['api.before-disabled-boundary']);
        expect(capture.records).toEqual([]);
        expect(capture.containsPrivacyCanary()).toBe(false);
    });

    it('keeps injected failures sanitized and side-effect free', async () => {
        const before = await snapshotHarnessDatabase(env.COLLAB_DB);
        const runtime = createDeterministicRuntimeDependencies({
            failAt: ['api.before-disabled-boundary']
        });

        const response = await handleApiRequest(createApiRequest(), env, runtime.dependencies);
        const source = await response.text();
        expect(response.status).toBe(500);
        expect(source).toContain('INTERNAL_ERROR');
        expect(source).not.toContain('Injected failure');
        expect(await snapshotHarnessDatabase(env.COLLAB_DB)).toEqual(before);
    });

    it('rejects hostile origins before the failure checkpoint and without D1 writes', async () => {
        const before = await snapshotHarnessDatabase(env.COLLAB_DB);
        const runtime = createDeterministicRuntimeDependencies();
        const response = await handleApiRequest(
            createApiRequest({
                path: '/api/v1/session/logout',
                method: 'POST',
                origin: 'suffix-confusion'
            }),
            env,
            runtime.dependencies
        );

        expect(response.status).toBe(403);
        expect(runtime.calls.checkpoints).toEqual([]);
        expect(await snapshotHarnessDatabase(env.COLLAB_DB)).toEqual(before);
    });
});
