const assert = (condition, message) => { if (!condition) throw new Error(message); };
const sorted = values => [...values].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

/** Personal Vault storage. A collaboration path that touches these breaks U1. */
export const PERSONAL_KEYS = Object.freeze(['docvault_docs', 'docvault_deleted_ids',
    'docvault_sync_pending', 'DocStorage']);

/** Query parameters that would mean the client had invented its own paging. */
export const PROHIBITED_QUERY_KEYS = Object.freeze(['offset', 'page', 'skip']);

/** Capabilities that must never reach a URL. */
export const CAPABILITY_QUERY_KEYS = Object.freeze(['token', 'csrf', 'csrfToken', 'sessionToken']);

/**
 * Anything that would make a module a transport.
 *
 * Both halves matter. A bare `fetch(` is the call the eleven surface gates
 * already refuse; `globalThis.fetch` is the reach for the ambient global, which
 * is how a second door would actually get opened — a module that resolves it
 * and hands it to something else has performed transport without ever calling
 * it under that name.
 */
export const TRANSPORT_PATTERN =
    /(^|[^\w.])fetch\s*\(|\bglobalThis\.fetch\b|\bwindow\.fetch\b|\bself\.fetch\b/;

/**
 * Every module reachable from one entry by following static imports.
 *
 * Added by CF-P7-013, so "reachable from the entry" stops being something a
 * manifest asserts and becomes something the graph shows. A surface can be
 * claimed reachable only if a module in this closure renders it, and claimed
 * pending only if none does — which means the claim cannot survive being wrong
 * in either direction.
 *
 * Static imports are the whole graph here on purpose: the one dynamic import in
 * the app is the app's own `import('./collaboration/entry.js')`, which is where
 * this walk starts.
 */
export function importClosure(sources, start) {
    const seen = new Set();
    const queue = [start];
    while (queue.length > 0) {
        const current = queue.shift();
        if (seen.has(current) || sources[current] === undefined) continue;
        seen.add(current);
        const body = code(sources[current]);
        for (const match of body.matchAll(/from\s*'\.\/([A-Za-z0-9._-]+\.js)'/g)) {
            queue.push(`js/collaboration/${match[1]}`);
        }
    }
    return seen;
}

/** Strip comments before asserting a construct is absent. */
export function code(source) {
    return String(source)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** A response the fake transport can return without a network. */
function respond(status, body, contentType = 'application/json; charset=utf-8') {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: name => (name.toLowerCase() === 'content-type' ? contentType : null) },
        json: async () => body
    };
}

// /api/v1/session answers with its fields directly at the top level, not the
// {data, meta} envelope every other route this gate exercises uses --
// js/collaboration/api-client.js's resolveSession() reads this shape raw.
const SESSION_BODY = {
    authenticated: true,
    user: { userId: 'u_1', login: 'octocat' },
    session: { authenticatedAt: '2026-07-26T00:00:00.000Z' },
    csrfToken: 'csrf-token-value'
};

/** Record every call instead of making one. */
function transportRecorder(responses) {
    const calls = [];
    const queue = [...responses];
    return {
        calls,
        fetch: async (url, init) => {
            calls.push({ url, init });
            return queue.length > 1 ? queue.shift() : queue[0];
        }
    };
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

export async function validatePhase7ApiClient({ manifest, contract, clientSource, entrySource,
    deploymentSource, indexHtml, serviceWorker, collaborationSources, unitTestSource,
    clientExports }) {
    const clientCode = code(clientSource);
    const api = clientExports || {};

    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P7'
        && manifest.story === 'CF-P7-015' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P7-G3E' && manifest.next_gate === 'P7-G3F'
        && manifest.authorizes_on_approval === 'CF-P7-013',
    'Unsupported Phase 7 API client manifest');

    // This story adds no surface. Phase 7's inventory is frozen at twelve, and a
    // layer that quietly became a thirteenth would be a scope change.
    assert(same(manifest.surfaces || [], []), 'The API client claims a surface of its own');
    assert(manifest.adds_primitive === false && manifest.reimplements_service === false,
        'The client claims to add a primitive or reimplement a service');

    // ── the frozen error taxonomy ────────────────────────────────────────────
    //
    // Compared against the contract's own list rather than a copy of it, in both
    // directions: a code added here without being frozen, or frozen and not
    // handled here, are both drift.
    const frozen = (contract.error_mapping || []).map(entry => entry.code);
    assert(frozen.length === (manifest.taxonomy?.frozen_code_count ?? 0),
        `The frozen error taxonomy is ${frozen.length} codes, `
        + `the manifest declares ${manifest.taxonomy?.frozen_code_count}`);
    assert(same(api.TAXONOMY_CODES || [], frozen),
        'The handled error codes drifted from the frozen taxonomy');

    const present = api.presentErrorCode;
    assert(typeof present === 'function', 'The error presentation was not provided');
    for (const entry of contract.error_mapping || []) {
        const presented = present(entry.code);
        assert(presented.recognised === true, `${entry.code} is no longer recognised`);
        assert(presented.ui === entry.ui,
            `${entry.code} presents as ${presented.ui}, the contract froze ${entry.ui}`);
        assert(typeof presented.reason === 'string' && presented.reason.length > 20,
            `${entry.code} presents without explaining itself, which the contract requires`);
    }

    // An unrecognised code must fail closed. Presenting a code nobody decided a
    // presentation for would show a user a guess as though it were a fact.
    const unknown = present('SOME_CODE_THIS_BUILD_HAS_NEVER_SEEN');
    assert(unknown.recognised === false && unknown.ui === 'error',
        'An unknown error code no longer fails closed');
    assert(!unknown.reason.includes('SOME_CODE_THIS_BUILD_HAS_NEVER_SEEN'),
        'An unknown code is echoed back into the interface');

    // The implemented Workers handlers still put two pre-CF-P7-016 spellings on
    // the wire. The join is declared, not guessed, and every alias must land
    // inside the frozen set — an alias onto a code nobody froze is how the
    // defect CF-P7-016 corrected got in.
    const aliases = api.SERVER_CODE_ALIASES || {};
    assert(same(Object.keys(aliases), manifest.taxonomy?.server_aliases || []),
        'The declared server alias set drifted from the client');
    for (const [server, target] of Object.entries(aliases)) {
        assert(frozen.includes(target), `Alias ${server} resolves outside the frozen taxonomy`);
        assert(present(server).code === target, `Alias ${server} no longer resolves to ${target}`);
    }

    // ── the client refuses what the contract forbids ─────────────────────────
    const create = api.createApiClient;
    assert(typeof create === 'function', 'The client factory was not provided');
    const base = api.API_BASE;
    assert(base === '/api/v1', 'The versioned prefix drifted');
    const KEY = 'a'.repeat(36);

    const signedIn = async (extra = []) => {
        const recorder = transportRecorder([respond(200, SESSION_BODY), ...extra]);
        const client = create({ fetch: recorder.fetch, randomId: () => KEY });
        await client.resolveSession();
        return { client, recorder };
    };

    // Transport is required. A client with nowhere to send is a bug to surface,
    // not a no-op to tolerate.
    assert(await refusal(() => create({ fetch: null })) === 'TRANSPORT_REQUIRED',
        'A client with no usable transport is no longer refused');

    // Same-origin. The session cookie and the CSRF token bound to it must never
    // leave for another host, so the refusal happens before the send.
    {
        const recorder = transportRecorder([respond(200, SESSION_BODY)]);
        const client = create({ fetch: recorder.fetch, randomId: () => KEY });
        for (const path of ['https://evil.test/api/v1/session', '//evil.test/api/v1/session']) {
            assert(await refusal(() => client.request({ path })) === 'PATH_NOT_SAME_ORIGIN',
                `A cross-origin path is no longer refused: ${path}`);
        }
        assert(await refusal(() => client.request({ path: '/admin' })) === 'PATH_OUTSIDE_API',
            'A path outside the versioned API is no longer refused');
        assert(recorder.calls.length === 0,
            'A refused path still reached the transport, so credentials could leave');
    }

    // CSRF: held in memory, required on every mutation, never in a URL, and
    // never handed back out of the client.
    {
        const recorder = transportRecorder([respond(200, SESSION_BODY)]);
        const client = create({ fetch: recorder.fetch, randomId: () => KEY });
        assert(await refusal(() => client.mutate({ path: `${base}/devices`, body: {} }))
            === 'SESSION_NOT_RESOLVED',
        'A mutation before the session is resolved is no longer refused');
        assert(recorder.calls.length === 0, 'An unresolved mutation still reached the transport');

        const resolved = await client.resolveSession();
        assert(!('csrfToken' in resolved), 'The CSRF token is handed back out of the client');
        assert(!JSON.stringify(resolved).includes('csrf-token-value'),
            'The CSRF token appears in the session view');
        assert(!Object.values(client).includes('csrf-token-value'),
            'The CSRF token is readable from the client surface');
    }
    {
        const recorder = transportRecorder([respond(200, { authenticated: false })]);
        const client = create({ fetch: recorder.fetch, randomId: () => KEY });
        await client.resolveSession();
        assert(await refusal(() => client.mutate({ path: `${base}/devices`, body: {} }))
            === 'CSRF_TOKEN_REQUIRED',
        'A mutation with no CSRF token held is no longer refused');
    }

    // Idempotency: present on every mutation, absent from every read, and a
    // caller's own key preserved exactly, because that is how a replay works.
    for (const method of api.MUTATION_METHODS || []) {
        const { client, recorder } = await signedIn([respond(200, { data: {}, meta: {} })]);
        await client.mutate({ method, path: `${base}/devices/d_1`, body: {} });
        const headers = recorder.calls[1].init.headers;
        assert(headers['Idempotency-Key'] === KEY, `${method} carries no Idempotency-Key`);
        assert(headers['X-CSRF-Token'] === 'csrf-token-value', `${method} carries no CSRF token`);
        assert(!recorder.calls[1].url.includes('csrf-token-value'),
            `${method} put the CSRF token in the URL`);
    }
    {
        const replayKey = 'b'.repeat(40);
        const { client, recorder } = await signedIn([respond(200, { data: {}, meta: {} })]);
        await client.mutate({ path: `${base}/devices`, body: {}, idempotencyKey: replayKey });
        assert(recorder.calls[1].init.headers['Idempotency-Key'] === replayKey,
            'A replayed mutation no longer reuses its original key');
    }
    {
        const { client } = await signedIn();
        assert(await refusal(() => client.request({
            path: `${base}/workspaces`, idempotencyKey: KEY
        })) === 'IDEMPOTENCY_KEY_ON_READ',
        'A read carrying an idempotency key is no longer refused');
    }
    {
        const check = api.assertIdempotencyKey;
        assert(typeof check === 'function', 'The idempotency key rule was not provided');
        for (const weak of ['short', '', 'c'.repeat(129)]) {
            assert(await refusal(() => check(weak)) === 'INVALID_IDEMPOTENCY_KEY',
                `A key that cannot carry the required entropy is accepted: ${weak.length} chars`);
        }
    }

    // Cursors: passed back exactly as received, never constructed, and offset
    // pagination refused outright.
    {
        const build = api.buildQuery;
        assert(typeof build === 'function', 'The query builder was not provided');
        const opaque = 'eyJvIjoxfQ.signature~value-_';
        assert(decodeURIComponent(build({ cursor: opaque }).split('cursor=')[1]) === opaque,
            'A cursor is no longer passed through unchanged');
        for (const key of PROHIBITED_QUERY_KEYS) {
            assert(await refusal(() => build({ filters: { [key]: 1 } }))
                === 'UNSUPPORTED_QUERY_PARAMETER',
            `Offset pagination via ${key} is no longer refused`);
        }
        for (const key of CAPABILITY_QUERY_KEYS) {
            assert(await refusal(() => build({ filters: { [key]: 'secret' } }))
                === 'UNSUPPORTED_QUERY_PARAMETER',
            `A capability may now be put in the query string: ${key}`);
        }
        assert(await refusal(() => build({ limit: (api.PAGE_LIMIT_MAX || 100) + 1 }))
            === 'LIMIT_OUT_OF_RANGE', 'A page beyond the contract maximum is no longer refused');
        assert(await refusal(() => build({ cursor: '' })) === 'CURSOR_NOT_OPAQUE',
            'An empty cursor is no longer refused');
    }
    {
        const { client } = await signedIn([respond(200, {
            data: { items: [{ workspaceId: 'ws_1' }] },
            meta: { page: { limit: 50, nextCursor: 'opaque-next' } }
        })]);
        const page = await client.list({ path: `${base}/workspaces` });
        assert(page.nextCursor === 'opaque-next',
            'The server cursor is no longer returned to the caller unchanged');
    }

    // ── availability is the deployment's answer, not the hostname's ──────────
    const availability = manifest.availability || {};
    assert(availability.decided_by === 'deployment-probe'
        && availability.hostname_is_prefilter_only === true,
    'The availability decision drifted from the owner authorization');
    assert(availability.authorized_by === 'owner'
        && typeof availability.authorized_on === 'string',
    'The availability boundary decision records no owner authorization');
    assert(typeof availability.rationale === 'string' && availability.rationale.length > 200,
        'The reason the hostname alone is insufficient was dropped');
    assert(availability.probe_on_personal_startup === false,
        'The availability probe may now run on Personal startup');
    {
        const recorder = transportRecorder([respond(503, {
            error: { code: 'COLLABORATION_UNAVAILABLE' }, meta: {}
        })]);
        const client = create({ fetch: recorder.fetch });
        const resolved = await client.resolveSession();
        assert(resolved.available === false,
            'A deployment that says collaboration is disabled is no longer believed');
        assert(client.canMutate === false, 'An unavailable deployment left a usable session');
    }
    {
        // A denial is not a disabled deployment. Conflating them would tell a
        // signed-out user the feature does not exist here.
        const recorder = transportRecorder([respond(401, {
            error: { code: 'AUTHENTICATION_REQUIRED' }, meta: {}
        })]);
        const resolved = await create({ fetch: recorder.fetch }).resolveSession();
        assert(resolved.available === true && resolved.failure.ui === 'unauthorized',
            'An authentication failure is now reported as an unavailable deployment');
    }
    {
        // The defect deployment 037fb093 shipped: the SPA fallback answered an
        // API path with status 200 and text/html. Reading that as data is how a
        // missing route becomes silence instead of an error.
        const recorder = transportRecorder([respond(200, { data: {} }, 'text/html')]);
        const resolved = await create({ fetch: recorder.fetch }).resolveSession();
        assert(resolved.failure !== null && resolved.failure.ui === 'error',
            'An API response that is secretly the app shell is no longer refused');
    }
    // The eager module must keep the hostname pre-filter and must not probe:
    // it ships to every visitor, and the budget is zero collaboration work for
    // a user who never opens collaboration.
    assert(!TRANSPORT_PATTERN.test(code(deploymentSource)),
        'The eager deployment module now performs a probe on Personal startup');
    assert(/startCollaboration\(/.test(deploymentSource),
        'The opener no longer reaches the entry that asks the deployment');

    // ── one transport seam ───────────────────────────────────────────────────
    //
    // Eleven surface gates each assert that their own module performs no
    // transport. That is only an architecture if there is exactly one module
    // that does, and this is the check that makes it one.
    const clientPath = manifest.modules?.client;
    assert(clientPath === 'js/collaboration/api-client.js', 'The client module path drifted');
    const withTransport = Object.entries(collaborationSources || {})
        .filter(([, source]) => TRANSPORT_PATTERN.test(code(source)))
        .map(([file]) => file);
    assert(same(withTransport, [clientPath]),
        `Transport must live in exactly one module; found it in: ${withTransport.join(', ')}`);
    assert(manifest.isolation?.single_transport_seam === true,
        'The single-transport-seam claim was dropped');

    // ── isolation ────────────────────────────────────────────────────────────
    const isolation = manifest.isolation || {};
    for (const key of ['inner_html_used', 'eager_script_tag', 'service_worker_precached',
        'csrf_token_exposed', 'cursor_constructed_client_side', 'personal_provider_fallback']) {
        assert(isolation[key] === false, `The isolation claim drifted: ${key}`);
    }
    assert(isolation.personal_storage_keys_referenced === 0, 'The isolation claim drifted');
    for (const key of PERSONAL_KEYS) {
        assert(!clientCode.includes(key), `The API client reached for ${key}`);
        assert(!code(entrySource).includes(key), `The entry reached for ${key}`);
    }
    assert(!/\.innerHTML/.test(clientCode), 'The API client renders through innerHTML');
    assert(!/<script[^>]+collaboration\//.test(indexHtml),
        'A collaboration module became an eager script tag');
    assert(!/collaboration/.test(serviceWorker),
        'A collaboration module entered the service worker precache');
    assert(!TRANSPORT_PATTERN.test(code(entrySource)),
        'The entry performs its own transport instead of using the client');

    // ── no silent caps ───────────────────────────────────────────────────────
    //
    // This story reaches two of the twelve surfaces. Narrowed coverage is only
    // acceptable when it is declared with a reason, so the split is checked
    // against the frozen inventory: every surface must appear in exactly one
    // list. A surface quietly missing from both would be coverage claimed and
    // not delivered, which is the failure the CF-P7-012 rule exists to stop.
    const limits = manifest.declared_limits || {};
    const reached = limits.surfaces_reachable_from_entry || [];
    const pending = limits.surfaces_not_yet_composed || [];
    // A limit may be empty only once something has closed it, and the thing that
    // closed it has to be named. Left unguarded, an empty list is
    // indistinguishable from a limit somebody quietly deleted.
    assert(pending.length > 0 || typeof limits.closed_by === 'string',
        'A limit is declared with nothing in it and nothing recorded as closing it');
    assert(typeof limits.reason === 'string' && limits.reason.length > 80,
        'The narrowed coverage carries no reason');
    const frozenSurfaces = (contract.surfaces || [])
        .map(surface => surface.id)
        // The shared states and the deployment banner are not journeys a client
        // reaches; they are rendered by whatever surface is showing.
        .filter(id => id !== 'base-states' && id !== 'github-pages-banner');
    assert(same([...reached, ...pending], frozenSurfaces),
        'The declared coverage split does not account for every frozen surface');
    for (const surface of reached) {
        assert(!pending.includes(surface), `${surface} is declared both reached and pending`);
    }

    // The split is checked against the module graph, not taken on trust. A
    // surface is reachable when something the entry imports renders it, and the
    // renderer is the one place its id appears as the surface marker — so this
    // asks the code the same question the manifest answers, and refuses a
    // disagreement in either direction.
    const closure = importClosure(collaborationSources || {}, manifest.modules?.entry);
    assert(closure.size > 1, 'The entry module graph could not be walked');
    const renders = surface => [...closure].some(file =>
        code((collaborationSources || {})[file] ?? '')
            .includes(`'data-collab-surface', '${surface}'`));
    for (const surface of reached) {
        assert(renders(surface),
            `${surface} is declared reachable from the entry but nothing it imports renders it`);
    }
    for (const surface of pending) {
        assert(!renders(surface),
            `${surface} is declared not yet composed, but the entry already reaches it`);
    }

    const tests = manifest.tests || {};
    const actual = (unitTestSource.match(/^test\(/gm) || []).length;
    assert(tests.unit_count === actual,
        `Unit test inventory drifted: manifest says ${tests.unit_count}, suite has ${actual}`);
    assert(typeof tests.policy === 'string', 'The story ships without a policy suite');
    return true;
}
