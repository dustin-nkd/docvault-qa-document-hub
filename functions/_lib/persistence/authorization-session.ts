import { PersistenceError } from './repository';

const serverBookmarkBrand: unique symbol = Symbol('server-bookmark');

export interface ServerBookmark {
    readonly value: string;
    readonly [serverBookmarkBrand]: true;
}

export interface AuthorizationSessionSource {
    withSession(constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession;
}

function isValidBookmark(value: string): boolean {
    return value.length >= 1 && value.length <= 1024 && /^[A-Za-z0-9_+=:./-]+$/.test(value);
}

export function captureServerBookmark(session: Pick<D1DatabaseSession, 'getBookmark'>): ServerBookmark | null {
    const value = session.getBookmark();
    if (value === null) return null;
    if (!isValidBookmark(value)) throw new PersistenceError('PERSISTENCE_INTEGRITY');
    return { value, [serverBookmarkBrand]: true };
}

export function openAuthorizationSession(
    source: AuthorizationSessionSource,
    bookmark?: ServerBookmark
): D1DatabaseSession {
    if (bookmark !== undefined && (!isValidBookmark(bookmark.value)
        || bookmark[serverBookmarkBrand] !== true)) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    return source.withSession(bookmark?.value ?? 'first-primary');
}
