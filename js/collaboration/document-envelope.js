// CF-P6-003 — Encrypted document envelope (ADR-005, ADR-006).
//
// Document content is sealed in the browser under the current workspace DEK
// before it crosses the browser boundary. The server stores only the envelope
// bytes, a SHA-256 digest, and a byte count; it can never read the content.
//
// Binary layout, deliberately fixed-width so parsing needs no length fields:
//
//   byte 0        envelope version (1)
//   bytes 1..12   AES-GCM nonce (12 bytes, fresh per seal)
//   bytes 13..    AES-256-GCM ciphertext with the 16-byte tag appended
//
// The AAD is canonical RFC 8785 JCS over an exact object binding the workspace,
// document, revision intent, key version, and envelope version. Changing any of
// those — replaying a payload into another workspace, another document, another
// revision, or another key version — makes decryption fail rather than silently
// succeed against the wrong target.
//
// Bounds are checked BEFORE any crypto work so an oversize or malformed payload
// costs no key derivation and no cipher pass.

const ENVELOPE_VERSION = 1;
const SUITE = 'A256GCM-doc-v1';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const DEK_BYTES = 32;
const DIGEST_BYTES = 32;
const HEADER_BYTES = 1 + NONCE_BYTES;

// Mirrors the schema-12 CHECK constraints on documents/document_revisions.
const MIN_ENVELOPE_BYTES = 18;
const MAX_ENVELOPE_BYTES = 1_048_576;
const MAX_CIPHERTEXT_BYTES = 1_048_000;
const MAX_PLAINTEXT_BYTES = MAX_CIPHERTEXT_BYTES - HEADER_BYTES - TAG_BYTES;
const MAX_REVISION = 9_007_199_254_740_991;
const MAX_KEY_VERSION = 2_147_483_647;

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export class DocumentEnvelopeError extends Error {
    constructor(code) {
        super(code);
        this.name = 'DocumentEnvelopeError';
        this.code = code;
    }
}

const fail = (code) => { throw new DocumentEnvelopeError(code); };

/** RFC 8785 JCS, restricted to the value shapes the AAD actually uses. */
export function canonicalJson(value) {
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isInteger(value)) fail('NON_INTEGER_NUMBER');
        return JSON.stringify(value);
    }
    if (typeof value === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return fail('UNSUPPORTED_VALUE');
}

function requireUuid(value, code) {
    if (typeof value !== 'string' || !UUID_V4.test(value)) fail(code);
    return value;
}

function requireIntegerInRange(value, min, max, code) {
    if (!Number.isInteger(value) || value < min || value > max) fail(code);
    return value;
}

function requireBytes(value, length, code) {
    if (!(value instanceof Uint8Array) || value.length !== length) fail(code);
    return value;
}

/**
 * The canonical AAD for one document envelope. Exported so the vectors and the
 * independent oracle bind to exactly the same bytes the cipher does.
 */
export function documentAad({ workspaceId, documentId, revisionIntent, keyVersion } = {}) {
    return canonicalJson({
        documentId: requireUuid(documentId, 'INVALID_DOCUMENT'),
        envelopeVersion: ENVELOPE_VERSION,
        keyVersion: requireIntegerInRange(keyVersion, 1, MAX_KEY_VERSION, 'INVALID_KEY_VERSION'),
        revisionIntent: requireIntegerInRange(revisionIntent, 1, MAX_REVISION, 'INVALID_REVISION_INTENT'),
        suite: SUITE,
        workspaceId: requireUuid(workspaceId, 'INVALID_WORKSPACE')
    });
}

async function importDek(dek, subtle) {
    requireBytes(dek, DEK_BYTES, 'INVALID_DEK');
    return subtle.importKey('raw', dek, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export function envelopeDigest(envelope, subtle) {
    return subtle.digest('SHA-256', envelope).then((digest) => new Uint8Array(digest));
}

/**
 * Seal document plaintext for one workspace/document/revision/key-version.
 *
 * `nonce` is injectable only so the frozen vectors are reproducible; production
 * callers must omit it and receive a fresh random nonce. A reused nonce under
 * the same DEK breaks AES-GCM, so this is the one seam that must never be used
 * outside tests.
 */
export async function sealDocumentEnvelope({ dek, workspaceId, documentId, revisionIntent,
    keyVersion, plaintext, nonce, crypto: cryptoImpl = globalThis.crypto } = {}) {
    if (!cryptoImpl?.subtle) fail('WEBCRYPTO_UNAVAILABLE');
    if (!(plaintext instanceof Uint8Array)) fail('INVALID_PLAINTEXT');
    // Bounds before crypto: an oversize payload must cost no cipher work.
    if (plaintext.length > MAX_PLAINTEXT_BYTES) fail('PLAINTEXT_TOO_LARGE');

    const aad = documentAad({ workspaceId, documentId, revisionIntent, keyVersion });
    const iv = nonce === undefined
        ? cryptoImpl.getRandomValues(new Uint8Array(NONCE_BYTES))
        : requireBytes(nonce, NONCE_BYTES, 'INVALID_NONCE');

    const key = await importDek(dek, cryptoImpl.subtle);
    const sealed = new Uint8Array(await cryptoImpl.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad), tagLength: TAG_BYTES * 8 },
        key, plaintext));

    const envelope = new Uint8Array(HEADER_BYTES + sealed.length);
    envelope[0] = ENVELOPE_VERSION;
    envelope.set(iv, 1);
    envelope.set(sealed, HEADER_BYTES);

    if (envelope.length < MIN_ENVELOPE_BYTES || envelope.length > MAX_ENVELOPE_BYTES) fail('ENVELOPE_OUT_OF_BOUNDS');
    if (envelope.length > MAX_CIPHERTEXT_BYTES) fail('ENVELOPE_OUT_OF_BOUNDS');

    return {
        envelope,
        envelopeVersion: ENVELOPE_VERSION,
        ciphertextBytes: envelope.length,
        ciphertextDigest: await envelopeDigest(envelope, cryptoImpl.subtle)
    };
}

/**
 * Open an envelope. Every binding must match the one it was sealed under; a
 * mismatch fails as an authentication failure rather than returning plaintext.
 */
export async function openDocumentEnvelope({ dek, envelope, workspaceId, documentId,
    revisionIntent, keyVersion, crypto: cryptoImpl = globalThis.crypto } = {}) {
    if (!cryptoImpl?.subtle) fail('WEBCRYPTO_UNAVAILABLE');
    if (!(envelope instanceof Uint8Array)) fail('INVALID_ENVELOPE');
    // Structural checks before crypto.
    if (envelope.length < HEADER_BYTES + TAG_BYTES) fail('ENVELOPE_TRUNCATED');
    if (envelope.length > MAX_ENVELOPE_BYTES) fail('ENVELOPE_OUT_OF_BOUNDS');
    if (envelope[0] !== ENVELOPE_VERSION) fail('UNSUPPORTED_ENVELOPE_VERSION');

    const aad = documentAad({ workspaceId, documentId, revisionIntent, keyVersion });
    const iv = envelope.slice(1, HEADER_BYTES);
    const body = envelope.slice(HEADER_BYTES);
    const key = await importDek(dek, cryptoImpl.subtle);

    try {
        const plaintext = await cryptoImpl.subtle.decrypt(
            { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad), tagLength: TAG_BYTES * 8 },
            key, body);
        return new Uint8Array(plaintext);
    } catch (_) {
        // One code for every authentication failure: a wrong DEK, a tampered
        // byte, and a rebound AAD must be indistinguishable to a caller.
        return fail('ENVELOPE_AUTHENTICATION_FAILED');
    }
}

export const DOCUMENT_ENVELOPE = Object.freeze({
    version: ENVELOPE_VERSION,
    suite: SUITE,
    nonceBytes: NONCE_BYTES,
    tagBytes: TAG_BYTES,
    dekBytes: DEK_BYTES,
    digestBytes: DIGEST_BYTES,
    headerBytes: HEADER_BYTES,
    minEnvelopeBytes: MIN_ENVELOPE_BYTES,
    maxEnvelopeBytes: MAX_ENVELOPE_BYTES,
    maxCiphertextBytes: MAX_CIPHERTEXT_BYTES,
    maxPlaintextBytes: MAX_PLAINTEXT_BYTES
});
