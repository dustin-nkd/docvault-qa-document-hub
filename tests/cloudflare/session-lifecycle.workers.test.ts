import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    digestSessionToken,
    generateOpaqueToken,
    hasRecentAuthentication,
    logoutSession,
    parseIdentityKeyring,
    resolveSessionCookie,
    resolveSessionToken,
    rotateLiveSession,
    SESSION_LIFECYCLE_CONSTANTS,
    SessionLifecycleError,
    type IdentityKeyring,
    type RandomBytesSource,
    type SessionLifecycleCheckpoint,
    type SessionLifecycleDependencies
} from '../../functions/_lib/identity';
import { runRetentionPurge } from '../../functions/_lib/persistence';

const UUIDS = Array.from({ length: 24 }, (_, index) => {
    const digit = ((index + 1) % 16).toString(16);
    return `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
});
const PREVIEW_COOKIE = '__Host-docvault-preview-session' as const;
const NOW = 1_900_200_000_000;
const DAY = 86_400_000;

const key = (start: number): string => {
    const bytes = Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256);
    return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
const ACTIVE_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'current', keys: { current: key(1) }
}));
const OLD_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'previous', keys: { previous: key(101) }
}));
const ROTATING_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'current', keys: { current: key(1), previous: key(101) }
}));
const FOREIGN_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'foreign', keys: { foreign: key(201) }
}));

function random(seed: number): RandomBytesSource {
    let call = 0;
    return {
        bytes(length: number): Uint8Array {
            const start = seed + call * 31;
            call += 1;
            return Uint8Array.from({ length }, (_, index) => (start + index) % 256);
        }
    };
}

function dependencies(options: {
    now: { value: number };
    uuid?: string;
    seed?: number;
    checkpoint?: (name: SessionLifecycleCheckpoint) => void | Promise<void>;
}): SessionLifecycleDependencies {
    return {
        clock: { now: () => options.now.value },
        ids: { uuid: () => options.uuid ?? UUIDS[20] },
        random: random(options.seed ?? 50),
        failures: { checkpoint: options.checkpoint ?? (() => {}) }
    };
}

async function ensureUser(options: {
    userId: string;
    subject?: string;
    status?: 'active' | 'deactivated';
}): Promise<void> {
    await env.COLLAB_DB.prepare(
        `INSERT INTO users (id, provider, provider_subject, display_login, display_name, avatar_url,
         status, created_at, updated_at, deactivated_at)
         VALUES (?, 'github', ?, ?, NULL, NULL, ?, ?, ?, ?)`
    ).bind(options.userId, options.subject ?? '1001', `user-${options.userId.slice(0, 4)}`,
        options.status ?? 'active', NOW - DAY, NOW - DAY,
        options.status === 'deactivated' ? NOW - 1 : null).run();
}

async function insertSession(options: {
    id: string;
    userId: string;
    token: string;
    ring?: IdentityKeyring;
    createdAt?: number;
    lastSeenAt?: number;
    authenticatedAt?: number;
    idleExpiresAt?: number;
    absoluteExpiresAt?: number;
    revokedAt?: number | null;
    revokeReason?: string | null;
}): Promise<void> {
    const lastSeenAt = options.lastSeenAt ?? NOW - 60_000;
    const createdAt = options.createdAt ?? Math.min(lastSeenAt, options.authenticatedAt ?? lastSeenAt);
    const authenticatedAt = options.authenticatedAt ?? createdAt;
    const idleExpiresAt = options.idleExpiresAt ?? NOW + 43_200_000;
    const absoluteExpiresAt = options.absoluteExpiresAt ?? NOW + 604_800_000;
    const { digest } = await digestSessionToken(options.ring ?? ACTIVE_RING, options.token);
    await env.COLLAB_DB.prepare(
        `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at, last_seen_at,
         authenticated_at, idle_expires_at, absolute_expires_at, revoked_at, revoke_reason)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(options.id, Uint8Array.from(digest).buffer, options.userId, createdAt, lastSeenAt,
        authenticatedAt, idleExpiresAt, absoluteExpiresAt,
        options.revokedAt ?? null, options.revokeReason ?? null).run();
}

function token(seed: number): string {
    return generateOpaqueToken(32, random(seed));
}

function input(sessionTokenPepper = ACTIVE_RING) {
    return { sessionTokenPepper, cookieName: PREVIEW_COOKIE };
}

describe('CF-P3-005 server-side session lifecycle', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'session_lifecycle_migrations');
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM retention_purge_runs').run();
        await env.COLLAB_DB.prepare('DELETE FROM sessions').run();
        await env.COLLAB_DB.prepare('DELETE FROM users').run();
    });

    it('resolves a digest-only live session and coalesces last-seen writes at exactly five minutes', async () => {
        const now = { value: NOW };
        const raw = token(1);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw,
            lastSeenAt: NOW - 299_999, authenticatedAt: NOW - 600_000 });

        const first = await resolveSessionToken(env.COLLAB_DB, { ...input(), token: raw },
            dependencies({ now }));
        expect(first).toMatchObject({ authenticated: true, sessionId: UUIDS[1], setCookie: null });
        expect(await env.COLLAB_DB.prepare('SELECT last_seen_at FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<number>('last_seen_at')).toBe(NOW - 299_999);

        now.value += 1;
        const second = await resolveSessionToken(env.COLLAB_DB, { ...input(), token: raw },
            dependencies({ now }));
        expect(second).toMatchObject({ authenticated: true, idleExpiresAt: now.value + 43_200_000 });
        expect(await env.COLLAB_DB.prepare('SELECT last_seen_at FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<number>('last_seen_at')).toBe(now.value);
    });

    it('enforces the fifteen-minute recent-authentication boundary without extending it on activity', async () => {
        const now = { value: NOW };
        const raw = token(2);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw,
            authenticatedAt: NOW - 900_000 });
        const atBoundary = await resolveSessionToken(env.COLLAB_DB, { ...input(), token: raw },
            dependencies({ now }));
        expect(hasRecentAuthentication(atBoundary)).toBe(true);
        now.value += 1;
        const afterBoundary = await resolveSessionToken(env.COLLAB_DB, { ...input(), token: raw },
            dependencies({ now }));
        expect(hasRecentAuthentication(afterBoundary)).toBe(false);
    });

    it('rotates a previous-pepper match forward while preserving absolute lifetime and authentication age', async () => {
        const now = { value: NOW };
        const raw = token(3);
        const absoluteExpiresAt = NOW + DAY;
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw, ring: OLD_RING,
            createdAt: NOW - DAY, lastSeenAt: NOW - 100, authenticatedAt: NOW - 800_000,
            absoluteExpiresAt, idleExpiresAt: NOW + 1_000_000 });
        const result = await resolveSessionToken(env.COLLAB_DB,
            { ...input(ROTATING_RING), token: raw }, dependencies({ now, uuid: UUIDS[2], seed: 70 }));
        expect(result).toMatchObject({ authenticated: true, sessionId: UUIDS[2],
            authenticatedAt: NOW - 800_000, absoluteExpiresAt, recentlyAuthenticated: true });
        expect(result.authenticated && result.setCookie).toContain(`${PREVIEW_COOKIE}=`);
        expect(result.authenticated && result.setCookie).toContain('Secure; HttpOnly; SameSite=Lax');
        expect(await env.COLLAB_DB.prepare('SELECT revoke_reason FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<string>('revoke_reason')).toBe('pepper_rotation');
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL')
            .first<number>('count')).toBe(1);
        expect(await resolveSessionToken(env.COLLAB_DB,
            { ...input(ROTATING_RING), token: raw }, dependencies({ now })))
            .toEqual({ authenticated: false, clearCookie: true });
    });

    it('returns one uniform unauthenticated result for revoked, idle-expired, deactivated, and foreign sessions', async () => {
        const now = { value: NOW };
        const cases = [
            { token: token(4), id: UUIDS[1], user: UUIDS[0], session: { revokedAt: NOW - 1, revokeReason: 'logout' } },
            { token: token(5), id: UUIDS[3], user: UUIDS[2], session: { idleExpiresAt: NOW, absoluteExpiresAt: NOW + DAY } },
            { token: token(6), id: UUIDS[5], user: UUIDS[4], status: 'deactivated' as const, session: {} }
        ];
        for (let index = 0; index < cases.length; index += 1) {
            const item = cases[index];
            await ensureUser({ userId: item.user, subject: String(2000 + index), status: item.status });
            await insertSession({ id: item.id, userId: item.user, token: item.token, ...item.session });
            expect(await resolveSessionToken(env.COLLAB_DB, { ...input(), token: item.token },
                dependencies({ now }))).toEqual({ authenticated: false, clearCookie: true });
        }
        expect(await resolveSessionToken(env.COLLAB_DB, { ...input(FOREIGN_RING), token: token(99) },
            dependencies({ now }))).toEqual({ authenticated: false, clearCookie: true });
        expect(await resolveSessionToken(env.COLLAB_DB, { ...input(), token: 'malformed-cookie-canary' },
            dependencies({ now }))).toEqual({ authenticated: false, clearCookie: true });
    });

    it('allows exactly one concurrent security rotation and leaves one valid successor', async () => {
        const now = { value: NOW };
        const raw = token(7);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw });
        const attempts = await Promise.allSettled([
            rotateLiveSession(env.COLLAB_DB, { ...input(), token: raw, reason: 'security_rotation' },
                dependencies({ now, uuid: UUIDS[2], seed: 80 })),
            rotateLiveSession(env.COLLAB_DB, { ...input(), token: raw, reason: 'security_rotation' },
                dependencies({ now, uuid: UUIDS[3], seed: 90 }))
        ]);
        expect(attempts.filter(item => item.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(item => item.status === 'rejected')).toHaveLength(1);
        expect(attempts.find(item => item.status === 'rejected')).toMatchObject({
            reason: { code: 'SESSION_LIFECYCLE_FAILED' }
        });
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions WHERE revoked_at IS NULL')
            .first<number>('count')).toBe(1);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions')
            .first<number>('count')).toBe(2);
    });

    it('rolls back predecessor revocation when successor insertion conflicts', async () => {
        const now = { value: NOW };
        const predecessorToken = token(8);
        const conflictingSuccessorToken = token(100);
        await ensureUser({ userId: UUIDS[0], subject: '3001' });
        await ensureUser({ userId: UUIDS[2], subject: '3002' });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: predecessorToken });
        await insertSession({ id: UUIDS[3], userId: UUIDS[2], token: conflictingSuccessorToken });
        await expect(rotateLiveSession(env.COLLAB_DB,
            { ...input(), token: predecessorToken, reason: 'fixation_risk' },
            dependencies({ now, uuid: UUIDS[4], seed: 100 }))).rejects.toEqual(new SessionLifecycleError());
        expect(await env.COLLAB_DB.prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<number | null>('revoked_at')).toBeNull();
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions')
            .first<number>('count')).toBe(2);
    });

    it('rereads once after a touch race and accepts only the still-live row', async () => {
        const now = { value: NOW };
        const raw = token(9);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw,
            lastSeenAt: NOW - 300_000 });
        let raced = false;
        const result = await resolveSessionToken(env.COLLAB_DB, { ...input(), token: raw },
            dependencies({ now, checkpoint: async name => {
                if (name !== 'session.lookup.before-touch' || raced) return;
                raced = true;
                await env.COLLAB_DB.prepare(
                    'UPDATE sessions SET last_seen_at = ?, idle_expires_at = ? WHERE id = ?'
                ).bind(NOW - 1, NOW + 43_200_000, UUIDS[1]).run();
            } }));
        expect(result).toMatchObject({ authenticated: true, sessionId: UUIDS[1] });
        expect(SESSION_LIFECYCLE_CONSTANTS.maximumLookupReads).toBe(2);
        expect(SESSION_LIFECYCLE_CONSTANTS.maximumLookupWrites).toBe(1);
    });

    it('revokes server-side before returning the logout cookie and treats replay uniformly', async () => {
        const now = { value: NOW };
        const raw = token(10);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw });
        const first = await logoutSession(env.COLLAB_DB, { ...input(), token: raw }, dependencies({ now }));
        expect(first.revoked).toBe(true);
        expect(first.setCookie).toContain('Max-Age=0');
        expect(await env.COLLAB_DB.prepare('SELECT revoke_reason FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<string>('revoke_reason')).toBe('logout');
        const replay = await logoutSession(env.COLLAB_DB, { ...input(), token: raw }, dependencies({ now }));
        expect(replay).toEqual({ revoked: false, setCookie: first.setCookie });
    });

    it('does not return a cookie-expiry result when logout persistence fails', async () => {
        const now = { value: NOW };
        const raw = token(11);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw });
        const attempt = logoutSession(env.COLLAB_DB, { ...input(), token: raw }, dependencies({ now,
            checkpoint(name) {
                if (name === 'session.logout.before-revoke') throw new Error('session-token-canary');
            }
        }));
        await expect(attempt).rejects.toEqual(new SessionLifecycleError());
        await expect(attempt).rejects.not.toThrow(/session-token-canary/);
        expect(await env.COLLAB_DB.prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<number | null>('revoked_at')).toBeNull();
    });

    it('isolates cookie namespaces and clears malformed configured cookies without accepting them', async () => {
        const now = { value: NOW };
        const raw = token(12);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw });
        const foreign = await resolveSessionCookie(env.COLLAB_DB, {
            ...input(), cookieHeader: `__Host-docvault-session=${raw}`
        }, dependencies({ now }));
        expect(foreign).toEqual({ authenticated: false, clearCookie: false });
        const duplicate = await resolveSessionCookie(env.COLLAB_DB, {
            ...input(), cookieHeader: `${PREVIEW_COOKIE}=${raw}; ${PREVIEW_COOKIE}=${raw}`
        }, dependencies({ now }));
        expect(duplicate).toEqual({ authenticated: false, clearCookie: true });
    });

    it('keeps manual rotation atomic under an injected pre-batch fault', async () => {
        const now = { value: NOW };
        const raw = token(13);
        await ensureUser({ userId: UUIDS[0] });
        await insertSession({ id: UUIDS[1], userId: UUIDS[0], token: raw });
        await expect(rotateLiveSession(env.COLLAB_DB,
            { ...input(), token: raw, reason: 'security_rotation' }, dependencies({ now,
                uuid: UUIDS[2], seed: 110,
                checkpoint(name) {
                    if (name === 'session.rotation.before-batch') throw new Error('fault-canary');
                }
            }))).rejects.toEqual(new SessionLifecycleError());
        expect(await env.COLLAB_DB.prepare('SELECT revoked_at FROM sessions WHERE id = ?')
            .bind(UUIDS[1]).first<number | null>('revoked_at')).toBeNull();
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions')
            .first<number>('count')).toBe(1);
    });

    it('purges at most the approved number of terminal sessions through the existing retention boundary', async () => {
        const createdAt = NOW - 40 * DAY;
        for (let index = 0; index < 3; index += 1) {
            await ensureUser({ userId: UUIDS[index * 2], subject: String(4000 + index) });
            await insertSession({ id: UUIDS[index * 2 + 1], userId: UUIDS[index * 2], token: token(20 + index),
                createdAt, lastSeenAt: createdAt + 1, authenticatedAt: createdAt,
                idleExpiresAt: createdAt + DAY, absoluteExpiresAt: createdAt + 7 * DAY });
        }
        const result = await runRetentionPurge(env.COLLAB_DB, {
            auditRunId: UUIDS[10], transitionRunId: UUIDS[11], serverTime: NOW, maximumRowsPerType: 2
        });
        expect(result.sessions).toBe(2);
        expect(await env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions')
            .first<number>('count')).toBe(1);
    });
});
