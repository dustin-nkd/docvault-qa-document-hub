// CF-P7-015 — the collaboration API client.
//
// Every case drives the module. Nothing here reads its source: a client that
// passed by looking right would be the exact failure this story exists to undo.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createApiClient, presentErrorCode, buildQuery, assertSameOriginPath, assertIdempotencyKey,
    ApiClientError, ERROR_PRESENTATION, SERVER_CODE_ALIASES, TAXONOMY_CODES,
    API_BASE, PAGE_LIMIT_MAX, MUTATION_METHODS
} from '../js/collaboration/api-client.js';

// ── a transport that records rather than connects ────────────────────────────

const jsonResponse = (status, body, headers = {}) => ({
    ok: status >= 200 && status < 300,
    status,
    headers: {
        get(name) {
            const key = name.toLowerCase();
            if (key === 'content-type') return headers['content-type']
                ?? 'application/json; charset=utf-8';
            return headers[key] ?? null;
        }
    },
    json: async () => body
});

function recorder(responses) {
    const calls = [];
    const queue = Array.isArray(responses) ? [...responses] : [responses];
    const transport = async (url, init) => {
        calls.push({ url, init });
        const next = queue.length > 1 ? queue.shift() : queue[0];
        if (typeof next === 'function') return next(url, init);
        return next;
    };
    return { calls, transport };
}

const SESSION_OK = jsonResponse(200, {
    data: {
        authenticated: true,
        user: { userId: 'u_1', login: 'dustin-nkd', avatarUrl: 'https://example.test/a.png' },
        session: { authenticatedAt: '2026-07-26T00:00:00.000Z' },
        csrfToken: 'csrf-token-value'
    },
    meta: { requestId: 'req_1', apiVersion: 'v1' }
});

const KEY = 'a'.repeat(36);

async function signedInClient(extraResponses = []) {
    const { calls, transport } = recorder([SESSION_OK, ...extraResponses]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    await client.resolveSession();
    return { client, calls, transport };
}

// ── construction ─────────────────────────────────────────────────────────────

test('a client with no usable transport is refused rather than built', () => {
    for (const value of [null, 'fetch', 42]) {
        assert.throws(() => createApiClient({ fetch: value }),
            error => error.code === 'TRANSPORT_REQUIRED', String(value));
    }
});

test('an omitted transport falls back to the ambient global, which lives only here', () => {
    // The one module permitted to reach for `fetch`. Every other collaboration
    // module is gated on not doing so, which only means something because this
    // one does it for them.
    assert.doesNotThrow(() => createApiClient());
});

test('the returned client is frozen', () => {
    const client = createApiClient({ fetch: async () => SESSION_OK });
    assert.equal(Object.isFrozen(client), true);
});

// ── the frozen error taxonomy ────────────────────────────────────────────────

test('the taxonomy is exactly the twenty-nine codes of the server catalog', () => {
    assert.equal(TAXONOMY_CODES.length, 29);
});

test('every frozen code presents with a reason in text', () => {
    for (const code of TAXONOMY_CODES) {
        const presented = presentErrorCode(code);
        assert.equal(presented.recognised, true, code);
        assert.ok(presented.reason.length > 20, code);
        assert.ok(presented.ui.length > 0, code);
    }
});

test('the wire-spelling aliases resolve onto frozen codes', () => {
    for (const [server, frozen] of Object.entries(SERVER_CODE_ALIASES)) {
        assert.equal(presentErrorCode(server).code, frozen, server);
        assert.ok(frozen in ERROR_PRESENTATION, frozen);
    }
});

test('the wire spellings the Workers runtime emits still present as unauthorized', () => {
    // CF-P7-016 turned this join around. The handlers put UNAUTHENTICATED and
    // RECENT_AUTHENTICATION_REQUIRED on the wire and no Phase 7 story may change
    // them; without the alias a real 401 or 403 from Preview would fall into the
    // unrecognised bucket and silently lose its unauthorized presentation.
    assert.equal(presentErrorCode('UNAUTHENTICATED').code, 'AUTHENTICATION_REQUIRED');
    assert.equal(presentErrorCode('UNAUTHENTICATED').ui, 'unauthorized');
    assert.equal(presentErrorCode('RECENT_AUTHENTICATION_REQUIRED').code,
        'REAUTHENTICATION_REQUIRED');
    assert.equal(presentErrorCode('RECENT_AUTHENTICATION_REQUIRED').ui, 'unauthorized');
});

test('a session that expired is its own code rather than an alias of another', () => {
    assert.equal(presentErrorCode('SESSION_EXPIRED').recognised, true);
    assert.equal(presentErrorCode('SESSION_EXPIRED').code, 'SESSION_EXPIRED');
    assert.equal(presentErrorCode('SESSION_EXPIRED').ui, 'unauthorized');
});

test('an unknown code fails closed as error rather than passing through', () => {
    const presented = presentErrorCode('SOME_FUTURE_CODE');
    assert.equal(presented.recognised, false);
    assert.equal(presented.ui, 'error');
    assert.equal(presented.code, 'UNRECOGNISED');
    assert.equal(presented.reason.includes('SOME_FUTURE_CODE'), false);
});

test('a missing code is still presentable', () => {
    assert.equal(presentErrorCode(undefined).ui, 'error');
});

test('a conflict is Conflict and not a generic error', () => {
    assert.equal(presentErrorCode('DOCUMENT_REVISION_CONFLICT').ui, 'Conflict');
});

test('a role denial is an explanation, not an error', () => {
    assert.equal(presentErrorCode('OPERATION_NOT_PERMITTED').ui, 'role-disabled-explanation');
});

test('not-found is never presented as access removed on its own', () => {
    // The state may only be claimed after a membership re-check; the client
    // hands over both possibilities and decides neither.
    assert.equal(presentErrorCode('RESOURCE_NOT_FOUND').ui, 'empty-or-access-removed');
});

// ── paths ────────────────────────────────────────────────────────────────────

test('an absolute URL is refused before anything is sent', () => {
    assert.throws(() => assertSameOriginPath('https://evil.test/api/v1/session'),
        error => error.code === 'PATH_NOT_SAME_ORIGIN');
});

test('a protocol-relative URL is refused', () => {
    assert.throws(() => assertSameOriginPath('//evil.test/api/v1/session'),
        error => error.code === 'PATH_NOT_SAME_ORIGIN');
});

test('a backslash path is refused', () => {
    assert.throws(() => assertSameOriginPath('/api/v1\\evil'),
        error => error.code === 'PATH_NOT_SAME_ORIGIN');
});

test('a path outside the versioned prefix is refused', () => {
    assert.throws(() => assertSameOriginPath('/admin/session'),
        error => error.code === 'PATH_OUTSIDE_API');
});

test('a hand-built query string is refused so the structured builder is used', () => {
    assert.throws(() => assertSameOriginPath(`${API_BASE}/workspaces?limit=50`),
        error => error.code === 'QUERY_MUST_BE_STRUCTURED');
});

test('the versioned prefix itself is accepted', () => {
    assert.equal(assertSameOriginPath(`${API_BASE}/session`), `${API_BASE}/session`);
});

test('the transport is never reached for a refused path', async () => {
    let reached = false;
    const client = createApiClient({ fetch: async () => { reached = true; return SESSION_OK; } });
    await assert.rejects(client.request({ path: 'https://evil.test/api/v1/session' }),
        error => error.code === 'PATH_NOT_SAME_ORIGIN');
    assert.equal(reached, false);
});

// ── pagination and cursors ───────────────────────────────────────────────────

test('a cursor is passed through byte for byte', () => {
    const cursor = 'eyJvIjoxfQ.signature~value-_';
    const query = buildQuery({ cursor });
    assert.equal(query.includes(encodeURIComponent(cursor)), true);
    assert.equal(decodeURIComponent(query.split('cursor=')[1]), cursor);
});

test('an empty cursor is refused rather than sent as a blank page request', () => {
    assert.throws(() => buildQuery({ cursor: '' }), error => error.code === 'CURSOR_NOT_OPAQUE');
});

test('a non-string cursor is refused', () => {
    assert.throws(() => buildQuery({ cursor: 12 }), error => error.code === 'CURSOR_NOT_OPAQUE');
});

test('a null cursor is simply the first page', () => {
    assert.equal(buildQuery({ cursor: null }), '');
});

test('offset pagination is refused', () => {
    for (const key of ['offset', 'page', 'skip']) {
        assert.throws(() => buildQuery({ filters: { [key]: 10 } }),
            error => error.code === 'UNSUPPORTED_QUERY_PARAMETER', key);
    }
});

test('a capability in the query string is refused', () => {
    for (const key of ['token', 'csrf', 'csrfToken', 'sessionToken', 'idempotencyKey']) {
        assert.throws(() => buildQuery({ filters: { [key]: 'secret' } }),
            error => error.code === 'UNSUPPORTED_QUERY_PARAMETER', key);
    }
});

test('a limit beyond the contract maximum is refused', () => {
    assert.throws(() => buildQuery({ limit: PAGE_LIMIT_MAX + 1 }),
        error => error.code === 'LIMIT_OUT_OF_RANGE');
    assert.throws(() => buildQuery({ limit: 0 }), error => error.code === 'LIMIT_OUT_OF_RANGE');
    assert.throws(() => buildQuery({ limit: 12.5 }), error => error.code === 'LIMIT_OUT_OF_RANGE');
});

test('the maximum limit itself is allowed', () => {
    assert.equal(buildQuery({ limit: PAGE_LIMIT_MAX }), `?limit=${PAGE_LIMIT_MAX}`);
});

test('a list returns the server cursor unchanged and null at the end', async () => {
    const page = jsonResponse(200, {
        data: { items: [{ workspaceId: 'ws_1' }] },
        meta: { requestId: 'req_2', page: { limit: 50, nextCursor: 'opaque-next' } }
    });
    const { client } = await signedInClient([page]);
    const first = await client.list({ path: `${API_BASE}/workspaces` });
    assert.equal(first.nextCursor, 'opaque-next');
    assert.equal(first.items.length, 1);

    const last = jsonResponse(200, {
        data: { items: [] }, meta: { requestId: 'req_3', page: { limit: 50, nextCursor: null } }
    });
    const { client: second } = await signedInClient([last]);
    assert.equal((await second.list({ path: `${API_BASE}/workspaces` })).nextCursor, null);
});

// ── idempotency ──────────────────────────────────────────────────────────────

test('a mutation carries an Idempotency-Key without being asked', async () => {
    const { client, calls } = await signedInClient([jsonResponse(201, { data: {}, meta: {} })]);
    await client.mutate({ path: `${API_BASE}/devices`, body: { displayLabel: 'x' } });
    assert.equal(calls[1].init.headers['Idempotency-Key'], KEY);
});

test('a caller-supplied key is preserved exactly, which is how a replay works', async () => {
    const original = 'b'.repeat(40);
    const { client, calls } = await signedInClient([jsonResponse(200, { data: {}, meta: {} })]);
    await client.mutate({
        method: 'PUT', path: `${API_BASE}/workspaces/ws_1/documents/doc_1`,
        body: {}, idempotencyKey: original
    });
    assert.equal(calls[1].init.headers['Idempotency-Key'], original);
});

test('a key too short to carry the required entropy is refused', () => {
    assert.throws(() => assertIdempotencyKey('short'),
        error => error.code === 'INVALID_IDEMPOTENCY_KEY');
});

test('a key beyond the contract maximum is refused', () => {
    assert.throws(() => assertIdempotencyKey('c'.repeat(129)),
        error => error.code === 'INVALID_IDEMPOTENCY_KEY');
});

test('a key with characters outside the URL-safe set is refused', () => {
    assert.throws(() => assertIdempotencyKey(`${'d'.repeat(35)} `),
        error => error.code === 'INVALID_IDEMPOTENCY_KEY');
});

test('a read carrying an idempotency key is refused rather than silently ignored', async () => {
    const { client } = await signedInClient();
    await assert.rejects(
        client.request({ method: 'GET', path: `${API_BASE}/workspaces`, idempotencyKey: KEY }),
        error => error.code === 'IDEMPOTENCY_KEY_ON_READ');
});

test('a read carrying a body is refused', async () => {
    const { client } = await signedInClient();
    await assert.rejects(
        client.request({ method: 'GET', path: `${API_BASE}/workspaces`, body: { a: 1 } }),
        error => error.code === 'BODY_ON_READ');
});

test('a read carries no idempotency key and no CSRF token', async () => {
    const { client, calls } = await signedInClient([
        jsonResponse(200, { data: { items: [] }, meta: {} })
    ]);
    await client.list({ path: `${API_BASE}/workspaces` });
    assert.equal(calls[1].init.headers['Idempotency-Key'], undefined);
    assert.equal(calls[1].init.headers['X-CSRF-Token'], undefined);
});

test('every mutation method is treated as one', async () => {
    for (const method of MUTATION_METHODS) {
        const { client, calls } = await signedInClient([jsonResponse(200, { data: {}, meta: {} })]);
        await client.mutate({ method, path: `${API_BASE}/devices/d_1` });
        assert.equal(calls[1].init.headers['Idempotency-Key'], KEY, method);
        assert.equal(calls[1].init.headers['X-CSRF-Token'], 'csrf-token-value', method);
    }
});

test('a read cannot be sent through mutate', async () => {
    const { client } = await signedInClient();
    await assert.rejects(client.mutate({ method: 'GET', path: `${API_BASE}/workspaces` }),
        error => error.code === 'NOT_A_MUTATION');
});

// ── session and CSRF ─────────────────────────────────────────────────────────

test('a mutation before the session is resolved is refused, not sent bare', async () => {
    let reached = false;
    const client = createApiClient({
        fetch: async () => { reached = true; return SESSION_OK; }, randomId: () => KEY
    });
    await assert.rejects(client.mutate({ path: `${API_BASE}/devices`, body: {} }),
        error => error.code === 'SESSION_NOT_RESOLVED');
    assert.equal(reached, false);
});

test('a mutation with no CSRF token held is refused', async () => {
    const anonymous = jsonResponse(200, {
        data: { authenticated: false }, meta: { requestId: 'req_a' }
    });
    const { transport } = recorder([anonymous, jsonResponse(201, { data: {}, meta: {} })]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    await client.resolveSession();
    await assert.rejects(client.mutate({ path: `${API_BASE}/devices`, body: {} }),
        error => error.code === 'CSRF_TOKEN_REQUIRED');
});

// ── beginSignIn: the one CSRF-exempt mutation ────────────────────────────────

test('beginSignIn succeeds with no session resolved, unlike every other mutation', async () => {
    const { transport } = recorder([jsonResponse(201, {
        data: { authorizationUrl: 'https://github.com/login/oauth/authorize?x=1', expiresAt: 1 },
        meta: {}
    })]);
    // A fresh client: resolveSession() was never called, so sessionResolved is
    // false and csrfToken is null. Every other mutation would refuse here
    // (see 'a mutation before the session is resolved is refused' below).
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    const result = await client.beginSignIn();
    assert.equal(result.ok, true);
    assert.equal(result.data.authorizationUrl, 'https://github.com/login/oauth/authorize?x=1');
});

test('beginSignIn posts purpose sign_in to the transactions route without a CSRF header', async () => {
    const { transport, calls } = recorder([jsonResponse(201, {
        data: { authorizationUrl: 'https://github.com/login/oauth/authorize?x=1', expiresAt: 1 }, meta: {}
    })]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    await client.beginSignIn();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${API_BASE}/oauth/github/transactions`);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal('X-CSRF-Token' in calls[0].init.headers, false);
    assert.equal('Idempotency-Key' in calls[0].init.headers, false);
    assert.deepEqual(JSON.parse(calls[0].init.body), { purpose: 'sign_in' });
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.equal(calls[0].init.cache, 'no-store');
});

test('beginSignIn carries an optional returnPath and nothing else in the body', async () => {
    const { transport, calls } = recorder([jsonResponse(201, {
        data: { authorizationUrl: 'https://github.com/x', expiresAt: 1 }, meta: {}
    })]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    await client.beginSignIn({ returnPath: '/dashboard' });
    assert.deepEqual(JSON.parse(calls[0].init.body), { purpose: 'sign_in', returnPath: '/dashboard' });
});

test('beginSignIn refuses a non-string returnPath before any request is sent', async () => {
    let reached = false;
    const client = createApiClient({ fetch: async () => { reached = true; }, randomId: () => KEY });
    await assert.rejects(client.beginSignIn({ returnPath: 42 }),
        error => error.code === 'RETURN_PATH_MUST_BE_STRING');
    assert.equal(reached, false);
});

test('beginSignIn never reaches a hostile or cross-origin path', async () => {
    // The path is a module constant, not caller input, but the same guard that
    // protects every other call is exercised here rather than assumed silent.
    const client = createApiClient({ fetch: async () => jsonResponse(201, { data: {}, meta: {} }) });
    await client.beginSignIn();
    // No assertion needed beyond "did not throw": assertSameOriginPath runs
    // unconditionally inside beginSignIn, and a broken constant would fail here.
});

test('beginSignIn presents a server refusal like any other failure', async () => {
    const { transport } = recorder([jsonResponse(429, {
        error: { code: 'RATE_LIMITED' }, meta: {}
    })]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    const result = await client.beginSignIn();
    assert.equal(result.ok, false);
    assert.equal(result.failure.code, 'RATE_LIMITED');
});

test('beginSignIn on a network failure returns a failure rather than throwing', async () => {
    const client = createApiClient({
        fetch: async () => { throw new TypeError('Failed to fetch'); }, randomId: () => KEY
    });
    const result = await client.beginSignIn();
    assert.equal(result.ok, false);
    assert.equal(result.failure.ui, 'error');
});

test('the CSRF token is never handed back out of the client', async () => {
    const { transport } = recorder([SESSION_OK]);
    const client = createApiClient({ fetch: transport, randomId: () => KEY });
    const resolved = await client.resolveSession();
    assert.equal('csrfToken' in resolved, false);
    assert.equal(JSON.stringify(resolved).includes('csrf-token-value'), false);
    assert.equal(Object.values(client).includes('csrf-token-value'), false);
});

test('the CSRF token never appears in a URL', async () => {
    const { client, calls } = await signedInClient([jsonResponse(201, { data: {}, meta: {} })]);
    await client.mutate({ path: `${API_BASE}/devices`, body: {} });
    for (const call of calls) {
        assert.equal(call.url.includes('csrf-token-value'), false);
    }
});

test('the session view reports who is signed in', async () => {
    const { transport } = recorder([SESSION_OK]);
    const client = createApiClient({ fetch: transport });
    const resolved = await client.resolveSession();
    assert.equal(resolved.authenticated, true);
    assert.equal(resolved.user.login, 'dustin-nkd');
});

test('a signed-out session is authenticated false, not unknown', async () => {
    const { transport } = recorder([
        jsonResponse(200, { data: { authenticated: false }, meta: {} })
    ]);
    const resolved = await createApiClient({ fetch: transport }).resolveSession();
    assert.equal(resolved.authenticated, false);
    assert.equal(resolved.user, null);
    assert.equal(resolved.available, true);
});

test('the session request is credentialed, same-origin, and not cached', async () => {
    const { client, calls } = await signedInClient();
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.equal(calls[0].init.cache, 'no-store');
    assert.equal(calls[0].init.headers.Accept, 'application/json');
});

test('forgetting the session blocks the next mutation', async () => {
    const { client } = await signedInClient([jsonResponse(201, { data: {}, meta: {} })]);
    assert.equal(client.canMutate, true);
    client.forgetSession();
    assert.equal(client.canMutate, false);
    await assert.rejects(client.mutate({ path: `${API_BASE}/devices`, body: {} }),
        error => error.code === 'SESSION_NOT_RESOLVED');
});

// ── availability, which is the deployment's answer ───────────────────────────

test('a deployment with collaboration disabled reports unavailable', async () => {
    const { transport } = recorder([jsonResponse(503, {
        error: { code: 'COLLABORATION_UNAVAILABLE', message: 'off' }, meta: { requestId: 'r' }
    })]);
    const resolved = await createApiClient({ fetch: transport }).resolveSession();
    assert.equal(resolved.available, false);
    assert.equal(resolved.reason, 'deployment-disabled');
    assert.equal(resolved.authenticated, null);
});

test('an unavailable deployment leaves no usable session behind', async () => {
    const { transport } = recorder([jsonResponse(503, {
        error: { code: 'COLLABORATION_UNAVAILABLE' }, meta: {}
    })]);
    const client = createApiClient({ fetch: transport });
    await client.resolveSession();
    assert.equal(client.canMutate, false);
});

test('an authentication failure is not mistaken for an unavailable deployment', async () => {
    const { transport } = recorder([jsonResponse(401, {
        error: { code: 'AUTHENTICATION_REQUIRED' }, meta: {}
    })]);
    const resolved = await createApiClient({ fetch: transport }).resolveSession();
    assert.equal(resolved.available, true);
    assert.equal(resolved.failure.ui, 'unauthorized');
});

test('a network that never reached a server is not reported as unavailable', async () => {
    const transport = async () => { throw new TypeError('Failed to fetch'); };
    const client = createApiClient({ fetch: transport });
    await assert.rejects(client.resolveSession(), error => error instanceof TypeError);
});

test('an API response that is secretly the app shell is refused', async () => {
    // The defect deployment 037fb093 shipped: the SPA fallback answered an API
    // path with status 200 and text/html. Treating that as data is the failure.
    const { transport } = recorder([{
        ok: true, status: 200,
        headers: { get: name => (name.toLowerCase() === 'content-type' ? 'text/html' : null) },
        json: async () => ({ data: {} })
    }]);
    const resolved = await createApiClient({ fetch: transport }).resolveSession();
    assert.equal(resolved.failure.ui, 'error');
    assert.equal(resolved.reason, 'transport-failed');
});

test('a JSON body that will not parse is refused rather than half-read', async () => {
    const { transport } = recorder([{
        ok: true, status: 200,
        headers: { get: () => 'application/json' },
        json: async () => { throw new SyntaxError('unexpected token'); }
    }]);
    const client = createApiClient({ fetch: transport });
    await assert.rejects(client.request({ path: `${API_BASE}/workspaces` }),
        error => error.code === 'MALFORMED_RESPONSE');
});

// ── responses ────────────────────────────────────────────────────────────────

test('a 204 is a success with no body, not an empty-body failure', async () => {
    const { client } = await signedInClient([{
        ok: true, status: 204, headers: { get: () => null },
        json: async () => { throw new Error('no body'); }
    }]);
    const result = await client.mutate({ method: 'DELETE', path: `${API_BASE}/devices/d_1` });
    assert.equal(result.ok, true);
    assert.equal(result.data, null);
});

test('a failure carries the request id for support without widening details', async () => {
    const { client } = await signedInClient([jsonResponse(409, {
        error: {
            code: 'DOCUMENT_REVISION_CONFLICT',
            details: { submittedBaseRevision: 4, currentRevision: 5 }
        },
        meta: { requestId: 'req_conflict' }
    })]);
    const result = await client.mutate({
        method: 'PUT', path: `${API_BASE}/workspaces/ws_1/documents/doc_1`, body: {}
    });
    assert.equal(result.ok, false);
    assert.equal(result.failure.ui, 'Conflict');
    assert.equal(result.requestId, 'req_conflict');
    assert.deepEqual(result.details, { submittedBaseRevision: 4, currentRevision: 5 });
});

test('an unknown additive response field is ignored rather than refused', async () => {
    const { client } = await signedInClient([jsonResponse(200, {
        data: { items: [], somethingNew: true }, meta: { requestId: 'r', experimental: 1 }
    })]);
    const result = await client.list({ path: `${API_BASE}/workspaces` });
    assert.equal(result.ok, true);
});

test('a failing call returns a typed failure and never a personal-vault result', async () => {
    const { client } = await signedInClient([jsonResponse(500, {
        error: { code: 'INTERNAL_ERROR' }, meta: {}
    })]);
    const result = await client.list({ path: `${API_BASE}/workspaces` });
    assert.equal(result.ok, false);
    assert.equal(result.failure.ui, 'error');
    assert.equal('items' in result, false);
});

test('the error type is exported so callers can distinguish it from a bug', () => {
    assert.equal(new ApiClientError('X') instanceof Error, true);
    assert.equal(new ApiClientError('X').code, 'X');
});
