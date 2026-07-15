const API_VERSION = 'v1';
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_QUERY_BYTES = 4 * 1024;
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const UNSAFE_METHODS = Object.freeze(['POST', 'PUT', 'PATCH', 'DELETE']);

/** @typedef {import('./runtime-dependencies.mjs').RuntimeDependencies} RuntimeDependencies */

const ROUTES = Object.freeze([
    { pattern: /^\/api\/v1\/oauth\/github\/transactions\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/oauth\/github\/callback\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/session\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/session\/logout\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/devices\/?$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/v1\/devices\/[^/]+\/?$/, methods: ['DELETE'] },
    { pattern: /^\/api\/v1\/workspaces\/?$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/members\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/members\/[^/]+\/?$/, methods: ['PATCH', 'DELETE'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/ownership-transfers\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/invitations\/?$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/invitations\/[^/]+\/?$/, methods: ['DELETE'] },
    { pattern: /^\/api\/v1\/invitations\/bootstrap\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/invitations\/accept\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/devices\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-envelopes\/current\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-envelopes\/[^/]+\/?$/, methods: ['PUT'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-rotations\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-rotations\/[^/]+\/envelopes\/[^/]+\/?$/, methods: ['PUT'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-rotations\/[^/]+\/commit\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/key-rotations\/[^/]+\/?$/, methods: ['GET', 'DELETE'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/documents\/?$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/documents\/[^/]+\/?$/, methods: ['GET', 'PUT'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/documents\/[^/]+\/tombstone\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/documents\/[^/]+\/revisions\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/documents\/[^/]+\/revisions\/[^/]+\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/mutations\/[^/]+\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/audit-events\/?$/, methods: ['GET'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/exports\/?$/, methods: ['POST'] },
    { pattern: /^\/api\/v1\/workspaces\/[^/]+\/deletion-requests\/?$/, methods: ['POST'] }
]);

const ERROR_MESSAGES = Object.freeze({
    INVALID_JSON: 'The request body must contain valid JSON.',
    VALIDATION_FAILED: 'The request does not satisfy the API contract.',
    CSRF_REJECTED: 'Request origin validation failed.',
    RESOURCE_NOT_FOUND: 'The requested resource was not found.',
    METHOD_NOT_ALLOWED: 'The request method is not supported for this route.',
    NOT_ACCEPTABLE: 'The requested response media type is not supported.',
    PAYLOAD_TOO_LARGE: 'The request payload exceeds the allowed size.',
    UNSUPPORTED_MEDIA_TYPE: 'Content-Type must be application/json; charset=utf-8.',
    INTERNAL_ERROR: 'The request could not be completed.',
    COLLABORATION_UNAVAILABLE: 'Collaboration is currently unavailable.'
});

/** @typedef {keyof typeof ERROR_MESSAGES} ErrorCode */

class ApiError extends Error {
    /**
     * @param {number} status
     * @param {ErrorCode} code
     * @param {Record<string, string> | undefined} headers
     */
    constructor(status, code, headers = undefined) {
        super(code);
        this.name = 'ApiError';
        this.status = status;
        this.code = code;
        this.headers = headers;
    }
}

/**
 * @param {string} requestId
 * @param {Record<string, string> | undefined} extra
 */
function responseHeaders(requestId, extra = undefined) {
    const headers = new Headers({
        'Cache-Control': 'no-store, private',
        'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        'Content-Type': JSON_CONTENT_TYPE,
        'Expires': '0',
        'Permissions-Policy': 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
        'Pragma': 'no-cache',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-Request-ID': requestId
    });
    if (extra) {
        for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    }
    return headers;
}

/**
 * @param {number} status
 * @param {ErrorCode} code
 * @param {string} requestId
 * @param {Record<string, string> | undefined} extraHeaders
 */
function errorResponse(status, code, requestId, extraHeaders = undefined) {
    return new Response(JSON.stringify({
        error: { code, message: ERROR_MESSAGES[code] },
        meta: { requestId, apiVersion: API_VERSION }
    }), {
        status,
        headers: responseHeaders(requestId, extraHeaders)
    });
}

/** @param {string} pathname */
function resolveRoute(pathname) {
    return ROUTES.find(route => route.pattern.test(pathname));
}

/** @param {string | null} header */
function acceptsJson(header) {
    if (!header) return true;
    return header.split(',').some(entry => {
        const [mediaRange, ...parameters] = entry.trim().toLowerCase().split(';').map(value => value.trim());
        const quality = parameters.find(value => value.startsWith('q='));
        if (quality && Number(quality.slice(2)) === 0) return false;
        return mediaRange === '*/*' || mediaRange === 'application/*' || mediaRange === 'application/json';
    });
}

/** @param {string | null} header */
function hasRequiredJsonContentType(header) {
    if (!header) return false;
    const parts = header.toLowerCase().split(';').map(value => value.trim()).filter(Boolean);
    if (parts[0] !== 'application/json') return false;
    const parameters = parts.slice(1);
    return parameters.length === 1 && /^charset=(?:"?utf-8"?)$/.test(parameters[0]);
}

/** @param {URL} url */
function queryByteLength(url) {
    return new TextEncoder().encode(url.search.startsWith('?') ? url.search.slice(1) : url.search).byteLength;
}

/** @param {string} value */
function parseOrigin(value) {
    try {
        const url = new URL(value);
        if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
        return url.origin;
    } catch {
        return null;
    }
}

/**
 * Resolve the one origin allowed by the reviewed environment policy. Preview
 * aliases have exactly one label before the canonical Pages hostname; the
 * request Origin still has to equal that complete runtime origin.
 * @param {URL} requestUrl
 * @param {ApiEnv} env
 */
function resolveAllowedOrigin(requestUrl, env) {
    if (env.APP_ENV !== env.ORIGIN_POLICY_MODE) return null;

    const canonicalOrigin = parseOrigin(env.CANONICAL_PRODUCTION_ORIGIN);
    if (!canonicalOrigin || canonicalOrigin !== env.CANONICAL_PRODUCTION_ORIGIN) return null;
    const canonicalUrl = new URL(canonicalOrigin);

    if (env.ORIGIN_POLICY_MODE === 'production') {
        return requestUrl.origin === canonicalOrigin ? canonicalOrigin : null;
    }
    if (env.ORIGIN_POLICY_MODE === 'preview') {
        const canonicalLabels = canonicalUrl.hostname.split('.');
        const requestLabels = requestUrl.hostname.split('.');
        const isPagesPreview = requestUrl.protocol === 'https:'
            && requestUrl.port === ''
            && requestUrl.origin !== canonicalOrigin
            && requestLabels.length === canonicalLabels.length + 1
            && requestLabels.slice(1).every((label, index) => label === canonicalLabels[index])
            && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(requestLabels[0]);
        return isPagesPreview ? requestUrl.origin : null;
    }
    if (env.ORIGIN_POLICY_MODE === 'local') {
        const isLocalHost = requestUrl.hostname === 'localhost'
            || requestUrl.hostname === '127.0.0.1'
            || requestUrl.hostname === '[::1]';
        return isLocalHost && ['http:', 'https:'].includes(requestUrl.protocol) ? requestUrl.origin : null;
    }
    return null;
}

/**
 * @param {Request} request
 * @param {URL} requestUrl
 * @param {ApiEnv} env
 */
function enforceOriginPolicy(request, requestUrl, env) {
    const allowedOrigin = resolveAllowedOrigin(requestUrl, env);
    if (!allowedOrigin) throw new ApiError(403, 'CSRF_REJECTED');

    const suppliedHeader = request.headers.get('Origin');
    if (!suppliedHeader) {
        if (UNSAFE_METHODS.includes(request.method)) throw new ApiError(403, 'CSRF_REJECTED');
        return;
    }
    const suppliedOrigin = parseOrigin(suppliedHeader);
    if (!suppliedOrigin || suppliedOrigin !== allowedOrigin) throw new ApiError(403, 'CSRF_REJECTED');
}

/** @param {Request} request */
async function readBoundedJson(request) {
    const lengthHeader = request.headers.get('Content-Length');
    if (lengthHeader !== null) {
        if (!/^\d+$/.test(lengthHeader)) throw new ApiError(400, 'VALIDATION_FAILED');
        if (Number(lengthHeader) > MAX_BODY_BYTES) throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
    }
    if (!request.body) throw new ApiError(400, 'INVALID_JSON');

    const reader = request.body.getReader();
    const chunks = [];
    let totalBytes = 0;
    while (true) {
        const result = await reader.read();
        if (result.done) break;
        totalBytes += result.value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
            await reader.cancel();
            throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
        }
        chunks.push(result.value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    let source;
    try {
        source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
        JSON.parse(source);
    } catch {
        throw new ApiError(400, 'INVALID_JSON');
    }
}

/**
 * @typedef {Pick<Env, 'APP_ENV' | 'ORIGIN_POLICY_MODE' | 'CANONICAL_PRODUCTION_ORIGIN' | 'COLLABORATION_ENABLED'>} ApiEnv
 */

/**
 * Execute the Phase 1 fail-closed API pipeline without invoking an asset fallback.
 * @param {Request} request
 * @param {ApiEnv} env
 * @param {RuntimeDependencies} dependencies
 * @returns {Promise<Response>}
 */
export async function handleApiRequest(request, env, dependencies) {
    const requestId = `req_${dependencies.ids.uuid()}`;
    try {
        const url = new URL(request.url);
        if (queryByteLength(url) > MAX_QUERY_BYTES) throw new ApiError(400, 'VALIDATION_FAILED');

        const route = resolveRoute(url.pathname);
        if (!route) throw new ApiError(404, 'RESOURCE_NOT_FOUND');
        if (!route.methods.includes(request.method)) {
            throw new ApiError(405, 'METHOD_NOT_ALLOWED', { Allow: route.methods.join(', ') });
        }
        if (!acceptsJson(request.headers.get('Accept'))) throw new ApiError(406, 'NOT_ACCEPTABLE');

        // Reject a mismatched host/origin before reading a mutation body. This
        // boundary emits no CORS headers and performs no storage or dispatch.
        enforceOriginPolicy(request, url, env);

        if (UNSAFE_METHODS.includes(request.method)) {
            if (!hasRequiredJsonContentType(request.headers.get('Content-Type'))) {
                throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
            }
            await readBoundedJson(request);
        }

        await dependencies.failures.checkpoint('api.before-disabled-boundary');

        // Inspect the environment/feature boundary without dispatching.
        const hasReviewedDisabledState = env.COLLABORATION_ENABLED === 'false'
            && env.APP_ENV === env.ORIGIN_POLICY_MODE
            && ['local', 'preview', 'production'].includes(env.APP_ENV)
            && env.CANONICAL_PRODUCTION_ORIGIN === 'https://docvault-qa-document-hub.pages.dev';
        if (!hasReviewedDisabledState) {
            return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);
        }
        return errorResponse(503, 'COLLABORATION_UNAVAILABLE', requestId);
    } catch (error) {
        if (error instanceof ApiError) {
            return errorResponse(error.status, error.code, requestId, error.headers);
        }
        return errorResponse(500, 'INTERNAL_ERROR', requestId);
    }
}

export const API_SHELL_LIMITS = Object.freeze({
    maxBodyBytes: MAX_BODY_BYTES,
    maxQueryBytes: MAX_QUERY_BYTES
});
