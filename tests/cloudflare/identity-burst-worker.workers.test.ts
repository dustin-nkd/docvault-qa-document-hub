import { describe, expect, it, vi } from 'vitest';
import { handleIdentityBurst } from '../../workers/identity-burst-limiter';

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const request = (body: unknown, init: RequestInit = {}) => new Request('https://identity-burst.internal/v1/limit', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body), ...init
});

describe('CF-P3-G4B preview burst limiter Worker', () => {
    it('returns only the limiter decision and security response headers', async () => {
        const limit = vi.fn(async ({ key }: { key: string }) => ({ success: key === KEY }));
        const response = await handleIdentityBurst(request({ key: KEY }), { limit });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ success: true });
        expect(limit).toHaveBeenCalledWith({ key: KEY });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0');
        expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('rejects every route, method, query, content type, shape, and oversized body drift', async () => {
        const limiter = { limit: vi.fn(async () => ({ success: true })) };
        const cases = [
            new Request('https://identity-burst.internal/other', { method: 'POST' }),
            new Request('https://identity-burst.internal/v1/limit'),
            new Request('https://identity-burst.internal/v1/limit?x=1', { method: 'POST' }),
            new Request('https://identity-burst.internal/v1/limit', { method: 'POST', body: '{}' }),
            request({ key: 'raw-ip-address' }), request({ key: KEY, extra: true }), request({ key: 'A'.repeat(97) })
        ];
        for (const item of cases) expect((await handleIdentityBurst(item, limiter as RateLimit)).status).toBeGreaterThanOrEqual(400);
        expect(limiter.limit).not.toHaveBeenCalled();
    });

    it('fails closed without reflecting the digest when the platform limiter fails', async () => {
        const response = await handleIdentityBurst(request({ key: KEY }), {
            limit: async () => { throw new Error(`platform failed for ${KEY}`); }
        });
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('{"error":"UNAVAILABLE"}');
    });
});
