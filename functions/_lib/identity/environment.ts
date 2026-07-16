import { IdentityPrimitiveError } from './encoding';
import { parseIdentityKeyring, type IdentityKeyring } from './crypto';

export type IdentityRuntimeMode = 'disabled' | 'local-test-only' | 'preview-only';

export interface IdentityEnvironmentInput {
    readonly APP_ENV?: string;
    readonly IDENTITY_RUNTIME_MODE?: string;
    readonly COLLABORATION_ENABLED?: string;
    readonly GITHUB_OAUTH_CLIENT_ID?: string;
    readonly GITHUB_OAUTH_CLIENT_SECRET?: string;
    readonly OAUTH_TRANSACTION_KEY?: string;
    readonly SESSION_TOKEN_PEPPER?: string;
    readonly CSRF_TOKEN_KEY?: string;
    readonly RATE_LIMIT_KEY?: string;
    readonly PREVIEW_ALLOWED_GITHUB_SUBJECTS?: string;
}

export interface IdentitySecrets {
    readonly githubClientId: string;
    readonly githubClientSecret: string;
    readonly oauthTransactionKey: IdentityKeyring;
    readonly sessionTokenPepper: IdentityKeyring;
    readonly csrfTokenKey: IdentityKeyring;
    readonly rateLimitKey: IdentityKeyring;
}

export type IdentityRuntimeConfiguration = {
    readonly enabled: false;
    readonly mode: 'disabled';
} | {
    readonly enabled: true;
    readonly mode: 'preview-only' | 'local-test-only';
    readonly cookieName: '__Host-docvault-preview-session';
    readonly secrets: IdentitySecrets;
};

const PREVIEW_ORIGIN = 'https://codex-cf-p3-preview.docvault-qa-document-hub.pages.dev';

function boundedCredential(value: string | undefined, maximum: number): string {
    if (typeof value !== 'string' || value.length < 1 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new IdentityPrimitiveError('IDENTITY_CONFIGURATION_INVALID');
    }
    return value;
}

export function validateIdentitySecrets(input: IdentityEnvironmentInput): IdentitySecrets {
    return Object.freeze({
        githubClientId: boundedCredential(input.GITHUB_OAUTH_CLIENT_ID, 128),
        githubClientSecret: boundedCredential(input.GITHUB_OAUTH_CLIENT_SECRET, 512),
        oauthTransactionKey: parseIdentityKeyring(boundedCredential(input.OAUTH_TRANSACTION_KEY, 1_024)),
        sessionTokenPepper: parseIdentityKeyring(boundedCredential(input.SESSION_TOKEN_PEPPER, 1_024)),
        csrfTokenKey: parseIdentityKeyring(boundedCredential(input.CSRF_TOKEN_KEY, 1_024)),
        rateLimitKey: parseIdentityKeyring(boundedCredential(input.RATE_LIMIT_KEY, 1_024))
    });
}

export function resolveIdentityRuntime(input: IdentityEnvironmentInput, options: {
    readonly requestOrigin: string;
    readonly hasCollaborationDatabase: boolean;
    readonly allowLocalTestMode?: boolean;
}): IdentityRuntimeConfiguration {
    const mode = input.IDENTITY_RUNTIME_MODE ?? 'disabled';
    if (mode !== 'disabled' && mode !== 'local-test-only' && mode !== 'preview-only') {
        return { enabled: false, mode: 'disabled' };
    }
    if (mode === 'disabled' || input.COLLABORATION_ENABLED !== 'false') {
        return { enabled: false, mode: 'disabled' };
    }
    const previewValid = mode === 'preview-only' && input.APP_ENV === 'preview'
        && options.requestOrigin === PREVIEW_ORIGIN && options.hasCollaborationDatabase;
    const localValid = mode === 'local-test-only' && input.APP_ENV === 'local'
        && options.allowLocalTestMode === true && options.hasCollaborationDatabase;
    if (!previewValid && !localValid) return { enabled: false, mode: 'disabled' };
    try {
        return Object.freeze({
            enabled: true,
            mode,
            cookieName: '__Host-docvault-preview-session',
            secrets: validateIdentitySecrets(input)
        });
    } catch {
        return { enabled: false, mode: 'disabled' };
    }
}

export const IDENTITY_ENVIRONMENT_CONSTANTS = Object.freeze({ previewOrigin: PREVIEW_ORIGIN });
