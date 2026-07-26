// CF-P7-013 — the service adapter between the client and the surfaces.
//
// Every case here drives the real CF-P7-015 client over a recording transport.
// Nothing is asserted by reading the adapter's source: what is checked is the
// request that would have left the browser, and the value the surface would
// have been handed back.

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    createCollaborationServices, buildPath, SERVICE_ROUTES, SERVICE_METHODS,
    CollaborationServiceError
} from '../js/collaboration/services.js';
import { createApiClient } from '../js/collaboration/api-client.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const WS = '55555555-5555-4555-8555-555555555555';
const USER = '11111111-1111-4111-8111-111111111111';
const DEVICE = '44444444-4444-4444-8444-444444444444';
const INVITE = '66666666-6666-4666-8666-666666666666';
const KEY = 'a'.repeat(36);

const respond = (status, body, contentType = 'application/json; charset=utf-8') => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body
});

const SESSION = respond(200, {
    data: {
        authenticated: true,
        user: { userId: USER, login: 'octocat' },
        session: {},
        csrfToken: 'csrf-token-value'
    },
    meta: {}
});

/** A signed-in adapter over a transport that records instead of sending. */
async function signedIn(responses = []) {
    const calls = [];
    const queue = [...responses];
    const client = createApiClient({
        fetch: async (url, init) => {
            calls.push({ url, init });
            return queue.length === 0 ? respond(200, { data: {}, meta: {} })
                : (queue.length > 1 ? queue.shift() : queue[0]);
        },
        randomId: () => KEY
    });
    // The session call is index 0 of `calls`; every assertion below indexes past it.
    queue.unshift(SESSION);
    await client.resolveSession();
    return { services: createCollaborationServices({ client }), calls, client };
}

/** The code a call refused with, or null if it did not refuse. */
async function refusal(run) {
    try {
        await run();
        return null;
    } catch (error) {
        return error?.code ?? 'THREW_WITHOUT_CODE';
    }
}

// ── the adapter is a join, not a second opinion ──────────────────────────────

test('a client that cannot answer is refused rather than adapted', async () => {
    assert.equal(await refusal(() => createCollaborationServices({})), 'CLIENT_REQUIRED');
    assert.equal(await refusal(() => createCollaborationServices({ client: { request() {} } })),
        'CLIENT_REQUIRED');
});

test('every declared route is a method, and every method is a declared route', async () => {
    const { services } = await signedIn();
    for (const name of SERVICE_METHODS) {
        assert.equal(typeof services[name], 'function', `${name} is declared but not callable`);
    }
    // `newIdempotencyKey` is a pass-through, not a route; everything else on the
    // adapter must be one, or the surfaces are talking to something undeclared.
    const extra = Object.keys(services)
        .filter(name => !SERVICE_METHODS.includes(name) && name !== 'newIdempotencyKey');
    assert.deepEqual(extra, [], 'the adapter grew a method with no declared route');
});

test('every declared route appears in the frozen route catalog', () => {
    const contract = read('docs/collaboration-foundation/api-contract.md');
    for (const [name, route] of Object.entries(SERVICE_ROUTES)) {
        // The catalog writes placeholders as {workspaceId}; the template matches
        // it byte for byte, which is why the template is stored and not a built
        // string that could drift silently.
        const literal = `\`${route.method} /api/v1${route.template}\``;
        assert.ok(contract.includes(literal),
            `${name} names a route the contract catalog does not list: ${literal}`);
    }
});

// ── path segments, which the client alone cannot guard ───────────────────────

test('an identifier that is not the shape the server issues never reaches a URL', async () => {
    for (const hostile of ['../../admin', 'ws_1', '', 'not-a-uuid', `${WS}/../devices`]) {
        assert.equal(
            await refusal(async () => buildPath('/workspaces/{workspaceId}/members',
                { workspaceId: hostile })),
            'PATH_SEGMENT_INVALID',
            `a traversal or malformed id was interpolated: ${hostile}`);
    }
    assert.equal(buildPath('/workspaces/{workspaceId}/members', { workspaceId: WS }),
        `/api/v1/workspaces/${WS}/members`);
});

test('a refused identifier stops before the transport, not after it', async () => {
    const { services, calls } = await signedIn();
    const before = calls.length;
    assert.equal(await refusal(() => services.listMembers({ workspaceId: '../../admin' })),
        'PATH_SEGMENT_INVALID');
    assert.equal(calls.length, before, 'a refused path still reached the transport');
});

test('a placeholder nobody supplied is refused rather than sent literally', async () => {
    assert.equal(await refusal(async () => buildPath('/workspaces/{workspaceId}', {})),
        'PATH_SEGMENT_INVALID');
});

// ── each surface's question lands on its own route ───────────────────────────

test('the workspace reads go to the routes their surfaces name', async () => {
    const { services, calls } = await signedIn([
        respond(200, { data: { items: [] }, meta: { page: { nextCursor: null } } })
    ]);
    await services.listMembers({ workspaceId: WS });
    await services.listInvitations({ workspaceId: WS });
    await services.listAuditEvents({ workspaceId: WS });
    await services.readCurrentKeyEnvelope({ workspaceId: WS });
    const paths = calls.slice(1).map(call => call.url.split('?')[0]);
    assert.deepEqual(paths, [
        `/api/v1/workspaces/${WS}/members`,
        `/api/v1/workspaces/${WS}/invitations`,
        `/api/v1/workspaces/${WS}/audit-events`,
        `/api/v1/workspaces/${WS}/key-envelopes/current`
    ]);
    assert.ok(calls.slice(1).every(call => call.init.method === 'GET'),
        'a read was sent as something other than a GET');
});

test('a read carries no idempotency key and a mutation always does', async () => {
    const { services, calls } = await signedIn([
        respond(200, { data: { items: [] }, meta: {} })
    ]);
    await services.listMembers({ workspaceId: WS });
    assert.equal(calls[1].init.headers['Idempotency-Key'], undefined);

    const mutating = await signedIn([respond(201, { data: {}, meta: {} })]);
    await mutating.services.revokeInvitation({
        workspaceId: WS, invitationId: INVITE, idempotencyKey: KEY
    });
    assert.equal(mutating.calls[1].init.headers['Idempotency-Key'], KEY);
    assert.equal(mutating.calls[1].init.headers['X-CSRF-Token'], 'csrf-token-value');
});

test('a caller key is preserved, because that is how a replay works', async () => {
    const replay = 'b'.repeat(44);
    const { services, calls } = await signedIn([respond(200, { data: {}, meta: {} })]);
    await services.createBootstrapIntent({
        displayName: 'Platform QA', ownerDeviceId: DEVICE, idempotencyKey: replay
    });
    await services.createWorkspace({
        displayName: 'Platform QA', ownerDeviceId: DEVICE, idempotencyKey: replay,
        creatorEnvelope: { version: 1 }
    });
    // One key across both calls is the contract's own rule: a fresh key on the
    // second would read as a second request and could create a second workspace.
    assert.equal(calls[1].init.headers['Idempotency-Key'], replay);
    assert.equal(calls[2].init.headers['Idempotency-Key'], replay);
    assert.equal(JSON.parse(calls[2].init.body).initialKeyVersion, 1);
    assert.deepEqual(JSON.parse(calls[2].init.body).initialKeyEnvelope, { version: 1 });
});

test('a cursor is handed back exactly as it arrived', async () => {
    const opaque = 'eyJvIjoxfQ.signature~value-_';
    const { services, calls } = await signedIn([
        respond(200, { data: { items: [] }, meta: { page: { nextCursor: opaque } } })
    ]);
    const first = await services.listAuditEvents({ workspaceId: WS });
    assert.equal(first.nextCursor, opaque);
    await services.listAuditEvents({ workspaceId: WS, cursor: first.nextCursor });
    assert.ok(calls[2].url.includes(`cursor=${encodeURIComponent(opaque)}`),
        'the cursor was rebuilt rather than carried');
});

// ── the two places a wire name and a surface name differ ─────────────────────

test('the member list is projected onto what the surface renders', async () => {
    const { services } = await signedIn([
        respond(200, {
            data: {
                items: [{
                    userId: USER, role: 'owner', state: 'active', keyReadiness: 'key_ready',
                    joinedAt: '2026-07-26T00:00:00.000Z',
                    displayProfile: { login: 'octocat', displayName: 'Octo Cat' }
                }]
            },
            meta: {}
        })
    ]);
    const page = await services.listMembers({ workspaceId: WS });
    assert.equal(page.items[0].displayLogin, 'octocat');
    // `displayProfile` carries whatever the provider currently returns. A
    // renderer that received it would be free to show any field inside it.
    assert.equal('displayProfile' in page.items[0], false);
    assert.equal('joinedAt' in page.items[0], false);
});

test('an invitation is created under the name the route takes', async () => {
    const { services, calls } = await signedIn([respond(201, { data: {}, meta: {} })]);
    await services.createInvitation({
        workspaceId: WS, displayLogin: 'octocat', role: 'editor', idempotencyKey: KEY
    });
    assert.deepEqual(JSON.parse(calls[1].init.body), {
        githubUsername: 'octocat', role: 'editor'
    });
});

test('an invitation token travels in a body and never in a URL', async () => {
    const token = 'c'.repeat(48);
    const { services, calls } = await signedIn([respond(200, { data: {}, meta: {} })]);
    await services.bootstrapInvitation({ token });
    await services.acceptInvitation({ token, deviceId: DEVICE, idempotencyKey: KEY });
    for (const call of calls.slice(1)) {
        assert.equal(call.url.includes(token), false, 'the token reached the URL');
        assert.ok(call.init.body.includes(token), 'the token did not travel in the body');
    }
});

// ── a server refusal becomes something the journeys can catch ────────────────

test('a failure is raised with the code the journeys read', async () => {
    const { services } = await signedIn([
        respond(403, { error: { code: 'OPERATION_NOT_PERMITTED' }, meta: {} })
    ]);
    try {
        await services.listMembers({ workspaceId: WS });
        assert.fail('a denied read resolved instead of raising');
    } catch (error) {
        assert.ok(error instanceof CollaborationServiceError);
        assert.equal(error.code, 'OPERATION_NOT_PERMITTED');
        assert.equal(error.ui, 'role-disabled-explanation');
        assert.equal(error.status, 403);
        assert.ok(error.reason.length > 20, 'the failure cannot explain itself');
    }
});

test('a wire spelling resolves into the frozen taxonomy rather than through it', async () => {
    // The Workers runtime emits UNAUTHENTICATED; CF-P7-016 made the catalog's
    // AUTHENTICATION_REQUIRED the frozen code, so the alias points that way now.
    const { services } = await signedIn([
        respond(401, { error: { code: 'UNAUTHENTICATED' }, meta: {} })
    ]);
    const code = await refusal(() => services.listAuditEvents({ workspaceId: WS }));
    assert.equal(code, 'AUTHENTICATION_REQUIRED');
});

test('a code this build has never seen fails closed and is not echoed', async () => {
    const { services } = await signedIn([
        respond(500, { error: { code: 'SOMETHING_NOBODY_FROZE' }, meta: {} })
    ]);
    try {
        await services.listInvitations({ workspaceId: WS });
        assert.fail('an unrecognised failure resolved');
    } catch (error) {
        assert.equal(error.code, 'UNRECOGNISED');
        assert.equal(error.ui, 'error');
        assert.equal(error.reason.includes('SOMETHING_NOBODY_FROZE'), false);
    }
});

test('the app shell answering an API path is a failure, not data', async () => {
    const { services } = await signedIn([respond(200, { data: { items: [] } }, 'text/html')]);
    assert.equal(await refusal(() => services.listMembers({ workspaceId: WS })),
        'NON_JSON_RESPONSE');
});

// ── sign-out ─────────────────────────────────────────────────────────────────

test('a refused sign-out leaves the session usable', async () => {
    const { services, client } = await signedIn([
        respond(403, { error: { code: 'CSRF_REJECTED' }, meta: {} })
    ]);
    assert.equal(await refusal(() => services.signOut()), 'CSRF_REJECTED');
    assert.equal(client.canMutate, true, 'a failed sign-out threw the session away anyway');
});

test('an accepted sign-out forgets the token', async () => {
    const { services, client } = await signedIn([respond(204, null)]);
    await services.signOut();
    assert.equal(client.canMutate, false);
});
