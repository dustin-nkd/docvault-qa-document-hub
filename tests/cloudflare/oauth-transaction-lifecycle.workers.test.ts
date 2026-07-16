import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    cleanupExpiredOAuthTransactions,
    consumeValidatedOAuthTransaction,
    createOAuthTransaction,
    encodeBase64Url,
    OAUTH_TRANSACTION_CONSTANTS,
    OAuthTransactionLifecycleError,
    parseIdentityKeyring,
    validateOAuthTransaction,
    type OAuthTransactionCheckpoint,
    type OAuthTransactionDependencies,
    type RandomBytesSource
} from '../../functions/_lib/identity';

const key = (start: number): string => encodeBase64Url(
    Uint8Array.from({ length: 32 }, (_, index) => (start + index) % 256)
);
const INITIAL_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'initial', keys: { initial: key(1) }
}));
const ROTATED_RING = parseIdentityKeyring(JSON.stringify({
    version: 1, activeKeyId: 'rotated', keys: { rotated: key(101), initial: key(1) }
}));

const UUIDS = [
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555',
    '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777',
    '88888888-8888-4888-8888-888888888888',
    '99999999-9999-4999-8999-999999999999',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
];

function sequencedRandom(seed: number): RandomBytesSource {
    let call = 0;
    return {
        bytes(length: number): Uint8Array {
            const start = seed + call * 37;
            call += 1;
            return Uint8Array.from({ length }, (_, index) => (start + index) % 256);
        }
    };
}

function dependencies(options: {
    time: number;
    uuid: string;
    seed?: number;
    failAt?: OAuthTransactionCheckpoint;
}): OAuthTransactionDependencies {
    return {
        clock: { now: () => options.time },
        ids: { uuid: () => options.uuid },
        random: sequencedRandom(options.seed ?? 1),
        failures: {
            checkpoint(name) {
                if (name === options.failAt) throw new Error('synthetic-fault-canary');
            }
        }
    };
}

async function create(options: {
    time: number;
    uuid: string;
    seed?: number;
    keyring?: typeof INITIAL_RING;
    purpose?: 'sign_in' | 'reauthenticate';
    returnPath?: string;
}) {
    return createOAuthTransaction(env.COLLAB_DB, {
        keyring: options.keyring ?? INITIAL_RING,
        purpose: options.purpose ?? 'sign_in',
        returnPath: options.returnPath ?? '/dashboard?range=90d',
        initiatingSessionId: options.purpose === 'reauthenticate' ? UUIDS[8] : null,
        initiatingUserId: options.purpose === 'reauthenticate' ? UUIDS[9] : null
    }, dependencies({ time: options.time, uuid: options.uuid, seed: options.seed }));
}

async function sideEffectCounts(): Promise<{ users: number; sessions: number }> {
    const [users, sessions] = await Promise.all([
        env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM users').first<number>('count'),
        env.COLLAB_DB.prepare('SELECT COUNT(*) AS count FROM sessions').first<number>('count')
    ]);
    return { users: users ?? -1, sessions: sessions ?? -1 };
}

describe('CF-P3-003 single-use OAuth transaction lifecycle', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'oauth_transaction_lifecycle_migrations');
    });

    beforeEach(async () => {
        await env.COLLAB_DB.prepare('DELETE FROM oauth_transactions').run();
        await env.COLLAB_DB.prepare('DELETE FROM sessions').run();
        await env.COLLAB_DB.prepare('DELETE FROM users').run();
    });

    it('creates a ten-minute pending transaction with digest-only state and encrypted verifier context', async () => {
        const now = 1_900_000_000_000;
        const created = await create({ time: now, uuid: UUIDS[0], seed: 7 });
        expect(created).toMatchObject({
            transactionId: UUIDS[0], codeChallengeMethod: 'S256',
            expiresAt: now + OAUTH_TRANSACTION_CONSTANTS.transactionTtlMilliseconds
        });
        expect(created.state).toHaveLength(43);
        expect(created.codeChallenge).toHaveLength(43);

        const row = await env.COLLAB_DB.prepare(
            `SELECT id, state_digest, pkce_verifier_envelope, callback_origin, callback_path,
                    created_at, expires_at, consumed_at, status
             FROM oauth_transactions WHERE id = ?`
        ).bind(created.transactionId).first<Record<string, unknown>>();
        expect(row).toMatchObject({
            id: UUIDS[0], callback_origin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin,
            callback_path: OAUTH_TRANSACTION_CONSTANTS.callbackPath,
            created_at: now, expires_at: created.expiresAt, consumed_at: null, status: 'pending'
        });
        expect(row?.state_digest).toBeInstanceOf(Array);
        expect(row?.state_digest).toHaveLength(32);
        expect(row?.pkce_verifier_envelope).toBeInstanceOf(Array);
        expect(JSON.stringify(row)).not.toContain(created.state);
        expect(await sideEffectCounts()).toEqual({ users: 0, sessions: 0 });
    });

    it('finds an active transaction through the previous key and validates encrypted purpose/return context', async () => {
        const now = 1_900_000_100_000;
        const created = await create({ time: now, uuid: UUIDS[1], seed: 9,
            returnPath: '/focus?view=mine' });
        const validated = await validateOAuthTransaction(env.COLLAB_DB, {
            keyring: ROTATED_RING,
            state: created.state,
            expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[1], seed: 90 }));
        expect(validated).toMatchObject({
            transactionId: UUIDS[1], purpose: 'sign_in', returnPath: '/focus?view=mine',
            initiatingSessionId: null, initiatingUserId: null
        });
    });

    it('allows exactly one concurrent consume and rejects every replay', async () => {
        const now = 1_900_000_200_000;
        const created = await create({ time: now, uuid: UUIDS[2], seed: 11 });
        const validated = await validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: created.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[2], seed: 91 }));
        const attempts = await Promise.allSettled([
            consumeValidatedOAuthTransaction(env.COLLAB_DB, validated,
                dependencies({ time: now + 2, uuid: UUIDS[2], seed: 92 })),
            consumeValidatedOAuthTransaction(env.COLLAB_DB, validated,
                dependencies({ time: now + 2, uuid: UUIDS[2], seed: 93 }))
        ]);
        expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter(result => result.status === 'rejected')).toHaveLength(1);
        expect(await env.COLLAB_DB.prepare(
            "SELECT COUNT(*) AS count FROM oauth_transactions WHERE id = ? AND status = 'consumed'"
        ).bind(UUIDS[2]).first<number>('count')).toBe(1);
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: created.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 3, uuid: UUIDS[2], seed: 94 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        expect(await sideEffectCounts()).toEqual({ users: 0, sessions: 0 });
    });

    it('expires at the exact server boundary and makes unknown state indistinguishable', async () => {
        const now = 1_900_000_300_000;
        const created = await create({ time: now, uuid: UUIDS[3], seed: 13 });
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: created.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: created.expiresAt, uuid: UUIDS[3], seed: 95 })))
            .rejects.toEqual(new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_INVALID'));
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: encodeBase64Url(new Uint8Array(32).fill(250)),
            expectedPurpose: 'sign_in', expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[3], seed: 96 })))
            .rejects.toEqual(new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_INVALID'));
        expect(await env.COLLAB_DB.prepare(
            'SELECT status FROM oauth_transactions WHERE id = ?'
        ).bind(UUIDS[3]).first<string>('status')).toBe('expired');
    });

    it('rejects wrong origin, wrong purpose, callback substitution, and corrupt envelopes without authority', async () => {
        const now = 1_900_000_400_000;
        const created = await create({ time: now, uuid: UUIDS[4], seed: 15 });
        const base = { keyring: INITIAL_RING, state: created.state };
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            ...base, expectedPurpose: 'sign_in', expectedCallbackOrigin: 'https://attacker.example'
        }, dependencies({ time: now + 1, uuid: UUIDS[4], seed: 97 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            ...base, expectedPurpose: 'reauthenticate',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[4], seed: 98 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });

        await env.COLLAB_DB.prepare(
            "UPDATE oauth_transactions SET callback_origin = 'https://substitute.example' WHERE id = ?"
        ).bind(UUIDS[4]).run();
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            ...base, expectedPurpose: 'sign_in', expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 2, uuid: UUIDS[4], seed: 99 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        await env.COLLAB_DB.prepare(
            "UPDATE oauth_transactions SET callback_origin = ?, callback_path = '/api/v1/oauth/substitute' WHERE id = ?"
        ).bind(OAUTH_TRANSACTION_CONSTANTS.callbackOrigin, UUIDS[4]).run();
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            ...base, expectedPurpose: 'sign_in', expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 3, uuid: UUIDS[4], seed: 100 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        await env.COLLAB_DB.prepare(
            `UPDATE oauth_transactions SET callback_origin = ?, callback_path = ?,
             pkce_verifier_envelope = zeroblob(length(pkce_verifier_envelope)) WHERE id = ?`
        ).bind(OAUTH_TRANSACTION_CONSTANTS.callbackOrigin, OAUTH_TRANSACTION_CONSTANTS.callbackPath, UUIDS[4]).run();
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            ...base, expectedPurpose: 'sign_in', expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 4, uuid: UUIDS[4], seed: 101 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        expect(await env.COLLAB_DB.prepare(
            'SELECT status FROM oauth_transactions WHERE id = ?'
        ).bind(UUIDS[4]).first<string>('status')).toBe('pending');
        expect(await sideEffectCounts()).toEqual({ users: 0, sessions: 0 });
    });

    it('fails closed when active and previous digests ambiguously match two transactions', async () => {
        const now = 1_900_000_500_000;
        const first = await create({ time: now, uuid: UUIDS[5], seed: 21, keyring: INITIAL_RING });
        const second = await create({ time: now, uuid: UUIDS[6], seed: 21,
            keyring: parseIdentityKeyring(JSON.stringify({
                version: 1, activeKeyId: 'rotated', keys: { rotated: key(101) }
            })) });
        expect(second.state).toBe(first.state);
        await expect(validateOAuthTransaction(env.COLLAB_DB, {
            keyring: ROTATED_RING, state: first.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[5], seed: 101 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        expect(await env.COLLAB_DB.prepare(
            "SELECT COUNT(*) AS count FROM oauth_transactions WHERE status = 'pending'"
        ).first<number>('count')).toBe(2);
    });

    it('bounds cleanup while preserving active and recent terminal transactions', async () => {
        const now = 1_900_200_000_000;
        await create({ time: now, uuid: UUIDS[7], seed: 31 });
        const old = await create({ time: now - 172_800_000, uuid: UUIDS[8], seed: 33 });
        const consumed = await validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: old.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now - 172_799_000, uuid: UUIDS[8], seed: 102 }));
        await consumeValidatedOAuthTransaction(env.COLLAB_DB, consumed,
            dependencies({ time: now - 172_798_000, uuid: UUIDS[8], seed: 103 }));
        await create({ time: now - 3_600_000, uuid: UUIDS[9], seed: 35 });

        const result = await cleanupExpiredOAuthTransactions(env.COLLAB_DB, 10,
            dependencies({ time: now, uuid: UUIDS[0], seed: 104 }));
        expect(result).toEqual({ expired: 1, deleted: 1 });
        const remaining = await env.COLLAB_DB.prepare(
            'SELECT id, status FROM oauth_transactions ORDER BY id'
        ).all<{ id: string; status: string }>();
        expect(remaining.results).toEqual([
            { id: UUIDS[7], status: 'pending' },
            { id: UUIDS[9], status: 'expired' }
        ]);
        await expect(cleanupExpiredOAuthTransactions(env.COLLAB_DB, 101,
            dependencies({ time: now, uuid: UUIDS[0], seed: 105 })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_UNAVAILABLE' });
    });

    it('injects faults only before writes and never echoes protected state or verifier canaries', async () => {
        const now = 1_900_300_000_000;
        await expect(createOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, purpose: 'sign_in', returnPath: '/'
        }, dependencies({ time: now, uuid: UUIDS[0], seed: 41, failAt: 'oauth.create.before-insert' })))
            .rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_UNAVAILABLE' });
        expect(await env.COLLAB_DB.prepare(
            'SELECT COUNT(*) AS count FROM oauth_transactions'
        ).first<number>('count')).toBe(0);

        const created = await create({ time: now, uuid: UUIDS[1], seed: 43 });
        const lookup = validateOAuthTransaction(env.COLLAB_DB, {
            keyring: INITIAL_RING, state: created.state, expectedPurpose: 'sign_in',
            expectedCallbackOrigin: OAUTH_TRANSACTION_CONSTANTS.callbackOrigin
        }, dependencies({ time: now + 1, uuid: UUIDS[1], seed: 106, failAt: 'oauth.lookup.after-read' }));
        await expect(lookup).rejects.toMatchObject({ code: 'OAUTH_TRANSACTION_INVALID' });
        try {
            await lookup;
        } catch (error) {
            expect(String(error)).not.toContain(created.state);
            expect(String(error)).not.toContain('synthetic-fault-canary');
        }
        expect(await env.COLLAB_DB.prepare(
            'SELECT status FROM oauth_transactions WHERE id = ?'
        ).bind(UUIDS[1]).first<string>('status')).toBe('pending');
        expect(await sideEffectCounts()).toEqual({ users: 0, sessions: 0 });
    });
});
