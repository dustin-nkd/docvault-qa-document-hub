// The collaboration service adapter (CF-P7-013).
//
// CF-P7-015 built one door to the network: a client that speaks the wire
// contract — paths, CSRF, idempotency, cursors, the frozen error taxonomy — and
// knows nothing about workspaces, members, or invitations. The eleven surface
// stories built the other end: journeys that call `api.listMembers`,
// `api.createInvitation`, `api.readCurrentKeyEnvelope`, and eleven more names
// like them, and were each gated on performing no transport of their own.
//
// Both halves are right and neither can reach the other. The client has no
// `listMembers`; the surfaces have no `/api/v1`. This module is the join, and it
// is the only thing between them: a name on one side, a route on the other.
//
// It adds nothing else. No identity, no envelope, no revision, no idempotency,
// no cursor, no membership, and no outbox logic lands here — every one of those
// already lives in a reviewed service, and re-deciding any of them at the seam
// would be the exact failure the Phase 7 governing principle names. What this
// file is allowed to know is which frozen route answers which question.
//
// Two things it does decide, because nobody else can:
//
//   - **Path segments are validated before they are interpolated.** The client
//     refuses a path that leaves the origin, but `/api/v1/workspaces/${id}` with
//     an `id` of `../../admin` is still same-origin and still starts with the
//     versioned prefix. The identifiers the server issues are UUID v4, so a
//     segment that is not one never becomes part of a URL.
//   - **A server failure is raised, not returned.** The client answers
//     `{ok: false, failure}` because it has no opinion about what a caller
//     should do; the journeys were written to `catch` and read `error.code`.
//     Translating between those two conventions in one place is cheaper than
//     asking fourteen call sites to remember which one they are talking to.

import { API_BASE } from './api-client.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLACEHOLDER = /\{([a-zA-Z]+)\}/g;

/**
 * Every route this adapter reaches, as a template rather than a built string.
 *
 * Declared as data so the gate can compare it against the frozen route catalog
 * directly, and so no method can quietly grow a second route or reach one the
 * catalog does not contain. A template with a `{placeholder}` may only be
 * completed through `buildPath`, which refuses a segment the server would never
 * have issued.
 */
export const SERVICE_ROUTES = Object.freeze({
    signOut: Object.freeze({ method: 'POST', template: '/session/logout' }),
    listWorkspaces: Object.freeze({ method: 'GET', template: '/workspaces' }),
    createBootstrapIntent:
        Object.freeze({ method: 'POST', template: '/workspaces/bootstrap-intents' }),
    createWorkspace: Object.freeze({ method: 'POST', template: '/workspaces' }),
    registerDevice: Object.freeze({ method: 'POST', template: '/devices' }),
    revokeDevice: Object.freeze({ method: 'DELETE', template: '/devices/{deviceId}' }),
    readCurrentKeyEnvelope:
        Object.freeze({ method: 'GET', template: '/workspaces/{workspaceId}/key-envelopes/current' }),
    listMembers: Object.freeze({ method: 'GET', template: '/workspaces/{workspaceId}/members' }),
    listInvitations:
        Object.freeze({ method: 'GET', template: '/workspaces/{workspaceId}/invitations' }),
    createInvitation:
        Object.freeze({ method: 'POST', template: '/workspaces/{workspaceId}/invitations' }),
    revokeInvitation: Object.freeze({
        method: 'DELETE', template: '/workspaces/{workspaceId}/invitations/{invitationId}'
    }),
    bootstrapInvitation: Object.freeze({ method: 'POST', template: '/invitations/bootstrap' }),
    acceptInvitation: Object.freeze({ method: 'POST', template: '/invitations/accept' }),
    listAuditEvents:
        Object.freeze({ method: 'GET', template: '/workspaces/{workspaceId}/audit-events' })
});

export const SERVICE_METHODS = Object.freeze(Object.keys(SERVICE_ROUTES));

export class CollaborationServiceError extends Error {
    /**
     * @param {string} code
     * @param {{ui?: string|null, reason?: string|null, status?: number|null,
     *          requestId?: string|null, details?: object|null}} [context]
     */
    constructor(code, context = {}) {
        super(code);
        this.name = 'CollaborationServiceError';
        this.code = code;
        // Carried so a caller can present the failure without a second lookup;
        // the values come from the client's frozen table, never from here.
        this.ui = context.ui ?? null;
        this.reason = context.reason ?? null;
        this.status = context.status ?? null;
        this.requestId = context.requestId ?? null;
        this.details = context.details ?? null;
    }
}

const fail = (code, context) => { throw new CollaborationServiceError(code, context); };

/**
 * Complete a route template.
 *
 * Every placeholder must be an identifier of the shape the server issues. This
 * is not belt-and-braces over the client's same-origin rule — that rule cannot
 * help here, because `/api/v1/workspaces/../../admin` satisfies it completely.
 * A traversal segment, an encoded slash, or a query fragment smuggled through an
 * id would all survive it and land on a route the caller never named.
 *
 * @param {string} template
 * @param {Record<string, string>} [params]
 */
export function buildPath(template, params = {}) {
    if (typeof template !== 'string' || !template.startsWith('/')) fail('ROUTE_TEMPLATE_INVALID');
    const path = template.replace(PLACEHOLDER, (_match, name) => {
        const value = params[name];
        if (typeof value !== 'string' || !UUID_V4.test(value)) fail('PATH_SEGMENT_INVALID');
        return value;
    });
    // A leftover brace means a placeholder the caller never supplied, which
    // would otherwise be sent literally.
    if (path.includes('{') || path.includes('}')) fail('PATH_SEGMENT_INVALID');
    return `${API_BASE}${path}`;
}

/**
 * The member list's key readiness, from what the route actually reports.
 *
 * `MembershipView` carries a boolean `keyReady`, computed server-side by asking
 * whether an unrevoked envelope exists for this member at the workspace's
 * *current* key version, held by an active device. The surfaces speak the
 * five-value `KEY_READINESS` vocabulary instead, and this is the join.
 *
 * Only two of those five are reachable from here, and that is a property of the
 * route rather than a shortcut taken here:
 *
 *   - `stale_key` is indistinguishable from `pending_key`, because the server's
 *     query folds "envelope at an older version" and "no envelope at all" into
 *     the same `false`;
 *   - `revoked` and `not_entitled` describe people this route does not return —
 *     it filters `state <> 'removed'`.
 *
 * Guessing at the other three from a boolean would put a claim on screen the
 * server never made, so this maps only what it can actually see.
 */
function readinessOf(member) {
    return member.keyReady === true ? 'key_ready' : 'pending_key';
}

/** Turn a client failure into something the journeys can `catch` and read. */
function raise(result) {
    const failure = result.failure ?? {};
    fail(failure.code ?? 'UNRECOGNISED', {
        ui: failure.ui ?? 'error',
        reason: failure.reason ?? null,
        status: result.status ?? null,
        requestId: result.requestId ?? null,
        details: result.details ?? null
    });
}

/**
 * Build the adapter over one client.
 *
 * `newIdempotencyKey` is exposed rather than used internally on purpose: the
 * journeys own their own replay keys — `runCreateWorkspace` deliberately reuses
 * one key across two calls, and the outbox replays a mutation under its
 * original — so minting a fresh key here would break the one property those
 * keys exist to provide.
 *
 * @param {{client: object}} input
 */
export function createCollaborationServices({ client } = {}) {
    if (!client || typeof client.request !== 'function' || typeof client.list !== 'function'
        || typeof client.mutate !== 'function') fail('CLIENT_REQUIRED');

    /** A paginated read, with the cursor carried through untouched. */
    async function page(name, params, { cursor, filters } = {}) {
        const route = SERVICE_ROUTES[name];
        const result = await client.list({
            path: buildPath(route.template, params),
            cursor: cursor ?? null,
            filters: filters ?? {}
        });
        if (!result.ok) raise(result);
        return Object.freeze({ items: result.items, nextCursor: result.nextCursor });
    }

    /** A single read. */
    async function read(name, params) {
        const route = SERVICE_ROUTES[name];
        const result = await client.request({
            method: route.method, path: buildPath(route.template, params)
        });
        if (!result.ok) raise(result);
        return result.data ?? {};
    }

    /** A state change. The key is the caller's; it is never invented here. */
    async function change(name, params, { body = null, idempotencyKey = null } = {}) {
        const route = SERVICE_ROUTES[name];
        const result = await client.mutate({
            method: route.method,
            path: buildPath(route.template, params),
            body,
            idempotencyKey
        });
        if (!result.ok) raise(result);
        return result.data ?? {};
    }

    return Object.freeze({
        // ── account scope ────────────────────────────────────────────────────
        listWorkspaces: ({ cursor } = {}) => page('listWorkspaces', {}, { cursor }),

        /**
         * End the session. The client is told to forget its CSRF token only
         * after the server has accepted, because dropping it first would leave
         * a failed sign-out with no way to retry.
         */
        async signOut({ idempotencyKey = null } = {}) {
            await change('signOut', {}, { idempotencyKey });
            client.forgetSession();
            return Object.freeze({ status: 'signed-out' });
        },

        /**
         * Reserve the workspace binding. Mutates nothing server-side, but it is
         * a POST carrying an Idempotency-Key, and the same key must be used
         * again by `createWorkspace` — that pairing is the contract's, and it is
         * why the key arrives as an argument.
         */
        createBootstrapIntent: ({ displayName, ownerDeviceId, idempotencyKey }) =>
            change('createBootstrapIntent', {}, {
                body: { displayName, ownerDeviceId },
                idempotencyKey
            }),

        createWorkspace: ({ displayName, ownerDeviceId, idempotencyKey, creatorEnvelope }) =>
            change('createWorkspace', {}, {
                // `initialKeyVersion` is exactly 1 by contract for a create; the
                // journey checked that the binding agreed before sealing.
                body: {
                    displayName,
                    ownerDeviceId,
                    initialKeyVersion: 1,
                    initialKeyEnvelope: creatorEnvelope
                },
                idempotencyKey
            }),

        registerDevice: ({ publicJwk, fingerprint, suite, displayLabel, idempotencyKey }) =>
            change('registerDevice', {}, {
                body: displayLabel === undefined
                    ? { publicJwk, fingerprint, suite }
                    : { publicJwk, fingerprint, suite, displayLabel },
                idempotencyKey
            }),

        revokeDevice: ({ deviceId, idempotencyKey }) =>
            change('revokeDevice', { deviceId }, { idempotencyKey }),

        // ── workspace scope ──────────────────────────────────────────────────
        readCurrentKeyEnvelope: ({ workspaceId }) =>
            read('readCurrentKeyEnvelope', { workspaceId }),

        /**
         * The member list, with the one display field the surface names.
         *
         * `MembershipView` carries the provider's mutable display fields inside
         * `displayProfile`; the surface renders a `displayLogin`. Naming that
         * join here rather than in the view keeps the surface free of wire
         * shapes — and keeps `displayProfile` from reaching a renderer that
         * would then be free to show any field inside it.
         */
        async listMembers({ workspaceId, cursor } = {}) {
            const result = await page('listMembers', { workspaceId }, { cursor });
            return Object.freeze({
                items: Object.freeze(result.items.map(member => Object.freeze({
                    userId: member.userId,
                    role: member.role,
                    state: member.state,
                    keyReadiness: readinessOf(member),
                    displayLogin: member.displayProfile?.login ?? member.displayLogin ?? 'unknown'
                }))),
                nextCursor: result.nextCursor
            });
        },

        listInvitations: ({ workspaceId, cursor } = {}) =>
            page('listInvitations', { workspaceId }, { cursor }),

        /**
         * The surface speaks of a `displayLogin` because that is what a person
         * types and what the pending list shows back. The route takes
         * `githubUsername`, which it resolves once to an immutable subject. The
         * two names are the same value at different ages, and this line is where
         * that is written down.
         */
        createInvitation: ({ workspaceId, displayLogin, role, idempotencyKey }) =>
            change('createInvitation', { workspaceId }, {
                body: { githubUsername: displayLogin, role },
                idempotencyKey
            }),

        revokeInvitation: ({ workspaceId, invitationId, idempotencyKey }) =>
            change('revokeInvitation', { workspaceId, invitationId }, { idempotencyKey }),

        listAuditEvents: ({ workspaceId, cursor, filters } = {}) =>
            page('listAuditEvents', { workspaceId }, { cursor, filters }),

        // ── invitation acceptance ────────────────────────────────────────────
        //
        // The token travels in a POST body and never in a path or a query. That
        // is the whole reason these two are not GETs: a fragment token that
        // reached a URL would be in a log the moment it left.
        bootstrapInvitation: ({ token }) =>
            change('bootstrapInvitation', {}, { body: { token } }),

        acceptInvitation: ({ token, deviceId, idempotencyKey }) =>
            change('acceptInvitation', {}, { body: { token, deviceId }, idempotencyKey }),

        /** Passed through so a journey can hold a key for a replay it has not sent. */
        newIdempotencyKey: () => client.newIdempotencyKey()
    });
}
