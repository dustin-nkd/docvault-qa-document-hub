import { openAuthorizationSession, type AuthorizationSessionSource } from '../persistence/authorization-session';
import { createPkcePair, type IdentityKeyring, type RandomBytesSource } from './crypto';
import { IdentityPrimitiveError } from './encoding';
import { IDENTITY_ENVIRONMENT_CONSTANTS } from './environment';
import {
    decryptOAuthEnvelope, digestOAuthState, digestOAuthStateCandidates, encryptOAuthEnvelope,
    generateOAuthState,
    type OAuthTransactionPayload
} from './oauth-envelope';
import {
    cleanupOAuthTransactions, consumeOAuthTransaction, findPendingOAuthTransaction,
    insertOAuthTransaction, type OAuthTransactionCleanupResult, type OAuthTransactionRecord
} from './oauth-transaction-repository';

const TRANSACTION_TTL_MS = 600_000;
const CALLBACK_PATH = '/api/v1/oauth/github/callback';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const validatedRecord: unique symbol = Symbol('validated-oauth-transaction-record');

export type OAuthTransactionCheckpoint =
    | 'oauth.create.before-insert'
    | 'oauth.lookup.after-read'
    | 'oauth.consume.before-cas'
    | 'oauth.cleanup.before-batch';

export interface OAuthTransactionDependencies {
    readonly clock: { now(): number };
    readonly ids: { uuid(): string };
    readonly random: RandomBytesSource;
    readonly failures: { checkpoint(name: OAuthTransactionCheckpoint): void | Promise<void> };
}

export interface CreateOAuthTransactionInput {
    readonly keyring: IdentityKeyring;
    readonly purpose: 'sign_in' | 'reauthenticate';
    readonly returnPath?: string;
    readonly invitationId?: string | null;
    readonly initiatingSessionId?: string | null;
    readonly initiatingUserId?: string | null;
}

export interface CreatedOAuthTransaction {
    readonly transactionId: string;
    readonly state: string;
    readonly codeChallenge: string;
    readonly codeChallengeMethod: 'S256';
    readonly expiresAt: number;
}

export interface ValidatedOAuthTransaction {
    readonly transactionId: string;
    readonly purpose: 'sign_in' | 'reauthenticate';
    readonly returnPath: string;
    readonly invitationId: string | null;
    readonly initiatingSessionId: string | null;
    readonly initiatingUserId: string | null;
    readonly createdAt: number;
    readonly expiresAt: number;
    readonly [validatedRecord]: OAuthTransactionRecord;
}

export class OAuthTransactionLifecycleError extends Error {
    readonly code: 'OAUTH_TRANSACTION_INVALID' | 'OAUTH_TRANSACTION_UNAVAILABLE';

    constructor(code: OAuthTransactionLifecycleError['code']) {
        super(code);
        this.name = 'OAuthTransactionLifecycleError';
        this.code = code;
    }
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
    return Uint8Array.from(bytes).buffer;
}

function now(dependencies: OAuthTransactionDependencies): number {
    const value = dependencies.clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - TRANSACTION_TTL_MS) {
        throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    }
    return value;
}

function uuid(dependencies: OAuthTransactionDependencies): string {
    const value = dependencies.ids.uuid();
    if (!UUID_V4.test(value)) throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
    return value;
}

export async function createOAuthTransaction(database: AuthorizationSessionSource,
    input: CreateOAuthTransactionInput, dependencies: OAuthTransactionDependencies): Promise<CreatedOAuthTransaction> {
    try {
        const createdAt = now(dependencies);
        const expiresAt = createdAt + TRANSACTION_TTL_MS;
        const transactionId = uuid(dependencies);
        const state = generateOAuthState(dependencies.random);
        const pkce = await createPkcePair(dependencies.random);
        const payload: OAuthTransactionPayload = {
            verifier: pkce.verifier,
            purpose: input.purpose,
            returnPath: input.returnPath ?? '/',
            initiatingSessionId: input.initiatingSessionId ?? null,
            initiatingUserId: input.initiatingUserId ?? null
        };
        const aad = {
            transactionId,
            callbackOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin,
            callbackPath: CALLBACK_PATH,
            createdAt,
            expiresAt
        } as const;
        const [{ digest }, encryptedEnvelope] = await Promise.all([
            digestOAuthState(input.keyring, state),
            encryptOAuthEnvelope(input.keyring, payload, aad, dependencies.random)
        ]);
        await dependencies.failures.checkpoint('oauth.create.before-insert');
        await insertOAuthTransaction(openAuthorizationSession(database), {
            id: transactionId,
            stateDigest: bytesBuffer(digest),
            encryptedEnvelope: bytesBuffer(encryptedEnvelope),
            callbackOrigin: aad.callbackOrigin,
            callbackPath: aad.callbackPath,
            invitationId: input.invitationId ?? null,
            createdAt,
            expiresAt
        });
        return Object.freeze({
            transactionId,
            state,
            codeChallenge: pkce.challenge,
            codeChallengeMethod: pkce.method,
            expiresAt
        });
    } catch {
        throw new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_UNAVAILABLE');
    }
}

export async function validateOAuthTransaction(database: AuthorizationSessionSource, input: {
    readonly keyring: IdentityKeyring;
    readonly state: string;
    readonly expectedPurpose: 'sign_in' | 'reauthenticate';
    readonly expectedCallbackOrigin: string;
}, dependencies: OAuthTransactionDependencies): Promise<ValidatedOAuthTransaction> {
    try {
        if (input.expectedCallbackOrigin !== IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const serverTime = now(dependencies);
        const candidates = await digestOAuthStateCandidates(input.keyring, input.state);
        const record = await findPendingOAuthTransaction(openAuthorizationSession(database),
            candidates.map(candidate => bytesBuffer(candidate.digest)), serverTime);
        await dependencies.failures.checkpoint('oauth.lookup.after-read');
        if (record.callbackOrigin !== input.expectedCallbackOrigin || record.callbackPath !== CALLBACK_PATH) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const payload = await decryptOAuthEnvelope(input.keyring, new Uint8Array(record.encryptedEnvelope), {
            transactionId: record.id,
            callbackOrigin: record.callbackOrigin,
            callbackPath: record.callbackPath,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt
        });
        if (payload.purpose !== input.expectedPurpose) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        return Object.freeze({
            transactionId: record.id,
            purpose: payload.purpose,
            returnPath: payload.returnPath,
            invitationId: record.invitationId,
            initiatingSessionId: payload.initiatingSessionId,
            initiatingUserId: payload.initiatingUserId,
            createdAt: record.createdAt,
            expiresAt: record.expiresAt,
            [validatedRecord]: record
        });
    } catch {
        throw new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_INVALID');
    }
}

export async function consumeValidatedOAuthTransaction(database: AuthorizationSessionSource,
    transaction: ValidatedOAuthTransaction, dependencies: OAuthTransactionDependencies): Promise<void> {
    try {
        const record = transaction[validatedRecord];
        if (!record || transaction.transactionId !== record.id) {
            throw new IdentityPrimitiveError('IDENTITY_CRYPTO_INVALID');
        }
        const serverTime = now(dependencies);
        await dependencies.failures.checkpoint('oauth.consume.before-cas');
        await consumeOAuthTransaction(openAuthorizationSession(database), record, serverTime);
    } catch {
        throw new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_INVALID');
    }
}

export async function cleanupExpiredOAuthTransactions(database: AuthorizationSessionSource,
    maximumRows: number, dependencies: OAuthTransactionDependencies): Promise<OAuthTransactionCleanupResult> {
    try {
        const serverTime = now(dependencies);
        await dependencies.failures.checkpoint('oauth.cleanup.before-batch');
        return await cleanupOAuthTransactions(openAuthorizationSession(database), serverTime, maximumRows);
    } catch {
        throw new OAuthTransactionLifecycleError('OAUTH_TRANSACTION_UNAVAILABLE');
    }
}

export const OAUTH_TRANSACTION_CONSTANTS = Object.freeze({
    transactionTtlMilliseconds: TRANSACTION_TTL_MS,
    callbackPath: CALLBACK_PATH,
    callbackOrigin: IDENTITY_ENVIRONMENT_CONSTANTS.previewOrigin
});
