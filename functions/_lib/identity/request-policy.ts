import type { AuthorizationSessionSource } from '../persistence/authorization-session';
import { deriveCsrfToken, verifyCsrfToken, type IdentityKeyring } from './crypto';
import { readSessionCookie, type SessionCookieName } from './cookies';
import {
    resolveSessionToken,
    type ResolvedSession,
    type SessionLifecycleDependencies
} from './session-service';

const JSON_CONTENT_TYPE = 'application/json; charset=utf-8';
const CSRF_HEADER = 'X-CSRF-Token';

export type IdentityRouteId = 'oauth-transaction' | 'oauth-callback' | 'session' | 'logout';
export type OAuthTransactionPurpose = 'sign_in' | 'reauthenticate';

interface IdentityRoute {
    readonly id: IdentityRouteId;
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly response: 'json' | 'redirect';
    readonly mutation: boolean;
}

const IDENTITY_ROUTES: readonly IdentityRoute[] = Object.freeze([
    Object.freeze({ id: 'oauth-transaction', method: 'POST',
        path: '/api/v1/oauth/github/transactions', response: 'json', mutation: true }),
    Object.freeze({ id: 'oauth-callback', method: 'GET',
        path: '/api/v1/oauth/github/callback', response: 'redirect', mutation: false }),
    Object.freeze({ id: 'session', method: 'GET',
        path: '/api/v1/session', response: 'json', mutation: false }),
    Object.freeze({ id: 'logout', method: 'POST',
        path: '/api/v1/session/logout', response: 'json', mutation: true })
]);

export type IdentityRequestErrorCode =
    | 'RESOURCE_NOT_FOUND'
    | 'METHOD_NOT_ALLOWED'
    | 'NOT_ACCEPTABLE'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'VALIDATION_FAILED'
    | 'CSRF_REJECTED'
    | 'UNAUTHENTICATED';

export class IdentityRequestPolicyError extends Error {
    readonly code: IdentityRequestErrorCode;
    readonly status: number;
    readonly allow: string | null;
    readonly clearCookie: boolean;

    constructor(status: number, code: IdentityRequestErrorCode, options: {
        readonly allow?: string;
        readonly clearCookie?: boolean;
    } = {}) {
        super(code);
        this.name = 'IdentityRequestPolicyError';
        this.status = status;
        this.code = code;
        this.allow = options.allow ?? null;
        this.clearCookie = options.clearCookie ?? false;
    }
}

export interface IdentityRequestPolicy {
    readonly route: IdentityRoute;
    readonly requestOrigin: string;
}

export interface IdentityRequestAuthorization {
    readonly policy: IdentityRequestPolicy;
    readonly session: ResolvedSession | null;
    readonly csrfToken: string | null;
}

export interface IdentityRequestAuthorizationInput {
    readonly expectedOrigin: string;
    readonly transactionPurpose?: OAuthTransactionPurpose;
    readonly cookieName: SessionCookieName;
    readonly sessionTokenPepper: IdentityKeyring;
    readonly csrfTokenKey: IdentityKeyring;
}

function exactOrigin(value: string): string | null {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/'
            || url.search || url.hash || url.origin !== value) return null;
        return url.origin;
    } catch {
        return null;
    }
}

function acceptsJson(value: string | null): boolean {
    if (value === null) return true;
    return value.split(',').some(item => {
        const [range, ...parameters] = item.trim().toLowerCase().split(';').map(part => part.trim());
        const quality = parameters.find(parameter => parameter.startsWith('q='));
        if (quality && Number(quality.slice(2)) === 0) return false;
        return range === '*/*' || range === 'application/*' || range === 'application/json';
    });
}

function isJsonContentType(value: string | null): boolean {
    if (value === null) return false;
    const parts = value.toLowerCase().split(';').map(part => part.trim()).filter(Boolean);
    return parts.length === 2 && parts[0] === 'application/json'
        && /^charset=(?:"?utf-8"?)$/.test(parts[1]);
}

function routeForPath(pathname: string): IdentityRoute | null {
    return IDENTITY_ROUTES.find(route => route.path === pathname) ?? null;
}

/**
 * Classify the frozen Phase 3 identity surface before any body read, session
 * lookup, or domain dispatch. Normal API responses intentionally emit no CORS
 * headers; OPTIONS therefore follows the same method-denial path.
 */
export function enforceIdentityRequestPolicy(request: Request,
    expectedOriginValue: string): IdentityRequestPolicy {
    const expectedOrigin = exactOrigin(expectedOriginValue);
    const url = new URL(request.url);
    if (expectedOrigin === null || url.origin !== expectedOrigin) {
        throw new IdentityRequestPolicyError(403, 'CSRF_REJECTED');
    }
    const route = routeForPath(url.pathname);
    if (route === null) throw new IdentityRequestPolicyError(404, 'RESOURCE_NOT_FOUND');
    if (request.method !== route.method) {
        throw new IdentityRequestPolicyError(405, 'METHOD_NOT_ALLOWED', { allow: route.method });
    }
    if (route.id !== 'oauth-callback' && url.search !== '') {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    if (route.response === 'json' && !acceptsJson(request.headers.get('Accept'))) {
        throw new IdentityRequestPolicyError(406, 'NOT_ACCEPTABLE');
    }
    if (route.mutation) {
        if (request.headers.get('Origin') !== expectedOrigin) {
            throw new IdentityRequestPolicyError(403, 'CSRF_REJECTED');
        }
        if (!isJsonContentType(request.headers.get('Content-Type'))) {
            throw new IdentityRequestPolicyError(415, 'UNSUPPORTED_MEDIA_TYPE');
        }
    } else if (route.id === 'session') {
        const suppliedOrigin = request.headers.get('Origin');
        if (suppliedOrigin !== null && suppliedOrigin !== expectedOrigin) {
            throw new IdentityRequestPolicyError(403, 'CSRF_REJECTED');
        }
    }
    return Object.freeze({ route, requestOrigin: expectedOrigin });
}

async function validCsrf(input: IdentityRequestAuthorizationInput, sessionToken: string,
    suppliedToken: string | null): Promise<boolean> {
    if (suppliedToken === null) return false;
    try {
        return await verifyCsrfToken(input.csrfTokenKey, sessionToken, suppliedToken);
    } catch {
        return false;
    }
}

function requiresSession(route: IdentityRoute,
    purpose: OAuthTransactionPurpose | undefined): boolean {
    return route.id === 'logout' || (route.id === 'oauth-transaction' && purpose === 'reauthenticate');
}

function containsConfiguredCookie(header: string | null, cookieName: SessionCookieName): boolean {
    return header !== null && header.length <= 8_192 && header.split(';').some(part => {
        const separator = part.indexOf('=');
        return separator >= 0 && part.slice(0, separator).trim() === cookieName;
    });
}

/**
 * Apply optional/required session and synchronizer-token policy after route and
 * exact-Origin classification. This seam is intentionally not connected to the
 * deployed Pages handler until the preview activation gate.
 */
export async function authorizeIdentityRequest(database: AuthorizationSessionSource, request: Request,
    input: IdentityRequestAuthorizationInput,
    dependencies: SessionLifecycleDependencies): Promise<IdentityRequestAuthorization> {
    const policy = enforceIdentityRequestPolicy(request, input.expectedOrigin);
    if (policy.route.id === 'oauth-callback') {
        return Object.freeze({ policy, session: null, csrfToken: null });
    }
    if (policy.route.id === 'oauth-transaction' && input.transactionPurpose === undefined) {
        throw new IdentityRequestPolicyError(400, 'VALIDATION_FAILED');
    }
    if (policy.route.id === 'oauth-transaction' && input.transactionPurpose === 'sign_in') {
        return Object.freeze({ policy, session: null, csrfToken: null });
    }

    const rawSessionToken = readSessionCookie(request.headers.get('Cookie'), input.cookieName);
    if (rawSessionToken === null) {
        const clearCookie = containsConfiguredCookie(request.headers.get('Cookie'), input.cookieName);
        if (requiresSession(policy.route, input.transactionPurpose)) {
            throw new IdentityRequestPolicyError(401, 'UNAUTHENTICATED', { clearCookie });
        }
        return Object.freeze({
            policy,
            session: Object.freeze({ authenticated: false, clearCookie }),
            csrfToken: null
        });
    }

    const session = await resolveSessionToken(database, {
        cookieName: input.cookieName,
        sessionTokenPepper: input.sessionTokenPepper,
        token: rawSessionToken,
        coalesceActivity: !requiresSession(policy.route, input.transactionPurpose)
    }, dependencies);
    if (!session.authenticated) {
        if (requiresSession(policy.route, input.transactionPurpose)) {
            throw new IdentityRequestPolicyError(401, 'UNAUTHENTICATED', { clearCookie: true });
        }
        return Object.freeze({ policy, session, csrfToken: null });
    }
    if (requiresSession(policy.route, input.transactionPurpose)
        && !await validCsrf(input, rawSessionToken, request.headers.get(CSRF_HEADER))) {
        throw new IdentityRequestPolicyError(403, 'CSRF_REJECTED');
    }
    const csrfToken = policy.route.id === 'session'
        ? await deriveCsrfToken(input.csrfTokenKey, rawSessionToken)
        : null;
    return Object.freeze({ policy, session, csrfToken });
}

export function identityResponseHeaders(requestId: string): Headers {
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
    return headers;
}

export const IDENTITY_REQUEST_POLICY = Object.freeze({
    routes: IDENTITY_ROUTES.map(route => `${route.method} ${route.path}`),
    csrfHeader: CSRF_HEADER,
    corsHeaders: Object.freeze([] as string[])
});
