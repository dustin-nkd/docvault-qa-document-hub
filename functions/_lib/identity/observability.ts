export type IdentityRouteTemplate = '/api/v1/oauth/github/transactions' |
    '/api/v1/oauth/github/callback' | '/api/v1/session' | '/api/v1/session/logout';
export type IdentityOutcome = 'success' | 'rejected' | 'rate_limited' | 'provider_credentials_rejected'
    | 'provider_redirect_rejected' | 'provider_verification_rejected' | 'provider_token_rejected'
    | 'provider_token_response_rejected' | 'provider_identity_rejected'
    | 'provider_unavailable' | 'internal_error';

export interface IdentityOperationalEvent {
    readonly requestId: string;
    readonly route: IdentityRouteTemplate;
    readonly method: 'GET' | 'POST';
    readonly outcome: IdentityOutcome;
    readonly status: number;
    readonly latencyMs: number;
    readonly environment: 'local' | 'preview' | 'production';
}

export interface IdentityEventSink { emit(event: IdentityOperationalEvent): void | Promise<void>; }

const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROUTES = new Set<IdentityRouteTemplate>(['/api/v1/oauth/github/transactions',
    '/api/v1/oauth/github/callback', '/api/v1/session', '/api/v1/session/logout']);
const OUTCOMES = new Set<IdentityOutcome>(['success', 'rejected', 'rate_limited',
    'provider_credentials_rejected', 'provider_redirect_rejected', 'provider_verification_rejected',
    'provider_token_rejected', 'provider_token_response_rejected', 'provider_identity_rejected',
    'provider_unavailable', 'internal_error']);

export function createIdentityOperationalEvent(event: IdentityOperationalEvent): IdentityOperationalEvent {
    if (Object.keys(event).length !== 7 || !REQUEST_ID.test(event.requestId) || !ROUTES.has(event.route)
        || (event.method !== 'GET' && event.method !== 'POST') || !OUTCOMES.has(event.outcome)
        || !Number.isInteger(event.status) || event.status < 100 || event.status > 599
        || !Number.isInteger(event.latencyMs) || event.latencyMs < 0 || event.latencyMs > 30_000
        || !['local', 'preview', 'production'].includes(event.environment)) {
        throw new Error('IDENTITY_OBSERVABILITY_INVALID');
    }
    return Object.freeze({ requestId: event.requestId, route: event.route, method: event.method,
        outcome: event.outcome, status: event.status, latencyMs: event.latencyMs,
        environment: event.environment });
}

export const PLATFORM_IDENTITY_EVENT_SINK: IdentityEventSink = Object.freeze({
    emit(event: IdentityOperationalEvent): void {
        console.log(JSON.stringify(createIdentityOperationalEvent(event)));
    }
});
