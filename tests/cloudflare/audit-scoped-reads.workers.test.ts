import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    createAuditCursorCodec,
    listAuditEvents,
    validateAuditEventRecord,
    type AuditEventType,
    type AuditTargetType
} from '../../functions/_lib/audit';

const id = (value: number): string => {
    const head = value.toString(16).padStart(8, '0');
    const tail = value.toString(16).padStart(12, '0');
    return `${head}-0000-4000-8000-${tail}`;
};
const bytes = (length: number, fill: number): ArrayBuffer => new Uint8Array(length).fill(fill).buffer;
const jwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC',
    x: 'A'.repeat(43), y: 'B'.repeat(43) });
const CURSOR_KEY = new Uint8Array(32).fill(91);
const codec = createAuditCursorCodec(CURSOR_KEY, 'preview');

const USER = Object.freeze({ owner: id(1), admin: id(2), editor: id(3), viewer: id(4), outsider: id(5) });
const DEVICE = Object.freeze({ owner: id(11), admin: id(12), editor: id(13), viewer: id(14), outsider: id(15) });
const WORKSPACE = Object.freeze({ audit: id(21), other: id(22), revoke: id(23), corrupt: id(24) });
const SERVER_TIME = 10_000;

async function seedUser(userId: string, deviceId: string, subject: string, login: string,
    fill: number): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(userId, subject, login),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Audit test device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(deviceId, userId, jwk, bytes(32, fill))
    ]);
}

async function seedWorkspace(workspaceId: string, members: readonly [string, string][]): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, 'Audit Scoped Reads', NULL, 'active', 1, ?, 1, 1, NULL)`
        ).bind(workspaceId, USER.owner),
        ...members.map(([userId, role]) => env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, ?, 'active', NULL, ?, NULL, 1, 1, NULL, 1)`
        ).bind(workspaceId, userId, role, userId))
    ]);
}

async function seedEvent(sequence: number, workspaceId: string, eventType: string,
    targetType: AuditTargetType, targetId: string, serverTime: number, metadataJson = '{}',
    actorUserId = USER.owner, actorDeviceId = DEVICE.owner): Promise<void> {
    await env.COLLAB_DB.prepare(
        `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
          request_id, server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 8, ?, ?, 'success', 'committed', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'none')`
    ).bind(id(1_000 + sequence), workspaceId, eventType, actorUserId, actorDeviceId,
        targetType, targetId, id(2_000 + sequence), serverTime, metadataJson).run();
}

function list(overrides: Partial<Parameters<typeof listAuditEvents>[1]> = {}) {
    return listAuditEvents(env.COLLAB_DB, {
        actorUserId: USER.owner,
        actingDeviceId: DEVICE.owner,
        workspaceId: WORKSPACE.audit,
        serverTime: SERVER_TIME,
        ...overrides
    }, codec);
}

describe('CF-P4-006 audit registry and scoped reads', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'phase4_audit_scoped_reads');
        await seedUser(USER.owner, DEVICE.owner, '4001', 'owner', 1);
        await seedUser(USER.admin, DEVICE.admin, '4002', 'admin', 2);
        await seedUser(USER.editor, DEVICE.editor, '4003', 'editor', 3);
        await seedUser(USER.viewer, DEVICE.viewer, '4004', 'viewer', 4);
        await seedUser(USER.outsider, DEVICE.outsider, '4005', 'outsider', 5);
        const members: readonly [string, string][] = [
            [USER.owner, 'owner'], [USER.admin, 'admin'], [USER.editor, 'editor'], [USER.viewer, 'viewer']
        ];
        await seedWorkspace(WORKSPACE.audit, members);
        await seedWorkspace(WORKSPACE.other, [[USER.outsider, 'owner']]);
        await seedWorkspace(WORKSPACE.revoke, members);
        await seedWorkspace(WORKSPACE.corrupt, [[USER.owner, 'owner']]);
        await seedEvent(1, WORKSPACE.audit, 'workspace.created', 'workspace', WORKSPACE.audit, 1_000);
        await seedEvent(2, WORKSPACE.audit, 'invitation.created', 'invitation', id(102), 2_000);
        await seedEvent(3, WORKSPACE.audit, 'membership.role_changed', 'membership', USER.editor,
            3_000, JSON.stringify({ fromRole: 'editor', toRole: 'viewer' }));
        await seedEvent(4, WORKSPACE.audit, 'membership.removed', 'membership', USER.viewer,
            3_000, JSON.stringify({ priorRole: 'viewer', rotationRequired: true }));
        await seedEvent(5, WORKSPACE.audit, 'ownership.transferred', 'membership', USER.admin,
            4_000, JSON.stringify({ priorOwnerUserId: USER.owner, priorTargetRole: 'admin' }));
        await seedEvent(6, WORKSPACE.audit, 'document.updated', 'document', id(106), 5_000);
        await seedEvent(7, WORKSPACE.other, 'workspace.created', 'workspace', WORKSPACE.other, 5_500,
            '{}', USER.outsider, DEVICE.outsider);
        await seedEvent(8, WORKSPACE.revoke, 'workspace.created', 'workspace', WORKSPACE.revoke, 6_000);
        await seedEvent(9, WORKSPACE.corrupt, 'unknown.event', 'workspace', WORKSPACE.corrupt, 6_500,
            JSON.stringify({ sensitive: 'AUDIT_CANARY_SECRET' }));
    });

    it('enforces the versioned event registry and projects only approved before/after fields', () => {
        const projection = validateAuditEventRecord({
            eventId: id(3001), schemaVersion: 8, eventType: 'membership.role_changed',
            outcome: 'success', reasonCode: 'committed', actorUserId: USER.owner,
            actorDeviceId: DEVICE.owner, targetType: 'membership', targetId: USER.editor,
            requestId: id(3002), metadataJson: JSON.stringify({ fromRole: 'editor', toRole: 'viewer' }),
            correctionOfEventId: null, relatedEventId: null
        });
        expect(projection).toMatchObject({ outcome: 'succeeded',
            approvedBefore: { role: 'editor' }, approvedAfter: { role: 'viewer' } });
        for (const mutation of [
            { eventType: 'unknown.event' },
            { targetType: 'document' },
            { metadataJson: JSON.stringify({ fromRole: 'editor', toRole: 'viewer', secret: 'x' }) },
            { outcome: 'denied' },
            { schemaVersion: 9 }
        ]) {
            expect(() => validateAuditEventRecord({
                eventId: id(3001), schemaVersion: 8, eventType: 'membership.role_changed',
                outcome: 'success', reasonCode: 'committed', actorUserId: USER.owner,
                actorDeviceId: DEVICE.owner, targetType: 'membership', targetId: USER.editor,
                requestId: id(3002), metadataJson: JSON.stringify({ fromRole: 'editor', toRole: 'viewer' }),
                correctionOfEventId: null, relatedEventId: null, ...mutation
            })).toThrow('AUDIT_REGISTRY_INVALID');
        }
    });

    it('signs opaque cursors and rejects tampering, expiry, filter, workspace, and environment reuse', async () => {
        const filters = { eventType: null, occurredFrom: 0, occurredTo: SERVER_TIME } as const;
        const token = await codec.issue({ workspaceId: WORKSPACE.audit, filters },
            { occurredAt: 3_000, order: 7 }, SERVER_TIME);
        expect(token).not.toContain(WORKSPACE.audit);
        await expect(codec.verify(token, { workspaceId: WORKSPACE.audit, filters }, SERVER_TIME))
            .resolves.toEqual({ occurredAt: 3_000, order: 7 });
        await expect(codec.verify(`${token.slice(0, -1)}A`, { workspaceId: WORKSPACE.audit, filters }, SERVER_TIME))
            .rejects.toThrow('AUDIT_CURSOR_INVALID');
        await expect(codec.verify(token, { workspaceId: WORKSPACE.other, filters }, SERVER_TIME))
            .rejects.toThrow('AUDIT_CURSOR_INVALID');
        await expect(codec.verify(token, { workspaceId: WORKSPACE.audit,
            filters: { ...filters, eventType: 'workspace.created' } }, SERVER_TIME))
            .rejects.toThrow('AUDIT_CURSOR_INVALID');
        await expect(createAuditCursorCodec(CURSOR_KEY, 'production').verify(token,
            { workspaceId: WORKSPACE.audit, filters }, SERVER_TIME)).rejects.toThrow('AUDIT_CURSOR_INVALID');
        await expect(codec.verify(token, { workspaceId: WORKSPACE.audit, filters }, SERVER_TIME + 900_000))
            .rejects.toThrow('AUDIT_CURSOR_INVALID');
    });

    it('allows Owner and Admin scoped reads with stable descending order and approved fields only', async () => {
        const owner = await list({ limit: 100 });
        const admin = await list({ actorUserId: USER.admin, actingDeviceId: DEVICE.admin, limit: 100 });
        expect(admin).toEqual(owner);
        expect(owner.items).toHaveLength(6);
        expect(owner.items.map(item => item.eventType)).toEqual([
            'document.updated', 'ownership.transferred', 'membership.removed',
            'membership.role_changed', 'invitation.created', 'workspace.created'
        ]);
        expect(owner.items[2].order).toBeGreaterThan(owner.items[3].order);
        expect(JSON.stringify(owner)).not.toMatch(/metadata_json|hold_state|provider_subject|ciphertext|token|fingerprint/);
        expect(owner.nextCursor).toBeNull();
    });

    it('paginates identical timestamps without gaps or duplicates and ends with a null cursor', async () => {
        const eventIds: string[] = [];
        let cursor: string | undefined;
        do {
            const page = await list({ limit: 2, cursor });
            eventIds.push(...page.items.map(item => item.eventId));
            cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        expect(eventIds).toHaveLength(6);
        expect(new Set(eventIds).size).toBe(6);
        expect(eventIds).toEqual([id(1006), id(1005), id(1004), id(1003), id(1002), id(1001)]);
    });

    it('binds event and authoritative RFC3339 time filters into every page cursor', async () => {
        const filtered = await list({ eventType: 'membership.role_changed',
            occurredFrom: new Date(3_000).toISOString(), occurredTo: new Date(3_000).toISOString() });
        expect(filtered.items.map(item => item.eventType)).toEqual(['membership.role_changed']);
        await expect(list({ eventType: "membership.role_changed' OR 1=1 --" }))
            .rejects.toMatchObject({ code: 'AUDIT_INPUT_INVALID' });
        await expect(list({ occurredFrom: '1970-01-01T00:00:03Z' }))
            .rejects.toMatchObject({ code: 'AUDIT_INPUT_INVALID' });
        await expect(list({ limit: 101 })).rejects.toMatchObject({ code: 'AUDIT_INPUT_INVALID' });
    });

    it('denies Editor, Viewer, non-member, removed, and cross-workspace audit enumeration', async () => {
        for (const [actorUserId, actingDeviceId] of [
            [USER.editor, DEVICE.editor], [USER.viewer, DEVICE.viewer]
        ]) {
            await expect(list({ actorUserId, actingDeviceId }))
                .rejects.toMatchObject({ code: 'AUDIT_OPERATION_NOT_PERMITTED' });
        }
        await expect(list({ actorUserId: USER.outsider, actingDeviceId: DEVICE.outsider }))
            .rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
        await expect(listAuditEvents(env.COLLAB_DB, {
            actorUserId: USER.owner, actingDeviceId: DEVICE.owner, workspaceId: WORKSPACE.other,
            serverTime: SERVER_TIME
        }, codec)).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
    });

    it('repeats live authorization on the next page and blocks traversal immediately after removal', async () => {
        const first = await listAuditEvents(env.COLLAB_DB, {
            actorUserId: USER.admin, actingDeviceId: DEVICE.admin, workspaceId: WORKSPACE.revoke,
            serverTime: SERVER_TIME, limit: 1
        }, codec);
        expect(first.items).toHaveLength(1);
        await env.COLLAB_DB.prepare(
            `UPDATE memberships SET state = 'removed', removed_by = ?, removed_at = ?,
              role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ?`
        ).bind(USER.owner, SERVER_TIME, WORKSPACE.revoke, USER.admin).run();
        await expect(listAuditEvents(env.COLLAB_DB, {
            actorUserId: USER.admin, actingDeviceId: DEVICE.admin, workspaceId: WORKSPACE.revoke,
            serverTime: SERVER_TIME, limit: 1, cursor: first.nextCursor ?? undefined
        }, codec)).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
    });

    it('fails the whole page closed when D1 contains an unknown or privacy-unsafe event shape', async () => {
        await expect(listAuditEvents(env.COLLAB_DB, {
            actorUserId: USER.owner, actingDeviceId: DEVICE.owner, workspaceId: WORKSPACE.corrupt,
            serverTime: SERVER_TIME
        }, codec)).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
        const leaked = await env.COLLAB_DB.prepare(
            'SELECT metadata_json FROM audit_events WHERE workspace_id = ?'
        ).bind(WORKSPACE.corrupt).first<string>('metadata_json');
        expect(leaked).toContain('AUDIT_CANARY_SECRET');
    });
});
