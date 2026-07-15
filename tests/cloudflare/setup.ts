import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach } from 'vitest';
import { resetHarnessDatabase } from './helpers/harness';

beforeAll(async () => {
    await applyD1Migrations(env.COLLAB_DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
    await resetHarnessDatabase(env.COLLAB_DB);
});
