// The collaboration API client (CF-P7-015).
//
// Phase 7 was planned as "the interface over the Phase 3 to Phase 6 services",
// and eleven stories built surfaces on that premise — each one gated on the
// assertion that it performs no transport of its own. That assertion held, and
// nothing was ever built on the other side of it. The surfaces are pure, and
// they were pure with nothing to talk to.
//
// This module is that other side, and it is the only file under
// js/collaboration/ permitted to call fetch. Keeping transport in exactly one
// place is what lets every surface gate say "this module performs no network
// call" and mean it.
//
// It adds no primitive. Identity, envelopes, revisions, idempotency binding,
// cursors, membership, and the outbox all live in services that already exist
// and are already proven; what happens here is limited to speaking the frozen
// wire contract correctly and refusing to speak it incorrectly:
//
//   - the session, and the CSRF token that only ever lives in memory;
//   - an Idempotency-Key on every mutation, never on a read;
//   - cursors passed back exactly as received, never built and never read;
//   - the frozen error taxonomy mapped to one presentation per code;
//   - and the deployment's own answer to whether collaboration runs here.
//
// That last one is a boundary decision, not an implementation detail, and it
// was taken by the owner on 2026-07-26. js/deployment.js answers "could this
// origin possibly host collaboration" from the hostname, which is cheap, runs
// eagerly, and is right about GitHub Pages. It is not right about a Cloudflare
// deployment with COLLABORATION_ENABLED false — every *.pages.dev host looks
// identical from the outside. So the hostname stays a pre-filter and the
// deployment is asked directly: a 503 COLLABORATION_UNAVAILABLE is the
// deployment saying no, and it is believed over the hostname.

/** Every route lives under the versioned prefix. There is no other base. */
export const API_BASE = '/api/v1';

/** Methods that change state, and therefore require CSRF and idempotency. */
export const MUTATION_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Pagination bounds from the frozen contract §5. Offset pagination does not exist. */
export const PAGE_LIMIT_DEFAULT = 50;
export const PAGE_LIMIT_MAX = 100;

/** Query parameters that would mean the client had invented its own paging. */
export const PROHIBITED_QUERY_KEYS = Object.freeze([
    'offset', 'page', 'skip', 'token', 'csrf', 'csrfToken', 'idempotencyKey', 'sessionToken'
]);

export class ApiClientError extends Error {
    /**
     * @param {string} code
     * @param {{status?: number|null, requestId?: string|null, details?: object|null}} [context]
     */
    constructor(code, context = {}) {
        super(code);
        this.name = 'ApiClientError';
        this.code = code;
        this.status = context.status ?? null;
        this.requestId = context.requestId ?? null;
        // `details` is whatever the server was allowed to disclose. It is never
        // widened here: the contract already bounds what may appear in it.
        this.details = context.details ?? null;
    }
}

const fail = (code, context) => { throw new ApiClientError(code, context); };

// ── the frozen error taxonomy ────────────────────────────────────────────────
//
// CF-P7-001 §4 freezes a presentation for every code in the server catalog, and
// CF-P7-016 made that sentence true: the map covered twelve of the catalog's
// twenty-nine, and two of the twelve were spellings the catalog does not
// contain. The names here are now the catalog's own, so this table and
// `api-contract.md` §8 can be compared code for code.
//
// One alias table survives, and it points the other way than it used to. The
// implemented Workers runtime still puts `UNAUTHENTICATED` and
// `RECENT_AUTHENTICATION_REQUIRED` on the wire; the catalog those handlers were
// written against calls the same failures `AUTHENTICATION_REQUIRED` and
// `REAUTHENTICATION_REQUIRED`. Until the server is reconciled under its own
// review — nothing in Phase 7 may change a Workers handler — a real 401 or 403
// arrives under the wire spelling, and without this join it would fall through
// to the unrecognised bucket and quietly lose its `unauthorized` presentation.
//
// `SESSION_EXPIRED` needed no alias once it earned a mapping of its own.

/** Wire spelling → the catalog code that presents it. */
export const SERVER_CODE_ALIASES = Object.freeze({
    UNAUTHENTICATED: 'AUTHENTICATION_REQUIRED',
    RECENT_AUTHENTICATION_REQUIRED: 'REAUTHENTICATION_REQUIRED'
});

/** The catalog, exactly as CF-P7-001 §4 maps it after CF-P7-016. */
export const ERROR_PRESENTATION = Object.freeze({
    INVALID_JSON: Object.freeze({
        ui: 'error',
        reason: 'That request could not be read. Reload the page and try again.'
    }),
    VALIDATION_FAILED: Object.freeze({
        ui: 'error',
        reason: 'That request was not valid. Check the highlighted fields and try again.'
    }),
    INVALID_CURSOR: Object.freeze({
        ui: 'error',
        reason: 'This list could not be continued from where it left off. Load it again.'
    }),
    INVALID_PRECONDITION: Object.freeze({
        ui: 'error',
        reason: 'This change was sent without the version it applies to. Nothing was changed.'
    }),
    AUTHENTICATION_REQUIRED: Object.freeze({
        ui: 'unauthorized',
        reason: 'Your session has ended. Sign in with GitHub to continue.'
    }),
    SESSION_EXPIRED: Object.freeze({
        ui: 'unauthorized',
        reason: 'Your session expired. Sign in with GitHub again to continue.'
    }),
    REAUTHENTICATION_REQUIRED: Object.freeze({
        ui: 'unauthorized',
        reason: 'This action needs a recent sign-in. Confirm it is you, then try again.'
    }),
    CSRF_REJECTED: Object.freeze({
        ui: 'error',
        reason: 'That request could not be verified. Reload the page and try again.'
    }),
    DEVICE_NOT_AUTHORIZED: Object.freeze({
        ui: 'error',
        reason: 'This device is no longer trusted for this account. Set it up again to continue.'
    }),
    KEY_PROVISIONING_REQUIRED: Object.freeze({
        ui: 'error',
        reason: 'This device is still waiting for its workspace key. Finish setting it up first.'
    }),
    OPERATION_NOT_PERMITTED: Object.freeze({
        ui: 'role-disabled-explanation',
        reason: 'Your role in this workspace does not allow this action.'
    }),
    RESOURCE_NOT_FOUND: Object.freeze({
        ui: 'empty-or-access-removed',
        reason: 'Nothing here is available to you.'
    }),
    METHOD_NOT_ALLOWED: Object.freeze({
        ui: 'error',
        reason: 'That action is not available on this item. Nothing was changed.'
    }),
    NOT_ACCEPTABLE: Object.freeze({
        ui: 'error',
        reason: 'This browser and the server could not agree on a format. Reload the page.'
    }),
    DOCUMENT_REVISION_CONFLICT: Object.freeze({
        ui: 'Conflict',
        reason: 'Someone else changed this document. Nothing is merged automatically and '
            + 'your draft is kept.'
    }),
    IDEMPOTENCY_KEY_REUSED: Object.freeze({
        ui: 'error',
        reason: 'This request was already sent with different contents. Nothing was changed.'
    }),
    IDEMPOTENCY_WINDOW_EXPIRED: Object.freeze({
        ui: 'error',
        reason: 'This change is too old to reconcile. Review the latest version before retrying.'
    }),
    STATE_TRANSITION_INVALID: Object.freeze({
        ui: 'error',
        reason: 'This item has already moved on from that state. Reload it to see where it is.'
    }),
    KEY_VERSION_MISMATCH: Object.freeze({
        ui: 'error',
        reason: 'This workspace key changed. Reload the workspace before saving again.'
    }),
    FINGERPRINT_CHANGED: Object.freeze({
        ui: 'error',
        reason: 'That device key changed while this was in progress. Load it again before '
            + 'continuing.'
    }),
    INVITATION_UNAVAILABLE: Object.freeze({
        ui: 'error',
        reason: 'This invitation cannot be used. Ask a workspace owner or admin for a new one.'
    }),
    LAST_OWNER_REQUIRED: Object.freeze({
        ui: 'role-disabled-explanation',
        reason: 'A workspace must keep at least one Owner, so this one cannot be removed or '
            + 'demoted.'
    }),
    LIFECYCLE_POLICY_UNAVAILABLE: Object.freeze({
        ui: 'error',
        reason: 'Export and deletion are not available on this deployment yet.'
    }),
    PAYLOAD_TOO_LARGE: Object.freeze({
        ui: 'error',
        reason: 'That is larger than this workspace accepts. Nothing was saved.'
    }),
    UNSUPPORTED_MEDIA_TYPE: Object.freeze({
        ui: 'error',
        reason: 'That request was sent in a format the server does not accept.'
    }),
    UNSUPPORTED_ENVELOPE: Object.freeze({
        ui: 'error',
        reason: 'This key envelope is a version this workspace cannot use. Nothing was changed.'
    }),
    RATE_LIMITED: Object.freeze({
        ui: 'error',
        reason: 'Too many requests. Wait a moment and try again.'
    }),
    INTERNAL_ERROR: Object.freeze({
        ui: 'error',
        reason: 'Something went wrong on the server. Nothing was changed; try again shortly.'
    }),
    COLLABORATION_UNAVAILABLE: Object.freeze({
        ui: 'error',
        reason: 'Team collaboration is not enabled on this deployment.'
    })
});

/** The frozen codes, in contract order. */
export const TAXONOMY_CODES = Object.freeze(Object.keys(ERROR_PRESENTATION));

/**
 * Present one failure.
 *
 * An unrecognised code presents as `error` rather than being passed through.
 * Failing closed matters more here than anywhere else in the client: a code
 * this build has never heard of is, by definition, one whose safe presentation
 * nobody decided — rendering it as though it were understood would be a guess
 * shown to a user as a fact.
 *
 * @param {string} code
 * @returns {{code: string, ui: string, reason: string, recognised: boolean}}
 */
export function presentErrorCode(code) {
    const raw = typeof code === 'string' ? code : '';
    const resolved = SERVER_CODE_ALIASES[raw] ?? raw;
    const presentation = ERROR_PRESENTATION[resolved];
    if (presentation === undefined) {
        return Object.freeze({
            code: 'UNRECOGNISED',
            ui: 'error',
            reason: 'Something went wrong. Nothing was changed.',
            recognised: false
        });
    }
    return Object.freeze({
        code: resolved, ui: presentation.ui, reason: presentation.reason, recognised: true
    });
}

// ── request shaping, decided without a network ───────────────────────────────

const isMutation = method => MUTATION_METHODS.includes(method);

/**
 * Validate a path before anything is sent.
 *
 * Same-origin is not a preference. The session cookie is `SameSite=Lax` and
 * host-only, the CSRF token is bound to it, and the contract allows no
 * credentialed cross-origin request at all — so a path that could resolve
 * anywhere but this origin is refused here rather than discovered by a server
 * that would (correctly) reject it after the credentials had already left.
 *
 * @param {string} path
 */
export function assertSameOriginPath(path) {
    if (typeof path !== 'string' || path.length === 0) fail('PATH_REQUIRED');
    // `//host` is protocol-relative and `scheme://` is absolute; both leave.
    if (path.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(path)) fail('PATH_NOT_SAME_ORIGIN');
    if (path.includes('\\')) fail('PATH_NOT_SAME_ORIGIN');
    if (!path.startsWith(`${API_BASE}/`) && path !== API_BASE) fail('PATH_OUTSIDE_API');
    if (path.includes('?') || path.includes('#')) fail('QUERY_MUST_BE_STRUCTURED');
    return path;
}

/**
 * Build the query string for a list request.
 *
 * The cursor is copied through byte for byte. The contract says clients must
 * not construct or interpret one, and the honest way to hold that line is for
 * this function to have no code that could: there is no decode, no parse, no
 * inspection of its contents, and nothing here knows what a cursor contains.
 *
 * @param {{limit?: number, cursor?: string|null, filters?: object}} input
 */
export function buildQuery({ limit, cursor = null, filters = {} } = {}) {
    const params = [];

    if (limit !== undefined) {
        if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_LIMIT_MAX) {
            fail('LIMIT_OUT_OF_RANGE');
        }
        params.push(['limit', String(limit)]);
    }

    if (cursor !== null && cursor !== undefined) {
        if (typeof cursor !== 'string' || cursor.length === 0) fail('CURSOR_NOT_OPAQUE');
        params.push(['cursor', cursor]);
    }

    for (const [key, value] of Object.entries(filters ?? {})) {
        if (PROHIBITED_QUERY_KEYS.includes(key)) fail('UNSUPPORTED_QUERY_PARAMETER');
        if (value === undefined || value === null) continue;
        if (typeof value === 'object') fail('UNSUPPORTED_QUERY_PARAMETER');
        params.push([key, String(value)]);
    }

    if (params.length === 0) return '';
    const search = params
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    // §6 bounds the query string; a capability was already refused above.
    if (search.length > 4096) fail('QUERY_TOO_LARGE');
    return `?${search}`;
}

/**
 * Validate an idempotency key the caller supplied.
 *
 * The outbox replays a mutation under its original key — that is the whole
 * mechanism by which an uncertain result is reconciled rather than duplicated —
 * so a caller-supplied key is normal and must be preserved exactly. What is
 * refused is a key that could not carry the entropy the contract requires,
 * because a guessable key defeats the guard it exists to provide.
 *
 * @param {string} key
 */
export function assertIdempotencyKey(key) {
    if (typeof key !== 'string') fail('INVALID_IDEMPOTENCY_KEY');
    if (key.length < 32 || key.length > 128) fail('INVALID_IDEMPOTENCY_KEY');
    if (!/^[A-Za-z0-9._~-]+$/.test(key)) fail('INVALID_IDEMPOTENCY_KEY');
    return key;
}

// ── the client ───────────────────────────────────────────────────────────────

const jsonContentType = /^application\/json\b/i;

/**
 * Create a client.
 *
 * Everything it touches is injected: the transport, the identifier source, and
 * the clock. Not for purity's sake — it is what allows the CF-P7-015 gate to
 * drive this module's refusals for real instead of reading its source and
 * hoping.
 *
 * @param {{fetch?: Function, randomId?: () => string, now?: () => number}} [input]
 */
export function createApiClient({ fetch: injected, randomId, now } = {}) {
    // The ambient global is resolved here and in no other collaboration module.
    // That is what makes "this surface performs no transport" — asserted by
    // eleven separate gates — an architecture rather than eleven coincidences:
    // there is one door, and this is it. A caller may still hand in its own
    // transport, which is how this module's own refusals get tested without a
    // network, but nothing else reaches for `fetch` on its own.
    const transport = injected === undefined
        ? globalThis.fetch?.bind(globalThis)
        : injected;
    if (typeof transport !== 'function') fail('TRANSPORT_REQUIRED');
    const newId = typeof randomId === 'function'
        ? randomId
        : () => globalThis.crypto.randomUUID();
    const clock = typeof now === 'function' ? now : () => Date.now();

    // The CSRF token lives here and nowhere else. Not in storage, not on an
    // element, not in a URL — the contract says memory only, and a closure
    // variable is the only place in a browser that genuinely is.
    let csrfToken = null;
    let sessionResolved = false;

    /**
     * Read one response into either data or a typed failure.
     *
     * The `text/html` check is not defensive programming for its own sake. A
     * Pages deployment whose artifact is missing a route serves the SPA shell
     * with status 200, which is exactly what happened to /js/collaboration/
     * entry.js on deployment 037fb093 — the import resolved to a page and the
     * failure surfaced as silence. An API response that is secretly a web page
     * fails here, loudly, instead of being handed onward as data.
     */
    async function interpret(response) {
        const requestId = typeof response.headers?.get === 'function'
            ? response.headers.get('X-Request-ID')
            : null;

        if (response.status === 204) {
            return Object.freeze({ ok: true, status: 204, data: null, page: null, requestId });
        }

        const contentType = typeof response.headers?.get === 'function'
            ? response.headers.get('content-type') ?? ''
            : '';
        if (!jsonContentType.test(contentType)) {
            fail('NON_JSON_RESPONSE', { status: response.status, requestId });
        }

        let envelope = null;
        try {
            envelope = await response.json();
        } catch {
            fail('MALFORMED_RESPONSE', { status: response.status, requestId });
        }

        if (response.ok) {
            // Unknown response fields are additive by contract, so `data` is
            // taken as given rather than filtered. Each surface projects what
            // it renders; that is where a stray field is caught.
            return Object.freeze({
                ok: true,
                status: response.status,
                data: envelope?.data ?? null,
                page: envelope?.meta?.page ?? null,
                requestId: envelope?.meta?.requestId ?? requestId
            });
        }

        const code = envelope?.error?.code;
        return Object.freeze({
            ok: false,
            status: response.status,
            failure: presentErrorCode(code),
            details: envelope?.error?.details ?? null,
            requestId: envelope?.meta?.requestId ?? requestId
        });
    }

    /**
     * Send one request.
     *
     * @param {{method?: string, path: string, query?: object, body?: object|null,
     *          idempotencyKey?: string|null}} input
     */
    async function request({ method = 'GET', path, query, body = null,
        idempotencyKey = null } = {}) {
        const verb = String(method).toUpperCase();
        assertSameOriginPath(path);

        const headers = { Accept: 'application/json' };
        const init = { method: verb, headers, credentials: 'same-origin', cache: 'no-store' };

        if (isMutation(verb)) {
            // A mutation before the session is known is a bug in the caller,
            // not a request to attempt: it would be sent without the CSRF token
            // and rejected, and the user would see a verification failure whose
            // real cause was ordering.
            if (!sessionResolved) fail('SESSION_NOT_RESOLVED');
            if (typeof csrfToken !== 'string' || csrfToken.length === 0) {
                fail('CSRF_TOKEN_REQUIRED');
            }
            headers['X-CSRF-Token'] = csrfToken;
            headers['Idempotency-Key'] = idempotencyKey === null
                ? assertIdempotencyKey(newId())
                : assertIdempotencyKey(idempotencyKey);
            if (body !== null) {
                headers['Content-Type'] = 'application/json; charset=utf-8';
                init.body = JSON.stringify(body);
            }
        } else {
            // A read carrying an idempotency key is meaningless, and accepting
            // it would let a caller believe a GET was being deduplicated.
            if (idempotencyKey !== null) fail('IDEMPOTENCY_KEY_ON_READ');
            if (body !== null) fail('BODY_ON_READ');
        }

        const url = `${path}${query === undefined ? '' : buildQuery(query)}`;
        const response = await transport(url, init);
        return interpret(response);
    }

    /**
     * Resolve the session, and with it whether collaboration runs here at all.
     *
     * One request answers both questions, which is why they are not two calls.
     * `available` is the deployment's own answer: `COLLABORATION_UNAVAILABLE`
     * is the API saying the feature is off here, and it outranks anything the
     * hostname suggested.
     *
     * The returned view deliberately has no `csrfToken`. The server sends one
     * and it is kept, but handing it back out would put it within reach of
     * every caller and, sooner or later, of a URL.
     */
    async function resolveSession() {
        let result;
        try {
            result = await request({ method: 'GET', path: `${API_BASE}/session` });
        } catch (error) {
            // Transport that never reached a server is not the same as a server
            // saying no, and must not be reported as "unavailable here" — the
            // deployment may be fine and the network not.
            if (error instanceof ApiClientError) {
                return Object.freeze({
                    available: true, reason: 'transport-failed', authenticated: null,
                    user: null, session: null, failure: presentErrorCode(error.code)
                });
            }
            throw error;
        }

        if (!result.ok) {
            if (result.failure.code === 'COLLABORATION_UNAVAILABLE') {
                sessionResolved = false;
                csrfToken = null;
                return Object.freeze({
                    available: false, reason: 'deployment-disabled', authenticated: null,
                    user: null, session: null, failure: result.failure
                });
            }
            // Any other failure leaves availability alone: the deployment
            // answered, it simply did not answer yes to this caller.
            return Object.freeze({
                available: true, reason: 'request-failed', authenticated: null,
                user: null, session: null, failure: result.failure
            });
        }

        const view = result.data ?? {};
        csrfToken = typeof view.csrfToken === 'string' ? view.csrfToken : null;
        sessionResolved = true;
        return Object.freeze({
            available: true,
            reason: 'deployment-enabled',
            authenticated: view.authenticated === true,
            user: view.authenticated === true ? Object.freeze({ ...view.user }) : null,
            session: view.authenticated === true ? Object.freeze({ ...view.session }) : null,
            failure: null
        });
    }

    /**
     * Begin sign-in: create a public OAuth transaction and return the GitHub
     * authorization URL to redirect the browser to.
     *
     * The one exemption from `request()`'s CSRF gate above, and only for
     * exactly this call. `POST /api/v1/oauth/github/transactions` with
     * `purpose: 'sign_in'` is the one mutation the frozen server contract
     * accepts before a session exists — signing in cannot itself require
     * already being signed in (see functions/_lib/identity/request-policy.ts,
     * which exempts precisely this route and purpose from its own CSRF check).
     * This bypasses `request()`'s mutation gate rather than weakening it: every
     * other mutation still requires `sessionResolved` and a live `csrfToken`.
     *
     * `purpose: 'reauthenticate'` is deliberately not offered here — the server
     * does not exempt it, so a caller asking for a fresh sign-in on an existing
     * session must go through `mutate()` like any other mutation, with the
     * CSRF token that session already holds.
     *
     * @param {{returnPath?: string}} [input]
     */
    async function beginSignIn({ returnPath } = {}) {
        if (returnPath !== undefined && typeof returnPath !== 'string') {
            fail('RETURN_PATH_MUST_BE_STRING');
        }
        const path = assertSameOriginPath(`${API_BASE}/oauth/github/transactions`);
        const body = returnPath === undefined
            ? { purpose: 'sign_in' }
            : { purpose: 'sign_in', returnPath };
        let response;
        try {
            response = await transport(path, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8' },
                credentials: 'same-origin',
                cache: 'no-store',
                body: JSON.stringify(body)
            });
        } catch {
            // A transport that never reached a server, not the server saying no.
            return Object.freeze({
                ok: false, status: null, requestId: null,
                failure: presentErrorCode('TRANSPORT_FAILED')
            });
        }
        return interpret(response);
    }

    /**
     * A paginated read. The cursor is whatever the previous page returned.
     *
     * @param {{path: string, limit?: number, cursor?: string|null, filters?: object}} input
     */
    async function list({ path, limit = PAGE_LIMIT_DEFAULT, cursor = null, filters = {} }) {
        const result = await request({
            method: 'GET', path, query: { limit, cursor, filters }
        });
        if (!result.ok) return result;
        const data = result.data ?? {};
        return Object.freeze({
            ok: true,
            status: result.status,
            items: Object.freeze([...(data.items ?? [])]),
            // Passed back out exactly as it arrived, for the caller to hand in
            // again unchanged. `null` is the end of the list, not an error.
            nextCursor: result.page?.nextCursor ?? null,
            requestId: result.requestId
        });
    }

    /**
     * A state change. The key is generated unless the caller is replaying one.
     *
     * @param {{method?: string, path: string, body?: object|null,
     *          idempotencyKey?: string|null}} input
     */
    async function mutate({ method = 'POST', path, body = null, idempotencyKey = null }) {
        // `async` so a refused mutation rejects rather than throwing
        // synchronously. A caller that handles one failure with `.catch` and
        // the other with `try` will eventually handle only one of them.
        const verb = String(method).toUpperCase();
        if (!isMutation(verb)) fail('NOT_A_MUTATION');
        return request({ method: verb, path, body, idempotencyKey });
    }

    /** A key a caller can hold for a replay it has not sent yet. */
    function newIdempotencyKey() {
        return assertIdempotencyKey(newId());
    }

    /** Forget the session. Used on sign-out and on an authentication failure. */
    function forgetSession() {
        csrfToken = null;
        sessionResolved = false;
        return true;
    }

    return Object.freeze({
        request,
        resolveSession,
        beginSignIn,
        list,
        mutate,
        newIdempotencyKey,
        forgetSession,
        /** Whether a mutation may currently be sent, without revealing the token. */
        get canMutate() {
            return sessionResolved && typeof csrfToken === 'string' && csrfToken.length > 0;
        },
        get resolvedAt() {
            return sessionResolved ? clock() : null;
        }
    });
}
