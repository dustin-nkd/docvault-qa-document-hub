// CF-P6-003 — Document envelope and canonical fingerprint.
//
// The production implementation uses WebCrypto. The oracle in this file uses
// node:crypto, i.e. a genuinely different code path, so agreement means the
// contract is right rather than that one implementation agrees with itself.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import {
    DOCUMENT_ENVELOPE,
    DocumentEnvelopeError,
    canonicalJson,
    documentAad,
    openDocumentEnvelope,
    sealDocumentEnvelope
} from '../js/collaboration/document-envelope.js';

const vectors = JSON.parse(fs.readFileSync(
    new URL('./fixtures/cloudflare/phase-6-document-vectors.json', import.meta.url), 'utf8'));
const V = vectors.envelope;
const F = vectors.fingerprint;

const b64u = (value) => Buffer.from(value, 'base64url');
const toB64u = (bytes) => Buffer.from(bytes).toString('base64url');
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const bytes = (value) => new Uint8Array(b64u(value));

const BINDING = {
    workspaceId: V.workspaceId,
    documentId: V.documentId,
    revisionIntent: V.revisionIntent,
    keyVersion: V.keyVersion
};

const codeOf = async (fn) => {
    try { await fn(); return null; } catch (error) {
        assert.ok(error instanceof DocumentEnvelopeError, `expected DocumentEnvelopeError, got ${error}`);
        return error.code;
    }
};

// ---------------------------------------------------------------- oracle ----

function oracleSeal({ dek, nonce, aad, plaintext }) {
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(dek), Buffer.from(nonce));
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const sealed = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final(), cipher.getAuthTag()]);
    return Buffer.concat([Buffer.of(1), Buffer.from(nonce), sealed]);
}

function oracleOpen({ dek, envelope, aad }) {
    const nonce = envelope.subarray(1, 13);
    const body = envelope.subarray(13);
    const tag = body.subarray(body.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(dek), nonce);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body.subarray(0, body.length - 16)), decipher.final()]);
}

// ----------------------------------------------------------- ENV vectors ----

test('CF-VEC-P6-ENV-001: production seal reproduces the frozen envelope exactly', async () => {
    const result = await sealDocumentEnvelope({
        ...BINDING,
        dek: bytes(V.dek),
        nonce: bytes(V.nonce),
        plaintext: new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'))
    });
    assert.equal(toB64u(result.envelope), V.envelopeBase64Url);
    assert.equal(result.ciphertextBytes, V.ciphertextBytes);
    assert.equal(hex(result.ciphertextDigest), V.ciphertextDigestHex);
    assert.equal(result.envelopeVersion, 1);
});

test('CF-VEC-P6-ENV-001: the independent node:crypto oracle agrees byte for byte', () => {
    const envelope = oracleSeal({
        dek: b64u(V.dek),
        nonce: b64u(V.nonce),
        aad: V.canonicalAad,
        plaintext: Buffer.from(V.plaintextUtf8, 'utf8')
    });
    assert.equal(envelope.toString('base64url'), V.envelopeBase64Url);
    assert.equal(envelope.length, V.ciphertextBytes);
    assert.equal(createHash('sha256').update(envelope).digest('hex'), V.ciphertextDigestHex);
});

test('the canonical AAD matches the frozen vector and sorts its keys', () => {
    assert.equal(documentAad(BINDING), V.canonicalAad);
    assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
});

test('a sealed envelope round-trips back to the original plaintext', async () => {
    const plaintext = new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'));
    const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });
    const opened = await openDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), envelope });
    assert.deepEqual(Buffer.from(opened), Buffer.from(plaintext));
});

test('the oracle can open what production sealed and vice versa', async () => {
    const plaintext = Buffer.from(V.plaintextUtf8, 'utf8');
    const { envelope } = await sealDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), nonce: bytes(V.nonce), plaintext: new Uint8Array(plaintext)
    });
    assert.deepEqual(oracleOpen({ dek: b64u(V.dek), envelope: Buffer.from(envelope), aad: V.canonicalAad }), plaintext);

    const oracleEnvelope = oracleSeal({
        dek: b64u(V.dek), nonce: b64u(V.nonce), aad: V.canonicalAad, plaintext
    });
    const opened = await openDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), envelope: new Uint8Array(oracleEnvelope)
    });
    assert.deepEqual(Buffer.from(opened), plaintext);
});

test('a fresh seal never reuses a nonce', async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    const seen = new Set();
    for (let index = 0; index < 100; index += 1) {
        const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });
        seen.add(toB64u(envelope.slice(1, 13)));
    }
    assert.equal(seen.size, 100);
});

// -------------------------------------------------- ENV negative vectors ----

test('every altered AAD binding fails closed instead of decrypting', async () => {
    const plaintext = new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'));
    const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });

    const rebindings = [
        { workspaceId: '99999999-9999-4999-8999-999999999999' },
        { documentId: '88888888-8888-4888-8888-888888888888' },
        { revisionIntent: V.revisionIntent + 1 },
        { keyVersion: V.keyVersion + 1 }
    ];
    for (const rebinding of rebindings) {
        const code = await codeOf(() => openDocumentEnvelope({
            ...BINDING, ...rebinding, dek: bytes(V.dek), envelope
        }));
        assert.equal(code, 'ENVELOPE_AUTHENTICATION_FAILED', `rebinding ${JSON.stringify(rebinding)} decrypted`);
    }
});

test('a wrong DEK fails identically to a tampered envelope', async () => {
    const plaintext = new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'));
    const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });

    const wrongDek = bytes(V.dek);
    wrongDek[0] ^= 0xff;
    assert.equal(await codeOf(() => openDocumentEnvelope({ ...BINDING, dek: wrongDek, envelope })),
        'ENVELOPE_AUTHENTICATION_FAILED');

    for (const index of [13, 20, envelope.length - 1]) {
        const tampered = envelope.slice();
        tampered[index] ^= 0x01;
        assert.equal(await codeOf(() => openDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), envelope: tampered })),
            'ENVELOPE_AUTHENTICATION_FAILED', `tamper at ${index} decrypted`);
    }
});

test('a flipped nonce byte fails closed', async () => {
    const plaintext = new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'));
    const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });
    const tampered = envelope.slice();
    tampered[5] ^= 0x01;
    assert.equal(await codeOf(() => openDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), envelope: tampered })),
        'ENVELOPE_AUTHENTICATION_FAILED');
});

test('an unsupported envelope version is rejected before crypto', async () => {
    const plaintext = new Uint8Array(Buffer.from(V.plaintextUtf8, 'utf8'));
    const { envelope } = await sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext });
    const tampered = envelope.slice();
    tampered[0] = 2;
    assert.equal(await codeOf(() => openDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), envelope: tampered })),
        'UNSUPPORTED_ENVELOPE_VERSION');
});

test('malformed and oversize inputs fail before any crypto work', async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, dek: new Uint8Array(16), plaintext })),
        'INVALID_DEK');
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, dek: bytes(V.dek), plaintext: 'text' })),
        'INVALID_PLAINTEXT');
    assert.equal(await codeOf(() => sealDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), plaintext: new Uint8Array(DOCUMENT_ENVELOPE.maxPlaintextBytes + 1)
    })), 'PLAINTEXT_TOO_LARGE');
    assert.equal(await codeOf(() => sealDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), plaintext, nonce: new Uint8Array(8)
    })), 'INVALID_NONCE');
    assert.equal(await codeOf(() => openDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), envelope: new Uint8Array(10)
    })), 'ENVELOPE_TRUNCATED');
});

test('an invalid binding is rejected before crypto', async () => {
    const plaintext = new Uint8Array([1, 2, 3]);
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, workspaceId: 'x', dek: bytes(V.dek), plaintext })),
        'INVALID_WORKSPACE');
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, documentId: 'x', dek: bytes(V.dek), plaintext })),
        'INVALID_DOCUMENT');
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, revisionIntent: 0, dek: bytes(V.dek), plaintext })),
        'INVALID_REVISION_INTENT');
    assert.equal(await codeOf(() => sealDocumentEnvelope({ ...BINDING, keyVersion: 0, dek: bytes(V.dek), plaintext })),
        'INVALID_KEY_VERSION');
});

test('envelope bounds stay inside the schema-12 constraints', async () => {
    const { envelope, ciphertextBytes, ciphertextDigest } = await sealDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), plaintext: new Uint8Array(0)
    });
    assert.ok(envelope.length >= DOCUMENT_ENVELOPE.minEnvelopeBytes);
    assert.ok(ciphertextBytes <= DOCUMENT_ENVELOPE.maxCiphertextBytes);
    assert.equal(ciphertextDigest.length, 32);
});

test('the sealed envelope leaks no plaintext bytes', async () => {
    const secret = 'CANARY-9f3a2b-do-not-leak';
    const { envelope } = await sealDocumentEnvelope({
        ...BINDING, dek: bytes(V.dek), plaintext: new Uint8Array(Buffer.from(secret, 'utf8'))
    });
    assert.ok(!Buffer.from(envelope).toString('latin1').includes(secret));
    assert.ok(!documentAad(BINDING).includes(secret));
});

// ----------------------------------------------------------- FPR vectors ----

test('CF-VEC-P6-FPR-001: the frozen fingerprint preimage and digest reproduce', () => {
    const preimage = JSON.stringify([F.actorUserId, F.actorDeviceId, F.workspaceId, F.operation,
        F.documentId, F.baseRevision, F.keyVersion, F.envelopeVersion,
        F.ciphertextDigestBase64Url, F.ciphertextBytes]);
    assert.equal(preimage, F.canonicalPreimage);
    assert.equal(createHash('sha256').update(Buffer.from(preimage, 'utf8')).digest('hex'), F.fingerprintHex);
});

test('the fingerprint preimage carries neither plaintext nor full ciphertext', () => {
    assert.ok(!F.canonicalPreimage.includes(V.plaintextUtf8));
    assert.ok(!F.canonicalPreimage.includes(V.envelopeBase64Url));
    assert.ok(F.canonicalPreimage.includes(F.ciphertextDigestBase64Url));
});

test('altering any single fingerprint input changes the digest', () => {
    const base = [F.actorUserId, F.actorDeviceId, F.workspaceId, F.operation, F.documentId,
        F.baseRevision, F.keyVersion, F.envelopeVersion, F.ciphertextDigestBase64Url, F.ciphertextBytes];
    const digestOf = (parts) => createHash('sha256').update(Buffer.from(JSON.stringify(parts), 'utf8')).digest('hex');
    assert.equal(digestOf(base), F.fingerprintHex);

    const mutations = [
        '99999999-9999-4999-8999-999999999999', '99999999-9999-4999-8999-999999999999',
        '99999999-9999-4999-8999-999999999999', 'delete', '99999999-9999-4999-8999-999999999999',
        F.baseRevision + 1, F.keyVersion + 1, 1, 'AAAA', F.ciphertextBytes + 1
    ];
    const seen = new Set([F.fingerprintHex]);
    for (let index = 0; index < base.length; index += 1) {
        if (index === 7) continue; // envelopeVersion is pinned to 1 by contract
        const mutated = [...base];
        mutated[index] = mutations[index];
        const digest = digestOf(mutated);
        assert.ok(!seen.has(digest), `input ${index} did not change the fingerprint`);
        seen.add(digest);
    }
});

test('input order is load-bearing: swapping two inputs changes the digest', () => {
    const swapped = [F.actorDeviceId, F.actorUserId, F.workspaceId, F.operation, F.documentId,
        F.baseRevision, F.keyVersion, F.envelopeVersion, F.ciphertextDigestBase64Url, F.ciphertextBytes];
    const digest = createHash('sha256').update(Buffer.from(JSON.stringify(swapped), 'utf8')).digest('hex');
    assert.notEqual(digest, F.fingerprintHex);
});
