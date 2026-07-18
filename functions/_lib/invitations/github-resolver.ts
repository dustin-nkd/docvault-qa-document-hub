const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_API = 'https://api.github.com';
const API_VERSION = '2026-03-10';
const MAXIMUM_RESPONSE_BYTES = 8_192;
const REQUEST_TIMEOUT_MS = 5_000;

export interface ResolvedInvitationIdentity {
    readonly provider: 'github';
    readonly providerSubject: string;
    readonly login: string;
}

export interface InvitationIdentityResolver {
    resolveLogin(login: string): Promise<ResolvedInvitationIdentity>;
}

export interface GitHubInvitationResolverConfiguration {
    readonly accessToken: string;
}

export interface GitHubInvitationResolverDependencies {
    readonly request: (url: string, init: RequestInit, timeoutMilliseconds: number) => Promise<Response>;
}

export class InvitationProviderError extends Error {
    readonly code: 'INVITATION_TARGET_UNAVAILABLE' | 'INVITATION_PROVIDER_UNAVAILABLE';

    constructor(code: InvitationProviderError['code']) {
        super(code);
        this.name = 'InvitationProviderError';
        this.code = code;
    }
}

export function normalizeGitHubLogin(value: string): string {
    const login = typeof value === 'string' ? value.trim() : '';
    if (!GITHUB_LOGIN.test(login) || login.includes('--')) {
        throw new InvitationProviderError('INVITATION_TARGET_UNAVAILABLE');
    }
    return login.toLowerCase();
}

async function readBoundedJson(response: Response): Promise<Record<string, unknown>> {
    const declared = Number(response.headers.get('Content-Length'));
    if (response.body === null || (Number.isFinite(declared) && declared > MAXIMUM_RESPONSE_BYTES)
        || response.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        if (response.body !== null) await response.body.cancel();
        throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > MAXIMUM_RESPONSE_BYTES) {
                await reader.cancel();
                throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
            }
            chunks.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        const value: unknown = JSON.parse(new TextDecoder('utf-8', {
            fatal: true, ignoreBOM: false
        }).decode(bytes));
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error();
        return value as Record<string, unknown>;
    } catch {
        throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
    }
}

function normalizeIdentity(value: Record<string, unknown>): ResolvedInvitationIdentity {
    if (!Number.isSafeInteger(value.id) || (value.id as number) < 1
        || typeof value.login !== 'string' || !GITHUB_LOGIN.test(value.login) || value.login.includes('--')) {
        throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
    }
    return Object.freeze({ provider: 'github', providerSubject: String(value.id), login: value.login });
}

export function createGitHubInvitationResolver(
    configuration: GitHubInvitationResolverConfiguration,
    dependencies: GitHubInvitationResolverDependencies = PLATFORM_GITHUB_INVITATION_DEPENDENCIES
): InvitationIdentityResolver {
    if (typeof configuration.accessToken !== 'string' || configuration.accessToken.length < 1
        || configuration.accessToken.length > 512 || /[\u0000-\u0020\u007f]/.test(configuration.accessToken)) {
        throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
    }
    return Object.freeze({
        async resolveLogin(input: string): Promise<ResolvedInvitationIdentity> {
            const login = normalizeGitHubLogin(input);
            let response: Response;
            try {
                response = await dependencies.request(`${GITHUB_API}/users/${encodeURIComponent(login)}`, {
                    method: 'GET', redirect: 'manual', headers: {
                        Accept: 'application/vnd.github+json',
                        Authorization: `Bearer ${configuration.accessToken}`,
                        'User-Agent': 'DocVault-QA-Document-Hub',
                        'X-GitHub-Api-Version': API_VERSION
                    }
                }, REQUEST_TIMEOUT_MS);
            } catch {
                throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
            }
            if (response.status === 404) throw new InvitationProviderError('INVITATION_TARGET_UNAVAILABLE');
            if (response.status !== 200 || response.url && !response.url.startsWith(`${GITHUB_API}/`)) {
                throw new InvitationProviderError('INVITATION_PROVIDER_UNAVAILABLE');
            }
            return normalizeIdentity(await readBoundedJson(response));
        }
    });
}

export const PLATFORM_GITHUB_INVITATION_DEPENDENCIES: GitHubInvitationResolverDependencies = Object.freeze({
    async request(url: string, init: RequestInit, timeoutMilliseconds: number): Promise<Response> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
        try {
            return await fetch(url, { ...init, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }
    }
});

export const GITHUB_INVITATION_RESOLVER_CONSTANTS = Object.freeze({
    apiOrigin: GITHUB_API,
    apiVersion: API_VERSION,
    maximumResponseBytes: MAXIMUM_RESPONSE_BYTES,
    requestTimeoutMilliseconds: REQUEST_TIMEOUT_MS
});
