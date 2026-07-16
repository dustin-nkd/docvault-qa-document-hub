import { openAuthorizationSession, type AuthorizationSessionSource } from '../persistence/authorization-session';
import { expireSessionCookie, readSessionCookie, serializeSessionCookie, type SessionCookieName } from './cookies';
import {
    digestSessionToken,
    generateOpaqueToken,
    sessionTokenDigestCandidates,
    type IdentityKeyring,
    type RandomBytesSource
} from './crypto';
import {
    findSessionByDigests,
    revokeSession,
    rotateSessionAtomically,
    touchSession,
    type SessionRecord,
    type SessionRevocationReason
} from './session-repository';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SESSION_IDLE_MS = 43_200_000;
const RECENT_AUTH_MS = 900_000;
const LAST_SEEN_COALESCE_MS = 300_000;

export interface SessionLifecycleDependencies {
    readonly clock: { now(): number };
    readonly ids: { uuid(): string };
    readonly random: RandomBytesSource;
    readonly failures: {
        checkpoint(name: SessionLifecycleCheckpoint): void | Promise<void>;
    };
}

export type SessionLifecycleCheckpoint =
    | 'session.lookup.before-read'
    | 'session.lookup.before-touch'
    | 'session.rotation.before-batch'
    | 'session.logout.before-revoke';

export interface SessionLifecycleInput {
    readonly sessionTokenPepper: IdentityKeyring;
    readonly cookieName: SessionCookieName;
    readonly coalesceActivity?: boolean;
}

export interface AuthenticatedSession {
    readonly authenticated: true;
    readonly sessionId: string;
    readonly userId: string;
    readonly providerSubject: string;
    readonly login: string;
    readonly displayName: string | null;
    readonly avatarUrl: string | null;
    readonly createdAt: number;
    readonly authenticatedAt: number;
    readonly recentlyAuthenticated: boolean;
    readonly idleExpiresAt: number;
    readonly absoluteExpiresAt: number;
    readonly setCookie: string | null;
}

export interface UnauthenticatedSession {
    readonly authenticated: false;
    readonly clearCookie: boolean;
}

export type ResolvedSession = AuthenticatedSession | UnauthenticatedSession;

export class SessionLifecycleError extends Error {
    readonly code = 'SESSION_LIFECYCLE_FAILED' as const;

    constructor() {
        super('SESSION_LIFECYCLE_FAILED');
        this.name = 'SessionLifecycleError';
    }
}

function serverTime(dependencies: SessionLifecycleDependencies): number {
    const value = dependencies.clock.now();
    if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - SESSION_IDLE_MS) {
        throw new SessionLifecycleError();
    }
    return value;
}

function uuid(dependencies: SessionLifecycleDependencies): string {
    const value = dependencies.ids.uuid();
    if (!UUID_V4.test(value)) throw new SessionLifecycleError();
    return value;
}

function bytesBuffer(bytes: Uint8Array): ArrayBuffer {
    return Uint8Array.from(bytes).buffer;
}

function unauthenticated(clearCookie: boolean): UnauthenticatedSession {
    return Object.freeze({ authenticated: false, clearCookie });
}

function live(record: SessionRecord, now: number): boolean {
    return record.revokedAt === null && record.userStatus === 'active'
        && record.createdAt <= now && record.lastSeenAt <= now && record.authenticatedAt <= now
        && record.idleExpiresAt > now && record.absoluteExpiresAt > now;
}

function resolved(record: SessionRecord, now: number, setCookie: string | null): AuthenticatedSession {
    return Object.freeze({
        authenticated: true,
        sessionId: record.id,
        userId: record.userId,
        providerSubject: record.providerSubject,
        login: record.login,
        displayName: record.displayName,
        avatarUrl: record.avatarUrl,
        createdAt: record.createdAt,
        authenticatedAt: record.authenticatedAt,
        recentlyAuthenticated: now - record.authenticatedAt <= RECENT_AUTH_MS,
        idleExpiresAt: record.idleExpiresAt,
        absoluteExpiresAt: record.absoluteExpiresAt,
        setCookie
    });
}

async function digestBuffers(keyring: IdentityKeyring, token: string): Promise<readonly ArrayBuffer[]> {
    const candidates = await sessionTokenDigestCandidates(keyring, token);
    if (candidates.length < 1 || candidates.length > 2 || candidates[0].keyId !== keyring.activeKeyId) {
        throw new SessionLifecycleError();
    }
    return candidates.map(candidate => bytesBuffer(candidate.digest));
}

async function lookup(database: D1DatabaseSession, keyring: IdentityKeyring, token: string,
    dependencies: SessionLifecycleDependencies): Promise<SessionRecord | null> {
    await dependencies.failures.checkpoint('session.lookup.before-read');
    return findSessionByDigests(database, await digestBuffers(keyring, token));
}

async function rotate(database: D1DatabaseSession, input: SessionLifecycleInput, record: SessionRecord,
    now: number, reason: Exclude<SessionRevocationReason, 'logout'>,
    dependencies: SessionLifecycleDependencies): Promise<AuthenticatedSession> {
    const successorId = uuid(dependencies);
    const successorToken = generateOpaqueToken(32, dependencies.random);
    const { digest } = await digestSessionToken(input.sessionTokenPepper, successorToken);
    const successorIdleExpiresAt = Math.min(now + SESSION_IDLE_MS, record.absoluteExpiresAt);
    await dependencies.failures.checkpoint('session.rotation.before-batch');
    const successor = await rotateSessionAtomically(database, {
        predecessor: record,
        successorId,
        successorTokenDigest: bytesBuffer(digest),
        serverTime: now,
        successorIdleExpiresAt,
        reason
    });
    return resolved(successor, now,
        serializeSessionCookie(input.cookieName, successorToken, successor.absoluteExpiresAt));
}

export async function resolveSessionToken(database: AuthorizationSessionSource,
    input: SessionLifecycleInput & { readonly token: string },
    dependencies: SessionLifecycleDependencies): Promise<ResolvedSession> {
    try {
        const now = serverTime(dependencies);
        const session = openAuthorizationSession(database);
        let record = await lookup(session, input.sessionTokenPepper, input.token, dependencies);
        if (record === null || !live(record, now)) return unauthenticated(true);

        if (record.digestSlot === 1) {
            return await rotate(session, input, record, now, 'pepper_rotation', dependencies);
        }
        if (input.coalesceActivity !== false && now - record.lastSeenAt >= LAST_SEEN_COALESCE_MS) {
            await dependencies.failures.checkpoint('session.lookup.before-touch');
            const idleExpiresAt = Math.min(now + SESSION_IDLE_MS, record.absoluteExpiresAt);
            const touched = await touchSession(session, record, now, idleExpiresAt);
            if (touched) {
                record = Object.freeze({ ...record, lastSeenAt: now, idleExpiresAt });
            } else {
                const reread = await lookup(session, input.sessionTokenPepper, input.token, dependencies);
                if (reread === null || reread.digestSlot !== 0 || !live(reread, now)) {
                    return unauthenticated(true);
                }
                record = reread;
            }
        }
        return resolved(record, now, null);
    } catch (error) {
        if (error instanceof SessionLifecycleError) throw error;
        if (error instanceof Error && error.name === 'IdentityPrimitiveError') return unauthenticated(true);
        throw new SessionLifecycleError();
    }
}

function containsCookie(header: string | null, name: SessionCookieName): boolean {
    return header !== null && header.length <= 8_192 && header.split(';')
        .some(part => part.trimStart().startsWith(`${name}=`));
}

export async function resolveSessionCookie(database: AuthorizationSessionSource,
    input: SessionLifecycleInput & { readonly cookieHeader: string | null },
    dependencies: SessionLifecycleDependencies): Promise<ResolvedSession> {
    const token = readSessionCookie(input.cookieHeader, input.cookieName);
    if (token === null) return unauthenticated(containsCookie(input.cookieHeader, input.cookieName));
    return resolveSessionToken(database, { ...input, token }, dependencies);
}

export async function rotateLiveSession(database: AuthorizationSessionSource,
    input: SessionLifecycleInput & {
        readonly token: string;
        readonly reason: 'security_rotation' | 'fixation_risk';
    }, dependencies: SessionLifecycleDependencies): Promise<ResolvedSession> {
    try {
        const now = serverTime(dependencies);
        const session = openAuthorizationSession(database);
        const record = await lookup(session, input.sessionTokenPepper, input.token, dependencies);
        if (record === null || !live(record, now)) return unauthenticated(true);
        return await rotate(session, input, record, now, input.reason, dependencies);
    } catch (error) {
        if (error instanceof Error && error.name === 'IdentityPrimitiveError') return unauthenticated(true);
        throw new SessionLifecycleError();
    }
}

export async function logoutSession(database: AuthorizationSessionSource,
    input: SessionLifecycleInput & { readonly token: string },
    dependencies: SessionLifecycleDependencies): Promise<{ readonly revoked: boolean; readonly setCookie: string }> {
    try {
        const now = serverTime(dependencies);
        const session = openAuthorizationSession(database);
        const record = await lookup(session, input.sessionTokenPepper, input.token, dependencies);
        if (record === null || !live(record, now)) {
            return Object.freeze({ revoked: false, setCookie: expireSessionCookie(input.cookieName) });
        }
        await dependencies.failures.checkpoint('session.logout.before-revoke');
        const revoked = await revokeSession(session, record, now);
        return Object.freeze({ revoked, setCookie: expireSessionCookie(input.cookieName) });
    } catch (error) {
        if (error instanceof Error && error.name === 'IdentityPrimitiveError') {
            return Object.freeze({ revoked: false, setCookie: expireSessionCookie(input.cookieName) });
        }
        throw new SessionLifecycleError();
    }
}

export function hasRecentAuthentication(session: ResolvedSession): boolean {
    return session.authenticated && session.recentlyAuthenticated;
}

export const SESSION_LIFECYCLE_CONSTANTS = Object.freeze({
    idleMilliseconds: SESSION_IDLE_MS,
    recentAuthenticationMilliseconds: RECENT_AUTH_MS,
    lastSeenCoalescingMilliseconds: LAST_SEEN_COALESCE_MS,
    maximumDigestCandidates: 2,
    maximumLookupReads: 2,
    maximumLookupWrites: 1
});
