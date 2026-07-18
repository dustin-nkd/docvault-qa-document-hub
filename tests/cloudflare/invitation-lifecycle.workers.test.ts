import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import {
    acceptInvitation,
    bootstrapInvitation,
    createGitHubInvitationResolver,
    createInvitation,
    issueInvitationToken,
    listPendingInvitations,
    revokeInvitation,
    verifyInvitationToken,
    type AcceptInvitationInput,
    type CreateInvitationInput,
    type InvitationIdentityResolver,
    type RevokeInvitationInput
} from '../../functions/_lib/invitations';

const id = (value: number): string => {
    const head = value.toString(16).padStart(8, '0');
    const tail = value.toString(16).padStart(12, '0');
    return `${head}-0000-4000-8000-${tail}`;
};
const blob = (fill: number): ArrayBuffer => new Uint8Array(32).fill(fill).buffer;
const publicJwk = JSON.stringify({ crv: 'P-256', ext: true, key_ops: [], kty: 'EC',
    x: 'A'.repeat(43), y: 'B'.repeat(43) });
const random = (fill: number) => Object.freeze({ bytes: (length: number) => new Uint8Array(length).fill(fill) });

const IDs = Object.freeze({
    owner: id(1), ownerDevice: id(2), admin: id(3), adminDevice: id(4),
    editor: id(5), editorDevice: id(6), viewer: id(7), viewerDevice: id(8),
    inviteeA: id(9), inviteeADevice: id(10), inviteeB: id(11), inviteeBDevice: id(12),
    inviteeC: id(13), inviteeCDevice: id(14), workspace: id(15)
});

const identities = Object.freeze({
    'invitee-a': { provider: 'github' as const, providerSubject: '2001', login: 'invitee-a' },
    'invitee-b': { provider: 'github' as const, providerSubject: '2002', login: 'invitee-b' },
    'invitee-c': { provider: 'github' as const, providerSubject: '2003', login: 'invitee-c' },
    editor: { provider: 'github' as const, providerSubject: '1003', login: 'editor' }
});

function resolver(calls?: string[]): InvitationIdentityResolver {
    return Object.freeze({
        async resolveLogin(login: string) {
            calls?.push(login);
            const resolved = identities[login as keyof typeof identities];
            if (!resolved) throw new Error('target unavailable');
            return resolved;
        }
    });
}

function createInput(sequence: number, targetLogin: string, offeredRole: 'admin' | 'editor' | 'viewer',
    actorUserId = IDs.owner, actorDeviceId = IDs.ownerDevice): CreateInvitationInput {
    return {
        actorUserId, actorDeviceId, workspaceId: IDs.workspace,
        invitationId: id(100 + sequence), targetLogin, offeredRole,
        mutationResultId: id(200 + sequence), clientMutationId: id(300 + sequence),
        requestFingerprint: blob(sequence), auditEventId: id(400 + sequence),
        requestId: id(500 + sequence), serverTime: 1_000 + sequence,
        replayExpiresAt: 100_000 + sequence
    };
}

function revokeInput(sequence: number, invitationId: string, actorUserId = IDs.owner,
    actorDeviceId = IDs.ownerDevice): RevokeInvitationInput {
    return {
        actorUserId, actorDeviceId, workspaceId: IDs.workspace, invitationId,
        mutationResultId: id(600 + sequence), clientMutationId: id(700 + sequence),
        requestFingerprint: blob(30 + sequence), auditEventId: id(800 + sequence),
        requestId: id(900 + sequence), serverTime: 2_000 + sequence,
        replayExpiresAt: 100_000 + sequence
    };
}

function acceptInput(sequence: number, token: string, actorUserId: string,
    actorDeviceId: string): AcceptInvitationInput {
    return {
        token, actorUserId, actorDeviceId, transitionGuardId: id(1_000 + sequence),
        clientMutationId: id(1_100 + sequence), requestFingerprint: blob(60 + sequence),
        auditEventId: id(1_200 + sequence), requestId: id(1_300 + sequence),
        serverTime: 3_000 + sequence, replayExpiresAt: 100_000 + sequence
    };
}

async function seedUser(userId: string, deviceId: string, subject: string, login: string): Promise<void> {
    await env.COLLAB_DB.batch([
        env.COLLAB_DB.prepare(
            `INSERT INTO users (id, provider, provider_subject, display_login, display_name,
              avatar_url, status, created_at, updated_at, deactivated_at)
             VALUES (?, 'github', ?, ?, NULL, NULL, 'active', 1, 1, NULL)`
        ).bind(userId, subject, login),
        env.COLLAB_DB.prepare(
            `INSERT INTO devices (id, user_id, label, public_jwk, fingerprint, suite, state,
              created_at, revoked_at, revoke_reason)
             VALUES (?, ?, 'Invitation test device', ?, ?, 'P256-ECDH-v1', 'active', 1, NULL, NULL)`
        ).bind(deviceId, userId, publicJwk, blob(Number(subject) % 255))
    ]);
}

async function count(sql: string, ...bindings: unknown[]): Promise<number> {
    return (await env.COLLAB_DB.prepare(sql).bind(...bindings).first<number>('count')) ?? 0;
}

describe('CF-P4-004 invitation lifecycle', () => {
    beforeAll(async () => {
        await applyD1Migrations(env.COLLAB_DB, env.COLLAB_MIGRATIONS, 'phase4_invitation_lifecycle');
        await seedUser(IDs.owner, IDs.ownerDevice, '1001', 'owner');
        await seedUser(IDs.admin, IDs.adminDevice, '1002', 'admin');
        await seedUser(IDs.editor, IDs.editorDevice, '1003', 'editor');
        await seedUser(IDs.viewer, IDs.viewerDevice, '1004', 'viewer');
        await seedUser(IDs.inviteeA, IDs.inviteeADevice, '2001', 'invitee-a');
        await seedUser(IDs.inviteeB, IDs.inviteeBDevice, '2002', 'invitee-b');
        await seedUser(IDs.inviteeC, IDs.inviteeCDevice, '2003', 'invitee-c');
        await env.COLLAB_DB.batch([
            env.COLLAB_DB.prepare(
                `INSERT INTO workspaces (id, display_name, description_envelope, state,
                  current_key_version, created_by, created_at, updated_at, deleted_at)
                 VALUES (?, 'Invitation Foundation', NULL, 'active', 1, ?, 10, 10, NULL)`
            ).bind(IDs.workspace, IDs.owner),
            ...[[IDs.owner, 'owner'], [IDs.admin, 'admin'], [IDs.editor, 'editor'], [IDs.viewer, 'viewer']]
                .map(([user, role]) => env.COLLAB_DB.prepare(
                    `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
                      accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
                     VALUES (?, ?, ?, 'active', NULL, ?, NULL, 10, 10, NULL, 1)`
                ).bind(IDs.workspace, user, role, user))
        ]);
    });

    it('issues 256-bit structured tokens and verifies only the matching secret in Web Crypto', async () => {
        const invitationId = id(90);
        const issued = await issueInvitationToken(invitationId, random(7));
        expect(issued.token).toHaveLength(80);
        expect(issued.digest).toHaveLength(32);
        expect(await verifyInvitationToken(issued.token, issued.digest)).toMatchObject({ invitationId });
        const wrong = await issueInvitationToken(invitationId, random(8));
        expect(await verifyInvitationToken(wrong.token, issued.digest)).toBeNull();
    });

    it('normalizes provider lookups, bounds responses, and never follows redirects with credentials', async () => {
        const requests: Array<{ url: string; init: RequestInit; timeout: number }> = [];
        const adapter = createGitHubInvitationResolver({ accessToken: 'synthetic-secret' }, {
            async request(url, init, timeout) {
                requests.push({ url, init, timeout });
                return new Response(JSON.stringify({ id: 2001, login: 'Invitee-A' }), {
                    status: 200, headers: { 'Content-Type': 'application/json' }
                });
            }
        });
        await expect(adapter.resolveLogin(' INVITEE-A ')).resolves.toEqual({
            provider: 'github', providerSubject: '2001', login: 'Invitee-A'
        });
        expect(requests[0].url).toBe('https://api.github.com/users/invitee-a');
        expect(requests[0].init.redirect).toBe('manual');
        expect(requests[0].timeout).toBe(5_000);
        expect(new Headers(requests[0].init.headers).get('Authorization')).toBe('Bearer synthetic-secret');
    });

    it('creates once, stores only the digest, lists bounded pending metadata, and redacts replay tokens', async () => {
        const calls: string[] = [];
        const input = createInput(1, 'Invitee-A', 'editor');
        const first = await createInvitation(env.COLLAB_DB, input, {
            identityResolver: resolver(calls), random: random(11)
        });
        const replay = await createInvitation(env.COLLAB_DB, input, {
            identityResolver: resolver(calls), random: random(12)
        });
        expect(first).toMatchObject({ invitationId: input.invitationId, state: 'pending',
            replayed: false, httpStatus: 201 });
        expect(first.token).toMatch(new RegExp(`^${input.invitationId}\\.`));
        expect(replay).toMatchObject({ invitationId: input.invitationId, token: null, replayed: true });
        expect(calls).toEqual(['invitee-a']);
        const stored = await env.COLLAB_DB.prepare(
            'SELECT token_digest, expires_at, state FROM invitations WHERE id = ?'
        ).bind(input.invitationId).first<{ token_digest: number[]; expires_at: number; state: string }>();
        expect(stored?.token_digest).toHaveLength(32);
        expect(stored?.expires_at).toBe(input.serverTime + 259_200_000);
        expect(JSON.stringify(stored)).not.toContain(first.token as string);
        const listed = await listPendingInvitations(env.COLLAB_DB, {
            actorUserId: IDs.admin, actingDeviceId: IDs.adminDevice,
            workspaceId: IDs.workspace, serverTime: input.serverTime, limit: 10
        });
        expect(listed.items.some(item => item.invitationId === input.invitationId)).toBe(true);
        expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'invitation.created' AND target_id = ?",
            input.invitationId)).toBe(1);
    });

    it('applies Owner/Admin ceilings before provider lookup and rejects active-member targets', async () => {
        const calls: string[] = [];
        await expect(createInvitation(env.COLLAB_DB,
            createInput(2, 'invitee-c', 'admin', IDs.admin, IDs.adminDevice),
            { identityResolver: resolver(calls), random: random(13) }))
            .rejects.toMatchObject({ code: 'INVITATION_OPERATION_NOT_PERMITTED' });
        await expect(createInvitation(env.COLLAB_DB,
            createInput(3, 'invitee-c', 'editor', IDs.editor, IDs.editorDevice),
            { identityResolver: resolver(calls), random: random(14) }))
            .rejects.toMatchObject({ code: 'INVITATION_OPERATION_NOT_PERMITTED' });
        await expect(createInvitation(env.COLLAB_DB, createInput(4, 'editor', 'viewer'),
            { identityResolver: resolver(calls), random: random(15) })).rejects.toBeDefined();
        expect(calls).toEqual(['editor']);
        expect(await count('SELECT COUNT(*) AS count FROM invitations WHERE id IN (?, ?, ?)',
            id(102), id(103), id(104))).toBe(0);
    });

    it('atomically replaces duplicate pending invitations and invalidates the prior capability', async () => {
        const original = await createInvitation(env.COLLAB_DB, createInput(5, 'invitee-b', 'viewer'),
            { identityResolver: resolver(), random: random(21) });
        const replacementInput = createInput(6, 'INVITEE-B', 'editor');
        const replacement = await createInvitation(env.COLLAB_DB, replacementInput,
            { identityResolver: resolver(), random: random(22) });
        expect(await env.COLLAB_DB.prepare(
            'SELECT state FROM invitations WHERE id = ?'
        ).bind(original.invitationId).first<string>('state')).toBe('revoked');
        expect(await env.COLLAB_DB.prepare(
            'SELECT replacement_of FROM invitations WHERE id = ?'
        ).bind(replacement.invitationId).first<string>('replacement_of')).toBe(original.invitationId);
        expect(await count(
            "SELECT COUNT(*) AS count FROM invitations WHERE workspace_id = ? AND target_provider_subject = '2002' AND state = 'pending'",
            IDs.workspace)).toBe(1);
        await expect(bootstrapInvitation(env.COLLAB_DB, {
            token: original.token as string, serverTime: 2_000
        })).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
        await expect(bootstrapInvitation(env.COLLAB_DB, {
            token: replacement.token as string, serverTime: replacementInput.serverTime
        })).resolves.toMatchObject({ invitationId: replacement.invitationId,
            workspaceDisplayName: 'Invitation Foundation', targetDisplayLogin: 'invitee-b',
            role: 'editor', state: 'pending' });
    });

    it('bootstraps minimum context, matches immutable subject, and accepts once into pending_key', async () => {
        const createdInput = createInput(7, 'invitee-c', 'viewer');
        const created = await createInvitation(env.COLLAB_DB, createdInput,
            { identityResolver: resolver(), random: random(31) });
        const context = await bootstrapInvitation(env.COLLAB_DB, {
            token: created.token as string, actorUserId: IDs.inviteeC,
            serverTime: createdInput.serverTime + 1
        });
        expect(context).toEqual({ invitationId: created.invitationId,
            workspaceDisplayName: 'Invitation Foundation', targetDisplayLogin: 'invitee-c',
            role: 'viewer', expiresAt: created.expiresAt, state: 'pending', identityMatch: true });
        await expect(acceptInvitation(env.COLLAB_DB,
            acceptInput(1, created.token as string, IDs.inviteeA, IDs.inviteeADevice)))
            .rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
        const acceptance = acceptInput(2, created.token as string, IDs.inviteeC, IDs.inviteeCDevice);
        const [first, replay] = await Promise.all([
            acceptInvitation(env.COLLAB_DB, acceptance), acceptInvitation(env.COLLAB_DB, acceptance)
        ]);
        expect(first).toEqual(replay);
        expect(first).toEqual({ invitationId: created.invitationId, workspaceId: IDs.workspace,
            membershipState: 'pending_key', httpStatus: 201 });
        expect(await env.COLLAB_DB.prepare(
            'SELECT role, state FROM memberships WHERE workspace_id = ? AND user_id = ?'
        ).bind(IDs.workspace, IDs.inviteeC).first()).toEqual({ role: 'viewer', state: 'pending_key' });
        expect(await count('SELECT COUNT(*) AS count FROM workspace_key_envelopes WHERE workspace_id = ? AND target_user_id = ?',
            IDs.workspace, IDs.inviteeC)).toBe(0);
        expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'invitation.accepted' AND target_id = ?",
            created.invitationId)).toBe(1);
        await expect(bootstrapInvitation(env.COLLAB_DB, {
            token: created.token as string, serverTime: acceptance.serverTime + 1
        })).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
    });

    it('enforces revoke ceilings, expiry boundaries, terminal replay, and one audit event', async () => {
        const adminInviteInput = createInput(8, 'invitee-a', 'admin');
        const adminInvite = await createInvitation(env.COLLAB_DB, adminInviteInput,
            { identityResolver: resolver(), random: random(41) });
        await expect(revokeInvitation(env.COLLAB_DB,
            revokeInput(1, adminInvite.invitationId, IDs.admin, IDs.adminDevice)))
            .rejects.toMatchObject({ code: 'INVITATION_OPERATION_NOT_PERMITTED' });
        const revoke = revokeInput(2, adminInvite.invitationId);
        const first = await revokeInvitation(env.COLLAB_DB, revoke);
        const replay = await revokeInvitation(env.COLLAB_DB, revoke);
        expect(first).toEqual({ invitationId: adminInvite.invitationId, state: 'revoked',
            replayed: false, httpStatus: 204 });
        expect(replay).toMatchObject({ replayed: true });
        await expect(bootstrapInvitation(env.COLLAB_DB, {
            token: adminInvite.token as string, serverTime: revoke.serverTime
        })).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
        expect(await count("SELECT COUNT(*) AS count FROM audit_events WHERE event_type = 'invitation.revoked' AND target_id = ?",
            adminInvite.invitationId)).toBe(1);

        const expiryInput = createInput(9, 'invitee-a', 'editor');
        const expiring = await createInvitation(env.COLLAB_DB, expiryInput,
            { identityResolver: resolver(), random: random(42) });
        await expect(bootstrapInvitation(env.COLLAB_DB, {
            token: expiring.token as string, serverTime: expiring.expiresAt
        })).rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
        await expect(acceptInvitation(env.COLLAB_DB,
            { ...acceptInput(3, expiring.token as string, IDs.inviteeA, IDs.inviteeADevice),
                serverTime: expiring.expiresAt, replayExpiresAt: expiring.expiresAt + 1_000 }))
            .rejects.toMatchObject({ code: 'INVITATION_UNAVAILABLE' });
    });

    it('rejoins a removed member as a new pending-key authorization episode', async () => {
        await env.COLLAB_DB.prepare(
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by, accepted_by,
              removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'viewer', 'removed', ?, ?, ?, 10, NULL, 20, 4)`
        ).bind(IDs.workspace, IDs.inviteeB, IDs.owner, IDs.inviteeB, IDs.owner).run();
        const invitationInput = createInput(10, 'invitee-b', 'editor');
        const invitation = await createInvitation(env.COLLAB_DB, invitationInput,
            { identityResolver: resolver(), random: random(51) });
        await acceptInvitation(env.COLLAB_DB,
            acceptInput(4, invitation.token as string, IDs.inviteeB, IDs.inviteeBDevice));
        expect(await env.COLLAB_DB.prepare(
            `SELECT role, state, role_version, removed_at FROM memberships
             WHERE workspace_id = ? AND user_id = ?`
        ).bind(IDs.workspace, IDs.inviteeB).first()).toEqual({
            role: 'editor', state: 'pending_key', role_version: 5, removed_at: null
        });
    });
});
