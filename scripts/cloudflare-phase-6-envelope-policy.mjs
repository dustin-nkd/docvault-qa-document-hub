const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

export const FINGERPRINT_INPUT_ORDER = Object.freeze(['actorUserId', 'actorDeviceId', 'workspaceId',
    'operation', 'documentId', 'baseRevision', 'keyVersion', 'envelopeVersion',
    'ciphertextDigest', 'ciphertextBytes']);

export const AAD_BINDINGS = Object.freeze(['workspaceId', 'documentId', 'revisionIntent',
    'keyVersion', 'envelopeVersion']);

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));

export function validatePhase6Envelope({ manifest, envelopeSource, fingerprintSource, vectorSource,
    nodeTestSource, workersTestSource, contractFreeze, evidenceSources }) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P6'
        && manifest.story === 'CF-P6-003' && manifest.status === 'PASS'
        && manifest.approved_entry_gate === 'P6-G2' && manifest.next_gate === 'P6-G2A'
        && manifest.authorizes_on_approval === 'CF-P6-004', 'Unsupported Phase 6 envelope manifest');

    const envelope = manifest.envelope || {};
    assert(envelope.suite === 'A256GCM-doc-v1' && envelope.version === 1
        && envelope.nonce_bytes === 12 && envelope.tag_bytes === 16 && envelope.dek_bytes === 32
        && envelope.digest_bytes === 32, 'Envelope suite drifted');
    assert(sameSet(envelope.aad_bindings || [], AAD_BINDINGS), 'Envelope AAD bindings drifted');
    // Bounds must stay inside the schema-12 CHECK constraints.
    assert(envelope.min_envelope_bytes === 18 && envelope.max_envelope_bytes === 1_048_576
        && envelope.max_ciphertext_bytes === 1_048_000, 'Envelope bounds no longer match schema 12');
    assert(envelope.bounds_checked_before_crypto === true, 'Bounds are no longer checked before crypto');

    const fingerprint = manifest.fingerprint || {};
    assert(fingerprint.algorithm === 'SHA-256' && fingerprint.digest_bytes === 32
        && JSON.stringify(fingerprint.ordered_inputs) === JSON.stringify(FINGERPRINT_INPUT_ORDER),
    'Fingerprint contract drifted from the CF-P6-001 freeze');
    assert(fingerprint.contains_plaintext === false && fingerprint.contains_full_ciphertext === false,
        'The fingerprint gained a content-bearing input');
    // The freeze is the authority; the implementation must not silently diverge.
    assert(JSON.stringify(contractFreeze.fingerprint_contract?.ordered_inputs)
        === JSON.stringify(FINGERPRINT_INPUT_ORDER.map(name =>
            name === 'baseRevision' ? 'baseRevisionOrCreateSentinel' : name)),
    'Implementation and CF-P6-001 freeze disagree on fingerprint inputs');

    const vectors = manifest.vectors || {};
    assert(sameSet(vectors.sets || [], ['CF-VEC-P6-ENV-001', 'CF-VEC-P6-FPR-001'])
        && vectors.agreement_percent === 100
        && vectors.independent_oracle === 'node:crypto'
        && vectors.production_implementation === 'WebCrypto'
        && vectors.oracle_shares_code_with_production === false
        && vectors.contains_real_key_or_plaintext === false, 'Vector contract drifted');

    // A shared code path would make "independent oracle" meaningless.
    assert(/node:crypto/.test(nodeTestSource) && /createCipheriv/.test(nodeTestSource)
        && /createDecipheriv/.test(nodeTestSource), 'The independent oracle is no longer independent');
    assert(/document-envelope\.js/.test(nodeTestSource), 'The node test no longer exercises production code');

    for (const binding of ['workspaceId', 'documentId', 'revisionIntent', 'keyVersion']) {
        assert(new RegExp(binding).test(envelopeSource), `AAD binding ${binding} disappeared`);
    }
    assert(/ENVELOPE_AUTHENTICATION_FAILED/.test(envelopeSource), 'Uniform authentication failure removed');
    // A distinguishable failure would let a caller use error shape as an oracle.
    assert((envelopeSource.match(/ENVELOPE_AUTHENTICATION_FAILED/g) || []).length >= 1
        && !/WRONG_KEY|TAMPERED|BAD_AAD/.test(envelopeSource), 'Authentication failures became distinguishable');
    assert(/PLAINTEXT_TOO_LARGE/.test(envelopeSource), 'Oversize payloads no longer fail before crypto');
    assert(/getRandomValues/.test(envelopeSource), 'Fresh nonce generation removed');

    assert(/INVALID_CREATE_PRECONDITION/.test(fingerprintSource)
        && /INVALID_UPDATE_PRECONDITION/.test(fingerprintSource),
    'The fingerprint no longer enforces the create precondition');
    assert(!/plaintext|draftContext/i.test(fingerprintSource.replace(/\/\/.*$/gm, '')),
        'The fingerprint implementation references plaintext');

    const parsed = JSON.parse(vectorSource);
    assert(parsed.envelope?.canonicalAad && parsed.envelope.envelopeBase64Url
        && /^[0-9a-f]{64}$/.test(parsed.envelope.ciphertextDigestHex)
        && /^[0-9a-f]{64}$/.test(parsed.fingerprint?.fingerprintHex), 'Vector fixture is incomplete');
    assert(!parsed.fingerprint.canonicalPreimage.includes(parsed.envelope.plaintextUtf8),
        'The vector fingerprint preimage contains plaintext');

    assert(/CF-VEC-P6-ENV-001/.test(nodeTestSource) && /CF-VEC-P6-FPR-001/.test(nodeTestSource),
        'Node vector coverage drifted');
    assert(/CF-VEC-P6-FPR-001/.test(workersTestSource)
        && /request-fingerprint/.test(workersTestSource), 'Workers fingerprint coverage drifted');

    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `) && /^Status: PASS$/m.test(source)
            && source.includes('CF-P6-003'), `${id} is not PASS evidence for CF-P6-003`);
    }
    assert(sameSet(Object.keys(evidenceSources),
        ['CF-EV-P6-UT-002', 'CF-EV-P6-VEC-001', 'CF-EV-P6-SEC-003']), 'Envelope evidence inventory drifted');

    const boundary = manifest.authorization_boundary || {};
    assert(boundary.routes_implemented === 0 && boundary.migrations_created === 0
        && boundary.remote_writes === 0 && boundary.persistence_implemented === false
        && boundary.collaboration_activation === 'NO-GO', 'Phase 6 envelope authorization boundary drifted');
    return true;
}
