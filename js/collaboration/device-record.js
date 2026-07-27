// Local persistence for this browser's registered device (CF-P7-013 gap).
//
// `device-key-lifecycle.js` protects the private key; this remembers the two
// things a returning session needs that are not secret and not stored there:
// which device this browser is (`deviceId`, `fingerprint`, `state`) and the
// device's own public key, needed to seal a workspace envelope to this device
// again without re-deriving it from a non-extractable private key.
//
// The unlock secret is generated here and stored alongside, per the accepted
// MVP tradeoff: no passphrase prompt exists on this surface yet, so a device
// that is set up stays usable on this browser without one. Losing this browser
// storage loses the local key; it never loses server-side data, since every
// other device provisions its own copy independently.

const ENVIRONMENTS = Object.freeze(['local', 'local-browser-test', 'preview', 'production']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DEVICE_STATES = Object.freeze(['active', 'revoked']);

export class DeviceRecordError extends Error {
    /** @param {string} code */
    constructor(code) {
        super(code);
        this.name = 'DeviceRecordError';
        this.code = code;
    }
}

const fail = code => { throw new DeviceRecordError(code); };

function recordKey({ environment, subject }) {
    if (!ENVIRONMENTS.includes(environment)) fail('INVALID_ENVIRONMENT');
    if (typeof subject !== 'string' || subject.trim().length === 0) fail('INVALID_SUBJECT');
    return ['docvault', 'collab', environment, subject, 'device'].join(':');
}

function isCanonicalPublicJwk(value) {
    return Boolean(value) && typeof value === 'object'
        && value.kty === 'EC' && value.crv === 'P-256' && value.ext === true
        && Array.isArray(value.key_ops) && value.key_ops.length === 0
        && typeof value.x === 'string' && typeof value.y === 'string';
}

function isValidRecord(value) {
    return Boolean(value) && typeof value === 'object'
        && UUID_V4.test(value.deviceId ?? '')
        && typeof value.fingerprint === 'string' && value.fingerprint.length > 0
        && DEVICE_STATES.includes(value.state)
        && isCanonicalPublicJwk(value.publicJwk)
        && typeof value.unlockSecret === 'string' && value.unlockSecret.length > 0;
}

/**
 * Read and write the one device record this browser holds for one subject.
 *
 * @param {{storage: Storage, environment: string, subject: string}} input
 */
export function createDeviceRecordStore({ storage, environment, subject } = {}) {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        fail('STORAGE_UNAVAILABLE');
    }
    const key = recordKey({ environment, subject });
    return Object.freeze({
        key,
        read() {
            let raw = null;
            try {
                raw = storage.getItem(key);
            } catch {
                return null;
            }
            if (typeof raw !== 'string') return null;
            let value = null;
            try {
                value = JSON.parse(raw);
            } catch {
                return null;
            }
            return isValidRecord(value) ? value : null;
        },
        write(record) {
            if (!isValidRecord(record)) fail('INVALID_RECORD');
            try {
                storage.setItem(key, JSON.stringify(record));
                return true;
            } catch {
                return false;
            }
        },
        clear() {
            try {
                storage.removeItem(key);
                return true;
            } catch {
                return false;
            }
        }
    });
}

/** A fresh 32-byte unlock secret, base64url-encoded for storage. */
export function newUnlockSecret(platformCrypto = globalThis.crypto) {
    const bytes = platformCrypto.getRandomValues(new Uint8Array(32));
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    bytes.fill(0);
    return encoded;
}

/** The inverse of {@link newUnlockSecret}, back into raw bytes. */
export function decodeUnlockSecret(value) {
    if (typeof value !== 'string' || value.length === 0) fail('INVALID_SECRET');
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    let binary;
    try {
        binary = atob(padded);
    } catch {
        return fail('INVALID_SECRET');
    }
    return Uint8Array.from(binary, character => character.charCodeAt(0));
}
