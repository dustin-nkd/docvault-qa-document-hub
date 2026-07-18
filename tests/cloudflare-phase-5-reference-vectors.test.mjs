import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCipheriv, createECDH, createHash, hkdfSync, pbkdf2Sync } from 'node:crypto';

const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/cloudflare/phase-5-crypto-vectors.json', import.meta.url), 'utf8'));
const material = fixture.materials;
const b64 = value => Buffer.from(value, 'base64url');
const jcs = value => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(jcs).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${jcs(value[key])}`).join(',')}}`;
};

test('independent Node oracle reproduces canonical bytes, PBKDF2, and local AES-GCM vector', () => {
    const canonical = jcs(material.canonicalInput);
    assert.equal(canonical, material.canonicalUtf8);
    assert.equal(createHash('sha256').update(canonical).digest('hex'), material.canonicalSha256Hex);
    const key = pbkdf2Sync(material.unlockSecretUtf8, b64(material.localSalt), 600000, 32, 'sha256');
    assert.equal(key.toString('hex'), material.localDerivedKeyHex);
    const cipher = createCipheriv('aes-256-gcm', key, b64(material.localNonce));
    cipher.setAAD(Buffer.from(jcs(material.privateAad)));
    const encrypted = Buffer.concat([cipher.update(b64(material.devicePkcs8)), cipher.final(), cipher.getAuthTag()]);
    assert.equal(encrypted.toString('base64url'), material.localCiphertext);
});

test('independent Node oracle reproduces P-256 ECDH, HKDF, and workspace AES-GCM vector', () => {
    const ephemeral = createECDH('prime256v1');
    ephemeral.setPrivateKey(b64(material.ephemeralPrivateJwk.d));
    const targetPoint = Buffer.concat([Buffer.of(4), b64(material.targetPublicJwk.x), b64(material.targetPublicJwk.y)]);
    const shared = ephemeral.computeSecret(targetPoint);
    assert.equal(shared.toString('hex'), material.ecdhSharedHex);
    const key = Buffer.from(hkdfSync('sha256', shared, b64(material.workspaceSalt),
        Buffer.from(material.hkdfInfoCanonical), 32));
    assert.equal(key.toString('hex'), material.workspaceWrappingKeyHex);
    const cipher = createCipheriv('aes-256-gcm', key, b64(material.workspaceNonce));
    cipher.setAAD(Buffer.from(jcs(material.workspaceAad)));
    const encrypted = Buffer.concat([cipher.update(b64(material.workspaceDek)), cipher.final(), cipher.getAuthTag()]);
    assert.equal(encrypted.toString('base64url'), material.workspaceCiphertext);
});

test('immutable manifest contains exactly the 30 frozen synthetic vector IDs and complete fields', () => {
    assert.equal(fixture.sourceClassification, 'synthetic-only');
    assert.equal(fixture.vectors.length, 30);
    assert.equal(new Set(fixture.vectors.map(vector => vector.id)).size, 30);
    for (const vector of fixture.vectors) {
        assert.deepEqual(Object.keys(vector), ['id', 'purpose', 'contractVersion', 'producer', 'input',
            'safeBinaryHex', 'expectedCanonicalUtf8', 'expectedSha256', 'expectedResultOrError', 'sourceClassification']);
        assert.equal(vector.sourceClassification, 'synthetic-only');
    }
});
