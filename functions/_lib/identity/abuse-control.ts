import { encodeBase64Url, IdentityPrimitiveError, utf8 } from './encoding';
import { IDENTITY_KEY_LABELS, signWithKeyring, type IdentityKeyring } from './crypto';

const MAXIMUM_CLEANUP_ROWS = 100;

export type IdentityRateTier = 'oauth_source' | 'identity_source' | 'identity_user';

export const IDENTITY_RATE_PROFILES = Object.freeze({
    oauth_source: Object.freeze({ limit: 20, windowMilliseconds: 600_000, retentionMilliseconds: 1_200_000 }),
    identity_source: Object.freeze({ limit: 300, windowMilliseconds: 60_000, retentionMilliseconds: 1_200_000 }),
    identity_user: Object.freeze({ limit: 120, windowMilliseconds: 60_000, retentionMilliseconds: 1_200_000 })
} as const);

export interface IdentityBurstLimiter {
    limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>;
}

export class IdentityRateLimitError extends Error {
    readonly code = 'RATE_LIMITED' as const;
    constructor(readonly retryAfterSeconds: number) {
        super('RATE_LIMITED');
        this.name = 'IdentityRateLimitError';
    }
}

function integerTime(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    return value;
}

async function digestKey(keyring: IdentityKeyring, tier: IdentityRateTier, windowStart: number,
    discriminator: string): Promise<{ readonly bytes: ArrayBuffer; readonly bindingKey: string }> {
    if (typeof discriminator !== 'string' || discriminator.length < 1 || discriminator.length > 255
        || /[\u0000-\u001f\u007f]/.test(discriminator)) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const material = utf8(`${tier}\u0000${windowStart}\u0000${discriminator}`);
    const { digest } = await signWithKeyring(keyring, IDENTITY_KEY_LABELS.rateLimit, material);
    return { bytes: digest.slice().buffer, bindingKey: encodeBase64Url(digest) };
}

export async function enforceIdentityRateLimit(input: {
    readonly database: Pick<D1DatabaseSession, 'prepare'>;
    readonly keyring: IdentityKeyring;
    readonly tier: IdentityRateTier;
    readonly discriminator: string;
    readonly serverTime: number;
    readonly burstLimiter?: IdentityBurstLimiter;
}): Promise<{ readonly count: number; readonly remaining: number }> {
    const now = integerTime(input.serverTime);
    const profile = IDENTITY_RATE_PROFILES[input.tier];
    if (now > Number.MAX_SAFE_INTEGER - profile.retentionMilliseconds) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const windowStart = Math.floor(now / profile.windowMilliseconds) * profile.windowMilliseconds;
    const expiresAt = windowStart + profile.retentionMilliseconds;
    const digest = await digestKey(input.keyring, input.tier, windowStart, input.discriminator);

    if (input.tier === 'oauth_source') {
        if (!input.burstLimiter) throw new IdentityRateLimitError(60);
        try {
            if ((await input.burstLimiter.limit({ key: digest.bindingKey })).success !== true) {
                throw new IdentityRateLimitError(Math.max(1,
                    Math.ceil((windowStart + profile.windowMilliseconds - now) / 1_000)));
            }
        } catch (error) {
            if (error instanceof IdentityRateLimitError) throw error;
            throw new IdentityRateLimitError(60);
        }
    }

    let row: { attempt_count: number } | null;
    try {
        row = await input.database.prepare(
            `INSERT INTO auth_rate_windows
                (key_digest, route_family, window_started_at, attempt_count, expires_at)
             VALUES (?, ?, ?, 1, ?)
             ON CONFLICT (route_family, key_digest, window_started_at) DO UPDATE
             SET attempt_count = auth_rate_windows.attempt_count + 1
             WHERE auth_rate_windows.attempt_count < ?
             RETURNING attempt_count`
        ).bind(digest.bytes, input.tier, windowStart, expiresAt, profile.limit)
            .first<{ attempt_count: number }>();
    } catch {
        throw new IdentityRateLimitError(Math.max(1,
            Math.ceil((windowStart + profile.windowMilliseconds - now) / 1_000)));
    }
    if (!row || !Number.isInteger(row.attempt_count) || row.attempt_count < 1 || row.attempt_count > profile.limit) {
        throw new IdentityRateLimitError(Math.max(1,
            Math.ceil((windowStart + profile.windowMilliseconds - now) / 1_000)));
    }
    return Object.freeze({ count: row.attempt_count, remaining: profile.limit - row.attempt_count });
}

export async function cleanupIdentityRateWindows(database: Pick<D1DatabaseSession, 'prepare'>,
    serverTime: number, maximumRows: number): Promise<number> {
    integerTime(serverTime);
    if (!Number.isInteger(maximumRows) || maximumRows < 1 || maximumRows > MAXIMUM_CLEANUP_ROWS) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    const result = await database.prepare(
        `DELETE FROM auth_rate_windows WHERE (route_family, key_digest, window_started_at) IN (
            SELECT route_family, key_digest, window_started_at FROM auth_rate_windows
            WHERE expires_at <= ? ORDER BY expires_at, route_family, window_started_at LIMIT ?
        )`
    ).bind(serverTime, maximumRows).run();
    const changes = result.meta?.changes;
    if (result.success !== true || !Number.isInteger(changes) || (changes ?? -1) < 0 || (changes ?? 101) > maximumRows) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    return changes ?? 0;
}
