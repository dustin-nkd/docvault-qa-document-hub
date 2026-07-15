import { vi } from 'vitest';

export const HARNESS_FIXTURE = Object.freeze({
    id: 'fixture-baseline',
    value: 'deterministic-baseline',
    createdAt: 1_784_073_600_000
});

export const PRIVACY_CANARY = 'cf-p1-007-private-canary-do-not-log';

export type HarnessRecord = {
    id: string;
    value: string;
    created_at: number;
};

export type HarnessSnapshot = {
    count: number;
    records: HarnessRecord[];
};

export async function resetHarnessDatabase(db: D1Database): Promise<void> {
    await db.batch([
        db.prepare('DELETE FROM harness_records'),
        db.prepare('INSERT INTO harness_records (id, value, created_at) VALUES (?, ?, ?)')
            .bind(HARNESS_FIXTURE.id, HARNESS_FIXTURE.value, HARNESS_FIXTURE.createdAt)
    ]);
}

export async function snapshotHarnessDatabase(db: D1Database): Promise<HarnessSnapshot> {
    const count = await db.prepare('SELECT COUNT(*) AS count FROM harness_records').first<number>('count');
    const result = await db.prepare(
        'SELECT id, value, created_at FROM harness_records ORDER BY id'
    ).all<HarnessRecord>();
    return {
        count: count ?? 0,
        records: result.results
    };
}

type OriginVariant = 'exact' | 'missing' | 'null' | 'foreign' | 'suffix-confusion';
type SessionVariant = 'none' | 'valid-shape' | 'privacy-canary';

const ORIGINS: Record<Exclude<OriginVariant, 'missing'>, string> = Object.freeze({
    exact: 'http://localhost',
    null: 'null',
    foreign: 'https://foreign.example',
    'suffix-confusion': 'https://docvault-qa-document-hub.pages.dev.attacker.example'
});

export function createApiRequest(options: {
    path?: string;
    method?: string;
    origin?: OriginVariant;
    session?: SessionVariant;
    body?: unknown;
} = {}): Request {
    const method = options.method ?? 'GET';
    const origin = options.origin ?? 'exact';
    const session = options.session ?? 'none';
    const headers = new Headers({ Accept: 'application/json' });
    if (origin !== 'missing') headers.set('Origin', ORIGINS[origin]);
    if (session === 'valid-shape') headers.set('Cookie', 'dv_session=opaque-test-session');
    if (session === 'privacy-canary') headers.set('Cookie', `dv_session=${PRIVACY_CANARY}`);

    let body: string | undefined;
    if (!['GET', 'HEAD'].includes(method)) {
        headers.set('Content-Type', 'application/json; charset=utf-8');
        body = JSON.stringify(options.body ?? {});
    }
    return new Request(`http://localhost${options.path ?? '/api/v1/session'}`, {
        method,
        headers,
        body
    });
}

export function createConsoleCapture() {
    const records: string[] = [];
    const capture = (...args: unknown[]) => records.push(args.map(value => String(value)).join(' '));
    const spies = [
        vi.spyOn(console, 'debug').mockImplementation(capture),
        vi.spyOn(console, 'info').mockImplementation(capture),
        vi.spyOn(console, 'log').mockImplementation(capture),
        vi.spyOn(console, 'warn').mockImplementation(capture),
        vi.spyOn(console, 'error').mockImplementation(capture)
    ];
    return {
        records,
        containsPrivacyCanary: () => records.some(record => record.includes(PRIVACY_CANARY)),
        restore: () => spies.forEach(spy => spy.mockRestore())
    };
}
