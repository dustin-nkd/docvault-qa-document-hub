import { createIdentityOperationalEvent, type IdentityOperationalEvent } from '../functions/_lib/identity/observability';

const LIMIT_PATH = '/v1/limit';
const OBSERVE_PATH = '/v1/observe';
const MAXIMUM_LIMIT_BODY_BYTES = 96;
const MAXIMUM_EVENT_BODY_BYTES = 512;
const DIGEST = /^[A-Za-z0-9_-]{43}$/;

const headers = Object.freeze({
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
});

function json(status: number, body: object): Response {
    return new Response(JSON.stringify(body), { status, headers });
}

async function bodyKey(request: Request): Promise<string | null> {
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') ?? '')) return null;
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d{1,3}$/.test(length) || Number(length) > MAXIMUM_LIMIT_BODY_BYTES)) return null;
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAXIMUM_LIMIT_BODY_BYTES) return null;
    let value: unknown;
    try { value = JSON.parse(text); } catch { return null; }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    return Object.keys(record).length === 1 && typeof record.key === 'string' && DIGEST.test(record.key)
        ? record.key : null;
}

async function bodyEvent(request: Request): Promise<IdentityOperationalEvent | null> {
    if (!/^application\/json(?:\s*;.*)?$/i.test(request.headers.get('Content-Type') ?? '')) return null;
    const length = request.headers.get('Content-Length');
    if (length !== null && (!/^\d{1,3}$/.test(length) || Number(length) > MAXIMUM_EVENT_BODY_BYTES)) return null;
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAXIMUM_EVENT_BODY_BYTES) return null;
    try {
        const value = JSON.parse(text);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
        return createIdentityOperationalEvent(value as IdentityOperationalEvent);
    } catch {
        return null;
    }
}

export async function handleIdentityBurst(request: Request, limiter: RateLimit): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.search !== '') {
        return json(404, { error: 'NOT_FOUND' });
    }
    if (url.pathname === OBSERVE_PATH) {
        const event = await bodyEvent(request);
        if (event === null) return json(400, { error: 'INVALID_REQUEST' });
        console.log(JSON.stringify(event));
        return new Response(null, { status: 204, headers });
    }
    if (url.pathname !== LIMIT_PATH) return json(404, { error: 'NOT_FOUND' });
    const key = await bodyKey(request);
    if (key === null) return json(400, { error: 'INVALID_REQUEST' });
    try {
        const result = await limiter.limit({ key });
        return json(200, { success: result.success === true });
    } catch {
        return json(503, { error: 'UNAVAILABLE' });
    }
}

export default {
    fetch(request: Request, env: Env): Promise<Response> {
        return handleIdentityBurst(request, env.AUTH_BURST_LIMITER);
    }
} satisfies ExportedHandler<Env>;
