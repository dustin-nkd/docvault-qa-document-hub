import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { HARNESS_FIXTURE, snapshotHarnessDatabase } from './helpers/harness';

describe('CF-P1-007 disposable D1 harness', () => {
    it('runs inside Workers Vitest with a local-only D1 binding', async () => {
        expect(env.TEST_RUNTIME).toBe('workers-vitest-local');
        expect(env.COLLAB_DB.prepare).toBeTypeOf('function');
        await expect(fetch('https://api.cloudflare.com/client/v4/accounts')).resolves.toMatchObject({
            status: 599
        });
    });

    it('applies the official migration and starts from the deterministic fixture', async () => {
        const migration = await env.COLLAB_DB.prepare(
            'SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 1'
        ).first<{ name: string }>();
        expect(migration?.name).toBe('0001_test_harness.sql');
        expect(await snapshotHarnessDatabase(env.COLLAB_DB)).toEqual({
            count: 1,
            records: [{
                id: HARNESS_FIXTURE.id,
                value: HARNESS_FIXTURE.value,
                created_at: HARNESS_FIXTURE.createdAt
            }]
        });
    });

    it('uses actual prepare, bind, first, and batch behavior', async () => {
        await env.COLLAB_DB.prepare(
            'INSERT INTO harness_records (id, value, created_at) VALUES (?, ?, ?)'
        ).bind('prepared-row', 'prepared', 101).run();

        const prepared = await env.COLLAB_DB.prepare(
            'SELECT value FROM harness_records WHERE id = ?'
        ).bind('prepared-row').first<string>('value');
        expect(prepared).toBe('prepared');

        const batch = await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                'INSERT INTO harness_records (id, value, created_at) VALUES (?, ?, ?)'
            ).bind('batch-a', 'first', 102),
            env.COLLAB_DB.prepare(
                'INSERT INTO harness_records (id, value, created_at) VALUES (?, ?, ?)'
            ).bind('batch-b', 'second', 103)
        ]);
        expect(batch).toHaveLength(2);
        expect(batch.every(result => result.success)).toBe(true);
        expect((await snapshotHarnessDatabase(env.COLLAB_DB)).count).toBe(4);
    });

    it('reports invalid migrations as a hard failure without persisting schema', async () => {
        await expect(applyD1Migrations(env.COLLAB_DB, [{
            name: '9999_invalid_test_migration.sql',
            queries: ['CREATE TABLE invalid_gate (id TEXT PRIMARY KEY)', 'INVALID SQL']
        }], 'invalid_migration_gate')).rejects.toThrow();

        const leakedTable = await env.COLLAB_DB.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'invalid_gate'"
        ).first<string>('name');
        expect(leakedTable).toBeNull();
    });

    it('resets mutations before every test in this file', async () => {
        expect(await snapshotHarnessDatabase(env.COLLAB_DB)).toEqual({
            count: 1,
            records: [{
                id: HARNESS_FIXTURE.id,
                value: HARNESS_FIXTURE.value,
                created_at: HARNESS_FIXTURE.createdAt
            }]
        });
    });
});
