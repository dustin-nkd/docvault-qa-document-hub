import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    isCompatibleSchema,
    isRuntimeSchemaCompatible,
    type SchemaMetadataRow
} from '../../functions/_lib/collaboration-schema';
import { handleApiRequest } from '../../functions/_lib/api-shell.mjs';
import { createDeterministicRuntimeDependencies } from '../helpers/runtime-dependencies.mjs';
import { createApiRequest } from './helpers/harness';

const USER_ID = '12121212-1212-4212-8212-121212121212';

async function metadata(): Promise<SchemaMetadataRow> {
    const row = await env.COLLAB_DB.prepare(
        `SELECT singleton_id, schema_version, minimum_runtime_schema, maximum_runtime_schema,
                migration_set_digest, updated_at
         FROM schema_metadata WHERE singleton_id = 1`
    ).first<SchemaMetadataRow>();
    if (row === null) throw new Error('schema metadata is missing');
    return row;
}

describe('CF-P2-006 migration and adjacent-runtime compatibility matrix', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS.slice(0, 8), 'compatibility_migrations');
        await env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', '1212', 'synthetic-restored-user', NULL, NULL,
                     'active', 1, 1, NULL)`
        ).bind(USER_ID).run();
    });

    it('keeps the new runtime disabled and side-effect free on the immediately previous schema', async () => {
        const before = await metadata();
        expect(before.schema_version).toBe(8);
        expect(isCompatibleSchema(before)).toBe(false);
        const runtime = createDeterministicRuntimeDependencies();
        const response = await handleApiRequest(createApiRequest(), env, runtime.dependencies);
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({ error: { code: 'COLLABORATION_UNAVAILABLE' } });
        expect(await metadata()).toEqual(before);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users WHERE id = ?')
            .bind(USER_ID).first<number>('count')).toBe(1);
    });

    it('rolls back malformed/interrupted migration 0009, then upgrades populated state exactly once', async () => {
        const correction = env.COLLAB_MIGRATIONS[8];
        await expect(applyD1Migrations(env.COLLAB_DB, [{
            name: '0009_interrupted_retention_purge_control.sql',
            queries: [...correction.queries, 'INVALID MIGRATION CHECKPOINT']
        }], 'interrupted_retention_migration')).rejects.toThrow();
        expect((await metadata()).schema_version).toBe(8);
        expect(await env.COLLAB_DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'retention_purge_runs'"
        ).first<string>('name')).toBeNull();
        expect(await env.COLLAB_DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'audit_events_no_delete'"
        ).first<string>('name')).toBe('audit_events_no_delete');

        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'compatibility_migrations');
        const expanded = await metadata();
        expect(expanded.schema_version).toBe(12);
        expect(isCompatibleSchema(expanded)).toBe(true);
        expect(isRuntimeSchemaCompatible(expanded, 8)).toBe(true);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users WHERE id = ?')
            .bind(USER_ID).first<number>('count')).toBe(1);
        await expect(applyD1Migrations(
            env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'compatibility_migrations'
        )).resolves.toBeUndefined();
        expect(await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS count FROM compatibility_migrations'
        ).first<number>('count')).toBe(12);
        expect((await env.COLLAB_DB.prepare('PRAGMA foreign_key_check').all()).results).toEqual([]);
    });
});
