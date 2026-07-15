const MAX_RANDOM_BYTES = 65_536;
const DEFAULT_TOKEN_BYTES = 32;

export class PlatformCapabilityUnavailableError extends Error {
    /** @param {string} capability */
    constructor(capability) {
        super(`${capability} is not configured.`);
        this.name = 'PlatformCapabilityUnavailableError';
        this.capability = capability;
    }
}

/**
 * @typedef {{
 *   code: string,
 *   redirectUri: string,
 *   pkceVerifier: string
 * }} OAuthCodeExchange
 */

/**
 * @typedef {{
 *   accessToken: string,
 *   tokenType: 'bearer',
 *   expiresAt: number | null
 * }} OAuthTokenResult
 */

/**
 * @typedef {{
 *   providerSubject: string,
 *   login: string,
 *   displayName: string | null
 * }} OAuthIdentity
 */

/**
 * @typedef {{
 *   exchangeAuthorizationCode: (input: OAuthCodeExchange) => Promise<OAuthTokenResult>,
 *   fetchIdentity: (accessToken: string) => Promise<OAuthIdentity>
 * }} OAuthAdapter
 */

/**
 * @typedef {{
 *   clock: { now: () => number },
 *   ids: { uuid: () => string },
 *   random: {
 *     bytes: (length: number) => Uint8Array,
 *     token: (byteLength?: number) => string
 *   },
 *   oauth: OAuthAdapter,
 *   failures: { checkpoint: (name: string) => void | Promise<void> }
 * }} RuntimeDependencies
 */

/** @param {number} length */
function secureRandomBytes(length) {
    if (!Number.isInteger(length) || length < 1 || length > MAX_RANDOM_BYTES) {
        throw new RangeError(`Random byte length must be between 1 and ${MAX_RANDOM_BYTES}.`);
    }
    return crypto.getRandomValues(new Uint8Array(length));
}

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @type {OAuthAdapter} */
const unavailableOAuth = Object.freeze({
    async exchangeAuthorizationCode() {
        throw new PlatformCapabilityUnavailableError('GitHub OAuth exchange');
    },
    async fetchIdentity() {
        throw new PlatformCapabilityUnavailableError('GitHub OAuth identity');
    }
});

/** @type {RuntimeDependencies} */
export const PLATFORM_DEPENDENCIES = Object.freeze({
    clock: Object.freeze({ now: () => Date.now() }),
    ids: Object.freeze({ uuid: () => crypto.randomUUID() }),
    random: Object.freeze({
        bytes: secureRandomBytes,
        token: (byteLength = DEFAULT_TOKEN_BYTES) => toBase64Url(secureRandomBytes(byteLength))
    }),
    oauth: unavailableOAuth,
    failures: Object.freeze({ checkpoint: async () => {} })
});

export const RUNTIME_DEPENDENCY_LIMITS = Object.freeze({
    maxRandomBytes: MAX_RANDOM_BYTES,
    defaultTokenBytes: DEFAULT_TOKEN_BYTES
});
