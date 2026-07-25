// CF-P6-003 — Canonical request fingerprint (ADR-006).
//
// The server derives one digest per mutation request and stores only that digest
// in the idempotency ledger. It is what lets an identical authorized replay
// return the original result while the same idempotency key carrying different
// content is rejected as IDEMPOTENCY_KEY_REUSED.
//
// The ten inputs and their order are frozen by CF-P6-001 §3.1 and must not be
// reordered: the ledger and the vectors are bound to this exact sequence.
//
//   1 actorUserId          6 baseRevision (0 = create sentinel)
//   2 actorDeviceId        7 keyVersion
//   3 workspaceId          8 envelopeVersion
//   4 operation            9 ciphertextDigest
//   5 documentId          10 ciphertextBytes
//
// Plaintext, draft context, and full ciphertext never enter the input. Only the
// digest and the byte count of the ciphertext do.

export const FINGERPRINT_INPUT_ORDER = Object.freeze([
    'actorUserId', 'actorDeviceId', 'workspaceId', 'operation', 'documentId',
    'baseRevision', 'keyVersion', 'envelopeVersion', 'ciphertextDigest', 'ciphertextBytes'
] as const);

export const DOCUMENT_OPERATIONS = Object.freeze(['create', 'update', 'delete'] as const);

export type DocumentOperation = (typeof DOCUMENT_OPERATIONS)[number];

export interface FingerprintInput {
    actorUserId: string;
    actorDeviceId: string;
    workspaceId: string;
    operation: DocumentOperation;
    documentId: string;
    /** The last observed revision; exactly 0 for a create. */
    baseRevision: number;
    keyVersion: number;
    envelopeVersion: number;
    ciphertextDigest: Uint8Array;
    ciphertextBytes: number;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST_BYTES = 32;
const MAX_REVISION = 9_007_199_254_740_991;
const MAX_KEY_VERSION = 2_147_483_647;
const MIN_CIPHERTEXT_BYTES = 18;
const MAX_CIPHERTEXT_BYTES = 1_048_000;

export class FingerprintError extends Error {
    readonly code: string;
    constructor(code: string) {
        super(code);
        this.name = 'FingerprintError';
        this.code = code;
    }
}

const fail = (code: string): never => { throw new FingerprintError(code); };

function requireUuid(value: unknown, code: string): string {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail(code);
    return value as string;
}

function requireInteger(value: unknown, min: number, max: number, code: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(code);
    return value as number;
}

function base64Url(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Canonical UTF-8 preimage of the fingerprint.
 *
 * A JSON array is used rather than concatenation so ordering is preserved and
 * no pair of distinct input tuples can produce the same bytes — string escaping
 * makes "a","bc" and "ab","c" unambiguous.
 */
export function canonicalFingerprintPreimage(input: FingerprintInput): string {
    const operation = input?.operation;
    if (!DOCUMENT_OPERATIONS.includes(operation as DocumentOperation)) fail('INVALID_OPERATION');

    const baseRevision = requireInteger(input.baseRevision, 0, MAX_REVISION - 1, 'INVALID_BASE_REVISION');
    if (operation === 'create' && baseRevision !== 0) fail('INVALID_CREATE_PRECONDITION');
    if (operation !== 'create' && baseRevision === 0) fail('INVALID_UPDATE_PRECONDITION');

    const digest = input.ciphertextDigest;
    if (!(digest instanceof Uint8Array) || digest.length !== DIGEST_BYTES) fail('INVALID_CIPHERTEXT_DIGEST');

    const ordered: (string | number)[] = [
        requireUuid(input.actorUserId, 'INVALID_ACTOR'),
        requireUuid(input.actorDeviceId, 'INVALID_DEVICE'),
        requireUuid(input.workspaceId, 'INVALID_WORKSPACE'),
        operation as string,
        requireUuid(input.documentId, 'INVALID_DOCUMENT'),
        baseRevision,
        requireInteger(input.keyVersion, 1, MAX_KEY_VERSION, 'INVALID_KEY_VERSION'),
        requireInteger(input.envelopeVersion, 1, 1, 'INVALID_ENVELOPE_VERSION'),
        base64Url(digest),
        requireInteger(input.ciphertextBytes, MIN_CIPHERTEXT_BYTES, MAX_CIPHERTEXT_BYTES, 'INVALID_CIPHERTEXT_BYTES')
    ];
    return JSON.stringify(ordered);
}

/** SHA-256 over the canonical preimage. Returns exactly 32 bytes. */
export async function computeRequestFingerprint(input: FingerprintInput): Promise<Uint8Array> {
    const preimage = canonicalFingerprintPreimage(input);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(preimage));
    return new Uint8Array(digest);
}
