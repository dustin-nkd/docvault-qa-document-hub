export type E2eeErrorCode = 'CRYPTO_FORMAT_INVALID' | 'CRYPTO_SUITE_UNSUPPORTED'
    | 'CRYPTO_BINDING_MISMATCH' | 'CRYPTO_AUTH_FAILED' | 'LOCAL_UNLOCK_FAILED';

export class E2eePrimitiveError extends Error {
    readonly code: E2eeErrorCode;

    constructor(code: E2eeErrorCode) {
        super(code);
        this.name = 'E2eePrimitiveError';
        this.code = code;
    }
}

export function formatError(): never {
    throw new E2eePrimitiveError('CRYPTO_FORMAT_INVALID');
}
