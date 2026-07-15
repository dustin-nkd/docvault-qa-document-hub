/** @typedef {import('../../functions/_lib/runtime-dependencies.mjs').RuntimeDependencies} RuntimeDependencies */
/** @typedef {{ now?: number, uuidSequence?: number, byteSeed?: number, failAt?: string[] }} DeterministicOptions */
/** @typedef {{ code: string, redirectUri: string, pkceVerifier: string }} OAuthExchangeInput */

/** @param {Uint8Array} bytes */
function toBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** @param {DeterministicOptions} options */
export function createDeterministicRuntimeDependencies(options = {}) {
    let currentTime = options.now ?? Date.parse('2026-07-15T00:00:00.000Z');
    let uuidSequence = options.uuidSequence ?? 1;
    const byteSeed = options.byteSeed ?? 17;
    const failAt = new Set(options.failAt || []);
    const calls = /** @type {{ checkpoints: string[], oauthExchanges: OAuthExchangeInput[], oauthIdentityTokens: string[] }} */ ({
        checkpoints: [],
        oauthExchanges: [],
        oauthIdentityTokens: []
    });
    /** @param {number} length */
    const deterministicBytes = length => Uint8Array.from(
        { length }, (_, index) => (byteSeed + index) % 256
    );

    /** @type {RuntimeDependencies} */
    const dependencies = {
        clock: { now: () => currentTime },
        ids: {
            uuid: () => `00000000-0000-4000-8000-${String(uuidSequence++).padStart(12, '0')}`
        },
        random: {
            bytes: deterministicBytes,
            token(byteLength = 32) {
                return toBase64Url(deterministicBytes(byteLength));
            }
        },
        oauth: {
            async exchangeAuthorizationCode(input) {
                calls.oauthExchanges.push({ ...input });
                return {
                    accessToken: 'unit-provider-token',
                    tokenType: 'bearer',
                    expiresAt: currentTime + 3_600_000
                };
            },
            async fetchIdentity(accessToken) {
                calls.oauthIdentityTokens.push(accessToken);
                return {
                    providerSubject: 'provider-subject-1001',
                    login: 'qa-user',
                    displayName: 'QA User'
                };
            }
        },
        failures: {
            async checkpoint(name) {
                calls.checkpoints.push(name);
                if (failAt.has(name)) throw new Error(`Injected failure at ${name}`);
            }
        }
    };

    return {
        dependencies,
        calls,
        /** @param {number} milliseconds */
        advance(milliseconds) { currentTime += milliseconds; }
    };
}
