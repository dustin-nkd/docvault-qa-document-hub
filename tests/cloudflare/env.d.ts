import type { D1Migration } from 'cloudflare:test';

declare global {
    namespace Cloudflare {
        interface Env {
            COLLAB_DB: D1Database;
            TEST_MIGRATIONS: D1Migration[];
            COLLAB_MIGRATIONS: D1Migration[];
            TEST_RUNTIME: 'workers-vitest-local';
        }
    }
}

export {};
