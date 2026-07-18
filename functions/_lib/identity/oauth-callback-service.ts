import { openAuthorizationSession, type AuthorizationSessionSource } from '../persistence/authorization-session';
import { digestSessionToken, generateOpaqueToken, type IdentityKeyring } from './crypto';
import { GitHubOAuthAdapterError, type GitHubOAuthAdapter } from './github-oauth-adapter';
import { commitOAuthCallback, type OAuthCallbackCommitResult } from './oauth-callback-repository';
import {
    OAUTH_TRANSACTION_CONSTANTS,
    validateOAuthTransactionForCallback,
    validatedOAuthCallbackContext,
    type OAuthTransactionCheckpoint,
    type OAuthTransactionDependencies
} from './oauth-transaction-service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_IDLE_MS = 43_200_000;
const SESSION_ABSOLUTE_MS = 604_800_000;

export type OAuthCallbackCheckpoint =
    | 'oauth.callback.before-provider'
    | 'oauth.callback.after-provider'
    | 'oauth.callback.before-batch';

export interface OAuthCallbackDependencies extends OAuthTransactionDependencies {
    readonly failures: {
        checkpoint(name: OAuthTransactionCheckpoint | OAuthCallbackCheckpoint): void | Promise<void>;
    };
}

export interface CompleteOAuthCallbackInput {
    readonly oauthTransactionKey: IdentityKeyring;
    readonly sessionTokenPepper: IdentityKeyring;
    readonly provider: GitHubOAuthAdapter;
    readonly state: string;
    readonly code: string;
    readonly callbackOrigin: string;
}

export interface CompletedOAuthCallback extends OAuthCallbackCommitResult {
    readonly sessionToken: string;
    readonly purpose: 'sign_in' | 'reauthenticate';
    readonly returnPath: string;
}

export class OAuthCallbackError extends Error {
    readonly code = 'OAUTH_CALLBACK_FAILED' as const;
    declare readonly outcome: 'rejected' | 'provider_credentials_rejected' | 'provider_redirect_rejected'
        | 'provider_verification_rejected' | 'provider_token_rejected' | 'provider_token_response_rejected'
        | 'provider_identity_rejected' | 'provider_unavailable' | 'internal_error';

    constructor(outcome: OAuthCallbackError['outcome'] = 'internal_error') {
        super('OAUTH_CALLBACK_FAILED');
        this.name = 'OAuthCallbackError';
        Object.defineProperty(this, 'outcome', { value: outcome, enumerable: false });
    }
}

function providerOutcome(error: unknown): OAuthCallbackError['outcome'] {
    if (!(error instanceof GitHubOAuthAdapterError)) return 'provider_unavailable';
    switch (error.category) {
        case 'credentials_rejected': return 'provider_credentials_rejected';
        case 'redirect_rejected': return 'provider_redirect_rejected';
        case 'verification_rejected': return 'provider_verification_rejected';
        case 'token_rejected': return 'provider_token_rejected';
        case 'token_response_rejected': return 'provider_token_response_rejected';
        case 'identity_rejected': return 'provider_identity_rejected';
        default: return 'provider_unavailable';
    }
}

function serverTime(dependencies: OAuthCallbackDependencies): number {
    const value = dependencies.clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - SESSION_ABSOLUTE_MS) {
        throw new OAuthCallbackError();
    }
    return value;
}

function uuid(dependencies: OAuthCallbackDependencies): string {
    const value = dependencies.ids.uuid();
    if (!UUID_V4.test(value)) throw new OAuthCallbackError();
    return value;
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
    return Uint8Array.from(bytes).buffer;
}

export async function completeOAuthCallback(database: AuthorizationSessionSource,
    input: CompleteOAuthCallbackInput, dependencies: OAuthCallbackDependencies): Promise<CompletedOAuthCallback> {
    let outcome: OAuthCallbackError['outcome'] = 'rejected';
    try {
        const validated = await validateOAuthTransactionForCallback(database, {
            keyring: input.oauthTransactionKey,
            state: input.state,
            expectedCallbackOrigin: input.callbackOrigin
        }, dependencies);
        const context = validatedOAuthCallbackContext(validated);
        await dependencies.failures.checkpoint('oauth.callback.before-provider');
        outcome = 'provider_unavailable';
        const identity = await input.provider.resolveIdentity({
            code: input.code,
            redirectUri: `${OAUTH_TRANSACTION_CONSTANTS.callbackOrigin}${OAUTH_TRANSACTION_CONSTANTS.callbackPath}`,
            pkceVerifier: context.verifier
        });
        await dependencies.failures.checkpoint('oauth.callback.after-provider');

        outcome = 'internal_error';
        const committedAt = serverTime(dependencies);
        const candidateUserId = uuid(dependencies);
        const sessionId = uuid(dependencies);
        const sessionToken = generateOpaqueToken(32, dependencies.random);
        const { digest } = await digestSessionToken(input.sessionTokenPepper, sessionToken);
        await dependencies.failures.checkpoint('oauth.callback.before-batch');
        const committed = await commitOAuthCallback(openAuthorizationSession(database), {
            transaction: context.record,
            purpose: validated.purpose,
            identity,
            candidateUserId,
            sessionId,
            sessionTokenDigest: bytesBuffer(digest),
            initiatingSessionId: validated.initiatingSessionId,
            initiatingUserId: validated.initiatingUserId,
            serverTime: committedAt,
            idleExpiresAt: committedAt + SESSION_IDLE_MS,
            absoluteExpiresAt: committedAt + SESSION_ABSOLUTE_MS
        });
        return Object.freeze({
            ...committed,
            sessionToken,
            purpose: validated.purpose,
            returnPath: validated.returnPath
        });
    } catch (error) {
        if (outcome === 'provider_unavailable') outcome = providerOutcome(error);
        throw new OAuthCallbackError(outcome);
    }
}

export const OAUTH_CALLBACK_CONSTANTS = Object.freeze({
    sessionIdleMilliseconds: SESSION_IDLE_MS,
    sessionAbsoluteMilliseconds: SESSION_ABSOLUTE_MS
});
