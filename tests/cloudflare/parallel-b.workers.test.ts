import { env } from 'cloudflare:workers';
import { expect, it } from 'vitest';
import { snapshotHarnessDatabase } from './helpers/harness';

it('isolates parallel worker B storage', async () => {
    await env.COLLAB_DB.prepare(
        'INSERT INTO harness_records (id, value, created_at) VALUES (?, ?, ?)'
    ).bind('parallel-shared-key', 'worker-b', 202).run();
    const snapshot = await snapshotHarnessDatabase(env.COLLAB_DB);
    expect(snapshot.count).toBe(2);
    expect(snapshot.records.find(record => record.id === 'parallel-shared-key')?.value).toBe('worker-b');
});
