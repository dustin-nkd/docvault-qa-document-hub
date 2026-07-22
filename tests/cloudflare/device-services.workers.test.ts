import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    inventoryDevices, registerDevice, requireActiveOwnedDevice, revokeDevice,
    type RegisterDeviceInput, type RevokeDeviceInput
} from '../../functions/_lib/devices';

const ID = Object.freeze({
    user: '11111111-1111-4111-8111-111111111111',
    otherUser: '22222222-2222-4222-8222-222222222222',
    session: '33333333-3333-4333-8333-333333333333',
    otherSession: '44444444-4444-4444-8444-444444444444',
    device: '55555555-5555-4555-8555-555555555555',
    mutationResult: '66666666-6666-4666-8666-666666666666',
    mutation: '77777777-7777-4777-8777-777777777777',
    event: '88888888-8888-4888-8888-888888888888',
    request: '99999999-9999-4999-8999-999999999999'
});

const blob = (fill: number): ArrayBuffer => new Uint8Array(32).fill(fill).buffer;

async function publicJwk(): Promise<JsonWebKey> {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
    const exported = await crypto.subtle.exportKey('jwk', pair.publicKey) as JsonWebKey;
    return { crv: exported.crv, ext: true, key_ops: [], kty: exported.kty, x: exported.x, y: exported.y };
}

let scenario = 0;
const scenarioUuid = (prefix: string, value: number): string =>
    `${prefix}${String(value).padStart(7, '0')}-1111-4111-8111-111111111111`;

async function registration(overrides: Partial<RegisterDeviceInput> = {}): Promise<RegisterDeviceInput> {
    scenario += 1;
    return {
        actorUserId: ID.user, actorSessionId: ID.session, deviceId: scenarioUuid('5', scenario),
        label: 'Edge on Windows', publicJwk: await publicJwk(), mutationResultId: scenarioUuid('6', scenario),
        clientMutationId: scenarioUuid('7', scenario), requestFingerprint: blob(7),
        auditEventId: scenarioUuid('8', scenario), requestId: scenarioUuid('9', scenario),
        serverTime: 100 + scenario, replayExpiresAt: 10_000, ...overrides
    };
}

function revocation(deviceId: string, overrides: Partial<RevokeDeviceInput> = {}): RevokeDeviceInput {
    scenario += 1;
    return {
        actorUserId: ID.user, actorSessionId: ID.session, deviceId,
        mutationResultId: scenarioUuid('a', scenario), clientMutationId: scenarioUuid('b', scenario),
        requestFingerprint: blob(8), auditEventId: scenarioUuid('c', scenario),
        requestId: scenarioUuid('d', scenario), serverTime: 200 + scenario,
        replayExpiresAt: 10_000, ...overrides
    };
}

async function countFor(table: string, deviceId: string): Promise<number> {
    const column = table === 'devices' ? 'id' : 'target_device_id';
    return (await env.COLLAB_DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} = ?`)
        .bind(deviceId).first<number>('count')) ?? 0;
}

describe('CF-P5-004 device registration, inventory, and revocation services', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'device_service_migrations');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '51001', 'device-owner', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.user),
            env.COLLAB_DB.prepare(
                `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
                  avatar_url, status, created_at, updated_at, deactivated_at)
                 VALUES (?, 'github', '51002', 'other-owner', NULL, NULL, 'active', 1, 1, NULL)`
            ).bind(ID.otherUser),
            env.COLLAB_DB.prepare(
                `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
                  last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at,
                  revoked_at, revoke_reason)
                 VALUES (?, ?, ?, NULL, 1, 1, 1, 50000, 100000, NULL, NULL)`
            ).bind(ID.session, blob(1), ID.user),
            env.COLLAB_DB.prepare(
                `INSERT INTO sessions (id, token_digest, user_id, device_hint, created_at,
                  last_seen_at, authenticated_at, idle_expires_at, absolute_expires_at,
                  revoked_at, revoke_reason)
                 VALUES (?, ?, ?, NULL, 1, 1, 1, 50000, 100000, NULL, NULL)`
            ).bind(ID.otherSession, blob(2), ID.otherUser)
        ]);
    });

    it('registers a canonical public key with server-derived fingerprint and exactly one audit/result', async () => {
        const input = await registration();
        const result = await registerDevice(env.COLLAB_DB, input);
        expect(result).toMatchObject({ deviceId: input.deviceId, state: 'active', httpStatus: 201 });
        expect(result.fingerprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(await countFor('devices', input.deviceId)).toBe(1);
        expect(await countFor('device_audit_events', input.deviceId)).toBe(1);
        expect(await countFor('device_mutation_results', input.deviceId)).toBe(1);
        const stored = await env.COLLAB_DB.prepare(
            'SELECT public_jwk, length(fingerprint) AS bytes FROM devices WHERE id = ?'
        ).bind(input.deviceId).first<{ public_jwk: string; bytes: number }>();
        expect(stored?.bytes).toBe(32);
        expect(stored?.public_jwk).toBe(JSON.stringify(input.publicJwk));
        expect(stored?.public_jwk).not.toMatch(/\b(?:d|p|q|dp|dq|qi)\b/);
    });

    it('converges concurrent identical registration without duplicate device or audit rows', async () => {
        const input = await registration();
        const outcomes = await Promise.all([registerDevice(env.COLLAB_DB, input), registerDevice(env.COLLAB_DB, input)]);
        expect(outcomes[0]).toEqual(outcomes[1]);
        expect(await countFor('devices', input.deviceId)).toBe(1);
        expect(await countFor('device_audit_events', input.deviceId)).toBe(1);
        expect(await countFor('device_mutation_results', input.deviceId)).toBe(1);
    });

    it('rejects idempotency substitution and changed key reuse without side effects', async () => {
        const input = await registration();
        await registerDevice(env.COLLAB_DB, input);
        await expect(registerDevice(env.COLLAB_DB, { ...input, requestFingerprint: blob(9) }))
            .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
        await expect(registerDevice(env.COLLAB_DB, { ...input, publicJwk: await publicJwk(),
            mutationResultId: '66666666-6666-4666-9666-666666666666',
            clientMutationId: '77777777-7777-4777-9777-777777777777',
            auditEventId: '88888888-8888-4888-9888-888888888888',
            requestId: '99999999-9999-4999-9999-999999999999', requestFingerprint: blob(10) }))
            .rejects.toMatchObject({ code: 'PERSISTENCE_CONFLICT' });
        expect(await countFor('devices', input.deviceId)).toBe(1);
        expect(await countFor('device_audit_events', input.deviceId)).toBe(1);
    });

    it('rejects private, malformed, or unknown public JWK fields before D1 writes', async () => {
        const base = await registration();
        for (const candidate of [
            { ...(base.publicJwk as JsonWebKey), d: 'secret' },
            { ...(base.publicJwk as JsonWebKey), crv: 'P-384' },
            { ...(base.publicJwk as JsonWebKey), key_ops: ['deriveBits'] }
        ]) {
            await expect(registerDevice(env.COLLAB_DB, { ...base, publicJwk: candidate })).rejects.toBeTruthy();
        }
        expect(await countFor('devices', base.deviceId)).toBe(0);
        expect(await countFor('device_audit_events', base.deviceId)).toBe(0);
    });

    it('denies a mismatched, revoked, or expired session and rolls the device insert back', async () => {
        const mismatched = await registration({ actorSessionId: ID.otherSession });
        await expect(registerDevice(env.COLLAB_DB, mismatched)).rejects.toBeTruthy();
        const expired = await registration({ serverTime: 100_000, replayExpiresAt: 100_100 });
        await expect(registerDevice(env.COLLAB_DB, expired)).rejects.toBeTruthy();
        for (const candidate of [mismatched, expired]) {
            expect(await countFor('devices', candidate.deviceId)).toBe(0);
            expect(await countFor('device_audit_events', candidate.deviceId)).toBe(0);
            expect(await countFor('device_mutation_results', candidate.deviceId)).toBe(0);
        }
    });

    it('lists only the authenticated user with bounded stable keyset pagination', async () => {
        const first = await registration({ deviceId: '55555555-5555-4555-8555-555555555551', serverTime: 9_000 });
        const second = await registration({ deviceId: '55555555-5555-4555-8555-555555555552', serverTime: 9_001,
            mutationResultId: '66666666-6666-4666-8666-666666666662',
            clientMutationId: '77777777-7777-4777-8777-777777777772',
            auditEventId: '88888888-8888-4888-8888-888888888882',
            requestId: '99999999-9999-4999-8999-999999999992', requestFingerprint: blob(2) });
        await registerDevice(env.COLLAB_DB, first); await registerDevice(env.COLLAB_DB, second);
        const page = await inventoryDevices(env.COLLAB_DB, { actorUserId: ID.user, limit: 1 });
        expect(page.map(item => item.deviceId)).toEqual([second.deviceId]);
        const next = await inventoryDevices(env.COLLAB_DB, { actorUserId: ID.user, limit: 1,
            beforeCreatedAt: page[0].createdAt, beforeDeviceId: page[0].deviceId });
        expect(next.map(item => item.deviceId)).toEqual([first.deviceId]);
        expect(await inventoryDevices(env.COLLAB_DB, { actorUserId: ID.otherUser, limit: 10 })).toEqual([]);
        await expect(inventoryDevices(env.COLLAB_DB, { actorUserId: ID.user, limit: 101 }))
            .rejects.toMatchObject({ code: 'PERSISTENCE_INTEGRITY' });
    });

    it('revokes one owned device atomically, replays safely, and blocks future authority', async () => {
        const registered = await registration();
        await registerDevice(env.COLLAB_DB, registered);
        const input = revocation(registered.deviceId);
        const [first, replay] = await Promise.all([
            revokeDevice(env.COLLAB_DB, input), revokeDevice(env.COLLAB_DB, input)
        ]);
        expect(first).toEqual(replay);
        expect(first).toMatchObject({ deviceId: registered.deviceId, state: 'revoked', httpStatus: 200 });
        expect(await countFor('device_audit_events', registered.deviceId)).toBe(2);
        expect(await countFor('device_mutation_results', registered.deviceId)).toBe(2);
        await expect(requireActiveOwnedDevice(env.COLLAB_DB, ID.user, registered.deviceId))
            .rejects.toMatchObject({ code: 'AUTHORITY_REVOKED' });
        await expect(registerDevice(env.COLLAB_DB, await registration({
            deviceId: registered.deviceId, mutationResultId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            clientMutationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
            auditEventId: '10101010-1010-4010-8010-101010101010',
            requestId: '20202020-2020-4020-8020-202020202020', requestFingerprint: blob(4)
        }))).rejects.toMatchObject({ code: 'PERSISTENCE_CONFLICT' });
    });

    it('prevents cross-user revocation and append-only audit mutation', async () => {
        const registered = await registration();
        await registerDevice(env.COLLAB_DB, registered);
        await expect(revokeDevice(env.COLLAB_DB, revocation(registered.deviceId, {
            actorUserId: ID.otherUser, actorSessionId: ID.otherSession
        }))).rejects.toMatchObject({ code: 'PERSISTENCE_NOT_FOUND' });
        await expect(env.COLLAB_DB.prepare('UPDATE device_audit_events SET metadata_json = ?')
            .bind('{"changed":true}').run()).rejects.toThrow();
        await expect(env.COLLAB_DB.prepare('DELETE FROM device_mutation_results').run()).rejects.toThrow();
        expect((await requireActiveOwnedDevice(env.COLLAB_DB, ID.user, registered.deviceId)).state).toBe('active');
        await env.COLLAB_DB.prepare(
            `UPDATE sessions SET revoked_at = 500, revoke_reason = 'logout' WHERE id = ?`
        ).bind(ID.session).run();        await expect(registerDevice(env.COLLAB_DB, registered)).rejects.toBeTruthy();
    });
});
