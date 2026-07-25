import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase6Envelope } from '../scripts/cloudflare-phase-6-envelope-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));
const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-6');
const IDS = ['CF-EV-P6-UT-002', 'CF-EV-P6-VEC-001', 'CF-EV-P6-SEC-003'];

function actualInput() {
    return {
        manifest: json('config/cloudflare/phase-6-document-envelope.json'),
        envelopeSource: read('js/collaboration/document-envelope.js'),
        fingerprintSource: read('functions/_lib/documents/request-fingerprint.ts'),
        vectorSource: read('tests/fixtures/cloudflare/phase-6-document-vectors.json'),
        nodeTestSource: read('tests/document-envelope.test.mjs'),
        workersTestSource: read('tests/cloudflare/document-fingerprint.workers.test.ts'),
        contractFreeze: json('config/cloudflare/phase-6-contract-freeze.json'),
        evidenceSources: Object.fromEntries(IDS
            .map(id => [id, fs.readFileSync(path.join(evidenceDirectory, `${id}.md`), 'utf8')]))
    };
}

test('CF-P6-003 delivers the document envelope and fingerprint against frozen vectors', () => {
    assert.equal(validatePhase6Envelope(actualInput()), true);
});

test('CF-P6-003 rejects suite, binding, bounds, oracle, and boundary drift', () => {
    for (const mutate of [
        input => { input.manifest.status = 'PENDING'; },
        input => { input.manifest.next_gate = 'P6-G3'; },
        input => { input.manifest.authorizes_on_approval = 'CF-P6-006'; },
        // Suite and layout.
        input => { input.manifest.envelope.suite = 'A128GCM-doc-v1'; },
        input => { input.manifest.envelope.version = 2; },
        input => { input.manifest.envelope.nonce_bytes = 8; },
        input => { input.manifest.envelope.tag_bytes = 8; },
        input => { input.manifest.envelope.dek_bytes = 16; },
        input => { input.manifest.envelope.digest_bytes = 20; },
        // AAD binding is what stops cross-workspace/document/revision replay.
        input => { input.manifest.envelope.aad_bindings = ['workspaceId']; },
        input => { input.manifest.envelope.aad_bindings = ['workspaceId', 'documentId', 'keyVersion', 'envelopeVersion']; },
        // Bounds must track schema 12.
        input => { input.manifest.envelope.max_ciphertext_bytes = 999_999_999; },
        input => { input.manifest.envelope.min_envelope_bytes = 1; },
        input => { input.manifest.envelope.bounds_checked_before_crypto = false; },
        // Fingerprint.
        input => { input.manifest.fingerprint.algorithm = 'SHA-1'; },
        input => { input.manifest.fingerprint.ordered_inputs.reverse(); },
        input => { input.manifest.fingerprint.contains_plaintext = true; },
        input => { input.manifest.fingerprint.contains_full_ciphertext = true; },
        input => { input.contractFreeze.fingerprint_contract.ordered_inputs = ['workspaceId']; },
        // Vectors and oracle independence.
        input => { input.manifest.vectors.agreement_percent = 99; },
        input => { input.manifest.vectors.sets = ['CF-VEC-P6-ENV-001']; },
        input => { input.manifest.vectors.oracle_shares_code_with_production = true; },
        input => { input.manifest.vectors.contains_real_key_or_plaintext = true; },
        input => { input.manifest.vectors.independent_oracle = 'WebCrypto'; },
        input => { input.nodeTestSource = input.nodeTestSource.replaceAll('createCipheriv', 'sealDocumentEnvelope'); },
        input => { input.nodeTestSource = input.nodeTestSource.replaceAll('node:crypto', 'webcrypto'); },
        input => { input.nodeTestSource = input.nodeTestSource.replaceAll('CF-VEC-P6-FPR-001', 'other'); },
        input => { input.workersTestSource = input.workersTestSource.replaceAll('request-fingerprint', 'other'); },
        // Source-level guarantees.
        input => { input.envelopeSource = input.envelopeSource.replaceAll('ENVELOPE_AUTHENTICATION_FAILED', 'WRONG_KEY'); },
        input => { input.envelopeSource = input.envelopeSource.replace('PLAINTEXT_TOO_LARGE', 'OK'); },
        input => { input.envelopeSource = input.envelopeSource.replace('getRandomValues', 'staticNonce'); },
        input => { input.envelopeSource = input.envelopeSource.replaceAll('revisionIntent', 'ignored'); },
        input => { input.fingerprintSource = input.fingerprintSource.replace('INVALID_CREATE_PRECONDITION', 'OK'); },
        input => { input.fingerprintSource += '\nconst plaintext = 1;\n'; },
        // Fixture integrity.
        input => { const v = JSON.parse(input.vectorSource); v.fingerprint.fingerprintHex = 'zz'; input.vectorSource = JSON.stringify(v); },
        input => {
            const v = JSON.parse(input.vectorSource);
            v.fingerprint.canonicalPreimage += v.envelope.plaintextUtf8;
            input.vectorSource = JSON.stringify(v);
        },
        // Evidence and boundary.
        input => { delete input.evidenceSources['CF-EV-P6-VEC-001']; },
        input => { input.evidenceSources['CF-EV-P6-UT-002'] = '# CF-EV-P6-UT-002 x\n\nStatus: PENDING\n\nCF-P6-003\n'; },
        input => { input.manifest.authorization_boundary.routes_implemented = 1; },
        input => { input.manifest.authorization_boundary.persistence_implemented = true; },
        input => { input.manifest.authorization_boundary.collaboration_activation = 'GO'; }
    ]) {
        const input = actualInput();
        mutate(input);
        assert.throws(() => validatePhase6Envelope(input), Error);
    }
});
