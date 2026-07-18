import { decodeBase64Url, decodeUtf8, IdentityPrimitiveError } from './encoding';
import { IDENTITY_ENVIRONMENT_CONSTANTS } from './environment';
import { type RandomBytesSource, PLATFORM_RANDOM } from './crypto';

const TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const IDENTITY_ENDPOINT = 'https://api.github.com/user';
const CALLBACK_URI = `${IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin}/api/v1/oauth/github/callback`;
const GITHUB_API_VERSION = '2026-03-10';
const REQUEST_TIMEOUT_MS = 5_000;
const OVERALL_BUDGET_MS = 8_000;
const MAXIMUM_RETRY_DELAY_MS = 1_000;
const MAXIMUM_RESPONSE_BYTES = 16_384;
const RETRYABLE_IDENTITY_STATUSES = new Set([429, 502, 503, 504]);

export interface GitHubOAuthConfiguration {
    readonly clientId: string;
    readonly clientSecret: string;
}

export interface GitHubIdentity {
    readonly provider: 'github';
    readonly providerSubject: string;
    readonly login: string;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
}

export interface GitHubOAuthResolutionInput {
    readonly code: string;
    readonly redirectUri: string;
    readonly pkceVerifier: string;
}

export interface GitHubHttpTransport {
    request(url: string, init: RequestInit, timeoutMilliseconds: number): Promise<Response>;
}

export interface GitHubOAuthAdapterDependencies {
    readonly transport: GitHubHttpTransport;
    readonly clock: { now(): number };
    readonly random: RandomBytesSource;
    readonly sleep: { wait(milliseconds: number): Promise<void> };
}

export interface GitHubOAuthAdapter {
    resolveIdentity(input: GitHubOAuthResolutionInput): Promise<GitHubIdentity>;
}

export type GitHubOAuthFailureCategory = 'credentials_rejected' | 'redirect_rejected'
    | 'verification_rejected' | 'token_transport_unavailable' | 'token_rejected' | 'token_response_rejected'
    | 'identity_rejected' | 'unavailable';

export class GitHubOAuthAdapterError extends Error {
    readonly code = 'GITHUB_OAUTH_UNAVAILABLE' as const;
    declare readonly category: GitHubOAuthFailureCategory;

    constructor(category: GitHubOAuthFailureCategory = 'unavailable') {
        super('GITHUB_OAUTH_UNAVAILABLE');
        this.name = 'GitHubOAuthAdapterError';
        Object.defineProperty(this, 'category', { value: category, enumerable: false });
    }
}

function tokenFailureCategory(payload: Record<string, unknown>): GitHubOAuthFailureCategory | null {
    if (typeof payload.error !== 'string') return null;
    switch (payload.error) {
        case 'incorrect_client_credentials': return 'credentials_rejected';
        case 'redirect_uri_mismatch': return 'redirect_rejected';
        case 'bad_verification_code': return 'verification_rejected';
        case 'unverified_user_email': return 'identity_rejected';
        default: return 'token_rejected';
    }
}

function boundedCredential(value: string, maximum: number): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > maximum
        || /[\u0000-\u0020\u007f]/.test(value)) {
        throw new GitHubOAuthAdapterError();
    }
    return value;
}

function serverTime(clock: GitHubOAuthAdapterDependencies['clock']): number {
    const value = clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - OVERALL_BUDGET_MS) {
        throw new GitHubOAuthAdapterError();
    }
    return value;
}

function remainingTimeout(deadline: number, clock: GitHubOAuthAdapterDependencies['clock']): number {
    const remaining = deadline - serverTime(clock);
    if (remaining <= 0) throw new GitHubOAuthAdapterError();
    return Math.min(REQUEST_TIMEOUT_MS, remaining);
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown>> {
    const contentType = response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get('Content-Length'));
    if (response.body === null) {
        throw new GitHubOAuthAdapterError();
    }
    if (contentType !== 'application/json'
        || (Number.isFinite(declaredLength) && declaredLength > MAXIMUM_RESPONSE_BYTES)) {
        await response.body.cancel();
        throw new GitHubOAuthAdapterError();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > MAXIMUM_RESPONSE_BYTES) throw new GitHubOAuthAdapterError();
            chunks.push(next.value);
        }
    } catch (error) {
        try {
            await reader.cancel();
        } catch {
            // Preserve the bounded-read failure instead of exposing transport details.
        }
        throw error;
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    let value: unknown;
    try {
        value = JSON.parse(decodeUtf8(bytes));
    } catch {
        throw new GitHubOAuthAdapterError();
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new GitHubOAuthAdapterError();
    }
    return value as Record<string, unknown>;
}

function normalizeIdentity(value: Record<string, unknown>): GitHubIdentity {
    if (!Number.isSafeInteger(value.id) || (value.id as number) < 1
        || typeof value.login !== 'string' || value.login.length < 1 || value.login.length > 100
        || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/.test(value.login)) {
        throw new GitHubOAuthAdapterError();
    }
    let displayName: string | null = null;
    if (value.name !== null && value.name !== undefined) {
        if (typeof value.name !== 'string') throw new GitHubOAuthAdapterError();
        const normalized = value.name.trim();
        if (normalized.length > 255 || /[\u0000-\u001f\u007f]/.test(normalized)) {
            throw new GitHubOAuthAdapterError();
        }
        displayName = normalized || null;
    }
    let avatarUrl: string | null = null;
    if (value.avatar_url !== null && value.avatar_url !== undefined) {
        if (typeof value.avatar_url !== 'string' || value.avatar_url.length < 1 || value.avatar_url.length > 2_048) {
            throw new GitHubOAuthAdapterError();
        }
        let avatar: URL;
        try {
            avatar = new URL(value.avatar_url);
        } catch {
            throw new GitHubOAuthAdapterError();
        }
        if (avatar.protocol !== 'https:' || avatar.username || avatar.password) throw new GitHubOAuthAdapterError();
        avatarUrl = avatar.href;
    }
    return Object.freeze({
        provider: 'github',
        providerSubject: String(value.id),
        login: value.login,
        displayName,
        avatarUrl
    });
}

function retryDelay(response: Response, dependencies: GitHubOAuthAdapterDependencies): number {
    const value = response.headers.get('Retry-After');
    if (value !== null && /^\d{1,10}$/.test(value)) {
        return Math.min(Number(value) * 1_000, MAXIMUM_RETRY_DELAY_MS);
    }
    if (value !== null) {
        const date = Date.parse(value);
        if (Number.isFinite(date)) {
            return Math.max(0, Math.min(date - serverTime(dependencies.clock), MAXIMUM_RETRY_DELAY_MS));
        }
    }
    const bytes = dependencies.random.bytes(1);
    if (bytes.byteLength !== 1) throw new GitHubOAuthAdapterError();
    return 250 + bytes[0] % 251;
}

async function exchangeCode(configuration: GitHubOAuthConfiguration, input: GitHubOAuthResolutionInput,
    deadline: number, dependencies: GitHubOAuthAdapterDependencies): Promise<string> {
    let response: Response;
    try {
        response = await dependencies.transport.request(TOKEN_ENDPOINT, {
            // Never follow a cross-origin redirect with the OAuth client secret.
            // `manual` lets the adapter reject a 3xx deterministically instead of
            // turning it into a transport exception in the Workers runtime.
            method: 'POST', redirect: 'manual',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'DocVault-QA-Document-Hub'
            },
            body: new URLSearchParams({
                client_id: configuration.clientId,
                client_secret: configuration.clientSecret,
                code: input.code,
                redirect_uri: input.redirectUri,
                code_verifier: input.pkceVerifier
            }).toString()
        }, remainingTimeout(deadline, dependencies.clock));
    } catch {
        throw new GitHubOAuthAdapterError('token_transport_unavailable');
    }
    if (response.status >= 300 && response.status < 400) {
        try { await response.body?.cancel(); } catch { /* No provider body is trusted on redirects. */ }
        throw new GitHubOAuthAdapterError('token_rejected');
    }
    let payload: Record<string, unknown>;
    try {
        payload = await readBoundedJson(response);
    } catch {
        throw new GitHubOAuthAdapterError('token_response_rejected');
    }
    const failureCategory = tokenFailureCategory(payload);
    if (failureCategory !== null) throw new GitHubOAuthAdapterError(failureCategory);
    if (response.status !== 200) throw new GitHubOAuthAdapterError('token_rejected');
    if (serverTime(dependencies.clock) >= deadline) throw new GitHubOAuthAdapterError();
    if (typeof payload.access_token !== 'string' || !/^[A-Za-z0-9_.-]{1,1024}$/.test(payload.access_token)
        || payload.token_type !== 'bearer') {
        throw new GitHubOAuthAdapterError('token_response_rejected');
    }
    return payload.access_token;
}

async function fetchIdentity(accessToken: string, deadline: number,
    dependencies: GitHubOAuthAdapterDependencies): Promise<GitHubIdentity> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await dependencies.transport.request(IDENTITY_ENDPOINT, {
            // Do not forward the bearer token to a redirect destination.
            method: 'GET', redirect: 'manual',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'DocVault-QA-Document-Hub',
                'X-GitHub-Api-Version': GITHUB_API_VERSION
            }
        }, remainingTimeout(deadline, dependencies.clock));
        if (response.status === 200) {
            let result: GitHubIdentity;
            try {
                result = normalizeIdentity(await readBoundedJson(response));
            } catch {
                throw new GitHubOAuthAdapterError('identity_rejected');
            }
            if (serverTime(dependencies.clock) >= deadline) throw new GitHubOAuthAdapterError();
            return result;
        }
        if (attempt !== 0 || !RETRYABLE_IDENTITY_STATUSES.has(response.status)) {
            throw new GitHubOAuthAdapterError('identity_rejected');
        }
        const delay = retryDelay(response, dependencies);
        if (serverTime(dependencies.clock) + delay >= deadline) throw new GitHubOAuthAdapterError();
        await dependencies.sleep.wait(delay);
    }
    throw new GitHubOAuthAdapterError();
}

export function createGitHubOAuthAdapter(configuration: GitHubOAuthConfiguration,
    dependencies: GitHubOAuthAdapterDependencies = PLATFORM_GITHUB_OAUTH_DEPENDENCIES): GitHubOAuthAdapter {
    const exactConfiguration = Object.freeze({
        clientId: boundedCredential(configuration.clientId, 128),
        clientSecret: boundedCredential(configuration.clientSecret, 512)
    });
    return Object.freeze({
        async resolveIdentity(input: GitHubOAuthResolutionInput): Promise<GitHubIdentity> {
            try {
                if (!/^[A-Za-z0-9_-]{1,512}$/.test(input.code) || input.redirectUri !== CALLBACK_URI) {
                    throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
                }
                decodeBase64Url(input.pkceVerifier, 64);
                const deadline = serverTime(dependencies.clock) + OVERALL_BUDGET_MS;
                const accessToken = await exchangeCode(exactConfiguration, input, deadline, dependencies);
                return await fetchIdentity(accessToken, deadline, dependencies);
            } catch (error) {
                if (error instanceof GitHubOAuthAdapterError) throw error;
                throw new GitHubOAuthAdapterError();
            }
        }
    });
}

export const PLATFORM_GITHUB_HTTP_TRANSPORT: GitHubHttpTransport = Object.freeze({
    async request(url: string, init: RequestInit, timeoutMilliseconds: number): Promise<Response> {
        if (!Number.isInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > REQUEST_TIMEOUT_MS) {
            throw new GitHubOAuthAdapterError();
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }
});

export const PLATFORM_GITHUB_OAUTH_DEPENDENCIES: GitHubOAuthAdapterDependencies = Object.freeze({
    transport: PLATFORM_GITHUB_HTTP_TRANSPORT,
    clock: Object.freeze({ now: () => Date.now() }),
    random: PLATFORM_RANDOM,
    sleep: Object.freeze({
        wait: (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds))
    })
});

export const GITHUB_OAUTH_CONSTANTS = Object.freeze({
    tokenEndpoint: TOKEN_ENDPOINT,
    identityEndpoint: IDENTITY_ENDPOINT,
    callbackUri: CALLBACK_URI,
    apiVersion: GITHUB_API_VERSION,
    requestTimeoutMilliseconds: REQUEST_TIMEOUT_MS,
    overallBudgetMilliseconds: OVERALL_BUDGET_MS,
    maximumRetryDelayMilliseconds: MAXIMUM_RETRY_DELAY_MS,
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES
});
