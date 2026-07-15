import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));
const migrationsPath = path.join(root, 'tests', 'cloudflare', 'migrations');

export default defineConfig({
    plugins: [
        cloudflareTest(async () => ({
            remoteBindings: false,
            wrangler: {
                configPath: './wrangler.jsonc'
            },
            miniflare: {
                bindings: {
                    TEST_MIGRATIONS: await readD1Migrations(migrationsPath),
                    TEST_RUNTIME: 'workers-vitest-local'
                },
                d1Databases: ['COLLAB_DB'],
                d1Persist: false,
                outboundService: () => new Response(
                    JSON.stringify({ error: 'OUTBOUND_NETWORK_BLOCKED' }),
                    {
                        status: 599,
                        headers: { 'Content-Type': 'application/json; charset=utf-8' }
                    }
                )
            }
        }))
    ],
    test: {
        include: ['tests/cloudflare/**/*.workers.test.ts'],
        setupFiles: ['./tests/cloudflare/setup.ts'],
        testTimeout: 10_000
    }
});
